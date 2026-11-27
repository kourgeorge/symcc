// The lead chat on the Now page: the stream (the lead's conversation and the board's news as one timeline) and the box
// to write to the lead, on assistant-ui's building blocks: its runtime over the chat the extension keeps, its thread
// viewport, composer, slash popover and picture attachments, drawn in the panel's own styles. A lead answer shows
// what it said, with its work (thinking, tools) folded above it; the running turn shows its work as it happens.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type AttachmentAdapter,
  type DirectiveFormatter,
  type ThreadMessageLike,
  type TriggerAdapter,
  type TriggerItem,
} from '@assistant-ui/react'
import type { AgentChoice, ChatImage, ChatItem, LeadSettings, ModelInfo, PanelLane, PanelNews, PanelStep, SlashItem } from '../../protocol'
import { LEAD_AGENT, turnSteps } from '../../steps'
import { ask, tell } from './bridge'
import { Icon, Linked, Mark, Markdown, clock, dayWord, duration, tokensWord, useNow } from './parts'
import { StepList } from './session'

type Say = (text: string, bad?: boolean) => void

const ALL_CLEAR = ['All clear. Nothing running or waiting.', 'Tell the lead what you want next.'] as const

/* ---------- the stream as assistant-ui messages ---------- */

/** What a message of the stream is: a chat line, a line of the board's news, or the lead's running turn. */
type Row = ({ kind: 'chat'; item: ChatItem } | { kind: 'news'; news: PanelNews; lane?: PanelLane } | { kind: 'live'; steps: PanelStep[] }) & { day?: string }

const row = (m: { metadata?: { custom?: Record<string, unknown> } }) => m.metadata?.custom as Row | undefined

function chatMessage(item: ChatItem): ThreadMessageLike {
  const role = item.who === 'owner' ? 'user' : item.who === 'lead' ? 'assistant' : 'system'
  return { id: item.key, role, content: [{ type: 'text', text: item.text }], createdAt: new Date(item.atMs) }
}

/** The steps of a finished turn that were its work: all but the words at its end, which are its answer. */
function workOf(steps: readonly PanelStep[]): { work: PanelStep[]; said: string } {
  let end = steps.length
  while (end > 0 && (steps[end - 1]!.kind === 'text' || steps[end - 1]!.kind === 'status')) end--
  const work = steps.slice(0, end).filter(s => s.kind !== 'status')
  const said = steps
    .slice(end)
    .filter(s => s.kind === 'text')
    .map(s => s.text)
    .join('')
  return { work, said }
}

/** "Worked for 42s · 6 tools · thought" for a turn's work. */
function workWords(work: readonly PanelStep[], live: boolean, now: number): string {
  const tools = work.filter(s => s.kind === 'tool').length
  const thought = work.some(s => s.kind === 'thinking')
  const first = work[0]?.atMs
  const last = live ? now : work[work.length - 1]?.atMs
  const time = first !== undefined && last !== undefined && last - first >= 1000 ? ` for ${duration(last - first)}` : ''
  return [`${live ? 'Working' : 'Worked'}${time}`, tools ? `${tools} tool${tools === 1 ? '' : 's'}` : '', thought ? 'thought it through' : ''].filter(Boolean).join(' · ')
}

/* ---------- the chat ---------- */

type Ctx = { onTask: (id: string) => void }
const ChatCtx = createContext<Ctx>({ onTask: () => undefined })

export type LeadChatProps = {
  chat: ChatItem[]
  news: PanelNews[]
  lanes: PanelLane[]
  busy: boolean
  lead: PanelStep[]
  ready: boolean
  settings: LeadSettings
  models: ModelInfo[]
  slash: SlashItem[]
  /** Whose agents symcc can run (serve's list), and which run now. */
  agents: { list: AgentChoice[]; current: string }
  onSay: Say
  onTask: (id: string) => void
}

