// A stand-in for the extension in a plain browser: demo data (made up, for looking at the panel) and replies that
// act like the engine's, so every card and button can be tried. Loaded before the webview's bridge.
import type { ChatItem, FromWebview, LeadSettings, ModelInfo, PanelLane, PanelNeed, PanelNews, PanelOrgMem, PanelOrgNote, PanelStep, PanelTask, PanelView, PanelWorktree, SlashItem, ToWebview } from '../../protocol'
import { copilotModels } from '../../copilot'

const now = Date.now()
const m = (min: number) => now - min * 60_000
const theme = new URLSearchParams(location.search).get('theme')
document.body.classList.add(theme === 'light' ? 'vscode-light' : 'vscode-dark')
const state = new URLSearchParams(location.search).get('state')
if (new URLSearchParams(location.search).get('surface') === 'side') document.body.dataset.surface = 'side'
if (state === 'off') (window as unknown as { __off: boolean }).__off = true
// ?agents=copilot: the lead and the workers on GitHub Copilot's agents
const copilot = new URLSearchParams(location.search).get('agents') === 'copilot'

const stations4 = ['work', 'check', 'queue', 'tests', 'done'] as const
const lane = (id: string, title: string, at: number, sinceMin: number, more: Partial<PanelLane> = {}): PanelLane => ({ id, title, kind: '', stations: [...stations4], at, skipped: [], sinceMs: m(sinceMin), tryNo: 1, tries: 3, agent: at === 0 || at === 1, ...more })

const task = (id: string, title: string, status: PanelTask['status'], word: string, more: Partial<PanelTask> = {}): PanelTask => ({ id, title, status, word, kind: '', role: 'general', attempts: status === 'todo' || status === 'backlog' ? 0 : 1, needsYou: false, actions: [], sessions: [], ...more })

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
  lane('T-42', 'CSV export for invoices', 0, 4.2, { agentId: 'cursor-1-a' }),
  lane('T-43', 'Fix the flaky date test', 3, 0.6, { agent: false, tokens: 48_200 }),
  lane('T-45', 'Webhook retry backoff', 0, 1.1, { tokens: 31_900, agentId: 'cursor-2-b', tryNo: 2 }),
  { ...lane('T-38', 'Dark mode toggle', 4, 0), doneMs: m(3), agent: false, tokens: 72_400 },
]

const next = [task('T-46', 'Paginate the customer list', 'todo', 'up next'), task('T-47', 'Docs for the export API', 'todo', 'up next', { kind: 'docs' }), task('T-48', 'Remove the old v1 routes', 'todo', 'up next'), task('T-49', 'Cache tax rates per region', 'todo', 'up next')]

const news: PanelNews[] = [
  { key: 'n1', task: 'T-42', title: 'CSV export for invoices', tone: 'other', kind: 'created', text: 'created by the owner', atMs: m(31) },
  { key: 'n2', task: 'T-39', title: 'Rate-limit login attempts', tone: 'other', kind: 'created', text: 'created by the owner', atMs: m(31) },
  { key: 'n3', task: 'T-40', title: 'Upgrade undici to 7', tone: 'bad', kind: 'failed', text: 'tests failed', why: 'tests failed: `…` (exit 1): 2 proxy tests time out after 5000 ms', atMs: m(17) },
  { key: 'n4', task: 'T-38', title: 'Dark mode toggle', tone: 'good', kind: 'merged', text: 'merged', atMs: m(3) },
]

