// The sidebar in the activity bar: the board at a glance, narrow. What needs you comes first, as the board's own cards,
// decided in place; then the lead (its last answer and a box to tell it more), what runs and what's next. A task, the
// chat and the worktrees open in the board panel.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { BoardPage, ChatItem, PanelStep, PanelView } from '../../protocol'
import { LEAD_AGENT } from '../../steps'
import { DriveNotice, EngineScreen, LaneCard, ModeMenu, NeedCard, NetworkCard, NoticeLine, OffScreen, useNotice, useSymcc, type Say, type Steps } from './App'
import { ask, tell } from './bridge'
import { Icon, IdleNote, Mark, Markdown, ago, useNow } from './parts'
import { latestStep, stepIcon, stepWords } from './session'

/** At most this many cards of what needs you; the rest are on the board. */
const NEEDS_SHOWN = 3
const NEXT_SHOWN = 4

const go = (page: BoardPage, task?: string) => tell({ type: 'open-board', page, ...(task ? { task } : {}) })
const openTask = (id: string) => go('board', id)

export function Sidebar() {
  const s = useSymcc()
  const [notice, say] = useNotice()
  const v = s.view
  return (
    <div className="sidebar">
      {s.network && <NetworkCard key={s.network.text + s.network.proxy} problem={s.network} onSay={say} />}
      {s.engine.state !== 'ready' && !v ? (
        <EngineScreen engine={s.engine} />
      ) : v && !v.on ? (
        <OffScreen view={v} onSay={say} />
      ) : v ? (
        <>
          <Head view={v} onSay={say} />
          <NoticeLine notice={notice} />
          <Needs view={v} onSay={say} />
          <Lead chat={s.chat} busy={s.busy} steps={s.steps[LEAD_AGENT]} ready={s.engine.state === 'ready'} onSay={say} />
          <Work view={v} steps={s.steps} />
          <footer className="sb-foot">
            <button type="button" className="btn" onClick={() => go('now')}>
              <Icon name="link-external" /> Open the board
            </button>
            <button type="button" className="btn ghost" onClick={() => go('trees')} title="Where each agent works: its folder, branch and changes">
              <Icon name="repo-forked" /> Worktrees
            </button>
          </footer>
        </>
      ) : (
        <EngineScreen engine={{ state: 'starting' }} />
      )}
    </div>
  )
}

function Head({ view, onSay }: { view: PanelView; onSay: Say }) {
  const c = view.counts
  return (
    <header className="sb-head">
      <div className="sb-title">
        <b>{view.project}</b>
        {view.branch && (
          <span className="branch" title="The branch new tasks merge into">
            <Icon name="git-branch" /> {view.branch}
          </span>
        )}
      </div>
      <div className="sb-state">
        <p className="sb-counts">
          <span>
            <b>{c.running}</b> running
          </span>
          <span>
            <b>{c.next}</b> next
          </span>
          <span>
            <b>{c.doneToday}</b> done today
          </span>
        </p>
        <ModeMenu view={view} onSay={onSay} />
      </div>
      {view.note && (
        <p className="head-note">
          <Icon name="warning" /> {view.note}
        </p>
      )}
      {view.follows && <DriveNotice follows={view.follows} onSay={onSay} />}
    </header>
  )
}

function Needs({ view, onSay }: { view: PanelView; onSay: Say }) {
  const needs = view.needs
  if (!needs.length)
    return (
      <p className="sb-clear">
        <Icon name="pass" /> Nothing needs you.
      </p>
    )
  const shown = needs.slice(0, NEEDS_SHOWN)
  return (
    <section className="sb-needs" aria-labelledby="sb-needs-h">
      <h2 id="sb-needs-h">
        Needs you <span className="count">{needs.length}</span>
      </h2>
      <div className="cards">
        {shown.map(n => (
          <NeedCard key={n.id} need={n} task={view.tasks.find(t => t.id === n.id)} onSay={onSay} onTask={openTask} />
        ))}
      </div>
      {needs.length > shown.length && (
        <button type="button" className="row-btn sb-more" onClick={() => go('now')}>
          {needs.length - shown.length} more on the board <Icon name="arrow-right" />
        </button>
      )}
    </section>
  )
}

