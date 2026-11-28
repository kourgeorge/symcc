// The board panel, drawn like the workbench around it: VS Code's panel tabs (Now, Board, Worktrees, Scouts, Memory)
// with the project, its counts and the mode switch at their right, and the page under them. Now is the lead's chat in
// the main area and the work beside it as folding views, the way VS Code stacks views in a side bar: what needs the
// owner (each decided in place when opened), what runs, what's next.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AgentChoice, BoardPage, ChatItem, EngineState, LeadSettings, ModelInfo, NetworkProblem, PanelAction, PanelActionId, PanelChecker, PanelFollows, PanelLane, PanelMode, PanelNeed, PanelOrgMem, PanelScout, PanelSize, PanelStep, PanelTask, PanelTimeline, PanelView, SlashItem } from '../../protocol'
import { LEAD_AGENT, addStep } from '../../steps'
import { ask, onMessage, tell } from './bridge'
import { LeadChat, useDismiss } from './chat'
import { Icon, IdleNote, Mark, Markdown, STATION_WORD, ago, duration, tokensWord, useNow } from './parts'
import { TaskSession, latestStep, openSession, stepIcon, stepWords } from './session'
import { Badge, Button, Collapsible, TabHeader, TabPanel, Tabs, Textarea, Textfield, focusMe, valueOf } from './ui'
import { Worktrees, type WorktreeList } from './worktrees'

type Page = BoardPage
type Notice = { text: string; bad: boolean; at: number }
export type Say = (text: string, bad?: boolean) => void
export type Steps = Record<string, PanelStep[]>
/** The lead chat's model and mode, the account's models, the slash commands, and whose agents run. */
type Lead = { settings: LeadSettings; models: ModelInfo[]; slash: SlashItem[]; agents: { list: AgentChoice[]; current: string } }

/** The words of the board's empty list (hooks/core/panel.ts ALL_CLEAR). */
const ALL_CLEAR = ['All clear. Nothing running or waiting.', 'Tell the lead what you want next.'] as const

/** What serve and the extension send, kept as it comes: the board, the lead's chat, serve's state, every agent's steps. */
export function useSymcc(onGo?: (page: Page, task?: string) => void) {
  const [view, setView] = useState<PanelView | null>(null)
  const [chat, setChat] = useState<ChatItem[]>([])
  const [busy, setBusy] = useState(false)
  const [engine, setEngine] = useState<EngineState>({ state: 'starting' })
  const [network, setNetwork] = useState<NetworkProblem | null>(null)
  const [steps, setSteps] = useState<Steps>({})
  const [lead, setLead] = useState<Lead>({ settings: { mode: 'agent' }, models: [], slash: [], agents: { list: [], current: '' } })
  const [trees, setTrees] = useState<WorktreeList | null>(null)
  const go = useRef(onGo)
  go.current = onGo

  useEffect(() => {
    const off = onMessage(m => {
      if (m.type === 'view') setView(m.view)
      else if (m.type === 'chat') (setChat(m.items), setBusy(m.busy))
      else if (m.type === 'engine') setEngine(m.engine)
      else if (m.type === 'network') setNetwork(m.problem)
      else if (m.type === 'steps') setSteps(m.all)
      else if (m.type === 'step') setSteps(s => ({ ...s, [m.agent]: addStep(s[m.agent] ?? [], m.step) }))
      else if (m.type === 'lead') setLead(l => ({ ...l, settings: m.settings }))
      else if (m.type === 'models') setLead(l => ({ ...l, models: m.models }))
      else if (m.type === 'slash') setLead(l => ({ ...l, slash: m.items }))
      else if (m.type === 'agents') setLead(l => ({ ...l, agents: { list: m.list, current: m.current } }))
      else if (m.type === 'worktrees') setTrees({ list: m.list, atMs: m.atMs, ...(m.error ? { error: m.error } : {}) })
      else if (m.type === 'go') go.current?.(m.page, m.task)
    })
    tell({ type: 'ready' })
    return off
  }, [])
  return { view, chat, busy, engine, network, steps, lead, trees }
}

/** A short line that says how an action went, gone after a few seconds (an error stays longer). */
export function useNotice(): [Notice | null, Say] {
  const [notice, setNotice] = useState<Notice | null>(null)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(n => (n === notice ? null : n)), notice.bad ? 9000 : 5000)
    return () => clearTimeout(t)
  }, [notice])
  const say: Say = useCallback((text, bad = false) => setNotice({ text: text.replace(/^symcc: /, ''), bad, at: Date.now() }), [])
  return [notice, say]
}

/** How an action went, as a notification in the corner like the editor's own. */
export function NoticeLine({ notice }: { notice: Notice | null }) {
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {notice && (
        <p className={`toast${notice.bad ? ' bad' : ''}`}>
          <Icon name={notice.bad ? 'error' : 'info'} />
          <span>{notice.text}</span>
        </p>
      )}
    </div>
  )
}

const PAGES: { page: Page; word: string }[] = [
  { page: 'now', word: 'Now' },
  { page: 'board', word: 'Board' },
  { page: 'trees', word: 'Worktrees' },
  { page: 'scouts', word: 'Scouts' },
  { page: 'memory', word: 'Memory' },
]

