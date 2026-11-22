// T-804: /symcc-doctor's migrate-data item. The doctor counts what is still in an old shape (read-only); `fix
// migrate-data` keeps a dated backup of the data files and saves every file once in today's shape; after that, loading
// needs no migration (the old-shape code is gone from board-file, history, archive, stats, scouts and org-mem).
import { expect } from 'claude-code/testing'
import { emptyBoard, readBoard, readArchive, tryTokens, tryCost, checkerTokensOf, workerIdOf, checkerIdOf } from '../hooks/board'
import { doctor } from '../hooks/app/doctor'
import { load, change } from '../hooks/app/store'
import { migrateIfOld, forgetMigrationFailure, oldDataFound } from '../hooks/app/migrate-data'
import { S, leadQueue } from'../hooks/app/state'
import { agentLines } from '../hooks/core/runs'
import { oldDataRows, migrateRunAgents } from '../hooks/core/old-data'
import type { SymccRun } from '../types'
import { stillOld } from './old-data-fixture'
import type { HostFileEntry, HostRunResult } from '../hooks/host'
import { test } from './reset'
import { fakeHost, done } from './fake-host'

const ROOT = '/repo'
const D = `${ROOT}/.symcc`
const T = '2026-11-01T08:00:00.000Z'
const E = '2026-11-01T09:00:00.000Z'

const base = { details: '', files: [], order: 1, after: [], branch: null, created_at: T, updated_at: E }

function world() {
  forgetMigrationFailure()
  const files = new Map<string, string>()
  const old = {
    ...emptyBoard(), mode: 'off', notify: 'sound', sound_set: 2, target_branch: 'dev', archived: { done: 1, dropped: 0, tries: 1, ms: 1000, tokens: 300 },
    tasks: [
      { ...base, id: 'T-1', title: 'one', status: 'todo', note: 'queue (2)', attempts: 3, role: 'tests', history: ['created by the lead because x', 'try 1: did it → tests failed: y'],
        runs: [{ started: T, ended: E, tokens: 5000 }, { started: E }] },
      { ...base, id: 'T-2', title: 'two', status: 'done', note: 'merged', attempts: 1, origin: { by: 'lead', why: 'w', at: T }, merge_into: 'main', history: [{ at: T, kind: 'created', text: 'created by the lead because w' }], runs: [{ started: T, ended: E, tokens: { unsplit: 7 } }] },
    ],
  }
  const archive = { version: 1, tasks: [{ ...base, id: 'T-3', title: 'three', status: 'done', note: '', attempts: 1, merge_into: 'main', origin: { by: 'lead', why: 'w', at: T }, stage: 'code', conflict_tries: 1, history: ['try 1: did it → merged into main (abc1234)'], runs: [{ started: T, ended: E, tokens: 90 }] }] }
  files.set(`${D}/board.json`, JSON.stringify(old, null, 2))
  files.set(`${D}/archive.json`, JSON.stringify(archive, null, 2))
  files.set(`${D}/scouts.json`, JSON.stringify({ scouts: { bugs: { last_run: E, last_report: '1. Old crash.' } }, usage: { bugs: { runs: 1, tokens: 900, ms: 10, days: {} } } }))
  files.set(`${D}/field-guide.md`, '- 2026-11-01: an old note\n')
  const list = async (p: string): Promise<HostFileEntry[]> => {
    const kids = new Map<string, HostFileEntry>()
    for (const f of files.keys()) {
      if (!f.startsWith(`${p}/`)) continue
      const rest = f.slice(p.length + 1)
      const name = rest.split('/')[0]!
      kids.set(name, { name, kind: rest.includes('/') ? 'dir' : 'file', size: files.get(f)!.length, mtimeMs: 0, isLink: false })
    }
    return [...kids.values()]
  }
  const run = async (argv: readonly string[]): Promise<HostRunResult> => {
    const [cmd, ...rest] = argv
    if (cmd === 'ln') {
      if (files.has(rest[1]!)) return done({ exitCode: 1, stderr: 'File exists' })
      files.set(rest[1]!, files.get(rest[0]!)!)
      return done()
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      if (!files.has(from!)) return done({ exitCode: 1, stderr: 'No such file' })
      files.set(to!, files.get(from!)!)
      files.delete(from!)
      return done()
    }
    if (cmd === 'rm') {
      for (const p of rest.filter(x => !x.startsWith('-'))) for (const f of [...files.keys()]) if (f === p || f.startsWith(`${p}/`)) files.delete(f)
      return done()
    }
    return done()
  }
  const w = fakeHost({
    run,
    fs: {
      read: async p => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return files.get(p)!
      },
      write: async (p, text) => void files.set(p, text),
      exists: async p => files.has(p) || [...files.keys()].some(f => f.startsWith(`${p}/`)),
      list,
      stat: async p => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return { kind: 'file', size: files.get(p)!.length, mtimeMs: 0, isLink: false }
      },
    },
  })
  S.root = ROOT
  S.me = 'me'
  S.writing = Promise.resolve()
  return { ...w, files }
}

