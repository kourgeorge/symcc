// symcc's OpenCode TUI part (T-466), run with bun test (scripts/test-opencode-host.sh). What the TUI draws comes from
// board-view.ts, made with hooks/core's helpers, so the band's and the panel's lines are checked as data: the band's
// row fronts (bandLeads) with no stray note for a "worker starting" row (T-470's claim note), the list grouped by state
// with the terminal list's marks and short states, a task's page, and its keys. Then startTui runs on a fake tui
// context and a fake Solid runtime (no OpenCode needed): it reads .symcc/view.json from a folder above its own, draws
// the panel and the band from it, opens the panel from the "/symcc" keymap command, and sends the panel's approve,
// reject and answer as symcc's slash commands in the panel's session. And how the TUI part gets OpenCode's Solid and
// OpenTUI (T-500): opencode/tui.ts imports them by their written-out names (what OpenCode swaps for its own copies),
// and loadTuiRuntime names a package that is missing or lacks a function instead of failing with a bare import error.
import { test, expect } from 'bun:test'
import { LIVE_TABS, tabRow as coreTabRow, roleKeys, rolesKeys, kindsKeys, scoutHowTo, LIVE_IDLE, liveLegend, liveLanes, liveLayout, liveStations, liveHeader, liveNowSegs, liveLabelLine, laneLines, segText, liveTrains, trainRows, liveToday, todayLines, modeLabel, modeButton, promptsOfRole, ROLE_SLOT, SETTING_GROUPS, groupSummaryParts, taskActions, actionButtonLabel, settingsKeys, mergeRoles, mergeKinds, when, addTask, emptyBoard, patchTask, bandNote, gitNote, statusCell, STATUS_MARK, showsHeader, roleTools, roleNameError, leadScoutNameError, type BoardPage, type Board } from '../../board'
import type { PaneView } from '../../app/state'
import type { SymccMode, SymccTask } from '../../../types'
import { ICON } from '../../name'
import { PANEL_MARK, hasPage, bandLines, bandDraw, BAND_CLICK_HINT, panelLines, panelKeys, parseViewFile, viewFileText, lineText, actionCommand, answerOptions, OWN_ANSWER, viewDefs, panelTaskActions, TASK_ACTION_COMMANDS, SETTINGS_OPEN, approveSent, APPROVE_SENT_MS, drawnLines, gitRowLines, boardPageOf, defDraftOf, defEditKeys, noDescriptionText, draftError, SETUP_GIT_ASK, EDIT_FIRST_BOX, newNameError, type ViewFile, type PanelChoice } from '../board-view'
import { readFile } from 'node:fs/promises'
import { rowEndBoard, ROW_END, ROW_END_NOW } from '../../../tests/row-end-cases'
import { BRANCH_LINES_100, BRANCH_STATE_ROWS_100, branchFactsAt, branchStateFactsAt, branchStateTasks, branchTasks, taskBranchDoing, taskBranchLong, taskBranchMerged, taskBranchTasks } from '../../../tests/branches-fixture'
import type { TaskBranchFacts } from '../../core/task-branch'
import { TODAY_BAR_START, TODAY_LINE_3, todayTasks, todayTeamOf } from '../../../tests/live-today-fixture'
import { PAST_WEEK, PAST_YESTERDAY, pastTasks } from '../../../tests/live-past-fixture'
import { localOffset, dayOf, dayLabel } from '../../core/days'
import { todayAt } from '../../../tests/day-clock'
import { textWidth as textWidthOf } from '../../core/width'
import { LIVE_INDENT, liveBranches, liveHeading, liveInner } from '../../core/live'
import { LIST_TONE } from '../../core/details'
import { taskSections } from '../../core/task-sections'
import { viewTask, viewStubFilled } from '../../core/board-parts'
import { orgMemNotes, orgMemNoteKey } from '../../core/org-mem'
import { PLUGIN_ROOT } from '../host'
import { inGroups, pillText, taskListIds, scoutListNames } from '../../core/page-header'
import { PANEL_TABS } from '../board-view'
import { startTui as startTuiLive, KEY_BINDS, viewPaths, loadTuiRuntime, BOARD_PANEL, setupFailed, colorOf, drawLines, type TuiContext, type TuiRuntime, type TuiPanelInput, type TuiKeyLayer, type PanelKey } from '../tui'

const NOW = Date.parse('2026-11-19T12:00:00.000Z')
/** Every Settings group's title (all of them open). */
const ALL_GROUPS = SETTING_GROUPS.map(g => g.title)
/** T-903: whether a Live tab line is one of the idle lines TASKS shows when no task runs (liveIdle). */
const idleLine = (t: string) => t.startsWith(LIVE_INDENT + 'Nothing running') || t.startsWith(LIVE_INDENT + LIVE_IDLE.done) || [LIVE_IDLE.paused, LIVE_IDLE.fresh].some(x => t === LIVE_INDENT + x)
const AT = '2026-11-19T11:00:00.000Z'

/** A board: T-1 doing (its worker just claimed it: "worker starting", started 3 minutes ago), T-2 in review, T-3
 *  waiting with choices, T-4 to do, T-5 done; and the view file the engine would write for it. */
function viewFile(): ViewFile {
  let b: Board = emptyBoard()
  for (const title of ['a change in src', 'a reviewed change', 'which database', 'a later one', 'an old one']) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, AT)[0]
  b = patchTask(b, 'T-1', { status: 'doing', note: 'worker starting' }, AT)
  b = patchTask(b, 'T-2', { status: 'review' }, AT)
  b = patchTask(b, 'T-3', { status: 'waiting', ask: { by: 'worker', text: 'Which database?', options: ['mysql', 'postgres'], asked_at: AT } }, AT)
  b = patchTask(b, 'T-5', { status: 'done' }, AT)
  const view: PaneView = { tasks: b.tasks, working: [{ task: 'T-1', since: NOW - 3 * 60_000 }], scouts: [], mode: 'auto', test_commands: ['bun test'], max_parallel: 2, max_minutes: 30, auto_retries: 1, driving: true, home_branch: 'main', branch_note: '' }
  return { root: '/work/proj', home: '/work', name: 'symcc', version: '0.9.0', written_at: NOW, view }
}


/**
 * T-888: what the board panel sent, without the PANEL_MARK every send ends with (the server keeps a panel press's
 * answer a quiet note by it); a send without the mark shows up as "NO PANEL MARK: ..." so every send check fails.
 */
const unmarked = <T extends { text: string }>(input: T): T =>
  ({ ...input, text: input.text.endsWith(PANEL_MARK) ? input.text.slice(0, -PANEL_MARK.length) : `NO PANEL MARK: ${input.text}` })

test('the view file round-trips, and a broken or foreign one reads as none', () => {
  const f = viewFile()
  expect(parseViewFile(viewFileText(f))).toEqual(f)
  for (const bad of [null, '', '{', '{"view":{}}', '[]']) expect(parseViewFile(bad)).toBe(null)
  expect(viewPaths('/work/proj/.symcc/worktrees/T-1')).toEqual(['/work/proj/.symcc/worktrees/T-1/.symcc/view.json'])
})

test('T-630: the panel and the band show no all-time total of the tries ("total: … tokens in all over N tries"); a task page keeps its own', () => {
  const f = viewFile()
  const runs = [{ started: '2026-11-19T10:00:00.000Z', ended: '2026-11-19T10:12:00.000Z', agents: [{ kind: 'worker' as const, started: '2026-11-19T10:00:00.000Z', ended: '2026-11-19T10:12:00.000Z', tokens: { input: 40_000 } }] }]
  const g: ViewFile = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => ({ ...t, runs })) } }
  const list = panelLines(g, { opened: '', cursor: 0 }, NOW, 120).lines.map(lineText).join('\n')
  const band = bandLines(g, NOW, 120).map(lineText).join('\n')
  for (const text of [list, band]) expect(text).not.toMatch(/total:|tokens in all over|40k tokens/)
  expect(panelLines(g, { opened: 'T-5', cursor: 0 }, NOW, 120).lines.map(lineText).join('\n')).toMatch(/total: 12m · 40k tokens in all/)
})

test('T-966: OpenCode\'s task page Priority row: the number, "next to start" / "2nd in line" for ready to do tasks, "waits on" for a waiting one, only the number for a done one', () => {
  const f = viewFile()
  const row = (g: ViewFile, id: string) => panelLines(g, { opened: id, cursor: 0 }, NOW, 120).lines.map(lineText).find(l => /^Priority:/.test(l))!
  expect(row(f, 'T-4')).toBe('Priority: 0 · next to start')
  expect(row(f, 'T-5')).toBe('Priority: 0')
  // T-2 back to do with a lower priority than T-4: it starts first; T-1 back to do waiting on T-2
  const g: ViewFile = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-2' ? { ...t, status: 'todo' as const, priority: -2 } : t.id === 'T-1' ? { ...t, status: 'todo' as const, after: ['T-2'] } : t)) } }
  expect(row(g, 'T-2')).toBe('Priority: -2 · next to start')
  expect(row(g, 'T-4')).toBe('Priority: 0 · 2nd in line')
  expect(row(g, 'T-1')).toBe('Priority: 0 · waits on T-2 first')
})

test('T-631: the task page Tries row shows the last try and the sum (one try: just that try; no tokens: no token parts)', () => {
  const f = viewFile()
  const page = (attempts: number, runs: { started: string; ended?: string; agents?: { kind: 'worker'; started: string; ended?: string; tokens?: { input: number } }[] }[]) => {
    const g: ViewFile = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-5' ? { ...t, attempts, runs } : t)) } }
    return panelLines(g, { opened: 'T-5', cursor: 0 }, NOW, 120).lines.map(lineText).find(l => /^Tries:/.test(l))!
  }
  const r1 = { started: '2026-11-19T10:00:00.000Z', ended: '2026-11-19T10:05:00.000Z', agents: [{ kind: 'worker' as const, started: '2026-11-19T10:00:00.000Z', ended: '2026-11-19T10:05:00.000Z', tokens: { input: 1_200_000 } }] }
  const r2 = { started: '2026-11-19T11:00:00.000Z', ended: '2026-11-19T11:06:00.000Z', agents: [{ kind: 'worker' as const, started: '2026-11-19T11:00:00.000Z', ended: '2026-11-19T11:06:00.000Z', tokens: { input: 1_200_000 } }] }
  const r3 = { started: '2026-11-19T12:00:00.000Z', ended: '2026-11-19T12:06:00.000Z', agents: [{ kind: 'worker' as const, started: '2026-11-19T12:00:00.000Z', ended: '2026-11-19T12:06:00.000Z', tokens: { input: 1_200_000 } }] }
  expect(page(1, [r1])).toMatch(/^Tries:\s+1 · 5m · 1\.2M tokens$/)
  expect(page(3, [r1, r2, r3])).toMatch(/^Tries:\s+3 · last: 6m · 1\.2M tokens · all: 17m · 3\.6M tokens$/)
  const running = { started: new Date(NOW - 4 * 60_000).toISOString(), agents: [{ kind: 'worker' as const, started: new Date(NOW - 4 * 60_000).toISOString(), tokens: { input: 300_000 } }] }
  expect(page(2, [r1, running])).toMatch(/^Tries:\s+2 · last: 4m \(running\) · 300k tokens · all: 9m · 1\.5M tokens$/)
  const bare = [r1, r2, r3].map(({ agents: _, ...r }) => r)
  expect(page(3, bare)).toMatch(/^Tries:\s+3 · last: 6m · all: 17m$/)
})

test('T-643: a session that does not drive: a warning line under the banner and a warning mark in the band; doing rows run in the other session', () => {
  const f = viewFile()
  // T-1 was claimed a minute ago ("worker starting") and has no worker here
  const fresh = new Date(NOW - 60_000).toISOString()
  const view = (driving: boolean, updated_at = fresh): ViewFile => ({ ...f, view: { ...f.view, driving, working: [], tasks: f.view.tasks.map(t => (t.id === 'T-1' ? { ...t, updated_at } : t)) } })
  const warnLines = (g: ViewFile, w = 120) => panelLines(g, { opened: '', cursor: 0 }, NOW, w).lines.filter(l => l.some(s => s.color === 'warning' && s.text.startsWith('⚠')))
  // T-694: the line sits right under the tests/limits line, beside the drawing's last row when wide; its text from the ⚠ on
  const warnText = (l: Parameters<typeof lineText>[0]) => lineText(l).slice(lineText(l).indexOf('⚠'))
  const full = '⚠ this window follows; /symcc-drive to drive from here'
  expect(warnLines(view(false)).map(warnText)).toEqual([full])
  // narrow: a shorter form that fits
  const narrow = warnLines(view(false), 40).map(lineText)
  expect(narrow.length).toBe(1)
  expect(narrow[0]!.length <= 40).toBe(true)
  expect(narrow[0]).toContain('/symcc-drive')
  // the band: the mark right after the brand, in the warning color; T-1's row says where it runs
  const band = bandDraw(view(false), NOW, 120).lines
  expect(band[0]![1]).toEqual({ text: ' ⚠ this window follows; /symcc-drive to drive from here', color: 'warning' })
  expect(band.map(lineText).find(l => l.startsWith('T-1'))).toMatch(/ — runs in the other session$/)
  // claimed an hour ago and still not started there: it looks idle
  expect(warnLines(view(false, AT), 140).map(warnText)).toEqual(['⚠ this window follows (the driver looks idle); /symcc-drive to drive from here'])
  expect(bandDraw(view(false, AT), NOW, 120).lines[0]![1]!.text).toBe(' ⚠ this window follows (the driver looks idle); /symcc-drive to drive from here')
  // T-952: the view names the driver (lead.json's since and active): the same words as in Claude Code, shorter when narrow
  const driver = { heartbeat: NOW - 10_000, since: NOW - 9 * 3_600_000, active: NOW - 3 * 60_000 }
  const led: ViewFile = { ...view(false), view: { ...view(false).view, driver } }
  expect(warnLines(led, 160).map(warnText)[0]).toMatch(/^⚠ this window follows \(driver started \w{3} \d+ \d\d:\d\d, active 3 min ago\); \/symcc-drive to drive from here$/)
  expect(bandDraw(led, NOW, 140).lines[0]![1]!.text).toBe(' ⚠ this window follows (driver active 3 min ago); /symcc-drive to drive from here')
  expect(bandDraw(led, NOW, 120).lines[0]![1]!.text).toBe(' ⚠ this window follows (driver active 3 min ago) · /symcc-drive')
  expect(bandDraw(led, NOW, 100).lines[0]![1]!.text).toBe(' ⚠ follows (driver active 3 min ago) · /symcc-drive')
  expect(bandDraw(led, NOW, 70).lines[0]![1]!.text).toBe(' ⚠ this window follows · /symcc-drive')
  // off here (another window drives): the banner's first line names it too
  const off: ViewFile = { ...led, view: { ...led.view, on_here: false, off_here: 'other' } }
  expect(panelLines(off, { opened: '', cursor: 0 }, NOW, 200).lines.map(lineText).join('\n')).toContain('another window drives this board (')
  // the driving session: neither, and the row keeps its own note
  expect(warnLines(view(true))).toEqual([])
  const own = bandDraw(view(true), NOW, 120).lines
  expect(own.map(lineText).join('\n')).not.toContain('⚠')
  expect(own.map(lineText).find(l => l.startsWith('T-1'))).toMatch(/ — worker starting$/)
})

test('T-517, T-706: with no git repo the banner warns with Claude Code\'s "set up git (g)" and its git row with the [ Set up git (g) ] button', () => {
  const f = viewFile()
  for (const git_state of ['no-repo', 'no-commits'] as const) {
    const d = panelLines({ ...f, view: { ...f.view, git_state, branch_note: gitNote(git_state) } }, { opened: '', cursor: 0 }, NOW, 140)
    const lines = d.lines.map(lineText)
    expect(lines.join('\n')).toContain(git_state === 'no-repo' ? 'no git repo here; set up git (g)' : 'no commits yet; set up git (g)')
    expect(lines.join('\n')).not.toContain('ask the lead')
    // Claude Code's git row (parts.tsx gitRow): the warning, then the button
    expect(lines).toContain(`${git_state === 'no-repo' ? 'No git repo here: symcc needs git for task branches. No worker starts until it is set up. ' : 'No commits yet: symcc needs a first commit for task branches. No worker starts until it is set up. '}[ Set up git (g) ]`)
    expect(d.lines.flat().find(s => s.text === '[ Set up git (g) ]')?.hit).toEqual({ key: 'g' })
  }
  // T-861: git missing: the notice gives the install step and has no button
  const missing = panelLines({ ...f, view: { ...f.view, git_state: 'no-git', git_install: 'brew install git', branch_note: gitNote('no-git') } }, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(missing.join(' ')).toContain('Git is not installed: brew install git. No worker starts until it is.')
  expect(missing.some(l => l.includes('Set up git'))).toBe(false)
  expect(missing.some(l => l.includes('[ Check again (g) ]'))).toBe(true)
  // the panel clips lines: at 80 columns (inner 78) the notice wraps and no line is wider
  for (const git_state of ['no-repo', 'no-commits', 'no-git'] as const) {
    const rows = gitRowLines({ git_state, git_install: 'sudo apt install git' }, 78)
    expect(rows.length).toBeGreaterThan(1)
    for (const r of rows) expect(lineText(r).length).toBeLessThan(79)
  }
  // git set up: no row
  expect(panelLines(f, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('Set up git'))).toBe(false)
})

test('the band: the header, then the tasks that need you or run with the list\'s marks and short states; a "worker starting" row shows its time and no stray note', () => {
  const f = viewFile()
  const lines = bandLines(f, NOW, 120).map(lineText)
  // T-576: "𝄞 symcc · proj ⏵ auto merge · …": no "board", no version; the project shown as it isn't called symcc
  expect(lines[0]!.startsWith(`${ICON} symcc · proj ⏵ auto merge`)).toBe(true)
  // the header's own text, checked wide enough that the " (click: board)" hint is there, and without that hint
  const wideHead = lineText(bandDraw(f, NOW, 400).lines[0]!)
  expect(wideHead.endsWith(BAND_CLICK_HINT)).toBe(true)
  const headText = wideHead.slice(0, -BAND_CLICK_HINT.length)
  expect(headText).not.toContain('board')
  expect(headText).not.toContain('0.9.0')
  expect(lines[0]).not.toContain('0.9.0')
  expect(lines[0]).toContain('1 doing')
  // in the symcc project itself the name shows once, the state right after it
  const own = bandLines({ ...f, root: '/work/symcc' }, NOW, 120).map(lineText)[0]!
  expect(own.startsWith(`${ICON} symcc ⏵ auto merge`)).toBe(true)
  expect(own).toContain('1 doing')
  const t1 = f.view.tasks.find(t => t.id === 'T-1')!
  const row1 = lines.find(l => l.startsWith('T-1'))!
  expect(row1).toContain(`${STATUS_MARK.doing} ${statusCell(t1, NOW, NOW - 3 * 60_000)}`)
  expect(row1).toContain('3m')
  expect(row1).not.toContain('worker starting')
  expect(bandNote(t1, NOW, NOW - 3 * 60_000)).toBe('')
  // with no time to show, the note says what goes on
  expect(bandNote(t1, NOW)).toBe('worker starting')
  expect(lines.find(l => l.startsWith('T-3'))).toContain('— Which database?')
  expect(lines.find(l => l.startsWith('T-2'))).toContain(`${STATUS_MARK.review} review`)
  expect(lines.some(l => l.startsWith('T-4') || l.startsWith('T-5'))).toBe(false)
  // nothing on the board, or symcc off: no band
  expect(bandLines({ ...f, view: { ...f.view, tasks: [] } }, NOW, 120)).toEqual([])
  expect(bandLines({ ...f, view: { ...f.view, on_here: false } }, NOW, 120)).toEqual([])
  // T-860: no view file (no board in this folder): the one quiet hint
  expect(bandLines(null, NOW, 120).map(lineText)).toEqual(['no board here · /symcc-init'])
})

test('a doing row shows only the total work time of all tries in the band and the list, no Σ, never "in all"; a narrow row drops the time (T-557)', () => {
  const f0 = viewFile()
  const min = (m: number) => new Date(NOW - m * 60_000).toISOString()
  const runs = [{ started: min(300), ended: min(250) }, { started: min(200), ended: min(165) }, { started: min(15) }]
  const f = { ...f0, view: { ...f0.view, tasks: f0.view.tasks.map(t => (t.id === 'T-1' ? { ...t, attempts: 3, runs, note: '' } : t)), working: [] } }
  const row = (lines: string[]) => lines.find(l => /T-1 /.test(l))!
  const band = bandLines(f, NOW, 120).map(lineText)
  // the try "↺3" right after the time in the band (T-604); the board list shows no try mark (T-628)
  expect(row(band)).toContain('▶ 1h40m ↺3')
  const drawn = panelLines(f, { opened: '', cursor: 0 }, NOW, 100).lines
  const list = drawn.map(lineText)
  expect(row(list)).toContain('▶ 1h40m')
  expect(row(list)).not.toContain('↺3')
  for (const l of [row(band), row(list)]) expect(l).not.toContain('try 3')
  // the list's titles still start in one column
  const starts = f.view.tasks.filter(t => ['T-1', 'T-2', 'T-3', 'T-4'].includes(t.id)).map(t => list.find(l => l.includes(` ${t.id} `))!.indexOf(t.title))
  expect(starts.every(n => n > 0)).toBe(true)
  expect(new Set(starts).size).toBe(1)
  // T-893: one space between the widest state and the title, like the band (not two)
  const fronts = f.view.tasks.filter(t => ['T-1', 'T-2', 'T-3', 'T-4'].includes(t.id)).map(t => list.find(l => l.includes(` ${t.id} `))!.slice(0, starts[0]!))
  expect(Math.max(...fronts.map(s => s.trimEnd().length)) + 1).toBe(starts[0]!)
  expect(row(list)).toMatch(/T-1 +▶ 1h40m +\S/)
  // try 1: nothing
  const first = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-1' ? { ...t, attempts: 1 } : t)) } }
  expect(row(bandLines(first, NOW, 120).map(lineText))).not.toMatch(/↺|try/)
  expect(row(panelLines(first, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText))).not.toMatch(/↺|try/)
  for (const l of [...band, ...list]) {
    expect(l).not.toContain('in all')
    expect(l).not.toContain('Σ')
  }
  // narrow: the time is left out, then the try
  expect(row(bandLines(f, NOW, 35).map(lineText))).not.toContain('1h40m')
  expect(row(bandLines(f, NOW, 35).map(lineText))).toContain('▶ ↺3')
  expect(row(bandLines(f, NOW, 27).map(lineText))).not.toContain('↺3')
  expect(row(panelLines(f, { opened: '', cursor: 0 }, NOW, 30).lines.map(lineText))).not.toContain('1h40m')
  expect(row(panelLines(f, { opened: '', cursor: 0 }, NOW, 30).lines.map(lineText))).not.toContain('↺3')
})

test('T-581: a doing row in a check step or the merge line shows its icon and the time, no step word, in the band and the list; the worker row keeps ▶', () => {
  const f0 = viewFile()
  const fresh = new Date(NOW - 10_000).toISOString()
  const runs = [{ started: new Date(NOW - 20 * 60_000).toISOString(), ended: fresh }]
  const steps = [['T-1', 'testing', '⊛'], ['T-6', 'prep', '✎'], ['T-7', 'checker', '⌕'], ['T-8', 'merging', '⇢']] as const
  const base = f0.view.tasks.find(t => t.id === 'T-1')!
  const tasks = [
    ...f0.view.tasks.filter(t => t.id !== 'T-1'),
    ...steps.map(([id, step]) => ({ ...base, id, title: `In ${step}`, attempts: 1, note: '', runs, live: { checking: { step, at: fresh } }, })),
    { ...base, id: 'T-9', title: 'In line', attempts: 1, note: 'queue (2)', runs, live: { checking: { step: 'queue' as const, place: 2, at: fresh } }, },
    { ...base, id: 'T-10', title: 'Working', attempts: 1, note: '', runs: [{ started: new Date(NOW - 15 * 60_000).toISOString() }] },
  ]
  const f = { ...f0, view: { ...f0.view, tasks, working: [] } }
  const band = bandLines(f, NOW, 200, 20).map(lineText)
  const list = panelLines(f, { opened: '', cursor: 0 }, NOW, 120).lines.map(lineText)
  const row = (lines: string[], id: string) => lines.find(l => new RegExp(`(^|\\s)${id} `).test(l))!
  for (const lines of [band, list]) {
    for (const [id, , icon] of steps) {
      expect(row(lines, id)).toMatch(new RegExp(`${id} +${icon} 20m`))
      expect(row(lines, id)).not.toMatch(/▶|\b(prep|test|checker|merge) \d/)
    }
    expect(row(lines, 'T-9')).toMatch(/T-9 +⧗ 20m/)
    expect(row(lines, 'T-10')).toMatch(/T-10 +▶ 15m/)
  }
  // the titles still start in one column
  const titleAt = (lines: string[]) => new Set([...steps.map(([id, step]) => row(lines, id).indexOf(`In ${step}`)), row(lines, 'T-9').indexOf('In line'), row(lines, 'T-10').indexOf('Working')])
  expect(titleAt(band).size).toBe(1)
  expect(titleAt(list).size).toBe(1)
  // T-587: the task page's header state line names the state, the step and its time (T-751), and the Steps line marks the step now (checker off: none)
  const page = (id: string, v = f) => panelLines(v, { opened: id, cursor: 0 }, NOW, 140).lines.map(lineText)
  const state = (p: string[]) => p[p.findIndex(l => l.startsWith('‹ ')) + 2]
  const want: [string, string, string][] = [
    ['T-10', '▶ worker · 15m', '● worker → prep → queue → test → merge'],
    ['T-6', '✎ prep · 20m', 'worker ✓ → ● prep → queue → test → merge'],
    ['T-9', '⧗ queue (2) · 20m', 'worker ✓ → prep ✓ → ● queue → test → merge'],
    ['T-1', '⊛ test · 20m', 'worker ✓ → prep ✓ → queue ✓ → ● test → merge'],
    ['T-8', '⇢ merge · 20m', 'worker ✓ → prep ✓ → queue ✓ → test ✓ → ● merge'],
  ]
  for (const [id, badge, stage] of want) {
    const p = page(id)
    // no status badge under the title (T-693): the header's state line and the Steps row say it; no Status row
    expect(p).not.toContain(`[${badge}]`)
    expect(state(p)).toContain(`▶ doing · ${badge.slice(2).replace(/ · (\d)/, " · ⏱ $1")}`)
    expect(p.some(l => l.startsWith('Status:'))).toBe(false)
    expect(p.find(l => l.startsWith('Steps:'))?.replace(/^Steps:\s+/, '')).toBe(stage)
  }
  // a running checker shows its step even with the setting off; with it on every task's Stage has it
  expect(page('T-7')).not.toContain('[⌕ checker · 20m]')
  expect(page('T-7').find(l => l.startsWith('Steps:'))).toContain('worker ✓ → prep ✓ → ● checker → queue → test → merge')
  const on = { ...f, view: { ...f.view, checker: true } }
  expect(page('T-1', on).find(l => l.startsWith('Steps:'))).toContain('worker ✓ → prep ✓ → checker ✓ → queue ✓ → ● test → merge')
  // a done task: every step done
  const done = { ...f, view: { ...f.view, tasks: [...tasks, { ...base, id: 'T-11', title: 'Merged', status: 'done' as const, note: '', runs }] } }
  expect(page('T-11', done).find(l => l.startsWith('Steps:'))).toContain('worker ✓ → prep ✓ → queue ✓ → test ✓ → merge ✓')
})

test('the panel: the banner, then the list grouped by state (NEEDS YOU, what runs and waits, Done folded) with the cursor; a task\'s page with its rows, choices and keys', () => {
  const f = viewFile()
  const list = panelLines(f, { opened: '', cursor: 0 }, NOW, 100)
  const text = list.lines.map(lineText)
  expect(text[0]).toContain('symcc')
  expect(text.some(l => l.includes('tests: bun test'))).toBe(true)
  const needs = text.indexOf('NEEDS YOU')
  expect(needs).toBeGreaterThan(0)
  expect(list.ids.slice(0, 2).sort()).toEqual(['T-2', 'T-3'])
  expect(list.ids).toContain('T-1')
  expect(list.ids).toContain('T-4')
  expect(list.ids).not.toContain('T-5')
  expect(list.selected).toBe(list.ids[0])
  expect(text.find(l => l.includes(list.ids[0]!))).toMatch(/^› /)
  expect(text.find(l => l.includes('T-2'))).toContain(`${STATUS_MARK.review} review`)
  expect(text.find(l => l.includes('T-1 '))).toContain(`${STATUS_MARK.doing} 3m`)
  expect(text.some(l => l.includes('▸ Done') && l.includes('1'))).toBe(true)
  expect(lineText(list.lines.at(-1)!)).toContain('Enter open')
  // the cursor moves down a row, and stops at the end
  expect(panelLines(f, { opened: '', cursor: 1 }, NOW, 100).selected).toBe(list.ids[1])
  expect(panelLines(f, { opened: '', cursor: 99 }, NOW, 100).selected).toBe(list.ids.at(-1))
  // a task in review: its page and the approve and reject keys
  const page = panelLines(f, { opened: 'T-2', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(page.some(l => l.startsWith('T-2  a reviewed change'))).toBe(true)
  expect(page.some(l => l.startsWith('◆ ready for review   '))).toBe(true)
  expect(panelKeys(f, 'T-2').map(k => k.word)).toEqual(['approve', 'show changes', 'reject', 'needs review', 'back'])
  // T-575/T-584: the page's actions are core's taskActions (the terminal's and VS Code's buttons) with a key, but Copy
  const t2 = f.view.tasks.find(t => t.id === 'T-2')!
  expect(panelTaskActions(t2).map(a => a.id)).toEqual(taskActions(t2).filter(a => a.key && a.id !== 'copy').map(a => a.id))
  expect(panelTaskActions(t2).map(a => `${a.key} ${a.id}`)).toEqual(['a approve', 'd show-changes', 'x reject', 'n needs-review'])
  // an answered investigation in review: done, keep as a note and ask more, as on the other hosts
  const inv = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-2' ? { ...t, kind: 'investigation' } : t)) } } as ViewFile
  expect(panelKeys(inv, 'T-2').map(k => `${k.key} ${k.word}`)).toEqual(['a done', 'v keep as a note', 'x ask more', 'n needs review', 'b back'])
  // its header's state line says "answered: read it" in green, as on the other boards (T-701, T-751)
  const invStatus = panelLines(inv, { opened: 'T-2', cursor: 0 }, NOW, 100).lines.find(l => lineText(l).startsWith('◆ answered'))!
  expect(invStatus.find(s => s.text.includes('answered: read it'))?.color).toBe('success')
  expect(lineText(invStatus)).not.toContain('ready for review')
  // a waiting task with no question text says its note, else that it waits (core's taskAsks)
  const noQ = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-3' ? { ...t, ask: undefined, note: '' } : t)) } } as ViewFile
  expect(panelLines(noQ, { opened: 'T-3', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('asks: it waits for your answer'))).toBe(true)
  // a waiting task: its question and the numbered choices, the last one the owner's own answer
  const asks = panelLines(f, { opened: 'T-3', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(asks.some(l => l.includes('asks: Which database?'))).toBe(true)
  expect(asks).toContain('  2. postgres')
  expect(answerOptions(f, 'T-3')).toEqual(['mysql', 'postgres', OWN_ANSWER])
  expect(panelKeys(f, 'T-3').map(k => k.word)).toEqual(['answer', 'drop', 'needs review', 'back'])
  // a running worker whose time is up: its page asks for more time, with Claude's +30 min / +60 min / Stop it
  const over = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-1' ? { ...t, live: { time_ask: AT }, note: 'time is up' } : t)) } }
  expect(panelKeys(over, 'T-1').map(k => k.word)).toEqual(['answer', 'pause', 'drop', 'needs review', 'back'])
  expect(answerOptions(over, 'T-1')).toEqual(['+30 min', '+60 min', 'Stop it', OWN_ANSWER])
  expect(panelLines(over, { opened: 'T-1', cursor: 0 }, NOW, 100).lines.map(lineText)).toContain('  1. +30 min')
  // a waiting task whose finished work only waits for the owner's files: nothing to answer
  const files = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-3' ? { ...t, live: { merge_wait: { dirty: ['src/a.ts'] } }, } : t)) } }
  expect(panelKeys(files, 'T-3').map(k => k.word)).toEqual(['merge now', 'drop', 'needs review', 'back'])
  expect(answerOptions(files, 'T-3')).toEqual([])
  expect(panelLines(files, { opened: 'T-3', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('asks:'))).toBe(false)
  // the actions are symcc's slash commands
  expect(actionCommand({ kind: 'approve', id: 'T-2' })).toEqual({ name: 'symcc-approve', text: 'T-2' })
  expect(actionCommand({ kind: 'reject', id: 'T-2', reason: ' too big ' })).toEqual({ name: 'symcc-reject', text: 'T-2 too big' })
  expect(actionCommand({ kind: 'diff', id: 'T-2' })).toEqual({ name: 'symcc-diff', text: 'T-2' })
  expect(actionCommand({ kind: 'answer', id: 'Q-1', answer: 'yes' })).toEqual({ name: 'symcc-answer', text: 'Q-1 yes' })
  // T-858: no view file means no board here: says what every other place says
  expect(panelLines(null, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).join('\n')).toContain('no symcc board in this folder · /symcc-init to create one here')
})

/** A fake of OpenTUI's Solid renderer: elements are plain objects, insert keeps what it is given (functions are drawn when read). */
type El = { tag: string; props: Record<string, unknown>; kids: unknown[] }
function fakeRuntime(): TuiRuntime {
  return {
    createSignal: <T,>(value: T) => {
      let v = value
      return [() => v, (x: T) => void (v = x)] as [() => T, (value: T) => void]
    },
    createElement: tag => ({ tag, props: {}, kids: [] }) as El,
    setProp: (n, name, value) => void ((n as El).props[name] = value),
    insert: (p, value) => void (p as El).kids.push(value),
  }
}

/** The text lines a drawn node shows: one per row box. */
function shown(node: unknown): string[] {
  const flat = (x: unknown): unknown[] => (typeof x === 'function' ? flat(x()) : Array.isArray(x) ? x.flatMap(flat) : x == null ? [] : [x])
  const text = (x: unknown): string => flat(x).map(k => (typeof k === 'string' ? k : text((k as El).kids))).join('')
  const rows = (x: unknown): string[] => flat(x).flatMap(k => (typeof k === 'string' ? [] : (k as El).props.flexDirection === 'row' ? [text((k as El).kids)] : rows((k as El).kids)))
  return rows(node)
}

/** T-773: the board opens on Live. Most tests here are about the Tasks tab, so this starts the TUI and goes to Tasks (the
 *  `t` key) at its first refresh; `startTuiLive` is the plain one. */
const startTui: typeof startTuiLive = (ctx, d) => {
  const board = startTuiLive(ctx, d)
  const refresh = board.refresh
  let first = true
  board.refresh = async () => {
    await refresh()
    if (first) (first = false), await board.press('t', 'ses_1')
  }
  return board
}

test('T-773: a freshly opened OpenCode board is on the Live tab; the tab row is Live, Tasks, Scouts, Settings; l, t, s and c go to their tabs', async () => {
  const f = viewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText({ ...f, view: { ...f.view, open_on_start: false } })]])
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: () => () => undefined,
    },
  }
  const board = startTuiLive(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  expect(board.state().tab).toBe('live')
  expect(PANEL_TABS.map(t => [t.key, t.tab])).toEqual([['l', 'live'], ['t', 'tasks'], ['s', 'scouts'], ['c', 'settings']])
  for (const [key, tab] of [['t', 'tasks'], ['s', 'scouts'], ['c', 'settings'], ['l', 'live']] as const) {
    await board.press(key, 'ses_1')
    expect(board.state().tab).toBe(tab)
  }
  board.stop()
})

test('startTui on a fake OpenCode TUI: reads the view file in its folder, draws the panel and the band, opens from /symcc-board, and sends approve, reject and answer as slash commands', async () => {
  const f = viewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText({ ...f, view: { ...f.view, open_on_start: false } })]])  // T-756: the board doesn't open by itself here
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const layers: TuiKeyLayer[] = []
  const toasts: string[] = []
  let current: { name: string; sessionID: string } | undefined
  const answers = { prompt: 'too big', select: 'postgres' as string | undefined }
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: { primary: 'blue' },
    renderer: { width: 120, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: factory => void layers.push(factory()) },
    ui: {
      toast: { show: o => void toasts.push(o.message) },
      dialog: { prompt: async () => answers.prompt, select: async <V,>() => answers.select as V | undefined },
      panel: { open: name => ((current = { name, sessionID: 'ses_1' }), true), close: () => (current = undefined), current: () => current },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  let stopped = false
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => void (stopped = true), now: () => NOW })
  await board.refresh()
  // "/symcc-board" and the palette's "symcc board" open the board panel. The layer is "global": OpenCode 2.3 lists a
  // layer of its default "base" mode in neither the palette nor the slash list (T-505). Plain "/symcc" is left to
  // the server's command (the text board), so the slash list has no two "/symcc" rows.
  const openLayer = layers.find(l => l.commands?.some(c => c.id === 'symcc.board.open'))!
  expect(openLayer.mode).toBe('global')
  const open = openLayer.commands!.find(c => c.id === 'symcc.board.open')!
  expect(open.slash?.name).toBe('symcc-board')
  expect(open.palette).toBe(true)
  expect(open.title).toBe('symcc board')
  await open.run()
  expect(current?.name).toBe(BOARD_PANEL)
  // run again while it is open: it closes
  await open.run()
  expect(current).toBe(undefined)
  await open.run()
  expect(current?.name).toBe(BOARD_PANEL)
  expect(board.state().tab).toBe('live')  // T-773: a reopened board is on Live, not the last tab
  await board.press('t', 'ses_1')
  expect(toasts).toEqual([])
  // no layer of the panel's keys before the panel is drawn: they are made inside it
  expect(layers.length).toBe(1)
  let focused = true
  const input = { name: BOARD_PANEL, sessionID: 'ses_1', width: 100, get focused() { return focused }, close: () => undefined } as TuiPanelInput
  const panel = slots.find(s => s.append === 'session.panel')!.render(input as never)
  expect(shown(panel).some(l => l.includes('NEEDS YOU'))).toBe(true)
  expect(shown(panel).some(l => l.includes('T-2') && l.includes(`${STATUS_MARK.review} review`))).toBe(true)
  // another plugin's panel: nothing drawn
  expect(shown(slots.find(s => s.append === 'session.panel')!.render({ ...input, name: 'other' } as never))).toEqual([])
  const band = slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 'ses_1' } as never)
  expect(shown(band)[0]).toContain('symcc')
  expect(shown(band).find(l => l.startsWith('T-1'))).not.toContain('worker starting')
  // the panel's keys: made inside the panel's drawing, and on only while it shows the board and has the keyboard
  const keys = layers.find(l => l.commands?.some(c => c.bind === 'escape'))!
  expect(keys.mode).toBe(undefined)
  const on = () => typeof keys.enabled === 'function' && keys.enabled()
  expect(on()).toBe(true)
  focused = false
  expect(on()).toBe(false)
  focused = true
  // Esc closes the panel
  await keys.commands!.find(c => c.bind === 'escape')!.run()
  expect(current).toBe(undefined)
  await open.run()
  const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 98).ids
  const goTo = async (id: string) => {
    await board.press('back', 'ses_1')
    for (let i = 0; i < 9; i++) await board.press('up', 'ses_1')
    for (let i = 0; i < ids.indexOf(id); i++) await board.press('down', 'ses_1')
    await board.press('open', 'ses_1')
    expect(board.state().opened).toBe(id)
  }
  await goTo('T-2')
  expect(shown(panel).some(l => l.startsWith('◆ ready for review'))).toBe(true)
  await board.press('x', 'ses_1')
  await board.press('a', 'ses_1')
  // T-615: while that approve runs, a and x do nothing (no second approve, no reject box), as the terminal's; d still shows the changes
  await board.press('a', 'ses_1')
  await board.press('x', 'ses_1')
  await board.press('d', 'ses_1')
  await goTo('T-3')
  await board.press('a', 'ses_1')
  answers.select = OWN_ANSWER
  answers.prompt = 'sqlite, it is small'
  await board.press('a', 'ses_1')
  // a key a page doesn't offer does nothing (a waiting task has no show changes)
  await board.press('d', 'ses_1')
  expect(sent).toEqual([
    { sessionID: 'ses_1', name: 'symcc-reject', text: 'T-2 too big' },
    { sessionID: 'ses_1', name: 'symcc-approve', text: 'T-2' },
    { sessionID: 'ses_1', name: 'symcc-diff', text: 'T-2' },
    { sessionID: 'ses_1', name: 'symcc-answer', text: 'T-3 postgres' },
    { sessionID: 'ses_1', name: 'symcc-answer', text: 'T-3 sqlite, it is small' },
  ])
  board.stop()
  expect(stopped).toBe(true)
})