export function App() {
  const [page, setPage] = useState<Page>('now')
  const [focus, setFocus] = useState<string | null>(null)
  const { view, chat, busy, engine, network, steps, lead, trees } = useSymcc((p, task) => (setPage(p), task && setFocus(task)))
  const [notice, say] = useNotice()
  const openTask = useCallback((id: string) => (setPage('board'), setFocus(id)), [])
  const needs = view?.counts.needs ?? 0
  const at = Math.max(0, PAGES.findIndex(p => p.page === page))

  const body = (p: Page): ReactNode =>
    !view ? null : p === 'now' ? (
      <Now view={view} chat={chat} busy={busy} steps={steps} lead={lead} ready={engine.state === 'ready'} onSay={say} onTask={openTask} onPage={setPage} />
    ) : p === 'board' ? (
      <Board view={view} steps={steps} focus={focus} onSay={say} onTask={openTask} />
    ) : p === 'trees' ? (
      <Worktrees view={view} steps={steps} trees={trees} onSay={say} onTask={openTask} />
    ) : p === 'scouts' ? (
      <Scouts scouts={view.scouts} onSay={say} />
    ) : (
      <Memory mem={view.orgMem} onSay={say} />
    )

  return (
    <div className="app">
      {engine.state !== 'ready' && !view ? (
        <EngineScreen engine={engine} />
      ) : view && !view.on ? (
        <OffScreen view={view} onSay={say} />
      ) : view ? (
        <Tabs panel selectedIndex={at} onVscTabsSelect={e => setPage(PAGES[e.detail.selectedIndex]?.page ?? 'now')} className="pages">
          {PAGES.map(p => (
            <TabHeader key={p.page} slot="header" panel>
              {p.word}
              {p.page === 'now' && !!needs && (
                <Badge variant="tab-header-counter" title={`${needs} need${needs === 1 ? 's' : ''} you`}>
                  {needs}
                </Badge>
              )}
            </TabHeader>
          ))}
          <div slot="addons" className="tab-addons">
            <Header view={view} onSay={say} />
          </div>
          {PAGES.map(p => (
            <TabPanel key={p.page} panel className="page-panel">
              {p.page === page && (
                <>
                  <Banners view={view} network={network} onSay={say} />
                  {body(p.page)}
                </>
              )}
            </TabPanel>
          ))}
        </Tabs>
      ) : (
        <EngineScreen engine={{ state: 'starting' }} />
      )}
      <NoticeLine notice={notice} />
    </div>
  )
}

function Header({ view, onSay }: { view: PanelView; onSay: Say }) {
  const c = view.counts
  return (
    <div className="head">
      <span className="head-project" title={view.branch ? `New tasks merge into ${view.branch}` : undefined}>
        <b>{view.project}</b>
        {view.branch && (
          <span className="dim">
            <Icon name="git-branch" />
            {view.branch}
          </span>
        )}
      </span>
      <span className="head-counts dim">
        {c.running} running · {c.next} up next · {c.doneToday} done today
      </span>
      <ModeMenu view={view} onSay={onSay} />
    </div>
  )
}

/** What the owner should know before anything else on the page: another window drives, a setup note, no network. */
export function Banners({ view, network, onSay }: { view: PanelView | null; network: NetworkProblem | null; onSay: Say }) {
  return (
    <>
      {network && <NetworkCard key={network.text + network.proxy} problem={network} onSay={onSay} />}
      {view?.follows && <DriveNotice follows={view.follows} onSay={onSay} />}
      {view?.note && (
        <div className="banner" role="status">
          <Icon name="warning" />
          <p>{view.note}</p>
        </div>
      )}
    </>
  )
}