test('T-804: the doctor lists what is still in an old shape, and changes nothing without fix', async () => {
  const w = world()
  const before = new Map(w.files)
  const text = await doctor(w.host, '')
  expect(text).toContain('migrate-data  old data shapes:')
  for (const part of ['tries with tokens saved as one number', 'history entries that are plain strings', 'tasks whose note is "queue (n)"', 'tasks with an old role', 'tasks with the removed stage engine', 'old board settings', 'scouts whose last report is not yet in a runs file', 'field-guide.md not yet moved', 'archived totals with tokens saved as one number', 'scout usage totals', 'tasks with a try left open', 'tasks with a conflict_tries field'])
    expect(text).toContain(part)
  expect(text).toContain('tries with `unsplit` tokens')
  // nothing is changed (reading the old board may keep its usual before-fix copy of board.json)
  expect([...w.files.keys()].filter(f => !f.includes('.before-fix-'))).toEqual([...before.keys()])
  for (const [f, text] of before) expect(w.files.get(f)).toBe(text)
  // the pure count reads the same shapes
  expect(oldDataRows({ board: JSON.parse(before.get(`${D}/board.json`)!), archive: [], scouts: null, withRuns: new Set(), fieldGuide: false, orgMem: false }).find(r => r.text.startsWith('tasks where attempts'))?.n).toBe(1)
})

test('T-804: fix migrate-data keeps a backup and saves every file in the current shape; then nothing is old and loading needs no migration', async () => {
  const w = world()
  const original = new Map(w.files)
  const out = await doctor(w.host, 'fix migrate-data')
  expect(out).toContain('✓ migrate-data')
  expect(out).toContain('backup of the data files kept in .symcc/data.before-migrate-')
  // the backup holds the files as they were
  const backups = [...w.files.keys()].filter(f => f.includes('/data.before-migrate-'))
  for (const name of ['board.json', 'archive.json', 'scouts.json', 'field-guide.md']) {
    const copy = backups.find(f => f.endsWith(`/${name}`))
    expect(copy ? w.files.get(copy) : undefined).toBe(original.get(`${D}/${name}`))
  }
  // board.json: settings, tasks
  const board = JSON.parse(w.files.get(`${D}/board.json`)!)
  expect(board.mode).toBe('paused')
  expect(board.notify).toBe('sound 2')
  expect('sound_set' in board).toBe(false)
  expect('target_branch' in board).toBe(false)
  expect(board.archived.tokens).toEqual({ unsplit: 300 })
  const loaded = await load(w.host)
  const t1 = loaded.tasks.find(t => t.id === 'T-1')!
  expect(t1.merge_into).toBe('dev')
  expect(t1.role).toBe('tester')
  expect(t1.origin?.why).toBe('made before origins were kept')
  expect(t1.history.map(h => h.kind)).toEqual(['created', 'failed'])
  expect(t1.runs!.map(r => tryTokens(r))).toEqual([{ unsplit: 5000 }, undefined])
  expect(t1.runs!.every(r => !!r.ended)).toBe(true)
  expect(t1.note).not.toMatch(/^queue/)
  // archive.json
  const arch = readArchive(w.files.get(`${D}/archive.json`)!)
  const t3 = arch.archive.tasks[0]! as unknown as Record<string, unknown>
  expect('stage' in t3 || 'conflict_tries' in t3).toBe(false)
  expect((arch.archive.tasks[0]!.history[0] as { kind: string }).kind).toBe('merged')
  expect(tryTokens(arch.archive.tasks[0]!.runs![0]!)).toEqual({ unsplit: 90 })
  // scouts.json and the scout's runs file, org-mem
  expect(JSON.parse(w.files.get(`${D}/scouts.json`)!).usage.bugs.tokens).toEqual({ unsplit: 900 })
  expect(JSON.parse(w.files.get(`${D}/scouts/bugs.runs.json`)!).runs[0].outcome).toBe('found')
  expect(w.files.has(`${D}/field-guide.md`)).toBe(false)
  expect(w.files.get(`${D}/org-mem.md`)).toBe('- 2026-11-01: an old note\n')
  // nothing is old any more: the board file reads to itself, and the doctor offers nothing to migrate
  expect(stillOld(await load(w.host))).toBe(false)
  expect(readBoard(w.files.get(`${D}/board.json`)!).fixed).toEqual([])
  expect(await doctor(w.host, '')).not.toContain('migrate-data')
})

