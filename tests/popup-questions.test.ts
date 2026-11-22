// T-579: the lead's pop-up question (AskUserQuestion) also goes on the board, and whichever the owner answers first
// closes the other. popupCall is driven here with a fake next(e) (`open`), as register.tsx's tool.call hook calls it.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'
import { pause } from './fakes'
import { type Board, readBoard, openQuestions } from '../hooks/board'
import { S } from '../hooks/app/state'
import { runTool, allowAskedFiles } from '../hooks/app/tools'
import { answerOnBoard, boardAnswered, popupCall } from '../hooks/app/questions'
import { change } from '../hooks/app/store'
import { taskAsks, rowExtra, liveNeeds } from '../hooks/board'
import { CLAUDE_WORDS } from '../hooks/claude/host'

const ROOT = '/repo'
const ISO = '2026-11-18T10:00:00.000Z'

/** The fake Host with its board in memory, set up as the lead's session in Claude Code's words. */
function world() {
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
  // a board answer would wake the lead at once: so any extra board update shows in toLead
  f.host.features = { ...f.host.features, wakeLead: 'now' }
  f.host.clock = { ...f.host.clock, after: (_ms, job) => (void Promise.resolve().then(job), { cancel: () => undefined }) }
  S.root = ROOT
  S.driving = true
  S.enabledNow = true
  S.W = CLAUDE_WORDS
  const board = (): Board => readBoard(files.get(`${ROOT}/${S.N.boardFile}`) ?? null).board
  const notices: (string | undefined)[] = []
  return { ...f, files, board, notices, notice: (t: string | undefined) => void notices.push(t) }
}

/** A fake next(e): the dialog, open until `answer` is called (or it is never answered). */
function dialog() {
  let calls = 0
  let answer: (answers: Record<string, string>) => void = () => undefined
  const shown = new Promise<{ ref: string; result: { questions: unknown; answers: Record<string, string> }; text: string }>(res => (answer = answers => res({ ref: 'r1', result: { questions: [], answers }, text: 'answered' })))
  return { open: () => (calls++, shown), answer: (a: Record<string, string>) => answer(a), calls: () => calls }
}

const ask = (question: string, labels: string[], more: Record<string, unknown> = {}) => ({ question, header: 'Pick', options: labels.map(label => ({ label })), multiSelect: false, ...more })

/** A task waiting for the owner with `extra` (a question, a file request), put on the board. */
async function waitingTask(host: never, extra: Record<string, unknown>) {
  const { question, options, asked_files, ...rest } = extra as { question?: string; options?: string[]; asked_files?: string[] }
  const ask = question !== undefined || asked_files ? { by: asked_files ? 'symcc' : 'worker', text: question ?? 'files?', asked_at: ISO, ...(options ? { options } : {}), ...(asked_files ? { files: asked_files } : {}) } : undefined
  const t = { id: 'T-1', title: 'Pick the color', details: '', files: ['a.ts'], status: 'waiting', note: '', order: 1, after: [], attempts: 1, history: [], branch: null, created_at: ISO, updated_at: ISO, ...rest, ...(ask ? { ask } : {}) }
  await change(host, x => ({ ...x, tasks: [...x.tasks, t as never], next_id: 2 }))
}

test('a board answer first is returned as the pop-up answer, closes the Q-n, and sends the lead no extra update', async () => {
  const w = world()
  const d = dialog()
  const questions = [ask('Which color?', ['Red', 'Blue'])]
  const r = popupCall(w.host, undefined, { questions }, d.open, w.notice)
  await pause(0)
  expect(d.calls()).toBe(1)
  expect(openQuestions(w.board()).map(q => [q.id, q.text, q.options])).toEqual([['Q-1', 'Which color?', ['Red', 'Blue']]])
  expect(w.notices).toEqual(['or answer on the board (Q-1)'])
  expect(await answerOnBoard(w.host, 'Q-1', 'Blue')).toBe("Q-1 answered: Blue; the lead's pop-up got it")
  const out = (await r) as { result: unknown; context: string[] }
  expect(out.result).toEqual({ questions, answers: { 'Which color?': 'Blue' } })
  expect(out.context[0]).toContain('The owner answered on the symcc board (Q-1)')
  expect(w.board().questions![0]).toMatchObject({ answer: 'Blue', answered_by: 'board' })
  await pause(0)
  expect(w.toLead).toEqual([])
  // the dialog answering after that changes nothing
  d.answer({ 'Which color?': 'Red' })
  await pause(0)
  expect(w.board().questions![0]!.answer).toBe('Blue')
})

