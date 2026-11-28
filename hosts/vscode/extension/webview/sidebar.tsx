// The sidebar in the activity bar: the board at a glance, as folding views like any side bar's. What needs the owner
// comes first, each decided in place when opened; then the lead (what it does or last said, and a box to tell it
// more), what runs and what's next. A task, the chat and the worktrees open in the board panel.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { BoardPage, ChatItem, PanelStep, PanelView } from '../../protocol'
import { LEAD_AGENT } from '../../steps'
import { Banners, EngineScreen, ModeMenu, NoticeLine, OffScreen, WorkViews, useNotice, useSymcc, type Say } from './App'
import { ask, tell } from './bridge'
import { Icon, Markdown, ago, useNow } from './parts'
import { latestStep, stepIcon, stepWords } from './session'
import { Collapsible, ToolbarButton } from './ui'

const go = (page: BoardPage, task?: string) => tell({ type: 'open-board', page, ...(task ? { task } : {}) })
const openTask = (id: string) => go('board', id)

export function Sidebar() {
  const s = useSymcc()
  const [notice, say] = useNotice()
  const v = s.view
  return (
    <div className="sidebar">
      {s.engine.state !== 'ready' && !v ? (
        <EngineScreen engine={s.engine} />
      ) : v && !v.on ? (
        <OffScreen view={v} onSay={say} />
      ) : v ? (
        <>
          <Head view={v} onSay={say} />
          <Banners view={v} network={s.network} onSay={say} />
          <WorkViews view={v} steps={s.steps} onSay={say} onTask={openTask} compact lead={<Lead chat={s.chat} busy={s.busy} steps={s.steps[LEAD_AGENT]} ready={s.engine.state === 'ready'} onSay={say} />} />
        </>
      ) : (
        <EngineScreen engine={{ state: 'starting' }} />
      )}
      <NoticeLine notice={notice} />
    </div>
  )
}

function Head({ view, onSay }: { view: PanelView; onSay: Say }) {
  const c = view.counts
  return (
    <header className="sb-head">
      <span className="head-project" title={view.branch ? `New tasks merge into ${view.branch}` : undefined}>
        <b>{view.project}</b>
        {view.branch && (
          <span className="dim">
            <Icon name="git-branch" />
            {view.branch}
          </span>
        )}
      </span>
      <ModeMenu view={view} onSay={onSay} />
      <p className="sb-counts dim">
        {c.running} running · {c.next} next · {c.doneToday} done today
      </p>
    </header>
  )
}

/**
 * The lead: what it's doing or last said, and a box to tell it more. Enter sends (into its running turn while it
 * works), Alt+Enter queues it for after, Shift+Enter is a new line, Esc stops it.
 */
function Lead({ chat, busy, steps, ready, onSay }: { chat: ChatItem[]; busy: boolean; steps?: PanelStep[]; ready: boolean; onSay: Say }) {
  const now = useNow(30_000)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const last = chat.findLast(c => c.who === 'lead' || c.who === 'error')
  const step = busy ? latestStep(steps) : undefined
  const send = (queue = false) => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    ask({ type: 'send', text: t, ...(queue && busy ? { queue: true } : {}) })
      .then(
        said => (setText(''), said && onSay(said)),
        (e: Error) => onSay(e.message, true),
      )
      .finally(() => setSending(false))
  }
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape' && busy) return (e.preventDefault(), tell({ type: 'lead-stop' }))
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    send(e.altKey)
  }
  return (
    <Collapsible heading="Lead" open alwaysShowHeaderActions className="view sb-lead">
      <ToolbarButton slot="actions" icon="link-external" label="Open the chat" title="Open the chat in the board panel" onClick={() => go('now')} />
      <span slot="decorations" className="dim">
        {busy ? (
          <>
            <Icon name="loading" /> working
          </>
        ) : (
          last && (ago(last.atMs, now) === 'now' ? 'just now' : `${ago(last.atMs, now)} ago`)
        )}
      </span>
      <div className="sb-lead-body">
        {step ? (
          <p className="row-sub" title={stepWords(step)}>
            <Icon name={stepIcon(step)} /> <span>{stepWords(step)}</span>
          </p>
        ) : last ? (
          <Said item={last} />
        ) : (
          <p className="empty">Tell the lead what you want. It plans the tasks, and workers do them, each in its own worktree.</p>
        )}
        <form className="sb-compose composer-box" onSubmit={e => (e.preventDefault(), send())}>
          <label className="sr" htmlFor="sb-text">
            Message the lead
          </label>
          <textarea id="sb-text" rows={2} placeholder={!ready ? 'symcc is starting…' : busy ? 'Add to what the lead is doing…' : 'Tell the lead what you want next'} value={text} disabled={!ready} onChange={e => setText(e.target.value)} onKeyDown={key} />
          <div className="composer-bar">
            <span className="composer-hint">{busy ? 'Enter adds to its turn · Esc stops it' : 'Enter sends'}</span>
            <span className="gap" />
            {busy && !text.trim() ? (
              <button type="button" className="send" title="Stop the lead (Esc)" aria-label="Stop the lead" onClick={() => tell({ type: 'lead-stop' })}>
                <Icon name="debug-stop" />
              </button>
            ) : (
              <button type="submit" className="send" title={busy ? "Send into the lead's running turn (Enter); Alt+Enter queues it" : 'Send (Enter)'} aria-label="Send" disabled={!text.trim() || sending || !ready}>
                <Icon name={sending ? 'loading' : 'arrow-up'} />
              </button>
            )}
          </div>
        </form>
      </div>
    </Collapsible>
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
