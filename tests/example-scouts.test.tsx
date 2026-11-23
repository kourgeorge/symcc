// A new project (no scouts folder yet) starts with the plugin's example scouts, all paused (T-221).
// Files, git and agents are a fake world; time is the fake clock.
import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { SCOUT_SOON_MS, SCOUT_SPREAD_MS, PAUSED_RECHECK_MS } from '../hooks/app/scouts'
import { ran, entry } from './fakes'
import type { ProcessRunResult } from 'claude-code'
import { parseScout } from '../hooks/board'

const T0 = 1_800_000_000_000
const EXAMPLES = ['backlog-review', 'big-files', 'bugs', 'deps', 'docs-check', 'gaps', 'org-mem-review', 'recent-changes', 'secrets', 'simplify', 'test-gaps']
const EVERY_MINUTES = 5
const example = (n: string) => `---\nevery_minutes: ${EVERY_MINUTES}\n---\nExample ${n}.\n`
// A copy of the shipped examples/scouts/big-files.md (plugin tests can't read the real folder). The shell check
// tests/example-scouts.sh fails when this copy and the file differ, or when EXAMPLES and the folder differ.
const BIG_FILES = `---
every_minutes: 1440
---
Find source files that have grown too large and say how to split them. Skip tests,
generated files, lock files, snapshots and vendored or third-party code. Look for:
- files much larger than the rest of the project: over about 800 lines, or the top few
  by size (count lines with wc -l and give the numbers),
- files that keep growing: check git log --stat over the last few weeks,
- files that many recent changes touched at once: check git log --name-only for the
  files that show up in the most commits.

For each file worth splitting, propose a concrete split: which functions or sections go
to which new file (give the new file names), and why it is safe (which imports and
callers change, and which tests cover the moved code). Only propose a split that clearly
helps, such as a file that mixes unrelated jobs or one that many tasks keep editing at the
same time; a big file that does one thing well can stay as it is.
Skip typos, style and anything already on the board or just finished. If nothing is worth
splitting, start your report with NOTHING.
`
// Copies of the shipped examples/scouts/org-mem-review.md and backlog-review.md (T-940), checked the same way.
const ORG_MEM_REVIEW = `---
every_minutes: 1440
---
You are symcc's organizational memory (org-mem) reviewer. Org-mem is .symcc/org-mem.md: at most 60 one-line notes (each "- <date> [<topic>] <note>") that every worker, checker and scout gets in its prompt. Only the lead changes it; your job is to suggest what the lead should fix. Change nothing yourself.

Each run, check every note:
1. Still true: every file, folder, function, setting, command or behavior a note names still exists and still works that way in the code on main (grep and read the code; don't guess). Flag notes about code that is gone or changed. Example: a note naming a constant that a later change removed.
2. Duplicates and overlaps: two notes that say nearly the same thing. Suggest one merged note.
3. Too narrow: a note that only helps one old task or one file and is unlikely to help agents on other tasks.
4. Unclear or too long: a note an agent couldn't act on, or one over about 100 characters.
5. Topics: a note under the wrong topic; topics with only 1-2 notes to merge into a close one; a topic past about 15 notes to split. Keep about 6-10 topics.
6. Missing: a lesson that several recent worker or checker reports (.symcc/reports/, the last few days) ran into or repeated, but org-mem doesn't have. Suggest a new note only when it would help agents on other tasks and is true beyond one task. Because org-mem is usually full, say which weaker note it should replace.

Report at most 8 suggestions, most useful first. Each one names the action and the note number, gives the exact new text when there is one (one plain sentence, no task ids), and says why in one line with the evidence (file:line, or the report that shows it). For example:
- replace #45 with "…": names parseConfig, which src/config.ts no longer has
- remove #12: same as #32
- topic #7 → "probes"
- new (replaces #9): "…": three checkers this week hit this
If nothing needs changing, answer NOTHING.
`
const BACKLOG_REVIEW = `---
every_minutes: 1440
---
Review the backlog tasks on the board (use the board tool with status backlog, and board task T-n for each). Look at up to 10 per run. To know which you checked before, read your own last report first (the scouts tool, action list, name backlog-review): skip the tasks it lists as checked and start with the rest, oldest first; when all have been checked, start again from the ones checked longest ago. For each, check against the code and git history:
- Do the files, functions and line numbers it names still exist? If they moved or were split (e.g. a file split into several), say where they are now.
- Was the work already done, fully or partly, by a later merged task or commit (git log, git log -S, the done tasks on the board)?
- Is it a duplicate of another backlog or open task?
- Does a later owner request on the board contradict it or make it pointless?
Report only the tasks that need action, each as one of: DROP (already done or no longer makes sense; give the proof), REWRITE (what in its details is out of date and the corrected facts: new paths, names, what is left to do, and files to add to its list), MERGE (with which task, and why). Skip tasks that are still accurate. End the report with one line "Checked: T-…, T-…" (every task you looked at this run, with the date). Change no files.
`
const SHIPPED: Record<string, string> = { 'big-files.md': BIG_FILES, 'org-mem-review.md': ORG_MEM_REVIEW, 'backlog-review.md': BACKLOG_REVIEW }
const shipped = (file: string) => SHIPPED[file] ?? example(file.replace(/\.md$/, ''))
type Res = ProcessRunResult
const ok = (stdout = ''): Res => ran({ stdout })

