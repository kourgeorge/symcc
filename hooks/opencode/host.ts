// OpenCode's side of the Host (hooks/host.ts), T-462: opencodeHost makes a Host for one copy of the OpenCode plugin
// (OpenCode starts one per folder a session works in, see plugin.ts). Files, commands and timers are plain Node/Bun,
// shared with the Node host (hosts/node/host.ts: nodeFs, runCommand, nodeClock); the session is the copy's folder.
// The agents are OpenCode sessions (agents.ts, T-463), passed in by plugin.ts as `agents`. Not built yet, and filled
// by the next OpenCode tasks: the lead (session.prompt), symcc's tools and slash commands, and the TUI's board panel
// and band. Until then a board update for the lead goes nowhere; with no `agents` given, no agent can start (its
// start is "not ready", so a task waits).
import { type Host, type HostFeatures, type HostWords, noUi } from '../host'
import { nodeFs, runCommand, nodeClock } from '../../hosts/node/host'

/**
 * What OpenCode can do here, for now: no panel and no band yet (the TUI part comes later), no plan mode and no lead
 * usage. The lead is woken at once (session.prompt, once lead.send is built), and agents start at once: OpenCode
 * runs a plugin's hooks for every session, so no start queue is needed (HostFeatures.startQueue, T-470).
 */
export const OPENCODE_FEATURES: HostFeatures = { panel: false, band: false, wakeLead: 'now', planMode: false, leadUsage: false, startQueue: false }

/** OpenCode's words: a plugin tool is named "<name>_<tool>"; its file tools are read, edit and write; its read-only agent is Plan. */
export const OPENCODE_WORDS: HostWords = {
  tool: (name, tool) => `${name}_${tool}`,
  fileTools: 'read, edit and write',
  planMode: "OpenCode's Plan agent (Tab switches to it)",
  askPopup: '',
}

/** The symcc folder this file ships in (where roles/, kinds/, examples/ and .claude-plugin/plugin.json are). */
export const PLUGIN_ROOT = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '')).replace(/\/hooks\/opencode\/[^/]*$/, '')

/** One id for this OpenCode server process (kept on globalThis, which every copy of the plugin shares). */
export function serverId(): string {
  const g = globalThis as unknown as Record<string, unknown>
  const key = '__symccOpencodeServerId'
  if (typeof g[key] !== 'string') g[key] = Math.random().toString(36).slice(2, 10)
  return g[key] as string
}

/** A start the host can't do yet: marked "not ready", so symcc tries again later and the task stays waiting. */
const notBuilt = (what: string) => Object.assign(new Error(`${what} is not built yet in symcc's OpenCode plugin`), { notReady: true })

export type OpencodeHostOptions = {
  /** the folder of this copy of the plugin (ctx.location.directory) */
  dir: string
  /** this copy's session id for symcc (the lead.json owner); default: one per OpenCode server */
  sessionId?: string
  /** symcc's own folder (default: the one this file ships in) */
  pluginRoot?: string
  /** where notices and debug lines go (default: stderr, debug lines only with SYMCC_DEBUG set) */
  say?: (line: string) => void
  /** the agents (default: a stub that can't start any, see notBuilt) */
  agents?: Host['agents']
  /** the lead (default: a stub; a board update goes nowhere yet) */
  lead?: Host['lead']
}

/** The Host for one copy of the OpenCode plugin, for folder `o.dir`. */
export function opencodeHost(o: OpencodeHostOptions): Host {
  const say = o.say ?? ((line: string) => void process.stderr.write(`[symcc] ${line}\n`))
  const id = o.sessionId ?? `opencode-${serverId()}`
  return {
    features: OPENCODE_FEATURES,
    plugin: { name: 'symcc', root: o.pluginRoot ?? PLUGIN_ROOT },
    session: {
      id: async () => id,
      async repo() {
        const r = await runCommand(['git', 'rev-parse', '--show-toplevel'], { cwd: o.dir, timeoutMs: 15_000 })
        return r.exitCode === 0 && r.stdout.trim() ? { root: r.stdout.trim() } : null
      },
      root: async () => o.dir,
      usage: async () => ({}),
    },
    lead: o.lead ?? { send: async () => Promise.reject(notBuilt('telling the lead')), usage: async () => ({}) },
    agents: o.agents ?? {
      spawn: async () => Promise.reject(notBuilt('starting an agent')),
      list: async () => [],
      send: async () => undefined,
      stop: async () => undefined,
    },
    words: OPENCODE_WORDS,
    env: async name => process.env[name],
    fs: nodeFs,
    run: runCommand,
    clock: nodeClock,
    ui: {
      ...noUi,
      toast: text => say(text),
      log: text => void (process.env.SYMCC_DEBUG ? say(`[debug] ${text}`) : undefined),
    },
  }
}
