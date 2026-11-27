// The board's serve side: what the panel and the sidebar show besides the board view (the lead chat and its timeline,
// each agent's steps, the lead's model and mode, the account's models, the slash commands, a network problem), what
// their presses do, and what serve asks of the editor (./contract.ts EditorAction). The webview's messages come here
// through the extension unread (./protocol.ts FromWebview); an answer goes back to the surface that asked.
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import type { EditorAction, Surface } from './contract'
import type { LeadChoice, LeadEvent } from './lead'
import type { AgentChoice, ChatImage, ChatItem, FromWebview, LeadSettings, ModelInfo, NetworkProblem, PanelActionId, PanelMode, PanelStep, PanelView, PanelWorktree, SlashItem, ToWebview, WorktreeAction } from './protocol'
import type { CursorSession } from './session'
import { LEAD_AGENT, addStep, readSteps, sessionMarkdown, sessionPath, turnSteps } from './steps'

/** A lead error that means serve could not reach its agents' servers. */
const NETWORK_ERROR = /network request failed|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|getaddrinfo|socket hang up|proxy/i

/** How many chat lines are kept. */
const CHAT_KEPT = 300
/** A lead answer keeps its turn's newest steps, each at most this long; only the newest answers keep them when saved. */
const TURN_STEPS_KEPT = 120
const STEP_TEXT_KEPT = 4000
const ANSWERS_WITH_STEPS = 40

export const PANEL_ACTIONS: readonly PanelActionId[] = ['approve', 'reject', 'done', 'keep-note', 'ask-more', 'retry', 'run-now', 'drop', 'pause', 'resume', 'show-changes', 'to-todo', 'merge-now']
export const MODES: readonly PanelMode[] = ['paused', 'review', 'auto']

/** The chat as it is saved: no pictures (only how many), the steps of the newest answers only. */
export function savedChat(chat: readonly ChatItem[]): ChatItem[] {
  let withSteps = 0
  return chat
    .slice()
    .reverse()
    .map(c => {
      const { images, steps, ...rest } = c
      const keep = steps && withSteps++ < ANSWERS_WITH_STEPS
      return { ...rest, ...(images?.length ? { pictures: images.length } : {}), ...(keep ? { steps } : {}) }
    })
    .reverse()
}

/** The status bar item while serve runs, from the board view. */
export function statusOf(v: PanelView): Extract<EditorAction, { do: 'status' }> {
  if (!v.on) return { do: 'status', text: 'symcc: off', tooltip: v.off ?? 'symcc is off in this project', needs: 0 }
  const n = v.counts.needs
  if (n) return { do: 'status', text: `$(bell-dot) symcc: ${n} need${n === 1 ? 's' : ''} you`, tooltip: v.needs.map(x => `**${x.id}** ${x.title}`).join('  \n'), tone: 'warning', needs: n }
  const r = v.counts.running
  return { do: 'status', text: r ? `$(pulse) symcc: ${r} running` : 'symcc', tooltip: r ? v.lanes.map(l => `${l.id} ${l.title}`).join('  \n') : 'Nothing needs you. Open the board', needs: 0 }
}

export type BoardSession = Pick<CursorSession, 'lead' | 'message' | 'slash' | 'models' | 'view' | 'steps' | 'act' | 'answer' | 'mode' | 'runScout' | 'forget' | 'command' | 'worktrees'>

export type BoardOptions = {
  /** the session, once it is open */
  session: () => BoardSession
  /** the project folder */
  root: string
  /** whose agents run (what symcc.agents holds), and the choices */
  agents: string
  choices: readonly AgentChoice[]
  /** the proxy serve runs with ('' for none) */
  proxy: string
  /** where the chat and the lead's settings are kept (nowhere when absent) */
  stateDir?: string
  toWebview: (m: ToWebview, surface?: Surface) => void
  editor: (a: EditorAction) => void
  log?: (line: string) => void
}

export type Board = {
  /** loads what was kept, then tells the session the lead's settings and lists the models and the slash commands */
  start: () => Promise<void>
  fromWebview: (m: FromWebview, surface: Surface) => Promise<void>
  /** the owner's answer to a confirm */
  confirmed: (id: number, ok: boolean) => void
  /** the owner's message to the lead from an editor command */
  say: (text: string) => Promise<string>
  onLead: (e: LeadEvent) => void
  onView: (v: PanelView) => void
  onStep: (agent: string, step: PanelStep) => void
  onToast: (text: string) => void
  onOpen: () => void
  /** resolves once what was kept is on disk */
  idle: () => Promise<void>
}