let chat: ChatItem[] = [
  { key: 'c1', who: 'owner', text: 'Add CSV export to invoices, and make the login rate limit 5 tries a minute.', atMs: m(32) },
  {
    key: 'c2',
    who: 'lead',
    text: 'Two tasks:\n- **T-42** CSV export for invoices\n- **T-39** rate-limit login attempts\n\nThey touch different files, so both run now. I set T-39 to wait for your review before it merges.',
    atMs: m(31),
    model: 'Composer 2.5',
    steps: [
      { atMs: m(31.9), kind: 'thinking', text: 'Two separate asks. Check the board for anything on invoices or login first, so I do not add a duplicate.' },
      { atMs: m(31.85), kind: 'tool', tool: 'symcc_board', callId: 'b0', status: 'completed', text: 'list' },
      { atMs: m(31.8), kind: 'tool', tool: 'read', callId: 'r0', status: 'completed', text: 'src/auth/login.ts' },
      { atMs: m(31.75), kind: 'tool', tool: 'symcc_add_task', callId: 'a1', status: 'completed', text: 'CSV export for invoices' },
      { atMs: m(31.7), kind: 'tool', tool: 'symcc_add_task', callId: 'a2', status: 'completed', text: 'Rate-limit login attempts' },
    ],
  },
  { key: 'c2b', who: 'owner', text: '/symcc-tasks', atMs: m(30) },
  { key: 'c2c', who: 'note', text: '**Needs you** (1)\n- T-44 CSV export for invoices: a question\n\n**Running** (2)\n- T-42 CSV export for invoices\n- T-39 Rate-limit login attempts', atMs: m(30) },
  {
    key: 'c2d',
    who: 'lead',
    model: 'Claude Opus 5.5 · Extra High',
    text: [
      '## Where the invoice work stands',
      '',
      'Three pieces, in the order they merge:',
      '',
      '1. **CSV export** (T-42): the writer is in `src/invoices/csv.ts`; it waits on your date-format answer.',
      '',
      '2. **Rate limit** (T-39): 5 tries a minute per account, kept in `src/auth/limit.ts:18`. Ready for review.',
      '   - the counter resets on a successful login',
      '   - a locked account gets a `429` with `Retry-After`',
      '',
      '3. **Backoff** (T-45): second try; the first one hit the flaky date test.',
      '',
      '| Task | Files | Lines | Tests |',
      '| --- | --- | ---: | --- |',
      '| T-42 | 4 | +212 −8 | running |',
      '| T-39 | 3 | +84 −12 | passed |',
      '| T-45 | 2 | +37 −5 | not yet |',
      '',
      'The limit itself is one line:',
      '',
      '```ts',
      'export const LOGIN_LIMIT = { tries: 5, perMs: 60_000 } as const',
      '```',
      '',
      '```diff',
      '@@ -12,3 +12,4 @@ export async function login(req: Request) {',
      '-  const user = await users.find(req.body.email)',
      '+  await limiter.take(req.body.email)',
      '+  const user = await users.find(req.body.email)',
      '   if (!user) return unauthorized()',
      '```',
      '',
      '> Nothing else needs you right now. See [the rate-limit RFC](https://datatracker.ietf.org/doc/html/rfc6585) for 429.',
    ].join('\n'),
    atMs: m(20),
  },
  { key: 'c3', who: 'lead', text: 'T-39 is ready for your review. T-40 failed its tests twice: the proxy tests time out on undici 7. Retry it with a longer timeout, or drop it?', atMs: m(8) },
]

const SESSIONS: Record<string, PanelTask['sessions']> = {
  'T-45': [
    { label: 'Try 2', agent: 'cursor-2-b', running: true },
    { label: 'Try 1', agent: 'cursor-0-y', running: false },
  ],
  'T-40': [
    { label: 'Try 2', agent: 'cursor-3-c', running: false },
    { label: 'Try 1', agent: 'cursor-0-z', running: false },
  ],
  'T-39': [{ label: 'Try 1', agent: 'cursor-4-d', running: false }],
}

