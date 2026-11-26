// The `claude -p` agent runner (T-377, shared since T-474): Claude Code's own permission flags as the agent's edit guard
// (it has no symcc tool hook), and its stream-json output read for the answer, tokens and cost. No Claude Code import:
// it only builds a command line and reads text.
import type { HostAgentStart } from '../host'
import { cleanTokens } from '../core/runs'
import { SCRATCH_DIR } from '../core/path-guard'
import { gitDeniedRules, gitAliases } from '../core/git-guard'
import type { AgentRunner, ProcessOutput, RunnerEnd } from './agents'
import type { ProcessSystem } from './system'

// the git deny rules come from the hook guard's own list (T-1062, core/git-guard.ts)
export { gitDeniedRules }

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
 * A worker may read, search and run commands (git writes on its own branch only, see gitDeniedRules), and edit its task's files only (a.files; none given:
 * anywhere in its folder); a role's `web` adds WebSearch and WebFetch. A scout or checker only reads and runs commands
 * (a checker, T-551: it never runs the project's full tests itself, those run in the merge line after it).
 * `scratch` (T-456): the folder uses its throwaway SCRATCH_DIR (the project keeps no file there in git, see
 * scratchInUse); then a worker and a checker may also write there (a checker only there). `aliases`: the git alias
 * names in the agent's folder (gitAliases), denied by name.
 */
export function claudePermissions(a: Pick<HostAgentStart, 'kind' | 'files' | 'tools'>, scratch = false, aliases: readonly string[] = []): { allowed: string[]; denied: string[] } {
  const read = ['Read', 'Glob', 'Grep', 'Bash']
  const web = a.tools?.includes('web') ? ['WebSearch', 'WebFetch'] : []
  const denied = gitDeniedRules(a.kind === 'worker', aliases)
  const scratchRules = scratch && a.kind !== 'scout' ? editRule(`${SCRATCH_DIR}/`) : []
  if (a.kind !== 'worker') {
    // a deny rule beats an allow rule, so a checker with scratch rules gets no blanket Edit/Write deny (dontAsk still refuses every other edit)
    return { allowed: [...read, ...web, ...scratchRules], denied: [...denied, ...(scratchRules.length ? [] : ['Edit', 'Write']), 'NotebookEdit'] }
  }
  const edits = a.files?.length ? a.files.flatMap(editRule) : editRule('.')
  return { allowed: [...read, ...web, ...edits, ...scratchRules], denied }
}

/**
 * Whether the folder `cwd` uses its SCRATCH_DIR: the project keeps no file there in git (`git ls-files -- .scratch`
 * prints nothing). A git failure counts as kept, so nothing is let through on a guess (like scratchTracked in hooks/app/git).
 */
function scratchInUse(sys: Pick<ProcessSystem, 'run'>, cwd: string | undefined): boolean {
  const r = sys.run(['git', 'ls-files', '--', SCRATCH_DIR], cwd)
  return r.status === 0 && r.stdout.trim() === ''
}

/** One line of `claude -p --output-format stream-json` output, as far as the runner reads it. */
type ClaudeLine = {
  type?: string
  session_id?: string
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

/** T-656: the `claude -p` session a run's stream-json output names (its last line with a session_id), for `--resume`. */
export function claudeSession(out: ProcessOutput): string | undefined {
  let id: string | undefined
  for (const l of out.stdout.split('\n')) {
    const t = l.trim()
    if (!t.startsWith('{')) continue
    try {
      const j = JSON.parse(t) as ClaudeLine
      if (typeof j.session_id === 'string' && j.session_id) id = j.session_id
    } catch {
      // a broken line: skipped
    }
  }
  return id
}

/** T-656: what a follow-up turn (the debrief) may use: reading only; no commands, no edits. */
export const FOLLOW_UP_ALLOWED = ['Read', 'Glob', 'Grep']
export const FOLLOW_UP_DENIED = ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebSearch', 'WebFetch']

/** Options of claudeRunner: the claude binary (default `claude`, or SYMCC_CLAUDE), and a model for agents that name none. */
export type ClaudeRunnerOptions = { bin?: string; model?: string }

/**
 * Agents as `claude -p` processes: the prompt on stdin, stream-json out, Claude Code's permission flags as the edit guard.
 * T-656: the session is kept (no --no-session-persistence), so a finished agent can be given one more turn with
 * `--resume <session>` (followUp, the debrief), which may only read.
 */
export function claudeRunner(sys: Pick<ProcessSystem, 'run' | 'env'>, o: ClaudeRunnerOptions = {}): AgentRunner {
  return {
    name: 'claude',
    command(a) {
      const aliases = gitAliases(sys.run(['git', 'config', '--get-regexp', '^alias\\.'], a.cwd).stdout)
      const { allowed, denied } = claudePermissions(a, a.kind !== 'scout' && scratchInUse(sys, a.cwd), aliases)
      const model = a.model ?? o.model
      // --allowedTools and --disallowedTools take a list each, so the prompt goes on stdin (not as a word after them)
      const argv = [o.bin ?? sys.env('SYMCC_CLAUDE') ?? 'claude', '-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk', ...(model ? ['--model', model] : []), '--allowedTools', ...allowed, '--disallowedTools', ...denied]
      return { argv, stdin: a.prompt }
    },
    result: claudeResult,
    session: claudeSession,
    followUp(session, text, a) {
      const model = a.model ?? o.model
      const argv = [o.bin ?? sys.env('SYMCC_CLAUDE') ?? 'claude', '-p', '--resume', session, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk', ...(model ? ['--model', model] : []), '--allowedTools', ...FOLLOW_UP_ALLOWED, '--disallowedTools', ...FOLLOW_UP_DENIED]
      return { argv, stdin: text }
    },
  }
}
