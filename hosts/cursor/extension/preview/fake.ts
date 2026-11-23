// A stand-in for the extension in a plain browser: demo data (made up, for looking at the panel) and replies that
// act like the engine's, so every card and button can be tried. Loaded before the webview's bridge.
import type { ChatItem, FromWebview, PanelLane, PanelNeed, PanelNews, PanelTask, PanelView, ToWebview } from '../../protocol'

const now = Date.now()
const m = (min: number) => now - min * 60_000
const theme = new URLSearchParams(location.search).get('theme')
document.body.classList.add(theme === 'light' ? 'vscode-light' : 'vscode-dark')
if (new URLSearchParams(location.search).get('state') === 'off') (window as unknown as { __off: boolean }).__off = true

const stations4 = ['work', 'check', 'queue', 'tests', 'merged'] as const
const lane = (id: string, title: string, at: number, sinceMin: number, more: Partial<PanelLane> = {}): PanelLane => ({ id, title, kind: '', stations: [...stations4], at, skipped: [], sinceMs: m(sinceMin), tryNo: 1, tries: 3, agent: at === 0 || at === 1, ...more })

const task = (id: string, title: string, status: PanelTask['status'], word: string, more: Partial<PanelTask> = {}): PanelTask => ({ id, title, status, word, kind: '', role: 'general', attempts: status === 'todo' || status === 'backlog' ? 0 : 1, needsYou: false, actions: [], ...more })

let needs: PanelNeed[] = [
  { id: 'T-44', kind: 'asks', title: 'Which date format should the invoice CSV use for issued_at?', meta: 'T-44 · CSV export for invoices · question from the worker', choices: ['ISO 8601 (2026-11-23)', 'Locale (23/11/2026)', 'Answer…'], actions: [], sinceMs: m(4) },
  {
    id: 'T-39',
    kind: 'review',
    title: 'Rate-limit login attempts',
    meta: 'T-39 · ready for review',
    text: '+84 −12 in 3 files · tests passed',
    files: [
      { file: 'src/auth/limit.ts', added: 61, removed: 0 },
      { file: 'src/auth/login.ts', added: 9, removed: 12 },
      { file: 'test/auth/limit.test.ts', added: 14, removed: 0 },
    ],
    choices: [],
    actions: [{ id: 'approve', label: 'Approve', primary: true }, { id: 'show-changes', label: 'Show changes' }, { id: 'reject', label: 'Reject…', ask: 'What is wrong, for the next worker' }],
    sinceMs: m(9),
  },
  { id: 'T-40', kind: 'failed', title: 'Upgrade undici to 7', meta: 'T-40 · failed · try 2', text: 'tests failed: `npm test` (exit 1): 2 proxy tests time out after 5000 ms', choices: [], actions: [{ id: 'retry', label: 'Retry', primary: true }, { id: 'drop', label: 'Drop', ask: 'Why (optional)' }], sinceMs: m(17) },
]

const lanes: PanelLane[] = [
  lane('T-42', 'CSV export for invoices', 0, 4.2),
  lane('T-43', 'Fix the flaky date test', 3, 0.6, { agent: false, tokens: 48_200 }),
  lane('T-45', 'Webhook retry backoff', 1, 1.1, { tokens: 31_900 }),
  { ...lane('T-38', 'Dark mode toggle', 4, 0), doneMs: m(3), agent: false, tokens: 72_400 },
]

const next = [task('T-46', 'Paginate the customer list', 'todo', 'up next'), task('T-47', 'Docs for the export API', 'todo', 'up next', { kind: 'docs' }), task('T-48', 'Remove the old v1 routes', 'todo', 'up next'), task('T-49', 'Cache tax rates per region', 'todo', 'up next')]

const news: PanelNews[] = [
  { key: 'n1', task: 'T-42', title: 'CSV export for invoices', tone: 'other', kind: 'created', text: 'created by the owner', atMs: m(31) },
  { key: 'n2', task: 'T-39', title: 'Rate-limit login attempts', tone: 'other', kind: 'created', text: 'created by the owner', atMs: m(31) },
  { key: 'n3', task: 'T-40', title: 'Upgrade undici to 7', tone: 'bad', kind: 'failed', text: 'tests failed', atMs: m(17) },
  { key: 'n4', task: 'T-38', title: 'Dark mode toggle', tone: 'good', kind: 'merged', text: 'merged', atMs: m(3) },
]

let chat: ChatItem[] = [
  { key: 'c1', who: 'owner', text: 'Add CSV export to invoices, and make the login rate limit 5 tries a minute.', atMs: m(32) },
  { key: 'c2', who: 'lead', text: 'Two tasks:\n- **T-42** CSV export for invoices\n- **T-39** rate-limit login attempts\n\nThey touch different files, so both run now. I set T-39 to wait for your review before it merges.', atMs: m(31) },
  { key: 'c3', who: 'lead', text: 'T-39 is ready for your review. T-40 failed its tests twice: the proxy tests time out on undici 7. Retry it with a longer timeout, or drop it?', atMs: m(8) },
]

