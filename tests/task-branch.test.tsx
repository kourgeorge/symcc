// T-761: the task page's Branch section: core/task-branch.ts draws a task's branch against main (fork, commits with
// their tries, catch-ups, behind, the merge), app/branches.ts reads it with git (here a fake git) away from drawing,
// and the terminal (desktop, mobile) and VS Code task pages draw it under Details (OpenCode's: hooks/opencode/tests).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { LIVE_INDENT } from '../hooks/core/live'
import { textWidth } from '../hooks/core/stats'
import { branchTime, taskBranchLines, taskBranchTitle, type TaskBranchFacts } from '../hooks/core/task-branch'
import { readTaskBranch, taskBranchFacts, viewBranchTasks, BRANCH_CACHE_MS } from '../hooks/app/branches'
import { publish } from '../hooks/app/lead'
import { S } from '../hooks/app/state'
import { emptyBoard } from '../hooks/core/board-file'
import { done, fakeHost } from './fake-host'
import { PANE, T0, seedBoard } from './board-fixture'
import { sha, taskBranchDoing, taskBranchLong, taskBranchMerged, taskBranchTasks } from './branches-fixture'

const tasks = (now = T0) => taskBranchTasks(now) as never[]
const text = (l: { text: string }[]) => l.map(s => s.text).join('')
const linesOf = (id: string, f: TaskBranchFacts, w: number, now = T0) => taskBranchLines(tasks(now).find((t: { id: string }) => t.id === id)!, f, now, w).map(text)

test('T-761: the Branch section: the heading, main\'s line, the fork, the commits with their tries, a catch-up, a merge, a cut history; nothing wider than the page', () => {
  const doing = taskBranchDoing(T0)
  expect(taskBranchTitle(doing)).toBe('Branch  symcc/T-733 · 3 commits · 10 behind main')
  expect(taskBranchTitle({ ...doing, behind: 0 })).toBe('Branch  symcc/T-733 · 3 commits · up to date')
  const at = (m: number) => branchTime(T0 - m * 60_000, T0)
  expect(linesOf('T-733', doing, 100)).toEqual([
    ' main   ●─────●────────●──●──●────────●──●──●──●──●──●──●──●──●──●   eeeeeee · 10 min ago',
    `        │ ${at(150)}                 ⇣ caught up ${at(110)}`,
    '        ╰──●────────●───────────┴──●',
    '           638235d  a077ff8        4825c84',
    '           try 2    try 4          try 6',
  ])
  // a try from the task's runs wins over the commit's Symcc-Try line
  const ran = taskBranchLines({ status: 'doing', runs: [{ started: '', commits: [] }, { started: '', commits: [sha('638235d0')] }] } as never, { ...doing, commits: doing.commits.map(c => ({ ...c, try: 9 })) }, T0, 100).map(text)
  expect(ran[4]!.trim()).toBe('try 2    try 9          try 9')
  // merged: the line goes back up into main with the time and the sha
  const merged = linesOf('T-734', taskBranchMerged(T0), 100)
  expect(merged[0]).toEndWith('   efefefe · 2 min ago')
  expect(merged[2]).toEndWith(`╯ merged ${at(5)} (cdcdcdc)`)
  expect(merged[1]!.trimEnd()).toEndWith('│')
  expect(taskBranchTitle(taskBranchMerged(T0))).toBe('Branch  symcc/T-733 · 3 commits · merged into main')
  // a long history: its latest commits and "… N earlier"
  const long = linesOf('T-735', taskBranchLong(T0), 60)
  expect(long[long.length - 1]).toBe(`${LIVE_INDENT}       … 9 earlier`)
  expect(long[3]!.trim()).toBe('b9b9b9b  bababab  bbbbbbb  bcbcbcb  bdbdbdb')
  for (const [id, f] of [['T-733', doing], ['T-734', taskBranchMerged(T0)], ['T-735', taskBranchLong(T0)]] as const)
    for (const w of [120, 100, 60, 40, 30, 20, 12]) for (const l of linesOf(id, f, w)) expect(textWidth(l), `${id} ${w}: ${l}`).toBeLessThanOrEqual(w)
  // a failed or dropped task's line is dim
  const failed = taskBranchLines({ status: 'failed' } as never, doing, T0, 100)
  expect(failed[2]!.filter(s => s.text.trim()).every(s => s.color === 'inactive')).toBe(true)
  // no commits yet
  expect(linesOf('T-733', { ...doing, commits: [], ahead: 0 }, 100)[2]!.trim()).toBe('╰─ no commits yet')
})

/** A fake git for T-733 (open) and T-734 (merged): the branch's first-parent log with its Symcc lines, its counts, the
 *  fork's time and main's commits since it. */