test('a dialog answer first closes the Q-n with it; a later board answer finds it closed', async () => {
  const w = world()
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('Which color?', ['Red', 'Blue'])] }, d.open, w.notice)
  await pause(0)
  d.answer({ 'Which color?': 'Red' })
  const out = (await r) as unknown as { ref: string; result: { answers: Record<string, string> }; context: string[] }
  // core's own result, with what symcc did as context
  expect(out.ref).toBe('r1')
  expect(out.result.answers).toEqual({ 'Which color?': 'Red' })
  expect(out.context).toEqual(['symcc closed Q-1 on the board with the owner\'s answer "Red".'])
  expect(w.board().questions![0]).toMatchObject({ answer: 'Red', answered_by: 'chat' })
  expect(await answerOnBoard(w.host, 'Q-1', 'Blue')).toBe('Q-1 was already closed (answered in the chat: "Red")')
})

test("the lead's own open question with the same text is reused, not added again", async () => {
  const w = world()
  await runTool(w.host, 'question', { action: 'add', text: 'Which one?', options: ['A', 'B', 'C', 'D', 'E'] })
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('Which one?', ['A', 'B', 'the rest on the board'])] }, d.open, w.notice)
  await pause(0)
  expect(w.board().questions!.length).toBe(1)
  expect(w.notices).toEqual(['or answer on the board (Q-1)'])
  await answerOnBoard(w.host, 'Q-1', 'E')
  expect(((await r) as { result: { answers: unknown } }).result.answers).toEqual({ 'Which one?': 'E' })
})

test('a call of several questions: the board must answer each; a multi-select answer comes comma-joined', async () => {
  const w = world()
  const d = dialog()
  const questions = [ask('Which color?', ['Red', 'Blue']), ask('Which parts?', ['Top', 'Side', 'Back'], { multiSelect: true })]
  const r = popupCall(w.host, undefined, { questions }, d.open, w.notice)
  await pause(0)
  expect(w.notices).toEqual(['or answer on the board (Q-1, Q-2)'])
  await answerOnBoard(w.host, 'Q-1', 'Blue')
  await answerOnBoard(w.host, 'Q-2', 'Top, Back')
  expect(((await r) as { result: unknown }).result).toEqual({ questions, answers: { 'Which color?': 'Blue', 'Which parts?': 'Top, Back' } })
  await pause(0)
  expect(w.toLead).toEqual([])

  // one answered on the board, then the dialog answers both: the board's answer stands for its question
  const w2 = world()
  const d2 = dialog()
  const r2 = popupCall(w2.host, undefined, { questions: [ask('Size?', ['S', 'M']), ask('Which parts?', ['Top', 'Side', 'Back'], { multiSelect: true })] }, d2.open, w2.notice)
  await pause(0)
  await answerOnBoard(w2.host, 'Q-1', 'M')
  d2.answer({ 'Size?': 'S', 'Which parts?': 'Top, Side' })
  const out = (await r2) as { context: string[] }
  expect(out.context).toEqual(['Q-1 was already answered on the board: "M" (that answer stands for it).', 'symcc closed Q-2 on the board with the owner\'s answer "Top, Side".'])
  expect(w2.board().questions!.map(q => q.answer)).toEqual(['M', 'Top, Side'])
})

test('closing the pop-up without an answer keeps the Q-n open, and a later board answer wakes the lead as usual', async () => {
  const w = world()
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('Which color?', ['Red', 'Blue'])] }, d.open, w.notice)
  await pause(0)
  d.answer({})
  await r
  expect(openQuestions(w.board()).length).toBe(1)
  expect(await answerOnBoard(w.host, 'Q-1', 'Blue')).toBe('Q-1 answered: Blue; the lead will take it from here')
  await pause(0)
  expect(w.toLead.length).toBe(1)
})

