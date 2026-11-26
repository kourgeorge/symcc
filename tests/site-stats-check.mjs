// T-1145: runs scripts/site-stats.ts on a small fake project (a board with a finished task kept in tasks/T-1.json,
// an archive file, scouts.json) and checks the fields of the JSON and that no title, detail, request, history text
// or path of the fake board is in it. Run by tests/site-stats.sh: bun tests/site-stats-check.mjs <repo> <tmp folder>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const [repo, tmp] = process.argv.slice(2)
const root = join(tmp, 'secret-project-folder')
const data = join(root, '.symcc')
mkdirSync(join(data, 'tasks'), { recursive: true })
const now = Date.now()
const iso = min => new Date(now - min * 60_000).toISOString()
const run = (min, tokens) => ({ started: iso(100), ended: iso(100 - min), ended_by: 'merged', ended_note: 'merged', agents: [{ kind: 'worker', started: iso(100), ended: iso(100 - min), tokens: { input: tokens, output: tokens / 10 } }] })
const base = (id, title, status, over = {}) => ({ id, title, details: `DETAILS-${id}`, files: ['src/secret-file.ts'], status, note: 'NOTE-SECRET', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(100), updated_at: iso(1), ...over })
const done = (id, title, over = {}) => base(id, title, 'done', { history: [{ at: iso(2), kind: 'merged', text: 'HISTORY-SECRET', how: 'own' }], runs: [run(10, 1000)], origin: { by: 'scout', scout: 'bugs', why: 'WHY-SECRET', request: 'REQUEST-SECRET' }, ...over })
const t1 = done('T-1', 'TITLE-SECRET-ONE')
const { id, title, status, priority, after, attempts, branch, created_at, updated_at } = t1
writeFileSync(join(data, 'board.json'), JSON.stringify({
  next_id: 5,
  tasks: [
    { id, title, status, priority, after, attempts, branch, created_at, updated_at, parts: 'tasks/T-1.json' },
    base('T-2', 'TITLE-SECRET-TWO', 'doing', { runs: [{ started: iso(5), agents: [] }], origin: { by: 'owner', request: 'REQUEST-SECRET' } }),
  ],
}))
writeFileSync(join(data, 'tasks/T-1.json'), JSON.stringify({ tasks: { 'T-1': t1 } }))
writeFileSync(join(data, 'archive.json'), JSON.stringify({ version: 1, tasks: [done('T-3', 'TITLE-SECRET-THREE', { runs: [run(20, 2000), run(5, 500)] }), base('T-4', 'TITLE-SECRET-FOUR', 'dropped', { origin: { by: 'scout', scout: 'bugs' } })] }))
writeFileSync(join(data, 'scouts.json'), JSON.stringify({ scouts: {}, usage: { bugs: { runs: 2, tokens: { input: 7000, output: 300 }, ms: 60000, days: {} } } }))

const out = join(tmp, 'out/stats.json')
const r = spawnSync('bun', [join(repo, 'scripts/site-stats.ts'), '--root', root, '--out', out, '--from', '2026-11-09'], { encoding: 'utf8', env: { ...process.env, HOME: join(tmp, 'nohome'), CLAUDE_CONFIG_DIR: '' } })
let bad = 0
const fail = m => { console.log(`FAIL: ${m}`); bad++ }
if (r.status !== 0) { fail(`script failed: ${r.stderr}${r.stdout}`); process.exit(1) }
const text = readFileSync(out, 'utf8')
const s = JSON.parse(text)
const want = ['from', 'to', 'days', 'tasks', 'tries', 'endedHow', 'failedTries', 'workMs', 'tokens', 'perDone', 'stages', 'roles', 'origins', 'scouts', 'perDay']
for (const k of want) if (!(k in s)) fail(`missing field ${k}`)
for (const k of Object.keys(s)) if (!want.includes(k)) fail(`unexpected field ${k}`)
if (s.from !== '2026-11-09') fail(`from is ${s.from}`)
if (s.tasks.done !== 2) fail(`tasks.done is ${s.tasks.done}, want 2 (one from tasks/T-1.json, one archived)`)
if (s.tasks.dropped !== 1) fail(`tasks.dropped is ${s.tasks.dropped}`)
if (s.tries.total !== 4) fail(`tries.total is ${s.tries.total}`)
if (s.tries.firstTryRate !== 50) fail(`firstTryRate is ${s.tries.firstTryRate}`)
const bugs = s.scouts.find(x => x.name === 'bugs')
if (!bugs || bugs.found !== 3 || bugs.merged !== 2 || bugs.dropped !== 1) fail(`scout bugs: ${JSON.stringify(bugs)}`)
if (!(s.tokens.scouts.all > 0) || !(s.tokens.workers.all > 0) || s.tokens.total.all < s.tokens.workers.all) fail(`tokens: ${JSON.stringify(s.tokens)}`)
if (s.tokens.lead !== null) fail('the lead should not be counted without session logs')
if (!(s.perDone.medianTokens > 0) || !(s.perDone.medianMs > 0)) fail(`perDone: ${JSON.stringify(s.perDone)}`)
if (!s.perDay.length) fail('no perDay')
for (const secret of ['SECRET', 'secret-project-folder', 'secret-file', 'DETAILS-', 'tmp', 'Users']) if (text.includes(secret)) fail(`the JSON holds "${secret}"`)
process.exit(bad ? 1 : 0)
