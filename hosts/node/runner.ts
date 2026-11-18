// host.agents as external processes (T-377): each worker, scout or checker is one process started in its folder with
// its prompt, listed while it runs, and stopped by ending the process. What the process is comes from an AgentRunner:
// claudeRunner runs `claude -p --output-format stream-json` and reads the answer, tokens and cost from its last
// "result" line. Another CLI agent (e.g. `codex exec --json`) is one more AgentRunner: its command and its result reader.
import { spawn, type ChildProcess } from 'node:child_process'
import type { Host, HostAgent, HostAgentStart } from '../../hooks/host'
import type { AgentRunEnd } from '../../hooks/app/symcc'
import { cleanTokens } from '../../hooks/core/runs'

/** What a finished agent process gave: its output, exit code, and whether symcc ended it (stop). */
export type ProcessOutput = { stdout: string; stderr: string; exitCode: number; killed: boolean }

/** How a run ended, in symcc's words, plus what the agent's own permission rules refused (for the log). */
export type RunnerEnd = AgentRunEnd & { denied?: string[] }

/** One kind of agent process: the command for an agent, and how to read its end from its output. */
export interface AgentRunner {
  /** a short name, used in the agents' ids */
  name: string
  /** the command that runs agent `a` in its folder (a.cwd); `stdin`, when given, is written to it and closed */
  command(a: HostAgentStart): { argv: string[]; stdin?: string; env?: Record<string, string> }
  /** how the run ended, from the process's output */
  result(out: ProcessOutput): RunnerEnd
}

/** The agents processAgents keeps: Host['agents'], plus what the CLI waits on. */
export type ProcessAgents = Host['agents'] & {
  /** how many agent processes run now */
  running: () => number
  /** what the finished runs cost together (US dollars), when any said */
  cost: () => number | undefined
}

