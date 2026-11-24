// T-371 (step 8 of docs/research/host-independence.md): a host says what it can do (Host.features), and symcc falls
// back to text where a feature is missing. These run the logic on the shared fake Host with no panel, no band, a
// lead that is only reached on its next turn, no plan mode and no lead usage (as a standalone app or an OpenCode
// plugin may be), and check the host's words and the edit guard with tool names that are not Claude Code's.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost, memoryFs } from './fake-host'
import { type FileTouch, type HostFeatures, ALL_FEATURES, SYMCC_WORDS } from '../hooks/host'
import { CLAUDE_WORDS } from '../hooks/claude/host'
import { FILE_PATH_FIELD, editTouch, fileTouch } from '../hooks/claude/tools'
import { addTask, emptyBoard, boardText, shortHome, inPlan, bashOutsideText } from '../hooks/board'
import { S, checkerRuns, useName } from '../hooks/app/state'
import type { Board } from '../hooks/board'
import { publish } from '../hooks/app/lead'
import { tellLead, noteForLead } from '../hooks/app/tell'
import { seePlan } from '../hooks/app/plan'
import { WORKER_PROMPT, workerQuestionText } from '../hooks/app/workers'
import { overtimeLeadText } from '../hooks/app/cleanup'
import { LEAD_USAGE_UNREAD, leadGuide, manual, statsText } from '../hooks/app/tools'
import { BOARD_OPENED, leadUpdate, runCommand, toolCheck } from '../hooks/app/symcc'

const ROOT = '/repo'
const ISO = '2026-11-18T10:00:00.000Z'

/** A host with none of the extras: no panel, no band, no plan mode, no lead usage, and a lead reached on its next turn. */
const BARE: HostFeatures = { panel: false, band: false, wakeLead: 'next-turn', planMode: false, leadUsage: false, startQueue: true }

/** The fake Host with `features`, its files in memory, and what it was asked to open, show and time. */
function world(features: Partial<HostFeatures> = BARE) {
  const files = new Map<string, string>()
  const opened: string[] = []
  const status: (string | undefined)[] = []
  const timers: number[] = []
  const timer = { cancel: () => undefined }
  const f = fakeHost({
    features,
    session: { repo: async () => ({ root: ROOT }), root: async () => ROOT },
    fs: memoryFs(files),
    clock: { after: ms => (timers.push(ms), timer) },
    ui: { open: async p => (opened.push(p.id), { isPlaced: true }), status: text => void status.push(text) },
    lead: { usage: async () => ({ leadProblem: 'asked the host' }) },
  })
  S.root = ROOT
  return { ...f, files, opened, status, timers }
}

/** Puts board `b` in the world's files as board.json (the fake's run does no `mv`, so saveBoard can't). */
const putBoard = (w: ReturnType<typeof world>, b: Board) => void w.files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(b, null, 2) + '\n')

const oneTask = () => addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Add search', details: 'Done when: a test shows it.', files: ['src/'] }, ISO)[0]

test('no panel: /symcc answers with the text board and opens nothing; with a panel it opens it (/symcc-tasks: tests/task-list.test.ts)', async () => {
  const w = world()
  const b = oneTask()
  putBoard(w, b)
  const was = S.version
  S.version = '1.2.3'
  try {
    for (const cmd of [S.N.name]) {
      const r = await runCommand(w.host, cmd, '')
      expect(r?.text).toContain('T-1')
      expect(r?.text).toContain('Add search')
      // the title carries the plugin's version, as the board tool's answer does
      expect(r?.text?.split('\n')[0]).toContain('v1.2.3')
      expect(r?.text).toBe(boardText(b, Date.now(), shortHome(S.root, S.home), S.N.name, undefined, {}, '1.2.3'))
      expect(r?.isTextDisplayOnly).toBe(true)
    }
  } finally {
    S.version = was
  }
  expect(w.opened).toEqual([])
  // a task's command still answers with the task's text, with no panel opened
  expect((await runCommand(w.host, `${S.N.name}-task`, 'T-1'))?.text).toContain('Add search')
  expect(w.opened).toEqual([])
  // the same host with a panel opens it, as Claude Code does
  const c = world(ALL_FEATURES)
  putBoard(c, b)
  expect((await runCommand(c.host, S.N.name, ''))?.text).toBe(BOARD_OPENED)
  expect(c.opened).toEqual([S.N.pane])
})

