// T-409: the lead's questions for the owner that are not about one task live on the board (board.questions), so
// they don't scroll away in the chat: "Questions for you" in the panel, a count in the band and the status line,
// "needs you" once, a board answer wakes the lead at once with an act-on-it block (T-434), and a chat answer closes it through the tool.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { fakeHost, memoryFs, done } from './fake-host'
import { ran, readText, entry, pause } from './fakes'
import { inProject } from './project'
import { type Board, emptyBoard, readBoard, statusLine, boardText, addQuestion, answerQuestion, openQuestions, NEEDS_YOU_MARK } from '../hooks/board'
import { boardAnswerLine } from '../hooks/core/questions'
import { S, sayQueue, meanwhile } from '../hooks/app/state'
import { runTool, leadGuide, TOOLS } from '../hooks/app/tools'
import { answerOnBoard } from '../hooks/app/questions'
import { tellLead, noteForLead } from '../hooks/app/tell'

const ROOT = '/repo'
const ISO = '2026-11-18T10:00:00.000Z'

/** The fake Host with its files in memory (the board's lock and its save through a temp file work), and the status lines it showed. */
function world() {
  const files = new Map<string, string>()
  const status: (string | undefined)[] = []
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
    ui: { status: text => void status.push(text) },
  })
  S.root = ROOT
  S.driving = true
  S.enabledNow = true
  const board = (): Board => readBoard(files.get(`${ROOT}/${S.N.boardFile}`) ?? null).board
  return { ...f, files, status, board }
}

const call = (host: unknown, args: Record<string, unknown>) => runTool(host as never, 'question', args as never)

test('a question the lead adds is saved on the board, shown to the panel, in the status line, and says "needs you" once', async () => {
  const w = world()
  const said = await call(w.host, { action: 'add', text: 'Raise the version?', options: ['Yes', 'No', 'Later'] })
  expect(said).toContain('added Q-1 "Raise the version?"')
  expect(said).toContain('Ask it briefly in the chat too')
  const q = w.board().questions?.[0]
  expect(q).toMatchObject({ id: 'Q-1', text: 'Raise the version?', options: ['Yes', 'No', 'Later'] })
  expect(q?.asked_at).toBeTruthy()
  expect(q?.answer).toBeUndefined()
  // the panel's view has the open question; the status line counts it
  expect((w.panel.view() as { questions?: unknown[] }).questions).toEqual([q])
  expect(w.status.at(-1)).toContain('1 question for you')
  // the same "needs you" as a waiting task, once per question
  expect(sayQueue).toEqual([`${NEEDS_YOU_MARK}Q-1`])
  await call(w.host, { action: 'add', text: 'Add a docs scout?', options: ['Yes', 'No'] })
  expect(sayQueue).toEqual([`${NEEDS_YOU_MARK}Q-1`, `${NEEDS_YOU_MARK}Q-2`])
  expect(w.status.at(-1)).toContain('2 questions for you')
  // the list action and the board tool's text show them
  expect(await call(w.host, { action: 'list' })).toContain('Open questions for the owner (2):\n- Q-1 Raise the version? (Yes | No | Later)')
  expect(await runTool(w.host, 'board', {})).toContain('Questions for you (2):')
})

test('a question needs a text and 2 to 6 options', async () => {
  const w = world()
  await expect(call(w.host, { action: 'add', text: 'Go?', options: ['Yes'] })).rejects.toThrow('options: give 2 to 6 short choices')
  await expect(call(w.host, { action: 'add', text: 'Go?', options: ['1', '2', '3', '4', '5', '6', '7'] })).rejects.toThrow('got 7')
  await expect(call(w.host, { action: 'add', text: '  ', options: ['Yes', 'No'] })).rejects.toThrow('text is missing')
  expect(w.board().questions).toBeUndefined()
})