function fakeGit(calls: string[][]) {
  const d = taskBranchDoing(T0)
  const ct = (ms: number) => Math.floor(ms / 1000)
  const line = (c: { sha: string; at: number; try?: number; catchUp?: boolean }, task: string, parent: string) => [c.sha, c.catchUp ? `${parent} ${sha('e4')}` : parent, ct(c.at), task, c.try ?? ''].join('\t')
  const chain = (cs: typeof d.commits, task: string) => cs.map((c, i) => line(c, task, i ? cs[i - 1]!.sha : sha('f0'))).reverse()
  return async (argv: readonly string[]) => {
    calls.push([...argv])
    const a = argv.slice(1)
    if (a[0] === 'rev-list') return a[3] === 'main...symcc/T-733' ? done({ stdout: '10\t4\n' }) : done({ exitCode: 128 })
    if (a[0] === 'log' && a[1] === '--first-parent' && a[4] === 'main..symcc/T-733') return done({ stdout: chain(d.commits, 'T-733').join('\n') + '\n' })
    if (a[0] === 'log' && a[1] === '--first-parent' && a[4] === sha('cd')) {
      const m = taskBranchMerged(T0)
      return done({ stdout: [...chain(m.commits, 'T-734'), [sha('f0'), sha('e0'), ct(d.fork!.at), 'T-700', '1'].join('\t')].join('\n') + '\n' })
    }
    if (a[0] === 'log' && a[1] === '-1' && a[3] === sha('f0')) return done({ stdout: `${sha('f0')} ${ct(d.fork!.at)}\n` })
    if (a[0] === 'log' && a[3] === `${sha('f0')}..main`) return done({ stdout: [...d.main].reverse().map(c => `${c.sha} ${ct(c.at)}`).join('\n') + '\n' })
    return done({ exitCode: 128, stderr: 'fatal: unknown' })
  }
}

test('T-761: the app reads a task\'s branch with read-only git: its commits and tries, catch-ups, the fork, behind; a merged task\'s from its merged commit', async () => {
  S.root = '/repo'
  S.gitState = 'ok'
  const calls: string[][] = []
  const f = fakeHost({ run: fakeGit(calls) })
  const [doing, merged, , todo] = taskBranchTasks(T0)
  const got = (await readTaskBranch(f.host, doing as never, 'main', T0))!
  const want = taskBranchDoing(T0)
  const sec = (ms: number) => Math.floor(ms / 1000) * 1000
  expect([got.branch, got.into, got.ahead, got.behind]).toEqual(['symcc/T-733', 'main', 4, 10])
  expect(got.commits).toEqual(want.commits.map(c => ({ ...c, at: sec(c.at) })))
  expect(got.fork).toEqual({ sha: sha('f0'), at: sec(want.fork!.at) })
  expect(got.tip.sha).toBe(sha('ee'))
  expect(got.main.map(c => c.sha)).toEqual(want.main.map(c => c.sha))
  for (const c of calls) expect(['log', 'rev-list', 'merge-base']).toContain(c[1])
  // merged: the commits that carry its Symcc-Task line, the one under them is the fork; the merge time from its history
  const m = (await readTaskBranch(f.host, merged as never, 'main', T0))!
  expect(m.commits.map(c => c.sha)).toEqual(taskBranchMerged(T0).commits.map(c => c.sha))
  expect(m.merged).toEqual({ sha: sha('cd'), at: T0 - 5 * 60_000 })
  expect(m.fork?.sha).toBe(sha('f0'))
  expect([m.ahead, m.behind]).toEqual([undefined, undefined])
  // a branch git can't read: none
  expect(await readTaskBranch(f.host, { ...doing, branch: 'symcc/gone' } as never, 'main', T0)).toBe(null)
  // to do, no branch: no read at all; the open and the merged ones are what publish reads
  const before = calls.length
  expect(taskBranchFacts(f.host, todo as never, 'main', T0)).toEqual({ facts: undefined })
  expect(calls.length).toBe(before)
  expect(viewBranchTasks(taskBranchTasks(T0) as never[]).map((t: { id: string }) => t.id)).toEqual(['T-733', 'T-735', 'T-734'])
  // kept ~30 s: the page gets the last facts at once, and a stale read starts in the background and tells the page
  let told = 0
  const first = taskBranchFacts(f.host, doing as never, 'main', T0, () => told++)
  expect(first.facts).toBe(undefined)
  await first.done
  expect(told).toBe(1)
  const again = taskBranchFacts(f.host, doing as never, 'main', T0 + 1000)
  expect([again.done, again.facts?.behind]).toEqual([undefined, 10])
  expect(taskBranchFacts(f.host, doing as never, 'main', T0 + BRANCH_CACHE_MS + 1).done).toBeDefined()
  // publish puts the facts in the view (as OpenCode reads view.json); it reads at the real time, so the reads are
  // made fresh at that time first
  for (const t of viewBranchTasks(taskBranchTasks(T0) as never[])) await taskBranchFacts(f.host, t, 'main', Date.now()).done
  await publish(f.host, { ...emptyBoard(), tasks: taskBranchTasks(T0) as never[] })
  const v = f.panel.view() as unknown as { task_branches?: Record<string, TaskBranchFacts> }
  expect(v.task_branches?.['T-733']?.behind).toBe(10)
  S.gitState = 'no-git'
  await publish(f.host, { ...emptyBoard(), tasks: taskBranchTasks(T0) as never[] })
  expect('task_branches' in f.panel.view()).toBe(false)
})

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : !n || typeof n !== 'object' ? '' : ((n as Node).children ?? []).map(textOf).join(''))
const pageLines = (n: unknown): string[] => {
  const x = n as Node
  if (!x || typeof x !== 'object') return []
  if (x.type === 'Box') {
    if (x.props?.display === 'none') return []
    return x.props?.flexDirection === 'row' ? [textOf(x)] : (x.children ?? []).flatMap(pageLines)
  }
  return [textOf(x)]
}
const view = () => ({ shape: 'view-1', value: { tasks: taskBranchTasks(T0), working: [], scouts: [], mode: 'auto', branch: 'main', test_commands: ['npm test'], driving: true, task_branches: { 'T-733': taskBranchDoing(T0), 'T-734': taskBranchMerged(T0), 'T-735': taskBranchLong(T0) } } })