test("a question about a task waiting for the owner is tied to that task's board question: no Q-n", async () => {
  const w = world()
  await waitingTask(w.host as never, { question: 'Red or blue?', options: ['Red', 'Blue'] })
  // the board answers first (the task page's buttons call boardAnswered)
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('T-1 asks: red or blue?', ['Red', 'Blue'], { header: 'T-1' })] }, d.open, w.notice)
  await pause(0)
  expect(w.board().questions ?? []).toEqual([])
  expect(w.notices).toEqual(['or answer on the board (T-1)'])
  expect(boardAnswered('T-1', 'Blue')).toBe(true)
  expect(((await r) as { result: { answers: unknown } }).result.answers).toEqual({ 'T-1 asks: red or blue?': 'Blue' })
  expect(boardAnswered('T-1', 'Blue')).toBe(false)

  // the dialog answers first: the answer goes into the task, as the board's answer would
  const d2 = dialog()
  const r2 = popupCall(w.host, undefined, { questions: [ask('T-1 asks: red or blue?', ['Red', 'Blue'], { header: 'T-1' })] }, d2.open, w.notice)
  await pause(0)
  d2.answer({ 'T-1 asks: red or blue?': 'Red' })
  const out = (await r2) as { context: string[] }
  expect(out.context[0]).toMatch(/^symcc put the owner's answer into T-1: /)
  const t = w.board().tasks[0]!
  expect(t.status).not.toBe('waiting')
  expect(t.history.map(h => h.text).join('\n')).toContain('Red')
})

test("a file request answered Allow in the pop-up allows the files", async () => {
  const w = world()
  await waitingTask(w.host as never, { asked_files: ['b.ts'], note: 'asks to change b.ts' })
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('T-1 wants to change b.ts. Allow?', ['Allow', "Don't allow"], { header: 'T-1' })] }, d.open, w.notice)
  await pause(0)
  d.answer({ 'T-1 wants to change b.ts. Allow?': 'Allow' })
  expect(((await r) as { context: string[] }).context[0]).toContain('files allowed (b.ts)')
  expect(w.board().tasks[0]!.files).toContain('b.ts')
})

test("a worker's call and a question with no options are passed on untouched", async () => {
  const w = world()
  const d = dialog()
  const r = popupCall(w.host, 'agent-1', { questions: [ask('Which color?', ['Red', 'Blue'])] }, d.open, w.notice)
  d.answer({ 'Which color?': 'Red' })
  const out = await r
  expect(out).toEqual({ ref: 'r1', result: { questions: [], answers: { 'Which color?': 'Red' } }, text: 'answered' })
  expect(w.notices).toEqual([])
  expect(w.files.has(`${ROOT}/${S.N.boardFile}`)).toBe(false)
  const d2 = dialog()
  const r2 = popupCall(w.host, undefined, { questions: [{ question: 'Anything else?', header: 'More', kind: 'text', options: [], multiSelect: false }] }, d2.open, w.notice)
  await pause(0)
  d2.answer({ 'Anything else?': 'no' })
  expect(await r2).toMatchObject({ ref: 'r1' })
  expect(w.notices).toEqual([])
  expect(w.board().questions ?? []).toEqual([])
})

