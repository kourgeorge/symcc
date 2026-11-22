// T-795, T-844: a folder with no .symcc in it or above it stays off until the owner runs /symcc-init (like git init). Off means
// plain Claude: no lead prompt, no board updates, tools refuse, the band says so, and nothing is written. A project
// that already has a board still starts on (with or without `enabled`).
import { expect } from 'claude-code/testing'
import { emptyBoard, parseCommand, notSetUpAnswer, offStatusLine, offStatusParts, parseLead, type Board } from '../hooks/board'
import { S, toolName } from '../hooks/app/state'
import { leadGuideText, sessionStart, sessionEnd, toolCall, runCommand } from '../hooks/app/symcc'
import { tellLead, takeBoardUpdate } from '../hooks/app/tell'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'

function world(id: string, root = ROOT, repoRoot = root) {
  const files = new Map<string, string>()
  const opened: string[] = []
  const ran: { args: string; cwd?: string }[] = []
  const w = fakeHost({
    fs: memoryFs(files),
    session: { id: async () => id, repo: async () => ({ root: repoRoot }), root: async () => root },
    run: async (argv, init) => {
      const [cmd, ...rest] = argv
      if (cmd === 'git') ran.push({ args: argv.slice(1).join(' '), cwd: init?.cwd })
      const args = rest.filter(a => !a.startsWith('-'))
      if (cmd === 'mv') {
        const [from, to] = args as [string, string]
        if (!files.has(from)) return done({ exitCode: 1, stderr: 'No such file' })
        files.set(to, files.get(from)!)
        files.delete(from)
        return done()
      }
      if (cmd === 'rm') for (const a of args) files.delete(a)
      return done()
    },
    ui: { open: (async (a: { id: string }) => (opened.push(a.id), { isPlaced: true })) as never },
  })
  return { ...w, files, opened, ran, lead: `${root}/${S.N.leadFile}`, board: `${root}/${S.N.boardFile}` }
}

test('a session in a folder with no board: no lead prompt, no board update, tools refuse, the band says so, nothing is written', async () => {
  const w = world('a')
  await sessionStart(w.host)
  expect(S.fresh).toBe(true)
  expect(S.driving).toBe(false)
  expect(await leadGuideText(w.host)).toBeUndefined()
  tellLead(w.host, 'something happened')
  expect(w.toLead).toEqual([])
  expect(takeBoardUpdate()).toBeUndefined()
  expect(await toolCall(w.host, toolName('board'), undefined, {})).toEqual({ result: notSetUpAnswer(S.N.name) })
  expect(notSetUpAnswer('symcc')).toBe('no symcc board in this folder or any folder above it · /symcc-init to create one here')
  expect(w.panel.view()).toMatchObject({ on_here: false, off_here: 'new' })
  expect(offStatusLine('symcc', true, 'new')).toBe('no symcc board in this folder or any folder above it · /symcc-init to create one here')
  expect(offStatusParts('symcc', true, 'new').find(p => p.command)?.text).toBe('/symcc-init')
  expect(w.opened).toEqual([])
  // another command, /symcc-enable too, points to /symcc-init
  expect((await runCommand(w.host, 'symcc-enable', ''))?.text).toBe(notSetUpAnswer(S.N.name))
  expect((await runCommand(w.host, 'symcc-disable', ''))?.text).toBe(notSetUpAnswer(S.N.name))
  expect((await runCommand(w.host, 'symcc-mode', 'review'))?.text).toBe(notSetUpAnswer(S.N.name))
  await sessionEnd(w.host)
  expect([...w.files.keys()]).toEqual([])
})

test('/symcc-init in a folder with its own .git creates board.json with symcc on, the session becomes the lead, the panel opens', async () => {
  const w = world('a')
  w.files.set(`${ROOT}/.git`, '')
  await sessionStart(w.host)
  const r = await runCommand(w.host, 'symcc-init', '')
  expect(r?.text).toContain('is on in this project')
  expect(S.fresh).toBe(false)
  expect(w.files.has(w.board)).toBe(true)
  expect((JSON.parse(w.files.get(w.board)!) as Board).enabled).not.toBe(false)
  expect(S.driving).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
  expect(w.opened.length).toBe(1)
  expect(w.toLead.length + (takeBoardUpdate() ? 1 : 0)).toBeGreaterThan(0)
  expect(await leadGuideText(w.host)).toBeDefined()
  expect(w.panel.view()).toMatchObject({ on_here: true })
})