test('T-804: a change on an old board migrates it first (with a backup), never writing the fallbacks', async () => {
  const w = world()
  const original = w.files.get(`${D}/board.json`)!
  await change(w.host, b => b)
  const backups = [...w.files.keys()].filter(f => f.includes('/data.before-migrate-'))
  expect(backups.find(f => f.endsWith('/board.json'))).toBeDefined()
  expect(w.files.get(backups.find(f => f.endsWith('/board.json'))!)).toBe(original)
  const board = JSON.parse(w.files.get(`${D}/board.json`)!)
  expect(board.mode).toBe('paused')
  expect('target_branch' in board).toBe(false)
  const t1 = (await load(w.host)).tasks.find(t => t.id === 'T-1')!
  expect(t1.merge_into).toBe('dev')
  expect(t1.history.length).toBe(2)
})

test('T-804: migrateIfOld at session start migrates once, tells once, and keeps string history lines as records', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  await migrateIfOld(w.host)
  const board = JSON.parse(w.files.get(`${D}/board.json`)!)
  expect(board.mode).toBe('paused')
  expect(JSON.stringify(board)).toContain('created by the lead because x')
  expect(w.files.get(`${D}/scouts.json`)).toContain('unsplit')
  const told = () => leadQueue.filter(t => t.includes('moved your old data')).length
  expect(told()).toBe(1)
  await migrateIfOld(w.host)
  expect(told()).toBe(1)
})

test('T-804: an automatic migration names the real backup folder once, and makes no false before-fix notice or copy', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  expect(await migrateIfOld(w.host)).toBe('')
  const folder = [...w.files.keys()].find(f => f.includes('/data.before-migrate-') && f.endsWith('/board.json'))!.replace(/\/board\.json$/, '').replace(ROOT + '/', '')
  expect(leadQueue).toEqual([`symcc moved your old data to the current shape; a backup is in ${folder}/`])
  expect(folder.startsWith('.symcc/data.before-migrate-')).toBe(true)
  expect([...w.files.keys()].filter(f => f.includes('.before-fix-'))).toEqual([])
})

test('T-804: when the backup can not be written, a change is refused and board.json stays byte for byte', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  const write = w.host.fs.write
  w.host.fs.write = async (p, text) => {
    if (p.includes('data.before-migrate')) throw new Error('disk full')
    return write(p, text)
  }
  const before = new Map(w.files)
  let error = ''
  await change(w.host, b => b).catch((e: Error) => void (error = e.message))
  expect(error).toContain("symcc couldn't move your old data to the current shape")
  expect(error).toContain('nothing was saved. Run /symcc-doctor.')
  expect(w.files.get(`${D}/board.json`)).toBe(before.get(`${D}/board.json`))
  // session start: told once, and the caller learns of the failure
  expect(await migrateIfOld(w.host)).toContain('nothing was saved')
  expect(leadQueue.filter(t => t.includes("couldn't move")).length).toBe(1)
})

const backups = (w: { files: Map<string, string> }) => new Set([...w.files.keys()].filter(f => f.includes('/data.before-migrate-')).map(f => f.split('/data.before-migrate-')[1]!.split('/')[0]))

test('T-804: a scout whose name is not a file name is an information row, and three migrations make one backup and one message', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  w.files.set(`${D}/scouts.json`, JSON.stringify({ scouts: { 'Bad Name': { last_run: E, last_report: 'x' } } }))
  const text = await doctor(w.host, '')
  expect(text).toContain("scouts whose name can't be a file name")
  expect(text).not.toContain('scouts whose last report is not yet in a runs file')
  for (let i = 0; i < 3; i++) expect(await migrateIfOld(w.host)).toBe('')
  expect(backups(w).size).toBe(1)
  expect(leadQueue.filter(t => t.includes('moved your old data')).length).toBe(1)
  expect(JSON.parse(w.files.get(`${D}/board.json`)!).mode).toBe('paused')
})

test('T-804: a failed runs-file write is told once and not retried until the files change', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  const write = w.host.fs.write
  w.host.fs.write = async (p, text) => {
    if (p.includes('.runs.json')) throw new Error('disk full')
    return write(p, text)
  }
  const first = await migrateIfOld(w.host)
  expect(first).toContain("couldn't move")
  expect(await migrateIfOld(w.host)).toBe(first)
  expect(await migrateIfOld(w.host)).toBe(first)
  expect(backups(w).size).toBe(1)
  expect(leadQueue.filter(t => t.includes("couldn't move")).length).toBe(1)
  // the files change: it tries again
  w.files.set(`${D}/scouts.json`, w.files.get(`${D}/scouts.json`)! + ' ')
  await migrateIfOld(w.host)
  expect(backups(w).size).toBe(1)
  expect(leadQueue.filter(t => t.includes("couldn't move")).length).toBe(1)
})

test('T-821: the same write error with changing files keeps one backup folder and one message', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  const write = w.host.fs.write
  w.host.fs.write = async (p, text) => {
    if (p.includes('.runs.json')) throw new Error(`EACCES: permission denied, open '${p}'`)
    return write(p, text)
  }
  for (let i = 0; i < 3; i++) {
    await migrateIfOld(w.host)
    w.files.set(`${D}/scouts.json`, w.files.get(`${D}/scouts.json`)! + ' ')
  }
  expect(backups(w).size).toBe(1)
  expect(leadQueue.filter(t => t.includes("couldn't move")).length).toBe(1)
})

