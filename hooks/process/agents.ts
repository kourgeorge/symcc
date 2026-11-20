// host.agents as external processes (T-377, shared since T-474): each worker, scout or checker is one process started
// in its folder with its prompt, listed while it runs, and stopped by ending its process group. What the process is
// comes from an AgentRunner: claudeRunner (./claude-runner.ts) runs `claude -p --output-format stream-json` and reads the
// answer, tokens and cost from its last "result" line. Another CLI agent (e.g. `codex exec --json`) is one more
// AgentRunner: its command and its result reader. No Node, Claude Code or OpenCode import: the program it runs in
// hands it a ProcessSystem (./system.ts), e.g. hosts/node/system.ts.
import type { Host, HostAgent, HostAgentStart } from '../host'
import type { AgentRunEnd } from '../app/symcc'
import { basePromptFor, withoutSymccTools } from '../core/prompts'
import { SYMCC_WORDS } from '../host'
import { DEFAULT_NAME } from '../name'
import type { ProcessChild, ProcessSignal, ProcessSystem } from './system'
import { recordEditor, taskInName, type ProcessEntry, type ProcessRecord } from './record'

/**
 * The prompt agent `a` is run with: its base prompt (WORKER_BASE for a worker, SCOUT_BASE for a scout or checker, in
 * symcc's own words, as this host names its tools), then its task's prompt. Claude Code gives the base as the agent
 * type's prompt instead; a process has no agent type, so the base goes in front. A process agent has none of symcc's
 * tools (its permissions are the runner's, e.g. claudePermissions), so neither part names them (T-474): no ask_owner (it
 * writes its question in its report), no board or stats tools, and the web only when its role gives it web tools.
 */
export const withBasePrompt = (a: Pick<HostAgentStart, 'kind' | 'prompt' | 'tools'>): string => {
  const tool = (t: string) => SYMCC_WORDS.tool(DEFAULT_NAME, t)
  const base = basePromptFor(a.kind, DEFAULT_NAME, tool, { symccTools: false, web: a.tools?.includes('web') === true })
  return `${base}\n\n${withoutSymccTools(a.prompt, tool)}`
}

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

/** The agents processAgents keeps: Host['agents'], plus what a host waits on. */
export type ProcessAgents = Host['agents'] & {
  /** how many agent processes run now */
  running: () => number
  /** what the finished runs cost together (US dollars), when any said */
  cost: () => number | undefined
  /**
   * Ends every agent process still running (and what it started), and waits until they are gone (after `graceMs` they
   * are killed outright) and the record says so, so none keeps editing its folder after the host has quit.
   */
  stopAll: (graceMs?: number) => Promise<void>
  /** see Host['agents'].stopLeftovers: the recorded processes this copy didn't start */
  stopLeftovers: () => Promise<string[]>
}

export type ProcessAgentsOptions = {
  system: ProcessSystem
  /** where the running processes are recorded (see ./record.ts); none: nothing is recorded, and no leftover is found */
  record?: ProcessRecord
  /** how long a leftover process gets to end after SIGTERM before it is killed outright */
  leftoverGraceMs?: number
}

/** host.agents over `runner`'s processes; `onEnd` is called once per run when its process has ended. */
export function processAgents(runner: AgentRunner, onEnd: (agentId: string, end: RunnerEnd) => void, o: ProcessAgentsOptions): ProcessAgents {
  const sys = o.system
  type Run = { agent: HostAgent; child: ProcessChild; killed: boolean; closed: Promise<void> }
  const runs = new Map<string, Run>()
  const rec = o.record ? recordEditor(o.record) : undefined
  const note = (fn: (entries: ProcessEntry[]) => ProcessEntry[]) => rec?.edit(e => ({ entries: fn(e), out: undefined })).catch(() => undefined)
  let n = 0
  let cost: number | undefined
  // Each agent runs in its own process group, so a stop ends what it started too (e.g. a shell's commands).
  const signal = (r: Run, sig: ProcessSignal) => {
    try {
      if (r.child.pid) sys.signalGroup(r.child.pid, sig)
      else r.child.kill(sig)
    } catch {
      r.child.kill(sig)
    }
  }
  const stop = (r: Run) => {
    if (r.agent.status !== 'running') return
    r.killed = true
    signal(r, 'SIGTERM')
  }
  return {
    async spawn(a) {
      const { argv, stdin, env } = runner.command({ ...a, prompt: withBasePrompt(a) })
      const [cmd, ...args] = argv
      if (!cmd) throw new Error(`${runner.name}: no command for ${a.name}`)
      const id = `${runner.name}-${++n}-${Date.now().toString(36)}`
      const child = sys.spawn(cmd, args, { ...(a.cwd ? { cwd: a.cwd } : {}), ...(env ? { env } : {}), stdin: stdin !== undefined })
      const closed = new Promise<void>(res => {
        child.on('close', () => res())
        child.on('error', () => res())
      })
      const run: Run = { agent: { id, kind: a.kind === 'worker' ? 'worker' : 'scout', status: 'running', name: a.name, description: a.description }, child, killed: false, closed }
      runs.set(id, run)
      const pid = child.pid
      if (pid) {
        const task = taskInName(a.name)
        const entry: ProcessEntry = { pid, agent: id, ...(task ? { task } : {}), ...(a.cwd ? { folder: a.cwd } : {}), started: new Date().toISOString(), command: cmd }
        void note(e => [...e.filter(x => x.pid !== pid), entry])
      }
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', c => void (stdout += c.toString()))
      child.stderr.on('data', c => void (stderr += c.toString()))
      let ended = false
      const end = (exitCode: number, why = '') => {
        if (ended) return
        ended = true
        run.agent = { ...run.agent, status: run.killed ? 'killed' : exitCode === 0 ? 'completed' : 'failed' }
        void note(e => e.filter(x => x.agent !== id))
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
      if (r) stop(r)
    },
    running: () => [...runs.values()].filter(r => r.agent.status === 'running').length,
    cost: () => cost,
    async stopAll(graceMs = 5000) {
      const live = [...runs.values()].filter(r => r.agent.status === 'running' || r.killed)
      for (const r of live) stop(r)
      // the group is ended outright after the grace time, and also when its leader closed early (its children may live on)
      await Promise.all(
        live.map(async r => {
          await Promise.race([r.closed, sys.sleep(graceMs)])
          signal(r, 'SIGKILL')
          await Promise.race([r.closed, sys.sleep(1000)])
        }),
      )
      await rec?.idle()
    },
    async stopLeftovers() {
      if (!rec) return []
      const grace = o.leftoverGraceMs ?? 3000
      return rec
        .edit(async entries => {
          const mine = entries.filter(e => runs.has(e.agent))
          const theirs = entries.filter(e => !runs.has(e.agent) && sys.alive(e.pid, e.command))
          const send = (e: ProcessEntry, sig: ProcessSignal) => {
            try {
              sys.signalGroup(e.pid, sig)
            } catch {
              // the group is gone already
            }
          }
          for (const e of theirs) send(e, 'SIGTERM')
          for (let waited = 0; waited < grace && theirs.some(e => sys.alive(e.pid, e.command)); waited += 100) await sys.sleep(100)
          for (const e of theirs) if (sys.alive(e.pid, e.command)) send(e, 'SIGKILL')
          // the dead entries, and the ones just stopped, are dropped; this copy's own stay
          return { entries: mine, out: theirs.map(e => e.agent) }
        })
        .catch(() => [] as string[])
    },
  }
}
