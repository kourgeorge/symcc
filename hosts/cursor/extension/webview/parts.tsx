// Small pieces every page uses: the mark, icons, time words, the staff (a task's stations as notes on one line) and
// the lead's Markdown, drawn as elements (never as HTML).
import { memo, useEffect, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { PanelLane, PanelStation } from '../../protocol'
import { tell } from './bridge'

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
export const STATION_WORD: Record<PanelStation, string> = { work: 'work', check: 'checker', queue: 'queue', tests: 'tests', you: 'you', done: 'done' }

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

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[]; tagName?: string; properties?: { className?: unknown } }

const TASK_ID = /\b(T-\d+)\b/

/** A remark step: each task id in the text (never in code or a link) becomes a link to the task. */
const taskLinks = () => (tree: MdNode) => {
  const walk = (n: MdNode) => {
    if (!n.children || n.type === 'link') return
    n.children = n.children.flatMap(c => {
      if (c.type !== 'text' || !c.value || !TASK_ID.test(c.value)) return (walk(c), [c])
      return c.value.split(TASK_ID).map((part, i): MdNode => (i % 2 ? { type: 'link', url: `#task:${part}`, children: [{ type: 'text', value: part }] } : { type: 'text', value: part })).filter(p => p.type === 'link' || p.value)
    })
  }
  walk(tree)
}

const textOf = (n: MdNode | undefined): string => (!n ? '' : n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(textOf).join(''))

/** A file path (src/a.ts, ./x/y.md:12, README.md#L4) the owner can open, with its line; null for anything else. */
export function pathOf(text: string): { path: string; line?: number } | null {
  const m = /^((?:~|\.{1,2})?\/?(?:[\w@.+-]+\/)*[\w@.+-]+)(?::(\d+)(?::\d+)?|#L(\d+))?$/.exec(text.trim())
  if (!m || /:\/\//.test(text)) return null
  const path = m[1]!
  const last = path.split('/').pop() ?? ''
  // a branch (origin/main, symcc/T-4) has a slash too: a path names a file with its extension, or starts like one
  const named = path.includes('/') ? /\.\w{1,10}$/.test(last) || /^(?:~|\.{1,2}|\.[\w-]+)?\//.test(path) : /^[\w.-]+\.(?:[cm]?[jt]sx?|json[c5]?|md|mdx|css|s[ac]ss|html?|py|go|rs|java|kt|rb|php|sh|ya?ml|toml|lock|txt|sql|c|h|cc|cpp|hpp|cs|swift|vue|svelte|xml|ini|env|gradle)$/i.test(path)
  if (!named || /^[.\d]+$/.test(path) || path.length > 240) return null
  const line = Number(m[2] ?? m[3])
  return { path, ...(Number.isFinite(line) && line > 0 ? { line } : {}) }
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => void navigator.clipboard?.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))
  const lines = text.replace(/\n$/, '').split('\n')
  const diff = lang === 'diff' || lang === 'patch'
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span>{lang || 'text'}</span>
        <button type="button" className="icon-btn" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the code'} title={copied ? 'Copied' : 'Copy'}>
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
      </div>
      <pre>
        {diff ? (
          <code className="diff">
            {lines.map((l, i) => (
              <span key={i} className={/^\+(?!\+\+)/.test(l) ? 'add' : /^-(?!--)/.test(l) ? 'del' : l.startsWith('@@') ? 'hunk' : undefined}>
                {l || ' '}
              </span>
            ))}
          </code>
        ) : (
          <code>{lines.join('\n')}</code>
        )}
      </pre>
    </div>
  )
}

/** The lead's Markdown (GitHub's flavour: tables, task lists, struck text) as elements, never as HTML. */
export const Markdown = memo(function Markdown({ text, onTask }: { text: string; onTask?: (id: string) => void }) {
  const components: Components = {
    a: ({ href = '', children }) => {
      if (href.startsWith('#task:')) {
        const id = href.slice(6)
        return onTask ? (
          <button type="button" className="task-ref" onClick={() => onTask(id)}>
            {children}
          </button>
        ) : (
          <span className="id">{children}</span>
        )
      }
      const file = /^[a-z][\w+.-]*:/i.test(href) ? null : pathOf(decodeURI(href))
      if (file) return <FileLink file={file}>{children}</FileLink>
      return (
        <a href={href} title={href}>
          {children}
        </a>
      )
    },
    pre: ({ node }) => {
      const code = (node as MdNode | undefined)?.children?.find(c => c.tagName === 'code')
      const lang = (Array.isArray(code?.properties?.className) ? (code.properties.className as string[]) : []).find(c => c.startsWith('language-'))?.slice(9) ?? ''
      return <CodeBlock lang={lang} text={textOf(code)} />
    },
    code: ({ children }) => {
      const file = typeof children === 'string' ? pathOf(children) : null
      return file ? (
        <FileLink file={file}>
          <code>{children}</code>
        </FileLink>
      ) : (
        <code>{children}</code>
      )
    },
    table: ({ children }) => (
      <div className="md-table">
        <table>{children}</table>
      </div>
    ),
    img: ({ alt }) => <span className="quiet">[{alt || 'picture'}]</span>,
    input: ({ checked }) => <input type="checkbox" checked={!!checked} disabled readOnly />,
  }
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, taskLinks]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

/** A file path the owner can open in the editor (relative to the project). */
function FileLink({ file, children }: { file: { path: string; line?: number }; children: ReactNode }) {
  return (
    <button type="button" className="md-file" title={`Open ${file.path}${file.line ? ` at line ${file.line}` : ''}`} onClick={() => tell({ type: 'open-file', path: file.path, ...(file.line ? { line: file.line } : {}) })}>
      {children}
    </button>
  )
}
