// What an agent is doing: its steps (what it said, thought and ran) as the engine streams them, newest last, and the
// way to its whole session (a page the extension opens beside the board).
import { useLayoutEffect, useRef } from 'react'
import type { PanelSession, PanelStep, PanelTask } from '../../protocol'
import { tell } from './bridge'
import { Icon } from './parts'

const TOOL_ICON: [RegExp, string][] = [
  [/shell|terminal|bash|command/i, 'terminal'],
  [/edit|write|replace|patch|create/i, 'edit'],
  [/read|view|open/i, 'file'],
  [/grep|glob|search|find|^ls$|list/i, 'search'],
  [/web|fetch|url/i, 'globe'],
  [/delete|remove/i, 'trash'],
  [/symcc|board|task|todo/i, 'checklist'],
]

const STATUS_WORD: Record<string, string> = { running: 'started a turn', finished: 'finished its turn', error: 'stopped on an error', cancelled: 'was stopped', expired: 'ran out of time', creating: 'is starting' }

export const stepIcon = (s: PanelStep) =>
  s.kind === 'tool' ? (s.status === 'error' ? 'error' : (TOOL_ICON.find(([re]) => re.test(s.tool ?? ''))?.[1] ?? 'tools')) : s.kind === 'thinking' ? 'lightbulb' : s.kind === 'text' ? 'comment' : 'pulse'

const flat = (t: string) => t.replace(/\s+/g, ' ').trim()
const tail = (t: string, n = 160) => (t.length > n ? `…${t.slice(-n)}` : t)

/** Step `s` in one line: what ran ("shell: npm test"), else the newest of what was said or thought. */
export function stepWords(s: PanelStep): string {
  if (s.kind === 'tool') return `${s.tool ?? 'tool'}: ${flat(s.text)}`
  if (s.kind === 'thinking') return `thinking: ${tail(flat(s.text))}`
  if (s.kind === 'text') return tail(flat(s.text))
  return STATUS_WORD[s.text] ?? s.text
}

/** The step to show for an agent now: its newest, a turn's start or end only when nothing else came since. */
export const latestStep = (steps: readonly PanelStep[] | undefined): PanelStep | undefined => {
  if (!steps?.length) return undefined
  const last = steps[steps.length - 1]!
  if (last.kind !== 'status' || last.text !== 'running') return last
  return steps.length > 1 ? steps[steps.length - 2] : last
}


const seconds = (atMs: number) => new Date(atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function StepItem({ s }: { s: PanelStep }) {
  if (s.kind === 'status')
    return (
      <li className="step status">
        <span>{STATUS_WORD[s.text] ?? s.text}</span>
        <time>{seconds(s.atMs)}</time>
      </li>
    )
  return (
    <li className={`step ${s.kind}${s.status ? ` ${s.status}` : ''}`}>
      <Icon name={s.kind === 'tool' && s.status === 'running' ? 'loading' : stepIcon(s)} />
      {s.kind === 'tool' ? (
        <p>
          <b>{s.tool}</b> <code>{s.text || '(no arguments)'}</code>
        </p>
      ) : (
        <p>{s.text.trim()}</p>
      )}
      <time>{seconds(s.atMs)}</time>
    </li>
  )
}

/** The newest `max` steps, kept scrolled to the newest while the reader stays at the bottom. */
export function StepList({ steps, max = 40, label }: { steps: readonly PanelStep[]; max?: number; label: string }) {
  const box = useRef<HTMLOListElement>(null)
  const stuck = useRef(true)
  const shown = steps.slice(-max)
  const last = shown[shown.length - 1]
  useLayoutEffect(() => {
    const el = box.current
    if (el && stuck.current) el.scrollTop = el.scrollHeight
  }, [shown.length, last?.text, last?.status])
  const onScroll = () => {
    const el = box.current
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }
  return (
    <ol className="steps" ref={box} onScroll={onScroll} aria-label={label}>
      {steps.length > shown.length && <li className="step status">{steps.length - shown.length} earlier steps in the full session</li>}
      {shown.map((s, i) => (
        <StepItem key={`${s.atMs}-${i}`} s={s} />
      ))}
    </ol>
  )
}

export const openSession = (task: Pick<PanelTask, 'id' | 'title'>, s: PanelSession) => tell({ type: 'session', agent: s.agent, title: `${task.id} ${task.title}: ${s.label}` })

/** A task's newest session: its live steps, the full session one click away, and the earlier tries' sessions. */
export function TaskSession({ task, steps }: { task: PanelTask; steps: Record<string, PanelStep[]> }) {
  const [first, ...older] = task.sessions
  if (!first) return null
  const list = steps[first.agent] ?? []
  return (
    <section className="task-session" aria-label={`What the agent of ${task.id} did`}>
      <div className="session-head">
        <h4>
          {first.running ? 'Working now' : 'Last agent'} <span>{first.label}</span>
        </h4>
        <button type="button" className="btn ghost" onClick={() => openSession(task, first)}>
          <Icon name="go-to-file" /> Open the full session
        </button>
      </div>
      {list.length ? (
        <StepList steps={list} label={`${first.label}: its steps`} />
      ) : (
        <p className="quiet">{first.running ? 'Nothing yet. Its steps show here as it works.' : 'Its steps are in the full session.'}</p>
      )}
      {!!older.length && (
        <p className="session-older">
          Earlier:
          {older.map(s => (
            <button key={s.agent} type="button" className="link" onClick={() => openSession(task, s)}>
              {s.label}
            </button>
          ))}
        </p>
      )}
    </section>
  )
}
