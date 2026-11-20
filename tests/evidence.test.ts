// T-660: evidence, in its own file .symcc/evidence.jsonl (never the activity log events.jsonl). A guard refusal adds one 'refused' event (who, which guard, a short cleaned
// reason, the refused path or the command's head: never the full command or a secret); a "needs files" stop, a worker's
// question, a checker verdict and a queue outcome add theirs. Logging runs after the decision, in the background: it
// never changes the guard's answer or holds it up. symcc never reads the file back; a full one is renamed to an archive.
// The checker verdict and the queue outcome of a real run are checked in checker.test.ts (the T-616 flow test).
import { expect } from 'claude-code/testing'
import { addTask, emptyBoard, patchTask, workerGitWriteText, blockedEditText, ASK_SENT } from '../hooks/board'
import { checkEdit, askCall } from '../hooks/app/ask'
import { toolCall } from '../hooks/app/symcc'
import { finishWork } from '../hooks/app/workers'
import { EVIDENCE_MAX_BYTES, evidenceArchiveFile, evidenceWritten, logAsked, logQueue, logVerdict } from '../hooks/app/evidence'
import { logEvents, type TaskEvent } from '../hooks/app/events'
import { type EvidenceEvent, cleanBit, commandHead, programName, shortReason, problemCount, REASON_MAX } from '../hooks/core/evidence'
import { saveBoard } from '../hooks/app/store'
import { S, workers, scoutRuns, stopped, toolName } from '../hooks/app/state'
import type { HostRunResult } from '../hooks/host'
import { appendLineRun, fakeHost, memoryFs, done } from './fake-host'
import { test } from './reset'
import { pause } from './fakes'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const AT = '2026-11-20T12:00:00.000Z'
const LOG = `${ROOT}/.symcc/evidence.jsonl`
const EVENTS = `${ROOT}/.symcc/events.jsonl`
const SECRET = 'sk-abcdefghijklmnopqrstuvwxyz0123'

/** A host with in-memory files and the commands the board's lock and safe writes use; `hang` makes the log's writes never finish. */
function world(opts: { hang?: boolean; failLog?: boolean } = {}) {
  const files = new Map<string, string>()
  const fs = memoryFs(files)
  const { host } = fakeHost({
    fs: {
      ...fs,
      write: async (p: string, text: string) => {
        if (opts.failLog && p.includes('evidence')) throw new Error('disk full')
        if (opts.hang && p.includes('evidence')) return new Promise<void>(() => undefined)
        return fs.write(p, text)
      },
    },
    run: async (argv): Promise<HostRunResult> => {
      const [cmd, ...a] = argv
      if (argv[0] === 'sh' && argv[2]?.includes('printf ')) {
        if (opts.failLog) throw new Error('disk full')
        if (opts.hang) return new Promise<HostRunResult>(() => undefined)
        return (appendLineRun(files, argv), done())
      }
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), files.delete(x!), done())
      if (cmd === 'rm') for (const f of a.filter(v => !v.startsWith('-'))) files.delete(f)
      return done()
    },
  })
  S.root = ROOT
  S.writing = Promise.resolve()
  return { host, files }
}