test('T-821: a reused backup folder that was deleted is made again', async () => {
  const w = world()
  S.enabledNow = true
  const write = w.host.fs.write
  w.host.fs.write = async (p, text) => {
    if (p.includes('.runs.json')) throw new Error('EACCES: permission denied')
    return write(p, text)
  }
  await migrateIfOld(w.host)
  const first = [...backups(w)][0]!
  for (const f of [...w.files.keys()]) if (f.includes(`/data.before-migrate-${first}/`)) w.files.delete(f)
  expect(backups(w).size).toBe(0)
  w.files.set(`${D}/scouts.json`, w.files.get(`${D}/scouts.json`)! + ' ')
  await migrateIfOld(w.host)
  expect(backups(w).size).toBe(1)
})

test('T-804: the same write error naming a random temp file is told once, even when the files change', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  let n = 0
  const write = w.host.fs.write
  w.host.fs.write = async (p, text) => {
    if (p.includes('.runs.json')) throw new Error(`EACCES: permission denied, open '${ROOT}/.symcc/scouts/good.runs.json.node-host.${++n}-r${n}abc.tmp'`)
    return write(p, text)
  }
  await migrateIfOld(w.host)
  for (let i = 0; i < 2; i++) {
    w.files.set(`${D}/scouts.json`, w.files.get(`${D}/scouts.json`)! + ' ')
    await migrateIfOld(w.host)
  }
  expect(leadQueue.filter(t => t.includes("couldn't move")).length).toBe(1)
})

test('T-805: fix migrate-data gives an old try its agent entries (worker: tokens - checker_tokens, checker: checker_tokens) and takes the old fields away', async () => {
  const w = world()
  const old = JSON.parse(w.files.get(`${D}/board.json`)!)
  old.tasks.push({
    ...base, id: 'T-5', title: 'five', status: 'doing', note: 'worker on it', attempts: 2, origin: { by: 'lead', why: 'w', at: T }, merge_into: 'main', history: [], session: 'me', agent: 'ag5', checker: 'chk5',
    runs: [
      { started: T, ended: E, tokens: { input: 1000, output: 50 }, checker_tokens: { input: 300 }, cost: 0.5, agent: 'ag4', checkers: ['chk4'], ended_by: 'finished', ended_note: 'checker found problems' },
      { started: E, tokens: { input: 70 }, agent: 'ag5', checkers: ['chk5'], restarts: [{ at: E, why: 'after a reopen', agent: 'ag3', started: E }], agents: [{ id: 'ag5', kind: 'worker' as const, started: E, tokens: { input: 20 } }] },
    ],
  })
  w.files.set(`${D}/board.json`, JSON.stringify(old, null, 2))
  // the dry run counts it
  expect(await doctor(w.host, '')).toContain('keep tokens, cost or agent ids outside their agent entries')
  const out = await doctor(w.host, 'fix migrate-data')
  expect(out).toContain('✓ migrate-data')
  const t = (await load(w.host)).tasks.find(x => x.id === 'T-5')!
  const [r1, r2] = t.runs!
  // a try with no agents: a worker entry with tokens - checker_tokens and the cost, a checker entry with checker_tokens
  expect(r1!.agents!.filter(a => a.kind === 'worker').map(a => [a.id, a.tokens, a.cost])).toEqual([['ag4', { input: 700, output: 50 }, 0.5]])
  expect(r1!.agents!.filter(a => a.kind === 'checker').map(a => [a.id, a.tokens])).toEqual([['chk4', { input: 300 }]])
  expect([tryTokens(r1), checkerTokensOf(r1), tryCost(r1)]).toEqual([{ input: 1000, output: 50 }, { input: 300 }, 0.5])
  // a try that had agents keeps them, and what its sum held beyond them goes on its last worker
  expect(tryTokens(r2)).toEqual({ input: 70 })
  expect(r2!.agents!.find(a => a.id === 'ag5')!.tokens).toEqual({ input: 70 })
  expect(r2!.agents!.find(a => a.id === 'ag3')).toMatchObject({ kind: 'worker', ended_by: 'dropped' })
  expect(r2!.restarts).toEqual([{ at: E, why: 'after a reopen', started: E }])
  // the current worker and checker are the last open entries; no old field is left
  expect(workerIdOf(t)).toBe('ag5')
  expect(checkerIdOf(t)).toBe('chk5')
  const saved = JSON.parse(w.files.get(`${D}/board.json`)!).tasks.find((x: { id: string }) => x.id === 'T-5')
  expect('agent' in saved || 'checker' in saved).toBe(false)
  for (const r of saved.runs) expect(['tokens', 'checker_tokens', 'cost', 'agent', 'checkers'].filter(k => k in r)).toEqual([])
  // once migrated, nothing is old any more
  expect(await doctor(w.host, '')).not.toContain('keep tokens, cost or agent ids')
})