test('T-887: opening the board while git is not ok posts nothing into the session (no /symcc-settings git check in the chat)', async () => {
  for (const git_state of ['no-git', 'no-repo', 'no-commits'] as const) {
    const f = viewFile()
    const files = new Map([['/work/proj/.symcc/view.json', viewFileText({ ...f, view: { ...f.view, open_on_start: false, git_state, branch_note: gitNote(git_state) } })]])
    const sent: { sessionID: string; name: string; text: string }[] = []
    const slots: { append: string; render: (input: never) => unknown }[] = []
    const layers: TuiKeyLayer[] = []
    let current: { name: string; sessionID: string } | undefined
    const ctx: TuiContext = {
      location: { directory: '/work/proj' },
      theme: { primary: 'blue' },
      renderer: { width: 120, height: 200 },
      client: { session: { command: async input => void sent.push(unmarked(input)) } },
      keymap: { layer: factory => void layers.push(factory()) },
      ui: {
        toast: { show: () => undefined },
        dialog: { prompt: async () => undefined, select: async <V,>() => undefined as V | undefined },
        panel: { open: name => ((current = { name, sessionID: 'ses_1' }), true), close: () => (current = undefined), current: () => current },
        slot: claim => (slots.push(claim as never), () => undefined),
      },
    }
    const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
    await board.refresh()
    // the band seen in a session: that is the session a check would have been posted into
    shown(slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 'ses_1' } as never))
    const open = layers.find(l => l.commands?.some(c => c.id === 'symcc.board.open'))!.commands!.find(c => c.id === 'symcc.board.open')!
    await open.run()
    expect(current?.name).toBe(BOARD_PANEL)
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect([git_state, sent]).toEqual([git_state, []])
    board.stop()
  }
})

test('T-584: a task page offers every one of core\'s taskActions with a key (but Copy) for a failed, doing, backlog and answered-investigation task, and each key sends its slash command', async () => {
  let b: Board = emptyBoard()
  for (const title of ['running', 'what is slow', 'broke', 'later']) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, AT)[0]
  b = patchTask(b, 'T-1', { status: 'doing' }, AT)
  b = patchTask(b, 'T-2', { status: 'review', kind: 'investigation' }, AT)
  b = patchTask(b, 'T-3', { status: 'failed', attempts: 1, needs_review: true }, AT)
  b = patchTask(b, 'T-4', { status: 'backlog' }, AT)
  const view: PaneView = { tasks: b.tasks, working: [{ task: 'T-1', since: NOW - 60_000 }], scouts: [], mode: 'auto', test_commands: [], max_parallel: 2, max_minutes: 30, auto_retries: 1, driving: true, home_branch: 'main', branch_note: '' }
  const f: ViewFile = { root: '/work/proj', home: '/work', name: 'symcc', version: '0.9.0', written_at: NOW, view }
  const task = (id: string) => f.view.tasks.find(t => t.id === id)!
  // the same actions as taskActions, in its order, with its keys and words; only Copy (no clipboard here) is left out
  for (const id of ['T-1', 'T-2', 'T-3', 'T-4']) {
    const t = task(id)
    expect(panelTaskActions(t)).toEqual(taskActions(t).filter(a => a.key && a.id !== 'copy'))
    for (const a of panelTaskActions(t)) expect(!!TASK_ACTION_COMMANDS[a.id]).toBe(true)
  }
  const keysOf = (id: string) => panelTaskActions(task(id)).map(a => `${a.key} ${a.id}`)
  expect(keysOf('T-1')).toEqual(['p pause', 'x drop', 'n needs-review'])
  expect(keysOf('T-2')).toEqual(['a done', 'v keep-note', 'x ask-more', 'n needs-review'])
  expect(keysOf('T-3')).toEqual(['r retry', 'e run-now', 'z stash', 'l role', 'h already-merged', 'x drop', 'n needs-review'])
  expect(keysOf('T-4')).toEqual(['o to-todo', 'e run-now', 'l role', 'x drop', 'n needs-review'])
  // the footer's hints are buttons for their own keys (u, z, l, h, n too)
  const footer = panelLines(f, { opened: 'T-3', cursor: 0 }, NOW, 140).lines.at(-1)!
  expect(footer.filter(x => x.hit).map(x => x.hit)).toEqual([{ key: 'r' }, { key: 'e' }, { key: 'z' }, { key: 'l' }, { key: 'h' }, { key: 'x' }, { key: 'n' }, { key: 'back' }])

  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const answers = { prompt: 'not needed' as string | undefined, select: 'tester' as string | undefined }
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 140, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => answers.prompt, select: async <V,>() => answers.select as V | undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: () => () => undefined,
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 138).ids
  const goTo = async (id: string) => {
    await board.press('back', 's')
    for (let i = 0; i < 9; i++) await board.press('up', 's')
    for (let i = 0; i < ids.indexOf(id); i++) await board.press('down', 's')
    await board.press('open', 's')
    expect(board.state().opened).toBe(id)
  }
  const expected: Record<string, (id: string) => { name: string; text: string }> = {
    pause: id => ({ name: 'symcc-task', text: `${id} pause` }),
    retry: id => ({ name: 'symcc-task', text: `${id} retry` }),
    'run-now': id => ({ name: 'symcc-task', text: `${id} run` }),
    stash: id => ({ name: 'symcc-task', text: `${id} stash` }),
    'to-todo': id => ({ name: 'symcc-task', text: `${id} todo` }),
    role: id => ({ name: 'symcc-task', text: `${id} role tester` }),
    'already-merged': id => ({ name: 'symcc-task', text: `${id} merged` }),
    drop: id => ({ name: 'symcc-task', text: `${id} drop not needed` }),
    'needs-review': id => ({ name: 'symcc-task', text: `${id} review ${task(id).needs_review ? 'off' : 'on'}` }),
    done: id => ({ name: 'symcc-approve', text: id }),
    'keep-note': id => ({ name: 'symcc-task', text: `${id} note` }),
    'ask-more': id => ({ name: 'symcc-reject', text: `${id} not needed` }),
  }
  for (const id of ['T-1', 'T-2', 'T-3', 'T-4']) {
    // Done (an approve) is pressed at the end: while it runs, the page takes none of its other keys
    for (const a of panelTaskActions(task(id)).filter(x => x.id !== 'done')) {
      await goTo(id)
      sent.length = 0
      await board.press(a.key as never, 's')
      expect([a.id, sent]).toEqual([a.id, [{ sessionID: 's', ...expected[a.id]!(id) }]])
    }
  }
  expect(task('T-3').needs_review).toBe(true)
  // drop with an empty reason drops it without one; Esc (no answer) sends nothing
  await goTo('T-1')
  sent.length = 0
  answers.prompt = ''
  await board.press('x', 's')
  answers.prompt = undefined
  await board.press('x', 's')
  answers.select = undefined
  await goTo('T-4')
  await board.press('l', 's')
  expect(sent).toEqual([{ sessionID: 's', name: 'symcc-task', text: 'T-1 drop' }])
  // k (and j) are bound to moving only, on every page (T-592): no letter key the panel takes is j or k
  const bound = (ch: string) => (Object.keys(KEY_BINDS) as PanelKey[]).filter(key => KEY_BINDS[key].split(',').includes(ch))
  expect(bound('k')).toEqual(['up'])
  expect(bound('j')).toEqual(['down'])
  expect(bound('z')).toEqual(['z'])
  expect(bound('v')).toEqual(['v'])
  // on the pages with Stash to backlog (T-3) and Keep as a note (T-2), k moves up and sends nothing;
  // z stashes and v keeps the note
  for (const [id, ch, text] of [['T-3', 'z', 'T-3 stash'], ['T-2', 'v', 'T-2 note']] as const) {
    await goTo(id)
    sent.length = 0
    await board.press(bound('k')[0]!, 's')
    expect(board.state().opened).toBe(id)
    expect(sent).toEqual([])
    await board.press(bound(ch)[0]!, 's')
    expect(sent).toEqual([{ sessionID: 's', name: 'symcc-task', text }])
  }
  // on the list k moves the cursor up, as ↑ does
  await board.press('back', 's')
  await board.press('down', 's')
  const at = board.state().cursor
  await board.press(bound('k')[0]!, 's')
  expect(board.state().cursor).toBe(at - 1)
  expect(actionCommand({ kind: 'task', id: 'T-5', verb: 'review', arg: 'off' })).toEqual({ name: 'symcc-task', text: 'T-5 review off' })
  // Done on the answered investigation sends its approve; while that runs, v (keep as a note) and x (ask more) do nothing
  expect(panelTaskActions(task('T-2')).some(a => a.id === 'done' && a.key === 'a')).toBe(true)
  await goTo('T-2')
  sent.length = 0
  await board.press('a', 's')
  await board.press('v', 's')
  await board.press('x', 's')
  expect(sent).toEqual([{ sessionID: 's', ...expected.done!('T-2') }])
  board.stop()
})

test('T-954: Run now (e) on a task that waits on an unfinished task asks "Start anyway?": Start anyway sends run anyway, Cancel or Esc sends nothing', async () => {
  let b: Board = emptyBoard()
  for (const title of ['first', 'second']) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, AT)[0]
  b = patchTask(b, 'T-1', { status: 'doing' }, AT)
  b = patchTask(b, 'T-2', { after: ['T-1'] }, AT)
  const view: PaneView = { tasks: b.tasks, working: [], scouts: [], mode: 'auto', test_commands: [], max_parallel: 1, max_minutes: 30, auto_retries: 1, driving: true, home_branch: 'main', branch_note: '' }
  const f: ViewFile = { root: '/work/proj', home: '/work', name: 'symcc', version: '0.9.0', written_at: NOW, view }
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const asked: { title: string; options: string[] }[] = []
  let answer: string | undefined
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 140, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async <V,>(o: { readonly title: string; readonly options: readonly { readonly title: string; readonly value: V }[] }) => (asked.push({ title: o.title, options: o.options.map(x => x.title) }), answer as V | undefined) },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: () => () => undefined,
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 138).ids
  await board.press('t', 's')
  for (let i = 0; i < ids.indexOf('T-2'); i++) await board.press('down', 's')
  await board.press('open', 's')
  expect(board.state().opened).toBe('T-2')
  for (const [pick, want] of [[undefined, []], ['no', []], ['yes', [{ sessionID: 's', name: 'symcc-task', text: 'T-2 run anyway' }]]] as const) {
    answer = pick
    sent.length = 0
    await board.press('e', 's')
    expect([pick, sent]).toEqual([pick, want])
  }
  expect(asked.at(-1)).toEqual({ title: 'T-2 waits on T-1 (running). Start anyway?', options: ['Cancel', 'Start anyway'] })
  board.stop()
})

test('T-914: the task id in the page header title is always the board orange (claude), whatever the status', () => {
  let b: Board = emptyBoard()
  const statuses = ['todo', 'doing', 'failed', 'done', 'dropped'] as const
  for (const title of statuses) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, AT)[0]
  statuses.forEach((status, i) => (b = patchTask(b, `T-${i + 1}`, { status, attempts: 1 }, AT)))
  const view: PaneView = { tasks: b.tasks, working: [], scouts: [], mode: 'auto', test_commands: [], max_parallel: 2, max_minutes: 30, auto_retries: 1, driving: true, home_branch: 'main', branch_note: '' }
  const f: ViewFile = { root: '/work/proj', home: '/work', name: 'symcc', version: '0.9.0', written_at: NOW, view }
  statuses.forEach((status, i) => {
    const id = `T-${i + 1}`
    const title = panelLines(f, { opened: id, cursor: 0 }, NOW, 140).lines[1]!
    expect([status, title[0]!.text, title[0]!.color]).toEqual([status, id, 'claude'])
  })
})

test('T-680, T-751: a task page header has the buttons in groups, words only (the next step, task actions, Drop, needs review), the scout page its own, a question [ Back ]; a click on a button sends what its key sends', async () => {
  let b: Board = emptyBoard()
  for (const title of ['running', 'a change', 'broke']) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, AT)[0]
  b = patchTask(b, 'T-1', { status: 'doing' }, AT)
  b = patchTask(b, 'T-2', { status: 'review' }, AT)
  b = patchTask(b, 'T-3', { status: 'failed', attempts: 1 }, AT)
  const scouts = [
    { name: 'deps', every_minutes: 30, last_run: null, running: true, prompt: 'Check the dependencies.' },
    { name: 'docs', every_minutes: 60, last_run: null, running: false, paused: true, prompt: 'Look for stale docs.' },
  ]
  const view: PaneView = { tasks: b.tasks, working: [{ task: 'T-1', since: NOW - 60_000 }], scouts, mode: 'auto', test_commands: [], max_parallel: 2, max_minutes: 30, auto_retries: 1, driving: true, home_branch: 'main', branch_note: '', questions: [{ id: 'Q-1', by: 'lead' as const, text: 'How often?', options: ['daily'], asked_at: AT }] }
  const f: ViewFile = { root: '/work/proj', home: '/work', name: 'symcc', version: '0.9.0', written_at: NOW, view }
  const task = (id: string) => f.view.tasks.find(t => t.id === id)!
  // the header's button line: the line right above its heavy rule
  const buttonRow = (id: string, tab: 'tasks' | 'scouts' = 'tasks', w = 140) => {
    const ls = panelLines(f, { tab, opened: id, cursor: 0 }, NOW, w).lines.map(lineText)
    return ls[ls.findIndex(l => /^─+$/.test(l)) - 1]
  }
  // the running task: the Claude Code board's buttons for it (core's taskActions in their groups, with their words),
  // but Watch worker and Copy, which OpenCode can't do
  expect(buttonRow('T-1')).toBe('[Pause]   [Drop]   [☐ Needs review]')
  for (const id of ['T-1', 'T-2', 'T-3']) {
    const claude = inGroups(taskActions(task(id), { worker: id === 'T-1' }).filter(a => a.id !== 'watch' && a.id !== 'copy'))
    expect(buttonRow(id)).toBe(claude.map(g => g.map(pillText).join(' ')).join('   '))
  }
  expect(buttonRow('T-2')).toBe('[Approve]   [Show changes]   [Reject] [Drop]   [☐ Needs review]')
  expect(buttonRow('T-3')).toBe('[Retry]   [Run now] [Stash to backlog] [Role] [Already merged]   [Drop]   [☐ Needs review]')
  // T-775: every button drawn the same: "[Label]" in the text color, not bold (no filled pill, no red, no dim word)
  for (const id of ['T-1', 'T-2', 'T-3']) {
    const ls = panelLines(f, { opened: id, cursor: 0 }, NOW, 140).lines
    const row = ls[ls.findIndex(l => /^─+$/.test(lineText(l))) - 1]!.filter(x => x.hit)
    expect(row.map(x => [x.text.startsWith('[') && x.text.endsWith(']'), x.color, !!x.bold])).toEqual(row.map(() => [true, 'text', false]))
  }
  // no key inside a button (the keys are in the footer)
  for (const id of ['T-1', 'T-2', 'T-3']) expect(buttonRow(id)).not.toMatch(/\([a-z]\)/)
  // a narrow panel puts the buttons on more rows, between the groups when they fit, never cutting a button
  const narrow = panelLines(f, { opened: 'T-3', cursor: 0 }, NOW, 40).lines.map(lineText)
  const rule = narrow.findIndex(l => /^─+$/.test(l))
  expect(narrow.slice(rule - 4, rule)).toEqual(['[Retry]', '[Run now] [Stash to backlog] [Role]', '[Already merged]   [Drop]', '[☐ Needs review]'])
  // the scout pages (as Claude Code's: Run now when it isn't running, Edit, Pause or Resume; paused said as a fact) and a question's
  expect(buttonRow('deps', 'scouts')).toBe('[Edit]   [Pause]')
  expect(buttonRow('docs', 'scouts')).toBe('[Run now]   [Edit]   [Resume] ⏸ paused')
  expect(panelLines(f, { opened: 'Q-1', cursor: 0 }, NOW, 140).lines.map(lineText).find(l => l.startsWith('[ Back ]'))).toBe('[ Back ]')
  // the header's 4 lines in order, then the heavy rule: where you are, the title, the state, the buttons
  for (const id of ['T-1', 'T-2', 'T-3']) {
    const lines = panelLines(f, { opened: id, cursor: 0 }, NOW, 140).lines.map(lineText)
    expect(lines[0]).toMatch(new RegExp(`^‹ \\[Tasks\\] +${id} · ‹ \\d of 3 ›$`))
    expect(lines[1]!.startsWith(`${id}  `)).toBe(true)
    expect(lines[2]).toContain({ 'T-1': '▶ doing', 'T-2': '◆ ready for review', 'T-3': '✗ failed' }[id]!)
    expect(lines[3]).toBe(buttonRow(id))
    expect(lines[4]).toMatch(/^─+$/)
    expect(lines.some(l => l.trim().startsWith('Status:'))).toBe(false)
  }

  // in the TUI: a click on each button sends the same command as its key (Drop in review, which has no key, drops it)
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 142, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => 'why', select: async <V,>() => 'general' as V },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 's', width: 142, focused: true, close: () => undefined } as never) as El
  // the header's button row: the drawn row right above the heavy rule; its buttons are the pieces a click presses
  const headRows = () => rowEls(panel)
  const buttons = () => {
    const rows = headRows()
    return rows[rows.findIndex(r => /^─+$/.test(r.text)) - 1]!.segs.filter(s => typeof s.props.onMouseUp === 'function')
  }
  const settle = () => new Promise<void>(res => setTimeout(res, 0))
  const open = async (id: string, tab: 'tasks' | 'scouts' = 'tasks') => {
    await board.press('t', 's')
    await board.press('back', 's')
    if (tab === 'scouts') await board.press('s', 's')
    expect([board.state().tab, board.state().opened]).toEqual([tab, ''])
    const ids = panelLines(f, { tab, opened: '', cursor: 0 }, NOW, 140).ids
    for (let i = 0; i < 9; i++) await board.press('up', 's')
    for (let i = 0; i < ids.indexOf(id); i++) await board.press('down', 's')
    await board.press('open', 's')
    expect(board.state().opened).toBe(id)
  }
  const click = async (seg: El | undefined, label: string) => {
    expect([label, typeof seg?.props.onMouseUp]).toEqual([label, 'function'])
    ;(seg!.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
    await settle()
  }
  const clickButton = (label: string) => click(buttons().find(s => s.kids.join('') === label), label)
  // Back is the header's "[Tasks]" (or "[Scouts]") after its arrow; a question keeps its [ Back ] button
  const clickBack = () => click(headRows().flatMap(r => r.segs).find(s => ['[Tasks]', '[Scouts]', '[ Back ]'].includes(s.kids.join(''))), 'back')
  const pages: [string, 'tasks' | 'scouts'][] = [['T-1', 'tasks'], ['T-2', 'tasks'], ['T-3', 'tasks'], ['deps', 'scouts'], ['docs', 'scouts']]
  for (const [id, tab] of pages) {
    await open(id, tab)
    const labels = buttons().map(s => s.kids.join(''))
    // Approve last (while it runs, the page offers no approve or reject)
    for (const label of labels.filter(l => l !== '[Approve]')) {
      // what the button's key sends, then what a click on the button sends
      await open(id, tab)
      sent.length = 0
      const hit = panelLines(f, { tab, opened: id, cursor: 0 }, NOW, 140).lines.flat().find(s => s.text === label)!.hit!
      if ('key' in hit) await board.press(hit.key, 's')
      const byKey = [...sent]
      await open(id, tab)
      sent.length = 0
      await clickButton(label)
      expect([id, label, sent]).toEqual([id, label, 'key' in hit ? byKey : [{ sessionID: 's', name: 'symcc-task', text: `${id} drop why` }]])
      expect(sent.length).toBe(1)
    }
    // Back goes back to the list
    await open(id, tab)
    await clickBack()
    expect(board.state().opened).toBe('')
  }
  // the question's Back too
  await open('Q-1')
  await clickBack()
  expect(board.state().opened).toBe('')
  // Approve sends the approve, as a; then its page has no Approve or Reject button
  await open('T-2')
  sent.length = 0
  await clickButton('[Approve]')
  expect(sent).toEqual([{ sessionID: 's', name: 'symcc-approve', text: 'T-2' }])
  expect(buttons().map(s => s.kids.join(''))).toEqual(['[Show changes]', '[Drop]', '[☐ Needs review]'])
  board.stop()
})

test('T-751: [ and ] (and a click on ‹ or › in the header) go to the previous and the next task or scout of the list, going round; a task opened from Live says "‹ [Live]"', async () => {
  // [ and ] are bound to prev and next; k and j still move
  expect([KEY_BINDS.prev, KEY_BINDS.next, KEY_BINDS.up, KEY_BINDS.down]).toEqual(['[', ']', 'up,k', 'down,j'])
  const f = viewFile()
  const list = taskListIds(f.view.tasks, NOW)
  // the header's first line: Back, then the place with its arrows, each a click
  const first = panelLines(f, { opened: list[0]!, cursor: 0 }, NOW, 100).lines[0]!
  expect(lineText(first)).toMatch(new RegExp(`^‹ \\[Tasks\\] +${list[0]} · ‹ 1 of ${list.length} ›$`))
  expect(first.filter(x => x.hit).map(x => [x.text, x.hit])).toEqual([['[Tasks]', { key: 'back' }], ['‹', { key: 'prev' }], ['›', { key: 'next' }]])
  // the footer says so
  expect(panelLines(f, { opened: list[0]!, cursor: 0 }, NOW, 100).keys.map(k => `${k.key} ${k.word}`)).toContain('[ ] prev/next')
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText({ ...f, view: { ...f.view, scouts: [{ name: 'a', every_minutes: 60 }, { name: 'b', every_minutes: 120 }] as never } })]])
  const fc = fakeCtx({})
  const board = startTui(fc.ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  await board.press('open', 's')
  expect(board.state().opened).toBe(list[0])
  await board.press('next', 's')
  expect(board.state().opened).toBe(list[1])
  await board.press('prev', 's')
  await board.press('prev', 's')
  // before the first: the last
  expect(board.state().opened).toBe(list.at(-1))
  await board.press('next', 's')
  expect(board.state().opened).toBe(list[0])
  // b still goes back to the list
  await board.press('back', 's')
  expect(board.state().opened).toBe('')
  // a scout's page: the Scouts list's order
  const names = scoutListNames([{ name: 'a', every_minutes: 60 }, { name: 'b', every_minutes: 120 }] as never)
  await board.press('s', 's')
  await board.press('open', 's')
  expect([board.state().tab, board.state().opened]).toEqual(['scouts', names[0]])
  await board.press('next', 's')
  expect(board.state().opened).toBe(names[1])
  await board.press('next', 's')
  expect(board.state().opened).toBe(names[0])
  // from the Live tab: "‹ [Live]"; T-1 is its only running task, so no place to go to
  await board.press('l', 's')
  // T-786: the two ▍Needs you rows (T-3 waiting, T-2 in review) come first
  await board.press('down', 's')
  await board.press('down', 's')
  await board.press('open', 's')
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-1'])
  const live = panelLines(f, { opened: 'T-1', cursor: 0, from: 'live' }, NOW, 100)
  // T-846: T-2 (in review) keeps a lane at "you", so Live has two lanes
  expect(lineText(live.lines[0]!)).toMatch(/^‹ \[Live\] +T-1 · ‹ 1 of 2 ›$/)
  await board.press('next', 's')
  expect(board.state().opened).toBe('T-2')
  await board.press('back', 's')
  expect(board.state().tab).toBe('live')
  board.stop()
})

test('startTui: when the open task leaves the view (or the view file goes away), the panel goes back to the list and its keys work again', async () => {
  const f = viewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: () => () => undefined,
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  await board.press('open', 's')
  const first = board.state().opened
  expect(first).not.toBe('')
  // the open task is archived: the view file no longer has it
  files.set('/work/proj/.symcc/view.json', viewFileText({ ...f, view: { ...f.view, tasks: f.view.tasks.filter(t => t.id !== first) } }))
  await board.refresh()
  expect(board.state().opened).toBe('')
  await board.press('down', 's')
  expect(board.state().cursor).toBe(1)
  await board.press('open', 's')
  expect(board.state().opened).not.toBe('')
  // the view file goes away: back to the list too
  files.clear()
  await board.refresh()
  expect(board.state().opened).toBe('')
  board.stop()
})

test('loadTuiRuntime: takes createSignal from solid-js and createElement, setProp, insert from @opentui/solid', async () => {
  const fake = fakeRuntime()
  const r = await loadTuiRuntime({
    solid: async () => ({ createSignal: fake.createSignal, createMemo: () => 0 }),
    opentui: async () => ({ createElement: fake.createElement, setProp: fake.setProp, insert: fake.insert }),
  })
  expect(r.createSignal).toBe(fake.createSignal)
  expect(r.createElement).toBe(fake.createElement)
  expect(r.setProp).toBe(fake.setProp)
  expect(r.insert).toBe(fake.insert)
})

test("loadTuiRuntime: a package that can't load, or lacks a function, fails with an error naming it (not a bare import error)", async () => {
  const fake = fakeRuntime()
  const opentui = async () => ({ createElement: fake.createElement, setProp: fake.setProp, insert: fake.insert })
  const notFound = async () => {
    throw new Error("Cannot find package 'solid-js' imported from /x/opencode/tui.ts")
  }
  const err = (p: Promise<unknown>) => p.then(() => '', (e: unknown) => (e instanceof Error ? e.message : String(e)))
  const a = await err(loadTuiRuntime({ solid: notFound, opentui }))
  expect(a).toContain("can't load 'solid-js'")
  expect(a).toContain('OpenCode 2.3 or newer')
  expect(a).toContain('Cannot find package')
  const b = await err(loadTuiRuntime({ solid: async () => ({ createSignal: fake.createSignal }), opentui: async () => ({ createElement: fake.createElement, insert: fake.insert }) }))
  expect(b).toContain("'@opentui/solid'")
  expect(b).toContain('setProp')
  const c = await err(loadTuiRuntime({ solid: async () => null, opentui }))
  expect(c).toContain("'solid-js'")
  expect(c).toContain('createSignal')
})

test('opencode/tui.ts imports solid-js and @opentui/solid by their written-out names (OpenCode swaps only those for its own copies), never through a variable', async () => {
  const src = await readFile(`${PLUGIN_ROOT}/opencode/tui.ts`, 'utf8')
  const code = src.split('\n').filter((l: string) => !l.trim().startsWith('//')).join('\n')
  expect(code).toContain("import('solid-js')")
  expect(code).toContain("import('@opentui/solid')")
  expect(code).toContain('loadTuiRuntime(')
  // every import() takes a plain string, so none can miss OpenCode's swap
  const dynamic = code.match(/import\(([^)]*)\)/g) ?? []
  expect(dynamic.length).toBe(2)
  for (const d of dynamic) expect(d).toMatch(/^import\('[^']+'\)$/)
  // the server entry doesn't load the TUI's modules, so a TUI failure can't stop the server part
  const server = await readFile(`${PLUGIN_ROOT}/opencode/server.ts`, 'utf8')
  expect(server).not.toContain('solid')
  expect(server).not.toContain('/tui')
})

/** A fake tui context for the T-505 tests: records toasts, layers and slot claims; ui.panel.open answers `opens`. */
function fakeCtx(theme: unknown, opens = true) {
  const toasts: { message: string; variant?: string }[] = []
  const layers: TuiKeyLayer[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  let current: { name: string; sessionID: string } | undefined
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme,
    renderer: { width: 120, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: factory => void layers.push(factory()) },
    ui: {
      toast: { show: o => void toasts.push({ message: o.message, variant: o.variant }) },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: name => (opens ? ((current = { name, sessionID: 's' }), true) : false), close: () => (current = undefined), current: () => current },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  return { ctx, toasts, layers, slots, current: () => current }
}

/** An OpenTUI color as OpenCode 2.3's theme holds it (an RGBA: a buffer of four numbers). */
const rgba = (...n: number[]) => ({ buffer: new Float32Array(n) })

test("colorOf reads OpenCode 2.3's nested theme (text.base, text.feedback.warning.base, hue.blue.200 ...), and never gives a group of colors as a text color", () => {
  const theme = {
    text: { base: rgba(1, 1, 1, 1), muted: rgba(2, 2, 2, 1), feedback: { warning: { base: rgba(3, 3, 3, 1) }, error: { base: rgba(4, 4, 4, 1) }, success: { base: rgba(5, 5, 5, 1) }, info: { base: rgba(6, 6, 6, 1) } } },
    border: { base: rgba(7, 7, 7, 1) },
    hue: { blue: { 200: rgba(8, 8, 8, 1) }, orange: { 200: rgba(9, 9, 9, 1) }, purple: { 200: rgba(10, 10, 10, 1) } },
  }
  expect(colorOf(theme, 'text')).toBe(theme.text.base)
  expect(colorOf(theme, 'inactive')).toBe(theme.text.muted)
  expect(colorOf(theme, 'warning')).toBe(theme.text.feedback.warning.base)
  expect(colorOf(theme, 'error')).toBe(theme.text.feedback.error.base)
  expect(colorOf(theme, 'success')).toBe(theme.text.feedback.success.base)
  expect(colorOf(theme, 'cyan')).toBe(theme.text.feedback.info.base)
  expect(colorOf(theme, 'subtle')).toBe(theme.border.base)
  expect(colorOf(theme, 'ide')).toBe(theme.hue.blue[200])
  expect(colorOf(theme, 'claude')).toBe(theme.hue.orange[200])
  expect(colorOf(theme, 'permission')).toBe(theme.hue.purple[200])
  expect(colorOf(theme, 'no such name')).toBe(theme.text.base)
  // a theme that lacks a field, or has a group where a color should be (OpenCode 2.3's theme.text, read the old
  // flat way): the plain fallback, never the object
  expect(colorOf({}, 'warning')).toBe('#e5c07b')
  expect(colorOf({ text: { base: { action: {} } } }, 'text')).toBe('#d0d0d0')
  expect(colorOf(undefined, 'ide')).toBe('#5c9cf5')
  // every color of a drawing is one color: a string or an RGBA
  const fgs: unknown[] = []
  const r = { ...fakeRuntime() }
  const set = r.setProp
  r.setProp = (n, k, v) => (k === 'fg' && fgs.push(v), set(n, k, v))
  drawLines(r, theme, bandLines(viewFile(), NOW, 120))
  expect(fgs.length).toBeGreaterThan(0)
  for (const v of fgs) expect(typeof v === 'string' || (typeof v === 'object' && v !== null && 'buffer' in v)).toBe(true)
})

test('drawLines: a line too long for its place is cut, not wrapped piece by piece (each colored piece is its own text)', () => {
  const node = drawLines(fakeRuntime(), {}, [[{ text: 'symcc v0.4.1', color: 'ide' }, { text: ' · proj', color: 'inactive' }]]) as El
  const row = (node.kids[0] as El[])[0]!
  expect(row.props.overflow).toBe('hidden')
  for (const t of row.kids[0] as El[]) {
    expect(t.props.wrapMode).toBe('none')
    expect(t.props.flexShrink).toBe(0)
  }
})

test("/symcc-board with no session open (OpenCode's home page, where ui.panel.open says no): a toast says to open a session first", async () => {
  const f = fakeCtx({}, false)
  const board = startTui(f.ctx, { runtime: fakeRuntime(), readText: async () => viewFileText(viewFile()), every: () => () => undefined, now: () => NOW })
  await f.layers.find(l => l.mode === 'global')!.commands![0]!.run()
  expect(f.current()).toBe(undefined)
  expect(f.toasts.length).toBe(1)
  expect(f.toasts[0]!.message).toContain('Open or start a session first')
  expect(f.toasts[0]!.message).toContain('/symcc-board')
  board.stop()
})

test('a band that fails to draw says so once in a toast (not an empty place with no word); a setup that fails says so too', async () => {
  const f = fakeCtx({})
  const r = fakeRuntime()
  const broken: TuiRuntime = { ...r, createElement: tag => (tag === 'text' ? (() => { throw new Error('bad element') })() : r.createElement(tag)) }
  const board = startTui(f.ctx, { runtime: broken, readText: async () => viewFileText(viewFile()), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const band = f.slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 's' } as never)
  expect(shown(band)).toEqual([])
  shown(band)
  expect(f.toasts.map(t => t.message)).toEqual(["symcc's band above the prompt could not be drawn: bad element"])
  expect(f.toasts[0]!.variant).toBe('error')
  board.stop()
  // setup: the toast names what is missing and what still works; the error is given back to be thrown
  const g = fakeCtx({})
  const err = setupFailed(g.ctx, new Error("symcc's OpenCode board can't load 'solid-js'"))
  expect(err.message).toContain('solid-js')
  expect(g.toasts[0]!.message).toContain('no band above the prompt and no board panel')
  expect(g.toasts[0]!.message).toContain('/plugins')
  expect(g.toasts[0]!.variant).toBe('error')
  // no UI to toast in: still gives the error back
  expect(setupFailed({ ui: { toast: { show: () => { throw new Error('gone') } } } } as never, 'x').message).toBe('x')
})

test('opencode/tui.ts says a failed setup in a toast and throws it on (setupFailed), so /plugins lists it', async () => {
  const src = await readFile(`${PLUGIN_ROOT}/opencode/tui.ts`, 'utf8')
  expect(src).toContain('throw setupFailed(ctx, e)')
})

test('a to do task worked on before shows ● in the panel list and on its page; a fresh one keeps ○ (T-528)', () => {
  const f = viewFile()
  f.view.tasks = f.view.tasks.map(t => (t.id === 'T-4' ? { ...t, attempts: 1 } : t))
  const fresh = viewFile()
  const row = (v: ViewFile) => panelLines(v, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).find(l => l.includes('T-4 '))!
  expect(row(fresh)).toContain(`${STATUS_MARK.todo} `)
  expect(row(f)).toContain('● ')
  expect(row(f)).not.toContain(STATUS_MARK.todo)
  expect(panelLines(f, { opened: 'T-4', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('● to do'))).toBe(true)
})

/** The row boxes of a drawn node, each with its text and its own props (the fake keeps what setProp is given). */
function rowEls(node: unknown): { text: string; el: El; segs: El[] }[] {
  const flat = (x: unknown): unknown[] => (typeof x === 'function' ? flat(x()) : Array.isArray(x) ? x.flatMap(flat) : x == null ? [] : [x])
  const text = (x: unknown): string => flat(x).map(k => (typeof k === 'string' ? k : text((k as El).kids))).join('')
  const rows = (x: unknown): { text: string; el: El; segs: El[] }[] =>
    flat(x).flatMap(k => (typeof k === 'string' ? [] : (k as El).props.flexDirection === 'row' ? [{ text: text((k as El).kids), el: k as El, segs: flat((k as El).kids) as El[] }] : rows((k as El).kids)))
  return rows(node)
}

test('T-567: a click on the band above the prompt: the header opens the board panel (and closes it when open), a task\'s row opens its page; the header shows "(click: board)" when there is room', async () => {
  const f = viewFile()
  // the hint: at the header's end when there is room, dropped first when narrow
  const wide = bandDraw(f, NOW, 160)
  expect(lineText(wide.lines[0]!).endsWith(BAND_CLICK_HINT)).toBe(true)
  expect(wide.hits[0]).toEqual({ board: true })
  expect(wide.hits.length).toBe(wide.lines.length)
  const headLen = lineText(wide.lines[0]!).length - BAND_CLICK_HINT.length
  expect(lineText(bandDraw(f, NOW, headLen + BAND_CLICK_HINT.length - 1).lines[0]!)).not.toContain('(click: board)')
  expect(lineText(bandDraw(f, NOW, 40).lines[0]!)).not.toContain('(click: board)')
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText({ ...f, view: { ...f.view, open_on_start: false } })]])  // T-756: the board doesn't open by itself here
  const fc = fakeCtx({})
  const board = startTui({ ...fc.ctx, renderer: { width: 164, height: 200 } }, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const band = fc.slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 's' } as never)
  const rows = () => rowEls(band)
  const click = (has: (t: string) => boolean, button = 0) => (rows().find(r => has(r.text))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button, stopPropagation: () => undefined })
  expect(rows()[0]!.text).toContain('symcc · proj')
  expect(rows()[0]!.text.endsWith(BAND_CLICK_HINT)).toBe(true)
  expect(typeof rows()[0]!.el.props.onMouseUp).toBe('function')
  // a right click does nothing
  click(t => t.includes('symcc · proj'), 2)
  expect(fc.current()).toBe(undefined)
  // the header opens the board panel, and closes it when it is open (as /symcc-board does)
  click(t => t.includes('symcc · proj'))
  expect(fc.current()?.name).toBe(BOARD_PANEL)
  click(t => t.includes('symcc · proj'))
  expect(fc.current()).toBe(undefined)
  // a task's row opens the panel on that task's page, and keeps it open when it is
  click(t => t.startsWith('T-2'))
  expect(fc.current()?.name).toBe(BOARD_PANEL)
  expect(board.state().opened).toBe('T-2')
  expect(board.state().tab).toBe('tasks')
  click(t => t.startsWith('T-1'))
  expect(fc.current()?.name).toBe(BOARD_PANEL)
  expect(board.state().opened).toBe('T-1')
  // T-568: with T-1's page open, a click on T-2 in the band opens T-2's page, and b puts the list cursor on T-2
  const listIds = panelLines(f, { tab: 'tasks', opened: '', cursor: 0 }, NOW, 120).ids
  expect(listIds.indexOf('T-1')).not.toBe(listIds.indexOf('T-2'))
  click(t => t.startsWith('T-2'))
  expect(board.state().opened).toBe('T-2')
  await board.press('back', 's')
  expect(board.state().opened).toBe('')
  expect(board.state().cursor).toBe(listIds.indexOf('T-2'))
  click(t => t.startsWith('T-1'))
  await board.press('back', 's')
  expect(board.state().cursor).toBe(listIds.indexOf('T-1'))
  expect(fc.toasts).toEqual([])
  board.stop()
})