/** The lead: what it's doing or last said, and a box to tell it more (Enter sends, Shift+Enter is a new line). */
function Lead({ chat, busy, steps, ready, onSay }: { chat: ChatItem[]; busy: boolean; steps?: PanelStep[]; ready: boolean; onSay: Say }) {
  const now = useNow(30_000)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const last = chat.findLast(c => c.who === 'lead' || c.who === 'error')
  const step = busy ? latestStep(steps) : undefined
  const send = () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    ask({ type: 'send', text: t })
      .then(
        said => (setText(''), said && onSay(said)),
        (e: Error) => onSay(e.message, true),
      )
      .finally(() => setSending(false))
  }
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    send()
  }
  return (
    <section className="sb-lead" aria-labelledby="sb-lead-h">
      <h2 id="sb-lead-h">
        <Mark size={14} /> Lead
        {busy ? (
          <span className="sb-busy">
            <Icon name="loading" /> working
          </span>
        ) : (
          last && <span className="sb-when">{ago(last.atMs, now) === 'now' ? 'just now' : `${ago(last.atMs, now)} ago`}</span>
        )}
        <button type="button" className="link sb-open" onClick={() => go('now')}>
          Open the chat
        </button>
      </h2>
      {step ? (
        <p className="sb-step" title={stepWords(step)}>
          <Icon name={stepIcon(step)} /> <span>{stepWords(step)}</span>
        </p>
      ) : last ? (
        <Said item={last} />
      ) : (
        <p className="quiet">Tell the lead what you want. It plans the tasks, and workers do them, each in its own worktree.</p>
      )}
      <form className="sb-compose" onSubmit={e => (e.preventDefault(), send())}>
        <label className="sr" htmlFor="sb-text">
          Message the lead
        </label>
        <textarea id="sb-text" rows={2} placeholder={ready ? 'Tell the lead what you want next' : 'symcc is starting…'} value={text} disabled={!ready} onChange={e => setText(e.target.value)} onKeyDown={key} />
        {busy && !text ? (
          <button type="button" className="icon-btn" title="Stop the lead's turn" aria-label="Stop the lead's turn" onClick={() => tell({ type: 'lead-stop' })}>
            <Icon name="debug-stop" />
          </button>
        ) : (
          <button type="submit" className="icon-btn" title="Send (Enter)" aria-label="Send" disabled={!text.trim() || sending || !ready}>
            <Icon name={sending ? 'loading' : 'send'} />
          </button>
        )}
      </form>
    </section>
  )
}

/** The lead's last answer, its first lines; a longer one fades out where it's cut, and the chat has the rest. */
function Said({ item }: { item: ChatItem }) {
  const box = useRef<HTMLDivElement>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = box.current
    if (el) setCut(el.scrollHeight > el.clientHeight + 2)
  }, [item.text])
  return (
    <div ref={box} className={`sb-said${cut ? ' cut' : ''}${item.who === 'error' ? ' bad' : ''}`}>
      <Markdown text={item.text} onTask={openTask} />
    </div>
  )
}

function Work({ view, steps }: { view: PanelView; steps: Steps }) {
  const running = view.lanes.filter(l => l.doneMs === undefined && l.stations[l.at] !== 'you')
  const next = view.next.slice(0, NEXT_SHOWN)
  return (
    <>
      <section className="sb-part" aria-labelledby="sb-running-h">
        <h2 id="sb-running-h">
          Running <span className="count">{view.counts.running}</span>
        </h2>
        {running.length ? running.map(l => <LaneCard key={l.id} lane={l} step={l.agentId ? latestStep(steps[l.agentId]) : undefined} onTask={openTask} />) : <IdleNote idle={view.idle} onTask={openTask} compact />}
      </section>
      {!!view.next.length && (
        <section className="sb-part" aria-labelledby="sb-next-h">
          <h2 id="sb-next-h">
            Up next <span className="count">{view.counts.next}</span>
          </h2>
          <ul className="next">
            {next.map(t => (
              <li key={t.id}>
                <button type="button" className="row-btn" onClick={() => openTask(t.id)}>
                  <span className="id">{t.id}</span>
                  <span className="title">{t.title}</span>
                </button>
              </li>
            ))}
            {view.next.length > next.length && (
              <li>
                <button type="button" className="row-btn quiet" onClick={() => go('board')}>
                  and {view.next.length - next.length} more on the board
                </button>
              </li>
            )}
          </ul>
        </section>
      )}
    </>
  )
}