test('T-807: fix migrate-data moves a task\'s try-only fields into live, drops a false merge_main and reads a clash failure from its note', async () => {
  const w = world()
  const old = JSON.parse(w.files.get(`${D}/board.json`)!)
  const origin = { by: 'lead', why: 'w', at: T }
  old.tasks.push(
    { ...base, id: 'T-5', title: 'five', status: 'doing', note: 'worker on it', attempts: 1, origin, merge_into: 'main', history: [], session: 'me', time_ask: E, extra_minutes: 10, try_refused: ['a.ts'], try_question: { question: 'Which?' }, merge_main: false, runs: [{ started: T }] },
    { ...base, id: 'T-6', title: 'six', status: 'doing', note: 'worker starting', attempts: 1, origin, merge_into: 'main', history: [], session: 'me', finishing: E, runs: [{ started: T, ended: E }] },
    { ...base, id: 'T-8', title: 'eight', status: 'doing', note: 'a checker agent is trying to break it before it merges', attempts: 1, origin, merge_into: 'main', history: [], session: 'me', checking: { step: 'checker', at: E }, runs: [{ started: T, ended: E }] },
    { ...base, id: 'T-7', title: 'seven', status: 'failed', note: 'conflicts with the latest main (after 2 automatic retries)', attempts: 3, origin, merge_into: 'main', history: [], runs: [] },
  )
  w.files.set(`${D}/board.json`, JSON.stringify(old, null, 2))
  expect(await doctor(w.host, '')).toContain('try-only fields outside `live`')
  expect(await doctor(w.host, 'fix migrate-data')).toContain('✓ migrate-data')
  const b = await load(w.host)
  const t5 = b.tasks.find(x => x.id === 'T-5')!
  expect(t5.live).toMatchObject({ session: 'me', phase: 'worker', time_ask: E, extra_minutes: 10, refused: ['a.ts'], ask: { by: 'worker', text: 'Which?' } })
  expect('merge_main' in t5).toBe(false)
  const t6 = b.tasks.find(x => x.id === 'T-6')!
  expect(t6.live).toEqual({ session: 'me', phase: 'claimed', checking: { step: 'prep', at: E } })
  expect(b.tasks.find(x => x.id === 'T-8')!.live).toEqual({ session: 'me', phase: 'checker', checking: { step: 'checker', at: E } })
  expect(b.tasks.find(x => x.id === 'T-7')!.failed_on).toBe('clash')
  const saved = JSON.parse(w.files.get(`${D}/board.json`)!).tasks.find((x: { id: string }) => x.id === 'T-5')
  expect(['session', 'finishing', 'time_ask', 'extra_minutes', 'try_refused', 'try_question'].filter(k => k in saved)).toEqual([])
  expect(await doctor(w.host, '')).not.toContain('try-only fields outside')
})

test('T-805: migrating an old try keeps a cost of 0', () => {
  const m = migrateRunAgents({ id: 'T-2', status: 'done', runs: [{ started: T, ended: E, tokens: { input: 100 }, cost: 0 }] })!
  const r = (m.runs as SymccRun[])[0]!
  expect(tryCost(r)).toBe(0)
  expect(tryTokens(r)).toEqual({ input: 100 })
})

test('T-805: a doing task keeps its current worker and checker open', () => {
  const m = migrateRunAgents({ id: 'T-2', status: 'doing', agent: 'www', checker: 'kkk', runs: [{ started: T, agent: 'www' }] })!
  const t = m as unknown as Parameters<typeof workerIdOf>[0]
  expect(workerIdOf(t)).toBe('www')
  expect(checkerIdOf(t)).toBe('kkk')
})

test('T-805: ids kept alone on an old try show no made-up agent lines, and the tokens still count', () => {
  const m = migrateRunAgents({ id: 'T-1', status: 'done', runs: [{ started: T, ended: E, tokens: { input: 150 }, checker_tokens: { input: 40 }, agent: 'w1', checkers: ['c1', 'c2'] }] })!
  const r = (m.runs as SymccRun[])[0]!
  expect(agentLines(r)).toEqual([])
  expect(tryTokens(r)).toEqual({ input: 150 })
  expect(checkerTokensOf(r)).toEqual({ input: 40 })
})