test('T-558: the mouse works like the keys: a click on a row opens its task, on a group opens or closes it, on a key hint runs its key; the wheel scrolls the list', async () => {
  const f0 = viewFile()
  // more backlog than the list shows, and a dropped task, so the groups and the scroll have something to do
  let b: Board = { ...emptyBoard(), tasks: f0.view.tasks, next_id: 6 } as Board
  for (let i = 0; i < 7; i++) b = addTask(b, { origin: { why: 'a test' }, title: `an idea ${i}`, files: ['src/'] }, AT)[0]
  for (let i = 6; i <= 12; i++) b = patchTask(b, `T-${i}`, { status: 'backlog' }, AT)
  b = patchTask(b, 'T-4', { status: 'dropped' }, AT)
  const f = { ...f0, view: { ...f0.view, tasks: b.tasks } }
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => 'too big', select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  let focusedBy = 0
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: false, close: () => undefined, focus: () => void focusedBy++ } as never) as El
  const row = (has: (t: string) => boolean) => rowEls(panel).find(r => has(r.text))!
  const clickRow = async (has: (t: string) => boolean) => {
    const r = row(has)
    expect(typeof r.el.props.onMouseUp).toBe('function')
    ;(r.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
    await Promise.resolve()
  }
  const clickHint = async (hint: string) => {
    const seg = rowEls(panel).at(-1)!.segs.find(s => s.kids.join('') === hint)!
    expect(typeof seg.props.onMouseUp).toBe('function')
    ;(seg.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
    await new Promise<void>(res => setTimeout(res, 0))
  }
  // the list's banner and other plain lines do nothing on a click
  expect(rowEls(panel)[0]!.el.props.onMouseUp).toBe(undefined)
  // a click on a task's row opens its page and gives the panel the keyboard; a right click does nothing
  ;(row(t => t.includes('T-2 ')).el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 2 })
  expect(board.state().opened).toBe('')
  await clickRow(t => t.includes('T-2 '))
  expect(board.state().opened).toBe('T-2')
  expect(focusedBy).toBe(1)
  expect(rowEls(panel).some(r => r.text.startsWith('◆ ready for review'))).toBe(true)
  // the page's key hints are buttons: approve, reject (asks the reason), back
  await clickHint('x reject')
  await clickHint('a approve')
  expect(sent).toEqual([
    { sessionID: 'ses_1', name: 'symcc-reject', text: 'T-2 too big' },
    { sessionID: 'ses_1', name: 'symcc-approve', text: 'T-2' },
  ])
  // T-615: while the approve runs, the page offers no approve or reject any more (as the terminal's)
  expect(rowEls(panel).at(-1)!.text).not.toContain('approve')
  expect(rowEls(panel).at(-1)!.text).not.toContain('reject')
  await clickHint('b back')
  expect(board.state().opened).toBe('')
  // a click on a group's row opens it (its tasks show), and again closes it
  expect(rowEls(panel).some(r => r.text.includes('T-4 '))).toBe(false)
  await clickRow(t => t.includes('▸ Dropped'))
  expect(board.state().groups.dropped).toBe(true)
  expect(row(t => t.includes('Dropped')).text).toContain('▾ Dropped')
  expect(rowEls(panel).some(r => r.text.includes('T-4 '))).toBe(true)
  await clickRow(t => t.includes('▾ Dropped'))
  expect(board.state().groups.dropped).toBe(false)
  expect(rowEls(panel).some(r => r.text.includes('T-4 '))).toBe(false)
  // the backlog closes the same way; Enter on a group's row toggles it too
  await clickRow(t => t.includes('▾ Backlog'))
  expect(row(t => t.includes('Backlog')).text).toContain('▸ Backlog')
  expect(rowEls(panel).some(r => r.text.includes('an idea 0'))).toBe(false)
  await board.press('open', 'ses_1')
  expect(board.state().groups.backlog).toBe(true)
  // a click on Done's row opens it: the done task shows, and a click on it opens its page
  await clickRow(t => t.includes('▸ Done'))
  await clickRow(t => t.includes('T-5 '))
  expect(board.state().opened).toBe('T-5')
  await clickHint('b back')
  // the mouse wheel scrolls the list down and back up, never above its top
  const scroll = (direction: string) => (panel.props.onMouseScroll as (e: unknown) => void)({ type: 'scroll', scroll: { direction }, stopPropagation: () => undefined })
  // T-627: OpenTUI lays the panel out 18 rows high and says so (onSizeChange): the panel is drawn exactly that high
  const full = panelLines(f, { opened: '', cursor: 0, groups: board.state().groups }, NOW, 98)
  ;(panel as El & { height?: number }).height = 18
  ;(panel.props.onSizeChange as () => void)()
  const before = rowEls(panel).map(r => r.text)
  expect(before.length).toBe(18)
  scroll('down')
  expect(board.state().scroll).toBe(3)
  const after = rowEls(panel).map(r => r.text)
  expect(after.length).toBe(18)
  // the banner, the tabs and the footer stay; the list moves up by 3 drawn lines
  expect(after.slice(0, full.fixed)).toEqual(before.slice(0, full.fixed))
  expect(after.slice(-full.footer)).toEqual(before.slice(-full.footer))
  expect(after.slice(full.fixed, -full.footer - 3)).toEqual(before.slice(full.fixed + 3, -full.footer))
  scroll('up')
  scroll('up')
  expect(board.state().scroll).toBe(0)
  for (let i = 0; i < 50; i++) scroll('down')
  // it stops when the list's last line is at the bottom: the last screenful is full
  const end = rowEls(panel).map(r => r.text)
  expect(end.length).toBe(18)
  expect(end.at(-full.footer - 1)).toBe(lineText(full.lines.at(-full.footer - 1)!))
  expect(board.state().scroll).toBe(full.bodyLines - (18 - full.fixed - full.footer))
  expect(board.state().scroll).toBe(panelLines(f, { opened: '', cursor: 0, groups: board.state().groups, scroll: 999, rows: 18 }, NOW, 98).scroll)
  board.stop()
})

test('T-945: the backlog\'s "… N more (Enter to show all)" row is a cursor stop; Enter or a click on it lists the whole backlog', async () => {
  const f0 = viewFile()
  let b: Board = emptyBoard()
  for (let i = 0; i < 8; i++) b = addTask(b, { origin: { why: 'a test' }, title: `an idea ${i}`, files: ['src/'] }, AT)[0]
  for (let i = 1; i <= 8; i++) b = patchTask(b, `T-${i}`, { status: 'backlog' }, AT)
  const f = { ...f0, view: { ...f0.view, tasks: b.tasks, questions: [] } }
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  for (const how of ['enter', 'click'] as const) {
    const slots: { append: string; render: (input: never) => unknown }[] = []
    const ctx: TuiContext = {
      location: { directory: '/work/proj' },
      theme: {},
      renderer: { width: 120, height: 200 },
      client: { session: { command: async () => undefined } },
      keymap: { layer: () => undefined },
      ui: {
        toast: { show: () => undefined },
        dialog: { prompt: async () => undefined, select: async () => undefined },
        panel: { open: () => true, close: () => undefined, current: () => undefined },
        slot: claim => (slots.push(claim as never), () => undefined),
      },
    }
    const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
    await board.refresh()
    const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: false, close: () => undefined, focus: () => undefined } as never) as El
    const listed = () => rowEls(panel).filter(r => /^\s*›?\s*T-\d /.test(r.text)).length
    const ids = () => panelLines(f, { opened: '', cursor: 0, groups: board.state().groups, backlogAll: board.state().backlogAll }, NOW, 98).ids
    const more = rowEls(panel).find(r => r.text.includes('… 3 more (Enter to show all)'))!
    expect(more.text.trim()).toBe('… 3 more (Enter to show all)')
    expect(listed()).toBe(5)
    expect(ids().includes('T-1')).toBe(false)
    // the cursor can land on it
    for (let i = 0; i < ids().indexOf('backlog-more'); i++) await board.press('down', 'ses_1')
    expect(ids()[board.state().cursor]).toBe('backlog-more')
    expect(rowEls(panel).find(r => r.text.includes('3 more'))!.text).toContain('› … 3 more')
    if (how === 'enter') await board.press('open', 'ses_1')
    else {
      expect(typeof more.el.props.onMouseUp).toBe('function')
      ;(more.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
      await Promise.resolve()
    }
    expect(board.state().backlogAll).toBe(true)
    expect(board.state().opened).toBe('')
    expect(listed()).toBe(8)
    expect(rowEls(panel).some(r => r.text.includes('more (Enter to show all)'))).toBe(false)
    // the cursor reaches T-1 (the last ids are the backlog's tasks)
    for (let i = 0; i < 20; i++) await board.press('down', 'ses_1')
    expect(ids().includes('T-1')).toBe(true)
    expect(ids().includes('backlog-more')).toBe(false)
    while (ids()[board.state().cursor] !== 'T-1' && board.state().cursor > 0) await board.press('up', 'ses_1')
    expect(ids()[board.state().cursor]).toBe('T-1')
    board.stop()
  }
})

test('T-946: the open Done group lists today\'s tasks, then a folded row per older day; Enter or a click opens a day', async () => {
  // "now" is today's local noon, so the days are worked out the way the board does in any time zone (T-792 day-clock)
  const now = todayAt(12)
  const off = localOffset(now)
  const today = dayOf(now, off)
  const yesterday = dayOf(now - 86_400_000, off)
  const fourAgo = dayOf(now - 4 * 86_400_000, off)
  const fourLabel = dayLabel(fourAgo, today)
  const f0 = viewFile()
  let b: Board = emptyBoard()
  const days = [0, 0, 1, 1, 1, 4]
  for (let i = 0; i < days.length; i++) b = addTask(b, { origin: { why: 'a test' }, title: `work ${i}`, files: ['src/'] }, AT)[0]
  const tasks = b.tasks.map((t, i) => ({ ...t, status: 'done' as const, updated_at: new Date(now - days[i]! * 86_400_000 - (i + 1) * 60_000).toISOString() }))
  const f = { ...f0, view: { ...f0.view, tasks, working: [], questions: [] } }
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  for (const how of ['enter', 'click'] as const) {
    const slots: { append: string; render: (input: never) => unknown }[] = []
    const ctx: TuiContext = {
      location: { directory: '/work/proj' },
      theme: {},
      renderer: { width: 120, height: 200 },
      client: { session: { command: async () => undefined } },
      keymap: { layer: () => undefined },
      ui: {
        toast: { show: () => undefined },
        dialog: { prompt: async () => undefined, select: async () => undefined },
        panel: { open: () => true, close: () => undefined, current: () => undefined },
        slot: claim => (slots.push(claim as never), () => undefined),
      },
    }
    const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => now })
    await board.refresh()
    const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: false, close: () => undefined, focus: () => undefined } as never) as El
    const texts = () => rowEls(panel).map(r => r.text)
    const ids = () => panelLines(f, { opened: '', cursor: 0, groups: board.state().groups, openDays: board.state().openDays }, now, 98).ids
    // open Done: today's two tasks first, then the folded days, newest first, with their counts
    const done = rowEls(panel).find(r => r.text.includes('▸ Done'))!
    ;(done.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
    await Promise.resolve()
    expect(board.state().groups.done).toBe(true)
    const from = texts().findIndex(t => t.includes('▾ Done'))
    const four = texts().slice(from + 1, from + 5).map(t => t.trim())
    expect(four.slice(0, 2).map(t => t.split(/\s+/)[0]).sort()).toEqual(['T-1', 'T-2'])
    expect(four.slice(2)).toEqual(['▸ Yesterday · 3 done', `▸ ${fourLabel} · 1 done`])
    expect(texts().some(t => t.includes('T-5 '))).toBe(false)
    expect(ids().filter(id => id.startsWith('day:'))).toEqual([`day:${yesterday}`, `day:${fourAgo}`])
    // Yesterday opens: its three tasks show under it
    if (how === 'enter') {
      while (ids()[board.state().cursor] !== `day:${yesterday}`) await board.press('down', 'ses_1')
      expect(texts().find(t => t.includes('Yesterday'))!.trim()).toBe('› ▸ Yesterday · 3 done')
      await board.press('open', 'ses_1')
    } else {
      const row = rowEls(panel).find(r => r.text.includes('Yesterday'))!
      ;(row.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
      await Promise.resolve()
    }
    expect(board.state().openDays).toEqual([yesterday])
    expect(board.state().opened).toBe('')
    const y = texts().findIndex(t => t.includes('▾ Yesterday · 3 done'))
    expect(texts().slice(y + 1, y + 4).map(t => t.trim().replace(/^› /, '').split(/\s+/)[0]).sort()).toEqual(['T-3', 'T-4', 'T-5'])
    expect(texts()[y + 4]!.trim()).toBe(`▸ ${fourLabel} · 1 done`)
    expect(texts().some(t => t.includes('T-6 '))).toBe(false)
    // and folds again
    if (how === 'enter') await board.press('open', 'ses_1')
    else {
      ;(rowEls(panel).find(r => r.text.includes('Yesterday'))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
      await Promise.resolve()
    }
    expect(board.state().openDays).toEqual([])
    expect(texts().some(t => t.includes('T-5 '))).toBe(false)
    board.stop()
  }
})

test('T-558: panelLines gives each list row what a click on it does, and scrolls the list between the banner and the footer', () => {
  const f = viewFile()
  const d = panelLines(f, { opened: '', cursor: 0 }, NOW, 100)
  expect(d.hits.length).toBe(d.lines.length)
  const at = (s: string) => d.lines.findIndex(l => lineText(l).includes(s))
  expect(d.hits[at('T-3 ')]).toEqual({ open: 'T-3' })
  expect(d.hits[at('▸ Done')]).toEqual({ group: 'done' })
  expect(d.hits[at('NEEDS YOU')]).toBe(null)
  expect(d.ids).toContain('group:done')
  // the footer's hints are buttons; "move" isn't one
  const foot = d.lines.at(-1)!
  expect(foot.find(s => s.text === 'Enter open')?.hit).toEqual({ key: 'open' })
  expect(foot.find(s => s.text === '↑↓ move')?.hit).toBe(undefined)
  // with the panel's height known, the scroll stops when the list's last line is at the bottom
  const rows = d.lines.length - 2
  expect(panelLines(f, { opened: '', cursor: 0, scroll: 99, rows }, NOW, 100).scroll).toBe(2)
  expect(panelLines(f, { opened: '', cursor: 0, scroll: 99, rows: 200 }, NOW, 100).scroll).toBe(0)
})

/** The view file with two scouts (docs-check paused, with two runs; deps waiting) and its runs, as view.ts writes them. */
function scoutsViewFile(): ViewFile {
  const f = viewFile()
  const scouts = [
    { name: 'docs-check', every_minutes: 60, last_run: '2026-11-19T11:50:00.000Z', running: false, paused: true, prompt: 'Look for stale docs.\nSay NOTHING when all is fine.', last_report: '1. README is stale' },
    { name: 'deps', every_minutes: 30, last_run: null, running: false, next_run: '2026-11-19T12:10:00.000Z', prompt: 'Check the dependencies.' },
  ]
  const scout_runs = {
    'docs-check': [
      { run: { started: '2026-11-19T11:45:00.000Z', ended: '2026-11-19T11:50:00.000Z', outcome: 'found' as const, findings: 1, report: '.symcc/reports/scouts/docs-check-2026-11-19T11-50-00-000Z.md' }, tasks: ['T-4'] },
      { run: { started: '2026-11-19T10:45:00.000Z', ended: '2026-11-19T10:50:00.000Z', outcome: 'nothing' as const, findings: 0 }, tasks: [] },
    ],
  }
  return { ...f, view: { ...f.view, scouts, scout_runs, notify_choices: ['voice', 'sound 1', 'sound 2', 'sound 3', 'off'], notify_now: 'sound 2' } }
}