/** host.agents over `runner`'s processes; `onEnd` is called once per run when its process has ended. */
export function processAgents(runner: AgentRunner, onEnd: (agentId: string, end: RunnerEnd) => void): ProcessAgents {
  type Run = { agent: HostAgent; child: ChildProcess; killed: boolean }
  const runs = new Map<string, Run>()
  let n = 0
  let cost: number | undefined
  return {
    async spawn(a) {
      const { argv, stdin, env } = runner.command(a)
      const [cmd, ...args] = argv
      if (!cmd) throw new Error(`${runner.name}: no command for ${a.name}`)
      const id = `${runner.name}-${++n}-${Date.now().toString(36)}`
      const child = spawn(cmd, args, { cwd: a.cwd, env: { ...process.env, ...env }, stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
      const run: Run = { agent: { id, kind: a.kind === 'worker' ? 'worker' : 'scout', status: 'running', name: a.name, description: a.description }, child, killed: false }
      runs.set(id, run)
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', c => void (stdout += c.toString()))
      child.stderr.on('data', c => void (stderr += c.toString()))
      let ended = false
      const end = (exitCode: number, why = '') => {
        if (ended) return
        ended = true
        run.agent = { ...run.agent, status: run.killed ? 'killed' : exitCode === 0 ? 'completed' : 'failed' }
        const r = runner.result({ stdout, stderr: stderr + why, exitCode, killed: run.killed })
        if (r.cost !== undefined) cost = (cost ?? 0) + r.cost
        onEnd(id, r)
      }
      child.on('error', err => end(127, err.message))
      child.on('close', code => end(code ?? 1))
      if (stdin !== undefined) child.stdin?.end(stdin)
      return { agentId: id }
    },
    list: async () => [...runs.values()].map(r => r.agent),
    // A process started with -p takes no more messages: what symcc would tell a running agent is dropped.
    send: async () => undefined,
    async stop(agentId) {
      const r = runs.get(agentId)
      if (!r || r.agent.status !== 'running') return
      r.killed = true
      r.child.kill('SIGTERM')
    },
    running: () => [...runs.values()].filter(r => r.agent.status === 'running').length,
    cost: () => cost,
  }
}

// ---------------- claude -p ----------------

/** Shell commands a worker may not run: git writes symcc makes itself (commit, merge into main) or that move shared refs. */
export const WORKER_DENIED_COMMANDS = ['git commit', 'git push', 'git reset', 'git update-ref', 'git tag', 'git stash', 'git branch', 'git checkout', 'git switch', 'git rebase']

/** The `--allowedTools` rule that lets the agent edit `file` (relative to its folder; a folder ends with "/" or is "."). */
export function editRule(file: string): string[] {
  const f = file.replace(/^\.\//, '').replace(/^\/+/, '')
  const glob = f === '' || f === '.' ? './**' : f.endsWith('/') ? `./${f}**` : `./${f}`
  // Edit's rules cover Write too; both are listed, so a version that reads them apart still allows the same files.
  // A plain file name may also be a folder (e.g. "docs"): its contents are allowed too.
  const globs = f.endsWith('/') || glob === './**' ? [glob] : [glob, `${glob}/**`]
  return globs.flatMap(g => [`Edit(${g})`, `Write(${g})`])
}

/**
 * Claude Code's permission flags for agent `a` (claude -p has no symcc tool hook, so its own rules are the edit
 * guard; the merge-time scope check stays the backstop): every tool not allowed is refused (--permission-mode dontAsk).
 * A worker may read, search and run commands (no git writes), and edit its task's files only (a.files; none given:
 * anywhere in its folder); a role's `web` adds WebSearch and WebFetch. A scout or checker only reads and runs commands.
 */
export function claudePermissions(a: Pick<HostAgentStart, 'kind' | 'files' | 'tools'>): { allowed: string[]; denied: string[] } {
  const read = ['Read', 'Glob', 'Grep', 'Bash']
  const web = a.tools?.includes('web') ? ['WebSearch', 'WebFetch'] : []
  const denied = WORKER_DENIED_COMMANDS.map(c => `Bash(${c}:*)`)
  if (a.kind !== 'worker') return { allowed: [...read, ...web], denied: [...denied, 'Edit', 'Write', 'NotebookEdit'] }
  const edits = a.files?.length ? a.files.flatMap(editRule) : editRule('.')
  return { allowed: [...read, ...web, ...edits], denied }
}

/** One line of `claude -p --output-format stream-json` output, as far as the runner reads it. */
type ClaudeLine = {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  permission_denials?: { tool_name?: string; tool_input?: Record<string, unknown> }[]
}

/** How a `claude -p` run ended, from its stream-json output (its last "result" line). */
export function claudeResult(out: ProcessOutput): RunnerEnd {
  const lines = out.stdout.split('\n').map(l => l.trim()).filter(l => l.startsWith('{'))
  let last: ClaudeLine | undefined
  for (const l of lines) {
    try {
      const j = JSON.parse(l) as ClaudeLine
      if (j.type === 'result') last = j
    } catch {
      // a broken line: skipped
    }
  }
  if (out.killed) return { answer: last?.result ?? '', end: { reason: 'aborted' }, isAborted: true, tokens: undefined }
  if (!last) return { answer: (out.stderr || out.stdout).trim().slice(-2000) || `claude exited with code ${out.exitCode} and no result`, end: { reason: 'error' }, isAborted: false, tokens: undefined }
  const u = last.usage
  const tokens = u ? cleanTokens({ input: u.input_tokens, output: u.output_tokens, cache_write: u.cache_creation_input_tokens, cache_read: u.cache_read_input_tokens }) : undefined
  const denied = (last.permission_denials ?? []).map(d => `${d.tool_name ?? '?'} ${String(d.tool_input?.file_path ?? d.tool_input?.command ?? '')}`.trim())
  return {
    answer: last.result ?? '',
    end: { reason: last.is_error || (last.subtype && last.subtype !== 'success') ? 'error' : 'answer' },
    isAborted: false,
    tokens,
    ...(typeof last.total_cost_usd === 'number' ? { cost: last.total_cost_usd } : {}),
    ...(denied.length ? { denied } : {}),
  }
}

/** Options of claudeRunner: the claude binary (default `claude`, or SYMCC_CLAUDE), and a model for agents that name none. */
export type ClaudeRunnerOptions = { bin?: string; model?: string }

/** Agents as `claude -p` processes: the prompt on stdin, stream-json out, Claude Code's permission flags as the edit guard. */
export function claudeRunner(o: ClaudeRunnerOptions = {}): AgentRunner {
  return {
    name: 'claude',
    command(a) {
      const { allowed, denied } = claudePermissions(a)
      const model = a.model ?? o.model
      // --allowedTools and --disallowedTools take a list each, so the prompt goes on stdin (not as a word after them)
      const argv = [o.bin ?? process.env.SYMCC_CLAUDE ?? 'claude', '-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--permission-mode', 'dontAsk', ...(model ? ['--model', model] : []), '--allowedTools', ...allowed, '--disallowedTools', ...denied]
      return { argv, stdin: a.prompt }
    },
    result: claudeResult,
  }
}