test('T-808: fix migrate-data makes a task\'s question fields one `ask` record, gives board questions a `by`, and drops last_run / last_report and old usage days from scouts.json', async () => {
  const w = world()
  const board = JSON.parse(w.files.get(`${D}/board.json`)!)
  const origin = { by: 'lead', why: 'w', at: T }
  const mk = (id: string, x: Record<string, unknown>) => ({ ...base, id, title: id, status: 'waiting', note: 'waiting for you', attempts: 1, origin, merge_into: 'main', history: [], runs: [], question: null, ...x })
  board.tasks.push(
    mk('T-10', { question: 'Red or blue?', options: ['Red', 'Blue'], question_lead: 'Which colour do you want?', options_lead: ['Crimson', 'Navy'], history: [{ at: T, kind: 'asked', text: 'worker asked: Red or blue?' }] }),
    mk('T-11', { question: 'T-11 needs to change files outside its list: a.ts. Allow them?', asked_files: ['a.ts'] }),
    mk('T-12', { question: 'Which one?', history: [{ at: T, kind: 'asked', text: 'the lead asked the owner a question' }] }),
    mk('T-13', { status: 'doing', note: '', question: null, live: { session: 'me', phase: 'worker', question: { question: 'Left or right?', options: ['Left', 'Right'] } }, runs: [{ started: T }] }),
  )
  board.questions = [{ id: 'Q-1', text: 'Raise the version?', options: ['Yes', 'No'], asked_at: T }]
  board.next_question = 2
  w.files.set(`${D}/board.json`, JSON.stringify(board, null, 2))
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10)
  const figs = { runs: 1, tokens: { input: 5 }, ms: 10 }
  w.files.set(`${D}/scouts.json`, JSON.stringify({ scouts: { bugs: { last_run: E, last_report: '1. Old crash.' }, docs: { last_run: E, paused: true } }, usage: { bugs: { ...figs, days: { [day(2)]: figs, [day(400)]: figs } } } }))
  const text = await doctor(w.host, '')
  expect(text).toContain('instead of one `ask` record')
  expect(text).toContain('board questions with no `by`')
  expect(text).toContain('last_run / last_report entries')
  expect(await doctor(w.host, 'fix migrate-data')).toContain('✓ migrate-data')
  const b = await load(w.host)
  const t = (id: string) => b.tasks.find(x => x.id === id)! as unknown as Record<string, unknown>
  expect(t('T-10').ask).toEqual({ by: 'worker', text: 'Red or blue?', options: ['Red', 'Blue'], asked_at: E, lead: { text: 'Which colour do you want?', options: ['Crimson', 'Navy'] } })
  expect(t('T-11').ask).toMatchObject({ by: 'symcc', files: ['a.ts'] })
  expect(t('T-12').ask).toMatchObject({ by: 'lead', text: 'Which one?' })
  expect((t('T-13').live as { ask?: unknown }).ask).toMatchObject({ by: 'worker', text: 'Left or right?', options: ['Left', 'Right'] })
  for (const id of ['T-10', 'T-11', 'T-12', 'T-13']) expect(['question', 'options', 'asked_files', 'question_lead', 'options_lead'].filter(k => k in t(id))).toEqual([])
  expect(b.questions?.[0]).toMatchObject({ id: 'Q-1', by: 'lead', text: 'Raise the version?', options: ['Yes', 'No'] })
  // scouts.json keeps the pause and the usage (a year of days); the report moved to the scout's runs file
  const sc = JSON.parse(w.files.get(`${D}/scouts.json`)!)
  expect(sc.scouts).toEqual({ docs: { paused: true } })
  expect(Object.keys(sc.usage.bugs.days)).toEqual([day(2)])
  expect(sc.usage.bugs.runs).toBe(1)
  expect(JSON.parse(w.files.get(`${D}/scouts/bugs.runs.json`)!).runs[0]).toMatchObject({ ended: E, outcome: 'found' })
  expect(await doctor(w.host, '')).not.toContain('migrate-data')
})

test('T-808: usage days that only aged past a year are not old data', () => {
  const figs = { runs: 1, tokens: { input: 5, output: 1 }, ms: 10 }
  const scouts = { scouts: { bugs: { paused: true } }, usage: { bugs: { ...figs, days: { '2026-11-30': figs } } } }
  const rows = oldDataRows({ board: null, archive: [], scouts, withRuns: new Set(), fieldGuide: false, orgMem: false, nowMs: Date.parse('2027-12-01') })
  expect(rows.filter(r => r.fix).length).toBe(0)
})