test('T-559: the Scouts tab lists the scouts from view.json, a scout\'s page shows its prompt and runs, a run its report; the Settings tab shows every setting in its group with its value and default', () => {
  const f = scoutsViewFile()
  expect(parseViewFile(viewFileText(f))).toEqual(f)
  // the tabs under the banner, on every tab, each a button
  const tasks = panelLines(f, { opened: '', cursor: 0 }, NOW, 100)
  const tabs = tasks.lines.find(l => lineText(l).includes('[t]: Tasks'))!
  expect(lineText(tabs)).toContain('Scouts')
  expect(tabs.find(s => s.text.includes('Settings'))?.hit).toEqual({ tab: 'settings' })
  expect(lineText(tasks.lines.at(-1)!)).toContain('l t s c views')
  // the list: name, how often, paused or the next run, last result; the waiting one first, the paused one after
  const list = panelLines(f, { tab: 'scouts', opened: '', cursor: 0 }, NOW, 100)
  const text = list.lines.map(lineText)
  expect(text.some(l => l.includes('[s]: Scouts (2)'))).toBe(true)
  expect(list.ids).toEqual(['deps', 'docs-check'])
  const deps = text.find(l => l.includes('deps'))!
  expect(deps).toMatch(/^› /)
  expect(deps).toContain('every 30 min')
  expect(deps).toContain('next in 10m')
  expect(deps).toContain('never ran')
  const docs = text.find(l => l.includes('docs-check'))!
  expect(docs).toContain('every hour')
  expect(docs).toContain('paused')
  expect(docs).toContain('last: found 1')
  expect(list.hits[list.lines.findIndex(l => lineText(l).includes('docs-check'))]).toEqual({ scout: 'docs-check' })
  expect(panelKeys(f, '', 'scouts').map(k => k.word)).toEqual(['move', 'open', 'views', 'close'])
  // no scouts: how to add one
  expect(panelLines({ ...f, view: { ...f.view, scouts: [] } }, { tab: 'scouts', opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.startsWith('No scouts yet'))).toBe(true)
  // a scout's page: its state, its prompt, its runs (newest first, the cursor on one) and its file
  const page = panelLines(f, { tab: 'scouts', opened: 'docs-check', cursor: 0 }, NOW, 100)
  const p = page.lines.map(lineText)
  // T-751: its header: the name, how often it runs on the state line, "⏸ paused" with its buttons
  expect(p.some(l => l.startsWith('docs-check'))).toBe(true)
  expect(p.some(l => l.startsWith('◷ every hour'))).toBe(true)
  expect(p.some(l => l.endsWith('⏸ paused'))).toBe(true)
  expect(p).toContain('Instructions')
  expect(p).toContain('  Look for stale docs.')
  expect(p).toContain('Runs')
  expect(page.ids).toEqual(['2026-11-19T11:50:00.000Z', '2026-11-19T10:50:00.000Z'])
  expect(p.find(l => l.includes('found · 1 finding · task T-4'))).toMatch(/^› 10m ago/)
  expect(p.some(l => l.includes('nothing · 0 findings · no tasks'))).toBe(true)
  expect(p).toContain('  .symcc/scouts/docs-check.md')
  expect(panelKeys(f, 'docs-check', 'scouts').map(k => k.word)).toEqual(['run now', 'resume', 'edit', 'findings', 'move', 'report', 'back'])
  // the panel's footer also says [ ] prev/next, as there are other scouts
  expect(page.keys.map(k => k.word)).toEqual(['run now', 'resume', 'edit', 'findings', 'move', 'report', 'prev/next', 'back'])
  // a running scout has no "run now"; a waiting one pauses
  const running = { ...f, view: { ...f.view, scouts: f.view.scouts.map(s => ({ ...s, running: s.name === 'deps' })) } }
  expect(panelKeys(running, 'deps', 'scouts').map(k => k.word)).toEqual(['pause', 'edit', 'findings', 'back'])
  // a run's page: its line and its report (read by the TUI from its file)
  const run = (report?: string | null) => panelLines(f, { tab: 'scouts', opened: 'docs-check', run: '2026-11-19T11:50:00.000Z', report, cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(run('1. README is stale\n2. no guide')).toContain('  2. no guide')
  expect(run('x').some(l => l.includes('run that ended 2026-11-19T11:50:00.000Z'))).toBe(true)
  expect(run(undefined)).toContain('  (reading the report…)')
  expect(run(null).some(l => l.includes("can't be read"))).toBe(true)
  expect(panelKeys(f, 'docs-check', 'scouts', '2026-11-19T11:50:00.000Z').map(k => k.word)).toEqual(['back'])
  // Settings, every group open: every group's title, every setting with its value and default
  const settings = panelLines(f, { tab: 'settings', opened: '', cursor: 1, settingsOpen: ALL_GROUPS }, NOW, 140)
  const s = settings.lines.map(lineText)
  for (const g of ['Work', 'Checks before merging', 'Workers', 'Scouts', 'Board and alerts']) expect(s).toContain(`  ▾ ${g}`)
  expect(s.find(l => l.includes('max_parallel'))).toMatch(/max_parallel +2 · default 3 · 1-8/)
  expect(s.find(l => l.includes('test_commands'))).toContain('bun test')
  // T-908: docs_test_commands sits right after test_commands under Checks before merging, none by default
  expect(settings.ids[settings.ids.indexOf('test_commands') + 1]).toBe('docs_test_commands')
  expect(s.find(l => l.includes('docs_test_commands'))).toMatch(/docs_test_commands +none · default none/)
  expect(s.find(l => /^› /.test(l))).toContain('mode')
  expect(settings.ids.slice(0, 2)).toEqual(['settings-group:Work', 'mode'])
  expect(settings.ids).toContain('notify')
  // T-695: one notify row holds the sound set (voice / sound 1 / sound 2 / sound 3 / off); no sound_set row
  expect(settings.ids.includes('sound_set' as never)).toBe(false)
  expect(s.some(l => l.includes('sound_set'))).toBe(false)
  expect(s.find(l => /notify +sound/.test(l))).toMatch(/notify +sound 2 · default voice .*· voice \/ sound 1 \/ sound 2 \/ sound 3/)
  expect(settings.ids[settings.ids.indexOf('notify') + 1]).toBe('open_on_start')
  expect(settings.hits[s.findIndex(l => l.includes('max_minutes'))]).toEqual({ setting: 'max_minutes' })
  expect(panelKeys(f, '', 'settings').map(k => k.word)).toEqual(['change', 'move', 'views', 'back'])
  // the footer is core's settingsKeys, as Claude Code's: on a group heading Enter opens or closes it (T-584)
  expect(settings.keys).toEqual(settingsKeys(false))
  expect(panelLines(f, { tab: 'settings', opened: '', cursor: 0, settingsOpen: ALL_GROUPS }, NOW, 140).keys).toEqual(settingsKeys(true))
  expect(lineText(panelLines(f, { tab: 'settings', opened: '', cursor: 0, settingsOpen: ALL_GROUPS }, NOW, 140).lines.at(-1)!)).toContain('Enter open/close')
  // the actions as slash commands
  expect(actionCommand({ kind: 'scout', scout: 'deps' })).toEqual({ name: 'symcc-scout', text: 'deps' })
  expect(actionCommand({ kind: 'scout', scout: 'deps', paused: true })).toEqual({ name: 'symcc-scout', text: 'deps pause' })
  expect(actionCommand({ kind: 'setting', setting: 'max_parallel', value: ' 5 ' })).toEqual({ name: 'symcc-settings', text: 'max_parallel 5' })
})

test('T-559: startTui: t, s and c switch tabs (a click on a tab too); on a scout r runs it now and p resumes it, a run opens its report; Enter on a setting changes it with /symcc-settings', async () => {
  const f = scoutsViewFile()
  const files = new Map([
    ['/work/proj/.symcc/view.json', viewFileText(f)],
    ['/work/proj/.symcc/reports/scouts/docs-check-2026-11-19T11-50-00-000Z.md', '1. README is stale (from the file)'],
  ])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const answers = { prompt: '7' as string | undefined, select: 'review' as string | undefined }
  const picks: string[][] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 140, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => answers.prompt, select: async <V,>(o: { readonly options: readonly { readonly value: V }[] }) => (picks.push(o.options.map(x => String(x.value))), answers.select as V | undefined) },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 142, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  expect(board.state().tab).toBe('tasks')
  await board.press('s', 'ses_1')
  expect(board.state().tab).toBe('scouts')
  expect(lines().some(l => l.includes('docs-check') && l.includes('paused'))).toBe(true)
  // down to docs-check, open it: its page
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('docs-check')
  expect(lines()).toContain('  Look for stale docs.')
  await board.press('r', 'ses_1')
  await board.press('p', 'ses_1')
  // Enter on its newest run: the run's page with the report read from its file; b goes back to the scout's page
  await board.press('open', 'ses_1')
  expect(board.state().run).toBe('2026-11-19T11:50:00.000Z')
  await new Promise<void>(res => setTimeout(res, 0))
  expect(lines()).toContain('  1. README is stale (from the file)')
  await board.press('back', 'ses_1')
  expect(board.state().run).toBe('')
  expect(board.state().opened).toBe('docs-check')
  // a click on a run row opens it too
  const runRow = rowEls(panel).find(r => r.text.includes('nothing · 0 findings'))!
  ;(runRow.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  expect(board.state().run).toBe('2026-11-19T10:50:00.000Z')
  expect(lines()).toContain('  (this run reported nothing)')
  // c: the Settings tab; Enter on mode picks from a list, on max_parallel asks for a number, on checker flips it
  await board.press('c', 'ses_1')
  expect([board.state().tab, board.state().opened, board.state().run, board.state().cursor]).toEqual(['settings', '', '', 0])
  // the groups start closed: Enter on the Work heading opens it
  await board.press('open', 'ses_1')
  expect(lines().some(l => l.includes('max_parallel') && l.includes('default 3'))).toBe(true)
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  ;(rowEls(panel).find(r => r.text.includes('▸ Checks before merging'))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  const checker = rowEls(panel).find(r => r.text.includes('checker ') && r.text.includes('default off'))!
  ;(checker.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  await new Promise<void>(res => setTimeout(res, 0))
  // a bad value is not sent
  answers.prompt = 'lots'
  const maxMinutes = rowEls(panel).find(r => r.text.includes('max_minutes'))!
  ;(maxMinutes.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  await new Promise<void>(res => setTimeout(res, 0))
  expect(board.state().cursor).toBe(3)
  expect(sent).toEqual([
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'docs-check' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'docs-check resume' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'mode review' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'max_parallel 7' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'checker on' },
  ])
  // T-695: notify is picked from the five choices, sound set included
  ;(rowEls(panel).find(r => r.text.includes('▸ Board and alerts'))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  answers.select = 'sound 3'
  const notifyRow = rowEls(panel).find(r => /notify +sound 2/.test(r.text))!
  ;(notifyRow.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  await new Promise<void>(res => setTimeout(res, 0))
  expect(picks.at(-1)).toEqual(['voice', 'sound 1', 'sound 2', 'sound 3', 'off'])
  expect(sent.at(-1)).toEqual({ sessionID: 'ses_1', name: 'symcc-settings', text: 'notify sound 3' })
  // a click on the Tasks tab goes back to the task list; t does too
  const tabSeg = rowEls(panel).find(r => r.text.includes('[c]: Settings'))!.segs.find(s => s.kids.join('').includes('Tasks'))!
  ;(tabSeg.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  expect(board.state().tab).toBe('tasks')
  expect(lines().some(l => l.includes('NEEDS YOU'))).toBe(true)
  await board.press('s', 'ses_1')
  await board.press('t', 'ses_1')
  expect(board.state().tab).toBe('tasks')
  board.stop()
})

test('T-559: the view file carries each scout\'s recent runs, newest first, with the tasks made from them (scoutRunsOf)', async () => {
  const { scoutRunsOf } = await import('../view')
  const runs = { runs: [
    { started: '2026-11-19T10:45:00.000Z', ended: '2026-11-19T10:50:00.000Z', outcome: 'nothing', findings: 0 },
    { started: '2026-11-19T11:45:00.000Z', ended: '2026-11-19T11:50:00.000Z', outcome: 'found', findings: 1, tasks: ['T-4'] },
  ] }
  const read = async (p: string) => (p === '/work/proj/.symcc/scouts/docs-check.runs.json' ? JSON.stringify(runs) : Promise.reject(new Error('missing')))
  const v = scoutsViewFile().view
  const got = await scoutRunsOf({ fs: { read } } as never, '/work/proj', v)
  expect(Object.keys(got)).toEqual(['docs-check'])
  expect(got['docs-check']!.map(x => x.run.ended)).toEqual(['2026-11-19T11:50:00.000Z', '2026-11-19T10:50:00.000Z'])
  expect(got['docs-check']![0]!.tasks).toEqual(['T-4'])
})

/** The view file with roles and task types as view.ts writes them (viewDefs): general and checker built-in, tester the
 *  owner's copy and off, oops a role file that can't be read; the kinds change (always on) and bug (the owner's copy). */
function defsViewFile(): ViewFile {
  const f = scoutsViewFile()
  const general = { name: 'general', description: 'Any task', skills: [], prompt: 'Do the task.' }
  const checker = { name: 'checker', description: 'Checks a worker\'s work', skills: [], prompt: 'Check it.', off: true }
  const tester = { name: 'tester', description: 'Writes tests', skills: [], prompt: 'Test it.' }
  const myTester = { name: 'tester', description: 'My tester', skills: ['tdd'], model: 'opus', prompt: 'Test it well.\nRun them twice.', off: true }
  const broken = [{ name: 'oops', file: '.symcc/roles/oops.md', reason: 'no description' }]
  const roles = viewDefs('role', mergeRoles([general, checker, tester], [myTester]), [general, checker, tester], [myTester], broken, '.symcc/roles')
  const change = { name: 'change', description: 'A change to make', body: 'Make it.' }
  const bug = { name: 'bug', description: 'Something broken', body: 'Fix it.' }
  const myBug = { ...bug, description: 'A bug to fix', body: 'Fix it, with a test.' }
  const kinds = viewDefs('kind', mergeKinds([change, bug], [myBug]), [change, bug], [myBug], [], '.symcc/kinds')
  return { ...f, view: { ...f.view, roles, kinds, checker: true } }
}

test('T-562: viewDefs gives each role and kind where it comes from, whether it can be turned off and reset, and its file', () => {
  const f = defsViewFile()
  const roles = f.view.roles!
  expect(roles.map(r => [r.name, r.source, r.off, r.canOff, r.canReset])).toEqual([
    ['general', 'built-in', false, false, false],
    ['checker', 'built-in', false, false, false],
    ['tester', 'replaced', true, true, true],
    ['oops', '', false, false, false],
  ])
  expect(roles[0]!.file).toBe('roles/general.md (in the plugin)')
  expect([roles[2]!.file, roles[2]!.model, roles[2]!.skills, roles[2]!.text]).toEqual(['.symcc/roles/tester.md', 'opus', ['tdd'], 'Test it well.\nRun them twice.'])
  expect(roles[3]!.broken).toBe("your file can't be read: no description")
  expect(f.view.kinds!.map(k => [k.name, k.source, k.canOff, k.canReset, k.text])).toEqual([
    ['change', 'built-in', false, false, 'Make it.'],
    ['bug', 'replaced', true, true, 'Fix it, with a test.'],
  ])
  // they ride in the view file
  expect(parseViewFile(viewFileText(f))!.view.roles).toEqual(roles)
  expect(parseViewFile(viewFileText({ ...f, view: { ...f.view, roles: 'x' as never } }))!.view.roles).toBe(undefined)
})

test('T-562: the Settings tab opens the Roles and Task types pages from view.json; a role\'s and a kind\'s page show it, and turn it off or on or reset it with /symcc-settings role|type', () => {
  const f = defsViewFile()
  // the Settings list: the Roles and Task types rows with their counts, each a row the cursor goes over
  const settings = panelLines(f, { tab: 'settings', opened: '', cursor: 0, settingsOpen: ['Workers'] }, NOW, 140)
  const s = settings.lines.map(lineText)
  expect(s.find(l => l.includes('Roles'))).toMatch(/Roles +4 roles · 1 off/)
  expect(s.find(l => /^ +Task types/.test(l))).toMatch(/Task types +2 task types/)
  expect(settings.ids).toContain('roles')
  expect(settings.ids).toContain('kinds')
  expect(settings.hits[s.findIndex(l => l.includes('4 roles'))]).toEqual({ page: 'roles' })
  // the Roles page: a row per role, the broken one with why
  const list = panelLines(f, { tab: 'settings', opened: 'roles', cursor: 2 }, NOW, 140)
  const l = list.lines.map(lineText)
  // T-918: the heading with its count, the column heads, one line per role (the cursor's marked ❯), + New role (n)
  expect(l).toContain('▍Roles  4 roles · 1 changed by you · 1 off')
  expect(l).toContain("  NAME     FROM      MODEL  WEB  WRITES  WHAT IT'S FOR")
  expect(list.ids).toEqual(['role:general', 'role:checker', 'role:tester', 'role:oops'])
  expect(list.selected).toBe('role:tester')
  expect(l).toContain('❯ tester   off       opus   —    code    My tester')
  expect(l).toContain('  general  built-in  —      —    code    Any task')
  expect(l).toContain("  oops     — your file can't be read: no description")
  expect(l).toContain('  + New role (n)')
  expect(list.hits[l.indexOf('  + New role (n)')]).toEqual({ key: 'n' })
  // no "Enter opens" line and no Back button: the key line says them
  expect(l.some(x => x.includes('Enter opens') || x.includes('[ Back (b) ]'))).toBe(false)
  // the off line is dim
  expect(list.lines[l.findIndex(x => x.includes('tester'))]!.slice(1).every(x => x.color === 'inactive')).toBe(true)
  expect(list.hits[l.findIndex(x => x.includes('tester'))]).toEqual({ page: 'role:tester' })
  expect(panelKeys(f, 'roles', 'settings').map(k => k.word)).toEqual(['open', 'new role', 'move', 'views', 'back'])
  // a role's page: its model, skills, checklist and file; o turns it on (it is off), r resets it
  const page = panelLines(f, { tab: 'settings', opened: 'role:tester', cursor: 0 }, NOW, 140)
  const p = page.lines.map(lineText)
  // T-871: the shared page header (‹ [Roles] and its place, its name and description, its state, its buttons, a rule)
  expect(p[0]).toMatch(/^‹ \[Roles\] +tester · ‹ 3 of 3 ›$/)
  expect(p[1]).toBe('tester  My tester')
  expect(p[2]).toMatch(/^replaced · 5 changes +off$/)
  expect(p[3]).toMatch(/^\[Edit\] \[Prompt\] +\[Reset to built-in\] +\[Turn on\]$/)
  expect(p).toContain('Changed from built-in')
  expect(p).toContain("  model: (session's model) → opus")
  expect(p).toContain('  checklist: 3 lines changed')
  expect(p).toContain('    − Test it.')
  expect(p).toContain('    + Run them twice.')
  expect(p).toContain('  opus')
  expect(p).toContain('  tdd')
  expect(p).toContain('  Run them twice.')
  expect(p).toContain('  .symcc/roles/tester.md')
  // no key line at the bottom: the header's buttons press the keys
  expect(panelKeys(f, 'role:tester', 'settings')).toEqual([])
  expect(page.lines.flat().find(x => x.text === '[Turn on]')?.hit).toEqual({ key: 'o' })
  expect(page.lines.flat().find(x => x.text === '[Reset to built-in]')?.hit).toEqual({ key: 'r' })
  // general can't be turned off; the checker role says the checker setting runs it; a broken one can only be fixed
  expect(panelKeys(f, 'role:general', 'settings')).toEqual([])
  expect(panelLines(f, { tab: 'settings', opened: 'role:checker', cursor: 0 }, NOW, 200).lines.map(lineText).some(x => x.includes('the checker setting runs it (Settings → checker, now on)'))).toBe(true)
  expect(panelLines(f, { tab: 'settings', opened: 'role:oops', cursor: 0 }, NOW, 140).lines.map(lineText)).toContain('Fix the file by hand: .symcc/roles/oops.md.')
  // the Kinds page and a kind's page
  const kinds = panelLines(f, { tab: 'settings', opened: 'kinds', cursor: 0 }, NOW, 140)
  expect(kinds.ids).toEqual(['kind:change', 'kind:bug'])
  const bug = panelLines(f, { tab: 'settings', opened: 'kind:bug', cursor: 0 }, NOW, 140).lines.map(lineText)
  expect(bug).toContain('bug · replaced')
  expect(bug).toContain('Body')
  expect(bug).toContain('  Fix it, with a test.')
  expect(panelKeys(f, 'kind:bug', 'settings').map(k => k.word)).toEqual(['edit', 'turn off', 'reset to built-in', 'back'])
  expect(panelKeys(f, 'kind:change', 'settings').map(k => k.word)).toEqual(['edit', 'back'])
  // a role that left the view has no page
  expect(panelKeys(f, 'role:gone', 'settings').map(k => k.word)).toEqual(['change', 'move', 'views', 'back'])
  // the actions as slash commands
  expect(actionCommand({ kind: 'def', def: 'role', name: 'tester', action: 'on' })).toEqual({ name: 'symcc-settings', text: 'role tester on' })
  expect(actionCommand({ kind: 'def', def: 'kind', name: 'bug', action: 'reset' })).toEqual({ name: 'symcc-settings', text: 'type bug reset' })
  expect(actionCommand({ kind: 'scout-edit', scout: 'deps', field: 'every', value: ' 15 ' })).toEqual({ name: 'symcc-scout', text: 'deps every 15' })
  expect(actionCommand({ kind: 'scout-edit', scout: 'deps', field: 'model', value: '' })).toEqual({ name: 'symcc-scout', text: 'deps model none' })
})

test('T-562: startTui: Settings opens Roles, a role\'s page turns it on and resets it; Kinds and a kind\'s page turn it off; e on a scout\'s page edits it with /symcc-scout', async () => {
  const f = defsViewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const answers = { prompt: [] as (string | undefined)[], select: [] as unknown[] }
  const toasts: string[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 140, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: o => void toasts.push(o.message) },
      dialog: { prompt: async () => answers.prompt.shift(), select: async <V,>() => answers.select.shift() as V | undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 142, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  const clickRow = (has: string) => (rowEls(panel).find(r => r.text.includes(has))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  await board.press('c', 'ses_1')
  // a click on the Workers heading opens it; a click on the Roles row opens the Roles page; down twice and Enter opens tester
  clickRow('▸ Workers')
  clickRow('4 roles')
  expect(board.state().opened).toBe('roles')
  expect(lines().some(l => l.includes('tester') && l.includes('off'))).toBe(true)
  await board.press('down', 'ses_1')
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('role:tester')
  expect(lines()).toContain('  Run them twice.')
  await board.press('o', 'ses_1')
  // T-871: r asks first; Cancel sends nothing, Yes resets
  answers.select.push('no')
  await board.press('r', 'ses_1')
  answers.select.push('yes')
  await board.press('r', 'ses_1')
  // b: back to the Roles page, then to the Settings list
  await board.press('back', 'ses_1')
  expect(board.state().opened).toBe('roles')
  await board.press('back', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['settings', ''])
  // general can't be turned off: o does nothing on its page
  clickRow('4 roles')
  clickRow('Any task')
  expect(board.state().opened).toBe('role:general')
  await board.press('o', 'ses_1')
  // Enter on the Kinds row (the cursor goes there), then bug, o turns it off
  await board.press('back', 'ses_1')
  await board.press('back', 'ses_1')
  // the cursor is still on the Roles row: one down is Kinds
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('kinds')
  clickRow('A bug to fix')
  expect(board.state().opened).toBe('kind:bug')
  await board.press('o', 'ses_1')
  // a scout's page: e asks what to change, then the new value; a bad number is not sent
  await board.press('s', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('deps')
  answers.select.push('every', 'model', 'prompt', 'every')
  answers.prompt.push('15', 'none', 'Check the lock file too.', 'often')
  for (let i = 0; i < 4; i++) await board.press('e', 'ses_1')
  expect(toasts.some(t => t.includes('whole number'))).toBe(true)
  // T-862: e on a scout's page can pick the scout's own findings choice
  answers.select.push('findings', 'backlog')
  await board.press('e', 'ses_1')
  // T-912: f moves its findings choice on (deps has none in the view file: board default → auto)
  await board.press('f', 'ses_1')
  expect(sent).toEqual([
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'role tester on' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'role tester reset' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'type bug off' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'deps every 15' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'deps model none' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'deps prompt Check the lock file too.' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'deps findings backlog' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'deps findings auto' },
  ])
  board.stop()
})

test('T-912: OpenCode shows the board default on the Scouts list, each scout\'s findings choice in its row and a Findings line on its page', () => {
  const f = scoutsViewFile()
  const withFindings = (board: 'auto' | 'backlog', deps?: 'auto' | 'backlog') => ({ ...f, view: { ...f.view, scout_findings: board, scouts: f.view.scouts!.map(s => (s.name === 'deps' && deps ? { ...s, findings: deps } : s)) } })
  const list = (v: ViewFile) => panelLines(v, { tab: 'scouts', opened: '', cursor: 0 }, NOW, 120).lines.map(lineText)
  const page = (v: ViewFile) => panelLines(v, { tab: 'scouts', opened: 'deps', cursor: 0 }, NOW, 120).lines.map(lineText)
  expect(list(withFindings('auto'))).toContain('  scout findings by default: auto')
  expect(list(withFindings('backlog'))).toContain('  scout findings by default: backlog')
  expect(list(withFindings('auto', 'backlog')).find(l => l.includes('deps'))).toContain('→ backlog')
  expect(list(withFindings('auto', 'auto')).find(l => l.includes('deps'))).toContain('→ todo (auto)')
  expect(list(withFindings('auto')).find(l => l.includes('deps'))).toContain('board: auto')
  expect(list(withFindings('backlog')).find(l => l.includes('docs-check'))).toContain('board: backlog')
  expect(page(withFindings('auto', 'auto'))).toContain('Findings: auto: the lead decides; bugs usually go to todo  (f changes it)')
  expect(page(withFindings('auto', 'backlog'))).toContain('Findings: backlog: every task from this scout waits in the backlog  (f changes it)')
  expect(page(withFindings('auto'))).toContain('Findings: board default: follows the board setting (now auto)  (f changes it)')
  expect(page(withFindings('backlog'))).toContain('Findings: board default: follows the board setting (now backlog)  (f changes it)')
  // the old "findings →" in the header's state is gone (the Findings line says it)
  expect(page(withFindings('auto', 'backlog')).some(l => l.includes('findings →'))).toBe(false)
  // a click on the Findings line presses f
  const drawn = panelLines(withFindings('auto'), { tab: 'scouts', opened: 'deps', cursor: 0 }, NOW, 120)
  const at = drawn.lines.findIndex(l => lineText(l).startsWith('Findings: '))
  expect(drawn.hits[at]).toEqual({ key: 'f' })
  expect(actionCommand({ kind: 'scout-edit', scout: 'deps', field: 'findings', value: 'default' })).toEqual({ name: 'symcc-scout', text: 'deps findings default' })
})

test('T-574: OpenCode\'s task page shows local times with the shared when, and the role and kind info from view.json', () => {
  const f = defsViewFile()
  const tasks = f.view.tasks.map(t => (t.id === 'T-4' ? { ...t, role: 'tester', kind: 'bug' } : t))
  const page = panelLines({ ...f, view: { ...f.view, tasks } }, { opened: 'T-4', cursor: 0 }, NOW, 200).lines.map(lineText).join('\n')
  // the same local text Claude Code's page shows, not the UTC slice of the ISO time
  expect(page).toContain(`Added:    ${when(AT)}`)
  expect(page).not.toContain('2026-11-19 11:00')
  // the owner's tester role (its description and model) and bug kind (its description)
  expect(page).toContain('tester — My tester · model opus')
  expect(page).toContain('bug — A bug to fix')
})

test('T-722: OpenCode\'s list rows tag only the kind ("[docs]", "[bug]"), never the role; a plain change shows no tag; the page keeps the role', () => {
  const f = defsViewFile()
  const tasks = f.view.tasks.map(t =>
    t.id === 'T-1' ? { ...t, kind: 'docs', role: 'docs' } : t.id === 'T-4' ? { ...t, kind: 'bug', role: 'tester' } : t.id === 'T-2' ? { ...t, status: 'todo' as const, role: 'tester' } : t,
  )
  const g = { ...f, view: { ...f.view, tasks } }
  const list = panelLines(g, { opened: '', cursor: 0 }, NOW, 200).lines.map(lineText)
  const row = (title: string) => list.find(l => l.includes(title)) ?? ''
  expect(row('a change in src')).toMatch(/\[docs\]\s*$/)
  expect(row('a change in src').includes('docs ·')).toBe(false)
  expect(row('a later one')).toMatch(/\[bug\]\s*$/)
  expect(row('a later one').includes('tester')).toBe(false)
  expect(row('a reviewed change').includes('tester')).toBe(false)
  expect(row('a reviewed change').includes('[')).toBe(false)
  const page = panelLines(g, { opened: 'T-4', cursor: 0 }, NOW, 200).lines.map(lineText).join('\n')
  expect(page).toContain('tester — My tester · model opus')
})

test('T-583: on a waiting task\'s and a question\'s page each choice is a clickable line; a click or its number key sends /symcc-answer, the page says it was sent; a right click does nothing', async () => {
  const f0 = viewFile()
  // T-3 asks a question with options, T-1 is over its time, T-4 asks for files; Q-3 is the owner's question
  const tasks = f0.view.tasks.map(t =>
    t.id === 'T-1' ? { ...t, live: { time_ask: AT }, note: 'time is up' } : t.id === 'T-4' ? { ...t, status: 'waiting' as const, ask: { by: 'symcc' as const, text: 'May I change docs/?', files: ['docs/'], asked_at: AT } } : t,
  )
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks, questions: [{ id: 'Q-3', by: 'lead' as const, text: 'How often?', options: ['Once a day', 'Once a week'], asked_at: AT }] } }
  const page = (id: string) => panelLines(f, { opened: id, cursor: 0 }, NOW, 100)
  // the choices are numbered lines, each with its click
  const d = page('Q-3')
  const at = d.lines.map(lineText).indexOf('  1. Once a day')
  expect(at).toBeGreaterThan(0)
  expect(d.hits[at]).toEqual({ choice: 1 })
  expect(d.lines.map(lineText)).toContain(`  3. ${OWN_ANSWER}`)
  expect(page('T-4').lines.map(lineText)).toContain("  2. Don't allow")
  // T-651: a long choice wraps under its text inside the width, and a click on any of its lines picks it
  const long = { ...f, view: { ...f.view, questions: [{ id: 'Q-4', by: 'lead' as const, text: 'Cap?', options: ["Invalid: doctor and run reject it (scout's suggestion)", 'Unlimited: run until another cap stops it'], asked_at: AT }] } }
  const narrow = panelLines(long, { opened: 'Q-4', cursor: 0 }, NOW, 40)
  const first = narrow.lines.map(lineText).indexOf('  1. Invalid: doctor and run reject it')
  expect(first).toBeGreaterThan(0)
  expect(narrow.lines.map(lineText).slice(first, first + 4)).toEqual(['  1. Invalid: doctor and run reject it', "     (scout's suggestion)", '  2. Unlimited: run until another cap', '     stops it'])
  expect(narrow.hits.slice(first, first + 4)).toEqual([{ choice: 1 }, { choice: 1 }, { choice: 2 }, { choice: 2 }])
  expect(narrow.lines.map(lineText).every(l => l.length <= 40)).toBe(true)
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const answers = { prompt: 'every hour' as string | undefined }
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => answers.prompt, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: true, close: () => undefined, focus: () => undefined } as never) as El
  const settle = () => new Promise<void>(res => setTimeout(res, 0))
  const clickChoice = async (text: string, button = 0) => {
    const r = rowEls(panel).find(x => x.text === text)!
    expect(typeof r.el.props.onMouseUp).toBe('function')
    ;(r.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button, stopPropagation: () => undefined })
    await settle()
  }
  const openPage = async (id: string) => {
    const r = rowEls(panel).find(x => x.text.includes(`${id} `))!
    ;(r.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
    await settle()
    expect(board.state().opened).toBe(id)
  }
  const back = () => board.press('back', 'ses_1')
  // Q-3: a right click does nothing; a left click on a choice answers it; the page says it was sent
  await openPage('Q-3')
  await clickChoice('  2. Once a week', 2)
  expect(sent).toEqual([])
  await clickChoice('  2. Once a week')
  expect(rowEls(panel).some(r => r.text.includes('answer sent: Once a week'))).toBe(true)
  // the number key does the same; "Answer…" asks for a typed answer
  await board.press('1', 'ses_1')
  await board.press('3', 'ses_1')
  // a number past the choices does nothing
  await board.press('9', 'ses_1')
  await back()
  // T-3: its own options
  await openPage('T-3')
  expect(rowEls(panel).some(r => r.text.includes('answer sent'))).toBe(false)
  await clickChoice('  1. mysql')
  await board.press('2', 'ses_1')
  await back()
  // T-1: more time
  await openPage('T-1')
  await clickChoice('  2. +60 min')
  await board.press('3', 'ses_1')
  await back()
  // T-4: Allow / Don't allow files
  await openPage('T-4')
  await clickChoice('  1. Allow')
  await board.press('2', 'ses_1')
  // a typed answer left empty sends nothing
  answers.prompt = ''
  await clickChoice(`  3. ${OWN_ANSWER}`)
  expect(sent.map(x => `${x.name} ${x.text}`)).toEqual([
    'symcc-answer Q-3 Once a week',
    'symcc-answer Q-3 Once a day',
    'symcc-answer Q-3 every hour',
    'symcc-answer T-3 mysql',
    'symcc-answer T-3 postgres',
    'symcc-answer T-1 +60 min',
    'symcc-answer T-1 Stop it',
    'symcc-answer T-4 Allow',
    "symcc-answer T-4 Don't allow",
  ])
  // on the list a number key does nothing
  await back()
  await board.press('1', 'ses_1')
  expect(sent.length).toBe(9)
  board.stop()
})

test('T-585: the Settings tab\'s groups open and close like the Claude Code board\'s: all closed at first, each "▸ title · summary"; Enter or a click opens one ("▾ title" and its rows); a closed group\'s rows are not in the cursor list; closing a group cancels its open pick list', async () => {
  const f = viewFile()
  // the start state: every group closed, as the Claude Code board's S.settingsOpen
  expect(SETTINGS_OPEN).toEqual([])
  const closed = panelLines(f, { tab: 'settings', opened: '', cursor: 0 }, NOW, 140)
  const c = closed.lines.map(lineText)
  const pages = { roles: '0 roles', kinds: '0 task types' }
  for (const g of SETTING_GROUPS) {
    const sum = groupSummaryParts(g, f.view, 136, pages)
    expect(c.some(l => l.endsWith(`▸ ${sum.title}${sum.values}`))).toBe(true)
  }
  expect(c.find(l => l.includes('▸ Work'))).toContain('auto')
  expect(closed.ids).toEqual(SETTING_GROUPS.map(g => `settings-group:${g.title}`))
  expect(c.some(l => l.includes('max_parallel'))).toBe(false)
  expect(closed.hits[c.findIndex(l => l.includes('▸ Work'))]).toEqual({ settingGroup: 'Work' })
  // startTui: Enter on a heading and a click on one open and close it
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  let answerPick: (v: unknown) => void = () => undefined
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 140, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: <V,>() => new Promise<V | undefined>(res => (answerPick = res as (v: unknown) => void)) },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 142, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  const clickRow = (has: string) => (rowEls(panel).find(r => r.text.includes(has))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  await board.press('c', 'ses_1')
  expect(board.state().settingsOpen).toEqual([])
  await board.press('open', 'ses_1')
  expect(board.state().settingsOpen).toEqual(['Work'])
  expect(lines().some(l => l.includes('▾ Work'))).toBe(true)
  expect(lines().some(l => l.includes('max_parallel'))).toBe(true)
  await board.press('open', 'ses_1')
  expect(board.state().settingsOpen).toEqual([])
  expect(lines().some(l => l.includes('max_parallel'))).toBe(false)
  // a click on Scouts opens it and puts the cursor on its heading
  clickRow('▸ Scouts')
  expect(board.state().settingsOpen).toEqual(['Scouts'])
  expect(board.state().cursor).toBe(3)
  clickRow('▾ Scouts')
  expect(board.state().settingsOpen).toEqual([])
  // Enter on mode opens its pick list; closing Work meanwhile cancels it: the pick is not sent
  clickRow('▸ Work')
  await board.press('down', 'ses_1')
  const asked = board.press('open', 'ses_1')
  clickRow('▾ Work')
  answerPick('review')
  await asked
  expect(sent).toEqual([])
  board.stop()
})

/** T-580: the view file with T-2 in review (two tries, a history, its changed files in view.json) and T-4 failed. */
function sectionsViewFile(): ViewFile {
  const f = viewFile()
  const runs = (id: string) => [1, 2].map(n => ({ started: AT, ended: AT, report: `.symcc/reports/${id}-try-${n}.md` }))
  const history = [{ kind: 'tried', at: AT, text: 'try 1: changed it → tests failed' }, { kind: 'merged', at: AT, text: 'try 2: fixed it → passed' }]
  const tasks = f.view.tasks.map(t =>
    t.id === 'T-2' ? { ...t, details: '## Goal\n- Fix `src/a.ts`', attempts: 2, runs: runs('T-2'), history } : t.id === 'T-4' ? { ...t, status: 'failed' as const, note: 'tests failed', attempts: 2, runs: runs('T-4'), history } : t,
  ) as ViewFile['view']['tasks']
  return { ...f, view: { ...f.view, tasks, changes: { 'T-2': { files: [{ file: 'src/a.ts', added: 4, removed: 2 }], error: '' } } } }
}

test('T-580: OpenCode\'s task page has the same sections as Claude Code\'s (core\'s taskSections): their ▍headings and lines, in order', () => {
  const f = sectionsViewFile()
  expect(parseViewFile(viewFileText(f))?.view.changes).toEqual(f.view.changes)
  const page = (id: string, report?: { file: string; text: string | null | undefined }) => panelLines(f, { opened: id, cursor: 0, ...(report ? { taskReport: report } : {}) }, NOW, 100)
  const heads = (id: string) => page(id).lines.map(lineText).filter(l => l.startsWith('▍'))
  expect(heads('T-2')).toEqual(['▍Details', '▍Changes (1 file, against main)', '▍What to do', '▍History (2, newest first)', '▍Report (try 2, 2 of 2)', '▍Runs   2 tries · 0s'])
  expect(heads('T-4')).toEqual(['▍Why it failed', '▍Details', '▍What to do', '▍History (2, newest first)', '▍Report (try 2, 2 of 2)', '▍Runs   2 tries · 0s'])
  expect(heads('T-5')).toEqual(['▍Details', '▍What to do', '▍History (1, newest first)'])
  // each section's lines are the shared model's, in order
  const report = { file: '.symcc/reports/T-2-try-2.md', text: 'Fixed it.\n\nAll tests pass.' }
  const t2 = f.view.tasks.find(t => t.id === 'T-2')!
  const lines = page('T-2', report).lines.map(lineText)
  const model = taskSections(t2, { width: 100, nowMs: NOW, detail: { roles: [], all: f.view.tasks, when }, texts: { [report.file]: report.text }, changes: f.view.changes!['T-2']!, target: 'main', dataDir: '.symcc', changesHint: '  d (or a click on a file) shows the changes' })
  for (const s of model) {
    const at = lines.indexOf(`▍${s.title}`)
    expect(at).toBeGreaterThan(0)
    expect(lines.slice(at + 1, at + 1 + s.lines.length)).toEqual(s.lines.map(l => (l.segs.length ? l.segs.map(g => g.text).join('') : ' ')))
  }
  expect(lines).toContain('  Fixed it.')
  expect(lines).toContain('  folder: .symcc/worktrees/T-2 · edit files there, then approve (the tests run again)')
  expect(lines).toContain('• Fix src/a.ts')
  // the hint under the files says what this page does (Enter does nothing on an open task page here)
  expect(lines).toContain('  d (or a click on a file) shows the changes')
  expect(lines.some(l => l.includes('Enter on a file'))).toBe(false)
  // a changed file's line: a click shows the changes (the d key)
  const d = page('T-2')
  expect(d.hits[d.lines.map(lineText).findIndex(l => l.startsWith('src/a.ts'))]).toEqual({ key: 'd' })
  // the report not read yet, or unreadable
  expect(page('T-2', { file: report.file, text: undefined }).lines.map(lineText)).toContain('  (reading the report…)')
  expect(page('T-2', { file: report.file, text: null }).lines.map(lineText)).toContain('  Could not read the report file.')
  // a long report is cut, saying how many lines are left
  const long = page('T-2', { file: report.file, text: Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n') }).lines.map(lineText)
  expect(long).toContain('  line 39')
  expect(long).not.toContain('  line 41')
  expect(long).toContain('  … (21 more lines)')
  // a failed task's why, and its next step
  const t4 = page('T-4').lines.map(lineText)
  expect(t4[t4.indexOf('▍Why it failed') + 1]).toMatch(/^ {2}\S/)
  expect(t4.some(l => l.startsWith('  Next: '))).toBe(true)
})

test('T-580: opening a task\'s page in the TUI reads its latest report from its file and shows it under ▍Report', async () => {
  const f = sectionsViewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)], ['/work/proj/.symcc/reports/T-2-try-2.md', 'The second try worked.']])
  const read: string[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => (read.push(p), files.get(p) ?? Promise.reject(new Error('missing'))), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: true, close: () => undefined, focus: () => undefined } as never)
  const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 100).ids
  for (let i = 0; i < ids.indexOf('T-2'); i++) await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('T-2')
  await new Promise<void>(res => setTimeout(res, 0))
  expect(shown(panel)).toContain('  The second try worked.')
  // read once, not again on each refresh
  await board.refresh()
  expect(read.filter(p => p.endsWith('T-2-try-2.md')).length).toBe(1)
  board.stop()
})

test('T-596: an approved task in review whose approve runs leaves NEEDS YOU: listed and counted with the running tasks, with its step icon and time; its page badge names the step; a failed approve puts it back', () => {
  const f0 = viewFile()
  const fresh = new Date(NOW - 10_000).toISOString()
  const runs = [{ started: new Date(NOW - 20 * 60_000).toISOString(), ended: new Date(NOW - 5 * 60_000).toISOString() }]
  const withT2 = (extra: object) => ({ ...f0, view: { ...f0.view, tasks: f0.view.tasks.map(t => (t.id === 'T-2' ? { ...t, runs, ...extra } : t)) } })
  const list = (f: ViewFile) => panelLines(f, { opened: '', cursor: 0 }, NOW, 120).lines.map(lineText)
  const needsBlock = (lines: string[]) => {
    const at = lines.findIndex(l => l.trim() === 'NEEDS YOU')
    if (at < 0) return [] as string[]
    const end = lines.findIndex((l, i) => i > at && !l.trim())
    return lines.slice(at + 1, end < 0 ? undefined : end)
  }
  const cases = [
    [{ live: { checking: { step: 'prep', at: fresh } }, }, '✎', '✎ prep', '1 in prep'],
    [{ live: { checking: { step: 'queue', place: 2, at: fresh } }, note: 'queue (2)' }, '⧗', '⧗ queue (2)', '1 in queue'],
    [{ live: { checking: { step: 'testing', at: fresh } }, }, '⊛', '⊛ test', '1 testing'],
    [{ live: { checking: { step: 'merging', at: fresh } }, }, '⇢', '⇢ merge', '1 merging'],
  ] as const
  for (const [extra, icon, badge, crew] of cases) {
    const f = withT2(extra)
    const lines = list(f)
    expect(needsBlock(lines).some(l => /T-2 /.test(l))).toBe(false)
    expect(lines.find(l => /\bT-2 /.test(l))).toMatch(new RegExp(`T-2 +${icon} 15m`))
    const band = bandLines(f, NOW, 200, 20).map(lineText)
    expect(band[0]).toContain('2 doing')
    // T-646: the band names the step it is at
    expect(band[0]).toContain(crew)
    expect(band[0]).not.toContain('review')
    expect(band.find(l => l.startsWith('T-2'))).toMatch(new RegExp(`T-2 +${icon} 15m`))
    const page = panelLines(f, { opened: 'T-2', cursor: 0 }, NOW, 140).lines.map(lineText).join('\n')
    // no badge under the title (T-693): the Steps row names the step
    expect(page).not.toContain(`[${badge}`)
    expect(page).toMatch(new RegExp(`Steps:.*● ${badge.split(' ')[1]}`))
    expect(page).not.toContain('ready for review')
  }
  // no approve running (or it ended, failed: its step is cleared, or its mark went stale): back under NEEDS YOU
  for (const extra of [{}, { live: { checking: { step: 'testing', at: new Date(NOW - 3_600_000).toISOString() } }, }]) {
    const f = withT2(extra)
    expect(needsBlock(list(f)).some(l => /T-2 /.test(l))).toBe(true)
    expect(bandLines(f, NOW, 200, 20).map(lineText)[0]).toContain('1 ready for review')
  }
})

test('T-614: right after the panel sends an approve, the page badge and the Stage line say prep, the Status row doing (T-647); the board takes over once a step shows', () => {
  const f0 = viewFile()
  const runs = [{ started: new Date(NOW - 20 * 60_000).toISOString(), ended: new Date(NOW - 5 * 60_000).toISOString() }]
  const withT2 = (extra: object) => ({ ...f0, view: { ...f0.view, tasks: f0.view.tasks.map(t => (t.id === 'T-2' ? { ...t, runs, ...extra } : t)) } })
  const page = (f: ViewFile, approving?: { id: string; at: number }) => panelLines(f, { opened: 'T-2', cursor: 0, ...(approving ? { approving } : {}) }, NOW, 140).lines.map(lineText)
  const sent = { id: 'T-2', at: NOW - 1000 }
  const f = withT2({})
  const lines = page(f, sent)
  // the page itself (the banner above counts the board's statuses)
  const all = lines.slice(lines.indexOf('T-2  a reviewed change')).join('\n')
  expect(all).not.toContain('ready for review')
  expect(lines).not.toContain('[✎ prep]')
  // the header's state line (T-751)
  expect(lines[2]).toMatch(/^▶ doing · prep/)
  expect(all).toMatch(/Steps:[\s\S]*review ✓[\s\S]*● prep[\s\S]*merge/)
  expect(approveSent(f, sent, NOW)).toBe(true)
  // without it, or for another task, or once too old: still ready for review everywhere
  for (const a of [undefined, { id: 'T-1', at: NOW }, { id: 'T-2', at: NOW - APPROVE_SENT_MS }]) {
    const ls = page(f, a)
    expect(ls).not.toContain('[◆ ready for review]')
    expect(ls[2]).toContain('ready for review')
    expect(ls.join('\n')).toMatch(/● review/)
  }
  // a step on the board: the board carries the phase (the panel drops its flag)
  const testing = withT2({ live: { checking: { step: 'testing', at: new Date(NOW - 10_000).toISOString() } }, })
  expect(approveSent(testing, sent, NOW)).toBe(false)
  expect(page(testing, sent).find(l => l.trim().startsWith('Steps:'))).toContain('● test')
  // the task left review (merged): no flag either
  expect(approveSent(withT2({ status: 'done' }), sent, NOW)).toBe(false)
})

test('T-615: the band ends each row with the same text as Claude Code\'s band and the lead\'s board (rowEndText)', () => {
  const b = rowEndBoard()
  const view: PaneView = { tasks: b.tasks, working: [], scouts: [], mode: 'auto', test_commands: [] }
  const lines = bandLines({ root: '/work/proj', home: '/work', name: 'symcc', version: '', written_at: ROW_END_NOW, view }, ROW_END_NOW, 400, 10).map(lineText)
  for (const [id, end] of Object.entries(ROW_END)) expect([id, lines.find(l => l.startsWith(`${id} `))!.endsWith(` — ${end}`)]).toEqual([id, true])
})

test('T-615: while a task\'s approve is in progress its page offers no approve or reject (as the terminal\'s), from the press until the approve ends', () => {
  const f = viewFile()
  const keys = (g: ViewFile, approving?: { id: string; at: number }, now = NOW) => panelLines(g, { opened: 'T-2', cursor: 0, ...(approving ? { approving } : {}) }, now, 100).keys.map(k => k.word)
  expect(keys(f)).toContain('approve')
  // just pressed: approveSent
  expect(keys(f, { id: 'T-2', at: NOW })).toEqual(['show changes', 'needs review', 'prev/next', 'back'])
  // its first step is on the board: the phase says approved
  const running = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-2' ? { ...t, live: { checking: { step: 'testing' as const, at: new Date(NOW - 5_000).toISOString() } }, } : t)) } }
  expect(keys(running)).toEqual(['show changes', 'needs review', 'prev/next', 'back'])
  // an approve sent for another task, or one long gone, leaves them
  expect(keys(f, { id: 'T-3', at: NOW })).toContain('approve')
  expect(keys(f, { id: 'T-2', at: NOW - APPROVE_SENT_MS - 1 })).toContain('approve')
})

// ---------------- T-619, T-687: the Organizational memory page, opened from the bottom of the Live tab ----------------

/** The roles-and-kinds view file with three org-mem notes (newest first, as view.ts writes them). */
function orgMemViewFile(text = `- 2026-11-18: run one test file\n- written by hand\n- 2026-11-20: the type check is separate\n`): ViewFile {
  const f = defsViewFile()
  return { ...f, view: { ...f.view, org_mem: orgMemNotes(text) } }
}

test('T-619, T-687: the Settings tab has no org-mem row; the Live tab ends with the Organizational memory section (count, "newest [all]"; T-866: no key hint line, no m key) just above the footer; its page lists the notes newest first with their date; an empty one says "No notes yet."', () => {
  const f = orgMemViewFile()
  // the notes ride in the view file
  expect(parseViewFile(viewFileText(f))!.view.org_mem).toEqual(f.view.org_mem)
  expect(parseViewFile(viewFileText({ ...f, view: { ...f.view, org_mem: 'x' as never } }))!.view.org_mem).toBe(undefined)
  // Settings: no org-mem row, open or closed, and no org-mem page there
  const settings = panelLines(f, { tab: 'settings', opened: '', cursor: 0, settingsOpen: ['Workers'] }, NOW, 140)
  expect(settings.lines.map(lineText).some(l => /Org-mem|org-mem|notes/.test(l))).toBe(false)
  expect(settings.ids).not.toContain('orgmem')
  expect(panelLines(f, { tab: 'settings', opened: '', cursor: 0 }, NOW, 200).lines.map(lineText).find(l => l.includes('Workers'))).not.toContain('org-mem')
  expect(hasPage(f, 'orgmem', 'settings')).toBe(false)
  // the Live tab (T-718): the org-mem section ends the body, right above the footer
  const live = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, 140)
  const ll = live.lines.map(lineText)
  const head = ll.findIndex(l => l.startsWith('─── ❯ ORGANIZATIONAL MEMORY'))
  expect(ll[head]).toContain('3 / 60')
  // T-866: no key hint line ("↑↓ move · Enter open topic · m all notes") and no m key; "[all]" next to "newest" opens all notes
  expect(ll.some(l => l.includes('Enter open topic') || l.includes('m all notes'))).toBe(false)
  expect(panelKeys(f, '', 'live').map(k => `${k.key} ${k.word}`)).not.toContain('m org-mem')
  expect(panelKeys(f, '', 'live').some(k => k.key === 'm')).toBe(false)
  const newestRow = ll.findIndex(l => l.endsWith('newest [all]'))
  expect(newestRow).toBe(head + 2)
  expect(live.lines[newestRow]!.find(x => x.text === '[all]')?.hit).toEqual({ open: 'om-all' })
  expect(live.ids.filter(x => x.startsWith('om-'))[0]).toBe('om-all')
  expect(hasPage(f, 'orgmem', 'live')).toBe(true)
  // the page: title, what it is, the notes newest first (number, task id, date, then the text)
  const page = panelLines(f, { tab: 'live', opened: 'orgmem', cursor: 0 }, NOW, 140)
  const p = page.lines.map(lineText)
  expect(p).toContain('Organizational memory (org-mem)')
  expect(p.join(' ')).toContain('.symcc/org-mem.md (at most 60 lines)')
  expect(page.ids).toEqual(['note:3', 'note:2', 'note:1'])
  const at = (x: string) => p.findIndex(l => l.includes(x))
  expect(p[at('#3')]).toBe('› #3 · 2026-11-20')
  expect(p[at('#3') + 1]).toBe('    the type check is separate')
  expect(p[at('#2')]).toBe('  #2 · written by hand')
  expect(p[at('#1')]).toBe('  #1 · 2026-11-18')
  expect(at('#2')).toBeGreaterThan(at('#3'))
  expect(at('#1')).toBeGreaterThan(at('#2'))
  expect(panelKeys(f, 'orgmem', 'live').map(k => k.word)).toEqual(['move', 'delete', 'back'])
  // no notes
  const empty = orgMemViewFile('')
  expect(panelLines(empty, { tab: 'live', opened: '', cursor: 0 }, NOW, 140).lines.map(lineText)).toContain(`${LIVE_INDENT}  No notes yet.`)
  expect(panelLines(empty, { tab: 'live', opened: '', cursor: 0 }, NOW, 140).lines.map(lineText).find(l => l.startsWith('─── ❯ ORGANIZATIONAL MEMORY'))).toContain('0 / 60')
  expect(panelLines(empty, { tab: 'live', opened: 'orgmem', cursor: 0 }, NOW, 140).lines.map(lineText)).toContain('  No notes yet.')
  expect(panelKeys(empty, 'orgmem', 'live').map(k => k.word)).toEqual(['back'])
  // the delete as a slash command
  expect(actionCommand({ kind: 'orgmem-delete', n: 3 })).toEqual({ name: 'symcc-settings', text: 'orgmem delete 3' })
  expect(actionCommand({ kind: 'orgmem-delete', n: 3, key: 'a1b2c3' })).toEqual({ name: 'symcc-settings', text: 'orgmem delete 3 a1b2c3' })
})

test('T-619, T-687: startTui: the Live tab\'s "[all]" button (T-866: not m) opens the page; x on a note asks, Yes sends /symcc-settings orgmem delete N, Cancel sends nothing; b returns to the Live tab', async () => {
  const f = orgMemViewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const asked: string[] = []
  const answers = { select: [] as unknown[] }
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 140 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async <V,>(o: { title: string }) => (asked.push(o.title), answers.select.shift() as V | undefined) },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 142, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  const clickRow = (has: string) => (rowEls(panel).find(r => r.text.includes(has))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  // T-866: the key m on the Live tab no longer opens it; a click on the "[all]" next to "newest" does
  await board.press('l', 'ses_1')
  await board.press('m', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['live', ''])
  const seg = rowEls(panel).flatMap(r => r.segs).find(x => x.kids?.join('') === '[all]')
  ;(seg!.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
  expect([board.state().tab, board.state().opened]).toEqual(['live', 'orgmem'])
  expect(lines().some(l => l.includes('#3 · 2026-11-20'))).toBe(true)
  // x on the newest note, Cancel: nothing sent; down, x, Yes: note 2 is deleted
  answers.select.push('no', 'yes')
  await board.press('x', 'ses_1')
  await board.press('down', 'ses_1')
  await board.press('x', 'ses_1')
  expect(asked).toEqual(['Delete note #3 · 2026-11-20 from .symcc/org-mem.md?', 'Delete note #2 · written by hand from .symcc/org-mem.md?'])
  // the note's check word goes along, so a number that moved meanwhile deletes nothing
  expect(sent).toEqual([{ sessionID: 'ses_1', name: 'symcc-settings', text: `orgmem delete 2 ${orgMemNoteKey('written by hand')}` }])
  // b: back to the Live tab
  await board.press('back', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['live', ''])
  board.stop()
})

// ---------------- T-718: the Live tab's Organizational memory section ----------------

/** A sample org-mem file with topics, oldest first: newest are #8 (hand-written, unsorted), #7 (git), #6 (tests). */
const TOPIC_NOTES = [
  '- 2026-11-18 [tests] Run one test file with scripts/test-files.sh, never plain bun test here',
  '- 2026-11-19 [git] The guard refuses a new repo inside the project folder',
  '- 2026-11-19 [tests] Snapshot pictures are made again with snapshotEntry',
  '- 2026-11-20 [vs code · panel] VS Code keeps a Box key but drops a Text key, so wrap lines in Boxes',
  '- 2026-11-20 [opencode] OpenTUI boxes shrink unless they are given a fixed size',
  '- 2026-11-21 [tests] In tests, put dates relative to now, never a fixed date for windows',
  '- 2026-11-21 [git] Use a plain path for each scratch repository command',
  '- a note written by hand without a date',
].join('\n')

test('T-718: OpenCode: the Live tab\'s org-mem section draws the header, the 3 newest notes and the topic counts at 40 and 100 columns, nothing wider than the panel', () => {
  const f = orgMemViewFile(TOPIC_NOTES)
  for (const w of [40, 100]) {
    const d = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const ls = d.lines.map(lineText)
    for (const l of ls) expect([w, l, l.length <= w]).toEqual([w, l, true])
    // T-747: the "▍Organizational memory" heading with the count and bar on it, the lines under it indented
    const head = ls.findIndex(l => l.startsWith('─── ❯ ORGANIZATIONAL MEMORY   8 / 60 ─'))
    expect(head > 0).toBe(true)
    expect(textWidthOf(ls[head]!)).toBe(w)
    expect(ls[head + 1]!.trim()).toBe('')
    expect(ls[head + 2]).toMatch(/^[ ›] {2}newest \[all\]$/)
    expect(ls[head + 3]).toMatch(/^[ ›] {3}— +unsorted {2}a note written/)
    expect(ls[head + 4]).toMatch(/^ {4}11-21 {2}git +Use a plain path/)
    expect(ls[head + 5]).toMatch(/^ {4}11-21 {2}tests +In tests, put/)
    expect(ls[head + 6]).toBe('   topics')
    // T-819: the topic labels (newest rows and the grid) are in the info blue, not green; "unsorted" stays dim
    const colorOfText = (row: number, text: string) => d.lines[row]!.find(s => s.text.trim() === text)?.color
    expect(colorOfText(head + 4, 'git')).toBe('ide')
    expect(colorOfText(head + 5, 'tests')).toBe('ide')
    expect(colorOfText(head + 3, 'unsorted')).toBe('inactive')
    const gridEnd = ls.findIndex((l, i) => i >= head + 7 && !l.startsWith('    '))
    const gridSegs = d.lines.slice(head + 7, gridEnd).flat()
    expect(gridSegs.find(s => s.text.trim() === 'tests')?.color).toBe('ide')
    expect(gridSegs.find(s => s.text.trim() === 'unsorted')?.color).toBe('inactive')
    const grid = ls.slice(head + 7, gridEnd)
    expect(grid.join(' ')).toMatch(/tests +3/)
    expect(grid.join(' ')).toMatch(/git +2/)
    expect(grid.join(' ')).toMatch(/vs code · panel +1/)
    // unsorted last
    expect(grid.at(-1)).toMatch(/unsorted +1$/)
    if (w === 100) expect(grid.length).toBeLessThan(5)
    expect(d.ids.filter(x => x.startsWith('om-'))).toEqual(['om-all', 'om-note:8', 'om-note:7', 'om-note:6', 'om-topic:tests', 'om-topic:git', 'om-topic:opencode', 'om-topic:vs code · panel', 'om-topic:unsorted'])
  }
  // a topic's page: its title and only its notes, newest first
  const page = panelLines(f, { tab: 'live', opened: 'orgmem:tests', cursor: 0 }, NOW, 100)
  expect(page.lines.map(lineText)).toContain('Organizational memory · tests')
  expect(page.ids).toEqual(['note:6', 'note:3', 'note:1'])
  // T-790: the same header as the all-notes page, the topic in the title: "‹ [Live]" and "3 of 8", title, subtitle, [Delete], thin rule, ▍About
  const head = page.lines.map(lineText).slice(0, 6)
  expect([head[0], head[1], head[2], head[3], head[5]]).toEqual([`‹ [Live]${' '.repeat(100 - 8 - 6)}3 of 8`, 'Organizational memory · tests', 'Notes shared with workers, checkers and scouts', '[Delete]', '▍About'])
  expect(head[4]).toMatch(/^─+$/)
  expect(boardPageOf(f, { tab: 'live', opened: 'orgmem:tests' })).toBe('orgmem')
  expect(hasPage(f, 'orgmem:tests', 'live')).toBe(true)
})

test('T-718: startTui: Enter on a topic opens its notes\' page, b returns to the Live tab; x there deletes the right note; Enter on a newest note opens all notes on it', async () => {
  const f = orgMemViewFile(TOPIC_NOTES)
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const asked: string[] = []
  const answers = { select: [] as unknown[] }
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 100 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async <V,>(o: { title: string }) => (asked.push(o.title), answers.select.shift() as V | undefined) },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 102, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  await board.press('l', 'ses_1')
  // the lanes come first (the sample view has none in doing), then the newest notes, then the topics: tests is the 4th stop
  const ids = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, 100).ids
  for (let i = 0; i < ids.indexOf('om-topic:tests'); i++) await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['live', 'orgmem:tests'])
  expect(lines()).toContain('Organizational memory · tests')
  expect(lines().some(l => l.includes('#7 ·'))).toBe(false)
  // down to note 3, x, Yes: exactly note 3 is deleted (with its check word)
  answers.select.push('yes')
  await board.press('down', 'ses_1')
  await board.press('x', 'ses_1')
  expect(asked).toEqual(['Delete note #3 · 2026-11-19 from .symcc/org-mem.md?'])
  expect(sent).toEqual([{ sessionID: 'ses_1', name: 'symcc-settings', text: `orgmem delete 3 ${orgMemNoteKey('Snapshot pictures are made again with snapshotEntry')}` }])
  await board.press('back', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['live', ''])
  // a click on a topic's cell opens its page too
  const cell = rowEls(panel).flatMap(r => r.segs).find(x => /^[ ›]{3,4}git *$/.test(x.kids?.join('') ?? ''))
  ;(cell!.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
  expect(board.state().opened).toBe('orgmem:git')
  await board.press('back', 'ses_1')
  // Enter on the second newest note: all notes, the cursor on it
  for (let i = 0; i < ids.length; i++) await board.press('up', 'ses_1')
  for (let i = 0; i < ids.indexOf('om-note:7'); i++) await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('orgmem')
  expect(lines().some(l => l.startsWith('› #7 ·'))).toBe(true)
  // T-866: m no longer opens all notes; Enter on "[all]" (next to "newest") and a click on it do
  await board.press('back', 'ses_1')
  for (let i = 0; i < ids.length; i++) await board.press('up', 'ses_1')
  await board.press('m', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['live', ''])
  expect(lines().some(l => l.includes('Enter open topic'))).toBe(false)
  for (let i = 0; i < ids.indexOf('om-all'); i++) await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('orgmem')
  expect(lines()).toContain('Organizational memory (org-mem)')
  await board.press('back', 'ses_1')
  const allSeg = rowEls(panel).flatMap(r => r.segs).find(x => (x.kids?.join('') ?? '') === '[all]')
  ;(allSeg!.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
  expect(board.state().opened).toBe('orgmem')
  board.stop()
})

test("T-622/T-686: a scout's page shows its Results figures from view.json in their own section right before File, not in its header; a scout without them shows none", () => {
  const f = scoutsViewFile()
  const week = 'last 7 days: 1 task (1 merged, 0 dropped, 0 open) · 2k scout tokens · 5k per merged'
  const all = 'in all: 1 task (1 merged, 0 dropped, 0 open) · 2k scout tokens · 5k per merged'
  const withResults: ViewFile = { ...f, view: { ...f.view, scout_results: { 'docs-check': `${week}\n${all}` } } }
  expect(parseViewFile(viewFileText(withResults))).toEqual(withResults)
  const p = panelLines(withResults, { tab: 'scouts', opened: 'docs-check', cursor: 0 }, NOW, 400).lines.map(lineText).map(l => l.trim())
  const inst = p.indexOf('Instructions')
  const res = p.indexOf('Results')
  expect(inst > 0 && res > inst).toBe(true)
  // the header (before Instructions): no first line of the instructions (no summary is set), no figures
  expect(p.slice(0, inst).some(l => l.includes('Look for stale docs.') || l.includes('last 7 days') || l.includes('in all:'))).toBe(false)
  expect(p.slice(res, res + 5)).toEqual(['Results', week, all, '', 'File'])
  // its figures are indented like the other sections' bodies, also on the lines a narrow panel wraps them onto
  const raw = panelLines(withResults, { tab: 'scouts', opened: 'docs-check', cursor: 0 }, NOW, 400).lines.map(lineText)
  expect(raw.slice(raw.indexOf('Results') + 1, raw.indexOf('Results') + 3).map(l => l.trimEnd())).toEqual([`  ${week}`, `  ${all}`])
  const narrow = panelLines(withResults, { tab: 'scouts', opened: 'docs-check', cursor: 0 }, NOW, 40).lines.map(lineText)
  const body = narrow.slice(narrow.indexOf('Results') + 1, narrow.indexOf('File') - 1)
  expect(body.length > 2 && body.every(l => l.startsWith('  ') && l.trim() !== '' && l.length <= 40)).toBe(true)
  expect(panelLines(withResults, { tab: 'scouts', opened: 'deps', cursor: 0 }, NOW, 400).lines.map(lineText).some(l => l.trim() === 'Results' || l.includes('last 7 days'))).toBe(false)
  // a broken scout_results is dropped when read
  expect(parseViewFile(viewFileText({ ...f, view: { ...f.view, scout_results: [] as never } }))?.view.scout_results).toBe(undefined)
})

/** T-627: the view file with T-2 in review on a long page: a title that wraps, a long history with lines that wrap, and
 *  (with `report`) a long report; `entries` history lines. */
function longPageViewFile(entries = 24): ViewFile {
  const f = sectionsViewFile()
  const long = 'and then it went on to change a good many other things in the same folder, which takes more than one line'
  const history = Array.from({ length: entries }, (_, i) => ({ kind: 'step', at: AT, text: `step ${i + 1}: ${i % 3 ? 'short' : long}` }))
  const tasks = f.view.tasks.map(t => (t.id === 'T-2' ? { ...t, title: 'a reviewed change whose title is long enough to wrap onto a second line here', history } : t)) as ViewFile['view']['tasks']
  return { ...f, view: { ...f.view, tasks } }
}

const LONG_REPORT = { file: '.symcc/reports/T-2-try-2.md', text: Array.from({ length: 30 }, (_, i) => (i % 4 ? `report line ${i + 1}` : `report line ${i + 1} is a long one that says a lot about what was done, so it has to wrap in a narrow panel`)).join('\n') }

/** Checks one page at every scroll from 0 to past its end, `rows` high and `w` wide: the same fixed first lines (the
 *  banner, tabs, rule and the page's title), then a contiguous window of the body's drawn lines (no repeats, no gaps,
 *  nothing wider than the panel), blank rows only past the body's end, the footer last; and the last screenful full. */
function checkScrolling(draw: (scroll: number, rows?: number) => ReturnType<typeof panelLines>, rows: number, w: number, head: string[]) {
  const all = draw(0)
  const ft = all.footer
  for (const l of all.lines.slice(0, -1)) expect(lineText(l).length <= w).toBe(true)
  for (const l of all.lines) for (const s of l) expect(s.text).not.toContain('\n')
  // what stays at the top this high (a panel too low for the page's title lets the title scroll with the rest)
  const fixed = draw(0, rows).fixed
  expect(fixed <= all.fixed).toBe(true)
  const body = all.lines.slice(fixed, -ft).map(lineText)
  expect(body.length).toBe(all.bodyLines + all.fixed - fixed)
  const top = all.lines.slice(0, fixed).map(lineText)
  for (const h of head) expect(top).toContain(h)
  const room = rows - fixed - ft
  expect(body.length).toBeGreaterThan(room)
  const last = body.length - room
  const seen: string[] = []
  for (let s = 0; s <= last + 10; s++) {
    const d = draw(s, rows)
    const text = d.lines.map(lineText)
    expect(text.length).toBe(rows)
    expect(d.hits.length).toBe(rows)
    expect(d.fixed).toBe(fixed)
    expect(text.slice(0, d.fixed)).toEqual(top)
    expect(d.scroll).toBe(Math.min(s, last))
    // the window: exactly the body's drawn lines from the scroll on, as many as fit (the last screenful stays full)
    expect(text.slice(d.fixed, -ft)).toEqual(body.slice(d.scroll, d.scroll + room))
    expect(text.slice(-ft)).toEqual(all.lines.slice(-ft).map(lineText))
    if (s % room === 0 && s <= last) seen.push(...text.slice(d.fixed, -ft))
  }
  // screen after screen, the windows go over the whole body with no gap and no repeat
  const tail = draw(last, rows).lines.slice(fixed, -ft).map(lineText)
  const covered = [...seen, ...tail.slice(seen.length - last)]
  expect(covered).toEqual(body)
}

test('T-627: a long task page scrolls by drawn lines under its fixed title and buttons; the last screenful stays full', () => {
  const f = longPageViewFile()
  const w = 60
  const draw = (scroll: number, rows?: number) => panelLines(f, { opened: 'T-2', cursor: 0, scroll, taskReport: LONG_REPORT, ...(rows ? { rows } : {}) }, NOW, w)
  const all = draw(0)
  const text = all.lines.map(lineText)
  // the title wraps onto two drawn lines, and both stay at the top (no status badge under it, T-693)
  const title = text.slice(0, all.fixed)
  expect(title.some(l => l.startsWith('T-2  a reviewed change'))).toBe(true)
  // (the header's buttons are "[Label]" too since T-775; a badge would name the status)
  expect(title.filter(l => /^\[[^\]]*(review|doing|todo|failed|waiting|done|dropped|backlog)[^\]]*\]$/i.test(l) && !/Needs review/.test(l)).length).toBe(0)
  // T-680, T-751: the page header (with its buttons and its thin rule) stays at the top with them
  expect(title.some(l => l.startsWith('[Approve]'))).toBe(true)
  expect(title.at(-1)).toMatch(/^─+$/)
  expect(title.join(' ')).toContain('onto a second line here')
  expect(text.slice(all.fixed).some(l => l.includes('▍History'))).toBe(true)
  // the long history and report lines are broken into rows the panel's width, keeping every word in order
  expect(text.join(' ').replace(/\s+/g, ' ')).toContain('report line 1 is a long one that says a lot about what was done, so it has to wrap in a narrow panel')
  const firstTitle = title.findIndex(l => l.startsWith('T-2'))
  checkScrolling(draw, 25, w, [title[firstTitle]!, title.find(l => l.startsWith('[Approve]'))!])
  // T-700: no banner or tabs on a task's page (as on the terminal panel): its header comes first (T-751)
  expect(text[0]!.startsWith('‹ [Tasks]')).toBe(true)
  expect(text[1]!.startsWith('T-2  a reviewed change')).toBe(true)
  // too low to keep the title too: the title scrolls with the page, nothing stays at the top
  checkScrolling(draw, 8, w, [])
  expect(draw(0, 8).fixed).toBe(0)
})