/** Another window drives the board: the board's notice, its slash command and the Drive here button both make this window drive. */
export function DriveNotice({ follows, onSay }: { follows: PanelFollows; onSay: Say }) {
  const [busy, setBusy] = useState(false)
  const drive = () => {
    setBusy(true)
    ask({ type: 'command', name: follows.command })
      .then(t => t && onSay(t), (e: Error) => onSay(e.message, true))
      .finally(() => setBusy(false))
  }
  return (
    <div className="banner" role="status">
      <Icon name="warning" />
      <p>
        {follows.parts.map((p, i) =>
          p.command ? (
            <button key={i} type="button" className="link" disabled={busy} onClick={drive}>
              {p.text}
            </button>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
      <Button disabled={busy} onClick={drive} {...(busy ? { icon: 'loading', iconSpin: true } : {})}>
        {follows.button}
      </Button>
    </div>
  )
}

const MODE_ICON: Record<PanelMode, string> = { paused: 'debug-pause', review: 'eye', auto: 'rocket' }
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const tasks = (n: number) => `${n} task${n === 1 ? '' : 's'}`

/** What switching the board from its mode to `to` does, said before it happens. */
function modeEffect(view: PanelView, to: PanelMode): string {
  const running = view.counts.running
  const into = view.branch ? ` into ${view.branch}` : ''
  if (to === 'paused')
    return running
      ? `The ${running === 1 ? 'agent' : `${running} agents`} working now stop${running === 1 ? 's' : ''} at once, and ${running === 1 ? 'its task goes' : 'their tasks go'} back to Up next. Nothing new starts until you switch back. You can still approve or reject what waits for review.`
      : 'Nothing new starts until you switch back. You can still approve or reject what waits for review.'
  const starts = view.mode === 'paused' && view.counts.next ? `Work starts: up to ${view.maxParallel || 1} of the ${tasks(view.counts.next)} up next begin at once. ` : ''
  if (to === 'review') return `${starts}Finished tasks wait for you to approve or reject them before they merge${into}.`
  return `${starts}Finished tasks that pass their checks merge${into} on their own, without your review.`
}

/** The board's mode: a dropdown of the three modes; a change is said and confirmed before it happens. */
export function ModeMenu({ view, onSay }: { view: PanelView; onSay: Say }) {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<PanelMode | null>(null)
  const [saving, setSaving] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = view.modes.find(m => m.mode === view.mode)
  const close = useCallback(() => (setOpen(false), setPick(null)), [])
  useDismiss(open, box, close)
  const confirm = () => {
    if (!pick) return
    setSaving(true)
    ask({ type: 'mode', mode: pick })
      .then(t => (onSay(t), close()), (e: Error) => onSay(e.message, true))
      .finally(() => setSaving(false))
  }
  const chosen = view.modes.find(m => m.mode === pick)
  return (
    <div className="mode" ref={box}>
      <button type="button" className="dropdown" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} title={current ? `${sentence(current.name)}: ${current.meaning}` : undefined}>
        <Icon name={MODE_ICON[view.mode]} />
        <span>{sentence(current?.name ?? view.mode)}</span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="menu down" role="dialog" aria-label="Board mode">
          {!chosen ? (
            <>
              <p className="menu-group">How the board runs</p>
              <ul className="menu-list">
                {view.modes.map(m => (
                  <li key={m.mode}>
                    <button type="button" className="menu-item" aria-current={m.mode === view.mode || undefined} disabled={m.mode === view.mode} onClick={() => setPick(m.mode)}>
                      <Icon name={MODE_ICON[m.mode]} />
                      <span>
                        <b>{sentence(m.name)}</b>
                        <small>{sentence(m.meaning)}.</small>
                      </span>
                      {m.mode === view.mode && <Icon name="check" />}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="menu-confirm">
              <p className="menu-title">
                <Icon name={MODE_ICON[chosen.mode]} /> Switch to {chosen.name}?
              </p>
              <p>{modeEffect(view, chosen.mode)}</p>
              <div className="actions">
                <Button disabled={saving} onClick={confirm} {...(saving ? { icon: 'loading', iconSpin: true } : {})}>
                  {chosen.mode === 'paused' ? 'Pause the board' : `Switch to ${chosen.name}`}
                </Button>
                <Button secondary disabled={saving} onClick={() => setPick(null)} ref={focusMe}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The engine can't reach Cursor's servers: what failed, and a place to give it the proxy. */
export function NetworkCard({ problem, onSay }: { problem: NetworkProblem; onSay: Say }) {
  const [text, setText] = useState(problem.proxy)
  const [saving, setSaving] = useState(false)
  const save = () => {
    setSaving(true)
    ask({ type: 'proxy', proxy: text })
      .then(t => onSay(t), (err: Error) => onSay(err.message, true))
      .finally(() => setSaving(false))
  }
  return (
    <div className="banner bad network" role="alert">
      <Icon name="error" />
      <div className="banner-body">
        <p>
          <b>symcc can't reach {problem.service}.</b> {problem.text}
        </p>
        <p className="dim">
          {problem.proxy ? `It ran through the proxy ${problem.proxy.replace(/\/\/[^@/]*@/, '//***@')}.` : 'It ran with no proxy.'} The lead and the workers need {problem.service}'s servers. On a network that needs a proxy, enter it here; symcc restarts with it. In a terminal, <code>echo $HTTPS_PROXY</code> shows the one your shell uses.
        </p>
        <div className="field-row">
          <Textfield aria-label="Proxy" placeholder="http://proxy.example.com:912" value={text} disabled={saving} onInput={e => setText(valueOf(e))} onKeyDown={e => e.key === 'Enter' && save()} />
          <Button disabled={saving} onClick={save} {...(saving ? { icon: 'loading', iconSpin: true } : {})}>
            Use and restart
          </Button>
          <Button secondary onClick={() => tell({ type: 'log' })}>
            Open the log
          </Button>
        </div>
      </div>
    </div>
  )
}

export function EngineScreen({ engine }: { engine: EngineState }) {
  if (engine.state === 'failed' || engine.state === 'stopped')
    return (
      <section className="welcome">
        <Mark size={40} />
        <h2>{engine.state === 'failed' ? 'symcc stopped' : 'symcc is not running'}</h2>
        <p>{engine.text ?? 'The engine is not running in this window.'} Its log is under “symcc: Show the log” in the command palette.</p>
        <Button icon="debug-restart" onClick={() => tell({ type: 'restart' })}>
          Start symcc again
        </Button>
      </section>
    )
  return (
    <section className="welcome" aria-busy="true">
      <p className="dim">
        <Icon name="loading" /> Starting symcc…
      </p>
    </section>
  )
}

export function OffScreen({ view, onSay }: { view: PanelView; onSay: Say }) {
  const [busy, setBusy] = useState(false)
  const setUp = () => {
    setBusy(true)
    ask({ type: 'command', name: 'symcc-init' })
      .then(t => onSay(t.split('\n')[0] ?? t), (e: Error) => onSay(e.message, true))
      .finally(() => setBusy(false))
  }
  return (
    <section className="welcome">
      <Mark size={40} />
      <h2>Set up symcc in {view.project}</h2>
      <p>{view.off}</p>
      <p className="dim">symcc keeps its board in .symcc/ in this project. You tell the lead what you want; it plans tasks, and workers do each one in its own git worktree. You decide what merges.</p>
      <Button disabled={busy} onClick={setUp} icon={busy ? 'loading' : 'play'} iconSpin={busy}>
        Set up symcc here
      </Button>
    </section>
  )
}

/* ---------- Now: the chat, and the work beside it ---------- */

const STACKED = '(max-width: 720px)'

/** Whether the page is narrow enough that the views stack above the chat (styles.css's same media query). */
function useStacked() {
  const [on, setOn] = useState(() => matchMedia(STACKED).matches)
  useEffect(() => {
    const q = matchMedia(STACKED)
    const change = () => setOn(q.matches)
    q.addEventListener('change', change)
    return () => q.removeEventListener('change', change)
  }, [])
  return on
}

function Now({ view, chat, busy, steps, lead, ready, onSay, onTask, onPage }: { view: PanelView; chat: ChatItem[]; busy: boolean; steps: Steps; lead: Lead; ready: boolean; onSay: Say; onTask: (id: string) => void; onPage: (p: Page) => void }) {
  const stacked = useStacked()
  return (
    <div className="now">
      <section className="now-chat" aria-label="The lead">
        <LeadChat chat={chat} news={view.news} lanes={view.lanes} busy={busy} lead={steps[LEAD_AGENT] ?? []} ready={ready} settings={lead.settings} models={lead.models} slash={lead.slash} agents={lead.agents} onSay={onSay} onTask={onTask} />
      </section>
      <aside className="now-views" aria-label="The work">
        <WorkViews view={view} steps={steps} onSay={onSay} onTask={onTask} onMemory={() => onPage('memory')} stacked={stacked} />
      </aside>
    </div>
  )
}

const NEXT_SHOWN = 8

/**
 * The work as folding views, like a side bar's: what needs the owner (each opens to be decided in place), what runs
 * with what its agent does now, and what's next; the merged, the backlog and org-mem folded below. `lead` goes
 * after Needs you (the sidebar's lead). `stacked` (the views above the chat on a narrow page) folds Running and Up next
 * to their headers and counts.
 */
export function WorkViews({ view, steps, onSay, onTask, onMemory, lead, compact = false, stacked = false }: { view: PanelView; steps: Steps; onSay: Say; onTask: (id: string) => void; onMemory?: () => void; lead?: ReactNode; compact?: boolean; stacked?: boolean }) {
  const running = view.lanes.filter(l => l.doneMs === undefined && l.stations[l.at] !== 'you')
  const merged = view.lanes.filter(l => l.doneMs !== undefined)
  const next = view.next.slice(0, compact ? 4 : NEXT_SHOWN)
  const backlog = view.tasks.filter(t => t.status === 'backlog')
  return (
    <div className="views">
      <Collapsible heading="Needs you" open className="view is-needs">
        {!!view.needs.length && (
          <Badge slot="decorations" variant="activity-bar-counter">
            {view.needs.length}
          </Badge>
        )}
        {view.needs.length ? (
          <ul className="rows">
            {view.needs.map((n, i) => (
              <NeedItem key={n.id} need={n} task={view.tasks.find(t => t.id === n.id)} first={i === 0} onSay={onSay} onTask={onTask} />
            ))}
          </ul>
        ) : (
          <p className="empty">
            <Icon name="pass" /> Nothing needs you.
          </p>
        )}
      </Collapsible>
      {lead}
      <Collapsible heading="Running" open={!stacked} className="view">
        {!!view.counts.running && (
          <Badge slot="decorations" variant="counter">
            {view.counts.running}
          </Badge>
        )}
        {running.length ? (
          <ul className="rows">
            {running.map(l => (
              <LaneRow key={l.id} lane={l} step={l.agentId ? latestStep(steps[l.agentId]) : undefined} task={view.tasks.find(t => t.id === l.id)} onSay={onSay} onTask={onTask} />
            ))}
          </ul>
        ) : (
          <IdleNote idle={view.idle} onTask={onTask} compact={compact} />
        )}
      </Collapsible>
      <Collapsible heading="Up next" open={!stacked} className="view">
        {!!view.counts.next && (
          <Badge slot="decorations" variant="counter">
            {view.counts.next}
          </Badge>
        )}
        {next.length ? (
          <ul className="rows">
            {next.map(t => (
              <li key={t.id}>
                <button type="button" className="row" onClick={() => onTask(t.id)} title={`${t.id} ${t.title}`}>
                  <Icon name="circle-large-outline" />
                  <span className="id">{t.id}</span>
                  <span className="title">{t.title}</span>
                </button>
              </li>
            ))}
            {view.next.length > next.length && (
              <li>
                <button type="button" className="row more" onClick={() => onTask(view.next[next.length]!.id)}>
                  and {view.next.length - next.length} more on the board
                </button>
              </li>
            )}
          </ul>
        ) : (
          <p className="empty">Nothing waits to start.</p>
        )}
      </Collapsible>
      {!compact && !!merged.length && (
        <Collapsible heading="Just merged" className="view">
          <Badge slot="decorations" variant="counter">
            {merged.length}
          </Badge>
          <ul className="rows">
            {merged.map(l => (
              <LaneRow key={l.id} lane={l} onSay={onSay} onTask={onTask} />
            ))}
          </ul>
        </Collapsible>
      )}
      {!compact && !!view.counts.backlog && (
        <Collapsible heading="Backlog" className="view">
          <Badge slot="decorations" variant="counter">
            {view.counts.backlog}
          </Badge>
          <ul className="rows">
            {backlog.slice(0, NEXT_SHOWN).map(t => (
              <li key={t.id}>
                <button type="button" className="row" onClick={() => onTask(t.id)} title={`${t.id} ${t.title}`}>
                  <Icon name="archive" />
                  <span className="id">{t.id}</span>
                  <span className="title">{t.title}</span>
                  {t.kind && <span className="row-end">{t.kind}</span>}
                </button>
              </li>
            ))}
            {backlog.length > NEXT_SHOWN && <li className="empty">and {backlog.length - NEXT_SHOWN} more on the board</li>}
            {!backlog.length && <li className="empty">They show on the board.</li>}
          </ul>
        </Collapsible>
      )}
      {!compact && onMemory && (
        <Collapsible heading="Organizational memory" className="view" description={`${view.orgMem.notes.length} / ${view.orgMem.max}`}>
          <ul className="rows">
            <li>
              <button type="button" className="row" onClick={onMemory}>
                <Icon name="book" />
                <span className="title">{view.orgMem.notes.length ? 'All notes' : view.orgMem.empty}</span>
              </button>
            </li>
          </ul>
        </Collapsible>
      )}
    </div>
  )
}

const NEED_ICON: Record<PanelNeed['kind'], string> = { question: 'comment-discussion', asks: 'question', files: 'file-add', time: 'watch', review: 'git-pull-request', answer: 'book', failed: 'error' }

/** One thing that needs the owner: a row that opens to decide it in place (the first one opens by itself). */
export function NeedItem({ need, task, first = false, onSay, onTask }: { need: PanelNeed; task?: PanelTask; first?: boolean; onSay: Say; onTask: (id: string) => void }) {
  const now = useNow(30_000)
  const [open, setOpen] = useState(first)
  return (
    <li className={`need is-${need.kind}${open ? ' open' : ''}`}>
      <button type="button" className="row" aria-expanded={open} onClick={() => setOpen(o => !o)} title={need.title}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <Icon name={NEED_ICON[need.kind]} />
        <span className="title">{need.title}</span>
        <span className="row-end">
          {need.id}
          {need.sinceMs !== undefined && ` · ${ago(need.sinceMs, now)}`}
        </span>
      </button>
      {open && <NeedBody need={need} task={task} onSay={onSay} onTask={onTask} />}
    </li>
  )
}

function NeedBody({ need, task: of, onSay, onTask }: { need: PanelNeed; task?: PanelTask; onSay: Say; onTask: (id: string) => void }) {
  const [box, setBox] = useState<{ action?: PanelAction; hint: string } | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [nudge, setNudge] = useState(false)

  const run = (label: string, p: Promise<string>) => {
    setSending(label)
    p.then(
      t => (t && onSay(t), setBox(null), setText('')),
      (e: Error) => onSay(e.message, true),
    ).finally(() => setSending(null))
  }
  const answer = (words: string) => run(words, ask({ type: 'answer', need: need.id, text: words }))
  const act = (a: PanelAction, words = '') => run(a.label, ask({ type: 'act', task: need.id, action: a.id, ...(words ? { text: words } : {}) }))
  const press = (a: PanelAction) => (a.ask ? setBox({ action: a, hint: a.ask }) : act(a))
  const submit = () => {
    const words = text.trim()
    if (box?.action) return box.action.id === 'drop' || words ? act(box.action, words) : undefined
    if (words) answer(words)
    else setNudge(true)
  }
  const choices = need.choices.filter(c => c !== 'Answer…')
  const ownAnswer = need.choices.includes('Answer…') || (!need.choices.length && !need.actions.length)
  const isTask = /^T-\d+$/.test(need.id)
  const spin = (label: string) => (sending === label ? { icon: 'loading', iconSpin: true } : {})

  return (
    <div className="need-body" aria-busy={!!sending}>
      <p className="meta">
        {isTask ? (
          <button type="button" className="task-ref" onClick={() => onTask(need.id)}>
            {need.id}
          </button>
        ) : (
          <span className="id">{need.id}</span>
        )}
        <span>{need.meta.replace(`${need.id} · `, '')}</span>
        {of?.sessions[0] && (
          <button type="button" className="link" onClick={() => openSession(of, of.sessions[0]!)}>
            What the agent did
          </button>
        )}
      </p>
      {need.text && <p className={`need-text${need.kind === 'failed' ? ' bad' : ''}`}>{need.text}</p>}
      {need.files && need.files.length > 1 && (
        <ul className="files">
          {need.files.slice(0, 3).map(f => (
            <li key={f.file}>
              <span className="file">{f.file}</span>
              <span className="add">+{f.added}</span>
              <span className="del">−{f.removed}</span>
            </li>
          ))}
          {need.files.length > 3 && <li className="dim">and {need.files.length - 3} more</li>}
        </ul>
      )}
      {box ? (
        <div className="need-box">
          <Textarea aria-label={box.hint} rows={2} placeholder={box.hint} value={text} ref={focusMe} onInput={e => setText(valueOf(e))} onKeyDown={e => (e.key === 'Escape' ? setBox(null) : e.key === 'Enter' && (e.metaKey || e.ctrlKey) && submit())} />
          <div className="actions">
            <Button disabled={!!sending || (!text.trim() && box.action?.id !== 'drop')} onClick={submit} {...(sending ? { icon: 'loading', iconSpin: true } : {})}>
              {box.action ? box.action.label.replace('…', '') : 'Send answer'}
            </Button>
            <Button secondary onClick={() => setBox(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        (!!choices.length || !!need.actions.length) && (
          <div className="actions">
            {need.actions.map(a => (
              <Button key={a.id} secondary={!a.primary} disabled={!!sending} onClick={() => press(a)} {...spin(a.label)}>
                {a.label}
              </Button>
            ))}
            {choices.map(c => (
              <Button key={c} secondary disabled={!!sending} onClick={() => answer(c)} {...spin(c)}>
                {c}
              </Button>
            ))}
          </div>
        )
      )}
      {ownAnswer && !box && (
        <div className="field-row">
          <Textfield
            aria-label="Your answer"
            invalid={nudge}
            placeholder={nudge ? 'Type your answer here first' : choices.length ? 'Or write your own answer' : 'Write your answer'}
            value={text}
            disabled={!!sending}
            onInput={e => (setText(valueOf(e)), setNudge(false))}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          <Button disabled={!!sending} onClick={submit} {...(sending && !choices.includes(sending) ? { icon: 'loading', iconSpin: true } : {})}>
            Answer
          </Button>
        </div>
      )}
    </div>
  )
}

const LANE_ICON: Partial<Record<string, string>> = { queue: 'clock', tests: 'beaker', you: 'bell-dot' }

/**
 * A running or just merged task as one row: where it is and for how long, and under it what its agent does now. A
 * running one always shows the board's own Pause and Drop (the engine stops its worker either way); Drop asks first.
 */
export function LaneRow({ lane, step, task, onSay, onTask }: { lane: PanelLane; step?: PanelStep; task?: PanelTask; onSay: Say; onTask: (id: string) => void }) {
  const now = useNow(1000)
  const [confirm, setConfirm] = useState(false)
  const [why, setWhy] = useState('')
  const [sending, setSending] = useState<PanelActionId | null>(null)
  const station = lane.stations[lane.at]
  const done = lane.doneMs !== undefined
  const what = done ? (ago(lane.doneMs, now) === 'now' ? 'just now' : `${ago(lane.doneMs, now)} ago`) : station === 'you' ? 'waits for you' : `${STATION_WORD[station!]}${lane.sinceMs !== undefined ? ` ${duration(now - lane.sinceMs)}` : ''}`
  const facts = [lane.tries > 1 ? `try ${lane.tryNo} of ${lane.tries}` : '', lane.tokens ? `${tokensWord(lane.tokens)} tokens` : ''].filter(Boolean).join(' · ')
  const pause = done ? undefined : task?.actions.find(a => a.id === 'pause')
  const drop = done ? undefined : task?.actions.find(a => a.id === 'drop')
  const act = (a: PanelAction, words = '') => {
    setSending(a.id)
    ask({ type: 'act', task: lane.id, action: a.id, ...(words ? { text: words } : {}) })
      .then(t => (t && onSay(t), setConfirm(false), setWhy('')), (e: Error) => onSay(e.message, true))
      .finally(() => setSending(null))
  }
  return (
    <li className={`lane${done ? ' merged' : ''}`}>
      <div className="row-line">
        <button type="button" className="row" onClick={() => onTask(lane.id)} title={`${lane.id} ${lane.title}${facts ? ` · ${facts}` : ''}`}>
          <Icon name={done ? 'git-merge' : lane.agent ? 'loading' : (LANE_ICON[station!] ?? 'circle-large-outline')} />
          <span className="id">{lane.id}</span>
          <span className="title">{lane.title}</span>
          <span className="row-end">{what}</span>
        </button>
        {(pause || drop) && (
          <span className="row-actions">
            {pause && (
              <button type="button" className="icon-btn" title={`Pause ${lane.id}: its worker stops, and Resume starts it again`} aria-label={`Pause ${lane.id}`} disabled={!!sending} onClick={() => act(pause)}>
                <Icon name={sending === 'pause' ? 'loading' : 'debug-pause'} />
              </button>
            )}
            {drop && (
              <button type="button" className="icon-btn" title={`Stop ${lane.id} and drop it`} aria-label={`Stop and drop ${lane.id}`} aria-expanded={confirm} disabled={!!sending} onClick={() => setConfirm(c => !c)}>
                <Icon name="debug-stop" />
              </button>
            )}
          </span>
        )}
      </div>
      {step && !done && (
        <p className="row-sub" title={stepWords(step)}>
          <Icon name={stepIcon(step)} />
          <span>{stepWords(step)}</span>
        </p>
      )}
      {confirm && drop && (
        <div className="row-confirm">
          <p>
            Stop {lane.id} and drop it? Its worker stops now and the task leaves the board.
          </p>
          <Textfield aria-label={drop.ask ?? 'Why (optional)'} placeholder={drop.ask ?? 'Why (optional)'} value={why} ref={focusMe} onInput={e => setWhy(valueOf(e))} onKeyDown={e => (e.key === 'Enter' ? act(drop, why.trim()) : e.key === 'Escape' && setConfirm(false))} />
          <div className="actions">
            <Button disabled={!!sending} onClick={() => act(drop, why.trim())} {...(sending === 'drop' ? { icon: 'loading', iconSpin: true } : {})}>
              Drop it
            </Button>
            <Button secondary onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {done && lane.size && (
        <p className="row-sub">
          <Size size={lane.size} />
          {facts && <span className="dim"> · {facts}</span>}
        </p>
      )}
    </li>
  )
}

/** A change's size in the board's words, its added lines green and its removed lines red. */
export function Size({ size }: { size: PanelSize }) {
  return (
    <span className="size">
      {size.map((p, i) => (
        <span key={i} className={p.tone === 'added' ? 'add' : p.tone === 'removed' ? 'del' : undefined}>
          {p.text}
        </span>
      ))}
    </span>
  )
}

/* ---------- Board: every task, grouped ---------- */

const GROUPS: { key: string; title: string; has: (t: PanelTask) => boolean; open: boolean }[] = [
  { key: 'needs', title: 'Needs you', has: t => t.needsYou, open: true },
  { key: 'running', title: 'Running', has: t => !t.needsYou && t.status === 'doing', open: true },
  { key: 'next', title: 'Up next', has: t => !t.needsYou && t.status === 'todo', open: true },
  { key: 'paused', title: 'Paused and waiting', has: t => !t.needsYou && (t.status === 'paused' || t.status === 'waiting' || t.status === 'review'), open: true },
  { key: 'backlog', title: 'Backlog', has: t => t.status === 'backlog', open: false },
  { key: 'done', title: 'Done today', has: t => t.status === 'done', open: false },
  { key: 'dropped', title: 'Dropped', has: t => !t.needsYou && (t.status === 'dropped' || t.status === 'failed'), open: false },
]

function Board({ view, steps, focus, onSay, onTask }: { view: PanelView; steps: Steps; focus: string | null; onSay: Say; onTask: (id: string) => void }) {
  const [filter, setFilter] = useState('')
  const f = filter.trim().toLowerCase()
  const tasks = f ? view.tasks.filter(t => `${t.id} ${t.title} ${t.kind} ${t.role}`.toLowerCase().includes(f)) : view.tasks
  return (
    <div className="page board">
      <div className="toolbar">
        <Textfield type="search" aria-label="Filter tasks" placeholder="Filter by id, title, task type or role" value={filter} onInput={e => setFilter(valueOf(e))}>
          <span slot="content-before" className="codicon codicon-search" aria-hidden />
        </Textfield>
        <span className="dim">{f ? `${tasks.length} of ${view.tasks.length}` : tasks.length === 1 ? '1 task' : `${tasks.length} tasks`}</span>
      </div>
      {!tasks.length && <p className="empty">{f ? `No task matches “${filter}”.` : ALL_CLEAR.join(' ')}</p>}
      {GROUPS.map(g => {
        const xs = tasks.filter(g.has)
        if (!xs.length) return null
        const open = g.open || !!f || xs.some(t => t.id === focus)
        return (
          <Collapsible key={`${g.key}-${open}`} heading={g.title} open={open} className={`view is-${g.key}`}>
            <Badge slot="decorations" variant={g.key === 'needs' ? 'activity-bar-counter' : 'counter'}>
              {xs.length}
            </Badge>
            <ul className="rows">
              {xs.map(t => (
                <TaskRow key={t.id} task={t} steps={steps} focused={t.id === focus} onSay={onSay} onTask={onTask} />
              ))}
            </ul>
          </Collapsible>
        )
      })}
    </div>
  )
}

const STATUS_ICON: Record<PanelTask['status'], string> = { backlog: 'archive', todo: 'circle-large-outline', doing: 'loading', paused: 'debug-pause', waiting: 'bell-dot', review: 'git-pull-request', failed: 'error', done: 'pass', dropped: 'circle-slash' }

function TaskRow({ task, steps, focused, onSay, onTask }: { task: PanelTask; steps: Steps; focused: boolean; onSay: Say; onTask: (id: string) => void }) {
  const [open, setOpen] = useState(focused)
  const [box, setBox] = useState<PanelAction | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const li = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (!focused) return
    setOpen(true)
    li.current?.scrollIntoView({ block: 'center' })
    li.current?.querySelector('button')?.focus()
  }, [focused])
  const act = (a: PanelAction, words = '') => {
    setSending(a.label)
    ask({ type: 'act', task: task.id, action: a.id, ...(words ? { text: words } : {}) })
      .then(t => (t && onSay(t), setBox(null), setText('')), (e: Error) => onSay(e.message, true))
      .finally(() => setSending(null))
  }
  return (
    <li ref={li} className={`task is-${task.status}${task.needsYou ? ' needs' : ''}${open ? ' open' : ''}${focused ? ' focused' : ''}`}>
      <button type="button" className="row" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <Icon name={STATUS_ICON[task.status]} />
        <span className="id">{task.id}</span>
        <span className="title">{task.title}</span>
        {task.kind && <span className="tag">{task.kind}</span>}
        <span className="row-end">{task.word}</span>
      </button>
      {open && (
        <div className="task-body">
          <p className="facts">
            <span>role {task.role}</span>
            {task.attempts > 0 && <span>{task.attempts === 1 ? '1 try' : `${task.attempts} tries`}</span>}
            {task.size && <Size size={task.size} />}
          </p>
          {task.done && (
            <div className="part">
              <h4>Done</h4>
              <Markdown text={task.done} onTask={onTask} />
            </div>
          )}
          {task.note && <p className="task-note">{task.note}</p>}
          {task.details && (
            <div className="part details">
              <Markdown text={task.details} onTask={onTask} />
            </div>
          )}
          {!!task.timeline?.length && <TaskTimeline task={task} />}
          {task.checker && <CheckerReport checker={task.checker} onTask={onTask} />}
          <TaskSession task={task} steps={steps} />
          {box ? (
            <div className="need-box">
              <Textarea aria-label={box.ask} rows={2} placeholder={box.ask} value={text} ref={focusMe} onInput={e => setText(valueOf(e))} onKeyDown={e => e.key === 'Escape' && setBox(null)} />
              <div className="actions">
                <Button disabled={!!sending || (!text.trim() && box.id !== 'drop')} onClick={() => (text.trim() || box.id === 'drop') && act(box, text.trim())}>
                  {box.label.replace('…', '')}
                </Button>
                <Button secondary onClick={() => setBox(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            !!task.actions.length && (
              <div className="actions">
                {task.actions.map(a => (
                  <Button key={a.id} secondary={!a.primary} disabled={!!sending} onClick={() => (a.ask ? setBox(a) : act(a))} {...(sending === a.label ? { icon: 'loading', iconSpin: true } : {})}>
                    {a.label}
                  </Button>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </li>
  )
}

const TIMELINE_ICON: Record<PanelTimeline['tone'], string> = { good: 'check', bad: 'close', step: 'circle-small-filled', other: 'circle-small' }

/** A task's timeline, newest first: each line's mark in its tone, when, who wrote it, its try, what was said and the try's result. */
function TaskTimeline({ task }: { task: PanelTask }) {
  const lines = task.timeline ?? []
  const older = (task.timelineCount ?? lines.length) - lines.length
  return (
    <details className="fold-box">
      <summary>
        <Icon name="chevron-right" /> Timeline <span className="dim">{task.timelineCount ?? lines.length}</span>
      </summary>
      <ol className="timeline">
        {lines.map((h, i) => (
          <li key={i} className={`is-${h.tone}`}>
            <span className="timeline-mark">
              <Icon name={TIMELINE_ICON[h.tone]} />
            </span>
            <span>
              {h.at && <span className="dim">{h.at} </span>}
              {h.by && <span className="dim">{h.by}: </span>}
              {h.label && <b>{h.label}: </b>}
              <span className={h.tone === 'bad' && !h.result ? 'bad' : 'dim'}>{h.said}</span>
              {h.result && <span> → {h.result}</span>}
            </span>
          </li>
        ))}
      </ol>
      {older > 0 && <p className="empty">and {older} older</p>}
    </details>
  )
}

/** The checker's saved report of the task's latest try, and its file to open. */
function CheckerReport({ checker, onTask }: { checker: PanelChecker; onTask: (id: string) => void }) {
  return (
    <details className="fold-box">
      <summary>
        <Icon name="chevron-right" />
        <Icon name={checker.ok ? 'pass' : 'warning'} /> {checker.title}
      </summary>
      {checker.text === null ? <p className="empty">Could not read the checker report file.</p> : <Markdown text={checker.text} onTask={onTask} />}
      <p className="dim">
        {checker.cut ? 'The rest is in ' : ''}
        <button type="button" className="link" onClick={() => tell({ type: 'open-file', path: checker.file })}>
          {checker.file}
        </button>
      </p>
    </details>
  )
}

/* ---------- Scouts ---------- */

function Scouts({ scouts, onSay }: { scouts: PanelScout[]; onSay: Say }) {
  const now = useNow(30_000)
  const [running, setRunning] = useState<string | null>(null)
  const run = (name: string) => {
    setRunning(name)
    ask({ type: 'scout', name })
      .then(t => onSay(t), (e: Error) => onSay(e.message, true))
      .finally(() => setRunning(null))
  }
  return (
    <div className="page scouts">
      <p className="page-about dim">Scouts look over the project on a timer and report what they find; the lead turns findings into tasks. Ask the lead to add or change one.</p>
      {!scouts.length && <p className="empty">No scouts yet. Ask the lead to add one, for example “add a scout that looks for missing tests every day”.</p>}
      <ul className="cards-list">
        {scouts.map(s => (
          <li key={s.name} className="item">
            <div className="item-head">
              <Icon name={s.running ? 'loading' : s.paused ? 'debug-pause' : 'telescope'} />
              <b>{s.name}</b>
              <span className="dim">{s.running ? 'running' : s.paused ? 'paused' : s.every}</span>
              <span className="gap" />
              <Button secondary disabled={s.running || running === s.name} onClick={() => run(s.name)} icon={running === s.name ? 'loading' : 'play'} iconSpin={running === s.name}>
                Run now
              </Button>
            </div>
            {s.summary && <p>{s.summary}</p>}
            <p className="facts">
              <span>{s.lastRunMs ? `last run ${ago(s.lastRunMs, now)} ago`.replace('now ago', 'just now') : 'not run yet'}</span>
              {s.nextRunMs && !s.paused && <span>{s.nextRunMs > now ? `next in ${duration(s.nextRunMs - now).replace(/ \d+s$/, '')}` : 'next: now'}</span>}
            </p>
            {s.warning && (
              <p className="bad">
                <Icon name="warning" /> {s.warning}
              </p>
            )}
            {s.lastReport && (
              <details className="fold-box">
                <summary>
                  <Icon name="chevron-right" /> Last report
                </summary>
                <Markdown text={s.lastReport} />
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- Organizational memory ---------- */

/** Org-mem's notes, newest first, a topic at a time or all; each one deleted after the extension asks. */
function Memory({ mem, onSay }: { mem: PanelOrgMem; onSay: Say }) {
  const [pick, setPick] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const topic = pick && mem.topics.some(t => t.topic === pick) ? pick : null
  const notes = topic ? mem.notes.filter(x => x.topic === topic) : mem.notes
  const forget = (n: number) => {
    setDeleting(n)
    ask({ type: 'forget', n })
      .then(t => t && onSay(t), (e: Error) => onSay(e.message, true))
      .finally(() => setDeleting(null))
  }
  return (
    <div className="page memory">
      <div className="toolbar">
        <b>{mem.title}</b>
        <span className="dim">{topic ? `${notes.length} of ${mem.notes.length}` : `${mem.notes.length} / ${mem.max}`}</span>
        <span className="gap" />
        <Button secondary icon="go-to-file" onClick={() => tell({ type: 'open-file', path: mem.file })}>
          Open {mem.file}
        </Button>
      </div>
      <p className="page-about dim">{mem.about}</p>
      {mem.topics.length > 1 && (
        <div className="filters" role="group" aria-label="Topics">
          <button type="button" className="filter-chip" aria-pressed={!topic} onClick={() => setPick(null)}>
            all <span className="dim">{mem.notes.length}</span>
          </button>
          {mem.topics.map(t => (
            <button key={t.topic} type="button" className="filter-chip" aria-pressed={topic === t.topic} onClick={() => setPick(t.topic)}>
              {t.topic} <span className="dim">{t.count}</span>
            </button>
          ))}
        </div>
      )}
      {notes.length ? (
        <ul className="cards-list">
          {notes.map(x => (
            <li key={`${x.n}-${x.key}`} className="item">
              <div className="item-head">
                <b>{x.head}</b>
                <span className="tag">{x.topic}</span>
                <span className="gap" />
                <button type="button" className="icon-btn" title={`Delete note ${x.head}`} aria-label={`Delete note ${x.head}`} disabled={deleting !== null} onClick={() => forget(x.n)}>
                  <Icon name={deleting === x.n ? 'loading' : 'trash'} />
                </button>
              </div>
              <p>{x.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">{mem.empty}</p>
      )}
    </div>
  )
}