export function openBoard(o: BoardOptions): Board {
  const s = o.session
  const service = o.choices.find(c => c.id === o.agents)?.name ?? o.agents
  const leadFile = `lead-${o.agents.replace(/[^a-z0-9-]/gi, '_')}.json`
  let chat: ChatItem[] = []
  let busy = false
  // when the lead's newest turn started, so its answer keeps only that turn's steps
  let turnAtMs = 0
  let lead: LeadSettings = { mode: 'agent' }
  let models: ModelInfo[] = []
  let slash: SlashItem[] = []
  let network: NetworkProblem | null = null
  // each agent's newest steps (the lead's under "lead"); the whole sessions are on disk
  let steps: Record<string, PanelStep[]> = {}
  let view: PanelView | undefined
  let status = ''
  const seenNeeds = new Set<string>()
  let firstView = true
  let nextConfirm = 1
  const confirms = new Map<number, (ok: boolean) => void>()

  const post = (m: ToWebview, surface?: Surface) => o.toWebview(m, surface)
  // one write at a time, so the newest is the one kept
  let writing: Promise<void> = Promise.resolve()
  const keep = (file: string, data: unknown) => {
    if (!o.stateDir) return
    const dir = o.stateDir
    const text = JSON.stringify(data)
    writing = writing
      .then(() => mkdir(dir, { recursive: true }))
      .then(() => writeFile(join(dir, file), text))
      .catch(err => o.log?.(`couldn't keep ${file}: ${(err as Error).message}`))
  }
  const kept = async <T>(file: string): Promise<T | undefined> => {
    if (!o.stateDir) return undefined
    return readFile(join(o.stateDir, file), 'utf8').then(
      t => JSON.parse(t) as T,
      () => undefined,
    )
  }
  const confirm = (text: string, button: string, detail?: string) =>
    new Promise<boolean>(resolve => {
      const id = nextConfirm++
      confirms.set(id, resolve)
      o.editor({ do: 'confirm', id, text, button, ...(detail ? { detail } : {}) })
    })

  const addChat = (who: ChatItem['who'], text: string, more: Partial<ChatItem> = {}) => {
    const atMs = Date.now()
    chat = [...chat, { key: `${atMs}-${chat.length}`, who, text, atMs, ...more }].slice(-CHAT_KEPT)
    keep('chat.json', savedChat(chat))
    post({ type: 'chat', items: chat, busy })
  }
  const leadTurn = (): Partial<ChatItem> => {
    const turn = turnSteps(steps[LEAD_AGENT] ?? [], turnAtMs)
      .slice(-TURN_STEPS_KEPT)
      .map(x => (x.text.length > STEP_TEXT_KEPT ? { ...x, text: `…${x.text.slice(-STEP_TEXT_KEPT)}` } : x))
    return { ...(turn.length ? { steps: turn } : {}), ...(lead.modelLabel ? { model: lead.modelLabel } : {}) }
  }
  const setNetwork = (n: NetworkProblem | null) => ((network = n), post({ type: 'network', problem: n }))
  const choice = (): Partial<LeadChoice> => ({ model: lead.model, mode: lead.mode })
  const setLead = (next: LeadSettings) => {
    lead = next
    keep(leadFile, lead)
    post({ type: 'lead', settings: lead })
    try {
      s().lead.configure(choice())
    } catch (err) {
      o.log?.(`couldn't set the lead's model: ${(err as Error).message}`)
    }
  }
  /** Sends the owner's message to the lead; a /command that answered the owner itself adds its answer. */
  const sendLead = async (text: string, images: readonly ChatImage[] = []) => {
    addChat('owner', text, images.length ? { images: images.map(i => `data:${i.mimeType};base64,${i.data}`) } : {})
    const a = await s().message(text, images)
    if (typeof a.said === 'string') addChat('note', a.said)
    return a.said ?? ''
  }
  const sendAll = (surface?: Surface) => {
    post({ type: 'chat', items: chat, busy }, surface)
    post({ type: 'network', problem: network }, surface)
    post({ type: 'steps', all: steps }, surface)
    post({ type: 'lead', settings: lead }, surface)
    post({ type: 'agents', list: [...o.choices], current: o.agents }, surface)
    if (models.length) post({ type: 'models', models }, surface)
    if (slash.length) post({ type: 'slash', items: slash }, surface)
    if (view) post({ type: 'view', view }, surface)
  }

  const notifyNew = (v: PanelView) => {
    const fresh = v.needs.filter(x => !seenNeeds.has(x.id))
    for (const x of v.needs) seenNeeds.add(x.id)
    for (const id of [...seenNeeds]) if (!v.needs.some(x => x.id === id)) seenNeeds.delete(id)
    // the needs there at the start were seen on the board's first draw
    if (firstView || !fresh.length) return
    const first = fresh[0]!
    const text = fresh.length === 1 ? `${first.id} needs you: ${first.title}` : `${fresh.length} things need you, first ${first.id}: ${first.title}`
    o.editor({ do: 'notify', text, board: { page: 'now' } })
  }

  const onView = (v: PanelView) => {
    view = v
    notifyNew(v)
    firstView = false
    const st = statusOf(v)
    const key = JSON.stringify(st)
    if (key !== status) ((status = key), o.editor(st))
    post({ type: 'view', view: v })
  }

  /** Reads the project's worktrees and hands them to the page. */
  const sendWorktrees = async () => {
    const atMs = Date.now()
    await s()
      .worktrees.list()
      .then(
        list => post({ type: 'worktrees', list, atMs }),
        err => post({ type: 'worktrees', list: [], atMs, error: (err as Error).message }),
      )
  }

  /** Does `action` on worktree `dir`; answers a word for the owner ('' when what happened shows by itself). */
  const worktreeAction = async (dir: string, action: WorktreeAction, file?: string): Promise<string> => {
    const name = basename(dir)
    if (action === 'window') o.editor({ do: 'open-folder', path: dir })
    else if (action === 'terminal') o.editor({ do: 'terminal', cwd: dir, name: `${name} worktree` })
    else if (action === 'reveal') o.editor({ do: 'reveal', path: dir })
    else if (action === 'copy') {
      o.editor({ do: 'copy', text: dir })
      return "Copied the folder's path."
    } else if (action === 'changes') o.editor({ do: 'show-text', name: `${name} changes.diff`, language: 'diff', content: await s().worktrees.diff(dir) })
    else if (action === 'file' && file) {
      const there = await stat(join(dir, file)).then(
        () => true,
        () => false,
      )
      o.editor({ do: 'diff', dir, file, title: `${file} (${name}: its base ↔ now)`, ...(there ? {} : { gone: true }) })
    } else if (action === 'remove') {
      const w = (await s().worktrees.list()).find((x: PanelWorktree) => x.path === dir)
      if (!w) return `${dir} is not one of this project's worktrees any more.`
      const lose = w.dirty ? ` Its ${w.dirty} uncommitted file${w.dirty === 1 ? '' : 's'} will be lost.` : ''
      if (!(await confirm(`Remove the folder ${w.where}?${lose}`, 'Remove', w.branch ? `Its branch ${w.branch} stays, with its commits.` : undefined))) return ''
      const said = await s().worktrees.remove(dir)
      void sendWorktrees()
      return said
    }
    return ''
  }

  /** Opens a file the lead named: in the project, else in the one worker's folder that has it; at its line. */
  const openFile = async (name: string, line?: number) => {
    const full = name.startsWith('~/') ? join(homedir(), name.slice(2)) : isAbsolute(name) ? name : join(o.root, name)
    let found = (await stat(full).catch(() => null)) ? full : undefined
    if (!found && !isAbsolute(name) && !name.startsWith('~/')) {
      const dir = join(o.root, view?.dir ?? '.symcc', 'worktrees')
      const ids = await readdir(dir).catch(() => [] as string[])
      const there = (await Promise.all(ids.map(async id => ((await stat(join(dir, id, name)).catch(() => null)) ? join(dir, id, name) : null)))).filter((x): x is string => !!x)
      if (there.length === 1) found = there[0]
    }
    if (!found) throw new Error(`There's no ${name} in this project.`)
    if ((await stat(found)).isDirectory()) return o.editor({ do: 'open-file', path: found, folder: true })
    o.editor({ do: 'open-file', path: found, ...(line ? { line } : {}) })
  }

  /** Shows agent `agent`'s whole session (what serve saved, else what it has in memory). */
  const openSession = async (agent: string, title: string) => {
    const file = join(o.root, sessionPath(view?.dir ?? '.symcc', agent))
    const saved = await readFile(file, 'utf8').then(readSteps, () => [] as PanelStep[])
    o.editor({ do: 'show-text', name: `${agent}.md`, language: 'markdown', content: sessionMarkdown(title, saved.length ? saved : (steps[agent] ?? [])) })
  }

  const answerOf = async (m: Extract<FromWebview, { id: number }>): Promise<string> => {
    if (m.type === 'proxy') {
      const p = m.proxy.trim()
      setNetwork(null)
      o.editor({ do: 'setting', key: 'proxy', value: p })
      return p ? 'symcc restarts with the new proxy.' : 'symcc restarts without a proxy.'
    }
    if (m.type === 'send') return sendLead(m.text, m.images)
    if (m.type === 'summarize') {
      const said = (await s().lead.summarize()) ?? 'summarizing'
      if (said !== 'summarizing') addChat('note', `${said.charAt(0).toUpperCase()}${said.slice(1)}${/[.!?]$/.test(said) ? '' : '.'}`)
      return ''
    }
    if (m.type === 'answer') return s().answer(m.need, m.text)
    if (m.type === 'mode') {
      if (!MODES.includes(m.mode)) throw new Error(`unknown mode: ${String(m.mode)}`)
      return s().mode(m.mode)
    }
    if (m.type === 'scout') return s().runScout(m.name)
    if (m.type === 'forget') {
      const note = view?.orgMem.notes.find(x => x.n === m.n)
      if (!note) throw new Error(`Note ${m.n} is gone from organizational memory.`)
      return (await confirm(note.ask, 'Delete', note.text)) ? s().forget(note.n, note.key) : ''
    }
    if (m.type === 'command') return s().command(m.name, m.args ?? '')
    if (m.type === 'worktree') return worktreeAction(m.path, m.action, m.file)
    if (m.type === 'act') {
      if (!PANEL_ACTIONS.includes(m.action)) throw new Error(`unknown action: ${String(m.action)}`)
      const act = (words?: string) => s().act(m.task, m.action, words ?? '')
      const text = await act(m.text)
      if (m.action === 'show-changes') {
        o.editor({ do: 'show-text', name: `${m.task} changes.diff`, language: 'diff', content: text })
        return ''
      }
      // Run now on a task that waits on unfinished tasks starts nothing and asks first: "T-5 waits on T-3 (running). Start anyway?"
      const waits = m.action === 'run-now' ? /[^\n]*?Start anyway\?/.exec(text)?.[0] : undefined
      if (waits) return (await confirm(waits, 'Start anyway')) ? act('anyway') : `Nothing started; ${m.task} waits its turn.`
      return text
    }
    return ''
  }

  return {
    async start() {
      chat = (await kept<ChatItem[]>('chat.json')) ?? []
      lead = (await kept<LeadSettings>(leadFile)) ?? { mode: 'agent' }
      steps = { ...steps, ...s().steps() }
      onView(s().view())
      sendAll()
      try {
        s().lead.configure(choice())
      } catch (err) {
        o.log?.(`couldn't set the lead's model: ${(err as Error).message}`)
      }
      void s()
        .models()
        .then(
          list => {
            models = list
            post({ type: 'models', models })
            // a model the account no longer has: the lead goes back to its default
            if (lead.model && models.length && !models.some(m => m.id === lead.model!.id)) setLead({ mode: lead.mode })
          },
          err => o.log?.(`couldn't list the models: ${(err as Error).message}`),
        )
      void s()
        .slash()
        .then(
          items => ((slash = items), post({ type: 'slash', items })),
          () => undefined,
        )
    },
    async fromWebview(m, surface) {
      if (m.type === 'ready') return sendAll(surface)
      if (m.type === 'lead-set') return setLead(m.settings)
      if (m.type === 'lead-stop') return void s().lead.stop().catch(() => undefined)
      if (m.type === 'agents-set') return void (m.agents !== o.agents && o.choices.some(c => c.id === m.agents) && o.editor({ do: 'setting', key: 'agents', value: m.agents }))
      if (m.type === 'session') return void openSession(m.agent, m.title).catch(err => o.log?.(`couldn't read the session: ${(err as Error).message}`))
      if (m.type === 'open-file') return void openFile(m.path, m.line).catch(err => o.editor({ do: 'notify', level: 'warning', text: (err as Error).message }))
      if (m.type === 'worktrees') return void sendWorktrees()
      if (!('id' in m)) return
      const reply = (ok: boolean, text: string) => post({ type: 'reply', id: m.id, ok, text }, surface)
      try {
        reply(true, await answerOf(m))
      } catch (err) {
        reply(false, (err as Error).message)
      }
    },
    confirmed(id, ok) {
      confirms.get(id)?.(ok)
      confirms.delete(id)
    },
    say: text => sendLead(text),
    onLead(e) {
      if (e.type === 'busy') {
        if (e.busy && !busy) turnAtMs = Date.now()
        busy = e.busy
        return post({ type: 'chat', items: chat, busy })
      }
      // the owner's messages are in the chat from when they were sent; symcc's updates aren't shown
      if (e.type === 'message') return
      if (e.type === 'stopped') return addChat('note', 'You stopped the lead.', leadTurn())
      if (e.type === 'summarized') return addChat('note', 'The lead summarized the chat so far to free its memory. The summary is in its session.')
      if (e.type === 'error' && NETWORK_ERROR.test(e.text)) setNetwork({ text: e.text, proxy: o.proxy, service })
      if (e.type === 'answer' && network) setNetwork(null)
      if (e.type === 'answer') return addChat('lead', e.text, leadTurn())
      addChat('error', e.text, leadTurn())
    },
    onView,
    onStep(agent, step) {
      steps = { ...steps, [agent]: addStep(steps[agent] ?? [], step) }
      post({ type: 'step', agent, step })
    },
    onToast: text => o.editor({ do: 'toast', text }),
    onOpen: () => o.editor({ do: 'open-board', quiet: true }),
    idle: () => writing,
  }
}