test('T-627: the list, a scout page and Settings scroll the same way: fixed banner and tabs (and the page title), a contiguous window, a full last screenful', () => {
  const f = scoutsViewFile()
  const w = 50
  const longPrompt = Array.from({ length: 12 }, (_, i) => `Look at part ${i + 1} of the docs and say what is stale in it, with the file name and the line`).join('\n')
  const g = { ...f, view: { ...f.view, scouts: f.view.scouts.map(x => (x.name === 'docs-check' ? { ...x, prompt: longPrompt } : x)) } }
  checkScrolling((scroll, rows) => panelLines(g, { tab: 'scouts', opened: 'docs-check', cursor: 0, scroll, ...(rows ? { rows } : {}) }, NOW, w), 20, w, [])
  const scoutTop = panelLines(g, { tab: 'scouts', opened: 'docs-check', cursor: 0 }, NOW, w)
  expect(scoutTop.lines.slice(0, scoutTop.fixed).map(lineText).some(l => l.startsWith('docs-check'))).toBe(true)
  checkScrolling((scroll, rows) => panelLines(f, { tab: 'settings', opened: '', cursor: 0, settingsOpen: ALL_GROUPS, scroll, ...(rows ? { rows } : {}) }, NOW, w), 20, w, [])
  const lf = longPageViewFile()
  checkScrolling((scroll, rows) => panelLines(lf, { opened: '', cursor: 0, groups: { done: true }, scroll, ...(rows ? { rows } : {}) }, NOW, w), 14, w, [])
})

test('T-627: in the TUI, the panel is drawn exactly its height; a page that gets shorter after scrolling leaves no rows behind', async () => {
  const f = longPageViewFile(40)
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)], ['/work/proj/.symcc/reports/T-2-try-2.md', LONG_REPORT.text]])
  const fc = fakeCtx({})
  const board = startTui(fc.ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = fc.slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 's', width: 62, focused: true, close: () => undefined, focus: () => undefined } as never) as El
  // before OpenTUI lays the panel out, its height isn't known (T-649): the panel has no padding, the footer comes
  // right after the page
  expect(shown(panel)).toEqual(panelLines(f, { opened: '', cursor: 0 }, NOW, 60).lines.map(lineText))
  ;(panel as El & { height?: number }).height = 22
  ;(panel.props.onSizeChange as () => void)()
  expect(shown(panel).length).toBe(22)
  const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 60).ids
  for (let i = 0; i < ids.indexOf('T-2'); i++) await board.press('down', 's')
  await board.press('open', 's')
  await new Promise<void>(res => setTimeout(res, 0))
  const head = shown(panel).slice(0, panelLines(f, { opened: 'T-2', cursor: 0 }, NOW, 60).fixed)
  const wheel = (direction: string) => (panel.props.onMouseScroll as (e: unknown) => void)({ type: 'scroll', scroll: { direction }, stopPropagation: () => undefined })
  for (let i = 0; i < 100; i++) wheel('down')
  const end = shown(panel)
  expect(end.length).toBe(22)
  expect(end.slice(0, head.length)).toEqual(head)
  expect(board.state().scroll).toBeGreaterThan(0)
  // the page gets much shorter (a short history, no report): the scroll comes back within it, and every row is drawn
  // again, from the page's own lines and blank rows, with nothing of the long page left
  const short = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-2' ? { ...t, title: 'short', history: [], runs: [] } : t)) } }
  files.set('/work/proj/.symcc/view.json', viewFileText(short))
  await board.refresh()
  const after = shown(panel)
  expect(after.length).toBe(22)
  expect(board.state().scroll).toBe(panelLines(short, { opened: 'T-2', cursor: 0, scroll: 999, rows: 22 }, NOW, 60).scroll)
  expect(after).toEqual(panelLines(short, { opened: 'T-2', cursor: 0, scroll: board.state().scroll, rows: 22 }, NOW, 60).lines.map(lineText))
  expect(after.some(l => l.includes('step ') || l.includes('report line'))).toBe(false)
  board.stop()
})

test('T-649: a backlog and a doing task page show their footer with the buttons: with no height known, a small one, and a box taller than the screen', async () => {
  const base = viewFile()
  const f = { ...base, view: { ...base.view, tasks: base.view.tasks.map(t => (t.id === 'T-4' ? { ...t, status: 'backlog' } : t)) as ViewFile['view']['tasks'] } }
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  for (const [id, words] of [['T-4', ['o move to todo', 'x drop', 'b back']], ['T-1', ['p pause', 'x drop', 'b back']]] as const) {
    const fc = fakeCtx({})
    const board = startTui({ ...fc.ctx, renderer: { width: 120, height: 40 } }, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
    await board.refresh()
    const panel = fc.slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 's', width: 62, focused: true, close: () => undefined, focus: () => undefined } as never) as El
    const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 60).ids
    for (let i = 0; i < ids.indexOf(id); i++) await board.press('down', 's')
    await board.press('open', 's')
    expect(board.state().opened).toBe(id)
    // the footer: its light rule, then the key hints (over two lines at 60 columns, with "[ ] prev/next", T-751)
    const footerOk = (rows: string[]) => {
      const rule = rows.lastIndexOf('─'.repeat(60))
      expect(rule).toBeGreaterThan(rows.length - 4)
      for (const w of words) expect(rows.slice(rule + 1).join(' · ')).toContain(w)
    }
    // no height known: no padding, the footer right after the page
    const page = panelLines(f, { opened: id, cursor: 0 }, NOW, 60).lines.map(lineText)
    expect(shown(panel)).toEqual(page)
    footerOk(shown(panel))
    // the footer is its own box that never shrinks, under a body box that does (the layout keeps it in sight)
    const tree = (panel.kids.map(k => (typeof k === 'function' ? (k as () => unknown)() : k)) as El[])[0]!
    const [body, foot] = tree.kids.flat() as El[]
    expect(body!.props.flexShrink).toBe(1)
    expect(body!.props.overflow).toBe('hidden')
    expect(foot!.props.flexShrink).toBe(0)
    expect(shown(foot)).toEqual(page.slice(page.lastIndexOf('─'.repeat(60))))
    // a small known height: exactly that many rows, the footer last
    ;(panel as El & { height?: number }).height = 12
    ;(panel.props.onSizeChange as () => void)()
    expect(shown(panel).length).toBe(12)
    footerOk(shown(panel))
    // a box said to be taller than the screen is never trusted past the screen's height less OpenCode's lines
    ;(panel as El & { height?: number }).height = 300
    ;(panel.props.onSizeChange as () => void)()
    expect(shown(panel).length).toBe(40 - 2)
    footerOk(shown(panel))
    board.stop()
  }
})

test('T-627: drawnLines cuts a line into the rows it takes: at line breaks, and between words at the width, under its indent, keeping colors and hits', () => {
  const hit = { key: 'd' as const }
  const rows = drawnLines([{ text: '  first part of a line', color: 'text', bold: true }, { text: ' that goes on in grey\nand a second one', color: 'inactive', hit }], 16)
  expect(rows.map(lineText)).toEqual(['  first part of', '  a line that', '  goes on in', '  grey', 'and a second one'])
  for (const r of rows) expect(lineText(r).length <= 16).toBe(true)
  expect(rows[1]!.find(s => s.text.includes('that'))).toEqual({ text: ' that', color: 'inactive', hit })
  expect(rows[1]!.find(s => s.text === 'a line')?.bold).toBe(true)
  // a short line is kept as it is; an empty one is one blank row; a word longer than the row is cut
  const short = [{ text: 'ok', color: 'text' }]
  expect(drawnLines(short, 16)).toEqual([short])
  expect(drawnLines([], 16).map(lineText)).toEqual([' '])
  expect(drawnLines([{ text: 'x'.repeat(20), color: 'text' }], 8).map(lineText)).toEqual(['xxxxxxxx', 'xxxxxxxx', 'xxxx'])
})

test('T-675: a done task\'s page draws before its parts file is read, and when it is missing (empty history, no error)', async () => {
  const f0 = viewFile()
  const history = [{ kind: 'merged', at: AT, text: 'try 1: merged after a long road' }]
  const whole = f0.view.tasks.map(t => (t.id === 'T-5' ? { ...t, details: 'the old details', history } : t))
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: whole.map(t => viewTask(t)) as ViewFile['view']['tasks'] } }
  const partsPath = '/work/proj/.symcc/tasks/T-0.json'
  for (const partsThere of [true, false]) {
    let release: () => void = () => undefined
    const gate = new Promise<void>(res => (release = res))
    const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
    if (partsThere) files.set(partsPath, JSON.stringify({ version: 1, tasks: { 'T-5': { details: 'the old details', history } } }))
    const toasts: string[] = []
    const slots: { append: string; render: (input: never) => unknown }[] = []
    const ctx: TuiContext = {
      location: { directory: '/work/proj' },
      theme: {},
      renderer: { width: 120, height: 200 },
      client: { session: { command: async () => undefined } },
      keymap: { layer: () => undefined },
      ui: {
        toast: { show: (o: unknown) => void toasts.push(JSON.stringify(o)) },
        dialog: { prompt: async () => undefined, select: async () => undefined },
        panel: { open: () => true, close: () => undefined, current: () => undefined },
        slot: claim => (slots.push(claim as never), () => undefined),
      },
    }
    // the parts file answers only once released: the page is drawn before that
    const readText = async (p: string) => {
      if (p === partsPath) await gate
      return files.get(p) ?? Promise.reject(new Error('missing'))
    }
    const board = startTui(ctx, { runtime: fakeRuntime(), readText, every: () => () => undefined, now: () => NOW })
    await board.refresh()
    const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: true, close: () => undefined, focus: () => undefined } as never)
    const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 100).ids
    for (let i = 0; i < ids.indexOf('group:done'); i++) await board.press('down', 'ses_1')
    await board.press('open', 'ses_1')
    await board.press('down', 'ses_1')
    await board.press('open', 'ses_1')
    expect(board.state().opened).toBe('T-5')
    const before = shown(panel)
    expect(before.some(l => l.includes('T-5'))).toBe(true)
    expect(before.some(l => l.includes('a long road'))).toBe(false)
    await board.refresh()
    release()
    await new Promise<void>(res => setTimeout(res, 0))
    await board.refresh()
    await new Promise<void>(res => setTimeout(res, 0))
    expect(shown(panel).some(l => l.includes('a long road'))).toBe(partsThere)
    expect(toasts.filter(t => t.includes('could not be drawn'))).toEqual([])
    board.stop()
  }
})

test('T-675: a done task\'s history is not in the view file; opening its page reads it from its parts file and shows it', async () => {
  const f0 = viewFile()
  const history = [{ kind: 'merged', at: AT, text: 'try 1: merged after a long road' }]
  const whole = f0.view.tasks.map(t => (t.id === 'T-5' ? { ...t, details: 'the old details', history } : t))
  // as the engine writes it: T-5 without its history and details, naming its parts file
  const slim = whole.map(t => viewTask(t))
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: slim as ViewFile['view']['tasks'] } }
  expect(viewFileText(f)).not.toContain('a long road')
  const t5 = whole.find(t => t.id === 'T-5')!
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)], ['/work/proj/.symcc/tasks/T-0.json', JSON.stringify({ version: 1, tasks: { 'T-5': { details: t5.details, history } } })]])
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: true, close: () => undefined, focus: () => undefined } as never)
  const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 100).ids
  // the Done group is closed at first: open it, then go down onto T-5
  for (let i = 0; i < ids.indexOf('group:done'); i++) await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('T-5')
  await new Promise<void>(res => setTimeout(res, 0))
  expect(shown(panel).some(l => l.includes('a long road'))).toBe(true)
  // the same page as with the task whole in the view file
  const wholeFile: ViewFile = { ...f0, view: { ...f0.view, tasks: whole as ViewFile['view']['tasks'] } }
  expect(shown(panel).some(l => l.includes('the old details'))).toBe(panelLines(wholeFile, { opened: 'T-5', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('the old details')))
  board.stop()
})

test('T-685: every board screen has Claude Code\'s buttons: the tab row, the list\'s [m] mode and [f] search (then [f] change search, [x] clear search), Back (b) on the Scouts, Settings, Roles, Kinds and org-mem pages, Delete (x), a role\'s and a kind\'s page buttons and its prompt page', () => {
  const f = orgMemViewFile()
  const W = 140
  const draw = (c: Partial<PanelChoice>, w = W) => panelLines(f, { opened: '', cursor: 0, ...c }, NOW, w)
  const texts = (c: Partial<PanelChoice>, w = W) => draw(c, w).lines.map(lineText)
  // the tab row is Claude Code's, made from core's LIVE_TABS and tabRow: "[l]: Live │ [t]: Tasks (5) │ [s]: Scouts (2) │ [c]: Settings"
  const tabRow = '[l]: Live │ [t]: Tasks (5) │ [s]: Scouts (2) │ [c]: Settings'
  const counts = (w: number) => coreTabRow(LIVE_TABS.map(t => ({ key: t.key, label: t.label, count: t.tab === 'tasks' ? 5 : t.tab === 'scouts' ? 2 : undefined })), w)
  expect(counts(W).labels.join(counts(W).gap)).toBe(tabRow)
  // the list pages have the tab row (T-700: a page of one task, scout, role... has none, as on the terminal panel; T-704: nor the org-mem page)
  const screens: Partial<PanelChoice>[] = [
    {}, { tab: 'scouts' }, { tab: 'settings' }, { tab: 'settings', opened: 'roles' }, { tab: 'settings', opened: 'kinds' }, { tab: 'live' },
  ]
  for (const c of screens) {
    const d = draw(c)
    const row = d.lines.find(l => lineText(l) === tabRow)
    expect([c, !!row]).toEqual([c, true])
    // each tab a button for its tab; the shown one bold
    expect(row!.filter(s => s.hit).map(s => [s.text, s.hit, !!s.bold])).toEqual(LIVE_TABS.map((t, i) => [counts(W).labels[i], { tab: t.tab }, t.tab === (c.tab ?? 'tasks')]))
  }
  // a narrow panel gets the terminal's shorter tab words (tabRow); narrower still, more rows, never cutting one
  expect(texts({}, 50)).toContain(counts(50).labels.join(counts(50).gap))
  expect(counts(50).labels.join(counts(50).gap).length <= 50).toBe(true)
  const narrow = texts({}, 20)
  for (const l of counts(20).labels) expect([l, narrow.some(x => x.includes(l))]).toEqual([l, true])

  // the list's footer: Claude Code's board-mode row (the mode, its [m] button, [f] search), then the key hints
  const list = draw({})
  const modeRow = list.lines.at(-list.footer + 1)!
  expect(lineText(modeRow)).toBe(`${modeLabel('auto')} [ ${modeButton('auto')} ]  [ [f] search ]`)
  expect(lineText(modeRow)).toBe('⏵ auto merge [ [m] approve merge ]  [ [f] search ]')
  expect(modeRow.filter(s => s.hit).map(s => s.hit)).toEqual([{ key: 'm' }, { key: 'f' }])
  // a task's page has no mode row (as Claude Code's)
  expect(texts({ opened: 'T-2' }).some(l => l.includes('[m]'))).toBe(false)
  // a search on: the search line, then [f] change search and [x] clear search; only the matches, no questions; no [f] search in the footer
  const found = draw({ search: 'reviewed' })
  const ft = found.lines.map(lineText)
  expect(ft).toContain('search: reviewed · 1 of 5 tasks')
  expect(ft).toContain('[ [f] change search ]  [ [x] clear search ]')
  expect(found.lines.flat().filter(s => s.text === '[ [f] change search ]' || s.text === '[ [x] clear search ]').map(s => s.hit)).toEqual([{ key: 'f' }, { key: 'x' }])
  expect(found.ids).toEqual(['T-2'])
  expect(lineText(found.lines.at(-found.footer + 1)!)).toBe('⏵ auto merge [ [m] approve merge ]')
  // they stay at the top with the tabs when the list scrolls
  expect(found.lines.slice(0, found.fixed).map(lineText)).toContain('search: reviewed · 1 of 5 tasks')
  expect(texts({ search: 'nothing-like-this' })).toContain('search: nothing-like-this · no tasks match')

  // Back (b) on each list page, as Claude Code's
  const back = (c: Partial<PanelChoice>) => draw(c).lines.flat().filter(s => s.text === '[ Back (b) ]').map(s => s.hit)
  for (const c of [{ tab: 'scouts' }, { tab: 'settings' }] as const) expect([c, back(c)]).toEqual([c, [{ key: 'back' }]])
  // T-918: the Roles and Task types tables have no Back button (their key line says b back)
  for (const c of [{ tab: 'settings', opened: 'roles' }, { tab: 'settings', opened: 'kinds' }] as const) expect([c, back(c)]).toEqual([c, []])
  // T-790: the org-mem page has the shared detail header: "‹ [Live]" and the count, the title, the subtitle, "[Delete]" (no key in it),
  // a thin rule, kept at the top; then ▍About and ▍Notes; the old Back (b) button is gone
  const om = texts({ tab: 'live', opened: 'orgmem' })
  expect(om[0]).toMatch(/^‹ \[Live\] +3 \/ 60$/)
  expect(om.slice(1, 4)).toEqual(['Organizational memory (org-mem)', 'Notes shared with workers, checkers and scouts', '[Delete]'])
  expect(om[4]).toMatch(/^─+$/)
  expect(om[5]).toBe('▍About')
  expect(om.indexOf('▍Notes')).toBeGreaterThan(5)
  expect(om.indexOf('▍Notes')).toBeLessThan(om.findIndex(l => l.includes('#3 · 2026-11-20')))
  expect(om.some(l => l.includes('Back (b)') || l.includes('Delete (x)'))).toBe(false)
  const omPage = draw({ tab: 'live', opened: 'orgmem' })
  expect(omPage.lines.slice(0, omPage.fixed).map(lineText)).toContain('[Delete]')
  expect(omPage.selected).toBe('note:3')
  expect(omPage.lines[0]!.find(s => s.text === '[Live]')?.hit).toEqual({ key: 'back' })
  expect(omPage.lines.flat().find(s => s.text === '[Delete]')?.hit).toEqual({ key: 'x' })
  const noNotes = orgMemViewFile('')
  const noTexts = panelLines(noNotes, { tab: 'live', opened: 'orgmem', cursor: 0 }, NOW, W).lines.map(lineText)
  expect([noTexts[0]!.startsWith('‹ [Live]'), noTexts.includes('[Delete]')]).toEqual([true, false])
  // an empty Scouts tab has its Back (b) too
  const noScouts: ViewFile = { ...f, view: { ...f.view, scouts: [] } }
  expect(panelLines(noScouts, { tab: 'scouts', opened: '', cursor: 0 }, NOW, W).lines.map(lineText)).toContain('[ Back (b) ]')

  // a role's and a kind's page: Claude Code's buttons in its order (Back, Edit, See the prompt, Turn off / on, Reset to built-in, Remove)
  const buttonRow = (opened: string) => texts({ tab: 'settings', opened }).find(l => l.startsWith('[ Back ]'))
  // T-871: a role's page has the shared page header: ‹ [Roles] is its Back, its buttons are one row under its state
  const headRow = (opened: string) => texts({ tab: 'settings', opened }).find(l => l.startsWith('[Edit]'))?.replace(/ {2,}/g, ' ')
  expect(headRow('role:tester')).toBe('[Edit] [Prompt] [Reset to built-in] [Turn on]')
  expect(headRow('role:general')).toBe('[Edit] [Prompt]')
  expect(headRow('role:checker')).toBe('[Edit] [Prompt]')
  expect(texts({ tab: 'settings', opened: 'role:tester' })[0]).toMatch(/^‹ \[Roles\]/)
  // a broken file with no built-in's name: only Remove (T-706)
  expect(buttonRow('role:oops')).toBe('[ Back ] [ Remove ]')
  expect(buttonRow('kind:bug')).toBe('[ Back ] [ Edit ] [ Turn off ] [ Reset to built-in ]')
  expect(buttonRow('kind:change')).toBe('[ Back ] [ Edit ]')
  // the buttons stay at the top with the page's name
  const role = draw({ tab: 'settings', opened: 'role:tester' })
  expect(role.lines.slice(0, role.fixed).map(lineText).some(l => l.startsWith('[Edit] [Prompt]'))).toBe(true)
  expect(role.lines.flat().filter(s => /^\[(Edit|Prompt|Turn on|Reset to built-in)\]$/.test(s.text) && s.hit).map(s => s.hit)).toEqual([{ key: 'e' }, { key: 'p' }, { key: 'r' }, { key: 'o' }])
  // the prompt page (Claude Code's See the prompt): view only, Back and the role's other prompts, its text with the slot marked
  const prompt = draw({ tab: 'settings', opened: 'prompt:tester:change' })
  const pt = prompt.lines.map(lineText)
  expect(pt).toContain('change prompt · built-in, view only')
  expect(pt).toContain('[ Back ] [ The investigation prompt ]')
  expect(prompt.lines.flat().find(s => s.text === '[ The investigation prompt ]')?.hit).toEqual({ page: 'prompt:tester:investigation' })
  expect(pt.some(l => l.includes(ROLE_SLOT) && l.endsWith("◀ role tester's checklist goes here"))).toBe(true)
  expect(texts({ tab: 'settings', opened: 'prompt:checker:checker' })).toContain('[ Back ]')
  expect(panelKeys(f, 'prompt:tester:change', 'settings').map(k => k.word)).toEqual(['back'])
  // a role that isn't there, or a prompt it doesn't go in, has no page
  expect(texts({ tab: 'settings', opened: 'prompt:tester:checker' }).some(l => l.includes('built-in, view only'))).toBe(false)
  expect(promptsOfRole('tester')).toEqual(['change', 'investigation'])
  expect(actionCommand({ kind: 'mode', mode: 'review' })).toEqual({ name: 'symcc-mode', text: 'review' })
})