test("wakeLead 'next-turn': a note for the lead is queued, not sent, and goes out once when the host takes it", async () => {
  const w = world()
  noteForLead('The owner approved T-1')
  tellLead(w.host, 'T-2 "Add search" was merged.')
  tellLead(w.host, 'T-3 failed its tests.')
  // nothing is sent and no timer is set to send it
  expect(w.toLead).toEqual([])
  expect(w.timers).toEqual([])
  const update = leadUpdate()
  expect(update).toBe(`[${S.N.name}] Board update:\n\nMeanwhile the owner (nothing to answer):\n- The owner approved T-1\n\nT-2 "Add search" was merged.\n\nT-3 failed its tests.\n\nLead: decide what happens next on the board (use the ${S.N.name} tools), then tell the owner briefly.\nReply shape: one line per task ("✓ T-5  merged   what it means"); a routine update with no news is one short line at most.`)
  // taken once: nothing waits now
  expect(leadUpdate()).toBeUndefined()
  // a host that wakes the lead at once sends it in a moment instead (on its timer)
  const c = world(ALL_FEATURES)
  tellLead(c.host, 'T-4 is done.')
  expect(c.timers).toEqual([1500])
})

test('no plan mode: plan signals are ignored (never "in plan"), and the lead guide leaves the plan mode paragraph out', async () => {
  const w = world()
  await seePlan(w.host, true)
  expect(inPlan(S.plan)).toBe(false)
  expect(S.plan.on).toBe(null)
  expect(leadGuide(w.host.features)).not.toContain('Plan mode (')
  expect(leadGuide(w.host.features)).toContain('you are the lead')
  // with plan mode the paragraph is there, in the host's own words
  useName(fakeHost({ words: CLAUDE_WORDS }).host)
  expect(leadGuide()).toContain("- Plan mode (Claude Code's own planning mode, Shift+Tab): only plan.")
  const c = world(ALL_FEATURES)
  await seePlan(c.host, true)
  expect(inPlan(S.plan)).toBe(true)
})

test('no band: the status text goes nowhere; with a band it is shown', async () => {
  const w = world()
  await publish(w.host, oneTask())
  expect(w.status).toEqual([])
  const c = world(ALL_FEATURES)
  await publish(c.host, oneTask())
  expect(c.status.length).toBe(1)
})

test('symcc disabled: the line under the prompt says how to turn it back on, without the name Claude Code already puts in front', async () => {
  const c = world(ALL_FEATURES)
  await publish(c.host, { ...oneTask(), enabled: false })
  expect(c.status).toEqual(['disabled · /symcc-enable to turn it back on'])
  // as Claude Code shows it: "⚠ symcc: disabled · /symcc-enable to turn it back on", the name once
  expect(`⚠ ${S.N.name}: ${c.status[0]}`).not.toMatch(/symcc: symcc/)
})

test("no lead usage: the stats say the lead's calls can't be read here, without asking the host", async () => {
  const w = world()
  putBoard(w, oneTask())
  const text = await statsText(w.host, '')
  expect(text).toContain(LEAD_USAGE_UNREAD)
  expect(text).not.toContain('asked the host')
  const c = world(ALL_FEATURES)
  putBoard(c, oneTask())
  expect(await statsText(c.host, '')).toContain('asked the host')
})

test("the worker prompt names the host's file tools: Claude Code's Read, Edit and Write, or none on a host that adds no words", () => {
  const b = oneTask()
  const t = b.tasks[0]!
  S.W = SYMCC_WORDS
  const plain = WORKER_PROMPT(t, b, `${ROOT}/.symcc/worktrees/T-1`)
  expect(plain).toContain('Use absolute paths under that folder for every file you read or change. Never touch the main project folder.')
  expect(plain).not.toContain('Read, Edit')
  S.W = CLAUDE_WORDS
  expect(WORKER_PROMPT(t, b, `${ROOT}/.symcc/worktrees/T-1`)).toContain('Use absolute paths under that folder for every Read, Edit and Write. Never touch the main project folder.')
})