/**
 * Project files in memory (keyed from "/.symcc/" on), the plugin's examples under ".../examples/scouts/", and
 * folders made with mkdir -p. `failWrite` makes writes of a path with that text in it fail; `failExamples`
 * makes the examples folder unreadable.
 */
function world(on: On, o: { files?: Record<string, string>; dirs?: string[]; failWrite?: string; failExamples?: boolean; real?: boolean } = {}) {
  const files = new Map<string, string>(Object.entries(o.files ?? {}))
  const dirs = new Set<string>(o.dirs ?? [])
  const toasts: string[] = []
  const spawned: string[] = []
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const ex = (p: string) => p.match(/\/examples\/scouts(?:\/(.+))?$/)
  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) || dirs.has(key(e.path)) }))
  on('fs.read', (_, e) => {
    const m = ex(e.path)
    if (m?.[1]) return o.failExamples ? Promise.reject(new Error('no access')) : { value: o.real ? shipped(m[1]) : example(m[1].replace(/\.md$/, '')) }
    return files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))
  })
  on('fs.write', (_, e) => {
    if (o.failWrite && e.path.includes(o.failWrite)) return Promise.reject(new Error('disk full')) as never
    files.set(key(e.path), (e as unknown as { text: string }).text)
    return { value: undefined }
  })
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', (_, e) => {
    if (ex(e.path)) return o.failExamples ? (Promise.reject(new Error('no access')) as never) : { value: [...EXAMPLES.map(n => entry(`${n}.md`)), entry('notes.txt')] }
    const dir = `${key(e.path)}/`
    return { value: [...files.keys()].filter(f => f.startsWith(dir) && !f.slice(dir.length).includes('/')).map(f => entry(f.slice(dir.length))) }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => (toasts.push(String((e as unknown as { text?: string; message?: string }).text ?? (e as unknown as { message?: string }).message ?? JSON.stringify(e))), { value: undefined }) as never)
  on('agent.spawn', (_, e) => ((e as unknown as { name?: string }).name === 'symcc-starter' || spawned.push(String((e as unknown as { name?: string }).name)), { model: 'sonnet' }) as never) // T-831: the hidden starter is no agent here
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    if (cmd === 'git') return { value: rest[0] === 'rev-parse' && rest[1] === '--is-inside-work-tree' ? ok('true\n') : ok() }
    if (cmd === 'mkdir') for (const p of rest.filter(x => !x.startsWith('-'))) dirs.add(key(p))
    if (cmd === 'ln') {
      if (files.has(key(rest[1]!))) return { value: ran({ exitCode: 1, stderr: 'File exists' }) }
      files.set(key(rest[1]!), files.get(key(rest[0]!)) ?? '')
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      files.set(key(to!), files.get(key(from!)) ?? '')
      files.delete(key(from!))
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(key(p))
    return { value: ok() }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('agent.list', () => ({ value: [] }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  return { files, dirs, toasts, spawned, clock }
}

const start = async ($: Engine) => {
  await ($.session.start({ cwd: '/repo' } as never) as Promise<unknown>)
}
const paused = (files: Map<string, string>) => {
  const m = JSON.parse(files.get('/.symcc/scouts.json') ?? '{"scouts":{}}') as { scouts: Record<string, { paused?: boolean }> }
  return Object.keys(m.scouts).filter(n => m.scouts[n]!.paused === true).sort()
}
const scoutFiles = (files: Map<string, string>) => [...files.keys()].filter(f => f.startsWith('/.symcc/scouts/')).sort()
// open_on_start off: drawing the board panel at every start is what made these tests slow (over 5 s), and
// none of them is about the panel.
const board = (extra: Record<string, unknown> = {}) => JSON.stringify({ tasks: [], open_on_start: false, ...extra })
const scoutSpawns = (spawned: string[]) => spawned.filter(n => /scout/i.test(n))
// Past every scout's first timer (spread apart) and one paused recheck after it; a paused scout keeps its time,
// so later ticks only repeat that recheck. Kept short on purpose: every 30 s of fake time also fires the lead
// heartbeat (and more), and jumping an hour or so made these tests run over 5 s on a busy machine.
const PAST_EVERY_TIMER = SCOUT_SOON_MS + SCOUT_SPREAD_MS * EXAMPLES.length + PAUSED_RECHECK_MS

test('a project with no scouts folder gets all the example scouts, all paused, and is told once', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) } })
  await start($)
  expect(scoutFiles(w.files)).toEqual(EXAMPLES.map(n => `/.symcc/scouts/${n}.md`))
  expect(w.files.get('/.symcc/scouts/bugs.md')).toBe(example('bugs'))
  expect(paused(w.files)).toEqual(EXAMPLES)
  expect(w.toasts.filter(t => t.includes('example scouts')).length).toBe(1)
})