for (const surface of ['terminal', 'desktop', 'mobile'] as const)
  for (const [id, w] of [['T-733', 100], ['T-734', 100], ['T-735', 60], ['T-736', 100]] as const)
    test(`T-761: the ${surface} task page of ${id} at ${w} columns: the Branch section under Details${id === 'T-736' ? ' (none: no branch yet)' : ''}`, async ($, on) => {
      seedBoard(on, { opened: id, view: view() })
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface })
      const lines = pageLines(await ui.drawn())
      await ui.unmount()
      const head = lines.findIndex(l => l.startsWith('▍Branch'))
      if (id === 'T-736') return void expect(head).toBe(-1)
      const facts = view().value.task_branches[id]
      expect(lines[head]).toBe(`▍${taskBranchTitle(facts)}`)
      expect(head).toBeGreaterThan(lines.findIndex(l => l.startsWith('▍Details')))
      const want = linesOf(id, facts, w)
      expect(lines.slice(head + 1, head + 1 + want.length)).toEqual(want)
      for (const l of [lines[head]!, ...want]) expect(textWidth(l), l).toBeLessThanOrEqual(w)
      if (id === 'T-733') expect(want[3]!.trim()).toBe('638235d  a077ff8        4825c84')
      if (id === 'T-734') expect(want[2]).toContain('╯ merged ')
      if (id === 'T-735') expect(want[want.length - 1]!.trim()).toBe('… 9 earlier')
    })

test('T-761: the VS Code task page draws the Branch section under Details in the monospaced face; none for a task with no branch', async ($, on) => {
  seedBoard(on, { opened: 'T-733', view: view() })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  const sec = await ui.find({ key: 'vs-sec-branch' })
  expect(sec?.text).toContain('Branch  symcc/T-733 · 3 commits · 10 behind main')
  const want = linesOf('T-733', taskBranchDoing(T0), 100)
  const mono = (await ui.findAll({ type: 'Text' })).filter(x => x.props.mono === true && want.includes(String(x.text))).map(x => x.text)
  expect([...new Set(mono)]).toEqual(want)
  expect(sec?.text).toContain(want.join(''))
  expect(want[1]).toContain('⇣ caught up')
  expect(want[4]!.trim()).toBe('try 2    try 4          try 6')
  await ui.unmount()
})

test('T-761: the VS Code task page of a merged task: its line goes up into main with the sha', async ($, on) => {
  seedBoard(on, { opened: 'T-734', view: view() })
  const m = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  expect((await m.find({ key: 'vs-sec-branch' }))?.text).toContain(`╯ merged ${branchTime(T0 - 5 * 60_000, T0)} (cdcdcdc)`)
  await m.unmount()
})

test('T-761: the VS Code task page of a task with no branch yet has no Branch section', async ($, on) => {
  seedBoard(on, { opened: 'T-736', view: view() })
  const n = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  expect(await n.find({ key: 'vs-sec-details' })).toBeDefined()
  expect(await n.find({ key: 'vs-sec-branch' })).toBeUndefined()
  await n.unmount()
})
