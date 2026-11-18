// The shared fake Host (T-246): what the tests of symcc's logic (hooks/plugin/, hooks/app/) run on, with no Claude Code
// `$` at all. It is also the model for a new host (an OpenCode plugin, a standalone client): every member a Host has,
// in symcc's words (hooks/host.ts). By default nothing is there: no files, every command answers exit 0 with no output,
// timers never fire, no agents, no screen; the lead's messages and the agents started and messaged are recorded.
// A test gives only the parts its world needs (`parts`), and may change any member afterwards (the Host is a plain
// object: e.g. `w.$.agents.spawn = ...`).
import { type Host, type HostAgent, type HostAgentStart, type HostRunResult, type PanelValues, SYMCC_WORDS, noUi } from '../hooks/host'
import type { SymccView } from '../types'

/** The parts of a Host a test gives: each member group in part; what is left out keeps the fake's default. */
export type HostParts = {
  plugin?: Partial<Host['plugin']>
  session?: Partial<Host['session']>
  lead?: Partial<Host['lead']>
  agents?: Partial<Host['agents']>
  words?: Host['words']
  env?: Host['env']
  fs?: Partial<Host['fs']>
  run?: Host['run']
  clock?: Partial<Host['clock']>
  ui?: Partial<Host['ui']>
}

/** A command's answer: exit 0 with no output unless given. */
export const done = (r: Partial<HostRunResult> = {}): HostRunResult => ({ exitCode: 0, stdout: '', stderr: '', ...r })

/** The board panel's values kept in memory, as a host with a panel keeps them (each starts as the panel's start value). */
export function memoryPanel(): PanelValues & { view: () => SymccView } {
  let opened = ''
  let tab = ''
  let scout = ''
  let view = { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] } as SymccView
  return {
    readOpened: async () => opened,
    updateOpened: async f => void (opened = f(opened)),
    readTab: async () => tab,
    updateTab: async f => void (tab = f(tab)),
    readScoutOpen: async () => scout,
    updateScoutOpen: async f => void (scout = f(scout)),
    readView: async () => view,
    updateView: async f => void (view = f(view)),
    view: () => view,
  }
}

/**
 * A fake Host made of `parts`, and what it recorded: the lead's messages (`toLead`), the agents started (`spawns`) and
 * the messages sent to agents (`sent`, both send and stop). The board panel's values are kept in memory (`panel`).
 */
export function fakeHost(parts: HostParts = {}) {
  const toLead: string[] = []
  const spawns: HostAgentStart[] = []
  const sent: { to: string; text: string }[] = []
  const panel = memoryPanel()
  const timer = { cancel: () => undefined }
  const host: Host = {
    plugin: { name: 'symcc', root: '/plugin', ...parts.plugin },
    session: { id: async () => 'me', repo: async () => null, root: async () => '/', usage: async () => ({}), ...parts.session },
    lead: { send: async text => void toLead.push(text), usage: async () => ({}), ...parts.lead },
    agents: {
      spawn: async a => (spawns.push(a), { agentId: `agent-${spawns.length}` }),
      list: async (): Promise<HostAgent[]> => [],
      send: async (to, text) => void sent.push({ to, text }),
      stop: async (to, text) => void sent.push({ to, text }),
      ...parts.agents,
    },
    words: parts.words ?? SYMCC_WORDS,
    env: parts.env ?? (async () => undefined),
    fs: {
      read: async p => Promise.reject(new Error(`no file ${p}`)),
      write: async () => undefined,
      exists: async () => false,
      list: async () => [],
      stat: async p => Promise.reject(new Error(`no file ${p}`)),
      ...parts.fs,
    },
    run: parts.run ?? (async () => done()),
    clock: { after: () => timer, every: () => timer, sleep: async () => undefined, ...parts.clock },
    ui: { ...noUi, panel, ...parts.ui },
  }
  return { host, toLead, spawns, sent, panel }
}

/** Files kept in memory, as a Host's `fs` (stat answers `mtimeMs` from `mtime`, 0 when not given). */
export function memoryFs(files: Map<string, string>, mtime: (p: string) => number = () => 0): Host['fs'] {
  return {
    read: async p => {
      if (!files.has(p)) throw new Error(`no file ${p}`)
      return files.get(p)!
    },
    write: async (p, text) => void files.set(p, text),
    exists: async p => files.has(p),
    list: async () => [],
    stat: async p => {
      if (!files.has(p)) throw new Error(`no file ${p}`)
      return { kind: 'file', size: files.get(p)!.length, mtimeMs: mtime(p), isLink: false }
    },
  }
}