test('T-685: in the TUI a click on each of those buttons does exactly what its key does (tabs, [m], [f] search, [x] clear search, Back (b), Delete (x), a role\'s and a kind\'s page, the prompt page)', async () => {
  const f = orgMemViewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const answers = { prompt: [] as (string | undefined)[], select: [] as unknown[] }
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 142, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => answers.prompt.shift(), select: async <V,>() => answers.select.shift() as V | undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 's', width: 142, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  const settle = () => new Promise<void>(res => setTimeout(res, 0))
  const clickRow = (has: string) => (rowEls(panel).find(r => r.text.includes(has))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  const click = async (label: string) => {
    const seg = rowEls(panel).flatMap(r => r.segs).find(s => s.kids?.join('') === label)
    expect([label, typeof seg?.props.onMouseUp]).toEqual([label, 'function'])
    ;(seg!.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
    await settle()
  }
  // the pages, each reached the same way every time
  const toList = async (search = '') => {
    await board.press('t', 's')
    await board.press('back', 's')
    // x takes off a search left on (on the list it does nothing else)
    await board.press('x', 's')
    if (search) {
      answers.prompt.push(search)
      await board.press('f', 's')
    }
  }
  const toSettings = async (row = '', then = '') => {
    await board.press('t', 's')
    await board.press('c', 's')
    for (const g of lines().filter(l => l.includes('▸ '))) clickRow(g.trim().split(' · ')[0]!)
    if (row) clickRow(row)
    if (then) clickRow(then)
  }
  // a click on `label` and a press of `key`, each from the same page and with the same answers: the same commands
  // sent, the same state and the same drawing after
  const same = async (go: () => Promise<void>, label: string, key: PanelKey, give: { prompt?: (string | undefined)[]; select?: unknown[] } = {}) => {
    const run = async (act: () => Promise<void>) => {
      await go()
      sent.length = 0
      answers.prompt = [...(give.prompt ?? [])]
      answers.select = [...(give.select ?? [])]
      await act()
      return { sent: [...sent], state: board.state(), lines: lines() }
    }
    const byKey = await run(() => board.press(key, 's'))
    const byClick = await run(() => click(label))
    expect([label, byClick]).toEqual([label, byKey])
    return byClick
  }
  // the list's footer (its rule, the mode row and the key hints) is the box that never shrinks, so it stays in view
  await toList()
  const flatEls = (x: unknown): El[] => (typeof x === 'function' ? flatEls(x()) : Array.isArray(x) ? x.flatMap(flatEls) : x && typeof x === 'object' ? [x as El, ...flatEls((x as El).kids)] : [])
  const foot = flatEls(panel).find(e => e.props.flexShrink === 0 && e.props.flexDirection === 'column')!
  const footRows = rowEls(foot).map(r => r.text)
  expect(footRows.slice(1)).toEqual(['⏵ auto merge [ [m] approve merge ]  [ [f] search ]', '↑↓ move · Enter open · l t s c views · Esc close'])
  // the tabs, from every tab
  for (const go of [() => toList(), () => toSettings(), async () => (await toList(), await board.press('s', 's'))]) {
    expect((await same(go, '[t]: Tasks (5)', 't')).state.tab).toBe('tasks')
    expect((await same(go, '[s]: Scouts (2)', 's')).state.tab).toBe('scouts')
    expect((await same(go, '[c]: Settings', 'c')).state.tab).toBe('settings')
  }
  // the list: [m] sends /symcc-mode with the mode it switches to; [f] search asks and filters; [f] change search with
  // an empty answer clears it; [x] clear search clears it
  expect((await same(() => toList(), '[ [m] approve merge ]', 'm')).sent).toEqual([{ sessionID: 's', name: 'symcc-mode', text: 'review' }])
  expect((await same(() => toList(), '[ [f] search ]', 'f', { prompt: ['reviewed'] })).lines).toContain('search: reviewed · 1 of 5 tasks')
  // Esc on the box keeps the list as it was
  expect((await same(() => toList(), '[ [f] search ]', 'f', { prompt: [undefined] })).lines.some(l => l.startsWith('search:'))).toBe(false)
  expect((await same(() => toList('reviewed'), '[ [f] change search ]', 'f', { prompt: ['a later'] })).lines).toContain('search: a later · 1 of 5 tasks')
  expect((await same(() => toList('reviewed'), '[ [f] change search ]', 'f', { prompt: [''] })).lines.some(l => l.startsWith('search:'))).toBe(false)
  const cleared = await same(() => toList('reviewed'), '[ [x] clear search ]', 'x')
  expect(cleared.lines.some(l => l.startsWith('search:'))).toBe(false)
  expect(cleared.sent).toEqual([])
  // with the search on, the list has only the match: Enter opens it
  await toList('reviewed')
  await board.press('open', 's')
  expect(board.state().opened).toBe('T-2')
  await toList()
  // Back (b) on the list pages: Scouts and Settings go to the task list, Roles and Task types to Settings, org-mem to the Live tab
  expect((await same(async () => (await toList(), await board.press('s', 's')), '[ Back (b) ]', 'back')).state.tab).toBe('tasks')
  expect((await same(() => toSettings(), '[ Back (b) ]', 'back')).state.tab).toBe('tasks')
  // T-918: the Roles and Task types tables have no Back button; b goes back to Settings
  for (const row of ['4 roles', '2 task types']) {
    await toSettings(row)
    await board.press('back', 's')
    expect(board.state()).toEqual({ ...board.state(), tab: 'settings', opened: '' })
  }
  // T-866: org-mem's "[all]" (no key: m is gone) opens all notes
  const toOrgMem = async () => (await board.press('t', 's'), await board.press('l', 's'), await click('[all]'))
  await toOrgMem()
  expect(board.state()).toEqual({ ...board.state(), tab: 'live', opened: 'orgmem' })
  expect((await same(toOrgMem, '[Live]', 'back')).state).toEqual({ ...board.state(), tab: 'live', opened: '' })
  // org-mem's Delete (x): asks, then deletes the note under the cursor (the newest)
  expect((await same(toOrgMem, '[Delete]', 'x', { select: ['yes'] })).sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: `orgmem delete 3 ${orgMemNoteKey('the type check is separate')}` }])
  // a role's page (T-871: the shared page header): ‹ [Roles], Prompt, Turn on, Reset to built-in (asks first)
  const tester = () => toSettings('4 roles', 'My tester')
  await tester()
  expect(board.state().opened).toBe('role:tester')
  expect((await same(tester, '[Roles]', 'back')).state.opened).toBe('roles')
  expect((await same(tester, '[Prompt]', 'p')).state.opened).toBe('prompt:tester:change')
  expect((await same(tester, '[Turn on]', 'o')).sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'role tester on' }])
  expect((await same(tester, '[Reset to built-in]', 'r', { select: ['yes'] })).sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'role tester reset' }])
  expect((await same(tester, '[Reset to built-in]', 'r', { select: ['no'] })).sent).toEqual([])
  // a kind's page: Back, Turn off, Reset to built-in
  const bug = () => toSettings('2 task types', 'A bug to fix')
  expect((await same(bug, '[ Back ]', 'back')).state.opened).toBe('kinds')
  expect((await same(bug, '[ Turn off ]', 'o')).sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'type bug off' }])
  expect((await same(bug, '[ Reset to built-in ]', 'r')).sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'type bug reset' }])
  // the prompt page: Back goes back to the role; its other prompt's button opens that one; o and r do nothing there
  const promptPage = async () => (await tester(), await board.press('p', 's'))
  expect((await same(promptPage, '[ Back ]', 'back')).state.opened).toBe('role:tester')
  await promptPage()
  await click('[ The investigation prompt ]')
  expect(board.state().opened).toBe('prompt:tester:investigation')
  expect(lines()).toContain('[ Back ] [ The change prompt ]')
  sent.length = 0
  await board.press('o', 's')
  await board.press('r', 's')
  expect(sent).toEqual([])
  board.stop()
})

test('T-696: a long-title row in the list keeps "waits for T-1" / "[feature]" at its end and cuts the title with "…"', () => {
  const f = viewFile()
  const long = 'Board list: keep the row end visible by cutting the title instead of dropping the extra part'
  const tasks = f.view.tasks.map(t => (t.id === 'T-4' ? { ...t, title: long, after: ['T-1'] } : t.id === 'T-5' ? { ...t, status: 'todo' as const, title: long, kind: 'feature' } : t))
  const g = { ...f, view: { ...f.view, tasks } }
  for (const w of [80, 100]) {
    const rows = panelLines(g, { opened: '', cursor: 0 }, NOW, w).lines.map(lineText)
    const r4 = rows.find(l => l.includes('T-4'))!
    const r5 = rows.find(l => l.includes('T-5'))!
    expect(r4).toMatch(/Board list: .*…  +waits for T-1$/)
    expect(r5).toMatch(/Board list: .*…  +\[feature\]$/)
    expect(r4.length).toBeLessThan(w + 1)
  }
})

/** T-692: a sample board for the Live tab: three tasks in doing (a worker, the checker, the merge queue), a task
 *  merged today after a send-back, a failed one, two to do (one waiting on the other). Times are minutes before NOW. */
function liveTasks(): SymccTask[] {
  const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
  const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: ago(300), updated_at: ago(1), ...x }) as unknown as SymccTask
  return [
    task('T-610', 'Organizational memory search', { runs: [{ started: ago(4) }] }),
    task('T-611', '/symcc-doctor checks the hooks', { attempts: 2, runs: [{ started: ago(60), ended: ago(50), agents: [{ kind: 'worker' as const, started: ago(60), ended: ago(50), tokens: { input: 1_100_000 } }] }, { started: ago(30), ended: ago(10), agents: [{ kind: 'worker' as const, started: ago(30), ended: ago(10), tokens: { input: 1_100_000 } }] }], live: { checking: { step: 'queue', at: ago(0), place: 2 } }, history: [{ kind: 'checker-problems', at: ago(40), text: 'try 1: checker: problems' }, { kind: 'stage', at: ago(5), text: 'try 2: waits in the merge queue (place 2)', try: 2, step: 'queue' }] }),
    task('T-612', 'Scout page: drop the first line', { runs: [{ started: ago(20), ended: ago(2), agents: [{ kind: 'worker' as const, started: ago(20), ended: ago(2), tokens: { input: 540_000 } }, { id: 'agent-c', kind: 'checker' as const, started: ago(2) }] }], live: { checking: { step: 'checker', at: ago(0) } }, history: [{ kind: 'stage', at: ago(2), text: 'try 1: prep started', try: 1, step: 'prep' }] }),
    task('T-600', 'A merged one', { status: 'done', merged: 'abc1234', updated_at: ago(1), runs: [{ started: ago(200), ended: ago(100), agents: [{ kind: 'worker' as const, started: ago(200), ended: ago(100), tokens: { input: 800_000 } }] }], history: [{ kind: 'checker-problems', at: ago(90), text: 'try 1: checker: problems, a long reason' }, { kind: 'merged', at: ago(30), text: 'try 2 → merged into main' }] }),
    task('T-601', 'A failed one', { status: 'failed', updated_at: ago(20) }),
    task('T-620', 'Live tab part 1', { status: 'todo', priority: 5 }),
    task('T-621', 'Live tab in VS Code', { status: 'todo', after: ['T-620'], priority: 1 }),
  ]
}

test('T-760: the OpenCode Live tab ends work and check in ✧ (in the heading color, lined up as the terminal\'s), with the new legend', () => {
  const f0 = viewFile()
  const whole = liveTasks()
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: whole.map(t => viewTask(t)), checker: true, max_parallel: 3 } }
  for (const w of [120, 50]) {
    const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const at = d.lines.findIndex(l => lineText(l).startsWith('─── ❯ TASKS ─'))
    expect(lineText(d.lines[at + 1]!).trim()).toBe('')
    const labels = d.lines[at + 2]!
    const lanes = liveLanes(f.view, NOW)
    expect(lineText(labels)).toBe(LIVE_INDENT + liveLabelLine(liveLayout(lanes, liveStations(true), liveInner(w))))
    if (w === 120) expect(lineText(labels).includes('work✧') && lineText(labels).includes('check✧')).toBe(true)
    expect(lineText(labels).includes('·')).toBe(false)
    const heading = d.lines[at]![0]!.color
    expect(labels.filter(x => x.text === '✧').map(x => x.color)).toEqual([heading, heading])
    expect(labels.filter(x => /[a-z]/.test(x.text)).every(x => x.color === 'inactive')).toBe(true)
    const texts = d.lines.map(lineText)
    expect(texts.some(t => t.includes('bar:') || t.includes('usual per task'))).toBe(false)
    // T-867: the key line has no bar text any more
    if (w === 120) expect(texts).toContain(LIVE_INDENT + '✧ = an agent works here (needs an agent slot) · ⌀ = tokens')
    else expect(texts.some(t => t.startsWith(LIVE_INDENT + '✧ = an agent works here'))).toBe(true)
  }
})

test('T-846: the OpenCode Live tab draws an investigation as work → done, a docs-only check as "–", and a needs-review task at "you"', () => {
  const f0 = viewFile()
  const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
  const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: ago(300), updated_at: ago(1), ...x }) as unknown as SymccTask
  const handed = { runs: [{ started: ago(20), ended: ago(2), agents: [{ kind: 'worker' as const, started: ago(20), ended: ago(2), tokens: { input: 300_000 } }] }] }
  const tasks = [
    task('T-801', 'Why is it slow', { kind: 'investigation', runs: [{ started: ago(4) }] }),
    task('T-803', 'Docs: fix the readme', { files: ['README.md'], runs: [{ ...handed.runs[0]!, docs_only: true as const }], live: { checking: { step: 'prep', at: ago(0) } } }),
    task('T-805', 'Waits for you', { needs_review: true, status: 'review', ...handed }),
    task('T-806', 'A normal change', { files: ['hooks/a.ts'], ...handed, live: { checking: { step: 'testing', at: ago(0) } } }),
  ]
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: tasks.map(t => viewTask(t)), checker: true, max_parallel: 3 } }
  const lanes = liveLanes(f.view, NOW)
  expect(lanes.map(l => `${l.id} ${l.station} ${l.stations.length}`).sort()).toEqual(['T-801 work 2', 'T-803 queue 5', 'T-805 you 6', 'T-806 tests 5'])
  const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, 120)
  const texts = d.lines.map(lineText)
  const row = (id: string) => texts.find(t => t.includes(`▶ ${id} `))!
  const marks = (s: string) => s.replace(/◎/g, '◉').match(/[●○◉–][━─●○◉–]*/g)!.join('').replace(/[━─]+/g, '-')
  expect(marks(row('T-801'))).toBe('◉-○')
  expect(row('T-803')).toContain('–')
  expect(row('T-806')).not.toContain('–')
  expect(marks(row('T-806'))).toBe('●-●-●-◉-○')
  expect(marks(row('T-805'))).toBe('●-●-●-●-◉-○')
  expect(texts.some(t => t.includes('you') && t.includes('done'))).toBe(true)
  expect(texts.some(t => /\b(merged|answer)\b/.test(t.split('▶')[0]!) && t.includes('queue'))).toBe(false)
})

test('T-769: the Live tab\'s ▍Today has 4 lines (medians per task, work time, cost, the stacked bar with shares, the hour sparkline with its figures) from the slim view file; narrow drops parts, never wider', () => {
  const f0 = viewFile()
  const tasks = todayTasks(NOW) as unknown as SymccTask[]
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: tasks.map(t => viewTask(t)), today_team: todayTeamOf(NOW, localOffset(NOW)) } }
  const parsed = parseViewFile(viewFileText(f))!
  expect(parsed.view.today_team?.lead).toBe(1_000_000)
  const today = (w: number) => {
    const texts = panelLines(parsed, { tab: 'live', opened: '', cursor: 0 }, NOW, w).lines.map(lineText)
    for (const t of texts) expect([w, t, textWidthOf(t) <= w]).toEqual([w, t, true])
    const at = texts.findIndex(x => x.startsWith('─── ❯ TODAY ─'))
    expect(texts[at + 1]!.trim()).toBe('')
    // T-938: the first row is "Now:" the mode line, the figures under it
    expect(texts[at + 2]!.startsWith(`${LIVE_INDENT}Now: ⏵ `)).toBe(true)
    return { texts, lines: texts.slice(at + 3, at + 7) }
  }
  const wide = today(140)
  expect(wide.lines[0]).toBe(`${LIVE_INDENT}✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ ⌀ 10M`)
  expect(wide.lines[1]!.startsWith(LIVE_INDENT + TODAY_BAR_START)).toBe(true)
  expect(/[▁▂▃▄▅▆▇]/.test(wide.lines[1]!)).toBe(false)
  expect(wide.lines[2]).toBe(LIVE_INDENT + TODAY_LINE_3)
  // (the hours depend on the machine's time zone)
  expect(/^ ⏱ 1h 15m agent work · ≈ \$12 this session   busiest hour \d\d:00 · ⌀ \S+   ⌀\/h 00▕[▁▂▃▄▅▆▇█]+·*▏24$/.test(wide.lines[3]!.replace(LIVE_INDENT, ' '))).toBe(true)
  // T-855: no lane here, so no key line: the dim note ends ▍Today
  expect(wide.texts.at(-1) === undefined || wide.texts.some(t => t === `${LIVE_INDENT}⌀ = tokens`)).toBe(true)
  // a broken today_team is left out: no lead, scouts or cost
  const broken = parseViewFile(viewFileText({ ...f, view: { ...f.view, today_team: 'x' as never } }))!
  expect('today_team' in broken.view).toBe(false)
  // narrow: the cost goes; at 40 only the bar is left on the third line
  expect(today(45).texts.some(t => t.includes('≈ $'))).toBe(false)
  const narrow = today(40)
  expect(narrow.texts.some(t => t === `${LIVE_INDENT}⌀ ░░████████▓▒▒▒▒▒`)).toBe(true)
  // line 4 keeps both hour labels and a sparkline, its figures cut from the end
  const four = narrow.texts.find(t => / ⌀(?:\/h)? 00▕[▁▂▃▄▅▆▇█]+·*▏24$/.test(t))
  expect(four === undefined).toBe(false)
  expect(four!.includes('busiest')).toBe(false)
  // T-864: at the owner's 60-80 columns the busiest hour goes first; the ⌀ label stays with the bordered sparkline
  for (const w of [80, 70, 60]) {
    const l4 = today(w).texts.find(t => / 00▕[▁▂▃▄▅▆▇█]+·*▏24$/.test(t)) ?? ''
    expect([w, l4, / ⌀(?:\/h)? 00▕/.test(l4), l4.includes('busiest')]).toEqual([w, l4, true, false])
  }
})

test('T-889: the Live tab\'s ▍Today ends with the dim yesterday and last 7 days lines (today left out) from the slim view file; narrow drops ⏱, then ⌀', () => {
  const now = Date.now()
  const f0 = viewFile()
  const tasks = pastTasks(now) as unknown as SymccTask[]
  const parsed = parseViewFile(viewFileText({ ...f0, view: { ...f0.view, tasks: tasks.map(t => viewTask(t)) } }))!
  const texts = (w: number) => panelLines(parsed, { tab: 'live', opened: '', cursor: 0 }, now, w).lines.map(lineText)
  const wide = texts(140)
  const at = wide.findIndex(x => x === LIVE_INDENT + PAST_YESTERDAY)
  expect(at > wide.findIndex(x => x.startsWith('─── ❯ TODAY ─'))).toBe(true)
  expect(wide[at + 1]).toBe(LIVE_INDENT + PAST_WEEK)
  const narrow = texts(LIVE_INDENT.length + 30)
  expect(narrow.includes(`${LIVE_INDENT}yesterday:   ✓ 1 merged · ⌀ 3M`)).toBe(true)
  expect(narrow.includes(`${LIVE_INDENT}last 7 days: ✓ 2 merged · ⌀ 5M`)).toBe(true)
  const tight = texts(LIVE_INDENT.length + 25)
  expect(tight.includes(`${LIVE_INDENT}yesterday:   ✓ 1 merged`)).toBe(true)
  expect(tight.includes(`${LIVE_INDENT}last 7 days: ✓ 2 merged`)).toBe(true)
})

test('T-692: the Live tab draws the terminal panel\'s lanes and today (core/live.ts) for the same board, from the slim view file; a narrow panel cuts nothing', () => {
  const f0 = viewFile()
  const whole = liveTasks()
  const view = { ...f0.view, tasks: whole, checker: true, max_parallel: 3 }
  // what the terminal panel draws (claude/ui/live.tsx): the same core functions on the whole board
  const terminal = (w: number) => {
    const lanes = liveLanes(view, NOW)
    // T-747: each section under its "▍Name" heading, its lines indented
    const inner = liveInner(w)
    const layout = liveLayout(lanes, liveStations(true), inner)
    const frame = Math.floor(NOW / 1000)
    const under = (x: string) => LIVE_INDENT + x
    // T-938: no mode line above the sections: it is ▍Today's first row, "Now:"
    return [segText(liveHeading('Tasks', w)), ' ', under(liveLabelLine(layout)), ...lanes.flatMap(l => laneLines(l, layout, { nowMs: NOW, frame }).map(x => under(segText(x)))), ' ', segText(liveHeading('Today', w)), ' ', under(segText(liveNowSegs(view, lanes, NOW, inner))), ...todayLines(liveToday(whole, NOW), inner, true).map(under), ...liveLegend(inner).map(under)]
  }
  // OpenCode reads the view file, whose done task comes slim (no history): the today row must still match
  const f: ViewFile = { ...f0, view: { ...view, tasks: whole.map(t => viewTask(t)) } }
  const slim = f.view.tasks.find(t => t.id === 'T-600') as unknown as Record<string, unknown>
  expect('history' in slim).toBe(false)
  expect(viewFileText(f)).not.toContain('a long reason')
  expect(liveToday(f.view.tasks, NOW, 0)).toEqual(liveToday(whole, NOW, 0))
  expect([liveToday(f.view.tasks, NOW, 0).merged, liveToday(f.view.tasks, NOW, 0).sentBack, liveToday(f.view.tasks, NOW, 0).failed]).toEqual([1, 2, 1])
  for (const w of [120, 80, 50, 32]) {
    const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const texts = d.lines.map(lineText)
    // the lane under the cursor shows "›" in its first column
    const plain = texts.map(t => t.replace(/^›/, ' '))
    let at = plain.indexOf(terminal(w)[0]!)
    expect([w, at >= 0]).toEqual([w, true])
    for (const want of terminal(w)) {
      const i = plain.indexOf(want, at)
      expect([w, want, i >= at]).toEqual([w, want, true])
      at = i
    }
    for (const t of texts) expect([w, t, t.length <= w]).toEqual([w, t, true])
    expect(d.ids).toEqual(['need:T-601', 'T-611', 'T-612', 'T-610', 'om-all'])
    expect(texts.some(t => t.startsWith('▶ T-611') || t.includes('▶ T-611'))).toBe(true)
    // each lane's first line is a click on its task
    const lane = d.lines.findIndex((l, i) => lineText(l).includes('T-612') && !!d.hits[i])
    expect(d.hits[lane]).toEqual({ open: 'T-612' })
    expect(d.keys.map(k => k.key)).toEqual(['↑↓', 'Enter', 'l t s c', 'Esc'])
  }
  // the current station blinks with the clock
  const lineOf = (now: number) => panelLines(f, { tab: 'live', opened: '', cursor: 0 }, now, 120).lines.map(lineText).find(t => t.includes('T-611'))!
  expect(lineOf(NOW)).not.toBe(lineOf(NOW + 1000))
  // no task in doing: the empty state
  const none: ViewFile = { ...f, view: { ...f.view, tasks: f.view.tasks.filter(t => t.status !== 'doing') } }
  expect(panelLines(none, { tab: 'live', opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).some(idleLine)).toBe(true)
  expect(panelLines(none, { tab: 'live', opened: '', cursor: 0 }, NOW, 100).lines.map(lineText)).not.toContain(' ' + '─'.repeat(12))
})

test('T-757, T-867: the OpenCode Live tab shows the whole task\'s tokens × the median (warning from twice it), its time and who spent them, no bar, and the key line without the bar', () => {
  const f0 = viewFile()
  const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
  const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: ago(300), updated_at: ago(1), ...x }) as unknown as SymccTask
  const tasks = [
    task('T-800', 'Done at 4M', { status: 'done', merged: 'abc1234', runs: [{ started: ago(300), ended: ago(200), agents: [{ kind: 'worker' as const, started: ago(300), ended: ago(200), tokens: { input: 4_000_000 } }] }], history: [{ kind: 'merged', at: ago(30), text: 'try 1 → merged into main' }] }),
    task('T-801', 'Try 2 running', { attempts: 2, runs: [{ started: ago(60), ended: ago(50), agents: [{ kind: 'worker' as const, started: ago(60), ended: ago(50), tokens: { input: 4_000_000 } }] }, { started: ago(20) }] }),
    task('T-802', 'Try 2 handed back', { attempts: 2, runs: [{ started: ago(60), ended: ago(50), agents: [{ kind: 'worker' as const, started: ago(60), ended: ago(50), tokens: { input: 4_000_000 } }] }, { started: ago(20), ended: ago(2), agents: [{ kind: 'worker' as const, started: ago(20), ended: ago(2), tokens: { input: 1_000_000 } }, { id: 'agent-c', kind: 'checker' as const, started: ago(2) }] }], live: { checking: { step: 'checker', at: ago(0) } }, }),
    task('T-803', 'Try 1 running', { runs: [{ started: ago(10) }] }),
    task('T-804', 'At the usual', { runs: [{ started: ago(40), ended: ago(3), agents: [{ kind: 'worker' as const, started: ago(40), ended: ago(3), tokens: { input: 4_000_000 } }] }], live: { checking: { step: 'testing', at: ago(0) } }, }),
    task('T-805', 'At half the usual', { runs: [{ started: ago(40), ended: ago(3), agents: [{ kind: 'worker' as const, started: ago(40), ended: ago(3), tokens: { input: 2_000_000 } }] }], live: { checking: { step: 'testing', at: ago(0) } }, }),
    task('T-806', 'Past twice the usual', { runs: [{ started: ago(40), ended: ago(3), agents: [{ kind: 'worker' as const, started: ago(40), ended: ago(3), tokens: { input: 9_000_000 } }] }], live: { checking: { step: 'testing', at: ago(0) } }, }),
    task('T-807', 'Merged with a checker', { status: 'done', merged: 'abc1235', runs: [{ started: ago(40), ended: ago(3), agents: [{ kind: 'worker' as const, started: ago(40), ended: ago(10), tokens: { input: 3_000_000 } }, { kind: 'checker' as const, started: ago(10), ended: ago(3), tokens: { input: 1_000_000 } }] }], history: [{ kind: 'merged', at: ago(2), text: 'try 1 → merged into main' }] }),
  ]
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: tasks.map(t => viewTask(t)), checker: true, max_parallel: 3 } }
  const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, 120)
  const texts = d.lines.map(lineText)
  const at = (id: string) => texts.findIndex(t => t.includes(` ${id} `)) + 1
  const sub = (id: string) => texts[at(id)] ?? ''
  const warn = (id: string) => (d.lines[at(id)] ?? []).some(s => s.color === 'warning')
  // T-867: no bar
  for (const x of tasks.slice(1)) expect([x.id, /[▕▏█░]/.test(sub(x.id))]).toEqual([x.id, false])
  // (a) try 2 running: try 1's 4M, more coming, 1× the median 4M
  expect(sub('T-801')).toContain('⌀ 4M + … (1×median)')
  // (b) handed back with 1M: the sum, its active time and the worker's share (the checker's 0 left out)
  // T-931: the clock first, " · " between parts, the per-agent tokens in < > without ⌀
  expect(sub('T-802')).toMatch(/^ {2,}try 2\/\d+ · ⏱ 28m · ⌀ 5M \(1\.3×median\) · worker 5M +\w+$/)
  // (c) try 1 running: no < > part (no breakdown yet)
  expect(sub('T-803')).toMatch(/^ {2,}try 1\/\d+ · ⏱ \d+m · ⌀ at hand-back +\w+$/)
  // (d) at the median and at half
  expect(sub('T-804')).toContain('⌀ 4M (1×median)')
  expect(sub('T-805')).toContain('⌀ 2M (0.5×median)')
  expect([warn('T-802'), warn('T-804')]).toEqual([false, false])
  // (e) past twice the median: the warning color, no ⚠
  expect(sub('T-806')).toContain('⌀ 9M (2.3×median)')
  expect(sub('T-806')).not.toContain('⚠')
  expect(warn('T-806')).toBe(true)
  // (f) T-931: merged with worker and checker: both in one < >, no ⌀ inside
  expect(sub('T-807')).toMatch(/try 1\/\d+ · ⏱ \d+m · ⌀ 4M \(1×median\) · worker 3M · checker 1M +\w+$/)
  expect(texts.some(t => t.includes('usual per task'))).toBe(false)
  // narrow: the worker/checker split and ⏱ go first, ⌀ and the try stay
  const narrow = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, 44).lines.map(lineText)
  const n802 = narrow[narrow.findIndex(t => t.includes(' T-802 ')) + 1] ?? ''
  expect([n802.includes('⌀ 5M'), n802.includes('worker'), n802.includes('⏱ 28m'), /try 2\//.test(n802)]).toEqual([true, false, true, true])
})

test('T-709: the Live tab shows a lane for an approved task in review while its tests run (as the Tasks tab counts it in doing)', () => {
  const f0 = viewFile()
  const ago = (s: number) => new Date(NOW - s * 1000).toISOString()
  const approved = { id: 'T-630', title: 'Approved, in its tests', details: '', files: [], status: 'review', note: '', priority: 19, after: [], attempts: 1, history: [], branch: null, created_at: ago(9000), updated_at: ago(60), runs: [{ started: ago(2400), ended: ago(1200) }], live: { checking: { step: 'testing', at: ago(5) } }, } as unknown as SymccTask
  const tasks = [...liveTasks().filter(t => t.status !== 'doing'), approved]
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: tasks.map(t => viewTask(t)), checker: true, max_parallel: 3 } }
  const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, 120)
  const texts = d.lines.map(lineText)
  expect(texts.some(idleLine)).toBe(false)
  expect(d.ids).toEqual(['need:T-601', 'T-630', 'om-all'])
  const lane = liveLanes({ ...f.view, tasks }, NOW)
  // T-846: a task in review has a "you" station; once approved its lane sits past it, at done
  expect(lane.map(l => l.station)).toEqual(['done'])
  // its check step gone stale: it only waits for the owner (T-846), so its lane sits at "you"
  const stale: ViewFile = { ...f, view: { ...f.view, tasks: tasks.map(t => (t.id === 'T-630' ? ({ ...t, live: { checking: { step: 'testing', at: ago(3600) } }, } as unknown as SymccTask) : t)).map(t => viewTask(t)) } }
  expect(liveLanes({ ...f.view, tasks: tasks.map(t => (t.id === 'T-630' ? ({ ...t, live: { checking: { step: 'testing', at: ago(3600) } }, } as unknown as SymccTask) : t)) }, NOW).map(l => l.station)).toEqual(['you'])
  expect(panelLines(parseViewFile(viewFileText(stale)), { tab: 'live', opened: '', cursor: 0 }, NOW, 120).lines.map(lineText).some(idleLine)).toBe(false)
})

test('T-692: in the TUI, l (or a click on the Live tab) shows the Live tab; ↓ and Enter, or a click on a lane, open that task\'s page', async () => {
  const f0 = viewFile()
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: liveTasks().map(t => viewTask(t)), checker: true } }
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 122, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 's', width: 122, focused: true, close: () => undefined, focus: () => undefined } as never) as El
  const settle = () => new Promise<void>(res => setTimeout(res, 0))
  const up = { type: 'up', button: 0, stopPropagation: () => undefined }
  await board.press('l', 's')
  expect(board.state().tab).toBe('live')
  // T-758: ▍Today holds only the figures line (no "next up", no "today" label)
  const liveRows = rowEls(panel).map(r => r.text)
  expect(liveRows.some(r => r.includes('next up'))).toBe(false)
  expect(liveRows[liveRows.findIndex(r => r.startsWith('─── ❯ TODAY ─')) + 2]?.trimStart().startsWith('Now: ⏵ ')).toBe(true)
  expect(liveRows[liveRows.findIndex(r => r.startsWith('─── ❯ TODAY ─')) + 3]?.trimStart().startsWith('✓ ')).toBe(true)
  await board.press('down', 's')
  await board.press('down', 's')
  await board.press('open', 's')
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-612'])
  // T-700: b goes back to the Live tab it was opened from, on its lane (as on the terminal panel and VS Code)
  await board.press('back', 's')
  expect([board.state().tab, board.state().opened, board.state().cursor]).toEqual(['live', '', 2])
  // its page's Back button does the same
  await board.press('open', 's')
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-612'])
  // T-751: the header's "[Live]" (opened from the Live tab, after its arrow)
  const backSeg = rowEls(panel).flatMap(r => r.segs).find(s => (s.kids ?? []).join('') === '[Live]')
  ;(backSeg!.props.onMouseUp as (e: unknown) => void)(up)
  await settle()
  expect([board.state().tab, board.state().opened]).toEqual(['live', ''])
  // a task opened from the Tasks list still goes back to the list
  await board.press('t', 's')
  await board.press('open', 's')
  const fromList = board.state().opened
  expect(fromList === '').toBe(false)
  await board.press('back', 's')
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', ''])
  await board.press('l', 's')
  // a click on the Live tab, then on a lane
  const tabSeg = rowEls(panel).flatMap(r => r.segs).find(s => (s.kids ?? []).join('') === '[l]: Live')
  ;(tabSeg!.props.onMouseUp as (e: unknown) => void)(up)
  await settle()
  expect(board.state().tab).toBe('live')
  const lane = rowEls(panel).find(r => r.text.includes('T-610 Organizational'))!
  ;(lane.el.props.onMouseUp as (e: unknown) => void)(up)
  await settle()
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-610'])
  board.stop()
})

// T-715: the same sample board as tests/live.test.tsx: two lanes (T-712 at work, T-690 at check), todo tasks waiting for
// them, for each other and for a failed task; one free, one waiting for the free one.
const trainTasks = (): SymccTask[] => {
  const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
  const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: ago(300), updated_at: ago(1), ...x }) as unknown as SymccTask
  return [
    task('T-712', 'Scout ordering fix', { runs: [{ started: ago(2) }] }),
    task('T-690', 'Live tab first part', { attempts: 2, runs: [{ started: ago(30), ended: ago(3), agents: [{ kind: 'worker' as const, started: ago(30), ended: ago(3), tokens: { input: 1_400_000 } }, { id: 'agent-c', kind: 'checker' as const, started: ago(3) }] }], live: { checking: { step: 'checker', at: ago(0) } }, history: [{ kind: 'stage', at: ago(3), text: 'try 2: prep started', try: 2, step: 'prep' }] }),
    task('T-701', 'A failed one', { status: 'failed', updated_at: ago(20) }),
    task('T-713', 'Task files: no silent drops', { status: 'todo', after: ['T-712'] }),
    task('T-714', 'Help: /symcc-help shows all', { status: 'todo', after: ['T-713'] }),
    task('T-716', 'Live deps drawn as trains', { status: 'todo', after: ['T-712', 'T-690'] }),
    task('T-717', 'Waits for a todo and a lane', { status: 'todo', after: ['T-690', 'T-713'] }),
    task('T-718', 'Waits for the failed one', { status: 'todo', after: ['T-701'] }),
    task('T-715', 'Free to start', { status: 'todo', priority: -1 }),
    task('T-719', 'Waits for the free one', { status: 'todo', after: ['T-715'] }),
  ]
}

test('T-715: the Live tab hangs the waiting trains under their lanes as the terminal panel does (core\'s trainRows), nothing wider than the panel; no next up line (T-758)', () => {
  const f0 = viewFile()
  const whole = trainTasks()
  const view = { ...f0.view, tasks: whole, checker: true, max_parallel: 3 }
  const f: ViewFile = { ...f0, view: { ...view, tasks: whole.map(t => viewTask(t)) } }
  for (const w of [100, 40]) {
    const lanes = liveLanes(view, NOW)
    const t = liveTrains(view, NOW, lanes)
    const rows = trainRows(t.lanes['T-712']!, liveInner(w))
    expect(rows.map(r => r.id)).toEqual(['T-713', 'T-714', 'T-717', 'T-716'])
    const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const texts = d.lines.map(lineText).map(x => x.replace(/^›/, ' '))
    for (const x of texts) expect([w, x, x.length <= w]).toEqual([w, x, true])
    // right under T-712's two lane lines
    const at = texts.findIndex(x => x.startsWith(`${LIVE_INDENT}▶ T-712 `))
    expect([w, texts.slice(at + 2, at + 2 + rows.length)]).toEqual([w, rows.map(r => LIVE_INDENT + segText(r.segs))])
    // the cursor stops: each lane, then its trains; a click on a train opens it
    expect(d.ids).toEqual(['need:T-701', ...lanes.flatMap(l => [l.id, ...trainRows(t.lanes[l.id]!, liveInner(w)).flatMap(r => (r.id ? [r.id] : []))]), 'om-all'])
    expect(d.hits[d.lines.findIndex(l => lineText(l).includes('└─◇ T-714'))]).toEqual({ open: 'T-714' })
    expect(texts.some(x => x.includes('next up'))).toBe(false)
    expect(texts[texts.findIndex(x => x.startsWith('─── ❯ TODAY ─')) + 3]?.startsWith(`${LIVE_INDENT}✓ `)).toBe(true)
  }
})

test('T-767: the OpenCode Live tab indents by 1 under the headings; a running lane is "▶ " and its id bold in the accent color and its title normal text, a waiting train is all dim', () => {
  const f0 = viewFile()
  const whole = trainTasks()
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: whole.map(t => viewTask(t)), checker: true, max_parallel: 3 } }
  for (const w of [100, 40]) {
    // the cursor on the first stop (T-690), so T-712's lane shows its plain indent
    const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const texts = d.lines.map(lineText)
    for (const x of texts) expect([w, x, x.length <= w]).toEqual([w, x, true])
    expect(LIVE_INDENT).toBe(' ')
    const lane = d.lines[texts.findIndex(x => x.startsWith(' ▶ T-712 '))]!
    expect(lane[0]!.text).toBe(' ')
    const run = lane.slice(1).filter(x => x.text.trim()).slice(0, 3)
    expect(run.map(x => x.text.trim())).toEqual(['▶', 'T-712', run[2]!.text.trim()])
    // T-777: only "▶ " and the id are bold accent; the title is normal text
    expect(run.map(x => [x.color, !!x.bold])).toEqual([['claude', true], ['claude', true], ['text', false]])
    const train = d.lines[texts.findIndex(x => x.includes('└─◇ T-714'))]!.filter(x => x.text.trim())
    // T-819: a waiting train's id is accent, the rest of its row dim
    expect(train.map(x => [x.text, x.color, !!x.bold])).toEqual(train.map(x => (x.text.trim() === 'T-714' ? [x.text, 'claude', true] : [x.text, 'inactive', false])))
    expect(texts[texts.findIndex(x => x.startsWith('─── ❯ TODAY ─')) + 2]?.startsWith(' Now: ⏵ ')).toBe(true)
    expect(texts[texts.findIndex(x => x.startsWith('─── ❯ TODAY ─')) + 3]?.startsWith(' ✓ ')).toBe(true)
  }
})

test('T-715: in the TUI, ↓ to a train and Enter (or a click on it) opens that task; b returns to the Live tab on it', async () => {
  const f0 = viewFile()
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: trainTasks().map(t => viewTask(t)), checker: true } }
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 100, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 's', width: 100, focused: true, close: () => undefined, focus: () => undefined } as never) as El
  const settle = () => new Promise<void>(res => setTimeout(res, 0))
  const up = { type: 'up', button: 0, stopPropagation: () => undefined }
  await board.press('l', 's')
  // ↓ down to T-713, the first train under the T-712 lane
  const ids = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, 100).ids
  for (let i = 0; i < ids.indexOf('T-713'); i++) await board.press('down', 's')
  await board.press('open', 's')
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-713'])
  await board.press('back', 's')
  expect([board.state().tab, board.state().opened, board.state().cursor]).toEqual(['live', '', ids.indexOf('T-713')])
  const train = rowEls(panel).find(r => r.text.includes('└─◇ T-716'))!
  ;(train.el.props.onMouseUp as (e: unknown) => void)(up)
  await settle()
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-716'])
  board.stop()
})