test('answering on the board closes the question and wakes the lead at once with an act-on-it block (T-434)', async () => {
  const w = world()
  // a host that wakes the lead at once; its timer runs the job a moment later
  w.host.features = { ...w.host.features, wakeLead: 'now' }
  w.host.clock = { ...w.host.clock, after: (_ms, job) => (void Promise.resolve().then(job), { cancel: () => undefined }) }
  await call(w.host, { action: 'add', text: 'Raise the version?', options: ['Yes', 'No'] })
  expect(await answerOnBoard(w.host, 'Q-1', 'Yes')).toBe('Q-1 answered: Yes; the lead will take it from here')
  const q = w.board().questions![0]!
  expect(q).toMatchObject({ answer: 'Yes', answered_by: 'board' })
  expect(openQuestions(w.board())).toEqual([])
  // gone from the panel's list and the status line, kept in the file as history
  expect((w.panel.view() as { questions?: unknown[] }).questions).toBeUndefined()
  expect(w.status.at(-1) ?? '').not.toContain('question')
  // with nothing else happening on the board: one board update right away, the answer in its own block
  await pause(0)
  expect(w.toLead).toEqual([`[${S.N.name}] Board update:\n\nThe owner answered your question Q-1 ("Raise the version?"): Yes. The question is closed. Act on it.\n\nLead: decide what happens next on the board (use the ${S.N.name} tools), then tell the owner briefly.`])
  expect(w.toLead[0]).not.toContain('Meanwhile')
  expect(meanwhile).toEqual([])
  // other owner actions still come only as Meanwhile lines: no message of their own, at the top of the next update
  noteForLead('The owner approved T-1')
  await pause(0)
  expect(w.toLead.length).toBe(1)
  expect(meanwhile).toEqual(['The owner approved T-1'])
  tellLead(w.host, 'T-3 was merged.')
  await pause(0)
  expect(w.toLead.length).toBe(2)
  expect(w.toLead[1]).toContain('Meanwhile the owner (nothing to answer):\n- The owner approved T-1\n\nT-3 was merged.')
  // the lead closing it again from the chat changes nothing and says the board answer was used
  expect(await call(w.host, { action: 'answer', id: 'Q-1', answer: 'No' })).toBe('Q-1 was already closed (answered on the board: "Yes"); nothing changed. Use that answer and tell the owner it was taken.')
  expect(w.board().questions![0]!.answer).toBe('Yes')
})

test('an answer in the chat closes the question through the tool; drop takes one back', async () => {
  const w = world()
  await call(w.host, { action: 'add', text: 'Raise the version?', options: ['Yes', 'No'] })
  await call(w.host, { action: 'add', text: 'Add a scout?', options: ['Yes', 'No'] })
  expect(await call(w.host, { action: 'answer', id: 'q1', answer: 'Yes, to 0.4' })).toBe('Q-1 closed with the owner\'s answer: "Yes, to 0.4" (1 question for you still open)')
  expect(w.board().questions![0]).toMatchObject({ answer: 'Yes, to 0.4', answered_by: 'chat' })
  expect(await call(w.host, { action: 'drop', id: 'Q-2' })).toBe('Q-2 dropped; it is off the board')
  expect(openQuestions(w.board())).toEqual([])
  expect(await call(w.host, { action: 'list' })).toContain('- Q-1 Raise the version?: answered in the chat: "Yes, to 0.4"')
  await expect(call(w.host, { action: 'answer', id: 'Q-9', answer: 'x' })).rejects.toThrow('Q-9 is not on the board')
  // a new question never reuses a number
  expect(await call(w.host, { action: 'add', text: 'Again?', options: ['Yes', 'No'] })).toContain('added Q-3')
})

test('the board file keeps questions as they were and drops broken entries', () => {
  const [b] = addQuestion(emptyBoard(), 'Go?', ['Yes', 'No'], ISO)
  const [b2] = answerQuestion(b, 'Q-1', 'No', 'board', ISO)
  const text = JSON.stringify({ ...b2, questions: [...b2.questions!, { id: 'nope' }, null] })
  const r = readBoard(text)
  expect(r.board.questions).toEqual(b2.questions)
  expect(r.board.next_question).toBe(2)
  // a board with no questions stays without the fields
  expect('questions' in readBoard(JSON.stringify(emptyBoard())).board).toBe(false)
  // the status line counts only open questions, right after the mode, also on an empty board
  expect(statusLine({ tasks: [], questions: b.questions }, true)).toBe('⏵ auto · 1 question for you')
  expect(statusLine({ tasks: [], questions: b2.questions }, true)).toBeUndefined()
  expect(boardText(b2)).not.toContain('Questions for you')
})

test('the lead guide says every question for the owner that is not about one task goes on the board', () => {
  const guide = leadGuide()
  expect(guide).toContain('Put every question for the owner that isn\'t about one task')
  expect(guide).toContain('on the board with symcc question')
  expect(guide).toContain('ask it briefly in the chat too')
  expect(guide).toContain('Never leave a question only in the chat')
  expect(guide).toContain('close it with symcc question action answer')
  expect(TOOLS().map(t => t.name)).toContain('question')
})

// ---------------- the panel and the band ----------------

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: 'symcc board · symcc', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const BAND = {
  plugin: 'symcc',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

const task = (id: string, status: string, title: string) => ({ id, title, details: '', files: [], status, note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '' })

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it. */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  inProject(on)
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seed) ? next(e) : { value: { value: seed[e.key], version: 1 } }))
}

/** The board's files (keyed by their end); what is written is kept in `written`. */
function fakeFiles(on: On, files: Record<string, string | null>) {
  const written: Record<string, string> = {}
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : next(e)))
  on('fs.list', (_, e, next) => (fileOf(e.path) ? { value: [entry('board.json')] } : next(e)))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  on('fs.write', (_, e) => ((written[e.path] = String(e.text)), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: ran() }))
  inProject(on)
  return written
}