const step = (min: number, kind: PanelStep['kind'], text: string, more: Partial<PanelStep> = {}): PanelStep => ({ atMs: m(min), kind, text, ...more })
const tool = (min: number, name: string, text: string, status: PanelStep['status'] = 'completed') => step(min, 'tool', text, { tool: name, status, callId: `${name}-${min}` })
const steps: Record<string, PanelStep[]> = {
  'cursor-1-a': [step(4.2, 'status', 'running'), step(4.1, 'thinking', 'The invoice model has issued_at as a Date; the CSV needs one format. I should ask the owner which one.'), tool(4, 'read', 'src/invoices/model.ts'), tool(3.9, 'grep', 'issued_at'), step(3.8, 'text', 'Asked the owner which date format the CSV uses.'), tool(3.7, 'symcc_ask', 'Which date format should the invoice CSV use for issued_at?')],
  'cursor-2-b': [
    step(1.1, 'status', 'running'),
    step(1.05, 'thinking', 'Try 1 retried at once and hammered the endpoint. Read the retry loop first, then add exponential backoff with jitter.'),
    tool(1, 'read', 'src/webhooks/deliver.ts'),
    tool(0.9, 'grep', 'retryDelay'),
    tool(0.7, 'edit', 'src/webhooks/deliver.ts'),
    step(0.5, 'text', 'Backoff is in: 1s, 2s, 4s up to 5 tries, with up to 20% jitter. Running the webhook tests now.'),
    tool(0.2, 'shell', 'npm test -- test/webhooks', 'running'),
  ],
  'cursor-3-c': [step(20, 'status', 'running'), tool(19, 'shell', 'npm install undici@7'), tool(18, 'shell', 'npm test', 'error'), step(17.5, 'text', 'Two proxy tests time out after 5000 ms on undici 7; I could not make them pass.'), step(17.4, 'status', 'finished')],
  lead: [step(32, 'status', 'running'), tool(31.8, 'symcc_add_task', 'CSV export for invoices'), tool(31.7, 'symcc_add_task', 'Rate-limit login attempts'), step(31.6, 'status', 'finished')],
}
const models: ModelInfo[] = [
  { id: 'default', label: 'Auto', options: [], variants: [{ params: {}, isDefault: true }] },
  { id: 'composer-2.5', label: 'Composer 2.5', options: [{ id: 'fast', label: 'Fast', values: [{ value: 'false', label: 'Off' }, { value: 'true', label: 'Fast' }] }], variants: [{ params: { fast: 'true' }, isDefault: true }, { params: { fast: 'false' } }] },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    options: [
      { id: 'context', label: 'Context', values: [{ value: '300k', label: '300K' }, { value: '1m', label: '1M' }] },
      { id: 'effort', label: 'Effort', values: ['low', 'medium', 'high', 'xhigh', 'max'].map(v => ({ value: v, label: v === 'xhigh' ? 'Extra High' : v[0]!.toUpperCase() + v.slice(1) })) },
    ],
    variants: ['300k', '1m'].flatMap(c => ['low', 'medium', 'high', 'xhigh', 'max'].map(e => ({ params: { context: c, effort: e }, ...(c === '1m' ? { maxMode: true } : {}), ...(c === '300k' && e === 'high' ? { isDefault: true } : {}) }))),
  },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', options: [{ id: 'reasoning', label: 'Reasoning', values: ['low', 'medium', 'high'].map(v => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) })) }], variants: ['low', 'medium', 'high'].map(v => ({ params: { reasoning: v }, ...(v === 'medium' ? { isDefault: true } : {}) })) },
  { id: 'gemini-4-neon', label: 'Gemini 4 Neon', options: [], variants: [{ params: {}, isDefault: true }] },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', options: [], variants: [{ params: {}, isDefault: true }] },
]
const slash: SlashItem[] = [
  { name: 'symcc', description: 'Open the symcc board panel: tasks and scouts', kind: 'symcc' },
  { name: 'symcc-tasks', description: 'List the open symcc tasks in the chat, grouped as on the board', kind: 'symcc' },
  { name: 'symcc-status', description: 'Show the symcc Live tab as text in the chat', kind: 'symcc' },
  { name: 'symcc-approve', description: 'Approve a symcc task that is ready for review (merge it)', kind: 'symcc', hint: '<T-id>' },
  { name: 'symcc-stats', description: 'Show symcc time and token stats: the whole team, totals, averages per task and per try', kind: 'symcc', hint: '[full|html] [7d]' },
  { name: 'tdd', description: 'Test-driven development. Use when the user wants to build features or fix bugs test-first', kind: 'skill', scope: 'user' },
  { name: 'grill-me', description: 'A relentless interview to sharpen a plan or design.', kind: 'skill', scope: 'user' },
  { name: 'release-notes', description: 'Write the release notes for the next tag from the merged tasks', kind: 'skill', scope: 'project' },
]
const efforts = ['low', 'medium', 'high', 'xhigh', 'max']
const copilotList = copilotModels([
  { id: 'auto', name: 'Auto' },
  { id: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5', supportedReasoningEfforts: efforts },
  { id: 'claude-opus-5.5', name: 'Claude Opus 5.5', supportedReasoningEfforts: efforts },
  { id: 'claude-haiku-5.5', name: 'Claude Haiku 5.5', supportedReasoningEfforts: efforts },
  { id: 'gpt-6.2-sol', name: 'GPT-6.2 Sol', supportedReasoningEfforts: efforts },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex', supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon', supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'grok-4.7', name: 'Grok 4.7', supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'mai-code-2', name: 'MAI Code 2', supportedReasoningEfforts: efforts },
])
let lead: LeadSettings = copilot
  ? { mode: 'agent', model: { id: 'claude-sonnet-5.5', params: [{ id: 'reasoning', value: 'high' }] }, modelLabel: 'Claude Sonnet 5.5 · High' }
  : { mode: 'agent', model: { id: 'claude-opus-5-5', params: [{ id: 'context', value: '300k' }, { id: 'effort', value: 'high' }] }, modelLabel: 'Claude Opus 5.5' }

