// T-429: a session that does not drive the board reloads board.json on its heartbeat (claimLead) when another
// session changed the file, so its panel and status line show the new tasks; with no change it reloads nothing.
import { expect } from 'claude-code/testing'
import { addTask, emptyBoard, leadText, type Board } from '../hooks/board'
import { claimLead } from '../hooks/plugin/lead'
import { S } from '../hooks/plugin/state'
import { saveBoard } from '../hooks/plugin/store'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'

/** A fake Host on in-memory files whose mtime goes up on every write; counts the panel redraws and board reads. */
function world() {
  const files = new Map<string, string>()
  const mtimes = new Map<string, number>()
  let tick = 1000
  const put = (p: string, text: string) => (files.set(p, text), mtimes.set(p, ++tick))
  const fs = memoryFs(files, p => mtimes.get(p) ?? 0)
  const w = fakeHost({
    fs: { ...fs, write: async (p, text) => void put(p, text) },
    run: async argv => {
      const [cmd, ...rest] = argv
      const args = rest.filter(a => !a.startsWith('-'))
      if (cmd === 'mv' || cmd === 'ln') {
        const [from, to] = args as [string, string]
        if (!files.has(from)) return done({ exitCode: 1, stderr: 'No such file' })
        if (cmd === 'ln' && files.has(to)) return done({ exitCode: 1, stderr: 'File exists' })
        put(to, files.get(from)!)
        if (cmd === 'mv') files.delete(from)
        return done()
      }
      if (cmd === 'rm') for (const a of args) files.delete(a)
      return done()
    },
  })
  const board = `${ROOT}/${S.N.boardFile}`
  const lead = `${ROOT}/${S.N.leadFile}`
  let redraws = 0
  const panel = w.host.ui.panel!
  const update = panel.updateView
  panel.updateView = async f => (redraws++, update(f))
  let reads = 0
  const read = w.host.fs.read
  w.host.fs.read = async p => (p === board && reads++, read(p))
  return { ...w, files, put, board, lead, redraws: () => redraws, reads: () => reads }
}

const withTask = (b: Board, title: string) => addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, '2026-11-18T00:00:00Z')[0]
/** What another session writes: the board on disk with one more task. */
const another = (w: ReturnType<typeof world>, title: string) => w.put(w.board, JSON.stringify(withTask(JSON.parse(w.files.get(w.board)!) as Board, title), null, 2) + '\n')

/** Sets up a session `me` that follows: another session (`other`) drives, and the board has one task. */
async function follower() {
  S.root = ROOT
  S.me = 'me'
  const w = world()
  w.put(w.lead, leadText('other', Date.now()))
  await saveBoard(w.host, withTask(emptyBoard(), 'First'))
  // the first heartbeat (the plugin just loaded) shows the board as it is
  expect(await claimLead(w.host, true)).toBe(false)
  expect(w.panel.view().tasks.map(t => t.title)).toEqual(['First'])
  return w
}

test('a session that does not drive redraws the board on the next heartbeat after another session writes board.json', async () => {
  const w = await follower()
  const before = w.redraws()
  another(w, 'Second')
  expect(await claimLead(w.host)).toBe(false)
  expect(w.redraws()).toBe(before + 1)
  expect(w.panel.view().tasks.map(t => t.title)).toEqual(['First', 'Second'])
})

test('a heartbeat with no change to board.json neither reloads nor redraws it', async () => {
  const w = await follower()
  const [redraws, reads] = [w.redraws(), w.reads()]
  expect(await claimLead(w.host)).toBe(false)
  expect(await claimLead(w.host)).toBe(false)
  expect(w.redraws()).toBe(redraws)
  expect(w.reads()).toBe(reads)
})

test("this session's own save of board.json causes no extra redraw on its heartbeat", async () => {
  const w = await follower()
  await saveBoard(w.host, withTask(JSON.parse(w.files.get(w.board)!) as Board, 'Mine'))
  const redraws = w.redraws()
  await claimLead(w.host)
  expect(w.redraws()).toBe(redraws)
})

test('a missing or unreadable board.json does not throw on the heartbeat of a session that does not drive', async () => {
  const w = await follower()
  w.files.delete(w.board)
  const redraws = w.redraws()
  expect(await claimLead(w.host)).toBe(false)
  expect(w.redraws()).toBe(redraws)
  w.host.fs.stat = async () => Promise.reject(new Error('unreadable'))
  expect(await claimLead(w.host)).toBe(false)
  expect(w.redraws()).toBe(redraws)
})

test("the driving session's heartbeat works as before: it refreshes lead.json and does not reload the board to redraw it", async () => {
  S.root = ROOT
  S.me = 'me'
  const w = world()
  w.put(w.lead, leadText('me', Date.now()))
  await saveBoard(w.host, withTask(emptyBoard(), 'First'))
  expect(await claimLead(w.host, true)).toBe(true)
  const stale = leadText('me', Date.now() - 20_000)
  w.put(w.lead, stale)
  const redraws = w.redraws()
  another(w, 'Second')
  expect(await claimLead(w.host)).toBe(true)
  expect(S.driving).toBe(true)
  expect(w.files.get(w.lead)).not.toBe(stale)
  expect(w.redraws()).toBe(redraws)
})
