// GitHub Copilot CLI's side of the Host (hooks/host.ts), T-957: copilotHost makes a Host for one Copilot session, the
// one symcc's extension joined (extension.ts). Copilot runs one extension process per session and restarts it on
// /clear or a session replace, so the board and lead.json stay on disk, as in every host.
// Files, commands, timers and processes are given in (`system`): the extension's entry passes plain Node's (the Node
// host's nodeFs, runCommand, nodeClock, nodeProcesses), the tests a fake one, so this folder imports no Node and
// type-checks with the rest of hooks/. The lead is the joined session (lead.ts: session.send, enqueue or immediate);
// notices and the text board go to the chat timeline with session.log.
// The agents (workers, checkers and scouts as SDK child sessions, each in its own folder with its own guard) are
// agents.ts (T-959), given in as `agents` by extension.ts when its entry hands it the SDK; with none given (no SDK)
// no agent can start: its start is "not ready", so its task waits. Not built yet: a band (a statusLine script).
import { type Host, type HostFeatures, type HostWords, noUi } from '../host'
import type { CpSession } from './sdk'
import { copilotLead } from './lead'

/**
 * What Copilot can do here, for now: no panel and no band (a later task adds a statusLine band), no plan mode for
 * symcc, no lead usage. The lead is woken at once (session.send), and agents start at once: there is no start queue.
 */
export const COPILOT_FEATURES: HostFeatures = { panel: false, band: false, wakeLead: 'now', planMode: false, leadUsage: false, startQueue: false }

/** Copilot's words: an extension's tool is called by the name it gives ("symcc_board"); its file tools are view and apply_patch. */
export const COPILOT_WORDS: HostWords = {
  tool: (name, tool) => `${name}_${tool}`,
  fileTools: 'view, apply_patch and bash call',
  planMode: "Copilot CLI's plan mode (Shift+Tab)",
  askPopup: '',
  assistant: 'Copilot',
  app: 'Copilot CLI',
}

/** Why agents can't start: the Copilot host was given no agents (no SDK). Marked "not ready", so a task waits. */
export const AGENTS_NOT_BUILT = "starting an agent is not built yet in symcc's Copilot host"

const notBuilt = () => Object.assign(new Error(AGENTS_NOT_BUILT), { notReady: true })

/** The program parts the Copilot host is given: Node's in the extension, a fake in the tests. */
export type CopilotSystem = Pick<Host, 'fs' | 'run' | 'clock' | 'env'> & Partial<Pick<Host, 'processes'>>

export type CopilotHostOptions = {
  /** the session's folder (the project, or a folder inside it) */
  dir: string
  /** files, commands, timers, environment and processes */
  system: CopilotSystem
  /** the joined session; undefined before the join (notices then go to `say`, board updates are refused for now) */
  session: () => CpSession | undefined
  /** told each prompt symcc sends into the session (so the prompt hook knows it is not the owner's) */
  sent?: (prompt: string) => void
  /**
   * symcc's own folder (where roles/, kinds/, examples/ and .claude-plugin/plugin.json are): the extension's entry
   * knows where it ships (this folder's type check has no import.meta.url)
   */
  pluginRoot: string
  /** where notices go before the join (default: nowhere) */
  say?: (line: string) => void
  /** debug lines go to the timeline (as passing notes, ephemeral); default off */
  debug?: boolean
  /** the agents (agents.ts copilotAgents; default: a stub that can't start any) */
  agents?: Host['agents']
}

/** The Host for one Copilot session in folder `o.dir`. */
export function copilotHost(o: CopilotHostOptions): Host {
  const say = o.say ?? (() => undefined)
  const log = (text: string, ephemeral?: true) => {
    const s = o.session()
    if (!s) return say(text)
    void s.log(text, ephemeral ? { ephemeral } : undefined).catch(() => undefined)
  }
  return {
    features: COPILOT_FEATURES,
    plugin: { name: 'symcc', root: o.pluginRoot },
    session: {
      // lead.json's owner: this Copilot session (a new one after /clear)
      id: async () => `copilot-${o.session()?.sessionId ?? 'unjoined'}`,
      async repo() {
        const r = await o.system.run(['git', 'rev-parse', '--show-toplevel'], { cwd: o.dir, timeoutMs: 15_000 })
        return r.exitCode === 0 && r.stdout.trim() ? { root: r.stdout.trim() } : null
      },
      root: async () => o.dir,
      usage: async () => ({}),
    },
    lead: copilotLead(o.session, o.sent),
    agents: o.agents ?? {
      spawn: async () => Promise.reject(notBuilt()),
      list: async () => [],
      send: async () => undefined,
      stop: async () => undefined,
    },
    words: COPILOT_WORDS,
    env: o.system.env,
    fs: o.system.fs,
    ...(o.system.processes ? { processes: o.system.processes } : {}),
    run: o.system.run,
    clock: o.system.clock,
    ui: {
      ...noUi,
      toast: text => log(text),
      log: text => void (o.debug ? log(`[debug] ${text}`, true) : undefined),
    },
  }
}