const leadTurn = (): PanelStep[] => {
  const t = Date.now()
  return [
    { atMs: t - 9000, kind: 'status', text: 'running' },
    { atMs: t - 8000, kind: 'thinking', text: 'The owner wants a status page. Check what the board has on monitoring first.' },
    { atMs: t - 6000, kind: 'tool', tool: 'symcc_board', callId: 'b1', status: 'completed', text: 'list' },
    { atMs: t - 4000, kind: 'tool', tool: 'read', callId: 'r1', status: 'completed', text: 'src/health/index.ts' },
    { atMs: t - 2000, kind: 'tool', tool: 'shell', callId: 's1', status: 'running', text: 'rg -n "uptime" src' },
  ]
}

/** ?state=idle: all done, nothing running or waiting, a backlog left. */
function view(): PanelView {
  const v = busyView()
  if (state !== 'idle') return v
  const backlog = v.tasks.filter(t => t.status === 'backlog')
  return {
    ...v,
    needs: [],
    lanes: [],
    next: [],
    tasks: v.tasks.filter(t => t.status === 'done' || t.status === 'backlog'),
    counts: { needs: 0, running: 0, next: 0, doneToday: 6, backlog: backlog.length },
    idle: { kind: 'done', text: 'All done · last merged T-38, 4m ago', hint: `Tell the lead what's next, or move one of ${backlog.length} backlog items to todo.`, next: backlog.map(t => ({ id: t.id, title: t.title })), more: 0 },
  }
}

