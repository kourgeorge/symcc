// T-1064: the lead's AskUserQuestion through register.tsx's real tool.call hook (T-579). tests/popup-questions.test.ts
// drives popupCall directly; these run the registered handler itself, so its tool-name check, its agentId check, the
// tool_use_id it hands $.ui.notice and the try/catch around $.ui.notice are covered too.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'
import { pause } from './fakes'
import { type Board, readBoard, openQuestions } from '../hooks/board'
import { S } from '../hooks/app/state'
import { register } from '../hooks/register'

const ROOT = '/repo'

type Handler = ($: unknown, e: Record<string, unknown>, next: (e: unknown) => unknown) => Promise<unknown>

/** register.tsx's own tool.call handler, caught with a fake `on` (its .catch part is left out: a throw must reach the test). */
function toolCallHook(): Handler {
  const hooks = new Map<string, Handler>()
  const on = (event: string, fn: Handler) => (hooks.set(event, fn), { catch: () => undefined })
  register(on as never, {} as never)
  return hooks.get('tool.call')!
}

/**
 * symcc on, an empty board in memory, and Claude Code's `$` over a fake Host. $.ui.notice records its calls in
 * `notices`, or throws when `noticeThrows` is set.
 */
function world(opts: { noticeThrows?: boolean } = {}) {
  const files = new Map<string, string>()
  const f = fakeHost({
    session: { repo: async () => ({ root: ROOT }), root: async () => ROOT },
    fs: memoryFs(files),
    run: async argv => {
      const [cmd, ...rest] = argv
      if (cmd === 'ln') {
        if (files.has(rest[1]!)) return done({ exitCode: 1, stderr: 'File exists' })
        files.set(rest[1]!, files.get(rest[0]!) ?? '')
      }
      if (cmd === 'mv') {
        files.set(rest[2]!, files.get(rest[1]!) ?? '')
        files.delete(rest[1]!)
      }
      if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(p)
      return done()
    },
  })
  const h = f.host
  const notices: [string, string | undefined][] = []
  const timer = { cancel: () => undefined }
  const $ = {
    plugin: { name: 'symcc', root: '/plugin' },
    session: { ...h.session, cwd: async () => ROOT, send: async () => undefined },
    prompt: { submit: async () => undefined },
    agent: { spawn: async () => ({}), list: async () => [] },
    tool: { call: async () => ({}) },
    env: { get: async () => undefined },
    fs: h.fs,
    process: { run: (argv: readonly string[]) => h.run(argv) },
    clock: { after: () => timer, every: () => timer, sleep: async () => undefined },
    ui: {
      toast: () => undefined,
      status: () => undefined,
      log: () => undefined,
      invalidate: () => undefined,
      open: async () => ({ isPlaced: false }),
      panes: async () => [],
      notice: (id: string, text: string | undefined) => {
        if (opts.noticeThrows) throw new Error('no notice here')
        notices.push([id, text])
      },
    },
  }
  S.root = ROOT
  S.driving = true
  S.enabledNow = true
  const board = (): Board => readBoard(files.get(`${ROOT}/${S.N.boardFile}`) ?? null).board
  return { $, files, board, notices }
}

const QUESTIONS = [{ question: 'Which color?', header: 'Color', options: [{ label: 'Red' }, { label: 'Blue' }] }]

/** A fake next(e): the dialog, open until `answer` is called; counts its calls. */
function dialog() {
  let calls = 0
  let answer: () => void = () => undefined
  const result = { ref: 'r1', result: { questions: [], answers: { 'Which color?': 'Red' } }, text: 'answered' }
  const shown = new Promise<typeof result>(res => (answer = () => res(result)))
  return { next: () => (calls++, shown), answer: () => answer(), calls: () => calls, result }
}

test("the lead's AskUserQuestion through the tool.call hook adds Q-1 and tells $.ui.notice its tool_use_id", async () => {
  const w = world()
  const d = dialog()
  const r = toolCallHook()(w.$, { tool: 'AskUserQuestion', tool_use_id: 'tu1', questions: QUESTIONS }, d.next)
  await pause(0)
  expect(openQuestions(w.board()).map(q => [q.id, q.text])).toEqual([['Q-1', 'Which color?']])
  expect(w.notices).toEqual([['tu1', 'or answer on the board (Q-1)']])
  expect(d.calls()).toBe(1)
  d.answer()
  await r
})

test('a $.ui.notice that throws does not fail the hook, and Q-1 is still added', async () => {
  const w = world({ noticeThrows: true })
  const d = dialog()
  const r = toolCallHook()(w.$, { tool: 'AskUserQuestion', tool_use_id: 'tu1', questions: QUESTIONS }, d.next)
  let failed: unknown
  r.catch(err => (failed = err))
  await pause(0)
  expect(openQuestions(w.board()).map(q => q.id)).toEqual(['Q-1'])
  d.answer()
  await r.catch(() => undefined)
  expect(failed).toBe(undefined)
})

test("a worker's AskUserQuestion (agentId w1) goes to next once, its result unchanged, with no Q-n", async () => {
  const w = world()
  const d = dialog()
  d.answer()
  const out = await toolCallHook()(w.$, { tool: 'AskUserQuestion', tool_use_id: 'tu1', agentId: 'w1', questions: QUESTIONS }, d.next)
  expect(d.calls()).toBe(1)
  expect(out).toBe(d.result)
  expect(w.board().questions ?? []).toEqual([])
  expect(w.notices).toEqual([])
})

test('a call with no tool_use_id still adds Q-1 but never calls $.ui.notice', async () => {
  const w = world()
  const d = dialog()
  const r = toolCallHook()(w.$, { tool: 'AskUserQuestion', questions: QUESTIONS }, d.next)
  await pause(0)
  expect(openQuestions(w.board()).map(q => q.id)).toEqual(['Q-1'])
  expect(w.notices).toEqual([])
  d.answer()
  await r
})

test('another tool with the same input is not taken for the pop-up: no Q-n, no notice', async () => {
  const w = world()
  const d = dialog()
  d.answer()
  await toolCallHook()(w.$, { tool: 'AskUserQuestionX', tool_use_id: 'tu1', questions: QUESTIONS }, d.next)
  expect(d.calls()).toBe(1)
  expect(w.board().questions ?? []).toEqual([])
  expect(w.notices).toEqual([])
})