test('picking "the rest on the board" in the pop-up is no answer: the Q-n or the task stays open for the board', async () => {
  const w = world()
  await runTool(w.host, 'question', { action: 'add', text: 'Which one?', options: ['A', 'B', 'C', 'D', 'E'] })
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('Which one?', ['A', 'B', 'C', 'the rest on the board'])] }, d.open, w.notice)
  await pause(0)
  d.answer({ 'Which one?': 'the rest on the board' })
  expect(((await r) as { context: string[] }).context[0]).toContain('Q-1 stays open on the board')
  expect(openQuestions(w.board()).map(q => q.id)).toEqual(['Q-1'])
  expect(await answerOnBoard(w.host, 'Q-1', 'E')).toBe('Q-1 answered: E; the lead will take it from here')

  // a task's question: the task keeps waiting
  const w2 = world()
  await waitingTask(w2.host as never, { question: 'Which color?', options: ['Red', 'Blue', 'Green', 'Pink', 'Gray'] })
  const d2 = dialog()
  const r2 = popupCall(w2.host, undefined, { questions: [ask('T-1 asks: which color?', ['Red', 'Blue', 'Green', 'the rest on the board'], { header: 'T-1' })] }, d2.open, w2.notice)
  await pause(0)
  d2.answer({ 'T-1 asks: which color?': 'the rest on the board' })
  expect(((await r2) as { context: string[] }).context[0]).toContain('T-1 stays open on the board')
  expect(w2.board().tasks[0]!.status).toBe('waiting')
})

test('repeated or blank option labels are dropped before the board question is made', async () => {
  const w = world()
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('Same?', ['Yes', 'Yes'])] }, d.open, w.notice)
  await pause(0)
  // one real option left: no board question, the dialog opens as usual
  expect(d.calls()).toBe(1)
  expect(w.board().questions ?? []).toEqual([])
  d.answer({ 'Same?': 'Yes' })
  expect(await r).toMatchObject({ ref: 'r1' })

  const w2 = world()
  const d2 = dialog()
  const r2 = popupCall(w2.host, undefined, { questions: [ask('Which?', ['A', '  ', 'a ', 'A', 'B', 'the rest on the board'])] }, d2.open, w2.notice)
  await pause(0)
  expect(openQuestions(w2.board()).map(q => q.options)).toEqual([['A', 'a', 'B']])
  d2.answer({ 'Which?': 'B' })
  await r2
})

test("only a header that is exactly the task's id ties a pop-up to it; an id in the question text doesn't", async () => {
  const w = world()
  await waitingTask(w.host as never, { question: 'Red or blue?', options: ['Red', 'Blue'] })
  const d = dialog()
  const q = 'Should I start the docs task first, while T-1 waits for you?'
  const r = popupCall(w.host, undefined, { questions: [ask(q, ['Yes, start it', 'No, wait'])] }, d.open, w.notice)
  await pause(0)
  // a Q-n of its own, not T-1's question
  expect(w.notices).toEqual(['or answer on the board (Q-1)'])
  d.answer({ [q]: 'Yes, start it' })
  expect(((await r) as { context: string[] }).context).toEqual(['symcc closed Q-1 on the board with the owner\'s answer "Yes, start it".'])
  const t = w.board().tasks[0]!
  expect(t.status).toBe('waiting')
  expect(t.details).not.toContain('Yes, start it')
  // a header with more than the id doesn't tie it either
  const d2 = dialog()
  const r2 = popupCall(w.host, undefined, { questions: [ask('Red or blue for it?', ['Red', 'Blue'], { header: 'T-1 color' })] }, d2.open, w.notice)
  await pause(0)
  expect(w.notices[1]).toBe('or answer on the board (Q-2)')
  d2.answer({})
  await r2
})

test('with an untied question in the call, a board answer is kept but the dialog stays open for the rest', async () => {
  const w = world()
  const d = dialog()
  const questions = [ask('Which color?', ['Red', 'Blue']), { question: 'Anything else to add?', header: 'More', kind: 'text', options: [], multiSelect: false }]
  const r = popupCall(w.host, undefined, { questions }, d.open, w.notice)
  let settled = false
  void r.then(() => (settled = true))
  await pause(0)
  expect(await answerOnBoard(w.host, 'Q-1', 'Blue')).toBe("Q-1 answered: Blue; the lead's pop-up got it")
  await pause(0)
  expect(settled).toBe(false)
  d.answer({ 'Which color?': 'Red', 'Anything else to add?': 'no' })
  const out = (await r) as unknown as { ref: string; result: { answers: Record<string, string> }; context: string[] }
  // the dialog's own result, with the board's answer for Q-1 in the context
  expect(out.ref).toBe('r1')
  expect(out.result.answers).toEqual({ 'Which color?': 'Red', 'Anything else to add?': 'no' })
  expect(out.context).toEqual(['Q-1 was already answered on the board: "Blue" (that answer stands for it).'])
  expect(w.board().questions![0]).toMatchObject({ answer: 'Blue', answered_by: 'board' })
  await pause(0)
  expect(w.toLead).toEqual([])
})