test('T-854: a board written by today\'s code (empty question fields from a writer) is not old data, and a second migration does nothing', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  const origin = { by: 'lead', why: 'w', at: T }
  const mk = (id: string, x: Record<string, unknown>) => ({ ...base, id, title: id, status: 'todo', note: '', attempts: 0, origin, merge_into: 'main', history: [], runs: [], ...x })
  const nulls = { question: null, options: [], asked_files: [], question_lead: '', options_lead: [], conflict_tries: null, test_rerun: null, rerun_minutes: null }
  const board = { ...emptyBoard(), tasks: [
    mk('T-1', { ...nulls }),
    mk('T-2', { status: 'waiting', note: 'waiting for you', ask: { by: 'worker', text: 'Red or blue?', asked_at: E }, ...nulls }),
    mk('T-3', { status: 'doing', live: { phase: 'worker', question: null }, runs: [{ started: T, agents: [{ kind: 'worker', started: T }] }], ...nulls }),
  ] }
  w.files.set(`${D}/board.json`, JSON.stringify(board, null, 2))
  w.files.set(`${D}/archive.json`, JSON.stringify({ version: 1, tasks: [mk('T-4', { status: 'done', ...nulls })] }))
  w.files.set(`${D}/scouts.json`, JSON.stringify({ scouts: {}, usage: {} }))
  w.files.delete(`${D}/field-guide.md`)
  const rows = oldDataRows({ board, archive: [mk('T-4', { status: 'done', ...nulls })], scouts: null, withRuns: new Set(), fieldGuide: false, orgMem: false })
  expect(rows.filter(r => r.text.includes('instead of one `ask` record'))).toEqual([])
  expect(await migrateIfOld(w.host)).toBe('')
  expect(backups(w).size).toBe(0)
})

test('T-854: after one migration of truly old data, a second migrateIfOld makes no backup', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  const board = JSON.parse(w.files.get(`${D}/board.json`)!)
  board.tasks.push({ ...base, id: 'T-10', title: 'ten', status: 'waiting', note: 'waiting for you', attempts: 1, origin: { by: 'lead', why: 'w', at: T }, merge_into: 'main', history: [], runs: [], question: 'Red or blue?', options: ['Red', 'Blue'] })
  w.files.set(`${D}/board.json`, JSON.stringify(board, null, 2))
  expect(await migrateIfOld(w.host)).toBe('')
  expect(backups(w).size).toBe(1)
  const toasts = leadQueue.length
  expect(await migrateIfOld(w.host)).toBe('')
  expect(await migrateIfOld(w.host)).toBe('')
  expect(backups(w).size).toBe(1)
  expect(leadQueue.length).toBe(toasts)
})

test('T-854: the doctor shows a migration backup folder\'s real size', async () => {
  const w = world()
  w.files.set(`${D}/data.before-migrate-1`, '')
  w.files.delete(`${D}/data.before-migrate-1`)
  for (const n of ['a', 'b']) w.files.set(`${D}/data.before-migrate-${n}/board.json`, 'x')
  w.files.set(`${D}/data.before-migrate-b/board.json`, 'x')
  const run0 = w.host.run
  w.host.run = async (argv, o) => (argv[0] === 'du' ? done({ stdout: `5000\t${argv[2]}\n` }) : run0(argv, o))
  const text = await doctor(w.host, '')
  const line = text.split('\n').find(l => l.includes('data.before-migrate-a'))!
  expect(line).toBeDefined()
  expect(line).not.toContain('0 B')
  expect(line).toMatch(/4\.[89] MB|5(\.0)? MB/)
})

test('T-886: old data written again within an hour (an older symcc copy) reuses the backup folder and tells the owner once that an older copy writes to the board', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  const original = w.files.get(`${D}/board.json`)!
  expect(await migrateIfOld(w.host)).toBe('')
  for (let i = 0; i < 3; i++) {
    w.files.set(`${D}/board.json`, original)
    expect(await migrateIfOld(w.host)).toBe('')
    expect(JSON.parse(w.files.get(`${D}/board.json`)!).mode).toBe('paused')
  }
  expect(backups(w).size).toBe(1)
  expect(leadQueue.filter(t => t.includes('moved your old data')).length).toBe(1)
  expect(leadQueue.filter(t => t.includes('an older symcc copy is writing to this board')).length).toBe(1)
})

test('T-886: after a reload (memory empty) a backup under an hour old is reused and the owner warned; one over an hour old gets a fresh backup', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  const name = (ms: number) => `data.before-migrate-${new Date(ms).toISOString().replace(/[:.]/g, '-')}`
  const recent = name(Date.now() - 10 * 60_000)
  w.files.set(`${D}/${recent}/board.json`, 'older')
  w.files.set(`${D}/${recent}/migrated.json`, JSON.stringify({ at: new Date(Date.now() - 10 * 60_000).toISOString(), version: S.version }))
  expect(await migrateIfOld(w.host)).toBe('')
  expect(backups(w).size).toBe(1)
  expect(leadQueue.filter(t => t.includes('an older symcc copy is writing to this board')).length).toBe(1)
  expect(leadQueue.some(t => t.includes(`.symcc/${recent}/`))).toBe(true)
  // a world whose only backup is two hours old: a new one is made
  const v = world()
  leadQueue.length = 0
  v.files.set(`${D}/${name(Date.now() - 2 * 60 * 60_000)}/board.json`, 'older')
  expect(await migrateIfOld(v.host)).toBe('')
  expect(backups(v).size).toBe(2)
})