test('the example scouts do not run on their timer, even well past every timer', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) } })
  await start($)
  expect(paused(w.files)).toEqual(EXAMPLES)
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned)).toEqual([])
})

test('run now on an example scout runs it once, and it stays paused (a pause only stops the timer)', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) } })
  await start($)
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned)).toEqual([])
  const r = (await $.tool.call({ tool: 'mcp__symcc__scouts', action: 'run', name: 'bugs' } as never)) as { result?: string } | string
  // the scout is spawned (the test kit hands back no agent id, so the plugin calls it a failed start; what
  // matters here is that run now is not refused for the pause and the scout's agent is asked to start)
  expect(typeof r === 'string' ? r : String(r.result)).not.toContain('paused')
  // asked from a lead tool call, it is queued (T-391), and starts when the lead's turn ends
  expect(scoutSpawns(w.spawned)).toEqual([])
  await $.turn.complete({ answer: 'ok', isAborted: false, reason: 'answer', durationMs: 1000, turnId: 'lead' } as never)
  await w.clock.settle()
  expect(scoutSpawns(w.spawned).length).toBe(1)
  expect(scoutSpawns(w.spawned)[0]).toContain('bugs')
  expect(paused(w.files)).toEqual(EXAMPLES)
  // the other examples still don't run on their timer
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned).length).toBe(1)
  expect(paused(w.files)).toEqual(EXAMPLES)
})

test('a second start (the scouts folder is there now) adds no examples and says nothing', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) } })
  await start($)
  w.files.delete('/.symcc/scouts/deps.md')
  await start($)
  expect(scoutFiles(w.files)).not.toContain('/.symcc/scouts/deps.md')
  expect(w.toasts.filter(t => t.includes('example scouts')).length).toBe(1)
})

test('a project with an empty scouts folder gets nothing new', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board() }, dirs: ['/.symcc/scouts'] })
  await start($)
  expect(scoutFiles(w.files)).toEqual([])
  expect(paused(w.files)).toEqual([])
  expect(w.toasts.filter(t => t.includes('example scouts'))).toEqual([])
})

