// The board's serve side (../board.ts) with a fake session: what a webview gets when it opens, what is kept between
// runs, a network problem and the proxy, files and sessions the lead names, worktree actions and their confirms, the
// notices and the status bar item. Run with `npx -y bun test ./tests/` in hosts/cursor/ (or `npm test` there).
import { test, expect } from 'bun:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openBoard, type BoardOptions, type BoardSession } from '../board'
import type { EditorAction, Surface } from '../contract'
import type { LeadChoice } from '../lead'
import type { ModelInfo, PanelNeed, PanelOrgNote, PanelView, PanelWorktree, ToWebview } from '../protocol'
import { until } from './fake-sdk'

const CHOICES = [
  { id: 'cursor', name: 'Cursor' },
  { id: 'copilot', name: 'GitHub Copilot' },
]
const MODEL = { id: 'm-1', label: 'Model one', options: [], variants: [] } as unknown as ModelInfo

const need = (id: string, title: string): PanelNeed => ({ id, kind: 'question', title, meta: '', choices: [], actions: [] })
const note = (n: number): PanelOrgNote => ({ n, date: '2026-11-01', topic: 'tests', text: 'Run the tests twice.', key: `k${n}`, head: `#${n}`, ask: `Delete note #${n}?` })
const viewOf = (more: Partial<PanelView> = {}): PanelView =>
  ({
    on: true,
    needs: [],
    lanes: [],
    counts: { needs: more.needs?.length ?? 0, running: 0, next: 0, doneToday: 0, backlog: 0 },
    orgMem: { notes: [note(1)] },
    dir: '.symcc',
    ...more,
  }) as PanelView

type Calls = { said: string[]; configured: Partial<LeadChoice>[]; acts: string[]; removed: string[]; forgot: number[] }

function fakeSession(view: () => PanelView, trees: PanelWorktree[] = []): { session: BoardSession; calls: Calls } {
  const calls: Calls = { said: [], configured: [], acts: [], removed: [], forgot: [] }
  const session = {
    lead: { configure: (c: Partial<LeadChoice>) => void calls.configured.push(c), stop: async () => undefined, summarize: async () => 'summarizing' },
    message: async (text: string) => (calls.said.push(text), text.startsWith('/') ? { said: `${text}: done.` } : {}),
    slash: async () => [{ name: 'symcc-status', description: 'The board in a few lines', kind: 'symcc' }],
    models: async () => [MODEL],
    view,
    steps: () => ({}),
    act: async (task: string, action: string, words?: string) => {
      calls.acts.push(`${task} ${action} ${words ?? ''}`.trim())
      if (action === 'run-now' && !words) return `${task} waits on T-3 (running). Start anyway?`
      return action === 'show-changes' ? 'diff --git a/x b/x' : `${task}: ${action}`
    },
    answer: async (id: string) => `${id} got your answer.`,
    mode: async (m: string) => `The board is now in ${m} mode.`,
    runScout: async (name: string) => `${name} started.`,
    forget: async (n: number) => (calls.forgot.push(n), `Deleted note ${n}.`),
    command: async (name: string) => `${name}: ok`,
    worktrees: {
      list: async () => trees,
      diff: async () => 'diff --git a/y b/y',
      remove: async (dir: string) => (calls.removed.push(dir), `Removed ${dir}.`),
      base: async () => '',
    },
  }
  return { session: session as unknown as BoardSession, calls }
}

type Sent = { m: ToWebview; surface?: Surface }

function board(o: Partial<BoardOptions> & { view?: () => PanelView; trees?: PanelWorktree[] } = {}) {
  let view = o.view ?? (() => viewOf())
  const { session, calls } = fakeSession(() => view(), o.trees)
  const sent: Sent[] = []
  const editor: EditorAction[] = []
  const b = openBoard({ session: () => session, root: '/nowhere', agents: 'cursor', choices: CHOICES, proxy: '', toWebview: (m, surface) => void sent.push({ m, ...(surface ? { surface } : {}) }), editor: a => void editor.push(a), ...o })
  const replies = () => sent.flatMap(x => (x.m.type === 'reply' ? [x.m] : []))
  return { b, sent, editor, calls, replies, setView: (v: () => PanelView) => (view = v) }
}

test('a webview that opens gets the whole state, and only that webview', async () => {
  const t = board()
  await t.b.start()
  await until(() => t.sent.some(x => x.m.type === 'slash'), 5000, 'the slash commands')
  t.sent.length = 0
  await t.b.fromWebview({ type: 'ready' }, 'side')
  expect(t.sent.map(x => x.m.type)).toEqual(['chat', 'network', 'steps', 'lead', 'agents', 'models', 'slash', 'view'])
  expect(t.sent.every(x => x.surface === 'side')).toBe(true)
  expect(t.sent.find(x => x.m.type === 'agents')!.m).toEqual({ type: 'agents', list: CHOICES, current: 'cursor' })
})

