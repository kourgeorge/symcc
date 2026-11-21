// Claude Code's side of the Host (hooks/host.ts): claudeHost makes a Host from one hook's `$`, mapping symcc's words
// to Claude Code's: `run` is $.process.run, `env` is $.env.get, symcc's workers, scouts and checkers are background
// subagents of the agent types claude/registration.ts registers ("<name>:worker", "<name>:worker-web", ...,
// "<name>:scout"), listed by $.agent.list() and told to stop with $.session.send. The lead is the main chat, sent a
// prompt with $.prompt.submit, and its usage is read from Claude Code's session logs (claude/lead-usage.ts);
// `ui.refresh` is $.ui.invalidate('ui.render'), `ui.panel` carries the board panel's values, which only Claude Code's
// `$` holds (claude/panel.ts), `words` gives symcc's tools their "mcp__<name>__<tool>" names, and `features` are all on.
import type { EngineInterface } from 'claude-code'
import { type Host, type HostAgentStart, type HostProcess, type HostProcesses, type HostWords, ALL_FEATURES, etimeArgv, holderFromPs, manifestVersion, startFromEtime } from '../host'
import { S } from '../app/state'
import { claudeNames, workerTypeFor } from './agent-types'
import { hostAgent, isNotReady, scoutNotReady } from './agents'
import { leadUsage } from './lead-usage'
import { panelValues } from './panel'
import { useTaskStop } from './background'

/** The Host register.tsx hands the logic (the board panel's values are its ui.panel). */
export type ClaudeHost = Host

/** The Claude Code agent type an agent of this kind is started as: a worker's fits its role's tool words (web: "<name>:worker-web", which has WebSearch and WebFetch); scouts and checkers are scouts. */
export function agentTypeFor(a: Pick<HostAgentStart, 'kind' | 'tools'>, name: string = S.N.name): string {
  return a.kind === 'worker' ? workerTypeFor({ tools: a.tools ? [...a.tools] : undefined }, name) : claudeNames(name).scout
}

/**
 * Claude Code's words: symcc's tools are MCP tools, "mcp__<name>__<tool>"; a role's `tools: web` gives a worker WebSearch and WebFetch (claude/agent-types.ts); a
 * worker's file tools are Read, Edit and Write; plan mode is turned on with Shift+Tab; its question dialog is
 * AskUserQuestion; the chat is Claude, the program Claude Code, and ctrl+x tab goes back to the board panel.
 */
export const CLAUDE_WORDS: Required<HostWords> = {
  tool: (name, tool) => claudeNames(name).tool(tool),
  fileTools: 'Read, Edit and Write',
  planMode: "Claude Code's own planning mode, Shift+Tab",
  askPopup: 'AskUserQuestion',
  assistant: 'Claude',
  app: 'Claude Code',
  backToBoard: 'ctrl+x tab',
}

/** An error from a start, marked when it only means the agent type isn't there yet (see notReadyYet in host.ts). */
function startError(a: HostAgentStart, err: unknown): unknown {
  const msg = (err as Error)?.message ?? String(err)
  const notReady = a.kind === 'worker' ? isNotReady(msg, S.N.name) : scoutNotReady(msg, S.N.name)
  const e = err instanceof Error ? err : new Error(msg)
  return notReady ? Object.assign(e, { notReady: true }) : e
}

/** host.agents for Claude Code, over the hook's own `$`. */
export function claudeAgents($: EngineInterface): Host['agents'] {
  return {
    async spawn(a) {
      const input = { prompt: a.prompt, name: a.name, description: a.description, subagentType: agentTypeFor(a), ...(a.cwd !== undefined ? { cwd: a.cwd } : {}), ...(a.model ? { model: a.model } : {}) }
      let spawned: Awaited<ReturnType<EngineInterface['agent']['spawn']>>
      try {
        spawned = await $.agent.spawn(input)
      } catch (err) {
        throw startError(a, err)
      }
      if ('deny' in spawned && spawned.deny) throw startError(a, new Error(spawned.deny))
      return 'agentId' in spawned && spawned.agentId ? { agentId: spawned.agentId } : {}
    },
    // Every worker type (worker, worker-web, ...) is listed as a 'worker', the scout type as a 'scout' (see HostAgent).
    list: async () => (await $.agent.list()).map(a => hostAgent(a, S.N.name)),
    send: (agentId, text) => $.session.send({ to: { agentId }, text }),
    stop: (agentId, text) => $.session.send({ to: { agentId }, text }),
    // T-656: a message to a subagent that has handed back resumes it with its whole context; its answer comes as another turn.complete
    followUp: (agentId, text) => $.session.send({ to: { agentId }, text }),
  }
}

/** How long one ps question may take before the answer is "can't tell" (the board lock waits on it). */
export const PS_TIME_LIMIT_MS = 2_000

/**
 * The shell line that names the process symcc's commands are started from, which is Claude Code itself (the plugin
 * has no pid of its own to read): its pid ($PPID of the shell $.process.run starts), how long it has run, and its
 * command line, one per line.
 */
export const SELF_SCRIPT = 'p=$PPID; echo "$p"; ps -o etime= -p "$p"; ps -o args= -p "$p"'

/** Whether ps's command line `args` is Claude Code: the `claude` program, or a script run by node/bun whose path names claude. */
export function looksLikeClaude(args: string): boolean {
  const [first = '', second = ''] = args.trim().split(/\s+/)
  const base = (w: string) => w.split('/').pop() ?? ''
  if (base(first) === 'claude') return true
  return /^(node|bun)$/.test(base(first)) && /claude/.test(second)
}