// T-771: a task merged in the last 10 minutes keeps a finished lane (dim, ✓ at "merged", "merged 3m ago") under the
// running ones, at most 3, newest first; one merged 11 minutes ago, failed or dropped tasks get none.
const finishedTasks = (): SymccTask[] => {
  const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
  const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: ago(300), updated_at: ago(1), ...x }) as unknown as SymccTask
  const merged = (id: string, title: string, min: number) => task(id, title, { status: 'done', runs: [{ started: ago(min + 20), ended: ago(min + 2), agents: [{ kind: 'worker' as const, started: ago(min + 20), ended: ago(min + 2), tokens: { input: 900_000 } }] }], history: [{ kind: 'merged', at: ago(min), text: 'try 1 → merged into main' }] })
  return [
    task('T-760', 'A running one', { runs: [{ started: ago(4) }] }),
    merged('T-747', 'Live tab: each section starts with a heading', 3),
    merged('T-748', 'Merged one minute ago', 1),
    merged('T-749', 'Merged five minutes ago', 5),
    merged('T-750', 'Merged seven minutes ago', 7),
    merged('T-740', 'Merged a while ago', 11),
    task('T-741', 'A failed one', { status: 'failed', updated_at: ago(2) }),
    task('T-742', 'A dropped one', { status: 'dropped', updated_at: ago(2) }),
  ]
}

test('T-771: the OpenCode Live tab keeps up to 3 just-merged lanes (dim, ✓ at merged, "merged 3m ago") under the running one; Enter on one opens its page', async () => {
  const f0 = viewFile()
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: finishedTasks().map(t => viewTask(t)), checker: true, max_parallel: 3 } }
  for (const w of [120, 40]) {
    const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const texts = d.lines.map(lineText).map(x => x.replace(/^›/, ' '))
    for (const x of texts) expect([w, x, x.length <= w]).toEqual([w, x, true])
    expect(d.ids.slice(0, 5)).toEqual(['need:T-741', 'T-760', 'T-748', 'T-747', 'T-749'])
    expect(d.ids.includes('T-750') || d.ids.includes('T-740') || d.ids.slice(1).includes('T-741') || d.ids.includes('T-742')).toBe(false)
    const at = texts.findIndex(x => x.startsWith(`${LIVE_INDENT}✓ T-747 `))
    expect(at > texts.findIndex(x => x.startsWith(`${LIVE_INDENT}▶ T-760 `))).toBe(true)
    if (w === 120) expect(texts[at]!).toMatch(/●━+●━+●━+●━+✓ +merged 3m ago$/)
    const lane = d.lines[at]!
    // T-850: "✓ " dim before the id, the id in the accent color, the title dim
    expect(lane.find(x => x.text.includes('✓ '))?.color).toBe('inactive')
    expect(lane.find(x => x.text.includes('T-747'))?.color).toBe('claude')
    expect(lane.filter(x => x.text.includes('Live tab') || x.text.includes('Merged')).every(x => x.color === 'inactive')).toBe(true)
    expect(lane.find(x => x.text === '✓')?.color).toBe('success')
    expect(d.lines[at + 1]!.filter(x => x.text.trim()).every(x => x.color === 'inactive')).toBe(true)
  }
  // Enter on the finished lane opens its page
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 100, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: () => () => undefined,
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  await board.press('l', 's')
  await board.press('down', 's')
  await board.press('down', 's')
  await board.press('down', 's')
  await board.press('open', 's')
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-747'])
  board.stop()
})

test('T-700: the board header (banner, tests/limits line, drive warning, tabs) shows on the list pages only, as on the terminal panel (core\'s showsHeader); a task, question, scout, scout run, role, kind, prompt or (T-704) org-mem page starts with its own title and keeps its footer and buttons', () => {
  const f0 = orgMemViewFile()
  // a session that does not drive, so the banner has its drive warning too
  const f: ViewFile = { ...f0, view: { ...f0.view, driving: false, questions: [{ id: 'Q-9', by: 'lead' as const, text: 'How often?', options: ['daily'], asked_at: AT }] } }
  const W = 140
  const texts = (c: Partial<PanelChoice>) => panelLines(f, { opened: '', cursor: 0, ...c }, NOW, W).lines.map(lineText)
  const header = (t: string[]) => ({
    tests: t.some(l => l.includes('tests: bun test')),
    drive: t.some(l => /⚠ .*\/symcc-drive/.test(l)),
    tabs: t.some(l => l.startsWith('[l]: Live')),
    // the board header's rule, under the tabs (a task's or scout's page has its own heavy rule under its header, T-751)
    rule: t.some((l, i) => /^━+$/.test(l) && !!t[i - 1]?.startsWith('[l]: Live')),
  })
  const all = { tests: true, drive: true, tabs: true, rule: true }
  const none = { tests: false, drive: false, tabs: false, rule: false }
  const lists: [Partial<PanelChoice>, BoardPage][] = [
    [{}, 'tasks'], [{ tab: 'live' }, 'live'], [{ tab: 'scouts' }, 'scouts'], [{ tab: 'settings' }, 'settings'],
    [{ tab: 'settings', opened: 'roles' }, 'roles'], [{ tab: 'settings', opened: 'kinds' }, 'kinds'],
  ]
  const pages: [Partial<PanelChoice>, BoardPage, string][] = [
    [{ opened: 'T-2' }, 'task', 'T-2  '], [{ opened: 'Q-9' }, 'question', 'Q-9'], [{ tab: 'scouts', opened: 'deps' }, 'scout', 'deps'],
    [{ tab: 'scouts', opened: 'docs-check', run: '2026-11-19T11:50:00.000Z' }, 'scout-run', 'docs-check'],
    [{ tab: 'settings', opened: 'role:tester' }, 'role', 'tester'], [{ tab: 'settings', opened: 'kind:bug' }, 'kind', 'bug'],
    [{ tab: 'settings', opened: 'prompt:tester:change' }, 'role-prompt', ''], [{ tab: 'live', opened: 'orgmem' }, 'orgmem', 'Organizational memory'],
  ]
  for (const [c, page] of lists) {
    expect([c, boardPageOf(f, { opened: '', ...c }), showsHeader(page)]).toEqual([c, page, true])
    expect([c, header(texts(c))]).toEqual([c, all])
  }
  for (const [c, page, title] of pages) {
    expect([c, boardPageOf(f, { opened: '', ...c }), showsHeader(page)]).toEqual([c, page, false])
    const t = texts(c)
    expect([c, header(t)]).toEqual([c, none])
    // a task's, scout's or org-mem page starts with its header (T-751, T-790): "‹ [Tasks]", "‹ [Scouts]" or "‹ [Live]" (its Back), then its title
    // (T-871: and a role's page, "‹ [Roles]")
    const head = page === 'task' || page === 'scout' || page === 'orgmem' || page === 'role' ? 1 : 0
    if (title) expect([c, t[head]!.includes(title)]).toEqual([c, true])
    // the footer (its rule and key hints) and the page's Back button stay
    expect([c, t.some(l => /^─+$/.test(l)), t.some(l => l.startsWith('[ Back') || l.includes(' [ Back') || /^‹ \[(Tasks|Scouts|Live|Roles)\]/.test(l))]).toEqual([c, true, true])
  }
})

// ---------------- T-706: the Claude Code buttons OpenCode lacked ----------------

/** defsViewFile with an added role (docs) and an added kind (chore), and (`git`) no git repo or no commit yet. */
function addedViewFile(git?: 'no-repo' | 'no-commits'): ViewFile {
  const f = defsViewFile()
  const docsRole = { name: 'docs', description: 'Writes docs', skills: [], prompt: 'Keep it short.' }
  const choreKind = { name: 'chore', description: 'A small chore', body: 'Do it.' }
  const docs = viewDefs('role', [docsRole], [], [docsRole], [], '.symcc/roles')
  const chore = viewDefs('kind', [choreKind], [], [choreKind], [], '.symcc/kinds')
  return { ...f, view: { ...f.view, roles: [...f.view.roles!, ...docs], kinds: [...f.view.kinds!, ...chore], ...(git ? { git_state: git, branch_note: gitNote(git) } : {}) } }
}

test('T-706: a role\'s and a kind\'s page draw Claude Code\'s Edit and Remove (its order, labels and keys for the same role or task type); the lists draw + New role / + New kind, the Scouts tab + New scout', () => {
  const f = addedViewFile()
  const W = 140
  const texts = (c: Partial<PanelChoice>) => panelLines(f, { opened: '', cursor: 0, ...c }, NOW, W)
  const buttons = (opened: string) => texts({ tab: 'settings', opened }).lines.find(l => lineText(l).startsWith('[ Back ]'))!
  // an added role (T-871: the shared page header, as Claude Code's rolePage): Edit, Prompt, Remove, Turn off; no key line
  const head = (opened: string) => texts({ tab: 'settings', opened }).lines.find(l => lineText(l).startsWith('[Edit]'))!
  expect(lineText(head('role:docs')).replace(/ {2,}/g, ' ')).toBe('[Edit] [Prompt] [Remove] [Turn off]')
  expect(head('role:docs').filter(s => s.hit).map(s => s.hit)).toEqual([{ key: 'e' }, { key: 'p' }, { key: 'd' }, { key: 'o' }])
  expect(texts({ tab: 'settings', opened: 'role:docs' }).lines.map(lineText)).toContain('  added: no built-in to compare')
  expect(panelKeys(f, 'role:docs', 'settings')).toEqual([])
  // a replaced built-in has no Remove (Reset instead), as on Claude Code
  expect(lineText(head('role:tester')).replace(/ {2,}/g, ' ')).toBe('[Edit] [Prompt] [Reset to built-in] [Turn on]')
  // a broken role file with no built-in's name: Claude Code's brokenRolePage: Back and Remove
  expect(panelKeys(f, 'role:oops', 'settings')).toEqual(roleKeys({ canEdit: false, canOff: false, off: false, canReset: false, canRemove: true }))
  // an added kind: Back, Edit, Turn off, Remove
  expect(lineText(buttons('kind:chore'))).toBe('[ Back ] [ Edit ] [ Turn off ] [ Remove ]')
  expect(panelKeys(f, 'kind:chore', 'settings')).toEqual(roleKeys({ canEdit: true, canOff: true, off: false, canReset: false, canRemove: true }))
  expect(panelKeys(f, 'kind:change', 'settings')).toEqual(roleKeys({ canEdit: true, canOff: false, off: false, canReset: false, canRemove: false }))
  // the Roles and Task types lists (T-918): the table, then one plain "+ New role (n)" line (n); no hint line and no Back
  // button (the footer keys say them)
  for (const [list, label, keys] of [['roles', '  + New role (n)', rolesKeys()], ['kinds', '  + New task type (n)', kindsKeys()]] as const) {
    const d = texts({ tab: 'settings', opened: list })
    const t = d.lines.map(lineText)
    const at = t.indexOf(label)
    expect([list, at > 0]).toEqual([list, true])
    expect(t.slice(at + 1).some(x => x.includes('Enter opens') || x.includes('Back (b)'))).toBe(false)
    expect(d.hits[at]).toEqual({ key: 'n' })
    expect(panelKeys(f, list, 'settings')).toEqual(keys)
  }
  // the Scouts tab: "+ New scout" (n) above the scouts; with none, the how-to (all of it) and then the button
  const sc = texts({ tab: 'scouts' })
  const st = sc.lines.map(lineText)
  expect(st.indexOf('[ + New scout ]') >= 0 && st.indexOf('[ + New scout ]') < st.findIndex(l => l.includes('deps'))).toBe(true)
  expect(sc.lines.flat().find(s => s.text === '[ + New scout ]')?.hit).toEqual({ key: 'n' })
  const none = panelLines({ ...f, view: { ...f.view, scouts: [] } }, { tab: 'scouts', opened: '', cursor: 0 }, NOW, W).lines.map(lineText)
  const how = scoutHowTo('symcc')
  expect(none.slice(none.indexOf(how[0]!), none.indexOf(how[0]!) + how.length + 1)).toEqual([...how, '[ + New scout ]'])
})

test('T-706: Edit opens Claude Code\'s edit page: "<name> editing", where Save writes, Save and Cancel (x), then its boxes in Claude Code\'s order with their values or placeholders; no board header', () => {
  const f = addedViewFile()
  const tester = f.view.roles!.find(r => r.name === 'tester')!
  const general = f.view.roles!.find(r => r.name === 'general')!
  const edit = defDraftOf('roles', tester)
  expect(edit).toEqual({ page: 'role:tester', values: { description: 'My tester', model: 'opus', skills: 'tdd', tools: '', code: 'true', checklist: 'Test it well.\nRun them twice.' } })
  const d = panelLines(f, { tab: 'settings', opened: 'role:tester', cursor: EDIT_FIRST_BOX + 1, edit }, NOW, 140)
  const t = d.lines.map(lineText)
  expect(t.slice(0, 4)).toEqual(['tester editing', 'save writes .symcc/roles/tester.md', "the name is the file's name: to rename the role, rename .symcc/roles/tester.md", '[ Save ] [ Cancel (x) ]'])
  expect(d.lines.flat().filter(s => s.text.startsWith('[ ')).map(s => s.hit)).toEqual([{ save: true }, { key: 'x' }])
  // the cursor goes over Save, Cancel and the boxes (as Claude Code's ↑↓): Description, Model, Skills, Tools,
  // Writes (T-918: code or prose only), Checklist; it is on Model here; an empty box shows its placeholder
  expect(d.ids).toEqual(['edit:save', 'edit:cancel', 'box:description', 'box:model', 'box:skills', 'box:tools', 'box:code', 'box:checklist'])
  expect(t.filter(l => /^[› ] (Description|Model|Skills|Tools|Writes|Checklist)$/.test(l))).toEqual(['  Description', '› Model', '  Skills', '  Tools', '  Writes', '  Checklist'])
  expect(t[t.indexOf('  Writes') + 1]).toBe('    code')
  expect(t).toContain('    opus')
  expect(t).toContain('    extra tools: web, to search and read the web (empty: none)')
  expect(t).toContain('    Run them twice.')
  expect(d.hits[t.indexOf('    opus')]).toEqual({ editField: 'model' })
  // the cursor on Save, then on Cancel: the buttons' row is marked, no box is
  for (const [at, mark] of [[0, '[ Save ]'], [1, '[ Cancel (x) ]']] as const) {
    const o = panelLines(f, { tab: 'settings', opened: 'role:tester', cursor: at, edit }, NOW, 140)
    const ot = o.lines.map(lineText)
    expect([at, ot[3], o.lines[3]!.find(s => s.bold && s.text === mark)?.color, ot.filter(l => l.startsWith('› ')).length]).toEqual([at, '› [ Save ] [ Cancel (x) ]', 'claude', 1])
  }
  // Claude Code's edit keys (with Enter, which opens a box here); no banner or tabs (core's showsHeader: role-edit)
  expect(d.keys).toEqual(defEditKeys())
  expect(boardPageOf(f, { tab: 'settings', opened: 'role:tester', edit })).toBe('role-edit')
  expect(t.some(l => l.includes('[t]: Tasks'))).toBe(false)
  // a built-in's Save writes a copy; Save's error shows under the buttons
  const g = panelLines(f, { tab: 'settings', opened: 'role:general', cursor: EDIT_FIRST_BOX, edit: { ...defDraftOf('roles', general), error: noDescriptionText('roles') } }, NOW, 200).lines.map(lineText)
  expect(g).toContain('save writes .symcc/roles/general.md (a copy of the built-in role; Reset to built-in undoes it)')
  expect(g[g.indexOf('[ Save ] [ Cancel (x) ]') + 1]).toBe('description is missing: say in a few words what the role is for')
  // a kind: Description and Body
  const chore = f.view.kinds!.find(k => k.name === 'chore')!
  const k = panelLines(f, { tab: 'settings', opened: 'kind:chore', cursor: EDIT_FIRST_BOX, edit: defDraftOf('kinds', chore) }, NOW, 140)
  expect(k.ids).toEqual(['edit:save', 'edit:cancel', 'box:description', 'box:body'])
  expect(k.lines.map(lineText).slice(0, 3)).toEqual(['chore editing', 'save writes .symcc/kinds/chore.md', '[ Save ] [ Cancel (x) ]'])
  // an edit mode for another page is not drawn
  expect(panelLines(f, { tab: 'settings', opened: 'role:docs', cursor: 0, edit }, NOW, 140).lines.map(lineText).some(l => l.startsWith('[Edit] [Prompt]'))).toBe(true)
  // the commands they send
  expect(actionCommand({ kind: 'def', def: 'role', name: 'docs', action: 'remove' })).toEqual({ name: 'symcc-settings', text: 'role docs remove' })
  expect(actionCommand({ kind: 'def-add', def: 'kind', name: 'chore' })).toEqual({ name: 'symcc-settings', text: 'type chore add' })
  expect(actionCommand({ kind: 'def-add', def: 'role', name: 'remove' })).toEqual({ name: 'symcc-settings', text: 'role remove add' })
  expect(actionCommand({ kind: 'def-save', def: 'role', name: 'docs', fields: { model: '', checklist: '- one\n- two' } })).toEqual({ name: 'symcc-settings', text: 'role docs save {"model":"","checklist":"- one\\n- two"}' })
  expect(actionCommand({ kind: 'scout-new', scout: 'lint', prompt: ' Look for lint. ' })).toEqual({ name: 'symcc-scout', text: 'lint new Look for lint.' })
  expect(actionCommand({ kind: 'scout-new', scout: 'every', prompt: 'look' })).toEqual({ name: 'symcc-scout', text: 'every new look' })
  // what Save refuses before sending (the lead's tool's words): an empty description, a tool a role may not have
  expect(draftError('roles', 'docs', { page: 'role:docs', values: { description: ' ' } })).toBe('description is missing: say in a few words what the role is for')
  expect(draftError('roles', 'docs', { page: 'role:docs', values: { description: 'docs', tools: 'web, foo' } })).toBe(roleTools(['foo']) as string)
  expect(draftError('roles', 'docs', { page: 'role:docs', values: { description: 'docs', tools: 'web', checklist: '- one' } })).toBe('')
  expect(draftError('kinds', 'chore', { page: 'kind:chore', values: { description: 'a chore', body: 'x' } })).toBe('')
  expect(actionCommand({ kind: 'setup-git' })).toEqual({ name: 'symcc-settings', text: 'git setup' })
})

/** startTui on `f` with a fake context: the panel's rows, its keys and clicks, the commands sent and the dialogs' answers. */
async function tuiOn(f: ViewFile) {
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const answers = { prompt: [] as (string | undefined)[], select: [] as unknown[] }
  const asked: string[] = []
  const descs: string[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 142, height: 200 },
    client: { session: { command: async input => void sent.push(unmarked(input)) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async o => (asked.push(o.title), descs.push(o.description ?? ''), answers.prompt.shift()), select: async <V,>(o: { title: string }) => (asked.push(o.title), answers.select.shift() as V | undefined) },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 's', width: 142, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  const settle = () => new Promise<void>(res => setTimeout(res, 0))
  const clickRow = (has: string) => (rowEls(panel).find(r => r.text.includes(has))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  const click = async (label: string) => {
    const seg = rowEls(panel).flatMap(r => r.segs).find(s => s.kids?.join('') === label)
    expect([label, typeof seg?.props.onMouseUp]).toEqual([label, 'function'])
    ;(seg!.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
    for (let i = 0; i < 6; i++) await settle()
  }
  const toSettings = async (row = '', then = '') => {
    await board.press('t', 's')
    await board.press('c', 's')
    for (const g of lines().filter(l => l.includes('▸ '))) clickRow(g.trim().split(' · ')[0]!)
    if (row) clickRow(row)
    if (then) clickRow(then)
  }
  return { board, files, sent, answers, asked, descs, lines, click, clickRow, toSettings }
}

test('T-706: startTui: Remove (d, or a click) asks Claude Code\'s question first; Cancel sends nothing, Yes sends /symcc-settings role|type NAME remove and goes back to the list', async () => {
  const t = await tuiOn(addedViewFile())
  const docs = () => t.toSettings('5 roles', 'Writes docs')
  for (const how of ['key', 'click'] as const) {
    await docs()
    expect(t.board.state().opened).toBe('role:docs')
    t.sent.length = 0
    t.asked.length = 0
    t.answers.select.push('no')
    if (how === 'key') await t.board.press('d', 's')
    else await t.click('[Remove]')
    expect([how, t.asked, t.sent, t.board.state().opened]).toEqual([how, ['Remove role docs and delete .symcc/roles/docs.md?'], [], 'role:docs'])
    t.answers.select.push('yes')
    if (how === 'key') await t.board.press('d', 's')
    else await t.click('[Remove]')
    expect([how, t.sent, t.board.state().opened]).toEqual([how, [{ sessionID: 's', name: 'symcc-settings', text: 'role docs remove' }], 'roles'])
  }
  // a kind the same way; a replaced built-in has no Remove: d does nothing
  await t.toSettings('3 task types', 'A small chore')
  t.sent.length = 0
  t.answers.select.push('yes')
  await t.board.press('d', 's')
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'type chore remove' }])
  await t.toSettings('5 roles', 'My tester')
  t.sent.length = 0
  t.asked.length = 0
  await t.board.press('d', 's')
  expect([t.sent, t.asked]).toEqual([[], []])
  t.board.stop()
})

test('T-706: startTui: Edit (e, or a click) opens the edit page; Enter or a click on a box asks its value; Save sends the changed boxes in one /symcc-settings role|type NAME save {...}; Cancel (x), an empty description or a bad tool word send nothing and keep the page with the error', async () => {
  const t = await tuiOn(addedViewFile())
  const tester = () => t.toSettings('5 roles', 'My tester')
  await tester()
  await t.click('[Edit]')
  expect(t.lines()[0]).toBe('tester editing')
  // down to Model, Enter: a new model; a click on the Checklist box: a new checklist; Save
  await t.board.press('down', 's')
  t.answers.prompt.push('sonnet', 'Check it twice.')
  await t.board.press('open', 's')
  t.clickRow('  Checklist')
  await new Promise<void>(res => setTimeout(res, 0))
  expect(t.lines()).toContain('    sonnet')
  expect(t.lines()).toContain('    Check it twice.')
  t.sent.length = 0
  await t.click('[ Save ]')
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'role tester save {"model":"sonnet","checklist":"Check it twice."}' }])
  // Save leaves the edit page for the role's page
  expect(t.board.state().opened).toBe('role:tester')
  expect(t.lines().some(l => l.includes('editing'))).toBe(false)
  // an emptied description: Save says why and sends nothing; x (Cancel) leaves without saving
  await t.board.press('e', 's')
  t.answers.prompt.push('')
  await t.board.press('open', 's')
  t.sent.length = 0
  await t.click('[ Save ]')
  expect(t.sent).toEqual([])
  expect(t.lines()).toContain('description is missing: say in a few words what the role is for')
  await t.click('[ Cancel (x) ]')
  expect(t.lines().some(l => l.includes('editing'))).toBe(false)
  // a new description and a tool word a role may not have: nothing is sent (not even the description), the page stays
  // with the lead's tool's error, as Claude Code's saveRoleDraft
  await t.board.press('e', 's')
  t.answers.prompt.push('Tests it all', 'foo')
  await t.board.press('open', 's')
  await t.board.press('down', 's')
  await t.board.press('down', 's')
  await t.board.press('down', 's')
  await t.board.press('open', 's')
  expect(t.lines()).toContain('    foo')
  await t.click('[ Save ]')
  expect(t.sent).toEqual([])
  expect(t.lines()[0]).toBe('tester editing')
  expect(t.lines()).toContain(roleTools(['foo']) as string)
  await t.board.press('x', 's')
  await t.board.press('e', 's')
  await t.board.press('x', 's')
  expect(t.lines().some(l => l.includes('editing'))).toBe(false)
  // nothing changed: Save sends nothing; a kind's Body
  await t.toSettings('3 task types', 'A small chore')
  await t.board.press('e', 's')
  await t.click('[ Save ]')
  expect(t.sent).toEqual([])
  await t.board.press('e', 's')
  t.answers.prompt.push('Tidy one thing.')
  t.clickRow('  Body')
  await new Promise<void>(res => setTimeout(res, 0))
  await t.click('[ Save ]')
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'type chore save {"body":"Tidy one thing."}' }])
  t.board.stop()
})

test('T-706: startTui: + New role / + New kind (n, or a click) ask the name and send /symcc-settings role|type NAME add, then open it in the edit page once the view has it; + New scout asks name and instructions and sends /symcc-scout NAME new', async () => {
  const f = addedViewFile()
  const t = await tuiOn(f)
  await t.toSettings('5 roles')
  t.answers.prompt.push('writer')
  t.clickRow('+ New role (n)')
  await new Promise<void>(res => setTimeout(res, 0))
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'role writer add' }])
  expect(t.asked).toEqual(["New role's name"])
  // the engine wrote the new role: the next read opens it in the edit page
  const writerRole = { name: 'writer', ...{ description: 'what this role is for', skills: [], prompt: '- one' } }
  const g: ViewFile = { ...f, view: { ...f.view, roles: [...f.view.roles!, ...viewDefs('role', [writerRole], [], [writerRole], [], '.symcc/roles')] } }
  t.files.set('/work/proj/.symcc/view.json', viewFileText(g))
  await t.board.refresh()
  expect(t.board.state().opened).toBe('role:writer')
  expect(t.lines()[0]).toBe('writer editing')
  // Esc on the name box sends nothing; n on the Kinds page sends kind NAME add
  await t.toSettings('3 task types')
  t.sent.length = 0
  t.answers.prompt.push(undefined)
  await t.board.press('n', 's')
  t.answers.prompt.push('Chores')
  await t.board.press('n', 's')
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'type Chores add' }])
  // + New scout: its name, then what it does
  await t.board.press('s', 's')
  t.sent.length = 0
  t.asked.length = 0
  t.answers.prompt.push('lint', 'Look for lint warnings.')
  await t.click('[ + New scout ]')
  expect(t.asked).toEqual(["New scout's name", 'lint: what it does'])
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-scout', text: 'lint new Look for lint warnings.' }])
  t.answers.prompt.push('lint2', '')
  await t.board.press('n', 's')
  expect(t.sent.length).toBe(1)
  t.board.stop()
})

test('T-706: startTui: + New role / kind / scout with a taken or bad name asks again with the reason (as Claude Code\'s name box) and sends nothing; a taken name never opens the one that is there', async () => {
  const f = addedViewFile()
  expect(newNameError(f, 'role', 'docs')).toBe('a role named docs already exists; open it in the list to change it')
  expect(newNameError(f, 'role', 'DOCS')).toBe('a role named docs already exists; open it in the list to change it')
  expect(newNameError(f, 'kind', 'chore')).toBe('a task type named chore already exists; open it in the list to change it')
  expect(newNameError(f, 'role', 'a/b')).toBe(roleNameError('a/b'))
  expect(newNameError(f, 'role', 'writer')).toBe('')
  expect(newNameError(f, 'scout', 'deps')).toBe('a scout named deps already exists')
  expect(newNameError(f, 'scout', 'Lint')).toBe(leadScoutNameError('Lint'))
  expect(newNameError(f, 'scout', 'lint')).toBe('')
  const t = await tuiOn(f)
  await t.toSettings('5 roles')
  t.sent.length = 0
  t.asked.length = 0
  t.descs.length = 0
  t.answers.prompt.push('docs', 'a/b', undefined)
  await t.board.press('n', 's')
  expect(t.sent).toEqual([])
  expect(t.asked).toEqual(["New role's name", "New role's name", "New role's name"])
  expect(t.descs.slice(1)).toEqual([newNameError(f, 'role', 'docs'), roleNameError('a/b')])
  await t.board.refresh()
  expect([t.board.state().opened, t.lines().some(l => l.includes('editing'))]).toEqual(['roles', false])
  // taken, then a free name: only the free one is sent
  t.answers.prompt.push('docs', 'writer')
  await t.board.press('n', 's')
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'role writer add' }])
  // a taken scout name asks again; its instructions are asked only for a free name
  await t.board.press('s', 's')
  t.sent.length = 0
  t.asked.length = 0
  t.answers.prompt.push('deps', 'lint', 'Look for lint.')
  await t.board.press('n', 's')
  expect(t.asked).toEqual(["New scout's name", "New scout's name", 'lint: what it does'])
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-scout', text: 'lint new Look for lint.' }])
  t.board.stop()
})

test('T-706: startTui: on the edit page the keyboard reaches Save and Cancel (↑ from the first box, as Claude Code\'s), and Enter on them saves or leaves', async () => {
  const t = await tuiOn(addedViewFile())
  await t.toSettings('5 roles', 'My tester')
  await t.board.press('e', 's')
  // the cursor starts on Description (Claude Code's autoFocus)
  expect(t.lines().filter(l => l.startsWith('› '))).toEqual(['› Description'])
  await t.board.press('down', 's')
  t.answers.prompt.push('sonnet')
  await t.board.press('open', 's')
  t.sent.length = 0
  await t.board.press('up', 's')
  await t.board.press('up', 's')
  expect(t.lines().filter(l => l.startsWith('› '))).toEqual(['› [ Save ] [ Cancel (x) ]'])
  await t.board.press('up', 's')
  await t.board.press('open', 's')
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'role tester save {"model":"sonnet"}' }])
  expect(t.lines().some(l => l.includes('editing'))).toBe(false)
  // Enter on Cancel leaves without saving
  await t.board.press('e', 's')
  t.answers.prompt.push('Other')
  await t.board.press('open', 's')
  await t.board.press('up', 's')
  t.sent.length = 0
  await t.board.press('open', 's')
  expect(t.sent).toEqual([])
  expect([t.board.state().opened, t.lines().some(l => l.includes('editing'))]).toEqual(['role:tester', false])
  t.board.stop()
})

test('T-706: startTui: Set up git (g, or the banner\'s button) asks a yes first, then sends /symcc-settings git setup; Cancel sends nothing; no git row, or a page without the banner: g does nothing', async () => {
  const t = await tuiOn(addedViewFile('no-repo'))
  for (const how of ['key', 'click'] as const) {
    await t.board.press('t', 's')
    t.sent.length = 0
    t.asked.length = 0
    t.answers.select.push('no')
    if (how === 'key') await t.board.press('g', 's')
    else await t.click('[ Set up git (g) ]')
    expect([how, t.asked, t.sent]).toEqual([how, [SETUP_GIT_ASK], []])
    t.answers.select.push('yes')
    if (how === 'key') await t.board.press('g', 's')
    else await t.click('[ Set up git (g) ]')
    expect([how, t.sent]).toEqual([how, [{ sessionID: 's', name: 'symcc-settings', text: 'git setup' }]])
  }
  // on a task's page (no banner) g asks nothing
  await t.board.press('t', 's')
  await t.board.press('open', 's')
  expect(t.board.state().opened === '').toBe(false)
  t.asked.length = 0
  await t.board.press('g', 's')
  expect(t.asked).toEqual([])
  t.board.stop()
  // git set up: no row and g asks nothing
  const ok = await tuiOn(addedViewFile())
  expect(ok.lines().some(l => l.includes('Set up git'))).toBe(false)
  await ok.board.press('g', 's')
  expect(ok.asked).toEqual([])
  ok.board.stop()
})

test('T-861/T-887: opening the board (/symcc-board) sends no /symcc-settings git check, with git ok or not', async () => {
  for (const [state, want] of [['no-repo', 0], ['no-commits', 0], [undefined, 0]] as const) {
    const f = fakeCtx({})
    const sent: { name: string; text: string }[] = []
    const ctx: TuiContext = { ...f.ctx, client: { session: { command: async i => void sent.push(unmarked(i)) } } }
    const board = startTui(ctx, { runtime: fakeRuntime(), readText: async () => viewFileText(addedViewFile(state)), every: () => () => undefined, now: () => NOW })
    await board.refresh()
    f.slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 's' } as never)
    const open = f.layers.flatMap(l => l.commands ?? []).find(c => c.id === 'symcc.board.open')!
    if (f.current()) await open.run() // the board came up on its own (open_now): close it, then open it by hand
    await open.run()
    for (let i = 0; i < 6; i++) await new Promise<void>(res => setTimeout(res, 0))
    expect(sent.filter(s => s.name === 'symcc-settings' && s.text === 'git check').length).toBe(want)
    board.stop()
  }
})

// ---------------- T-727: the Live tab's Branches section ----------------
/** The Branches sample (tests/branches-fixture.ts) as a view file at NOW. */
function branchesViewFile(): ViewFile {
  const f = viewFile()
  return { ...f, view: { ...f.view, tasks: branchTasks(NOW) as never[], branches: branchFactsAt(NOW), checker: true } }
}

test('T-727: the OpenCode Live tab draws the Branches section under the lanes as core lays it out, at 100 and 40 columns', () => {
  const f = branchesViewFile()
  expect(parseViewFile(viewFileText(f))!.view.branches).toEqual(f.view.branches)
  expect(parseViewFile(viewFileText({ ...f, view: { ...f.view, branches: 'x' as never } }))!.view.branches).toBe(undefined)
  for (const w of [100, 40]) {
    const d = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const lines = d.lines.map(lineText).map(x => x.replace(/^›/, ' '))
    const b = liveBranches(f.view, NOW, w)!
    const want = [segText(b.head), ...[b.main, ...b.rows.map(r => r.segs)].map(x => LIVE_INDENT + segText(x))]
    if (w === 100) expect(want).toEqual(BRANCH_LINES_100)
    const at = lines.indexOf(want[0]!)
    expect(at).toBeGreaterThan(0)
    // T-789: an empty line under the heading
    expect(lines[at + 1]!.trim()).toBe('')
    expect([lines[at], ...lines.slice(at + 2, at + 1 + want.length)]).toEqual(want)
    for (const l of want) expect([...l].length <= w).toBe(true)
    // the task rows are cursor stops, after the lane
    expect(d.ids.filter(id => id.startsWith('br:'))).toEqual(['br:T-724', 'br:T-721', 'br:T-725', 'br:T-726'])
  }
  // no figures: no section
  const none = panelLines(viewFile(), { tab: 'live', opened: '', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(none.some(l => l.includes('BRANCHES'))).toBe(false)
})

test('T-913: the OpenCode Branches rows say each task\'s state (paused, failed, waiting, in review, running) in the board\'s colour; narrow rows keep the mark', () => {
  const f = viewFile()
  const v = { ...f, view: { ...f.view, tasks: branchStateTasks(NOW) as never[], branches: branchStateFactsAt(NOW), checker: true } }
  const d = panelLines(v, { tab: 'live', opened: '', cursor: 0 }, NOW, 100)
  const lines = d.lines.map(lineText).map(x => x.replace(/^›/, ' '))
  for (const row of BRANCH_STATE_ROWS_100) expect(lines.includes(row)).toBe(true)
  const stateColor = (word: string) => d.lines.flat().find(s => s.text === word)?.color
  expect([stateColor(' ✗ failed'), stateColor(' ? waiting'), stateColor(' ◆ in review'), stateColor(' ⊛ test'), stateColor(' ‖ paused')]).toEqual([LIST_TONE.failed, LIST_TONE.waiting, LIST_TONE.review, LIST_TONE.doing, LIST_TONE.paused])
  for (const w of [40, 30]) {
    const narrow = panelLines(v, { tab: 'live', opened: '', cursor: 0 }, NOW, w).lines.map(lineText)
    for (const x of ['T-5 ✗', 'T-6 ?', 'T-7 ◆', 'T-8 ⊛', 'T-47 ‖']) expect(narrow.some(l => l.includes(`${x} +1`))).toBe(true)
    for (const l of narrow) expect(textWidthOf(l) <= w).toBe(true)
  }
})

test('T-727: tasks as the OpenCode TUI draws them (viewTask, then viewStubFilled: slim done tasks get history: []) still show the "◀ T-n merged" row and today\'s merged / sent-back counts', () => {
  const f = branchesViewFile()
  const tui = (ts: readonly unknown[]) => (ts as SymccTask[]).map(t => viewStubFilled(viewTask(t)))
  const kinds = (tasks: SymccTask[]) => liveBranches({ ...f.view, tasks }, NOW, 100)!.rows.map(r => segText(r.segs))
  const slim = tui(f.view.tasks).find(t => t.id === 'T-724')!
  expect(slim.history).toEqual([])
  expect(kinds(tui(f.view.tasks))).toEqual(kinds(f.view.tasks as SymccTask[]))
  expect(kinds(tui(f.view.tasks)).some(l => l.includes('◀ T-724  merged 3m ago'))).toBe(true)
  // the same through the whole TUI path: the parsed view file, then viewStubFilled
  const parsed = parseViewFile(viewFileText({ ...f, view: { ...f.view, tasks: (f.view.tasks as SymccTask[]).map(t => viewTask(t)) } }))!
  expect(kinds(parsed.view.tasks.map(t => viewStubFilled(t)))).toEqual(kinds(f.view.tasks as SymccTask[]))
  // today: the T-692 sample (one merged after a send-back, one more send-back in doing)
  const whole = liveTasks()
  const today = liveToday(tui(whole), NOW, 0)
  expect(today).toEqual(liveToday(whole, NOW, 0))
  expect([today.merged, today.sentBack, today.failed]).toEqual([1, 2, 1])
})

test('T-727: startTui: Enter on a Branches row opens its task, b returns to the Live tab; a click on a row opens its task', async () => {
  const f = branchesViewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText({ ...f, view: { ...f.view, tasks: (f.view.tasks as SymccTask[]).map(t => viewTask(t)) } })]])
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 100 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 102, focused: true, close: () => undefined } as never) as El
  await board.press('l', 'ses_1')
  const ids = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, 100).ids
  for (let i = 0; i < ids.indexOf('br:T-725'); i++) await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-725'])
  await board.press('back', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['live', ''])
  // the view file's done task is slim (viewTask): its merge still shows as joining back
  expect(rowEls(panel).some(r => r.text.includes('◀ T-724  merged 3m ago'))).toBe(true)
  const row = rowEls(panel).find(r => r.text.includes('T-721 ▶ running · +3 commits'))!
  const seg = row.segs.find(x => x.props.onMouseUp)!
  ;(seg.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
  expect([board.state().tab, board.state().opened]).toEqual(['tasks', 'T-721'])
  board.stop()
})