/** The stream and the composer, as one assistant-ui thread. */
export function LeadChat({ chat, news, lanes, busy, lead, ready, settings, models, slash, agents, onSay, onTask }: LeadChatProps) {
  const now = useNow(60_000)
  const turn = useMemo(() => turnSteps(lead), [lead])
  const messages = useMemo<ThreadMessageLike[]>(() => {
    const lines: { m: ThreadMessageLike; atMs: number; row: Row }[] = [
      ...chat.map(c => ({ m: chatMessage(c), atMs: c.atMs, row: { kind: 'chat', item: c } as Row })),
      ...news.map(n => ({
        m: { id: `news-${n.key}`, role: 'system' as const, content: [{ type: 'text' as const, text: `${n.task} ${n.title}` }], createdAt: new Date(n.atMs) },
        atMs: n.atMs,
        row: { kind: 'news', news: n, ...(n.kind === 'merged' ? { lane: lanes.find(x => x.id === n.task && x.doneMs !== undefined) } : {}) } as Row,
      })),
    ].sort((a, b) => a.atMs - b.atMs)
    // the running turn comes last, until its answer is in the chat
    const last = chat[chat.length - 1]
    const answered = !!last && last.who !== 'owner' && last.atMs >= (turn[0]?.atMs ?? Infinity)
    if (busy && !answered) lines.push({ m: { id: 'live-turn', role: 'assistant', content: [{ type: 'text', text: '' }], status: { type: 'running' } }, atMs: Date.now(), row: { kind: 'live', steps: turn } })
    let day = ''
    return lines.map(({ m, atMs, row }) => {
      const d = dayWord(atMs, now)
      const first = d !== day
      day = d
      return { ...m, metadata: { custom: first ? { ...row, day: d } : row } }
    })
  }, [chat, news, lanes, busy, turn, now])

  const onNew = async (m: AppendMessage) => {
    const text = m.content
      .map(p => (p.type === 'text' ? p.text : ''))
      .join('\n')
      .trim()
    const images = (m.attachments ?? []).flatMap(a => (a.content ?? []).flatMap(c => (c.type === 'image' ? [imageOf(c.image)] : []))).filter((i): i is ChatImage => !!i)
    if (!text && !images.length) return
    if (runChatCommand(text, { settings, onSay })) return
    await ask({ type: 'send', text: text || 'Have a look at this picture.', ...(images.length ? { images } : {}) }).catch((err: Error) => onSay(err.message, true))
  }
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    convertMessage: m => m,
    // the owner can write while the lead works: what they send goes into its next turn (Stop is the composer's own)
    isRunning: false,
    isDisabled: !ready,
    onNew,
    adapters: { attachments: pictures },
  })
  const ctx = useMemo(() => ({ onTask }), [onTask])
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatCtx.Provider value={ctx}>
        <ThreadPrimitive.Root className="thread">
          <ThreadPrimitive.Viewport className="stream" aria-label="The lead and the board" aria-live="polite" aria-relevant="additions">
            {!messages.length && (
              <div className="stream-empty">
                <p>{ALL_CLEAR[0]}</p>
                <p className="quiet">{ALL_CLEAR[1]} It plans the work as tasks, and you see them here as they run and merge.</p>
              </div>
            )}
            <ThreadPrimitive.Messages>{renderMessage}</ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>
          <Composer ready={ready} busy={busy} settings={settings} models={models} slash={slash} agents={agents} onSay={onSay} />
        </ThreadPrimitive.Root>
      </ChatCtx.Provider>
    </AssistantRuntimeProvider>
  )
}

const renderMessage = () => <OneMessage />

function OneMessage() {
  const r = useAuiState(s => row(s.message))
  if (!r) return null
  const day = r.day ? <p className="day">{r.day}</p> : null
  if (r.kind === 'news')
    return (
      <>
        {day}
        <NewsLine n={r.news} lane={r.lane} />
      </>
    )
  if (r.kind === 'live')
    return (
      <>
        {day}
        <LiveTurn steps={r.steps} />
      </>
    )
  return (
    <>
      {day}
      <ChatLine c={r.item} />
    </>
  )
}

const openLeadSession = () => tell({ type: 'session', agent: LEAD_AGENT, title: "The lead's session" })