/** This plugin's holder process from SELF_SCRIPT's output, or undefined when it isn't a Claude Code process ps could time. */
export function selfFromScript(r: { exitCode: number; stdout: string } | undefined, nowMs: number = Date.now()): HostProcess | undefined {
  if (!r || r.exitCode !== 0) return undefined
  const [pidLine = '', etime = '', args = ''] = r.stdout.split('\n')
  const pid = Number(pidLine.trim())
  if (!Number.isInteger(pid) || pid <= 1 || !looksLikeClaude(args)) return undefined
  const started = startFromEtime(etime, nowMs)
  return started === undefined ? undefined : { pid, started }
}

/** The holder this plugin names (asked once per load: the Claude Code process does not change): undefined = not asked yet, null = can't tell. */
let selfKnown: HostProcess | null | undefined
let selfAsking = false
let selfFailed = 0
/** Forgets what self() found (for tests). */
export function resetClaudeSelf() {
  selfKnown = undefined
  selfAsking = false
  selfFailed = 0
}

/** Never rejects: undefined on any error, or when it takes longer than PS_TIME_LIMIT_MS. */
async function ps($: EngineInterface, argv: readonly string[]): Promise<{ exitCode: number; stdout: string } | undefined> {
  try {
    return await $.process.run(argv, { timeoutMs: PS_TIME_LIMIT_MS })
  } catch {
    return undefined
  }
}

/**
 * host.processes for Claude Code (T-662), the same check the Node host makes (hooks/host.ts holderFromPs).
 * self(): the Claude Code process (the parent of the shell $.process.run starts, kept only when ps names it as
 * claude), with its start time from ps (T-669). self() can't wait, so its first call only starts the question and
 * names no holder (that lock keeps the 30 s rule); later calls give the answer. alive(p): `ps -o etime= -p <pid>`,
 * at most PS_TIME_LIMIT_MS; any error is "can't tell". Never throws. On Windows ps is missing: "can't tell".
 */
export function claudeProcesses($: EngineInterface): HostProcesses {
  return {
    self() {
      if (selfKnown === undefined && !selfAsking) {
        selfAsking = true
        void ps($, ['sh', '-c', SELF_SCRIPT]).then(r => {
          // the call failed (e.g. its hook ended first): ask again next time, a few times at most
          if (r || ++selfFailed >= 3) selfKnown = selfFromScript(r) ?? null
          selfAsking = false
        })
      }
      return selfKnown ?? undefined
    },
    async alive({ pid, started }) {
      if (!Number.isInteger(pid) || pid <= 1 || typeof started !== 'number' || !Number.isFinite(started)) return undefined
      return holderFromPs(await ps($, etimeArgv(pid)), started)
    },
  }
}

/**
 * The environment variables symcc reads (claude/lead-usage.ts, app/symcc.ts). Claude Code's loader wants each name
 * `$.env.get` reads written out, so the modules' reads can be listed: one more name means one more line here.
 */
function envGet($: EngineInterface, name: string): Promise<string | undefined> {
  if (name === 'HOME') return $.env.get('HOME')
  if (name === 'USERPROFILE') return $.env.get('USERPROFILE')
  if (name === 'CLAUDE_CONFIG_DIR') return $.env.get('CLAUDE_CONFIG_DIR')
  return Promise.resolve(undefined)
}

/**
 * The hook's `$` as a Host: each member makes the same call on the same `$` (so a hook's waits still count against its
 * own time), under symcc's names, plus `agents`, `lead`, `words` and `ui.panel`, the board panel's values (app/state.ts). Cheap and holds
 * nothing, so each hook makes its own. Written out member by member: Claude Code's loader only lets `$` be used as
 * `$.noun.event(...)` or handed to the plugin's own functions, so `$` can't be wrapped as a whole (and some calls want
 * their first argument written out: see envGet).
 */
export function claudeHost($: EngineInterface): ClaudeHost {
  // T-724: a background command of a worker still running at its hand-back is stopped by its task id with the TaskStop tool
  useTaskStop(id => $.tool.call({ tool: 'TaskStop', task_id: id }))
  const host: ClaudeHost = {
    // Claude Code has every feature: the board panel, the band, a lead woken at once, plan mode and the lead's session logs
    features: ALL_FEATURES,
    plugin: {
      get name() {
        return $.plugin.name
      },
      get root() {
        return $.plugin.root
      },
      version: () => manifestVersion(host.fs, $.plugin.root),
    },
    session: { id: () => $.session.id(), repo: () => $.session.repo(), root: () => $.session.root(), usage: () => $.session.usage() },
    lead: { send: text => $.prompt.submit({ text }), usage: (root, range, nowMs) => leadUsage(host, root, range, nowMs) },
    agents: claudeAgents($),
    words: CLAUDE_WORDS,
    env: name => envGet($, name),
    fs: {
      read: p => $.fs.read(p),
      write: (p, text) => $.fs.write(p, text),
      exists: p => $.fs.exists(p),
      list: p => $.fs.list(p),
      stat: (p, options) => $.fs.stat(p, options),
    },
    run: (argv, init) => $.process.run(argv, init),
    processes: claudeProcesses($),
    clock: { after: (ms, fn) => $.clock.after(ms, fn), every: (ms, fn) => $.clock.every(ms, fn), sleep: ms => $.clock.sleep(ms) },
    ui: {
      toast: text => $.ui.toast(text),
      status: text => $.ui.status(text),
      log: (text, options) => $.ui.log(text, options),
      // the board panel is drawn on 'ui.render'; the loader wants the event written out
      refresh: () => $.ui.invalidate('ui.render'),
      open: pane => $.ui.open(pane),
      panes: () => $.ui.panes(),
      panel: panelValues($),
    },
  }
  return host
}