/** A fake next(e) whose dialog the owner answers by typing (only `response`, no answers). */
const typedDialog = (response: string) => {
  let answer = () => undefined as void
  const shown = new Promise<{ ref: number; result: { questions: unknown[]; answers: Record<string, string>; response: string }; text: string }>(res => (answer = () => res({ ref: 1, result: { questions: [], answers: {}, response }, text: 'x' })))
  return { open: () => shown, answer: () => answer() }
}

test("a typed answer (only response) answers a one-question call; with more the lead is told what is still open", async () => {
  const w = world()
  const d = typedDialog('Green please')
  const r = popupCall(w.host, undefined, { questions: [ask('Which color?', ['Red', 'Blue'])] }, d.open, w.notice)
  await pause(0)
  d.answer()
  const out = (await r) as unknown as { ref: number; context: string[] }
  expect(out.ref).toBe(1)
  expect(out.context).toEqual(['symcc closed Q-1 on the board with the owner\'s answer "Green please".'])
  expect(w.board().questions![0]).toMatchObject({ answer: 'Green please', answered_by: 'chat' })

  // a task's question: the typed words go into the task
  const w2 = world()
  await waitingTask(w2.host as never, { question: 'Red or blue?', options: ['Red', 'Blue'] })
  const d2 = typedDialog('Green please')
  const r2 = popupCall(w2.host, undefined, { questions: [ask('T-1 asks: red or blue?', ['Red', 'Blue'], { header: 'T-1' })] }, d2.open, w2.notice)
  await pause(0)
  d2.answer()
  expect(((await r2) as { context: string[] }).context[0]).toMatch(/^symcc put the owner's answer into T-1: /)
  expect(w2.board().tasks[0]!.status).not.toBe('waiting')

  // two questions: which one the words answer is unknown, so both stay open and the lead is told
  const w3 = world()
  const d3 = typedDialog('Green, and the top')
  const r3 = popupCall(w3.host, undefined, { questions: [ask('Which color?', ['Red', 'Blue']), ask('Which part?', ['Top', 'Side'])] }, d3.open, w3.notice)
  await pause(0)
  d3.answer()
  const out3 = (await r3) as { context: string[] }
  expect(out3.context.length).toBe(1)
  expect(out3.context[0]).toContain('Q-1, Q-2 still wait on the board')
  expect(openQuestions(w3.board()).map(q => q.id)).toEqual(['Q-1', 'Q-2'])
})

/** A fake next(e) whose dialog (or turn) ends without a result: `end` rejects it. */
function endedDialog() {
  let end: () => void = () => undefined
  const shown = new Promise<never>((_, rej) => (end = () => rej(new Error('aborted'))))
  return { open: () => shown, end: () => end() }
}

test('a board answer taken while the dialog waits reaches the lead once if the dialog ends without a result', async () => {
  const cases = [
    [ask('Which color?', ['Red', 'Blue']), { question: 'Anything else?', header: 'More', kind: 'text', options: [], multiSelect: false }],
    [ask('Which color?', ['Red', 'Blue']), ask('Which part?', ['Top', 'Side'])],
  ]
  for (const questions of cases) {
    const w = world()
    const d = endedDialog()
    const r = popupCall(w.host, undefined, { questions }, d.open, w.notice)
    await pause(0)
    expect(await answerOnBoard(w.host, 'Q-1', 'Blue')).toBe("Q-1 answered: Blue; the lead's pop-up got it")
    await pause(0)
    expect(w.toLead).toEqual([])
    d.end()
    await expect(r).rejects.toThrow('aborted')
    await pause(0)
    expect(w.toLead.length).toBe(1)
    expect(JSON.stringify(w.toLead)).toContain('The owner answered your question Q-1')
    expect(JSON.stringify(w.toLead)).toContain('Blue')
    // later board answers go the usual way, and Q-1's update is not sent again
    if (questions[1]!.options!.length) {
      await answerOnBoard(w.host, 'Q-2', 'Top')
      await pause(0)
      expect(w.toLead.length).toBe(2)
      expect(JSON.stringify(w.toLead).split('Q-1 (').length).toBe(2)
    }
  }

  // the dialog resolves after a board answer: the lead reads it in the result's context, with no board update too
  const w = world()
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: cases[1]! }, d.open, w.notice)
  await pause(0)
  await answerOnBoard(w.host, 'Q-1', 'Blue')
  d.answer({ 'Which color?': 'Red', 'Which part?': 'Side' })
  expect(((await r) as { context: string[] }).context[0]).toContain('Q-1 was already answered on the board')
  await pause(0)
  expect(w.toLead).toEqual([])
})