/** A board with T-1 "doing" on try 2, files src/ only, and its worker w1 running. */
async function withWorker(w: ReturnType<typeof world>) {
  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Do it', details: 'x', files: ['src/'] }, AT)
  await saveBoard(w.host, patchTask(b, 'T-1', { status: 'doing', attempts: 2, agent: 'w1' }, AT))
  workers.set('w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
}

const evidence = async (w: ReturnType<typeof world>) => {
  await evidenceWritten()
  const text = w.files.get(LOG) ?? ''
  return text.trim() ? text.trim().split('\n').map(l => JSON.parse(l) as EvidenceEvent) : []
}

test('a refused git command adds one "refused" event: who, the guard, a short cleaned reason and the command head, never the full command', async () => {
  const w = world()
  await withWorker(w)
  const command = `git commit -m "token=${SECRET} and more words that should never be logged"`
  expect(await checkEdit(w.host, 'w1', { command }, WT)).toBe(workerGitWriteText('git commit'))
  const got = await evidence(w)
  expect(got.length).toBe(1)
  const e = got[0] as Extract<EvidenceEvent, { kind: 'refused' }>
  expect([e.kind, e.task, e.try, e.role, e.guard, e.what]).toEqual(['refused', 'T-1', 2, 'worker', 'git', 'git commit'])
  expect(e.reason.length <= REASON_MAX).toBe(true)
  expect(e.reason.startsWith('Refused')).toBe(false)
  const line = w.files.get(LOG)!
  expect([line.includes(SECRET), line.includes('should never be logged')]).toEqual([false, false])
})

test('an edit outside the task files adds a "files" refusal with the path; an allowed edit adds nothing', async () => {
  const w = world()
  await withWorker(w)
  expect(await checkEdit(w.host, 'w1', { path: `${WT}/src/a.ts` }, WT)).toBe(undefined)
  expect(await checkEdit(w.host, 'w1', { path: `${WT}/docs/x.md` }, WT)).toBe(blockedEditText('docs/x.md'))
  const got = (await evidence(w)) as Extract<EvidenceEvent, { kind: 'refused' }>[]
  expect(got.map(e => [e.guard, e.what, e.role, e.task])).toEqual([['files', 'docs/x.md', 'worker', 'T-1']])
})

test('a scout calling a lead tool and a scout asking the owner are logged as refusals; a worker question is logged with no text', async () => {
  const w = world()
  await withWorker(w)
  scoutRuns.set('s1', 'gaps-bot')
  const r = await toolCall(w.host, toolName('add'), 's1', {})
  expect(r && 'deny' in r).toBe(true)
  expect(await askCall(w.host, 'w1', { question: `Which one? ${SECRET}` })).toBe(ASK_SENT)
  const got = await evidence(w)
  expect(got.map(e => [e.kind, 'guard' in e ? e.guard : '', 'scout' in e ? e.scout : e.task])).toEqual([
    ['refused', 'tools', 'gaps-bot'],
    ['asked', '', 'T-1'],
  ])
  expect(w.files.get(LOG)!.includes('Which one')).toBe(false)
})

test('logging never changes the guard answer or holds it up: a log write that fails or never ends', async () => {
  for (const opts of [{ failLog: true }, { hang: true }]) {
    const w = world(opts)
    await withWorker(w)
    const command = 'git push origin main'
    const answer = await Promise.race([checkEdit(w.host, 'w1', { command }, WT), pause(2000).then(() => 'held up')])
    expect([opts, answer]).toEqual([opts, workerGitWriteText('git push')])
    // a hung write still lets the board be read
    if (opts.failLog) expect((await evidence(w)).length).toBe(0)
  }
})

test('evidence is never written under the board lock: three refused edits in a row all answer at once while each log write never ends', async () => {
  const w = world({ hang: true })
  await withWorker(w)
  const t0 = Date.now()
  for (const f of ['docs/a.md', 'docs/b.md', 'docs/c.md']) {
    const answer = await Promise.race([checkEdit(w.host, 'w1', { path: `${WT}/${f}` }, WT), pause(2000).then(() => 'held up')])
    expect(answer).toBe(blockedEditText(f))
  }
  expect(Date.now() - t0 < 1500).toBe(true)
})

test('a refusal with no "what" logs only the program name: no URL, no flags, no values', async () => {
  const w = world()
  await withWorker(w)
  stopped.add('w9')
  for (const command of ['curl https://user:pass@host/x', 'mysql -pSecret'])
    expect(await checkEdit(w.host, 'w9', { command }, '/repo')).not.toBe(undefined)
  const got = (await evidence(w)) as Extract<EvidenceEvent, { kind: 'refused' }>[]
  expect(got.map(e => e.what)).toEqual(['curl', 'mysql'])
  expect(['pass@', 'Secret', 'https'].filter(x => w.files.get(LOG)!.includes(x))).toEqual([])
  expect([programName('curl https://user:pass@host/x'), programName('mysql -pSecret'), programName('PGPASSWORD=x env A=1 psql -h db')]).toEqual(['curl', 'mysql', 'psql'])
  expect(cleanBit('see https://me:hunter2@api.example.com/x', 80)).toBe('see https://[hidden]@api.example.com/x')
})

test('a needs-files stop adds a "needs-files" event with the files asked for', async () => {
  const w = world()
  await withWorker(w)
  expect(await checkEdit(w.host, 'w1', { path: `${WT}/docs/x.md` }, WT)).toBe(blockedEditText('docs/x.md'))
  await finishWork(w.host, 'w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1' }, 'done, but I need docs/x.md')
  const got = await evidence(w)
  expect(got.map(e => [e.kind, 'files' in e ? e.files : '', e.task, e.try])).toEqual([
    ['refused', '', 'T-1', 2],
    ['needs-files', ['docs/x.md'], 'T-1', 2],
  ])
})