test('a folder with an existing board still starts on, with or without `enabled`', async () => {
  for (const board of [JSON.stringify(emptyBoard()), JSON.stringify((({ enabled: _e, ...rest }) => rest)(emptyBoard()))]) {
    const w = world('a')
    w.files.set(w.board, board)
    await sessionStart(w.host)
    expect(S.fresh).toBe(false)
    expect(S.driving).toBe(true)
    expect(await leadGuideText(w.host)).toBeDefined()
    expect(w.panel.view()).toMatchObject({ on_here: true })
    await sessionEnd(w.host)
  }
})

test('/symcc-init with another window on stays off here, with its heartbeat running', async () => {
  const w = world('b')
  w.files.set(`${ROOT}/.git`, '')
  await sessionStart(w.host)
  w.files.set(w.lead, JSON.stringify({ session: 'a', heartbeat: Date.now() }))
  const r = await runCommand(w.host, 'symcc-init', '')
  expect(r?.text).toContain('already runs in another window')
  expect(S.offHere).toBe(true)
  expect(S.beat !== undefined).toBe(true)
})

test('T-844: /symcc-init in a folder with its own .git makes .symcc there, not in a parent folder that is a git repo', async () => {
  const w = world('a', '/home/me/proj', '/home/me')
  w.files.set('/home/me/proj/.git', '')
  w.files.set('/home/me/.git', '')
  await sessionStart(w.host)
  expect(S.fresh).toBe(true)
  expect(S.root).toBe('/home/me/proj')
  await runCommand(w.host, 'symcc-init', '')
  expect(w.files.has('/home/me/proj/.symcc/board.json')).toBe(true)
  expect([...w.files.keys()].some(k => k.startsWith('/home/me/.symcc'))).toBe(false)
  expect(S.root).toBe('/home/me/proj')
})

test('T-844: /symcc-init in a folder with no .git asks first; "git" sets up git in that folder, even with a parent repo, then the board', async () => {
  const w = world('a', '/home/me/proj', '/home/me')
  w.files.set('/home/me/.git', '')
  await sessionStart(w.host)
  const asked = (await runCommand(w.host, 'symcc-init', ''))?.text ?? ''
  expect(asked).toContain('no git repo of its own')
  expect(asked).toContain('/symcc-init git')
  expect(S.fresh).toBe(true)
  expect([...w.files.keys()].filter(k => k.endsWith('board.json'))).toEqual([])
  expect(w.ran.filter(r => r.args.startsWith('init')).length).toBe(0)
  const r = await runCommand(w.host, 'symcc-init', 'git')
  expect(r?.text).toContain('is on in this project')
  const inits = w.ran.filter(r => r.args.startsWith('init'))
  expect(inits.length).toBe(1)
  expect(inits[0]!.cwd).toBe('/home/me/proj')
  expect(w.ran.some(r => r.args.includes('commit'))).toBe(true)
  expect(w.files.has('/home/me/proj/.symcc/board.json')).toBe(true)
  expect([...w.files.keys()].some(k => k.startsWith('/home/me/.symcc'))).toBe(false)
})

test('T-844: a session in a subfolder of a project finds the project\'s .symcc (the nearest one above)', async () => {
  const w = world('a', '/repo/src/deep', '/repo')
  w.files.set('/repo/.symcc/board.json', JSON.stringify(emptyBoard()))
  await sessionStart(w.host)
  expect(S.fresh).toBe(false)
  expect(S.root).toBe('/repo')
  expect(S.driving).toBe(true)
  // a nearer .symcc wins
  const v = world('a', '/repo/sub', '/repo')
  v.files.set('/repo/.symcc/board.json', JSON.stringify(emptyBoard()))
  v.files.set('/repo/sub/.symcc/board.json', JSON.stringify(emptyBoard()))
  await sessionStart(v.host)
  expect(S.root).toBe('/repo/sub')
})