test('the panel lists the open questions above the tasks; a button answers one and it leaves the list', async ($, on) => {
  const [b] = addQuestion({ ...emptyBoard(), tasks: [task('T-1', 'todo', 'Docs')] as never }, 'Raise the version?', ['Yes', 'No'], ISO)
  const view = { tasks: b.tasks, working: [], scouts: [], mode: 'auto', test_commands: [], questions: b.questions }
  stateOf(on, { view: { shape: 'view-1', value: view } })
  const written = fakeFiles(on, { '/board.json': JSON.stringify(b), '/board.lock': null })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // "Questions for you (1)" comes before the tasks
  const tree = JSON.stringify(await ui.drawn())
  expect(tree.indexOf('Questions for you (1)')).toBeGreaterThan(-1)
  expect(tree.indexOf('Questions for you (1)')).toBeLessThan(tree.indexOf('Docs'))
  expect(await ui.find({ type: 'Text', text: /Raise the version\?/ })).toBeDefined()
  // its page: the question, one button per option plus Answer…
  await ui.press({ key: 'Q-1' })
  expect(await ui.find({ type: 'Text', text: /Question for you/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^asks: $/ })).toBeDefined()
  expect((await ui.find({ key: 'choice-1' }))?.props.label).toBe('Yes')
  expect((await ui.find({ key: 'choice-2' }))?.props.label).toBe('No')
  expect((await ui.find({ key: 'choice-3' }))?.props.label).toBe('Answer…')
  expect(await ui.find({ type: 'Text', text: 'keys 1-3 pick a choice' })).toBeDefined()
  // told once: the bottom key list has only b back (T-513)
  expect(JSON.stringify(await ui.drawn()).match(/pick/g)?.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: ' answer' })).toBeUndefined()
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  await ui.press({ key: 'choice-3' })
  expect(await ui.find({ key: 'answer' })).toBeDefined()
  await ui.press({ key: 'answer-cancel' })
  // a button is the answer: the question is closed on the board (the lead's board update for it is checked
  // above, in "answering on the board ..."), and the panel goes back to the list, where it is gone
  await ui.press({ key: 'choice-1' })
  const saved = Object.entries(written).filter(([p]) => /board\.json\..*\.tmp$/.test(p)).map(([, text]) => JSON.parse(text))
  expect(saved.length).toBe(1)
  expect(saved[0].questions[0]).toMatchObject({ id: 'Q-1', answer: 'Yes', answered_by: 'board' })
  // the press doesn't wait for the toast and the way back after the save
  for (let i = 0; i < 100 && !toasts.length; i++) await pause(10)
  expect(toasts).toEqual([JSON.stringify({ text: 'symcc: Q-1 answered: Yes; the lead will take it from here' })])
  expect(await ui.find({ type: 'Text', text: /Questions for you/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Docs/ })).toBeDefined()
  await ui.unmount()
})

test('the band says "2 questions for you" and lists them, also with no task on the board', async ($, on) => {
  const [b1] = addQuestion(emptyBoard(), 'Raise the version?', ['Yes', 'No'], ISO)
  const [b2] = addQuestion(b1, 'Add a scout?', ['Yes', 'No'], ISO)
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [], questions: b2.questions } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /⏵ auto · 2 questions for you/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Q-1 for you$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Add a scout\?/ })).toBeDefined()
  await ui.unmount()
})

test('the act-on-it block adds a full stop only when the answer has no end mark of its own (T-434)', () => {
  const q = { id: 'Q-3', text: 'Raise the version?', options: [], asked_at: ISO }
  const start = 'The owner answered your question Q-3 ("Raise the version?"): '
  const end = ' The question is closed. Act on it.'
  expect(boardAnswerLine({ ...q, answer: 'Yes' })).toBe(`${start}Yes.${end}`)
  expect(boardAnswerLine({ ...q, answer: 'Yes, raise it to 0.5.' })).toBe(`${start}Yes, raise it to 0.5.${end}`)
  expect(boardAnswerLine({ ...q, answer: 'Why?' })).toBe(`${start}Why?${end}`)
  expect(boardAnswerLine({ ...q, answer: 'Do it now!' })).toBe(`${start}Do it now!${end}`)
})

test("a question's page tells the answer keys once: the dim line under the buttons, not the bottom key list (terminal, desktop, mobile)", async ($, on) => {
  const [b] = addQuestion({ ...emptyBoard(), tasks: [] as never }, 'Raise the version?', ['Yes', 'No'], ISO)
  const view = { tasks: b.tasks, working: [], scouts: [], mode: 'auto', test_commands: [], questions: b.questions }
  stateOf(on, { opened: b.questions![0]!.id, view: { shape: 'view-1', value: view } })
  fakeFiles(on, { '/board.json': JSON.stringify(b), '/board.lock': null })
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const tree = JSON.stringify(await ui.drawn())
    expect(tree, surface).toContain('Question for you')
    expect(tree.match(/pick/g)?.length, surface).toBe(1)
    expect(tree, surface).toContain('keys 1-3 pick a choice')
    expect(tree, surface).not.toContain('" answer"')
    await ui.unmount()
  }
})