function Who({ icon, name, atMs, children }: { icon: ReactNode; name: string; atMs: number; children?: ReactNode }) {
  return (
    <div className="who">
      {icon}
      <b>{name}</b>
      <time>{clock(atMs)}</time>
      {children}
    </div>
  )
}

const you = (
  <span className="you" aria-hidden>
    <Icon name="account" />
  </span>
)

function ChatLine({ c }: { c: ChatItem }) {
  const { onTask } = useContext(ChatCtx)
  if (c.who === 'error')
    return (
      <MessagePrimitive.Root className="msg error" role="alert">
        <Icon name="error" />
        <p>{c.text}</p>
      </MessagePrimitive.Root>
    )
  if (c.who === 'owner')
    return (
      <MessagePrimitive.Root className="msg owner">
        <Who icon={you} name="You" atMs={c.atMs} />
        {!!c.images?.length && (
          <div className="pictures">
            {c.images.map((src, i) => (
              <img key={i} src={src} alt={`Picture ${i + 1} you sent`} />
            ))}
          </div>
        )}
        {!c.images?.length && !!c.pictures && (
          <p className="pictures-gone">
            <Icon name="file-media" /> {c.pictures === 1 ? 'A picture' : `${c.pictures} pictures`}
          </p>
        )}
        <p className="said">
          <Linked text={c.text} onTask={onTask} />
        </p>
      </MessagePrimitive.Root>
    )
  if (c.who === 'note')
    return (
      <MessagePrimitive.Root className="msg cmd">
        <Who
          icon={
            <span className="you" aria-hidden>
              <Icon name="terminal" />
            </span>
          }
          name="symcc"
          atMs={c.atMs}
        />
        <div className="cmd-body">
          <Markdown text={c.text} onTask={onTask} />
        </div>
        {!!c.steps?.length && <Work steps={c.steps} />}
      </MessagePrimitive.Root>
    )
  const { work, said } = workOf(c.steps ?? [])
  return (
    <MessagePrimitive.Root className="msg lead">
      <Who icon={<Mark size={22} />} name="Lead" atMs={c.atMs}>
        {c.model && <span className="model-tag">{c.model}</span>}
      </Who>
      {!!work.length && <Work steps={work} />}
      <Markdown text={c.text || said} onTask={onTask} />
      <ActionBarPrimitive.Root className="msg-actions" autohide="never">
        <CopyButton />
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  )
}

function CopyButton() {
  const copied = useAuiState(s => s.message.isCopied)
  return (
    <ActionBarPrimitive.Copy className="icon-btn" aria-label={copied ? 'Copied' : 'Copy the answer'} title={copied ? 'Copied' : 'Copy the answer'}>
      <Icon name={copied ? 'check' : 'copy'} />
    </ActionBarPrimitive.Copy>
  )
}

/** A turn's work, folded to one line ("Worked for 42s · 6 tools") that opens to its steps. */
function Work({ steps, live = false }: { steps: readonly PanelStep[]; live?: boolean }) {
  const [open, setOpen] = useState(live)
  const now = useNow(live ? 1000 : 60_000)
  return (
    <div className={`work${live ? ' live' : ''}`}>
      <button type="button" className="work-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <span>{workWords(steps, live, now)}</span>
      </button>
      {open && <StepList steps={steps} max={live ? 60 : 200} label={live ? "The lead's steps so far" : "The lead's steps for this answer"} />}
    </div>
  )
}

/** The lead's running turn: its work as it comes, open; what it says shows once it answers. */
function LiveTurn({ steps }: { steps: PanelStep[] }) {
  const work = steps.filter(s => s.kind !== 'status')
  return (
    <MessagePrimitive.Root className="msg lead live">
      <Who icon={<Mark size={22} />} name="Lead" atMs={steps[0]?.atMs ?? Date.now()}>
        <span className="live-word">
          <Icon name="loading" /> working
        </span>
        <button type="button" className="link" onClick={openLeadSession}>
          Open its session
        </button>
      </Who>
      {work.length ? <Work steps={work} live /> : <p className="quiet live-wait">It has started; its steps show here as they come.</p>}
    </MessagePrimitive.Root>
  )
}

