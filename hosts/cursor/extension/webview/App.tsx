// The board panel: a rail (Now, Board, Worktrees, Scouts), the header with the mode switch, and the page. Now is one stream:
// what needs you pinned on top as cards you decide in place, the lead's chat and the board's news in one timeline
// with the message box under it, and the running work beside it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BoardPage, ChatItem, EngineState, LeadSettings, ModelInfo, NetworkProblem, PanelAction, PanelLane, PanelMode, PanelNeed, PanelScout, PanelStep, PanelTask, PanelView, SlashItem } from '../../protocol'
import { LEAD_AGENT, addStep } from '../../steps'
import { ask, onMessage, tell } from './bridge'
import { Icon, Linked, Mark, Markdown, Staff, STATION_WORD, ago, clock, dayWord, duration, tokensWord, useNow } from './parts'
import { TaskSession, latestStep, openSession, stepIcon, stepWords } from './session'
import { LeadChat } from './chat'
import { Worktrees, type WorktreeList } from './worktrees'

type Page = BoardPage
type Notice = { text: string; bad: boolean; at: number }
export type Say = (text: string, bad?: boolean) => void
export type Steps = Record<string, PanelStep[]>
/** The lead chat's model and mode, the account's models, and the slash commands. */
type Lead = { settings: LeadSettings; models: ModelInfo[]; slash: SlashItem[] }

/** The words of the board's empty list (hooks/core/panel.ts ALL_CLEAR). */
const ALL_CLEAR = ['All clear. Nothing running or waiting.', 'Tell the lead what you want next.'] as const