test('T-886: a backup not left by a successful migration (a failed try, before a reload, or another symcc version) gives the usual message, not the older-copy warning', async () => {
  const name = (ms: number) => `data.before-migrate-${new Date(ms).toISOString().replace(/[:.]/g, '-')}`
  const older = (_w: unknown) => leadQueue.filter(t => t.includes('an older symcc copy')).length
  const moved = () => leadQueue.filter(t => t.includes('moved your old data')).length
  // writing board.json fails with why() while it is not ''
  const failBoard = (w: ReturnType<typeof world>, why: () => string) => {
    const write = w.host.fs.write
    w.host.fs.write = async (p, text) => {
      if (why() && p.endsWith('board.json') && !p.includes('before-migrate')) throw new Error(why())
      return write(p, text)
    }
    const run = w.host.run
    w.host.run = async (argv, opts) => (why() && argv[0] === 'mv' && String(argv[argv.length - 1]).endsWith('board.json') ? done({ exitCode: 1, stderr: why() }) : run(argv, opts))
  }
  // 1. the failure reason changes, then it works (one process)
  {
    const w = world()
    S.enabledNow = true
    leadQueue.length = 0
    let why = 'disk A'
    failBoard(w, () => why)
    expect(await migrateIfOld(w.host)).toContain("couldn't move")
    why = 'disk B'
    w.files.set(`${D}/scouts.json`, w.files.get(`${D}/scouts.json`)! + ' ')
    expect(await migrateIfOld(w.host)).toContain("couldn't move")
    why = ''
    w.files.set(`${D}/scouts.json`, w.files.get(`${D}/scouts.json`)! + ' ')
    expect(await migrateIfOld(w.host)).toBe('')
    expect(older(w)).toBe(0)
    expect(moved()).toBe(1)
  }
  // 2. a failure, a reload (memory empty), then it works
  {
    const w = world()
    leadQueue.length = 0
    let fail = true
    failBoard(w, () => (fail ? 'disk A' : ''))
    expect(await migrateIfOld(w.host)).toContain("couldn't move")
    forgetMigrationFailure()
    fail = false
    expect(await migrateIfOld(w.host)).toBe('')
    expect(older(w)).toBe(0)
    expect(moved()).toBe(1)
  }
  // 3. a recent success by another symcc version (an update added an old-shape rule)
  {
    const w = world()
    leadQueue.length = 0
    const recent = name(Date.now() - 10 * 60_000)
    w.files.set(`${D}/${recent}/board.json`, 'older')
    w.files.set(`${D}/${recent}/migrated.json`, JSON.stringify({ at: new Date(Date.now() - 10 * 60_000).toISOString(), version: `${S.version}-other` }))
    expect(await migrateIfOld(w.host)).toBe('')
    expect(older(w)).toBe(0)
    expect(moved()).toBe(1)
  }
})

test('T-886: a half-made backup (a copy failed part way) is never reused: the next run makes a whole new one', async () => {
  const w = world()
  S.enabledNow = true
  leadQueue.length = 0
  let fail = true
  const write = w.host.fs.write
  w.host.fs.write = async (p, text) => {
    if (fail && p.includes('before-migrate') && p.endsWith('/archive.json')) throw new Error('disk full')
    return write(p, text)
  }
  const archiveBefore = w.files.get(`${D}/archive.json`)
  expect(await migrateIfOld(w.host)).toContain('the backup could not be made')
  fail = false
  w.files.set(`${D}/scouts.json`, w.files.get(`${D}/scouts.json`)! + ' ')
  expect(await migrateIfOld(w.host)).toBe('')
  // the folder the success names holds the archive as it was, and is marked whole
  const told = leadQueue.find(t => t.includes('moved your old data'))!
  const used = [...backups(w)].find(b => told.includes(`data.before-migrate-${b}/`))!
  expect(typeof used).toBe('string')
  expect(w.files.get(`${D}/data.before-migrate-${used}/archive.json`)).toBe(archiveBefore)
  expect(w.files.has(`${D}/data.before-migrate-${used}/backup-complete.json`)).toBe(true)
})

test('T-886: a task already in the queue step with a leftover "queue (n)" note migrates to no old rows', async () => {
  const w = world()
  S.enabledNow = true
  const board = JSON.parse(w.files.get(`${D}/board.json`)!)
  board.tasks.push({ ...base, id: 'T-9', title: 'nine', status: 'doing', note: 'queue (2)', attempts: 1, origin: { by: 'lead', why: 'w', at: T }, merge_into: 'main', history: [], runs: [{ started: T }], live: { session: 'me', phase: 'checker', checking: { step: 'queue', place: 2, at: E } } })
  w.files.set(`${D}/board.json`, JSON.stringify(board, null, 2))
  expect(await migrateIfOld(w.host)).toBe('')
  expect((await oldDataFound(w.host)).rows.filter(r => r.fix).length).toBe(0)
  const t9 = (await load(w.host)).tasks.find(t => t.id === 'T-9')!
  expect(t9.note).toBe('')
  expect(t9.live?.checking).toEqual({ step: 'queue', place: 2, at: E })
})
