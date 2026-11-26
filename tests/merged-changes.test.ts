// T-1086: a done task keeps its Changes. The per-file list is not saved: it is read from git when the page opens
// (`git diff --numstat <main before the merge> <merged commit>`), kept in memory, and the diff of a file comes from git too.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { SymccTask } from '../types'
import { mergedChanges, mergedDiff, DIFF_GONE } from '../hooks/app/review'
import { taskSections } from '../hooks/core/task-sections'
import { taskActions } from '../hooks/core/panel'
import { hasMergedChanges, type BoardTask } from '../hooks/core/board-file'
import { STUB_KEYS } from '../hooks/core/board-parts'
import { when } from '../hooks/core/days'
import { fakeHost } from './fake-host'

const sha = (c: string) => c.repeat(40)
const NOW = Date.parse('2026-11-26T12:00:00.000Z')
const task = (extra: Partial<BoardTask> = {}): BoardTask =>
  ({ id: 'T-7', title: 'Do it', details: '', files: [], status: 'done', note: '', priority: 1, after: [], attempts: 1, history: [], branch: null, created_at: '2026-11-26T10:00:00.000Z', updated_at: '2026-11-26T11:00:00.000Z', ...extra }) as BoardTask

/** A host whose git knows `commits` (sha -> parents, message) and answers the diff of `before..merged` with `numstat` and `diff`. */
function gitWorld(o: { commits: Record<string, { parents: string[]; message: string }>; numstat?: string; numstatFail?: boolean; diff?: string }) {
  const calls: string[] = []
  const host = fakeHost({
    run: async argv => {
      const a = argv.slice(1)
      calls.push(a.join(' '))
      if (a[0] === 'rev-list') {
        const c = o.commits[a[a.length - 1]!]
        return c ? { exitCode: 0, stdout: `${a[a.length - 1]} ${c.parents.join(' ')}\n`, stderr: '' } : { exitCode: 128, stdout: '', stderr: 'bad object' }
      }
      if (a[0] === 'log' && a.includes('--format=%B')) {
        const c = o.commits[a[a.length - 1]!]
        return c ? { exitCode: 0, stdout: c.message + '\n', stderr: '' } : { exitCode: 128, stdout: '', stderr: 'bad' }
      }
      if (a[0] === 'log') {
        const out: string[] = []
        for (let s: string | undefined = a[a.length - 1]; s && o.commits[s]; s = o.commits[s]!.parents[0]) out.push(`${s}\x1f${o.commits[s]!.parents.join(' ')}\x1f${o.commits[s]!.message}\x1e`)
        return { exitCode: 0, stdout: out.join('\n'), stderr: '' }
      }
      if (a[0] === 'diff' && a.includes('--numstat')) return { exitCode: o.numstatFail ? 128 : 0, stdout: o.numstat ?? '', stderr: '' }
      if (a[0] === 'diff') return { exitCode: o.diff === undefined ? 128 : 0, stdout: o.diff ?? '', stderr: '' }
      return { exitCode: 1, stdout: '', stderr: '' }
    },
  })
  return { $: host.host, calls }
}

const NUMSTAT = '12\t3\thooks/a.ts\n-\t-\tlogo.png\n'

test('T-1086: a done task\'s changes are read from git: main before a catch-up merge is its second parent', async () => {
  const merged = sha('a')
  const w = gitWorld({ commits: { [merged]: { parents: [sha('b'), sha('c')], message: 'T-7: Do it\n\nSymcc-Task: T-7' } }, numstat: NUMSTAT })
  const got = await mergedChanges(w.$, task({ merged }))
  expect(got?.before).toBe(sha('c'))
  expect(got?.merged).toBe(merged)
  expect(got?.files).toEqual([{ file: 'hooks/a.ts', added: 12, removed: 3 }, { file: 'logo.png', added: 0, removed: 0, binary: true }])
  expect(w.calls).toContain(`diff --numstat --no-renames ${sha('c')} ${merged}`)
  // asked once: the answer stays in memory for the page
  await mergedChanges(w.$, task({ merged }))
  expect(w.calls.filter(c => c.includes('--numstat')).length).toBe(1)
})

test('T-1086: with no catch-up merge, main before is the first commit down the line that is not the task\'s own', async () => {
  const merged = sha('d')
  const own = (n: number) => `T-7: Do it\n\nSymcc-Task: T-7\nSymcc-Try: ${n}`
  const w = gitWorld({
    commits: {
      [merged]: { parents: [sha('e')], message: own(1) },
      [sha('e')]: { parents: [sha('f')], message: own(1) },
      [sha('f')]: { parents: [sha('0')], message: 'T-6: other' },
    },
    numstat: NUMSTAT,
  })
  const got = await mergedChanges(w.$, task({ merged }))
  expect(got?.before).toBe(sha('f'))
  expect(got?.files.length).toBe(2)
})