function busyView(): PanelView {
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
      ...needs.filter(n => n.id.startsWith('T-')).map(n => task(n.id, n.id === 'T-44' ? 'CSV export for invoices' : n.title, n.kind === 'failed' ? 'failed' : n.kind === 'review' ? 'review' : 'waiting', n.kind === 'failed' ? 'failed' : n.kind === 'review' ? 'ready for review' : 'waits for you', { needsYou: true, actions: n.actions, sessions: SESSIONS[n.id] ?? [] })),
      task('T-42', 'CSV export for invoices', 'doing', 'running'),
      task('T-43', 'Fix the flaky date test', 'doing', 'running', { kind: 'bug', details: 'The date test fails around midnight UTC because it builds “today” from the local clock.' }),
      task('T-45', 'Webhook retry backoff', 'doing', 'running', { attempts: 2, sessions: SESSIONS['T-45']!, actions: [{ id: 'pause', label: 'Pause', primary: true }, { id: 'drop', label: 'Drop', ask: 'Why (optional)' }] }),
      ...next,
      task('T-38', 'Dark mode toggle', 'done', 'done'),
      task('T-50', 'Try a faster CSV writer', 'backlog', 'backlog', { kind: 'investigation' }),
      task('T-52', 'Export invoices as PDF too', 'backlog', 'backlog'),
      task('T-53', 'Remember the last CSV filter per user', 'backlog', 'backlog'),
      task('T-31', 'Sketch CSV ideas', 'done', 'done'),
    ],
    news,
    scouts: [
      { name: 'test-gaps', summary: 'Looks for modules with no tests and suggests the ones worth covering.', every: 'every day', running: false, paused: false, lastRunMs: m(190), nextRunMs: now + 21 * 3_600_000 },
      { name: 'secrets', summary: 'Looks for keys and tokens committed by mistake.', every: 'every 2 days', running: true, paused: false, lastRunMs: m(2900) },
    ],
    counts: { needs: needs.length, running: 3, next: next.length, doneToday: 6, backlog: 3 },
    idle: { kind: 'waiting', text: 'Nothing running · 2 waiting: T-46 waits for T-42, T-47 waits for T-46', next: [], more: 0 },
    orgMem: orgMem(),
    dir: '.symcc',
    nowMs: Date.now(),
  }
}

let notes: Omit<PanelOrgNote, 'key' | 'head' | 'ask'>[] = [
  { n: 7, date: '2026-11-23', topic: 'tests', text: 'Run one test file with npm test -- test/invoices; the whole suite takes four minutes.' },
  { n: 6, date: '2026-11-22', topic: 'git', text: 'Rebase on main before asking for review; main moves several times a day.' },
  { n: 5, date: '2026-11-21', topic: 'tests', text: 'The date tests pin TZ=UTC in package.json; never build today from the local clock.' },
  { n: 4, date: '2026-11-20', topic: 'api', text: 'Every route returns errors as { error, code }; reuse src/http/errors.ts.' },
  { n: 3, date: '2026-11-19', topic: 'ci', text: 'CI skips the e2e job on branches named symcc/*; run npm run e2e locally when touching routes.' },
  { n: 2, date: '2026-11-18', topic: 'api', text: 'Money is integer cents everywhere; format it only in src/format/money.ts.' },
  { n: 1, date: '', topic: 'unsorted', text: 'Ask Dana before changing anything under src/billing/legacy.' },
]
function orgMem(): PanelOrgMem {
  const file = '.symcc/org-mem.md'
  const counts = new Map<string, number>()
  for (const x of notes) counts.set(x.topic, (counts.get(x.topic) ?? 0) + 1)
  const topics = [...counts].map(([topic, count]) => ({ topic, count })).sort((a, b) => (a.topic === 'unsorted' ? 1 : b.topic === 'unsorted' ? -1 : b.count - a.count || a.topic.localeCompare(b.topic)))
  return {
    file,
    max: 60,
    title: 'Organizational memory (org-mem)',
    subtitle: 'Notes shared with workers, checkers and scouts',
    about: `Notes for the agents: symcc puts ${file} (at most 60 lines) into every new worker's, checker's and scout's prompt. Agents may suggest notes right after they hand back a task (one short follow-up question); the lead decides what goes in. You may edit the file by hand too.`,
    empty: 'No notes yet.',
    topics,
    notes: notes.map(x => {
      const head = `#${x.n} · ${x.date || 'written by hand'}`
      return { ...x, key: x.n.toString(16).padStart(6, '0'), head, ask: `Delete note ${head} from ${file}?` }
    }),
  }
}