function view(): PanelView {
  const off = (window as unknown as { __off?: boolean }).__off
  return {
    on: !off,
    ...(off ? { off: 'symcc is not set up in this project yet.' } : {}),
    project: 'billing-service',
    branch: 'main',
    mode,
    modes: [
      { mode: 'paused', name: 'paused', meaning: 'no work runs; tasks in review can still be approved or rejected' },
      { mode: 'review', name: 'approve merge', meaning: 'work runs; finished tasks wait for your approve or reject' },
      { mode: 'auto', name: 'auto merge', meaning: 'work runs; finished tasks that pass merge on their own' },
    ],
    maxParallel: 3,
    needs,
    lanes,
    next,
    tasks: [
      ...needs.filter(n => n.id.startsWith('T-')).map(n => task(n.id, n.id === 'T-44' ? 'CSV export for invoices' : n.title, n.kind === 'failed' ? 'failed' : n.kind === 'review' ? 'review' : 'waiting', n.kind === 'failed' ? 'failed' : n.kind === 'review' ? 'ready for review' : 'waits for you', { needsYou: true, actions: n.actions })),
      task('T-43', 'Fix the flaky date test', 'doing', 'running', { kind: 'bug', details: 'The date test fails around midnight UTC because it builds “today” from the local clock.' }),
      task('T-45', 'Webhook retry backoff', 'doing', 'running', { actions: [{ id: 'pause', label: 'Pause', primary: true }, { id: 'drop', label: 'Drop', ask: 'Why (optional)' }] }),
      ...next,
      task('T-38', 'Dark mode toggle', 'done', 'done'),
      task('T-50', 'Try a faster CSV writer', 'backlog', 'backlog', { kind: 'investigation' }),
    ],
    news,
    scouts: [
      { name: 'test-gaps', summary: 'Looks for modules with no tests and suggests the ones worth covering.', every: 'every day', running: false, paused: false, lastRunMs: m(190), nextRunMs: now + 21 * 3_600_000 },
      { name: 'secrets', summary: 'Looks for keys and tokens committed by mistake.', every: 'every 2 days', running: true, paused: false, lastRunMs: m(2900) },
    ],
    counts: { needs: needs.length, running: 3, next: next.length, doneToday: 6, backlog: 1 },
    nowMs: Date.now(),
  }
}

const send = (msg: ToWebview) => window.dispatchEvent(new MessageEvent('message', { data: msg }))
const later = (ms: number, fn: () => void) => setTimeout(fn, ms)
let busy = false
let mode: PanelView['mode'] = 'review'
const net = new URLSearchParams(location.search).get('state') === 'net'

window.acquireVsCodeApi = () => ({
  postMessage(msg: FromWebview) {
    if (msg.type === 'ready') {
      send({ type: 'engine', engine: { state: 'ready' } })
      send({ type: 'chat', items: chat, busy })
      send({ type: 'view', view: view() })
      if (net) send({ type: 'network', problem: { text: 'the lead could not run: Network request failed', proxy: '' } })
      return
    }
    if (msg.type === 'restart' || msg.type === 'log') return
    const reply = (text: string) => later(450, () => send({ type: 'reply', id: msg.id, ok: true, text }))
    if (msg.type === 'send') {
      chat = [...chat, { key: `o${Date.now()}`, who: 'owner', text: msg.text, atMs: Date.now() }]
      busy = true
      send({ type: 'chat', items: chat, busy })
      reply('sent')
      later(1800, () => {
        busy = false
        chat = [...chat, { key: `l${Date.now()}`, who: 'lead', text: 'Got it. I added it to the board as **T-51**; it starts once a worker is free.', atMs: Date.now() }]
        send({ type: 'chat', items: chat, busy })
      })
      return
    }
    if (msg.type === 'answer' || msg.type === 'act') {
      const id = msg.type === 'answer' ? msg.need : msg.task
      if (msg.type === 'act' && msg.action === 'show-changes') return reply('')
      reply(msg.type === 'answer' ? `${id} got your answer; it went back to work.` : `${id}: ${msg.action === 'approve' ? 'approved; merging now' : msg.action}`)
      later(700, () => ((needs = needs.filter(n => n.id !== id)), send({ type: 'view', view: view() })))
      return
    }
    if (msg.type === 'mode') {
      mode = msg.mode
      reply(`The board is now in ${msg.mode === 'paused' ? 'paused' : msg.mode === 'review' ? 'approve merge' : 'auto merge'} mode.`)
      later(450, () => send({ type: 'view', view: view() }))
      return
    }
    if (msg.type === 'proxy') {
      reply('symcc restarted with the new proxy.')
      later(450, () => send({ type: 'network', problem: null }))
      return
    }
    reply('done')
  },
})