test('T-1086: a retry\'s catch-up merge inside the line: main before is its second parent, not the task\'s first base', async () => {
  const own = (n: number) => `T-7: Do it\n\nSymcc-Task: T-7\nSymcc-Try: ${n}`
  const merged = sha('7')
  const w = gitWorld({
    commits: {
      [merged]: { parents: [sha('e')], message: own(2) },
      [sha('e')]: { parents: [sha('f'), sha('9')], message: own(2) },
      [sha('f')]: { parents: [sha('0')], message: own(1) },
      [sha('0')]: { parents: [], message: 'base' },
    },
    numstat: NUMSTAT,
  })
  const got = await mergedChanges(w.$, task({ merged }))
  expect(got?.before).toBe(sha('9'))
})

test('T-1096: a worker\'s own commit and its own merge of main (no Task line) inside the line count as the task\'s', async () => {
  const merged = sha('7')
  const w = gitWorld({
    commits: {
      [merged]: { parents: [sha('e')], message: 'T-7: last' },
      [sha('e')]: { parents: [sha('f')], message: 'T-7: work' },
      [sha('f')]: { parents: [sha('1'), sha('9')], message: 'T-7: merge main' },
      [sha('1')]: { parents: [sha('2')], message: 'T-7: first\n\nSymcc-Task: T-7' },
      [sha('2')]: { parents: [], message: 'T-6: other' },
    },
    numstat: NUMSTAT,
  })
  const runs = [{ started: 'x', commits: [sha('f'), sha('e'), merged] }] as BoardTask['runs']
  const got = await mergedChanges(w.$, task({ merged, runs }))
  expect(got?.before).toBe(sha('9'))
  expect(got?.files.length).toBe(2)
  // a worker merge on top (the merged commit itself)
  const top = gitWorld({
    commits: {
      [sha('a')]: { parents: [sha('b'), sha('c')], message: 'T-7: merge main' },
      [sha('b')]: { parents: [sha('d')], message: 'T-7: work' },
    },
    numstat: NUMSTAT,
  })
  const got2 = await mergedChanges(top.$, task({ merged: sha('a'), runs: [{ started: 'x', commits: [sha('b'), sha('a')] }] as BoardTask['runs'] }))
  expect(got2?.before).toBe(sha('c'))
})

test('T-1086: a hand merge on main (parents: main, task tip): main before is the first parent', async () => {
  const merged = sha('8')
  const w = gitWorld({ commits: { [merged]: { parents: [sha('a'), sha('b')], message: "Merge branch 'task'" } }, numstat: NUMSTAT })
  const got = await mergedChanges(w.$, task({ merged }))
  expect(got?.before).toBe(sha('a'))
})

test('T-1096: a hand merge saved in the runs still has main as its first parent', async () => {
  const merged = sha('8')
  const w = gitWorld({ commits: { [merged]: { parents: [sha('a'), sha('b')], message: "Merge branch 'task'" }, [sha('a')]: { parents: [sha('c')], message: 'main work' } }, numstat: NUMSTAT })
  const runs = [{ started: 'x', commits: [sha('b'), merged] }] as BoardTask['runs']
  const got = await mergedChanges(w.$, task({ merged, runs }))
  expect(got?.before).toBe(sha('a'))
})

test('T-1086: a file\'s diff comes from git; "diff not available" when git no longer has the commits', async () => {
  const merged = sha('1')
  const w = gitWorld({ commits: { [merged]: { parents: [sha('2'), sha('3')], message: 'Symcc-Task: T-7' } }, numstat: NUMSTAT, diff: 'diff --git a/hooks/a.ts b/hooks/a.ts\n+new\n' })
  expect(await mergedDiff(w.$, task({ merged }), 'hooks/a.ts')).toBe('diff --git a/hooks/a.ts b/hooks/a.ts\n+new\n')
  expect(w.calls).toContain(`diff --no-color --no-ext-diff --no-renames ${sha('3')} ${merged} -- hooks/a.ts`)
  const gone = gitWorld({ commits: {} })
  expect(await mergedChanges(gone.$, task({ merged: sha('4') }))).toBe(null)
  expect(await mergedDiff(gone.$, task({ merged: sha('4') }), 'hooks/a.ts')).toBe(DIFF_GONE)
  expect(DIFF_GONE).toBe('diff not available')
  // the commits are lost after the list was shown: the diff says so instead of failing
  const lost = gitWorld({ commits: { [sha('5')]: { parents: [sha('6'), sha('7')], message: 'Symcc-Task: T-7' } }, numstat: NUMSTAT })
  expect((await mergedChanges(lost.$, task({ merged: sha('5') })))?.files.length).toBe(2)
  expect(await mergedDiff(lost.$, task({ merged: sha('5') }), 'hooks/a.ts')).toBe(DIFF_GONE)
})