const ROOT = '/home/dana/src/billing-service'
const tree = (task: string, more: Partial<PanelWorktree>): PanelWorktree => ({ path: `${ROOT}/.symcc/worktrees/${task}`, where: `.symcc/worktrees/${task}`, kind: 'task', task, branch: `symcc/${task}`, head: 'a1b2c3d4e', base: 'main', ahead: 0, behind: 0, files: [], dirty: 0, untracked: 0, commits: [], lastCommitMs: m(12), ...more })
let worktrees: PanelWorktree[] = [
  tree('T-42', { ahead: 2, behind: 1, dirty: 3, untracked: 1, files: [{ file: 'src/invoices/csv.ts', added: 148, removed: 0 }, { file: 'src/invoices/routes.ts', added: 31, removed: 6 }, { file: 'test/invoices/csv.test.ts', added: 33, removed: 2 }], commits: [{ sha: '9f1c2ab', subject: 'Add the CSV writer for invoices', atMs: m(9) }, { sha: '4d7e0aa', subject: 'Route GET /invoices.csv', atMs: m(3) }] }),
  tree('T-43', { ahead: 1, files: [{ file: 'test/dates.test.ts', added: 6, removed: 4 }], commits: [{ sha: '17bd2e0', subject: 'Build “today” from UTC in the date test', atMs: m(1) }] }),
  tree('T-45', { ahead: 1, behind: 4, dirty: 2, files: [{ file: 'src/webhooks/retry.ts', added: 29, removed: 5 }, { file: 'test/webhooks/retry.test.ts', added: 8, removed: 0 }], commits: [{ sha: 'c0ffee1', subject: 'Back off webhook retries exponentially', atMs: m(14) }] }),
  tree('T-39', { ahead: 3, files: [{ file: 'src/auth/limit.ts', added: 61, removed: 0 }, { file: 'src/auth/login.ts', added: 9, removed: 12 }, { file: 'test/auth/limit.test.ts', added: 14, removed: 0 }], commits: [{ sha: 'b16b00b', subject: 'Limit login attempts to 5 a minute', atMs: m(11) }, { sha: '0ddba11', subject: 'Answer 429 with Retry-After', atMs: m(10) }, { sha: 'facade1', subject: 'Test the login limit', atMs: m(9) }] }),
  tree('T-40', { ahead: 1, behind: 7, files: [{ file: 'package.json', added: 1, removed: 1 }, { file: 'package-lock.json', added: 40, removed: 38 }], commits: [{ sha: 'deadbe7', subject: 'Upgrade undici to 7', atMs: m(17) }], lastCommitMs: m(17) }),
  tree('T-31', { dirty: 2, files: [{ file: 'notes/csv-ideas.md', added: 12, removed: 0 }], lastCommitMs: m(60 * 26) }),
  { path: ROOT, where: 'billing-service', kind: 'main', branch: 'main', head: '3e4f5a6b7', base: 'origin/main', ahead: 2, behind: 0, files: [{ file: 'README.md', added: 3, removed: 1 }], dirty: 1, untracked: 0, commits: [{ sha: '3e4f5a6', subject: 'Merge T-38: Dark mode toggle', atMs: m(4) }, { sha: '8a9b0c1', subject: 'Merge T-37: Cache tax rates', atMs: m(70) }], lastCommitMs: m(4) },
  { path: '/home/dana/orca/billing-service/pricing-page', where: '~/orca/billing-service/pricing-page', kind: 'other', branch: 'dana/pricing-page', head: '5566778', base: 'origin/dana/pricing-page', ahead: 0, behind: 0, files: [], dirty: 0, untracked: 0, commits: [], lastCommitMs: m(60 * 5) },
]

const AGENTS = [
  { id: 'cursor', name: 'Cursor' },
  { id: 'copilot', name: 'GitHub Copilot' },
]
const send = (msg: ToWebview) => window.dispatchEvent(new MessageEvent('message', { data: msg }))
const later = (ms: number, fn: () => void) => setTimeout(fn, ms)
let busy = state === 'busy'
let mode: PanelView['mode'] = 'review'
const net = new URLSearchParams(location.search).get('state') === 'net'

