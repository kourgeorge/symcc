// T-660: evidence in the activity log. A guard refusal adds one 'refused' event (who, which guard, a short cleaned
// reason, the refused path or the command's head: never the full command or a secret); a "needs files" stop, a worker's
// question, a checker verdict and a queue outcome add theirs. Logging runs after the decision, in the background: it
// never changes the guard's answer or holds it up. Lines past the log's limit move to events-archive.jsonl.
// The checker verdict and the queue outcome of a real run are checked in checker.test.ts (the T-616 flow test).
import { expect } from 'claude-code/testing'
import { addTask, emptyBoard, patchTask, workerGitWriteText, blockedEditText, ASK_SENT } from '../hooks/board'
import { checkEdit, askCall } from '../hooks/app/ask'
import { toolCall } from '../hooks/app/symcc'
import { finishWork } from '../hooks/app/workers'
import { evidenceWritten, logQueue, logVerdict } from '../hooks/app/evidence'
import { EVENT_LOG_KEEP, EVENT_LOG_LINES, logEvents, type LogEvent } from '../hooks/app/events'
import { cleanBit, commandHead, shortReason, problemCount, REASON_MAX } from '../hooks/core/evidence'
import { saveBoard } from '../hooks/app/store'
import { S, workers, scoutRuns, stopped, toolName } from '../hooks/app/state'
import type { HostRunResult } from '../hooks/host'
import { fakeHost, memoryFs, done } from './fake-host'
import { test } from './reset'
import { pause } from './fakes'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const AT = '2026-11-20T12:00:00.000Z'
const LOG = `${ROOT}/.symcc/events.jsonl`
const SECRET = 'sk-abcdefghijklmnopqrstuvwxyz0123'

/** A host with in-memory files and the commands the board's lock and safe writes use; `hang` makes the log's writes never finish. */
function world(opts: { hang?: boolean; failLog?: boolean; maxRead?: number } = {}) {
  const files = new Map<string, string>()
  const fs = memoryFs(files)
  const { host } = fakeHost({
    fs: {
      ...fs,
      // like the Claude host, which refuses to read a file over 4 MiB
      read: async (p: string) => {
        if (opts.maxRead !== undefined && (files.get(p)?.length ?? 0) > opts.maxRead) throw new Error('file too big')
        return fs.read(p)
      },
      write: async (p: string, text: string) => {
        if (opts.failLog && p.includes('events')) throw new Error('disk full')
        if (opts.hang && p.includes('events')) return new Promise<void>(() => undefined)
        return fs.write(p, text)
      },
    },
    run: async ([cmd, ...a]): Promise<HostRunResult> => {
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), files.delete(x!), done())
      if (cmd === 'sh' && a[1] === 'cat "$1" >> "$2"') return (files.set(a[4]!, (files.get(a[4]!) ?? '') + files.get(a[3]!)!), done())
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
  return text.trim() ? text.trim().split('\n').map(l => JSON.parse(l) as LogEvent).filter(e => !['state', 'stage', 'wait', 'created', 'removed'].includes(e.kind)) : []
}

test('a refused git command adds one "refused" event: who, the guard, a short cleaned reason and the command head, never the full command', async () => {
  const w = world()
  await withWorker(w)
  const command = `git commit -m "token=${SECRET} and more words that should never be logged"`
  expect(await checkEdit(w.host, 'w1', { command }, WT)).toBe(workerGitWriteText('git commit'))
  const got = await evidence(w)
  expect(got.length).toBe(1)
  const e = got[0] as Extract<LogEvent, { kind: 'refused' }>
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
  const got = (await evidence(w)) as Extract<LogEvent, { kind: 'refused' }>[]
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
    const { at, task, try: n, ...rest } = e as LogEvent & { try: number }
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

test('past the log limit, older lines move to events-archive.jsonl instead of being dropped', async () => {
  const w = world()
  const ARCH = `${ROOT}/.symcc/events-archive.jsonl`
  const line = (i: number): LogEvent => ({ kind: 'asked', at: AT, task: `T-${i}`, try: 1 })
  w.files.set(ARCH, `${JSON.stringify(line(-1))}\n`)
  w.files.set(LOG, Array.from({ length: EVENT_LOG_LINES }, (_, i) => JSON.stringify(line(i))).join('\n') + '\n')
  await logEvents([line(EVENT_LOG_LINES), line(EVENT_LOG_LINES + 1)], w.host)
  const log = w.files.get(LOG)!.trim().split('\n')
  const arch = w.files.get(ARCH)!.trim().split('\n')
  const moved = EVENT_LOG_LINES + 2 - EVENT_LOG_KEEP
  expect(log.length).toBe(EVENT_LOG_KEEP)
  expect((JSON.parse(log[0]!) as { task: string }).task).toBe(`T-${moved}`)
  expect(arch.map(l => (JSON.parse(l) as { task: string }).task)).toEqual(['T--1', ...Array.from({ length: moved }, (_, i) => `T-${i}`)])
  expect([...w.files.keys()].filter(f => f.includes('.add-') || f.includes('.tmp-'))).toEqual([])
})

test('an archive too big to read keeps its history: new lines are added to its end, it is never rewritten', async () => {
  const w = world({ maxRead: 1_000_000 })
  const ARCH = `${ROOT}/.symcc/events-archive.jsonl`
  const line = (i: number): LogEvent => ({ kind: 'asked', at: AT, task: `T-${i}`, try: 1 })
  const big = Array.from({ length: 22000 }, (_, i) => JSON.stringify(line(-1 - i))).join('\n') + '\n'
  w.files.set(ARCH, big)
  w.files.set(LOG, Array.from({ length: EVENT_LOG_LINES }, (_, i) => JSON.stringify(line(i))).join('\n') + '\n')
  await logEvents([line(EVENT_LOG_LINES)], w.host)
  const arch = w.files.get(ARCH)!
  expect(arch.startsWith(big)).toBe(true)
  expect(arch.trim().split('\n').length).toBe(22000 + EVENT_LOG_LINES + 1 - EVENT_LOG_KEEP)
  // the next write, now under the limit, moves nothing
  await logEvents([line(EVENT_LOG_LINES + 1)], w.host)
  expect(w.files.get(ARCH)!.length).toBe(arch.length)
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
  expect(commandHead('PGPASSWORD=hunter2 psql -h db')).toBe('PGPASSWORD=[hidden] psql')
  expect(commandHead('export DB_PASSWORD=hunter2')).toBe('export DB_PASSWORD=[hidden]')
  expect(cleanBit('GITHUB_TOKEN=abc123 gh', 60)).toBe('GITHUB_TOKEN=[hidden] gh')
})