const NEWS: Record<string, { icon: string; word: string }> = {
  created: { icon: 'add', word: 'added' },
  merged: { icon: 'git-merge', word: 'merged' },
  done: { icon: 'check', word: 'done' },
  failed: { icon: 'error', word: 'failed' },
  'checker-problems': { icon: 'warning', word: 'sent back by the checker' },
  rejected: { icon: 'close', word: 'rejected' },
  'approve-failed': { icon: 'error', word: 'could not merge' },
  stopped: { icon: 'debug-stop', word: 'stopped' },
}

function NewsLine({ n, lane }: { n: PanelNews; lane?: PanelLane }) {
  const { onTask } = useContext(ChatCtx)
  const k = NEWS[n.kind] ?? { icon: 'circle-small', word: n.kind }
  return (
    <p className={`news ${n.tone}`}>
      <Icon name={k.icon} />
      <button type="button" className="task-ref" onClick={() => onTask(n.task)}>
        {n.task}
      </button>
      <span className="news-title">{n.title}</span>
      <span className="news-word">{k.word}</span>
      {n.why && n.tone === 'bad' && (
        <span className="news-more news-why" title={n.why}>
          {n.why}
        </span>
      )}
      {lane && (
        <span className="news-more">
          {lane.tryNo === 1 ? 'first try' : `${lane.tryNo} tries`}
          {!!lane.tokens && ` · ${tokensWord(lane.tokens)} tokens`}
        </span>
      )}
      <time>{clock(n.atMs)}</time>
    </p>
  )
}

/* ---------- pictures ---------- */

const readUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

/** A picture as a data URL, made smaller (at most 1600px a side, as JPEG) when it is big. */
async function shrink(file: File): Promise<string> {
  const url = await readUrl(file)
  if (file.size <= 1_500_000) return url
  const img = new Image()
  await new Promise<void>((resolve, reject) => ((img.onload = () => resolve()), (img.onerror = () => reject(new Error("couldn't read the picture"))), (img.src = url)))
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

function imageOf(url: string): ChatImage | undefined {
  const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(url)
  return m ? { mimeType: m[1]!, data: m[2]! } : undefined
}

const pictures: AttachmentAdapter = {
  accept: 'image/png,image/jpeg,image/gif,image/webp',
  async add({ file }) {
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type: 'image', name: file.name || 'picture', contentType: file.type, file, status: { type: 'requires-action', reason: 'composer-send' } }
  },
  async send(a) {
    return { ...a, status: { type: 'complete' }, content: [{ type: 'image', image: await shrink(a.file) }] }
  },
  async remove() {},
}

function Picture() {
  const file = useAuiState(s => s.attachment.file)
  const name = useAuiState(s => s.attachment.name)
  const [src, setSrc] = useState('')
  useEffect(() => void (file ? readUrl(file).then(setSrc, () => undefined) : undefined), [file])
  const aui = useAui()
  return (
    <div className="picture">
      {src ? <img src={src} alt={name} /> : <Icon name="file-media" />}
      <button type="button" className="picture-remove" aria-label={`Remove ${name}`} title="Remove" onClick={() => void aui.attachment().remove()}>
        <Icon name="close" />
      </button>
    </div>
  )
}

/* ---------- the chat's own commands, the model and the mode ---------- */

const CHAT_COMMANDS: SlashItem[] = [
  { name: 'model', description: "Choose the model the lead's turns run on", kind: 'chat' },
  { name: 'plan', description: 'Plan mode: the lead thinks it through and changes no files', kind: 'chat' },
  { name: 'agent', description: 'Agent mode: the lead works as usual', kind: 'chat' },
  { name: 'summarize', description: "Condense the chat so far, to free the lead's memory", kind: 'chat' },
  { name: 'stop', description: "Stop the lead's running turn", kind: 'chat' },
]

let openModels: (() => void) | undefined