window.acquireVsCodeApi = () => ({
  postMessage(msg: FromWebview) {
    if (msg.type === 'ready') {
      send({ type: 'engine', engine: { state: 'ready' } })
      send({ type: 'chat', items: chat, busy })
      send({ type: 'view', view: view() })
      send({ type: 'steps', all: busy ? { ...steps, lead: [...steps.lead!, ...leadTurn()] } : steps })
      send({ type: 'lead', settings: lead })
      send({ type: 'models', models: copilot ? copilotList : models })
      send({ type: 'slash', items: slash })
      send({ type: 'agents', list: AGENTS, current: copilot ? 'copilot' : 'cursor' })
      if (net) send({ type: 'network', problem: { text: 'the lead could not run: Network request failed', proxy: '', service: copilot ? 'GitHub Copilot' : 'Cursor' } })
      return
    }
    if (msg.type === 'restart' || msg.type === 'log' || msg.type === 'session' || msg.type === 'open-file' || msg.type === 'open-board') return
    // serve restarts with the other agents: here, the page reloads with them
    if (msg.type === 'agents-set') return void location.assign(`?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), agents: msg.agents })}`)
    if (msg.type === 'worktrees') return void later(250, () => send({ type: 'worktrees', list: worktrees, atMs: Date.now() }))
    if (msg.type === 'worktree') {
      const w = worktrees.find(x => x.path === msg.path)
      const text = msg.action === 'copy' ? "Copied the folder's path." : msg.action === 'remove' ? `Removed ${w?.where}. Its branch ${w?.branch} is kept.` : ''
      if (msg.action === 'remove') later(500, () => ((worktrees = worktrees.filter(x => x.path !== msg.path)), send({ type: 'worktrees', list: worktrees, atMs: Date.now() })))
      return void later(300, () => send({ type: 'reply', id: msg.id, ok: true, text }))
    }
    if (msg.type === 'lead-set') return void ((lead = msg.settings), send({ type: 'lead', settings: lead }))
    if (msg.type === 'lead-stop') {
      if (!busy) return
      busy = false
      chat = [...chat, { key: `s${Date.now()}`, who: 'note', text: 'You stopped the lead.', atMs: Date.now() }]
      return send({ type: 'chat', items: chat, busy })
    }
    const reply = (text: string) => later(450, () => send({ type: 'reply', id: msg.id, ok: true, text }))
    if (msg.type === 'summarize') {
      reply('')
      return later(900, () => ((chat = [...chat, { key: `z${Date.now()}`, who: 'note', text: 'The lead summarized the chat so far to free its memory.', atMs: Date.now() }]), send({ type: 'chat', items: chat, busy })))
    }
    if (msg.type === 'send') {
      chat = [...chat, { key: `o${Date.now()}`, who: 'owner', text: msg.text, atMs: Date.now(), ...(msg.images?.length ? { images: msg.images.map(i => `data:${i.mimeType};base64,${i.data}`) } : {}) }]
      if (msg.text.startsWith('/symcc')) {
        chat = [...chat, { key: `n${Date.now()}`, who: 'note', text: `${msg.text.split(' ')[0]}: the board has 4 tasks open.`, atMs: Date.now() }]
        send({ type: 'chat', items: chat, busy })
        return reply('')
      }
      busy = true
      send({ type: 'chat', items: chat, busy })
      reply('sent')
      const turn = leadTurn()
      turn.forEach((s, i) => later(300 + i * 500, () => send({ type: 'step', agent: 'lead', step: { ...s, atMs: Date.now() } })))
      later(3400, () => {
        if (!busy) return
        busy = false
        chat = [...chat, { key: `l${Date.now()}`, who: 'lead', text: 'Got it. I added it to the board as **T-51**; it starts once a worker is free.', atMs: Date.now(), steps: turn.filter(x => x.kind !== 'status').map(x => ({ ...x, status: x.status === 'running' ? 'completed' : x.status })), ...(lead.modelLabel ? { model: lead.modelLabel } : {}) }]
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
    if (msg.type === 'forget') {
      const gone = notes.find(x => x.n === msg.n)
      notes = notes.filter(x => x !== gone).map(x => (x.n > msg.n ? { ...x, n: x.n - 1 } : x))
      reply(gone ? `Deleted note ${msg.n} from .symcc/org-mem.md${gone.date ? ` (${gone.date})` : ''}.` : `No note ${msg.n}.`)
      later(300, () => send({ type: 'view', view: view() }))
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