test('T-1086: an investigation, an errand, a task not done or one with no merged commit has no changes; the stub is enough (it survives archiving)', async () => {
  const merged = sha('8')
  const w = gitWorld({ commits: { [merged]: { parents: [sha('9'), sha('a')], message: 'x' } }, numstat: NUMSTAT })
  expect(await mergedChanges(w.$, task({ merged, kind: 'investigation' }))).toBe(null)
  expect(await mergedChanges(w.$, task({ merged, kind: 'errand' }))).toBe(null)
  expect(await mergedChanges(w.$, task({ merged, status: 'review' }))).toBe(null)
  expect(await mergedChanges(w.$, task())).toBe(null)
  expect(w.calls).toEqual([])
  // a stub holds only STUB_KEYS fields (no runs, no details): `merged` is one of them
  expect([...STUB_KEYS]).toContain('merged')
  const stub = Object.fromEntries(Object.entries(task({ merged, runs: [{ started: 'x', commits: [sha('b')] }] } as Partial<BoardTask>)).filter(([k]) => (STUB_KEYS as readonly string[]).includes(k))) as unknown as SymccTask
  expect(hasMergedChanges(stub)).toBe(true)
  expect((await mergedChanges(w.$, stub))?.files.length).toBe(2)
})

const facts = (more = {}) => ({ width: 80, nowMs: NOW, detail: { roles: [], all: [], when }, ...more })
const text = (s: ReturnType<typeof taskSections>[number] | undefined) => (s?.lines ?? []).map(l => l.segs.map(g => g.text).join(''))

test('T-1086: a done task\'s page shows Changes (N files, merged <sha>) with the file rows, no folder line', () => {
  const merged = sha('abcdef0123456789'.slice(0, 1))
  const t = task({ merged: `abcdef0${'1'.repeat(33)}` })
  const changes = { files: [{ file: 'hooks/a.ts', added: 3, removed: 1 }, { file: 'logo.png', added: 0, removed: 0, binary: true }], error: '' }
  const s = taskSections(t, facts({ changes, target: 'main', dataDir: '.symcc' }))
  const sec = s.find(x => x.id === 'changes')!
  expect(sec.title).toBe('Changes (2 files, merged abcdef0)')
  expect(text(sec)).toEqual(['hooks/a.ts  +3 -1', 'logo.png    binary', '  Enter on a file shows its diff · d all files'])
  expect(sec.lines.map(l => l.action)).toEqual([{ diff: 'hooks/a.ts' }, { diff: 'logo.png' }, undefined])
  expect(merged.length).toBe(40)
  // no list (an old task whose commits are gone) or an investigation: no section
  expect(s.map(x => x.id)).toContain('changes')
  expect(taskSections(t, facts()).map(x => x.id)).not.toContain('changes')
  expect(taskSections(task({ merged: t.merged!, kind: 'investigation' }), facts({ changes })).map(x => x.id)).not.toContain('changes')
  expect(taskSections(task({ merged: t.merged!, kind: 'errand' }), facts({ changes })).map(x => x.id)).not.toContain('changes')
})

test('T-1086: a done change task offers Show changes (d); an investigation does not', () => {
  const ids = (t: BoardTask) => taskActions(t).map(a => a.id)
  expect(ids(task({ merged: sha('c') }))).toContain('show-changes')
  expect(ids(task())).not.toContain('show-changes')
  expect(ids(task({ merged: sha('c'), kind: 'investigation' }))).not.toContain('show-changes')
})

test('T-1094: a failed git read is not kept (tried again next open); an empty diff is a final answer and is kept', async () => {
  const merged = sha('a')
  const commits = { [merged]: { parents: [sha('b'), sha('c')], message: 'T-7: Do it\n\nSymcc-Task: T-7' } }
  const bad = gitWorld({ commits, numstatFail: true })
  expect(await mergedChanges(bad.$, task({ merged }))).toBe(null)
  const again = gitWorld({ commits, numstat: NUMSTAT })
  expect((await mergedChanges(again.$, task({ merged })))?.files.length).toBe(2)
  const empty = gitWorld({ commits: { [sha('e')]: commits[merged]! }, numstat: '' })
  expect(await mergedChanges(empty.$, task({ id: 'T-8', merged: sha('e') }))).toBe(null)
  await mergedChanges(empty.$, task({ id: 'T-8', merged: sha('e') }))
  expect(empty.calls.filter(c => c.includes('--numstat')).length).toBe(1)
})