// T-753: Claude Code's result when the owner turns the pop-up down
const REFUSAL = "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."

/** A fake next(e) the owner turns down: it ends with the refusal as an error result. */
function refusedDialog() {
  let refuse: () => void = () => undefined
  const shown = new Promise<{ ref: number; result: string; text: string; isError: true }>(res => (refuse = () => res({ ref: 1, result: REFUSAL, text: REFUSAL, isError: true })))
  return { open: () => shown, refuse: () => refuse() }
}

test('T-753: a pop-up the owner turns down drops its Q-ns, and the lead is told their ids', async () => {
  const w = world()
  const d = refusedDialog()
  const questions = [ask('Which color?', ['Red', 'Blue']), ask('Which part?', ['Top', 'Side']), ask('Which size?', ['S', 'M'])]
  const r = popupCall(w.host, undefined, { questions }, d.open, w.notice)
  await pause(0)
  expect(openQuestions(w.board()).map(q => q.id)).toEqual(['Q-1', 'Q-2', 'Q-3'])
  d.refuse()
  const out = (await r) as unknown as { ref: number; isError: boolean; context: string[] }
  // the refusal itself still reaches the lead, with what symcc did as context
  expect(out.ref).toBe(1)
  expect(out.isError).toBe(true)
  expect(out.context).toEqual(['symcc dropped Q-1, Q-2, Q-3 from the board because the owner turned the pop-up down; ask again in the chat if it still matters.'])
  expect(openQuestions(w.board())).toEqual([])
  expect(w.board().questions!.map(q => [q.dropped, q.drop_note])).toEqual([0, 1, 2].map(() => [true, 'the owner turned the question down in the chat']))
  expect(await runTool(w.host, 'question', { action: 'drop', id: 'Q-2' })).toContain('dropped: the owner turned the question down in the chat')
  await pause(0)
  expect(w.toLead).toEqual([])
  expect(await answerOnBoard(w.host, 'Q-1', 'Red')).toContain('Q-1 was already closed')

  // a call refused before it opened ({ deny }) drops them too; the lead hears it in a note
  const w2 = world()
  const r2 = popupCall(w2.host, undefined, { questions: [ask('Which color?', ['Red', 'Blue'])] }, async () => ({ deny: 'no' }), w2.notice)
  expect(await r2).toEqual({ deny: 'no' })
  expect(openQuestions(w2.board())).toEqual([])
})

test('T-753: closed with no answer keeps the Q-ns open; answered closes them with the answer', async () => {
  const w = world()
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('Which color?', ['Red', 'Blue']), ask('Which part?', ['Top', 'Side'])] }, d.open, w.notice)
  await pause(0)
  d.answer({})
  const out = (await r) as unknown as { context?: string[] }
  expect(out.context ?? []).toEqual([])
  expect(openQuestions(w.board()).map(q => q.id)).toEqual(['Q-1', 'Q-2'])

  const w2 = world()
  const d2 = dialog()
  const r2 = popupCall(w2.host, undefined, { questions: [ask('Which color?', ['Red', 'Blue'])] }, d2.open, w2.notice)
  await pause(0)
  d2.answer({ 'Which color?': 'Blue' })
  expect(((await r2) as { context: string[] }).context).toEqual(['symcc closed Q-1 on the board with the owner\'s answer "Blue".'])
  expect(w2.board().questions![0]).toMatchObject({ answer: 'Blue', answered_by: 'chat' })
  expect(w2.board().questions![0]!.dropped).toBe(undefined)
})

