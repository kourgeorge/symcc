// Small pieces every page uses: the mark, icons, time words, the staff (a task's stations as notes on one line) and
// the lead's Markdown, drawn as elements (never as HTML).
import { useEffect, useState, type ReactNode } from 'react'
import type { PanelLane, PanelStation } from '../../protocol'

const CLEF =
  'M164,138 C150,132 140,144 150,152 C162,160 184,152 184,132 C184,110 160,104 146,114 C126,128 124,160 150,170 C178,180 200,160 192,128 C186,104 160,90 152,70 C146,52 154,30 166,30 C178,30 180,52 166,70 C150,90 160,170 162,190 C164,206 142,210 136,198'

/** symcc's mark: the treble clef on its coral tile. */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="symcc">
      <rect width="32" height="32" rx="8" />
      <g transform="translate(16 16.5) scale(0.125) translate(-162 -120)">
        <path d={CLEF} />
      </g>
    </svg>
  )
}

export const Icon = ({ name, label }: { name: string; label?: string }) => <span className={`codicon codicon-${name}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} />

/** The time now, again every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** "now", "4m", "2h", "3d" ago. */
export function ago(atMs: number | undefined, now: number): string {
  if (atMs === undefined) return ''
  const s = Math.max(0, Math.round((now - atMs) / 1000))
  if (s < 45) return 'now'
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86_400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86_400)}d`
}

/** "38s", "4m 10s", "1h 5m". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export const clock = (atMs: number) => new Date(atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function dayWord(atMs: number, now: number): string {
  const d = new Date(atMs).setHours(0, 0, 0, 0)
  const today = new Date(now).setHours(0, 0, 0, 0)
  if (d === today) return 'Today'
  if (d === today - 86_400_000) return 'Yesterday'
  return new Date(atMs).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

export const tokensWord = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

/** The word under each station's note. */
export const STATION_WORD: Record<PanelStation, string> = { work: 'work', check: 'checker', queue: 'queue', tests: 'tests', you: 'you', merged: 'merge', answer: 'answer' }

/**
 * The staff: a task's stations as notes on one line, the ones passed filled, the current one coral. The current note
 * is one element that slides along the line when the task moves on.
 */
export function Staff({ lane, compact = false }: { lane: PanelLane; compact?: boolean }) {
  const n = lane.stations.length
  const done = lane.doneMs !== undefined
  const at = done ? n - 1 : lane.at
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
  const waiting = lane.stations[at] === 'you'
  return (
    <div className={`staff${compact ? ' compact' : ''}${done ? ' finished' : ''}`} aria-label={`${lane.id} is at ${STATION_WORD[lane.stations[at]!]}, step ${at + 1} of ${n}`} role="img">
      <div className="staff-track">
        <span className="staff-line" />
        <span className="staff-passed" style={{ width: `${x(at)}%` }} />
        {lane.stations.map((s, i) => (
          <span key={s} className={`note${i < at || done ? ' passed' : ''}${lane.skipped.includes(s) ? ' skipped' : ''}`} style={{ left: `${x(i)}%` }} />
        ))}
        {!done && <span className={`note-now${waiting ? ' waiting' : ''}${lane.agent ? ' agent' : ''}`} style={{ left: `${x(at)}%` }} />}
      </div>
      {!compact && (
        <div className="staff-words" aria-hidden>
          {lane.stations.map((s, i) => (
            <span key={s} className={i === at && !done ? 'here' : ''} style={{ left: `${x(i)}%` }}>
              {STATION_WORD[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Text with each task id (T-12) as a link to it. */
export function Linked({ text, onTask }: { text: string; onTask?: (id: string) => void }) {
  if (!onTask) return <>{text}</>
  const parts = text.split(/\b(T-\d+)\b/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <button key={i} type="button" className="task-ref" onClick={() => onTask(p)}>
            {p}
          </button>
        ) : (
          p
        ),
      )}
    </>
  )
}

/** Inline Markdown: `code`, **bold**, [links](https://…) and task ids. */
function inline(text: string, onTask?: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Linked key={`t${last}`} text={text.slice(last, m.index)} onTask={onTask} />)
    if (m[1]) out.push(<code key={m.index}>{m[1].slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={m.index}>{m[2].slice(2, -2)}</strong>)
    else if (m[3]) out.push(<a key={m.index} href={m[4]}>{m[3].slice(1, m[3].indexOf(']'))}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(<Linked key={`t${last}`} text={text.slice(last)} onTask={onTask} />)
  return out
}

/** The lead's Markdown as elements: paragraphs, lists, fenced code, headings (drawn as bold lines). */
export function Markdown({ text, onTask }: { text: string; onTask?: (id: string) => void }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!
    if (line.startsWith('```')) {
      const body: string[] = []
      for (i++; i < lines.length && !lines[i]!.startsWith('```'); i++) body.push(lines[i]!)
      i++
      blocks.push(<pre key={i}>{body.join('\n')}</pre>)
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!); i++) items.push(lines[i]!.replace(/^\s*([-*]|\d+\.)\s+/, ''))
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={i}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, onTask)}</li>
          ))}
        </List>,
      )
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para: string[] = []
    for (; i < lines.length && lines[i]!.trim() && !lines[i]!.startsWith('```') && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]!); i++) para.push(lines[i]!)
    const head = /^#{1,6}\s+(.*)$/.exec(para[0] ?? '')
    blocks.push(head ? <p key={i} className="md-head">{inline(head[1]!, onTask)}</p> : <p key={i}>{inline(para.join(' '), onTask)}</p>)
  }
  return <div className="md">{blocks}</div>
}