test("the chat and the lead's model are kept per project, the model per agents", async () => {
  const stateDir = await mkdtemp('/tmp/symcc-board-')
  const t = board({ stateDir })
  await t.b.start()
  await t.b.fromWebview({ type: 'send', id: 1, text: 'Add a CSV export' }, 'panel')
  t.b.onLead({ type: 'answer', text: 'Added T-1.' })
  await t.b.fromWebview({ type: 'lead-set', settings: { mode: 'plan', model: { id: 'm-1' }, modelLabel: 'Model one' } }, 'panel')
  expect(t.calls.said).toEqual(['Add a CSV export'])
  expect(t.calls.configured.at(-1)).toEqual({ model: { id: 'm-1' }, mode: 'plan' })
  expect(t.replies()).toEqual([{ type: 'reply', id: 1, ok: true, text: '' }])
  await t.b.idle()

  const again = board({ stateDir })
  await again.b.start()
  const chat = again.sent.find(x => x.m.type === 'chat')!.m as Extract<ToWebview, { type: 'chat' }>
  expect(chat.items.map(c => `${c.who}: ${c.text}`)).toEqual(['owner: Add a CSV export', 'lead: Added T-1.'])
  expect(again.calls.configured[0]).toEqual({ model: { id: 'm-1' }, mode: 'plan' })

  const copilot = board({ stateDir, agents: 'copilot' })
  await copilot.b.start()
  expect(copilot.calls.configured[0]).toEqual({ model: undefined, mode: 'agent' })
})

test("a lead model the account doesn't have any more goes back to the default", async () => {
  const stateDir = await mkdtemp('/tmp/symcc-board-')
  await writeFile(join(stateDir, 'lead-cursor.json'), JSON.stringify({ mode: 'agent', model: { id: 'gone' }, modelLabel: 'Gone' }))
  const t = board({ stateDir })
  await t.b.start()
  await until(() => t.sent.some(x => x.m.type === 'lead' && !x.m.settings.model), 5000, 'the default model')
})

test('a network error shows the problem with the proxy; a new proxy is a setting serve restarts with', async () => {
  const t = board({ agents: 'copilot', proxy: 'http://proxy:8080' })
  await t.b.start()
  t.b.onLead({ type: 'error', text: 'the lead could not run: fetch failed' })
  expect(t.sent.find(x => x.m.type === 'network' && x.m.problem)!.m).toEqual({ type: 'network', problem: { text: 'the lead could not run: fetch failed', proxy: 'http://proxy:8080', service: 'GitHub Copilot' } })
  await t.b.fromWebview({ type: 'proxy', id: 2, proxy: ' http://other:3128 ' }, 'panel')
  expect(t.editor.at(-1)).toEqual({ do: 'setting', key: 'proxy', value: 'http://other:3128' })
  expect(t.replies().at(-1)).toEqual({ type: 'reply', id: 2, ok: true, text: 'symcc restarts with the new proxy.' })
  expect(t.sent.at(-2)!.m).toEqual({ type: 'network', problem: null })
})

test('the agents choice is a setting, only for another agents serve knows', async () => {
  const t = board()
  await t.b.fromWebview({ type: 'agents-set', agents: 'cursor' }, 'panel')
  await t.b.fromWebview({ type: 'agents-set', agents: 'nobody' }, 'panel')
  expect(t.editor).toEqual([])
  await t.b.fromWebview({ type: 'agents-set', agents: 'copilot' }, 'panel')
  expect(t.editor).toEqual([{ do: 'setting', key: 'agents', value: 'copilot' }])
})

test("a file the lead names opens in the project, else in the one worker's folder that has it; a missing one warns", async () => {
  const root = await mkdtemp('/tmp/symcc-board-')
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src/a.ts'), '')
  await mkdir(join(root, '.symcc/worktrees/T-1'), { recursive: true })
  await writeFile(join(root, '.symcc/worktrees/T-1/new.ts'), '')
  const t = board({ root })
  t.b.onView(viewOf())
  const opened = () => t.editor.filter(a => a.do !== 'status')
  for (const [i, path] of ['src/a.ts', 'new.ts', 'src', 'gone.ts'].entries()) {
    await t.b.fromWebview({ type: 'open-file', path, ...(i ? {} : { line: 7 }) }, 'panel')
    await until(() => opened().length === i + 1, 5000, `an editor action for ${path}`)
  }
  expect(opened()).toEqual([
    { do: 'open-file', path: join(root, 'src/a.ts'), line: 7 },
    { do: 'open-file', path: join(root, '.symcc/worktrees/T-1/new.ts') },
    { do: 'open-file', path: join(root, 'src'), folder: true },
    { do: 'notify', level: 'warning', text: "There's no gone.ts in this project." },
  ])
})