// ---------------- T-738: one empty line above each Live tab section ----------------
// T-747: each section starts with a "▍Name" heading (Tasks first; T-938: the mode line is ▍Today's "Now:" row), no "── Name ──" rules left
test('T-738, T-747: the OpenCode Live tab has a ▍heading for each section, one empty line above each, none above the first', () => {
  // T-786: nothing waits for the owner here (▍Needs you has its own test)
  const calm = ((f: ViewFile): ViewFile => ({ ...f, view: { ...f.view, tasks: f.view.tasks.filter(t => !['review', 'waiting', 'failed'].includes(t.status) && !(t as { time_ask?: string }).time_ask) } }))(branchesViewFile())
  // T-915: "─── ❯ NAME ───…" at 100, 80 and 40 columns; when too narrow for that, "─ ❯ NAME" with the name cut
  expect([segText(liveHeading('Branches', 12)), segText(liveHeading('Branches', 8))]).toEqual(['─ ❯ BRANCHES', '─ ❯ BRA…'])
  for (const w of [100, 80, 40]) {
    const d = panelLines(calm, { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const lines = d.lines.map(lineText)
    expect(lines[0]!.trim() === '').toBe(false)
    const mode = lines.findIndex(l => l.startsWith('─── ❯ TASKS ')) - 1
    expect([mode >= 0, lines[mode + 1]]).toEqual([true, `─── ❯ TASKS ${'─'.repeat(w - 12)}`])
    // T-938: the mode line only as ▍Today's first row (under the heading and its empty line)
    const todayAt = lines.findIndex(l => l.startsWith('─── ❯ TODAY '))
    expect(lines.filter(l => l.includes(' busy'))).toEqual([lines[todayAt + 2]!])
    expect(lines[todayAt + 2]!.startsWith(`${LIVE_INDENT}Now: ⏵ `)).toBe(true)
    const heads = lines.filter(l => ['─── ❯ TASKS ─', '─── ❯ BRANCHES ─', '─── ❯ TODAY ─'].some(h => l.startsWith(h)) || l.startsWith('─── ❯ ORG'))
    expect(heads.slice(0, 3).map(h => h.split(' ')[2])).toEqual(['TASKS', 'BRANCHES', 'TODAY'])
    // T-810: each heading runs to the page width with its thin rule; the org-mem one has no bar
    for (const h of heads) expect([h, textWidthOf(h)]).toEqual([h, w])
    expect(heads[3]).not.toContain('▕')
    // T-933: the key line is the very last lines, below the footer's key hints (none in the body)
    const keyAt = lines.findIndex(l => l.trimStart().startsWith('✧ = an agent works here'))
    expect([keyAt > lines.length - d.footer, lines.slice(keyAt)]).toEqual([true, liveLegend(liveInner(w)).map(x => LIVE_INDENT + x)])
    // T-962: no divider: the legend comes right under the keys line
    expect(lines[keyAt - 1]!.includes('Esc close')).toBe(true)
    expect([heads.length, heads[3]!.startsWith(w === 100 ? '─── ❯ ORGANIZATIONAL MEMORY   ' : '─── ❯ ORG')]).toEqual([4, true])
    // no section rules in the body (the footer's rule is under it)
    expect(lines.slice(mode, lines.length - d.footer).some(l => l.includes('✧ ='))).toBe(false)
    expect(lines.slice(mode, lines.length - d.footer).filter(l => (!l.startsWith('─── ❯ ') && l.includes('── ')) || /^─+$/.test(l))).toEqual([])
    // the heading's bar and name are drawn in the task page's heading color, bold
    expect(d.lines[mode + 1]!.map(x => [x.color, x.bold]).slice(0, 1)).toEqual([['suggestion', true]])
    // T-820: the rule after the title has the title's color, not dim
    expect(d.lines[mode + 1]!.map(x => x.color)).toEqual(['suggestion', 'suggestion', 'suggestion'])
    const isHeads = [(l: string) => l.startsWith('─── ❯ BRANCHES'), (l: string) => l.startsWith('─── ❯ TODAY'), (l: string) => l.startsWith('─── ❯ ORG')]
    for (const isHead of isHeads) {
      const at = lines.findIndex(isHead)
      expect(at > 1).toBe(true)
      expect([lines[at], lines[at - 1]!.trim()]).toEqual([lines[at]!, ''])
      expect([lines[at], lines[at - 2]!.trim() === '']).toEqual([lines[at]!, false])
      expect([lines[at], lines[at + 1]!.trim()]).toEqual([lines[at]!, ''])
    }
  }
})

test('T-930, T-933: the OpenCode Live tab draws the legend as the very last lines, below the footer key line; blank rows go above the footer', () => {
  const f = branchesViewFile()
  const w = 80
  const legend = liveLegend(liveInner(w)).map(x => LIVE_INDENT + x)
  const hintAt = (ls: string[]) => ls.findIndex(l => l.includes('Esc close'))
  // a short page: the blank rows go between the content and the footer; the legend under the key line, last
  const short = panelLines(f, { tab: 'live', opened: '', cursor: 0, rows: 200 }, NOW, w)
  const lines = short.lines.map(lineText)
  expect(lines.length).toBe(200)
  expect(lines.slice(-legend.length)).toEqual(legend)
  const foot = lines.slice(lines.length - short.footer)
  expect([foot[0], hintAt(foot) >= 0, hintAt(foot) < foot.length - legend.length]).toEqual(['─'.repeat(w), true, true])
  const body = lines.slice(0, lines.length - short.footer)
  expect(body.at(-1)!.trim()).toBe('')
  expect(body.some(l => l.includes('✧ ='))).toBe(false)
  // the hits stay with their lines (a blank row opens nothing; the footer's rows line up)
  expect(short.hits.length).toBe(short.lines.length)
  // a long page (a low panel): the legend stays the last lines, at the top and scrolled to the end
  const rows = 20
  for (const scroll of [0, 999]) {
    const d = panelLines(f, { tab: 'live', opened: '', cursor: 0, rows, scroll }, NOW, w)
    const ls = d.lines.map(lineText)
    expect([ls.length, ls.slice(-legend.length)]).toEqual([rows, legend])
    expect(ls.slice(0, ls.length - d.footer).some(l => l.includes('✧ ='))).toBe(false)
  }
  // narrow: the legend is cut to the width, the key line still above it
  const narrow = panelLines(f, { tab: 'live', opened: '', cursor: 0, rows: 60 }, NOW, 30).lines.map(lineText)
  expect(narrow.every(l => textWidthOf(l) <= 30)).toBe(true)
  expect(narrow.at(-1)!.trim().length > 0 && narrow.findIndex(l => l.includes('✧ =')) > hintAt(narrow)).toBe(true)
})

/** T-756: a fake tui context whose ui.panel.open says no until `shown.session` is set (OpenCode's home page first). */
function startCtx(view: Partial<PaneView>) {
  const f = viewFile()
  let text = viewFileText({ ...f, view: { ...f.view, ...view } })
  let mark: { session: string; at: number } | undefined
  let cur: Partial<PaneView> = view
  const write = () => void (text = viewFileText({ ...f, ...(mark ? { open_now: mark } : {}), view: { ...f.view, ...cur } }))
  const setView = (v: Partial<PaneView>) => void ((cur = v), write())
  /** T-841: /symcc-enable ran in this session (the engine writes the one-time mark) */
  const enableIn = (session: string, v: Partial<PaneView>) => void ((mark = { session, at: (mark?.at ?? NOW) + 1 }), (cur = v), write())
  const fc = fakeCtx({})
  /** T-841: the window shows this session (its composer slot is drawn with the id) */
  const showSession = (id: string) => void (fc.slots.find(x => x.append === 'session.composer.top')!.render({ sessionID: id } as never))
  const shown = { session: false }
  const opens: string[] = []
  let current: { name: string; sessionID: string } | undefined
  const panel = {
    open: (name: string) => (opens.push(name), shown.session ? ((current = { name, sessionID: 's' }), true) : false),
    close: () => void (current = undefined),
    current: () => current,
  }
  const board = startTui({ ...fc.ctx, ui: { ...fc.ctx.ui, panel } }, { runtime: fakeRuntime(), readText: async () => text, every: () => () => undefined, now: () => NOW })
  return { board, shown, opens, toasts: fc.toasts, current: () => current, panel, setView, enableIn, showSession }
}

test('T-756: with open_on_start on, the board panel opens by itself once a session is shown (no toast before), and not again after it is closed', async () => {
  const s = startCtx({ open_on_start: true, on_here: true })
  await s.board.refresh()
  // no session yet: it waits, with no toast
  expect(s.current()).toBe(undefined)
  expect(s.toasts.length).toBe(0)
  s.shown.session = true
  await s.board.refresh()
  expect(s.current()?.name).toBe(BOARD_PANEL)
  // the owner closes it: later reads don't open it again
  s.panel.close()
  const tried = s.opens.length
  await s.board.refresh()
  await s.board.refresh()
  expect(s.current()).toBe(undefined)
  expect(s.opens.length).toBe(tried)
  expect(s.toasts.length).toBe(0)
  s.board.stop()
})

test('T-756: with open_on_start off, or symcc off, the board panel never opens by itself', async () => {
  for (const view of [{ open_on_start: false, on_here: true }, { open_on_start: true, on_here: false }]) {
    const s = startCtx(view)
    s.shown.session = true
    await s.board.refresh()
    await s.board.refresh()
    expect(s.opens.length).toBe(0)
    expect(s.current()).toBe(undefined)
    expect(s.toasts.length).toBe(0)
    s.board.stop()
  }
})

test('T-756: open_on_start turned off, or symcc turned off, while it waits for a session: the board does not open', async () => {
  for (const later of [{ open_on_start: false, on_here: true }, { open_on_start: true, on_here: false }]) {
    const s = startCtx({ open_on_start: true, on_here: true })
    await s.board.refresh()
    expect(s.current()).toBe(undefined)
    s.setView(later)
    s.shown.session = true
    await s.board.refresh()
    // turned back on later in the same run: still not by itself
    s.setView({ open_on_start: true, on_here: true })
    await s.board.refresh()
    expect(s.current()).toBe(undefined)
    expect(s.toasts.length).toBe(0)
    s.board.stop()
  }
})

test('T-841: /symcc-enable in this window\'s session opens the board; other windows\' writes never reopen a closed one', async () => {
  // symcc off in a new project: nothing opens; then /symcc-enable runs in this window's session
  const s = startCtx({ open_on_start: true, on_here: false })
  s.shown.session = true
  s.showSession('me')
  await s.board.refresh()
  expect(s.current()).toBe(undefined)
  s.enableIn('me', { open_on_start: true, on_here: true })
  await s.board.refresh()
  expect(s.current()?.name).toBe(BOARD_PANEL)
  // already open: not opened twice
  const n = s.opens.length
  await s.board.refresh()
  expect(s.opens.length).toBe(n)
  // the owner closes it; another window (off here, then on) writes the file: nothing reopens
  s.panel.close()
  s.setView({ open_on_start: true, on_here: false, off_here: 'other' } as never)
  await s.board.refresh()
  s.setView({ open_on_start: true, on_here: true })
  await s.board.refresh()
  expect(s.current()).toBe(undefined)
  expect(s.opens.length).toBe(n)
  s.board.stop()
})

test('T-841: /symcc-enable opens the board on the Live tab, not the last used tab', async () => {
  const s = startCtx({ open_on_start: true, on_here: true })
  s.shown.session = true
  s.showSession('me')
  await s.board.refresh()
  await s.board.press('t', 'me')
  expect(s.board.state().tab).toBe('tasks')
  s.panel.close()
  s.setView({ open_on_start: true, on_here: false })
  await s.board.refresh()
  s.enableIn('me', { open_on_start: true, on_here: true })
  await s.board.refresh()
  expect(s.current()?.name).toBe(BOARD_PANEL)
  expect(s.board.state().tab).toBe('live')
  s.board.stop()
})

test('T-841: /symcc-enable in another session, or with open_on_start off, opens nothing', async () => {
  const a = startCtx({ open_on_start: true, on_here: false })
  a.shown.session = true
  a.showSession('me')
  a.enableIn('someone-else', { open_on_start: true, on_here: true })
  await a.board.refresh()
  expect(a.current()).toBe(undefined)
  a.board.stop()
  const b = startCtx({ open_on_start: false, on_here: false })
  b.shown.session = true
  b.showSession('me')
  b.enableIn('me', { open_on_start: false, on_here: true })
  await b.board.refresh()
  expect(b.current()).toBe(undefined)
  b.board.stop()
})

// ---------------- T-761: the task page's Branch section ----------------
test('T-761: the OpenCode task page draws the Branch section from the view file: tries, a catch-up, a merge, a cut history; none for a task with no branch', () => {
  const f = viewFile()
  const g: ViewFile = { ...f, view: { ...f.view, tasks: taskBranchTasks(NOW) as never[], task_branches: { 'T-733': taskBranchDoing(NOW), 'T-734': taskBranchMerged(NOW), 'T-735': taskBranchLong(NOW) } } }
  // the view file keeps the facts; a broken one is left out
  expect(parseViewFile(viewFileText(g))!.view.task_branches).toEqual(g.view.task_branches)
  expect(Object.keys(parseViewFile(viewFileText({ ...g, view: { ...g.view, task_branches: { ...g.view.task_branches, 'T-9': { branch: 1 } as never } } }))!.view.task_branches ?? {})).toEqual(['T-733', 'T-734', 'T-735'])
  const page = (id: string, w: number) => panelLines(g, { opened: id, cursor: 0 }, NOW, w).lines.map(lineText).map(x => x.replace(/^›/, ' '))
  const want = (id: string, facts: TaskBranchFacts, w: number) => {
    const t = g.view.tasks.find(x => x.id === id)!
    return taskSections(t, { width: w, nowMs: NOW, detail: { roles: [], kinds: [], all: [], when: (x: string) => x }, branch: facts }).find(s => s.id === 'branch')!
  }
  // doing: the heading, main's line, the fork and the catch-up, the commits with their tries, in that order, under Details
  const doing = page('T-733', 100)
  const sec = want('T-733', taskBranchDoing(NOW), 100)
  expect(sec.title).toBe('Branch  symcc/T-733 · 3 commits · 10 behind main')
  const at = doing.indexOf(`▍${sec.title}`)
  expect(at).toBeGreaterThan(doing.findIndex(l => l.startsWith('▍Details')))
  expect(doing.slice(at + 1, at + 1 + sec.lines.length)).toEqual(sec.lines.map(l => segText(l.segs as never)))
  expect(doing[at + 2]).toContain('⇣ caught up')
  expect(doing[at + 4]!.trim()).toBe('638235d  a077ff8        4825c84')
  expect(doing[at + 5]!.trim()).toBe('try 2    try 4          try 6')
  // merged: the line goes up into main with its sha
  const merged = page('T-734', 100)
  expect(merged.some(l => /╯ merged \d\d:\d\d \(cdcdcdc\)$/.test(l))).toBe(true)
  expect(merged).toContain('▍Branch  symcc/T-733 · 3 commits · merged into main')
  // a long history: the latest commits and "… N earlier", never wider than the page
  for (const w of [100, 60, 40]) {
    const long = page('T-735', w)
    const h = long.findIndex(l => l.startsWith('▍Branch'))
    expect(long.slice(h, h + 7).some(l => /^ +… \d+ earlier$/.test(l))).toBe(true)
    for (const l of long.slice(h, h + 7)) expect([l, [...l].length <= w]).toEqual([l, true])
  }
  // to do, never started: no Branch section
  expect(page('T-736', 100).some(l => l.startsWith('▍Branch'))).toBe(false)
})

test('T-770: the Live tab\'s mode line ends in "⌕ gaps-bot 4m" while scouts run, "⌕ N scouts" when the names don\'t fit, and a click on it opens the Scouts tab', () => {
  const f0 = viewFile()
  const base = { ...f0.view, tasks: liveTasks(), checker: true, max_parallel: 3 }
  const runs = [{ name: 'board-review', since: NOW - 60_000 }, { name: 'gaps-bot', since: NOW - 4 * 60_000 }]
  const draw = (running: typeof runs | undefined, w: number) => {
    const scouts = (running ?? []).map(r => ({ name: r.name, every_minutes: 0, running: true, started: true, last_run: new Date(r.since).toISOString() }))
    const f = parseViewFile(viewFileText({ ...f0, view: { ...base, scouts } }))!
    const d = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const i = d.lines.findIndex(l => lineText(l).includes('Now: '))
    return { text: lineText(d.lines[i]!), segs: d.lines[i]! }
  }
  // T-938: the mode line is ▍Today's first row, " Now: …"
  const head = `${LIVE_INDENT}Now: ${liveHeader(base, liveLanes(base, NOW))}`
  expect(draw(undefined, 80).text).toBe(head)
  expect(draw([runs[1]!], 80).text).toBe(`${head} · ⌕ gaps-bot 4m`)
  expect(draw(runs, 80).text).toBe(`${head} · ⌕ gaps-bot 4m, board-review 1m`)
  expect(draw(runs, 50).text).toBe(`${head} · ⌕ 2 scouts`)
  expect(draw(runs, 44).text).toBe(`${head} · ⌕ 2`)
  for (const w of [120, 80, 44, 32]) expect([w, textWidthOf(draw(runs, w).text) <= w]).toEqual([w, true])
  // narrower than the label and the mode line: "agents n/m busy" goes too, the mode stays
  expect(draw(runs, 32).text).toBe(`${LIVE_INDENT}Now: ⏵ auto merge`)
  // the label dim, the mode bold
  expect(draw(undefined, 80).segs.filter(s => s.text.trim()).map(s => [s.text, s.color, !!s.bold])).toEqual([['Now: ', 'inactive', false], [liveHeader(base, liveLanes(base, NOW)), 'text', true]])
  const segs = draw([runs[1]!], 80).segs
  expect(segs.find(s => s.text === '⌕')?.color).toBe('suggestion')
  expect(segs.find(s => s.text === '⌕')?.hit).toEqual({ tab: 'scouts' })
  expect(segs.find(s => s.text === ' gaps-bot 4m')?.color).toBe('inactive')
})

test('T-847: the OpenCode Live tab\'s mode line shows the next scout due, after the running ones, and drops it first on a narrow panel; paused and on-demand scouts are never next', () => {
  const f0 = viewFile()
  const base = { ...f0.view, tasks: liveTasks(), checker: true, max_parallel: 3 }
  const min = (m: number) => new Date(NOW + m * 60_000).toISOString()
  const idle = [
    { name: 'simplify', every_minutes: 60, running: false, last_run: null, next_run: min(40) },
    { name: 'gaps-bot', every_minutes: 30, running: false, last_run: null, next_run: min(12) },
    { name: 'paused-one', every_minutes: 30, paused: true, running: false, last_run: null, next_run: min(1) },
    { name: 'manual', every_minutes: 0, running: false, last_run: null, next_run: min(2) },
  ]
  const running = { name: 'board-review', every_minutes: 30, running: true, started: true, last_run: new Date(NOW - 60_000).toISOString(), next_run: min(30) }
  const draw = (scouts: unknown[], w: number) => {
    const f = parseViewFile(viewFileText({ ...f0, view: { ...base, scouts } as never }))!
    const d = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    return lineText(d.lines[d.lines.findIndex(l => lineText(l).includes('Now: '))]!)
  }
  // T-938: the mode line is ▍Today's first row, " Now: …"
  const head = `${LIVE_INDENT}Now: ${liveHeader(base, liveLanes(base, NOW))}`
  expect(draw(idle, 80)).toBe(`${head} · ⌕ next: gaps-bot in 12m`)
  expect(draw([running, ...idle], 100)).toBe(`${head} · ⌕ board-review 1m · next: gaps-bot in 12m`)
  expect(draw([running, ...idle], head.length + 24)).toBe(`${head} · ⌕ board-review 1m`)
  expect(draw(idle, head.length + 5)).toBe(head)
  expect(draw(idle.slice(2), 80)).toBe(head)
})

test('T-772: the OpenCode Live tab draws the org-mem meter at 30 / 60 and 60 / 60 in the same calm colors (dim count, the quiet bar color), never the warning color', () => {
  const looks: string[] = []
  for (const n of [30, 60]) {
    const f = orgMemViewFile(Array.from({ length: n }, (_, i) => `- 2026-11-20 [tests] note number ${i + 1}`).join('\n') + '\n')
    const live = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, 140)
    const head = live.lines.find(l => lineText(l).startsWith('─── ❯ ORGANIZATIONAL MEMORY'))!
    const count = head.find(x => x.text === `${n} / 60`)
    expect(head.some(x => x.text.includes('▕'))).toBe(false)
    expect([n, count?.color]).toEqual([n, 'inactive'])
    expect(head.some(x => x.color === 'warning')).toBe(false)
    looks.push(`${count?.color}`)
  }
  expect(looks[0]).toBe(looks[1]!)
})

test('T-786: the OpenCode Live tab has ▍Needs you first (above ▍Tasks) with a warning row each for a question, a waiting and a review task; the cursor starts on them; none when nothing waits; never wider than the page', () => {
  const f0 = viewFile()
  const f: ViewFile = { ...f0, view: { ...f0.view, questions: [{ id: 'Q-88', by: 'lead' as const, text: 'Which figures should go on the Today 4th line?', options: [], asked_at: AT }] } }
  for (const w of [120, 40]) {
    const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, w)
    const texts = d.lines.map(lineText).map(x => x.replace(/^›/, ' '))
    for (const x of texts) expect([w, x, x.length <= w]).toEqual([w, x, true])
    const head = texts.findIndex(x => x.startsWith('─── ❯ NEEDS YOU ─'))
    expect(head).toBeGreaterThan(-1)
    expect(head).toBeLessThan(texts.findIndex(x => x.startsWith('─── ❯ TASKS ─')))
    const rows = texts.slice(head + 2, texts.findIndex(x => x.startsWith('─── ❯ TASKS ─')) - 1)
    expect(texts[head + 1]!.trim()).toBe('')
    expect(rows.length).toBe(3)
    expect(rows[0]!.startsWith(' ⚠ Q-88')).toBe(true)
    expect(rows.some(x => x.includes('T-2') && x.includes('ready for review'))).toBe(true)
    expect(rows.some(x => x.includes('T-3') && x.includes('asks'))).toBe(true)
    for (const i of [2, 3, 4]) expect(d.lines[head + i]!.every(x => x.color === 'warning' || x.text === '›' || x.text.trim() === '')).toBe(true)
    expect(d.ids[0]).toBe('need:Q-88')
    expect(d.ids.slice(1, 3).every(id => id.startsWith('need:T-'))).toBe(true)
  }
  const none = panelLines(parseViewFile(viewFileText({ ...f0, view: { ...f0.view, tasks: f0.view.tasks.filter(t => t.status === 'doing') } })), { tab: 'live', opened: '', cursor: 0 }, NOW, 100)
  expect(none.lines.map(lineText).some(x => x.includes('Needs you'))).toBe(false)
})

test('T-786: a doing task that asks for more time has separate cursor stops for its ▍Needs you row and its lane', () => {
  const f0 = viewFile()
  const f = parseViewFile(viewFileText({ ...f0, view: { ...f0.view, tasks: f0.view.tasks.filter(t => t.id === 'T-1' || t.id === 'T-2').map(t => (t.id === 'T-1' ? { ...t, live: { time_ask: AT }, note: 'time is up' } : t)) } }))
  const d0 = panelLines(f, { tab: 'live', opened: '', cursor: 0 }, NOW, 100)
  expect(d0.ids.slice(0, 3)).toEqual(['need:T-2', 'need:T-1', 'T-1'])
  for (let c = 0; c < 3; c++) {
    const d = panelLines(f, { tab: 'live', opened: '', cursor: c }, NOW, 100)
    expect([c, d.lines.map(lineText).filter(x => x.startsWith('›')).length]).toEqual([c, 1])
  }
  // a click on the running task's lane ({open:'T-1'}, handled as openLive(hit.open)) lands on the lane's own stop
  const lane = d0.hits.find(h => h && 'open' in h && h.open === 'T-1')
  expect(lane).toEqual({ open: 'T-1' })
  expect(d0.ids.indexOf((lane as { open: string }).open)).toBe(2)
  expect(d0.ids.indexOf('T-1')).not.toBe(d0.ids.indexOf('need:T-1'))
})

test('T-855: OpenCode\'s task page draws an agent line of a try with ⌀ before its token count', () => {
  const f = sectionsViewFile()
  const agent = { kind: 'worker' as const, id: 'ses_worker_one_Qr2', started: AT, ended: AT, tokens: { input: 4_100_000 } }
  const tasks = f.view.tasks.map(t => (t.id === 'T-2' ? { ...t, runs: [{ started: AT, ended: AT, agents: [agent] }] } : t)) as ViewFile['view']['tasks']
  const lines = panelLines({ ...f, view: { ...f.view, tasks } }, { opened: 'T-2', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(lines.some(l => /▸ worker +ses…Qr2 .*· ⌀ 4\.1M$/.test(l.trim()))).toBe(true)
})

test('T-894: a task waiting for your files shows which files and that r merges it now; a question page has its title and "asked by the lead" line', () => {
  const f0 = viewFile()
  const tasks = f0.view.tasks.map(t => (t.id === 'T-3' ? { ...t, live: { merge_wait: { dirty: ['src/a.ts', 'src/b.ts'] } }, } : t))
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks, questions: [{ id: 'Q-3', by: 'lead' as const, text: 'How often?', options: ['Once a day'], asked_at: AT }] } }
  for (const w of [100, 40]) {
    const page = panelLines(f, { opened: 'T-3', cursor: 0 }, NOW, w).lines.map(lineText)
    expect(page).toContain('▍⧗ Waiting for your files')
    const text = page.map(l => l.trim()).join(' ')
    expect(text).toContain('src/a.ts, src/b.ts')
    expect(text).toContain('commit or stash them, it merges on its own')
    expect(page).toContain('  r (Merge now) merges it now')
    expect(page.every(l => l.length <= w)).toBe(true)
    const q = panelLines(f, { opened: 'Q-3', cursor: 0 }, NOW, w).lines.map(lineText)
    expect(q[0]).toBe('Q-3 Question for you')
    expect(q).toContain(`asked by the lead · ${when(AT)}`)
    expect(q).toContain('How often?')
    expect(q.every(l => l.length <= w)).toBe(true)
  }
})

test('T-904: the Tasks search finds done tasks (one a minute ago, one 5 days ago) by a word in their details and in their request, read from their parts file only while a search is on; the task page\'s "n of m" and [ ] follow the matches', async () => {
  const f0 = viewFile()
  const ago = (ms: number) => new Date(NOW - ms).toISOString()
  const extra = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'a week old one', files: ['src/'] }, AT)[0].tasks[0]!
  const whole = [
    ...f0.view.tasks.map(t => (t.id === 'T-5' ? { ...t, details: 'about the zebrafish tank and the shared pump', origin: { ...t.origin, request: 'please fix the kumquat page' }, updated_at: ago(60_000) } : t)),
    { ...extra, id: 'T-6', status: 'done' as const, details: 'about the narwhal tusk and the shared pump', origin: { ...extra.origin, request: 'please fix the okapi page' }, created_at: ago(6 * 86_400_000), updated_at: ago(5 * 86_400_000) },
  ]
  // as the engine writes it: the done tasks slim (no details, no request), naming their parts file
  const slim = whole.map(t => viewTask(t))
  const f: ViewFile = { ...f0, view: { ...f0.view, tasks: slim as ViewFile['view']['tasks'] } }
  for (const word of ['zebrafish', 'kumquat', 'narwhal', 'okapi']) expect(viewFileText(f)).not.toContain(word)
  const parts = Object.fromEntries(whole.filter(t => t.status === 'done').map(t => [t.id, { details: t.details, origin: t.origin, history: t.history }]))
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)], ['/work/proj/.symcc/tasks/T-0.json', JSON.stringify({ version: 1, tasks: parts })]])
  const partsReads: string[] = []
  const readText = async (p: string) => (p.includes('/tasks/') && partsReads.push(p), files.get(p) ?? Promise.reject(new Error('missing')))
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const answers = { prompt: [] as (string | undefined)[] }
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120, height: 200 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => answers.prompt.shift(), select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText, every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 's', width: 120, focused: true, close: () => undefined, focus: () => undefined } as never)
  const settle = () => new Promise<void>(res => setTimeout(res, 0))
  // a list drawn (and read again) with no search reads no parts file
  expect(shown(panel).some(l => l.includes('a later one'))).toBe(true)
  await board.refresh()
  await settle()
  expect(partsReads).toEqual([])
  const searchFor = async (word: string) => {
    await board.press('x', 's')
    answers.prompt.push(word)
    await board.press('f', 's')
    await settle()
    return shown(panel)
  }
  for (const [word, title] of [['zebrafish', 'an old one'], ['kumquat', 'an old one'], ['narwhal', 'a week old one'], ['okapi', 'a week old one']] as const) {
    const lines = await searchFor(word)
    expect([word, lines.some(l => l.includes(`search: ${word} · 1 of 6 tasks`)), lines.some(l => l.includes(title))]).toEqual([word, true, true])
  }
  // each search read the parts file once; more refreshes while it is on read nothing again
  const reads = partsReads.length
  expect(reads).toBe(4)
  await board.refresh()
  await settle()
  expect(partsReads.length).toBe(reads)
  // both match "pump": the task page's place counts the 2 matches, as the list does, and ] goes to the other one
  const lines = await searchFor('pump')
  expect(lines.some(l => l.includes('search: pump · 2 of 6 tasks'))).toBe(true)
  const ids = panelLines(f, { opened: '', cursor: 0, tab: 'tasks', search: 'pump', searchMore: t => (t.id === 'T-5' || t.id === 'T-6' ? 'pump' : '') }, NOW, 120).ids
  expect(ids.filter(id => /^T-\d+$/.test(id))).toEqual(['T-5', 'T-6'])
  for (let i = 0; i < ids.indexOf('T-5'); i++) await board.press('down', 's')
  await board.press('open', 's')
  expect(board.state().opened).toBe('T-5')
  await settle()
  expect(shown(panel).some(l => l.includes(' 1 of 2 '))).toBe(true)
  await board.press('next', 's')
  expect(board.state().opened).toBe('T-6')
  board.stop()
})

test('T-903: with no task running, the OpenCode Live tab says why (paused, waiting, all done, a new board) and what to do next', () => {
  const f0 = viewFile()
  const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
  const task = (id: string, status: string, x: Record<string, unknown> = {}) => ({ id, title: `Task ${id}`, details: '', files: [], status, note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: ago(300), updated_at: ago(1), ...x }) as unknown as SymccTask
  const cases: [SymccMode, SymccTask[], string[]][] = [
    ['paused', [task('T-1', 'todo')], ['Paused: nothing starts. /symcc-mode auto starts work again.']],
    ['auto', [task('T-6', 'paused'), task('T-7', 'todo', { after: ['T-6'] }), task('T-5', 'waiting', { ask: { by: 'worker', text: 'Which one?', asked_at: ago(2) } })], ['Nothing running · 3 waiting: T-5 needs you, T-6 paused, T-7 waits for T-6']],
    ['auto', [task('T-891', 'done', { history: [{ kind: 'merged', at: ago(12), text: 'try 1 → merged into main' }] }), task('T-893', 'backlog'), task('T-894', 'backlog')], ['All done · last merged T-891, 12m ago', "Tell the lead what's next, or move one of 2 backlog items to todo.", '  ◇ T-893  Task T-893', '  ◇ T-894  Task T-894']],
    // T-924: the next 3 backlog items (lowest priority first, then oldest), then how many more
    ['auto', [task('T-891', 'done', { history: [{ kind: 'merged', at: ago(3), text: 'try 1 → merged into main' }] }), task('T-895', 'backlog', { priority: 1 }), task('T-893', 'backlog', { priority: 9 }), task('T-896', 'backlog', { priority: 1 }), task('T-894', 'backlog', { priority: 2 }), task('T-897', 'backlog', { priority: 19 })], ['All done · last merged T-891, 3m ago', "Tell the lead what's next, or move one of 5 backlog items to todo.", '  ◇ T-895  Task T-895', '  ◇ T-896  Task T-896', '  ◇ T-894  Task T-894', '  … 2 more in the backlog']],
    ['auto', [], ['No tasks yet. Tell the lead what you want built.']],
  ]
  for (const [mode, tasks, want] of cases) {
    const f: ViewFile = { ...f0, view: { ...f0.view, tasks: tasks.map(t => viewTask(t)), working: [], mode } }
    const d = panelLines(parseViewFile(viewFileText(f)), { tab: 'live', opened: '', cursor: 0 }, NOW, 100)
    const texts = d.lines.map(lineText)
    const at = texts.findIndex(t => t.startsWith('─── ❯ TASKS'))
    expect(texts.slice(at + 2, at + 2 + want.length)).toEqual(want.map(l => LIVE_INDENT + l))
    expect(d.lines[at + 2]!.every(x => x.color === 'inactive')).toBe(true)
    // T-910: the Live tab has no m key, so no bare "m" hint
    expect(texts.slice(at + 2, at + 2 + want.length).some(t => /(^|\s)m(\s|$)/.test(t))).toBe(false)
    // T-924: an empty line between the idle lines and the merged trains (T-891 merged 3m ago)
    if (want[0]!.includes('3m ago')) expect([texts[at + 2 + want.length], texts[at + 3 + want.length]!.includes('work')]).toEqual([' ', true])
  }
})

test('T-918: the Roles table drops MODEL, then WEB, then WRITES when narrow, then cuts the description; the name never cuts', () => {
  const f = defsViewFile()
  const web = { name: 'researcher', description: 'finds things out and hands back an answer', skills: [], tools: ['web'], prompt: '' }
  const prose = { name: 'writer', description: 'plain-English writing; never code', skills: [], tools: ['web'], code: false as const, prompt: '' }
  const g: ViewFile = { ...f, view: { ...f.view, roles: [...f.view.roles!, ...viewDefs('role', [web, prose], [web, prose], [], [], '.symcc/roles')] } }
  const at = (w: number) => panelLines(g, { tab: 'settings', opened: 'roles', cursor: 0 }, NOW, w).lines.map(lineText)
  const row = (w: number, name: string) => at(w).find(l => l.slice(2).startsWith(`${name} `) || l.slice(2) === name)
  expect(at(140)).toContain("  NAME        FROM      MODEL  WEB  WRITES  WHAT IT'S FOR")
  expect(row(140, 'researcher')).toBe('  researcher  built-in  —      web  —       finds things out and hands back an answer')
  expect(row(140, 'writer')).toBe('  writer      built-in  —      web  prose   plain-English writing; never code')
  expect(row(60, 'writer')).toBe('  writer      built-in  —      web  prose   plain-English w…')
  expect(row(56, 'writer')).toBe('  writer      built-in  web  prose   plain-English writ…')
  expect(row(48, 'writer')).toBe('  writer      built-in  prose   plain-English w…')
  expect(row(40, 'writer')).toBe('  writer      built-in  plain-English w…')
  expect(row(24, 'researcher')).toBe('  researcher  built-in')
  // the Kinds table: NAME, FROM, WHAT IT'S FOR
  const kinds = panelLines(g, { tab: 'settings', opened: 'kinds', cursor: 1 }, NOW, 140).lines.map(lineText)
  expect(kinds).toContain('▍Task types  2 task types · 1 changed by you')
  expect(kinds).toContain("  NAME    FROM      WHAT IT'S FOR")
  expect(kinds).toContain('❯ bug     changed   A bug to fix')
  // every role's page says what it writes
  const writes = (name: string) => panelLines(g, { tab: 'settings', opened: `role:${name}`, cursor: 0 }, NOW, 140).lines.map(lineText).find(l => l.startsWith('Writes: '))
  expect(writes('general')).toBe('Writes: code (tests run before merging)')
  expect(writes('writer')).toBe('Writes: prose only (code: false; only docs checks run)')
  expect(writes('researcher')).toBe('Writes: nothing (answers questions; nothing is merged)')
  // the edit page's Writes pick shows its words
  const edit = defDraftOf('roles', g.view.roles!.find(r => r.name === 'writer')!)
  expect(edit.values.code).toBe('false')
  const e = panelLines(g, { tab: 'settings', opened: 'role:writer', cursor: EDIT_FIRST_BOX, edit }, NOW, 140).lines.map(lineText)
  expect(e[e.indexOf('  Writes') + 1]).toBe('    prose only')
})

test('T-918: startTui: Enter on the edit page\'s Writes switches code and prose only; Save sends code with the role\'s save', async () => {
  const t = await tuiOn(addedViewFile())
  await t.toSettings('5 roles', '  docs ')
  expect(t.board.state().opened).toBe('role:docs')
  await t.board.press('e', 's')
  // a click on its value (its label's words are also in the description, "Writes docs")
  t.clickRow('    code')
  await new Promise<void>(res => setTimeout(res, 0))
  const at = t.lines().findIndex(l => /^. Writes$/.test(l))
  expect([t.lines()[at], t.lines()[at + 1]]).toEqual(['› Writes', '    prose only'])
  await t.click('[ Save ]')
  expect(t.sent).toEqual([{ sessionID: 's', name: 'symcc-settings', text: 'role docs save {"code":"false"}' }])
  t.board.stop()
})