test('a project with its own scouts gets nothing new and its scout file is left as it is', async ($, on) => {
  const mine = '---\nevery_minutes: 60\n---\nMy own bugs scout.\n'
  const w = world(on, { files: { '/.symcc/board.json': board(), '/.symcc/scouts/bugs.md': mine }, dirs: ['/.symcc/scouts'] })
  await start($)
  expect(scoutFiles(w.files)).toEqual(['/.symcc/scouts/bugs.md'])
  expect(w.files.get('/.symcc/scouts/bugs.md')).toBe(mine)
  expect(paused(w.files)).toEqual([])
})

test('control: a scout that is not paused does run on its timer in this fake world', async ($, on) => {
  const mine = `---\nevery_minutes: ${EVERY_MINUTES}\n---\nMy own bugs scout.\n`
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }), '/.symcc/scouts/bugs.md': mine }, dirs: ['/.symcc/scouts'] })
  await start($)
  await w.clock.advance(PAST_EVERY_TIMER)
  // its timer queues it (T-391); the next turn's start starts it
  expect(scoutSpawns(w.spawned)).toEqual([])
  await $.turn.start({ text: '', turnId: 'wake' } as never)
  await w.clock.settle()
  expect(scoutSpawns(w.spawned).length).toBeGreaterThan(0)
})

test('examples that cannot be read: symcc still starts, and the owner is told once', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board() }, failExamples: true })
  await start($)
  expect(scoutFiles(w.files)).toEqual([])
  expect(w.toasts.filter(t => t.includes("couldn't add the example scouts")).length).toBe(1)
  // the start went on: the regular check and heartbeat are set, and the board is still there
  expect(w.files.has('/.symcc/board.json')).toBe(true)
  const r = (await $.tool.call({ tool: 'mcp__symcc__scouts' } as never)) as { result?: string } | string
  expect(typeof r === 'string' ? r : String(r.result)).toContain('no scouts yet')
})

test('a copy that fails: symcc still starts, the owner is told once, and what was copied stays paused', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board() }, failWrite: 'scouts/deps.md' })
  await start($)
  expect(scoutFiles(w.files)).toEqual(['/.symcc/scouts/backlog-review.md', '/.symcc/scouts/big-files.md', '/.symcc/scouts/bugs.md'])
  expect(paused(w.files)).toEqual(EXAMPLES)
  expect(w.toasts.filter(t => t.includes("couldn't add the example scouts")).length).toBe(1)
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned)).toEqual([])
})

test('the shipped big-files scout is copied paused with the others on first setup, and parses as a daily scout', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) }, real: true })
  await start($)
  expect(scoutFiles(w.files)).toEqual(EXAMPLES.map(n => `/.symcc/scouts/${n}.md`))
  expect(paused(w.files)).toEqual(EXAMPLES)
  const text = w.files.get('/.symcc/scouts/big-files.md')!
  expect(text).toBe(BIG_FILES)
  const s = parseScout('big-files', text)!
  expect(s.name).toBe('big-files')
  expect(s.every_minutes).toBe(1440)
  expect(s.warning).toBeUndefined()
  expect(s.prompt.startsWith('Find source files that have grown too large')).toBe(true)
  expect(s.prompt).toContain('git log --name-only')
  expect(s.prompt).toContain('start your report with NOTHING')
})

test('the shipped org-mem-review and backlog-review scouts are copied paused on first setup, and parse as daily scouts', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) }, real: true })
  await start($)
  expect(paused(w.files)).toEqual(EXAMPLES)
  expect(paused(w.files)).toContain('org-mem-review')
  expect(paused(w.files)).toContain('backlog-review')
  const org = w.files.get('/.symcc/scouts/org-mem-review.md')!
  expect(org).toBe(ORG_MEM_REVIEW)
  const o = parseScout('org-mem-review', org)!
  expect(o.every_minutes).toBe(1440)
  expect(o.warning).toBeUndefined()
  expect(o.prompt).toContain('over about 100 characters')
  const back = w.files.get('/.symcc/scouts/backlog-review.md')!
  expect(back).toBe(BACKLOG_REVIEW)
  const b = parseScout('backlog-review', back)!
  expect(b.every_minutes).toBe(1440)
  expect(b.warning).toBeUndefined()
  expect(b.prompt.startsWith('Review the backlog tasks on the board')).toBe(true)
  expect(b.prompt).toContain('Checked: T-')
})