/** An OpenCode-like host's tool calls in symcc's words: its tools are "edit", "write" and "bash", and name the file `filePath`. */
function otherTouch(tool: string, args: Record<string, unknown>): FileTouch | null {
  if (tool === 'edit' || tool === 'write') return { path: String(args.filePath ?? '') }
  if (tool === 'bash') return { command: String(args.command ?? '') }
  return null
}

test('the edit guard only sees what a call touches: a host whose tools have other names is guarded the same', async () => {
  const w = world()
  const wt = `${ROOT}/.symcc/worktrees/T-1`
  checkerRuns.set('chk', { task: 'T-1', worktree: wt, end: () => undefined })
  // an edit and a shell command reaching the owner's copy are refused; inside its own folder, and a read, are not
  expect(await toolCheck(w.host, 'chk', otherTouch('edit', { filePath: `${ROOT}/README.md` }))).toMatch(/^Refused: README\.md is in the owner's copy/)
  expect(await toolCheck(w.host, 'chk', otherTouch('bash', { command: `echo x > ${ROOT}/README.md` }))).toBe(bashOutsideText('README.md', wt))
  expect(await toolCheck(w.host, 'chk', otherTouch('write', { filePath: `${wt}/src/a.ts` }))).toBeUndefined()
  expect(await toolCheck(w.host, 'chk', otherTouch('read', { filePath: `${ROOT}/README.md` }))).toBeUndefined()
  // Claude Code's names mean nothing on this host: only the host's own mapping counts
  expect(otherTouch('Edit', { file_path: `${ROOT}/README.md` })).toBe(null)
  // the lead (no agent id) is never checked
  expect(await toolCheck(w.host, undefined, otherTouch('edit', { filePath: `${ROOT}/README.md` }))).toBeUndefined()
})

test("Claude Code's tool calls for the edit guard: Edit, Write, MultiEdit and NotebookEdit a file, Bash a command, others nothing", () => {
  expect(editTouch('Edit', { file_path: '/a' })).toEqual({ path: '/a' })
  expect(editTouch('Write', { file_path: '/b' })).toEqual({ path: '/b' })
  expect(editTouch('MultiEdit', { file_path: '/m', edits: [] })).toEqual({ path: '/m' })
  expect(editTouch('NotebookEdit', { notebook_path: '/c.ipynb' })).toEqual({ path: '/c.ipynb' })
  // a NotebookEdit's path is in notebook_path only: a file_path beside it is not taken
  expect(editTouch('NotebookEdit', { file_path: '/x' })).toEqual({ path: '' })
  // names every object has are not file tools
  expect(editTouch('toString', { file_path: '/a' })).toBe(null)
  expect(editTouch('constructor', { file_path: '/a' })).toBe(null)
  expect(editTouch('Bash', { command: 'ls' })).toEqual({ command: 'ls' })
  // an odd input still counts as that kind of call, with nothing in it
  expect(editTouch('Edit', { file_path: 3 })).toEqual({ path: '' })
  expect(editTouch('Bash', null)).toEqual({ command: '' })
  expect(editTouch('Read', { file_path: '/a' })).toBe(null)
  expect(editTouch('Grep', { pattern: 'x' })).toBe(null)
})

test('T-419: the edit guard (editTouch) and the after-a-call list (fileTouch) cover the same four file tools, from one list', () => {
  expect(Object.keys(FILE_PATH_FIELD).sort()).toEqual(['Edit', 'MultiEdit', 'NotebookEdit', 'Write'])
  expect(Object.isFrozen(FILE_PATH_FIELD)).toBe(true)
  for (const [tool, field] of Object.entries(FILE_PATH_FIELD)) {
    expect(editTouch(tool, { [field]: `/p/${tool}` })).toEqual({ path: `/p/${tool}` })
    expect(fileTouch({ tool, [field]: `/p/${tool}` })).toEqual({ path: `/p/${tool}` })
  }
  expect(fileTouch({ tool: 'NotebookEdit', notebook_path: '/n.ipynb' })).toEqual({ path: '/n.ipynb' })
  expect(fileTouch({ tool: 'toString', file_path: '/a' })).toBe(null)
})

test("no pop-up question tool: the lead guide and lead notes don't name one; Claude Code's AskUserQuestion text stays word for word", () => {
  S.W = SYMCC_WORDS
  const guide = leadGuide(BARE)
  const notes = workerQuestionText('T-2', 'Which one?', ['A', 'B']) + overtimeLeadText('T-3', 'Add search', 30)
  for (const text of [guide, notes]) expect(text).not.toContain('AskUserQuestion')
  expect(guide).toContain('you ask as plain chat text with numbered options, plus "or answer on the board". Don\'t stack two questions under the same numbers: ask one at a time.\n')
  expect(guide).toContain('and ask it briefly in the chat too, with the options as numbered plain chat text, plus "or answer on the board".')
  expect(guide).not.toContain('pop-up')
  expect(notes).toContain('offering the options as numbered plain chat text, plus "or answer on the board"')
  expect(notes).toContain('offering these as numbered plain chat text, plus "or answer on the board"')
  S.W = CLAUDE_WORDS
  expect(leadGuide()).toContain('you ask in the chat with AskUserQuestion, with the same options')
  expect(leadGuide()).not.toContain('Never use AskUserQuestion')
  expect(workerQuestionText('T-2', 'Which one?', ['A', 'B'])).toContain('offering the options with AskUserQuestion, plus "or answer on the board"')
  expect(overtimeLeadText('T-3', 'Add search', 30)).toContain('offering these with AskUserQuestion, plus "or answer on the board"')
})

test('no panel: /symcc-help says /symcc shows the board, not that it opens the panel; with a panel it opens it', async () => {
  const bare = manual('commands', BARE)
  expect(bare).not.toContain('open the board panel')
  expect(bare).not.toContain('open the panel on')
  expect(bare).toContain(`/${S.N.name}                     show the board`)
  expect(manual('', BARE)).not.toContain('open the board panel (')
  expect(manual('commands')).toContain(`/${S.N.name}                     open the board panel (`)
  // T-465: no panel-only lines (the panel's keys, "opens everything", Esc) without a panel; the panel's help keeps them
  const panelLines = [`/${S.N.name} opens everything`, 'the whole panel', 'On the board: t tasks', 'In the settings view', 'In the panel nothing needs Esc', 'In an open task: b back', 'p on its page', 'answer it in the board panel', 'the c tab in the', 'on its page press Allow', 'press g in the board', 'in the band', 'with a button']
  for (const line of panelLines) {
    expect(manual('', BARE)).not.toContain(line)
    expect(manual('')).toContain(line)
  }
  // T-1012: the task page keys list e (run now)
  expect(manual('')).toContain("x drop · e run now (to do tasks) · w watch the worker")
  // the lead topic too: no band line, no panel button; open_on_start only as OpenCode's (T-765); the question tool is still named
  const lead = manual('lead', BARE)
  expect(lead).toContain('question puts a question for you')
  expect(lead).toContain('answer it in the chat (the lead closes it then)')
  expect(lead).toContain('notify (voice, sound 1, sound 2, sound 3 or off')
  expect(lead).toContain('open_on_start (OpenCode only:')
  expect(lead).not.toContain('sound_set')
  expect(bare).toContain(`/${S.N.name} shows the board as text`)
  expect(bare).toContain(`/${S.N.name}-settings [NAME VALUE]  show the settings, or set one setting`)
  expect(bare).toContain('Everything else, just say to the lead')
  // through the command, with the host's features
  const w = world()
  const r = await runCommand(w.host, `${S.N.name}-help`, 'commands')
  expect(r?.text).toContain('show the board')
  expect(r?.text).not.toContain('open the board panel')
})