test("T-753: a turned-down pop-up tied to a task's own question leaves the task waiting", async () => {
  const w = world()
  await waitingTask(w.host as never, { question: 'Red or blue?', options: ['Red', 'Blue'] })
  const d = refusedDialog()
  const r = popupCall(w.host, undefined, { questions: [ask('T-1 asks: red or blue?', ['Red', 'Blue'], { header: 'T-1' })] }, d.open, w.notice)
  await pause(0)
  d.refuse()
  const out = (await r) as unknown as { ref: number; context?: string[] }
  expect(out.ref).toBe(1)
  expect(out.context ?? []).toEqual([])
  expect(w.board().questions ?? []).toEqual([])
  expect(w.board().tasks[0]!.status).toBe('waiting')
  expect(boardAnswered('T-1', 'Blue')).toBe(false)
})

/** A fake next(e) answered at once with `answers`, its text repeating them as Claude Code's does. */
const answeredWith = (answers: Record<string, string>) => async () => ({
  ref: 1,
  result: { questions: [], answers },
  text: `User has answered your questions: ${Object.entries(answers).map(([q, a]) => `"${q}"="${a}"`).join(', ')}.`,
})

test('T-753: an answer or a question with the refusal words is an answer, not a turned-down pop-up', async () => {
  // the owner's answer has the words
  const w = world()
  const said = "No, the client doesn't want to proceed with that"
  const out = (await popupCall(w.host, undefined, { questions: [ask('Go on?', ['Yes', 'No'])] }, answeredWith({ 'Go on?': said }), w.notice)) as { context: string[] }
  expect(out.context).toEqual([`symcc closed Q-1 on the board with the owner's answer "${said}".`])
  expect(w.board().questions![0]).toMatchObject({ answer: said, answered_by: 'chat' })
  expect(w.board().questions![0]!.dropped).toBe(undefined)

  // the question has the words
  const w2 = world()
  const q = 'The tool use was rejected last time: retry?'
  const out2 = (await popupCall(w2.host, undefined, { questions: [ask(q, ['Yes', 'No'])] }, answeredWith({ [q]: 'Yes' }), w2.notice)) as { context: string[] }
  expect(out2.context).toEqual(['symcc closed Q-1 on the board with the owner\'s answer "Yes".'])
  expect(w2.board().questions![0]).toMatchObject({ answer: 'Yes', answered_by: 'chat' })
  expect(w2.board().questions![0]!.dropped).toBe(undefined)
})