test('T-844: a folder with no .symcc above it, under a git repo, stays off and writes nothing', async () => {
  const w = world('a', '/home/me/proj', '/home/me')
  w.files.set('/home/me/.git', '')
  await sessionStart(w.host)
  expect(S.fresh).toBe(true)
  expect((await runCommand(w.host, 'symcc-tasks', ''))?.text).toBe(notSetUpAnswer(S.N.name))
  expect([...w.files.keys()].filter(k => k.includes('.symcc'))).toEqual([])
})

test('T-844: /symcc-init where a board exists changes nothing and says so', async () => {
  const w = world('a')
  w.files.set(w.board, JSON.stringify(emptyBoard()))
  await sessionStart(w.host)
  const before = JSON.stringify([...w.files.entries()])
  const r = await runCommand(w.host, 'symcc-init', '')
  expect(r?.text).toBe('symcc is already set up here.')
  expect(JSON.stringify([...w.files.entries()])).toBe(before)
})

test('T-844: /symcc-init in a subfolder of a folder with .symcc makes the subfolder\'s own board; later sessions there use it', async () => {
  const v = world('a', '/repo/src', '/repo')
  v.files.set('/repo/.git', '')
  v.files.set('/repo/src/.git', '')
  v.files.set('/repo/.symcc/board.json', JSON.stringify(emptyBoard()))
  await sessionStart(v.host)
  expect(S.root).toBe('/repo')
  const opened = v.opened.length
  const r = await runCommand(v.host, 'symcc-init', '')
  expect(r?.text).toContain('new')
  expect(r?.text).not.toContain('above this folder')
  expect(v.files.has('/repo/src/.symcc/board.json')).toBe(true)
  expect(S.root).toBe('/repo')
  expect(v.opened.length).toBe(opened)
  const again = world('b', '/repo/src', '/repo')
  for (const [k, val] of v.files) again.files.set(k, val)
  await sessionStart(again.host)
  expect(S.root).toBe('/repo/src')
  expect(S.fresh).toBe(false)
})

test('T-844: /symcc-init opens the panel once, not when it is open already', async () => {
  for (const [isOpen, want] of [[false, 1], [true, 0]] as const) {
    const w = world('a')
    w.files.set(`${ROOT}/.git`, '')
    const host = { ...w.host, ui: { ...w.host.ui, panes: async () => (isOpen ? [{ id: S.N.pane, title: '', isShown: true, isFocused: false, isPlaced: true }] : []) } } as typeof w.host
    await sessionStart(host)
    await runCommand(host, 'symcc-init', '')
    await runCommand(host, 'symcc-init', '')
    expect(w.opened.length).toBe(want)
  }
})

// T-841: /symcc-enable on a project with a board that is off opens the panel; not with open_on_start off, nor twice
test('T-841: /symcc-enable turning symcc back on opens the panel, unless open_on_start is off or it is open already', async () => {
  const cases: [Record<string, unknown>, boolean, number][] = [[{}, false, 1], [{ open_on_start: false }, false, 0], [{}, true, 0]]
  for (const [extra, isOpen, want] of cases) {
    const w = world('a')
    w.files.set(w.board, JSON.stringify({ ...emptyBoard(), enabled: false, ...extra }))
    const host = { ...w.host, ui: { ...w.host.ui, panes: async () => (isOpen ? [{ id: S.N.pane, title: '', isShown: true, isFocused: false, isPlaced: true }] : []) } } as typeof w.host
    await sessionStart(host)
    w.opened.length = 0
    await runCommand(host, 'symcc-enable', '')
    expect(w.opened.length).toBe(want)
  }
})

test('T-844: /symcc-init is parsed: plain, with git, and a usage line for other words', () => {
  expect(parseCommand('symcc-init', '')).toEqual({ kind: 'init' })
  expect(parseCommand('symcc-init', ' git ')).toEqual({ kind: 'init', git: true })
  expect(parseCommand('symcc-init', 'now')!.kind).toBe('bad')
})