test("an agent's session opens as markdown, from what serve has in memory when nothing was saved", async () => {
  const t = board()
  t.b.onStep('T-1', { kind: 'text', text: 'Reading the tests.', atMs: 1 } as never)
  await t.b.fromWebview({ type: 'session', agent: 'T-1', title: 'T-1 Say hello' }, 'panel')
  await until(() => t.editor.some(a => a.do === 'show-text'), 5000, 'the session')
  const shown = t.editor.find(a => a.do === 'show-text') as Extract<EditorAction, { do: 'show-text' }>
  expect(shown.name).toBe('T-1.md')
  expect(shown.language).toBe('markdown')
  expect(shown.content).toContain('T-1 Say hello')
  expect(shown.content).toContain('Reading the tests.')
})

test('removing a worktree asks first; refused, nothing is removed', async () => {
  const dir = '/repo/.symcc/worktrees/T-1'
  const tree = { path: dir, where: '.symcc/worktrees/T-1', kind: 'task', branch: 'symcc/T-1', dirty: 2 } as PanelWorktree
  const t = board({ trees: [tree] })
  const refused = t.b.fromWebview({ type: 'worktree', id: 3, path: dir, action: 'remove' }, 'panel')
  await until(() => t.editor.some(a => a.do === 'confirm'), 5000, 'the confirm')
  const ask = t.editor.find(a => a.do === 'confirm') as Extract<EditorAction, { do: 'confirm' }>
  expect(ask).toEqual({ do: 'confirm', id: ask.id, text: 'Remove the folder .symcc/worktrees/T-1? Its 2 uncommitted files will be lost.', button: 'Remove', detail: 'Its branch symcc/T-1 stays, with its commits.' })
  t.b.confirmed(ask.id, false)
  await refused
  expect(t.calls.removed).toEqual([])
  expect(t.replies().at(-1)).toEqual({ type: 'reply', id: 3, ok: true, text: '' })

  const agreed = t.b.fromWebview({ type: 'worktree', id: 4, path: dir, action: 'remove' }, 'panel')
  await until(() => t.editor.filter(a => a.do === 'confirm').length === 2, 5000, 'the second confirm')
  t.b.confirmed((t.editor.at(-1) as Extract<EditorAction, { do: 'confirm' }>).id, true)
  await agreed
  expect(t.calls.removed).toEqual([dir])

  await t.b.fromWebview({ type: 'worktree', id: 5, path: dir, action: 'terminal' }, 'panel')
  await t.b.fromWebview({ type: 'worktree', id: 6, path: dir, action: 'copy' }, 'panel')
  expect(t.editor.slice(-2)).toEqual([
    { do: 'terminal', cwd: dir, name: 'T-1 worktree' },
    { do: 'copy', text: dir },
  ])
  expect(t.replies().at(-1)).toEqual({ type: 'reply', id: 6, ok: true, text: "Copied the folder's path." })
})

test('deleting a note and Run now on a waiting task ask first', async () => {
  const t = board()
  t.b.onView(viewOf())
  const forget = t.b.fromWebview({ type: 'forget', id: 7, n: 1 }, 'panel')
  await until(() => t.editor.some(a => a.do === 'confirm'), 5000, 'the confirm')
  t.b.confirmed((t.editor.at(-1) as Extract<EditorAction, { do: 'confirm' }>).id, true)
  await forget
  expect(t.calls.forgot).toEqual([1])

  const run = t.b.fromWebview({ type: 'act', id: 8, task: 'T-5', action: 'run-now' }, 'panel')
  await until(() => t.editor.filter(a => a.do === 'confirm').length === 2, 5000, 'the run-now confirm')
  const ask = t.editor.at(-1) as Extract<EditorAction, { do: 'confirm' }>
  expect(ask.text).toBe('T-5 waits on T-3 (running). Start anyway?')
  t.b.confirmed(ask.id, false)
  await run
  expect(t.replies().at(-1)).toEqual({ type: 'reply', id: 8, ok: true, text: 'Nothing started; T-5 waits its turn.' })
  expect(t.calls.acts).toEqual(['T-5 run-now'])
})

test('a new need notifies once, the first view notifies nothing, and the status bar item follows the board', async () => {
  const t = board()
  t.b.onView(viewOf({ needs: [need('T-1', 'Which format?')] }))
  expect(t.editor).toEqual([{ do: 'status', text: '$(bell-dot) symcc: 1 needs you', tooltip: '**T-1** Which format?', tone: 'warning', needs: 1 }])
  t.b.onView(viewOf({ needs: [need('T-1', 'Which format?'), need('T-2', 'May I add a package?')] }))
  t.b.onView(viewOf({ needs: [need('T-1', 'Which format?'), need('T-2', 'May I add a package?')] }))
  expect(t.editor.filter(a => a.do === 'notify')).toEqual([{ do: 'notify', text: 'T-2 needs you: May I add a package?', board: { page: 'now' } }])
  expect(t.editor.filter(a => a.do === 'status').length).toBe(2)
  t.b.onView(viewOf({ on: false, off: 'symcc is off here' }))
  expect(t.editor.at(-1)).toEqual({ do: 'status', text: 'symcc: off', tooltip: 'symcc is off here', needs: 0 })
})