test("T-753: a task-tied pop-up answered with the refusal words puts the answer into the task", async () => {
  const w = world()
  await waitingTask(w.host as never, { question: 'Red or blue?', options: ['Red', 'Blue'] })
  const said = "No: the client doesn't want to proceed"
  const q = 'T-1 asks: red or blue?'
  const out = (await popupCall(w.host, undefined, { questions: [ask(q, ['Red', 'Blue'], { header: 'T-1' })] }, answeredWith({ [q]: said }), w.notice)) as { context: string[] }
  expect(out.context[0]).toMatch(/^symcc put the owner's answer into T-1: /)
  const t = w.board().tasks[0]!
  expect(t.status).not.toBe('waiting')
  expect(t.history.map(h => h.text).join('\n')).toContain(said)
})

// T-801: the lead's wording of a task's question goes on the task and shows on the board in place of symcc's text
test("a tied pop-up for a file request puts the lead's wording on the task: it shows alone, the buttons stay, and it goes with the question", async () => {
  const w = world()
  await waitingTask(w.host as never, { question: 'T-1 needs to change files outside its list: b.ts. Allow them?', asked_files: ['b.ts'], note: 'asks to change b.ts' })
  const d = dialog()
  const r = popupCall(w.host, undefined, { questions: [ask('May T-1 touch b.ts?', ['Allow', "Don't allow"], { header: 'T-1' })] }, d.open, w.notice)
  await pause(0)
  const t = w.board().tasks[0]!
  // symcc's own text stays in the data; the lead's is next to it
  expect(t.ask?.text).toContain('needs to change files')
  expect(t.ask?.lead?.text).toBe('May T-1 touch b.ts?')
  const asks = taskAsks(t)!
  expect(asks.text).toBe('May T-1 touch b.ts?')
  expect(asks.choices).toEqual(['Allow', "Don't allow", 'Answer…'])
  expect(rowExtra(t, [t])).toBe('May T-1 touch b.ts?')
  const need = liveNeeds({ tasks: [t], questions: [] } as never, Date.now(), 200).find(x => x.id === 'T-1')!
  expect(need.segs.map(s => s.text).join('')).toContain('May T-1 touch b.ts?')
  // the Allow button's action still works, and the lead's text goes with the question
  d.answer({})
  void r
  await allowAskedFiles(w.host, 'T-1')
  const after = w.board().tasks[0]!
  expect(after.files).toContain('b.ts')
  expect(after.ask).toBeUndefined()
})

test("a worker's question with options shows the lead's question and options, an answer is that option's text, and the lead's text goes when answered", async () => {
  const w = world()
  await waitingTask(w.host as never, { question: 'Red or blue?', options: ['Red', 'Blue'] })
  const d = dialog()
  void popupCall(w.host, undefined, { questions: [ask('Which color do you want for it?', ['Crimson', 'Navy'], { header: 'T-1' })] }, d.open, w.notice)
  await pause(0)
  const t = w.board().tasks[0]!
  const asks = taskAsks(t)!
  expect(asks.text).toBe('Which color do you want for it?')
  expect(asks.choices).toEqual(['Crimson', 'Navy', 'Answer…'])
  await runTool(w.host, 'change', { task: 'T-1', answer: 'Navy' })
  const after = w.board().tasks[0]!
  expect(after.status).not.toBe('waiting')
  expect(after.ask).toBeUndefined()
  expect(after.history.map(h => h.text).join('\n')).toContain('Navy')
})

test("a tied pop-up keeps the task's waiting time, and a second one without options drops the first one's buttons", async () => {
  const w = world()
  await waitingTask(w.host as never, { question: 'Red or blue?', options: ['Red', 'Blue'] })
  const d = dialog()
  void popupCall(w.host, undefined, { questions: [ask('Which color?', ['Crimson', 'Navy'], { header: 'T-1' })] }, d.open, w.notice)
  await pause(0)
  expect(w.board().tasks[0]!.updated_at).toBe(ISO)
  expect(w.board().tasks[0]!.ask?.lead?.options).toEqual(['Crimson', 'Navy'])
  const d2 = dialog()
  void popupCall(w.host, undefined, { questions: [{ question: 'Tell me in your words', header: 'T-1', options: [], multiSelect: false }] }, d2.open, w.notice)
  await pause(0)
  const t = w.board().tasks[0]!
  expect(t.ask?.lead?.text).toBe('Tell me in your words')
  expect(t.ask?.lead?.options).toBeUndefined()
  expect(t.updated_at).toBe(ISO)
})

// T-801: the NEEDS YOU row keeps the lead's wording whole (the task id is not cut out of it)
test("the NEEDS YOU row for a more-time task shows the lead's text whole", () => {
  const t = { id: 'T-1', title: 'x', status: 'doing', live: { time_ask: 'over' }, ask: { by: 'symcc', text: 'more time?', asked_at: 'over', lead: { text: 'Give T-1 more time?' } }, started_at: new Date(Date.now() - 3600_000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never
  const need = liveNeeds({ tasks: [t], questions: [] } as never, Date.now(), 200).find(x => x.id === 'T-1')
  expect(need?.segs.map(s => s.text).join('')).toBe('⚠ T-1 Give T-1 more time?')
})