/** What the extension sends, kept as it comes: the board, the lead's chat, the engine, every agent's steps. */
export function useSymcc(onGo?: (page: Page, task?: string) => void) {
  const [view, setView] = useState<PanelView | null>(null)
  const [chat, setChat] = useState<ChatItem[]>([])
  const [busy, setBusy] = useState(false)
  const [engine, setEngine] = useState<EngineState>({ state: 'starting' })
  const [network, setNetwork] = useState<NetworkProblem | null>(null)
  const [steps, setSteps] = useState<Steps>({})
  const [lead, setLead] = useState<Lead>({ settings: { mode: 'agent' }, models: [], slash: [] })
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

export function NoticeLine({ notice }: { notice: Notice | null }) {
  return (
    <div className="notice" role="status" aria-live="polite">
      {notice && (
        <p className={notice.bad ? 'bad' : ''}>
          <Icon name={notice.bad ? 'error' : 'check'} /> {notice.text}
        </p>
      )}
    </div>
  )
}

export function App() {
  const [page, setPage] = useState<Page>('now')
  const [focus, setFocus] = useState<string | null>(null)
  const { view, chat, busy, engine, network, steps, lead, trees } = useSymcc((p, task) => (setPage(p), task && setFocus(task)))
  const [notice, say] = useNotice()
  const openTask = useCallback((id: string) => (setPage('board'), setFocus(id)), [])

  return (
    <div className="app">
      <Rail page={page} onPage={setPage} needs={view?.counts.needs ?? 0} />
      <div className="frame">
        <Header view={view} onSay={say} />
        <NoticeLine notice={notice} />
        {network && (
          <div className="network-wrap">
            <NetworkCard key={network.text + network.proxy} problem={network} onSay={say} />
          </div>
        )}
        {engine.state !== 'ready' && !view ? (
          <EngineScreen engine={engine} />
        ) : view && !view.on ? (
          <OffScreen view={view} onSay={say} />
        ) : view ? (
          page === 'now' ? (
            <Now view={view} chat={chat} busy={busy} steps={steps} lead={lead} ready={engine.state === 'ready'} onSay={say} onTask={openTask} />
          ) : page === 'board' ? (
            <Board view={view} steps={steps} focus={focus} onSay={say} onTask={openTask} />
          ) : page === 'trees' ? (
            <Worktrees view={view} steps={steps} trees={trees} onSay={say} onTask={openTask} />
          ) : (
            <Scouts scouts={view.scouts} onSay={say} />
          )
        ) : (
          <EngineScreen engine={{ state: 'starting' }} />
        )}
      </div>
    </div>
  )
}

function Rail({ page, onPage, needs }: { page: Page; onPage: (p: Page) => void; needs: number }) {
  const item = (p: Page, icon: string, word: string, count?: number) => (
    <button type="button" className="rail-item" aria-current={page === p ? 'page' : undefined} onClick={() => onPage(p)}>
      <Icon name={icon} />
      <span>{word}</span>
      {!!count && <b className="rail-count">{count}</b>}
    </button>
  )
  return (
    <nav className="rail" aria-label="symcc">
      <Mark />
      {item('now', 'pulse', 'Now', needs)}
      {item('board', 'checklist', 'Board')}
      {item('trees', 'repo-forked', 'Worktrees')}
      {item('scouts', 'telescope', 'Scouts')}
    </nav>
  )
}

function Header({ view, onSay }: { view: PanelView | null; onSay: Say }) {
  const c = view?.counts
  return (
    <header className="head">
      <div className="head-title">
        <h1>{view?.project ?? 'symcc'}</h1>
        {view?.branch && (
          <span className="branch" title="The branch new tasks merge into">
            <Icon name="git-branch" /> {view.branch}
          </span>
        )}
      </div>
      {c && view?.on && (
        <p className="head-counts">
          <span>
            <b>{c.running}</b> running
          </span>
          <span>
            <b>{c.next}</b> up next
          </span>
          <span>
            <b>{c.doneToday}</b> done today
          </span>
        </p>
      )}
      {view?.on && <ModeMenu view={view} onSay={onSay} />}
      {view?.note && (
        <p className="head-note">
          <Icon name="warning" /> {view.note}
        </p>
      )}
    </header>
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

/** The board's mode: one button that opens the three modes; a change is said and confirmed before it happens. */
export function ModeMenu({ view, onSay }: { view: PanelView; onSay: Say }) {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<PanelMode | null>(null)
  const [saving, setSaving] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = view.modes.find(m => m.mode === view.mode)
  const close = useCallback(() => (setOpen(false), setPick(null)), [])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && close()
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc))
  }, [open, close])
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
      <button type="button" className="mode-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} title={current?.meaning}>
        <Icon name={MODE_ICON[view.mode]} />
        <span>{sentence(current?.name ?? view.mode)}</span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="mode-pop" role="dialog" aria-label="Board mode">
          {!chosen ? (
            <>
              <p className="mode-pop-head">How the board runs</p>
              <ul className="mode-list">
                {view.modes.map(m => (
                  <li key={m.mode}>
                    <button type="button" className="mode-option" aria-current={m.mode === view.mode || undefined} disabled={m.mode === view.mode} onClick={() => setPick(m.mode)}>
                      <Icon name={MODE_ICON[m.mode]} />
                      <span>
                        <b>{sentence(m.name)}</b>
                        {m.mode === view.mode && <em> · now</em>}
                        <small>{sentence(m.meaning)}.</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mode-confirm">
              <p className="mode-pop-head">
                <Icon name={MODE_ICON[chosen.mode]} /> Switch to {chosen.name}?
              </p>
              <p>{modeEffect(view, chosen.mode)}</p>
              <div className="card-actions">
                <button type="button" className="btn primary" disabled={saving} onClick={confirm}>
                  {saving ? <Icon name="loading" /> : null}
                  {chosen.mode === 'paused' ? 'Pause the board' : `Switch to ${chosen.name}`}
                </button>
                <button type="button" className="btn ghost" disabled={saving} onClick={() => setPick(null)} autoFocus>
                  Back
                </button>
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
  const save = (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    ask({ type: 'proxy', proxy: text })
      .then(t => onSay(t), (err: Error) => onSay(err.message, true))
      .finally(() => setSaving(false))
  }
  return (
    <article className="card need-failed network" role="alert">
      <h3>symcc can't reach Cursor</h3>
      <p className="card-text bad">{problem.text}</p>
      <p className="card-text">
        {problem.proxy ? `It ran through the proxy ${problem.proxy.replace(/\/\/[^@/]*@/, '//***@')}.` : 'It ran with no proxy.'} The lead and the workers need Cursor's servers. On a network that needs a proxy, enter it here; symcc restarts with it. In a terminal, <code>echo $HTTPS_PROXY</code> shows the one your shell uses.
      </p>
      <form className="card-answer" onSubmit={save}>
        <label className="sr" htmlFor="proxy">
          Proxy
        </label>
        <input id="proxy" placeholder="http://proxy.example.com:912" value={text} onChange={e => setText(e.target.value)} disabled={saving} />
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? <Icon name="loading" /> : null}
          Use and restart
        </button>
        <button type="button" className="btn ghost" onClick={() => tell({ type: 'log' })}>
          Open the log
        </button>
      </form>
    </article>
  )
}

export function EngineScreen({ engine }: { engine: EngineState }) {
  if (engine.state === 'failed' || engine.state === 'stopped')
    return (
      <section className="screen">
        <h2>{engine.state === 'failed' ? 'symcc stopped' : 'symcc is not running'}</h2>
        <p>{engine.text ?? 'The engine is not running in this window.'} Its log is under “symcc: Show the engine log” in the command palette.</p>
        <button type="button" className="btn primary" onClick={() => tell({ type: 'restart' })}>
          <Icon name="debug-restart" /> Start symcc again
        </button>
      </section>
    )
  return (
    <section className="screen" aria-busy="true">
      <p className="quiet">
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
    <section className="screen">
      <Mark size={48} />
      <h2>Set up symcc in {view.project}</h2>
      <p>{view.off}</p>
      <p>symcc keeps its board in .symcc/ in this project. You tell the lead what you want; it plans tasks, and workers do each one in its own git worktree. You decide what merges.</p>
      <button type="button" className="btn primary" disabled={busy} onClick={setUp}>
        {busy ? <Icon name="loading" /> : <Icon name="play" />} Set up symcc here
      </button>
    </section>
  )
}

/* ---------- Now: needs, stream, composer, running ---------- */

function Now({ view, chat, busy, steps, lead, ready, onSay, onTask }: { view: PanelView; chat: ChatItem[]; busy: boolean; steps: Steps; lead: Lead; ready: boolean; onSay: Say; onTask: (id: string) => void }) {
  return (
    <div className="now">
      <div className="center">
        <Needs needs={view.needs} tasks={view.tasks} onSay={onSay} onTask={onTask} />
        <LeadChat chat={chat} news={view.news} lanes={view.lanes} busy={busy} lead={steps[LEAD_AGENT] ?? []} ready={ready} settings={lead.settings} models={lead.models} slash={lead.slash} onSay={onSay} onTask={onTask} />
      </div>
      <Side view={view} steps={steps} onTask={onTask} />
    </div>
  )
}

function Needs({ needs, tasks, onSay, onTask }: { needs: PanelNeed[]; tasks: PanelTask[]; onSay: Say; onTask: (id: string) => void }) {
  if (!needs.length)
    return (
      <section className="needs clear" aria-label="Needs you">
        <p>
          <Icon name="pass" /> Nothing needs you.
        </p>
      </section>
    )
  return (
    <section className="needs" aria-labelledby="needs-h">
      <h2 id="needs-h">
        Needs you <span className="count">{needs.length}</span>
      </h2>
      <div className="cards">
        {needs.map(n => (
          <NeedCard key={n.id} need={n} task={tasks.find(t => t.id === n.id)} onSay={onSay} onTask={onTask} />
        ))}
      </div>
    </section>
  )
}

const NEED_ICON: Record<PanelNeed['kind'], string> = { question: 'comment-discussion', asks: 'question', files: 'file-add', time: 'watch', review: 'git-pull-request', answer: 'book', failed: 'error' }

export function NeedCard({ need, task: of, onSay, onTask }: { need: PanelNeed; task?: PanelTask; onSay: Say; onTask: (id: string) => void }) {
  const now = useNow(30_000)
  const [box, setBox] = useState<{ action?: PanelAction; hint: string } | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const [nudge, setNudge] = useState(false)
  useEffect(() => void (box && area.current?.focus()), [box])

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
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const words = text.trim()
    if (box?.action) return box.action.id === 'drop' || words ? act(box.action, words) : undefined
    if (words) answer(words)
  }
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') setBox(null)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
  }
  const choices = need.choices.filter(c => c !== 'Answer…')
  const ownAnswer = need.choices.includes('Answer…') || (!need.choices.length && !need.actions.length)
  const task = /^T-\d+$/.test(need.id)

  return (
    <article className={`card need-${need.kind}`} aria-busy={!!sending}>
      <h3>{need.title}</h3>
      <p className="card-meta">
        <Icon name={NEED_ICON[need.kind]} />
        {task ? (
          <button type="button" className="task-ref" onClick={() => onTask(need.id)}>
            {need.id}
          </button>
        ) : (
          <span className="id">{need.id}</span>
        )}
        <span>
          {need.meta.replace(`${need.id} · `, '')}
          {need.sinceMs !== undefined && <span className="since">{ago(need.sinceMs, now)}</span>}
        </span>
        {of?.sessions[0] && (
          <button type="button" className="link card-session" onClick={() => openSession(of, of.sessions[0]!)}>
            What the agent did
          </button>
        )}
      </p>
      {need.text && <p className={`card-text${need.kind === 'failed' ? ' bad' : ''}`}>{need.text}</p>}
      {need.files && need.files.length > 1 && (
        <ul className="files">
          {need.files.slice(0, 3).map(f => (
            <li key={f.file}>
              <span className="file">{f.file}</span>
              <span className="add">+{f.added}</span>
              <span className="del">−{f.removed}</span>
            </li>
          ))}
          {need.files.length > 3 && <li className="quiet">and {need.files.length - 3} more</li>}
        </ul>
      )}
      {box ? (
        <form className="card-box" onSubmit={submit}>
          <label className="sr" htmlFor={`box-${need.id}`}>
            {box.hint}
          </label>
          <textarea id={`box-${need.id}`} ref={area} rows={2} placeholder={box.hint} value={text} onChange={e => setText(e.target.value)} onKeyDown={keys} />
          <div className="card-actions">
            <button type="submit" className="btn primary" disabled={!!sending || (!text.trim() && box.action?.id !== 'drop')}>
              {sending ? <Icon name="loading" /> : null}
              {box.action ? box.action.label.replace('…', '') : 'Send answer'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setBox(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : !choices.length && !need.actions.length ? null : (
        <div className="card-actions">
          {choices.map(c => (
            <button key={c} type="button" className="btn choice" disabled={!!sending} onClick={() => answer(c)}>
              {sending === c ? <Icon name="loading" /> : null}
              {c}
            </button>
          ))}
          {need.actions.map(a => (
            <button key={a.id} type="button" className={`btn${a.primary ? ' primary' : ''}`} disabled={!!sending} onClick={() => press(a)}>
              {sending === a.label ? <Icon name="loading" /> : null}
              {a.label}
            </button>
          ))}
        </div>
      )}
      {ownAnswer && !box && (
        <form className="card-answer" onSubmit={submit}>
          <label className="sr" htmlFor={`answer-${need.id}`}>
            Your answer
          </label>
          <input
            id={`answer-${need.id}`}
            ref={field}
            className={nudge ? 'nudge' : undefined}
            aria-invalid={nudge || undefined}
            placeholder={nudge ? 'Type your answer here first' : choices.length ? 'Or write your own answer' : 'Write your answer'}
            value={text}
            onChange={e => (setText(e.target.value), setNudge(false))}
            disabled={!!sending}
          />
          <button type="submit" className="btn primary" disabled={!!sending} onClick={e => !text.trim() && (e.preventDefault(), setNudge(true), field.current?.focus())}>
            {sending && !choices.includes(sending) ? <Icon name="loading" /> : null}
            Answer
          </button>
        </form>
      )}
    </article>
  )
}

function Side({ view, steps, onTask }: { view: PanelView; steps: Steps; onTask: (id: string) => void }) {
  const running = view.lanes.filter(l => l.doneMs === undefined && l.stations[l.at] !== 'you')
  const merged = view.lanes.filter(l => l.doneMs !== undefined)
  const shown = view.next.slice(0, 6)
  return (
    <aside className="side" aria-label="The work">
      <section>
        <h2>
          Running <span className="count">{view.counts.running}</span>
        </h2>
        {running.length ? running.map(l => <LaneCard key={l.id} lane={l} step={l.agentId ? latestStep(steps[l.agentId]) : undefined} onTask={onTask} />) : <p className="quiet">Nothing running.</p>}
      </section>
      {!!merged.length && (
        <section>
          <h2>Just merged</h2>
          {merged.map(l => (
            <LaneCard key={l.id} lane={l} onTask={onTask} />
          ))}
        </section>
      )}
      <section>
        <h2>
          Up next <span className="count">{view.counts.next}</span>
        </h2>
        {shown.length ? (
          <ul className="next">
            {shown.map(t => (
              <li key={t.id}>
                <button type="button" className="row-btn" onClick={() => onTask(t.id)}>
                  <span className="id">{t.id}</span>
                  <span className="title">{t.title}</span>
                </button>
              </li>
            ))}
            {view.next.length > shown.length && <li className="quiet">and {view.next.length - shown.length} more</li>}
          </ul>
        ) : (
          <p className="quiet">Nothing waits to start.</p>
        )}
      </section>
      {!!view.counts.backlog && <Backlog tasks={view.tasks.filter(t => t.status === 'backlog')} count={view.counts.backlog} onTask={onTask} />}
    </aside>
  )
}

/** The backlog, folded to its count; open, its tasks, each a way to the task on the board. */
function Backlog({ tasks, count, onTask }: { tasks: PanelTask[]; count: number; onTask: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const shown = tasks.slice(0, 8)
  return (
    <section className="backlog">
      <h2>
        <button type="button" className="fold" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} />
          Backlog <span className="count">{count}</span>
        </button>
      </h2>
      {open && (
        <ul className="next">
          {shown.map(t => (
            <li key={t.id}>
              <button type="button" className="row-btn" onClick={() => onTask(t.id)}>
                <span className="id">{t.id}</span>
                <span className="title">{t.title}</span>
                {t.kind && <span className="tag">{t.kind}</span>}
              </button>
            </li>
          ))}
          {tasks.length > shown.length && (
            <li>
              <button type="button" className="row-btn quiet" onClick={() => onTask(tasks[shown.length]!.id)}>
                and {tasks.length - shown.length} more on the board
              </button>
            </li>
          )}
          {!tasks.length && <li className="quiet">They show on the board.</li>}
        </ul>
      )}
    </section>
  )
}

export function LaneCard({ lane, step, onTask }: { lane: PanelLane; step?: PanelStep; onTask: (id: string) => void }) {
  const now = useNow(1000)
  const station = lane.stations[lane.at]
  const done = lane.doneMs !== undefined
  const what = done ? `merged ${ago(lane.doneMs, now)} ago`.replace('now ago', 'just now') : station === 'you' ? 'waits for you' : `${STATION_WORD[station!]}${lane.sinceMs !== undefined ? ` · ${duration(now - lane.sinceMs)}` : ''}`
  return (
    <button type="button" className={`lane${done ? ' finished' : ''}`} onClick={() => onTask(lane.id)}>
      <span className="lane-head">
        <span className="id">{lane.id}</span>
        <span className="title">{lane.title}</span>
      </span>
      <Staff lane={lane} />
      <span className="lane-meta">
        <span>{what}</span>
        {lane.tries > 1 && (
          <span>
            try {lane.tryNo} of {lane.tries}
          </span>
        )}
        {!!lane.tokens && <span>{tokensWord(lane.tokens)} tokens</span>}
      </span>
      {step && !done && (
        <span className="lane-step" title={stepWords(step)}>
          <Icon name={step.kind === 'tool' && step.status === 'running' ? 'loading' : stepIcon(step)} />
          <span>{stepWords(step)}</span>
        </span>
      )}
    </button>
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
      <div className="page-head">
        <h2>Board</h2>
        <label className="filter">
          <Icon name="search" />
          <span className="sr">Filter tasks</span>
          <input type="search" placeholder="Filter by id, title, kind or role" value={filter} onChange={e => setFilter(e.target.value)} />
        </label>
      </div>
      {!tasks.length && <p className="quiet">{f ? `No task matches “${filter}”.` : ALL_CLEAR.join(' ')}</p>}
      {GROUPS.map(g => {
        const xs = tasks.filter(g.has)
        if (!xs.length) return null
        const open = g.open || !!f || xs.some(t => t.id === focus)
        return (
          <details key={g.key} className={`group is-${g.key}`} open={open}>
            <summary>
              <h3>{g.title}</h3>
              <span className="count">{xs.length}</span>
            </summary>
            <ul>
              {xs.map(t => (
                <TaskRow key={t.id} task={t} steps={steps} focused={t.id === focus} onSay={onSay} onTask={onTask} />
              ))}
            </ul>
          </details>
        )
      })}
    </div>
  )
}

const STATUS_TONE: Record<PanelTask['status'], string> = { backlog: 'other', todo: 'other', doing: 'run', paused: 'wait', waiting: 'you', review: 'you', failed: 'bad', done: 'good', dropped: 'other' }

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
    <li ref={li} className={`task${open ? ' open' : ''}${focused ? ' focused' : ''}`}>
      <button type="button" className="task-row" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <span className="id">{task.id}</span>
        <span className="title">{task.title}</span>
        {task.kind && <span className="tag">{task.kind}</span>}
        <span className={`state ${STATUS_TONE[task.status]}`}>{task.word}</span>
      </button>
      {open && (
        <div className="task-body">
          <p className="task-facts">
            <span>role {task.role}</span>
            {task.attempts > 0 && <span>{task.attempts === 1 ? '1 try' : `${task.attempts} tries`}</span>}
          </p>
          {task.note && <p className="task-note">{task.note}</p>}
          {task.details && (
            <div className="task-details">
              <Markdown text={task.details} onTask={onTask} />
            </div>
          )}
          <TaskSession task={task} steps={steps} />
          {box ? (
            <form
              className="card-box"
              onSubmit={e => {
                e.preventDefault()
                if (text.trim() || box.id === 'drop') act(box, text.trim())
              }}
            >
              <label className="sr" htmlFor={`row-${task.id}`}>
                {box.ask}
              </label>
              <textarea id={`row-${task.id}`} rows={2} placeholder={box.ask} value={text} onChange={e => setText(e.target.value)} autoFocus />
              <div className="card-actions">
                <button type="submit" className="btn primary" disabled={!!sending || (!text.trim() && box.id !== 'drop')}>
                  {box.label.replace('…', '')}
                </button>
                <button type="button" className="btn ghost" onClick={() => setBox(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            !!task.actions.length && (
              <div className="card-actions">
                {task.actions.map(a => (
                  <button key={a.id} type="button" className={`btn${a.primary ? ' primary' : ''}`} disabled={!!sending} onClick={() => (a.ask ? setBox(a) : act(a))}>
                    {sending === a.label ? <Icon name="loading" /> : null}
                    {a.label}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </li>
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
      <div className="page-head">
        <h2>Scouts</h2>
        <p className="quiet">Scouts look over the project on a timer and report what they find; the lead turns findings into tasks. Ask the lead to add or change one.</p>
      </div>
      {!scouts.length && <p className="quiet">No scouts yet. Ask the lead to add one, for example “add a scout that looks for missing tests every day”.</p>}
      <ul className="scout-list">
        {scouts.map(s => (
          <li key={s.name} className="scout">
            <div className="scout-head">
              <h3>{s.name}</h3>
              <span className={`state ${s.running ? 'run' : s.paused ? 'wait' : 'other'}`}>{s.running ? 'running' : s.paused ? 'paused' : s.every}</span>
              <button type="button" className="btn" disabled={s.running || running === s.name} onClick={() => run(s.name)}>
                {running === s.name ? <Icon name="loading" /> : <Icon name="play" />} Run now
              </button>
            </div>
            {s.summary && <p>{s.summary}</p>}
            <p className="scout-facts">
              <span>{s.lastRunMs ? `last run ${ago(s.lastRunMs, now)} ago`.replace('now ago', 'just now') : 'not run yet'}</span>
              {s.nextRunMs && !s.paused && <span>{s.nextRunMs > now ? `next in ${duration(s.nextRunMs - now).replace(/ \d+s$/, '')}` : 'next: now'}</span>}
            </p>
            {s.warning && (
              <p className="bad">
                <Icon name="warning" /> {s.warning}
              </p>
            )}
            {s.lastReport && (
              <details className="report">
                <summary>Last report</summary>
                <Markdown text={s.lastReport} />
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