/** Runs one of the chat's own commands (/model, /plan, ...); false when `text` is none of them. */
function runChatCommand(text: string, o: { settings: LeadSettings; onSay: Say }): boolean {
  const name = /^\/(\w+)$/.exec(text.trim())?.[1]
  if (!name || !CHAT_COMMANDS.some(c => c.name === name)) return false
  if (name === 'model') openModels?.()
  else if (name === 'plan' || name === 'agent') {
    tell({ type: 'lead-set', settings: { ...o.settings, mode: name } })
    o.onSay(name === 'plan' ? 'Plan mode: the lead changes no files.' : 'Agent mode: the lead works as usual.')
  } else if (name === 'stop') tell({ type: 'lead-stop' })
  else if (name === 'summarize')
    void ask({ type: 'summarize' }).then(
      () => undefined,
      (err: Error) => o.onSay(err.message, true),
    )
  return true
}

type Params = Record<string, string>
const sameParams = (a: Params, b: Params) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v)
const defaultVariant = (m: ModelInfo) => m.variants.find(v => v.isDefault) ?? m.variants[0]
const paramsOf = (s: LeadSettings): Params => Object.fromEntries((s.model?.params ?? []).map(p => [p.id, p.value]))

/** Model `m` with option `id` set to `value`: of its variants with that value, the one that keeps most of `now`. */
function withOption(m: ModelInfo, now: Params, id: string, value: string): Params {
  const fits = m.variants.filter(v => v.params[id] === value)
  const kept = (v: { params: Params }) => Object.entries(v.params).filter(([k, x]) => now[k] === x).length
  return fits.sort((a, b) => kept(b) - kept(a))[0]?.params ?? { ...now, [id]: value }
}

/** The model's name with the options that differ from its default ("Claude Opus 5.5 · Extra High · 1M"). */
function modelLabel(m: ModelInfo, params: Params): string {
  const base = defaultVariant(m)?.params ?? {}
  const more = m.options.filter(o => params[o.id] !== undefined && params[o.id] !== base[o.id]).map(o => o.values.find(v => v.value === params[o.id])?.label)
  return [m.label, ...more.filter(Boolean)].join(' · ')
}

function settingsFor(m: ModelInfo | undefined, params: Params, mode: LeadSettings['mode']): LeadSettings {
  if (!m) return { mode }
  const variant = m.variants.find(v => sameParams(v.params, params))
  const list = Object.entries(params).map(([id, value]) => ({ id, value }))
  return { mode, model: { id: m.id, ...(list.length ? { params: list } : {}), ...(variant?.maxMode ? { maxMode: true } : {}) }, modelLabel: modelLabel(m, params) }
}

/** Closes popover `box` on a click outside it or Escape. */
function useDismiss(open: boolean, box: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && close()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc, true))
  }, [open, box, close])
}

type Agents = LeadChatProps['agents']