test('verdict and queue events: ok / problems with a count, and each queue outcome with its command or commit', async () => {
  const w = world()
  logVerdict(w.host, 'T-1', 1, { ok: true })
  logVerdict(w.host, 'T-1', 1, { ok: false, report: 'Problems:\n- a is wrong\n- b is missing\n1. c fails' })
  logVerdict(w.host, 'T-1', 1, null)
  logQueue(w.host, 'T-1', 1, { ok: false, command: `npm test -- --token=${SECRET} --very --long --flags`, detail: 'x' } as never)
  logQueue(w.host, 'T-1', 1, { ok: false, conflict: true })
  logQueue(w.host, 'T-1', 1, { ok: true, merged: 'abc123' })
  logQueue(w.host, 'T-1', 1, { ok: true, review: true })
  const got = (await evidence(w)).map(e => {
    const { at, task, try: n, ...rest } = e as EvidenceEvent & { try: number }
    return rest
  })
  expect(got).toEqual([
    { kind: 'verdict', verdict: 'ok' },
    { kind: 'verdict', verdict: 'problems', count: 3 },
    { kind: 'verdict', verdict: 'none' },
    { kind: 'queue', outcome: 'tests-failed', command: 'npm test -- --token=[hidden]' },
    { kind: 'queue', outcome: 'conflict' },
    { kind: 'queue', outcome: 'merged', commit: 'abc123' },
    { kind: 'queue', outcome: 'review' },
  ])
})

test('the cleaning: secrets hidden, one line, cut short', () => {
  expect(cleanBit(`a\n b password=hunter2 ${SECRET}`, 100)).toBe('a b password=[hidden] [hidden]')
  expect(cleanBit('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`)
  expect(shortReason('Refused: this is it. And more.')).toBe('this is it.')
  expect(problemCount('just one thing')).toBe(1)
})

test('a full evidence file is renamed to a dated archive (never read by symcc) and a fresh one started', async () => {
  const w = world()
  const ARCH = evidenceArchiveFile(new Date('2026-11-20T10:00:00.000Z'))
  expect(ARCH).toBe(`${ROOT}/.symcc/evidence-archive-2026-11-20T10-00-00-000Z.jsonl`)
  const full = 'x'.repeat(EVIDENCE_MAX_BYTES + 1) + '\n'
  w.files.set(LOG, full)
  logAsked(w.host, 'T-1', 1)
  await evidenceWritten()
  const arch = [...w.files.keys()].filter(f => f.includes('evidence-archive-'))
  expect(arch.length).toBe(1)
  expect(w.files.get(arch[0]!)).toBe(full)
  expect((await evidence(w)).map(e => e.kind)).toEqual(['asked'])
})

test('evidence never goes to events.jsonl: 300 evidence appends interleaved with logEvents writes keep all 300 lines', async () => {
  const w = world()
  const state = (i: number) => ({ kind: 'state', at: AT, task: 'T-1', try: 1, from: 'doing', to: 'checking', n: i }) as unknown as TaskEvent
  const writes: Promise<void>[] = []
  for (let i = 0; i < 300; i++) {
    logVerdict(w.host, 'T-1', i, { ok: true })
    writes.push(logEvents([state(i)], w.host))
    if (i % 7 === 0) await pause(0)
  }
  await Promise.all(writes)
  const got = await evidence(w)
  expect(got.length).toBe(300)
  expect(got.map(e => e.try)).toEqual(Array.from({ length: 300 }, (_, i) => i))
  expect(w.files.get(EVENTS)!.includes('"verdict"')).toBe(false)
})

test('a secret set in front of a refused command is never logged', async () => {
  const w = world()
  await withWorker(w)
  stopped.add('w9')
  for (const command of ['PGPASSWORD=hunter2 psql -h db', 'GITHUB_TOKEN=abc123 gh pr', 'export DB_PASSWORD=hunter2', 'env FOO=bar1x make'])
    expect(await checkEdit(w.host, 'w9', { command }, '/repo')).not.toBe(undefined)
  const line = (await evidenceWritten(), w.files.get(LOG) ?? '')
  expect(line.includes('"refused"')).toBe(true)
  expect(['hunter2', 'abc123', 'bar1x'].filter(s => line.includes(s))).toEqual([])
  expect(programName('PGPASSWORD=hunter2 psql -h db')).toBe('psql')
  expect(commandHead('PGPASSWORD=hunter2 psql -h db')).toBe('PGPASSWORD=[hidden] psql')
  expect(commandHead('export DB_PASSWORD=hunter2')).toBe('export DB_PASSWORD=[hidden]')
  expect(cleanBit('GITHUB_TOKEN=abc123 gh', 60)).toBe('GITHUB_TOKEN=[hidden] gh')
})