function ModelPicker({ settings, models, agents }: { settings: LeadSettings; models: ModelInfo[]; agents: Agents }) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const close = useMemo(() => () => (setOpen(false), setFind('')), [])
  useDismiss(open, box, close)
  useEffect(() => {
    openModels = () => setOpen(true)
    return () => void (openModels = undefined)
  }, [])
  const chosen = models.find(m => m.id === settings.model?.id)
  const params = paramsOf(settings)
  const q = find.trim().toLowerCase()
  const shown = q ? models.filter(m => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : models
  const pick = (m: ModelInfo | undefined) => tell({ type: 'lead-set', settings: settingsFor(m, m ? (defaultVariant(m)?.params ?? {}) : {}, settings.mode) })
  const options = chosen?.options.filter(o => o.values.length > 1) ?? []
  const variant = chosen?.variants.find(v => sameParams(v.params, params))
  return (
    <div className="picker" ref={box}>
      <button type="button" className="pill" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} title="The model the lead's turns run on">
        <Icon name="sparkle" />
        <span>{settings.modelLabel ?? 'Default model'}</span>
        <Icon name="chevron-up" />
      </button>
      {open && (
        <div className="pick-pop" role="dialog" aria-label="The lead's model">
          <input className="pick-find" type="search" placeholder="Find a model" value={find} onChange={e => setFind(e.target.value)} autoFocus aria-label="Find a model" />
          <ul className="pick-list">
            {!q && (
              <li>
                <button type="button" className="pick-item" aria-current={!settings.model || undefined} onClick={() => pick(undefined)}>
                  <span>
                    <b>Default model</b>
                    <small>The lead's own, from the symcc.leadModel setting</small>
                  </span>
                  {!settings.model && <Icon name="check" />}
                </button>
              </li>
            )}
            {shown.map(m => (
              <li key={m.id}>
                <button type="button" className="pick-item" aria-current={m.id === chosen?.id || undefined} onClick={() => pick(m)} title={m.description ?? m.id}>
                  <span>
                    <b>{m.label}</b>
                    {defaultVariant(m)?.maxMode && <em>Max</em>}
                  </span>
                  {m.id === chosen?.id && <Icon name="check" />}
                </button>
              </li>
            ))}
            {!shown.length && <li className="pick-none">{models.length ? 'No model by that name.' : 'The models show once symcc has listed them.'}</li>}
          </ul>
          {chosen && !!options.length && (
            <div className="pick-options" aria-label={`${chosen.label}'s options`}>
              {options.map(o => (
                <div key={o.id} className="pick-option">
                  <span>{o.label}</span>
                  <div className="seg" role="radiogroup" aria-label={o.label}>
                    {o.values.map(v => {
                      const can = chosen.variants.some(x => x.params[o.id] === v.value)
                      return (
                        <button
                          key={v.value}
                          type="button"
                          role="radio"
                          aria-checked={params[o.id] === v.value}
                          disabled={!can}
                          onClick={() => tell({ type: 'lead-set', settings: settingsFor(chosen, withOption(chosen, params, o.id, v.value), settings.mode) })}
                        >
                          {v.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {variant?.maxMode && <p className="pick-note">Max mode: this choice costs more per turn.</p>}
            </div>
          )}
          {agents.list.length > 1 && (
            <div className="pick-options" aria-label="Agents">
              <div className="pick-option">
                <span>Agents</span>
                <div className="seg" role="radiogroup" aria-label="Whose agents run the lead and the workers">
                  {agents.list.map(a => (
                    <button key={a.id} type="button" role="radio" aria-checked={a.id === agents.current} onClick={() => a.id !== agents.current && (tell({ type: 'agents-set', agents: a.id }), close())}>
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
              <p className="pick-note">symcc restarts with the agents you choose.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ModeSwitch({ settings }: { settings: LeadSettings }) {
  const set = (mode: LeadSettings['mode']) => mode !== settings.mode && tell({ type: 'lead-set', settings: { ...settings, mode } })
  return (
    <div className="seg mode-seg" role="radiogroup" aria-label="How the lead's turns run">
      <button type="button" role="radio" aria-checked={settings.mode === 'agent'} onClick={() => set('agent')} title="The lead works as usual: it plans tasks and uses its tools">
        <Icon name="person" /> Agent
      </button>
      <button type="button" role="radio" aria-checked={settings.mode === 'plan'} onClick={() => set('plan')} title="The lead thinks it through and changes no files">
        <Icon name="list-tree" /> Plan
      </button>
    </div>
  )
}

/* ---------- the composer and its slash menu ---------- */

const GROUP: Record<SlashItem['kind'], string> = { chat: 'This chat', symcc: 'symcc', skill: 'Skills' }
const ORDER: SlashItem['kind'][] = ['chat', 'symcc', 'skill']

const formatter: DirectiveFormatter = {
  serialize: item => (item.type === 'chat' ? '' : `/${item.id}`),
  parse: text => [{ kind: 'text', text }],
}

function slashAdapter(items: readonly SlashItem[]): TriggerAdapter {
  const all: TriggerItem[] = [...items]
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .map(c => ({ id: c.name, type: c.kind, label: `/${c.name}`, description: c.description, metadata: { ...(c.hint ? { hint: c.hint } : {}), ...(c.scope ? { scope: c.scope } : {}) } }))
  return {
    categories: () => [],
    categoryItems: () => [],
    search: query => {
      const q = query.toLowerCase()
      if (!q) return all
      const starts = all.filter(i => i.id.toLowerCase().startsWith(q))
      const has = all.filter(i => !starts.includes(i) && (i.id.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)))
      return [...starts, ...has]
    },
  }
}

function SlashList({ items }: { items: readonly TriggerItem[] }) {
  if (!items.length) return <p className="slash-none">No command or skill by that name.</p>
  return (
    <>
      {items.map((it, i) => (
        <div key={it.id} className="slash-row">
          {(i === 0 || items[i - 1]!.type !== it.type) && <p className="slash-group">{GROUP[it.type as SlashItem['kind']] ?? it.type}</p>}
          <ComposerPrimitive.TriggerPopoverItem item={it} index={i} className="slash-item" title={it.description}>
            <code>{it.label}</code>
            {typeof it.metadata?.hint === 'string' && <span className="slash-hint">{it.metadata.hint}</span>}
            <span className="slash-what">{it.description}</span>
            {it.metadata?.scope === 'user' && <span className="slash-scope">yours</span>}
          </ComposerPrimitive.TriggerPopoverItem>
        </div>
      ))}
    </>
  )
}

function Composer({ ready, busy, settings, models, slash, agents, onSay }: { ready: boolean; busy: boolean; settings: LeadSettings; models: ModelInfo[]; slash: SlashItem[]; agents: Agents; onSay: Say }) {
  const aui = useAui()
  const adapter = useMemo(() => slashAdapter([...CHAT_COMMANDS, ...slash]), [slash])
  const run = (item: TriggerItem) => {
    if (item.type !== 'chat') return
    aui.composer().setText(aui.composer().getState().text.trim())
    runChatCommand(`/${item.id}`, { settings, onSay })
  }
  const empty = useAuiState(s => !s.composer.text.trim() && !s.composer.attachments.length)
  return (
    <ComposerPrimitive.Root className="composer">
      <ComposerPrimitive.TriggerPopoverRoot>
        <ComposerPrimitive.TriggerPopover char="/" adapter={adapter} className="slash-pop" aria-label="Commands and skills">
          <ComposerPrimitive.TriggerPopover.Action formatter={formatter} onExecute={run} />
          <ComposerPrimitive.TriggerPopoverItems>{items => <SlashList items={items} />}</ComposerPrimitive.TriggerPopoverItems>
        </ComposerPrimitive.TriggerPopover>
        <div className="composer-pictures">
          <ComposerPrimitive.Attachments>{() => <Picture />}</ComposerPrimitive.Attachments>
        </div>
        <label className="sr" htmlFor="composer">
          Message the lead
        </label>
        <ComposerPrimitive.Input id="composer" className="composer-input" rows={1} maxRows={10} submitMode="enter" placeholder={settings.mode === 'plan' ? 'Ask the lead to plan something… (it changes no files)' : 'Tell the lead what you want next… / for commands and skills'} />
        <div className="composer-bar">
          <ModeSwitch settings={settings} />
          <ModelPicker settings={settings} models={models} agents={agents} />
          <ComposerPrimitive.AddAttachment className="icon-btn" aria-label="Add a picture" title="Add a picture (or paste one)">
            <Icon name="file-media" />
          </ComposerPrimitive.AddAttachment>
          <span className="composer-gap" />
          {busy && (
            <button type="button" className="btn ghost stop" onClick={() => tell({ type: 'lead-stop' })} title="Stop the lead's running turn">
              <Icon name="stop-circle" /> Stop
            </button>
          )}
          <ComposerPrimitive.Send className="btn primary send" disabled={!ready || empty}>
            <Icon name="send" />
            <span>Send</span>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.TriggerPopoverRoot>
      <p className="composer-hint">{busy ? 'The lead is working; what you send goes into its next turn.' : 'Enter sends · Shift+Enter for a new line · / for commands and skills'}</p>
    </ComposerPrimitive.Root>
  )
}
