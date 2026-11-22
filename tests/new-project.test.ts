// T-795, T-844, T-860: a folder with no .symcc in it (never one above) stays off until the owner runs /symcc-init (like git init). Off means
// plain Claude: no lead prompt, no board updates, tools refuse, the band says so, and nothing is written. A project
// that already has a board still starts on (with or without `enabled`).
import { expect } from 'claude-code/testing'
import { gitNotice, gitInstallStep, emptyBoard, parseCommand, notSetUpAnswer, offStatusLine, offStatusParts, parseLead, type Board } from '../hooks/board'
import { S, toolName } from '../hooks/app/state'
import { watchdogTick, leadBeat,leadGuideText, sessionStart, sessionEnd, toolCall, runCommand } from '../hooks/app/symcc'
import { tellLead, takeBoardUpdate } from '../hooks/app/tell'
import { setupGit, gitReady } from '../hooks/app/git'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'

function world(id: string, root = ROOT, repoRoot = root, machine: { uname?: string; noGit?: boolean; repo?: { on: boolean } } = {}) {
  const files = new Map<string, string>()
  const opened: string[] = []
  const ran: { args: string; cwd?: string }[] = []
  const w = fakeHost({
    fs: memoryFs(files),
    session: { id: async () => id, repo: async () => ({ root: repoRoot }), root: async () => root },
    run: async (argv, init) => {
      const [cmd, ...rest] = argv
      if (cmd === 'uname') return machine.uname ? done({ stdout: machine.uname + '\n' }) : done({ exitCode: 127 })
      if (cmd === 'sh' && machine.uname) return done({ exitCode: ['brew', 'apt-get'].includes(rest[rest.length - 1]!) ? 0 : 1 })
      if (cmd === 'git' && machine.noGit) return done({ exitCode: 1, stderr: 'git: command not found' })
      if (cmd === 'git' && machine.repo?.on && rest[0] === 'rev-parse') return done({ stdout: rest.includes('--show-toplevel') ? `${root}\n` : rest.includes('--show-cdup') ? '\n' : rest.includes('HEAD') ? 'abc\n' : 'true\n' })
      if (cmd === 'git' && rest[0] === 'init') machine.repo = { on: true }
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
  expect(notSetUpAnswer('symcc')).toBe('no symcc board in this folder · /symcc-init to create one here')
  expect(w.panel.view()).toMatchObject({ on_here: false, off_here: 'new' })
  expect(offStatusLine('symcc', true, 'new')).toBe('no board here · /symcc-init')
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

test('T-844: a window that started with no board looks again: /symcc-enable here turns it on as a second lead; /symcc-init says already set up here, and when another window drives it adds the /symcc-enable here hint (window stays off)', async () => {
  for (const cmd of ['symcc-enable', 'symcc-init'] as const) {
    const w = world('b')
    w.files.set(`${ROOT}/.git`, '')
    await sessionStart(w.host)
    expect(S.fresh).toBe(true)
    // another window made the board and drives it
    w.files.set(w.board, JSON.stringify(emptyBoard()))
    w.files.set(w.lead, JSON.stringify({ session: 'a', heartbeat: Date.now() }))
    const r = await runCommand(w.host, cmd, cmd === 'symcc-enable' ? 'here' : '')
    expect(r?.text).toContain(cmd === 'symcc-enable' ? 'is on in this window' : 'already set up here')
    if (cmd === 'symcc-init') expect(r?.text).toContain('/symcc-enable here turns it on in this one too')
    expect(S.fresh).toBe(false)
    if (cmd === 'symcc-enable') {
      expect(S.offHere).toBe(false)
      expect(await leadGuideText(w.host)).toBeDefined()
    } else {
      // started the normal way: off here, because another window drives
      expect(S.offHere).toBe(true)
    }
    expect((await runCommand(w.host, 'symcc-enable', ''))?.text).not.toBe(notSetUpAnswer(S.N.name))
  }
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

test('T-861: /symcc-init in a folder with no .git still makes the board (symcc on, lead, panel open), shows the no-git notice, starts no worker; the Set up git action sets up git here, clears the notice and lets work start', async () => {
  const w = world('a', '/home/me/proj', '/home/me', { uname: 'Darwin' })
  w.files.set('/home/me/.git', '')
  await sessionStart(w.host)
  const r = await runCommand(w.host, 'symcc-init', '')
  expect(r?.text).toContain('is on in this project')
  expect(S.fresh).toBe(false)
  expect(w.files.has('/home/me/proj/.symcc/board.json')).toBe(true)
  expect(S.driving).toBe(true)
  expect(w.opened.length).toBe(1)
  expect(w.ran.filter(x => x.args.startsWith('init')).length).toBe(0)
  // the board says so: no repo here, nothing starts
  expect(S.gitState).toBe('no-repo')
  expect(w.panel.view()).toMatchObject({ on_here: true, git_state: 'no-repo', branch_note: expect.stringContaining('no git repo here') })
  expect(gitNotice('no-repo', '', 'symcc')).toContain('No git repo here')
  expect(gitNotice('no-repo', '', 'symcc')).toContain('No worker starts')
  expect(w.toLead.join('\n') + (takeBoardUpdate() ?? '')).toContain('no git repo')
  // the button: git init here, the first commit, the notice goes
  const out = await setupGit(w.host, 'you')
  const inits = w.ran.filter(x => x.args.startsWith('init'))
  expect(inits.length).toBe(1)
  expect(inits[0]!.cwd).toBe('/home/me/proj')
  expect(w.ran.some(x => x.args.includes('commit'))).toBe(true)
  expect(w.files.get('/home/me/proj/.gitignore')).toContain('.symcc/')
  expect(out).toBeTruthy()
  expect(S.gitState).toBe('ok')
  expect(w.panel.view()).toMatchObject({ git_state: 'ok' })
  expect(await gitReady(w.host)).toBe(true)
})

test('T-861: with git missing the board says git is not installed and gives the install step for the machine', async () => {
  const cases: [string, string][] = [['Darwin', 'brew install git'], ['Linux', 'sudo apt install git']]
  for (const [uname, step] of cases) {
    const w = world('a', '/home/me/proj', '/home/me', { uname, noGit: true })
    // a new machine each round: the session's git facts start over
    S.gitState = 'ok'
    S.toldGit = 'ok'
    S.gitInstall = ''
    await sessionStart(w.host)
    await runCommand(w.host, 'symcc-init', '')
    expect(w.files.has('/home/me/proj/.symcc/board.json')).toBe(true)
    expect(S.gitState).toBe('no-git')
    const view = w.panel.view() as unknown as { git_state: string; git_install: string; branch_note: string }
    expect(view.git_state).toBe('no-git')
    expect(view.git_install).toBe(step)
    expect(view.branch_note).toContain('git is not installed')
    expect(gitNotice('no-git', view.git_install, 'symcc')).toBe(`Git is not installed: ${step}. No worker starts until it is.`)
    expect(w.toLead.join('\n') + (takeBoardUpdate() ?? '')).toContain(step)
  }
  expect(gitInstallStep({ os: 'mac' })).toBe('xcode-select --install')
  expect(gitInstallStep({ os: 'windows' })).toBe('winget install --id Git.Git')
  expect(gitInstallStep({ os: 'linux', linux: 'dnf' })).toBe('sudo dnf install git')
  expect(gitInstallStep({ os: 'linux', linux: 'pacman' })).toBe('sudo pacman -S git')
})

test('T-861: with no tasks, the regular check sees git come back: not installed, then no repo here, then clear; Check again does the same', async () => {
  const machine: { uname?: string; noGit?: boolean; repo?: { on: boolean } } = { uname: 'Darwin', noGit: true }
  const w = world('a', '/home/me/proj', '/home/me', machine)
  await sessionStart(w.host)
  await runCommand(w.host, 'symcc-init', '')
  expect(S.gitState).toBe('no-git')
  const wait = async () => { for (let i = 0; i < 300; i++) await Promise.resolve() }
  // git installed by hand: the next regular check moves the notice on
  machine.noGit = false
  watchdogTick(w.host)
  await wait()
  expect(S.gitState).toBe('no-repo')
  expect(w.panel.view()).toMatchObject({ git_state: 'no-repo' })
  // git init and a first commit by hand: the next check clears it
  machine.repo = { on: true }
  watchdogTick(w.host)
  await wait()
  expect(S.gitState).toBe('ok')
  expect(w.panel.view()).toMatchObject({ git_state: 'ok' })
  // the Check again command
  machine.repo = undefined
  expect((await runCommand(w.host, 'symcc-settings', 'git check'))?.text).toContain('No git repo here')
  expect(S.gitState).toBe('no-repo')
})

test('T-844, T-861: /symcc-init git sets up git in that folder first, even with a parent repo, then the board', async () => {
  const w = world('a', '/home/me/proj', '/home/me')
  w.files.set('/home/me/.git', '')
  await sessionStart(w.host)
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

test('T-860: a session started in a subfolder of a project gets only the hint: no board, band, panel, lead guide or writes; one in the folder with .symcc runs as usual', async () => {
  const w = world('a', '/repo/src/deep', '/repo')
  w.files.set('/repo/.symcc/board.json', JSON.stringify(emptyBoard()))
  const before = JSON.stringify([...w.files.entries()])
  await sessionStart(w.host)
  expect(S.fresh).toBe(true)
  expect(S.root).toBe('/repo/src/deep')
  expect(S.driving).toBe(false)
  expect(await leadGuideText(w.host)).toBeUndefined()
  expect(w.opened).toEqual([])
  expect(w.panel.view()).toMatchObject({ on_here: false, off_here: 'new' })
  expect(JSON.stringify([...w.files.entries()])).toBe(before)
  // every command but /symcc-init and help points to /symcc-init
  expect((await runCommand(w.host, 'symcc-tasks', ''))?.text).toBe('no symcc board in this folder · /symcc-init to create one here')
  expect((await runCommand(w.host, 'symcc-mode', 'review'))?.text).toBe(notSetUpAnswer(S.N.name))
  expect(JSON.stringify([...w.files.entries()])).toBe(before)
  // the folder with the .symcc runs as usual
  const v = world('a', '/repo', '/repo')
  v.files.set('/repo/.symcc/board.json', JSON.stringify(emptyBoard()))
  await sessionStart(v.host)
  expect(S.fresh).toBe(false)
  expect(S.root).toBe('/repo')
  expect(S.driving).toBe(true)
})

test('T-844: a folder with no .symcc above it, under a git repo, stays off and writes nothing', async () => {
  const w = world('a', '/home/me/proj', '/home/me')
  w.files.set('/home/me/.git', '')
  await sessionStart(w.host)
  expect(S.fresh).toBe(true)
  expect((await runCommand(w.host, 'symcc-tasks', ''))?.text).toBe(notSetUpAnswer(S.N.name))
  expect([...w.files.keys()].filter(k => k.includes('.symcc'))).toEqual([])
})

test('T-858: with no board, /symcc-stats, /symcc-stats html, /symcc-doctor and /symcc-doctor fix point to /symcc-init and write and run nothing', async () => {
  const w = world('a')
  await sessionStart(w.host)
  w.ran.length = 0
  for (const [c, a] of [['symcc-stats', ''], ['symcc-stats', 'html'], ['symcc-doctor', ''], ['symcc-doctor', 'fix']] as const) {
    expect((await runCommand(w.host, c, a))?.text).toBe(notSetUpAnswer(S.N.name))
  }
  expect(w.ran).toEqual([])
  expect([...w.files.keys()]).toEqual([])
})

test('T-860: a subfolder with a bare .symcc folder and no board.json is still a folder with no board', async () => {
  const w = world('a', '/repo/sub', '/repo')
  w.files.set('/repo/.symcc/board.json', JSON.stringify(emptyBoard()))
  w.files.set('/repo/sub/.symcc/stray.txt', '')
  await sessionStart(w.host)
  expect(S.fresh).toBe(true)
  expect(S.root).toBe('/repo/sub')
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

test('T-856: /symcc-init in a window turned off with /symcc-disable here does not claim another window runs symcc', async () => {
  const w = world('a')
  w.files.set(w.board, JSON.stringify(emptyBoard()))
  await sessionStart(w.host)
  await runCommand(w.host, 'symcc-disable', 'here')
  expect(S.offHere).toBe(true)
  expect(S.offWhy).toBe('off')
  const r = await runCommand(w.host, 'symcc-init', '')
  expect(r?.text).toContain('already set up here')
  expect(r?.text).not.toContain('another window')
  expect(r?.text).toContain('/symcc-enable here turns it back on')
})

test('T-860: /symcc-init in a subfolder of a project makes the subfolder\'s own board, with no parent-board message; later sessions there use it', async () => {
  const v = world('a', '/repo/src', '/repo')
  v.files.set('/repo/.git', '')
  v.files.set('/repo/src/.git', '')
  v.files.set('/repo/.symcc/board.json', JSON.stringify(emptyBoard()))
  await sessionStart(v.host)
  expect(S.fresh).toBe(true)
  const r = await runCommand(v.host, 'symcc-init', '')
  expect(r?.text).toContain('is on in this project')
  expect(r?.text).not.toContain('nearest')
  expect(r?.text).not.toContain('start a new session')
  expect(v.files.has('/repo/src/.symcc/board.json')).toBe(true)
  expect(S.root).toBe('/repo/src')
  expect(S.fresh).toBe(false)
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

// T-844: a world whose first `git init` waits (slow) or fails
function slowGit(id: string, root: string, repoRoot: string, mode: { fail?: boolean; gate?: Promise<void> }) {
  const w = world(id, root, repoRoot)
  const run = w.host.run
  const host = {
    ...w.host,
    run: async (argv: string[], init?: { cwd?: string }) => {
      if (argv[0] === 'git' && argv[1] === 'init') {
        await mode.gate
        if (mode.fail) return done({ exitCode: 1, stderr: 'disk full' })
      }
      return (run as (a: string[], i?: unknown) => ReturnType<typeof run>)(argv, init)
    },
  } as typeof w.host
  return { ...w, host }
}

test('T-844: a failing git init creates nothing; /symcc-init git again retries', async () => {
  const mode = { fail: true } as { fail?: boolean }
  const w = slowGit('a', '/home/me/proj', '/home/me', mode)
  await sessionStart(w.host)
  const r = await runCommand(w.host, 'symcc-init', 'git')
  expect(r?.text).toContain('disk full')
  expect([...w.files.keys()].filter(k => k.includes('.symcc'))).toEqual([])
  expect(S.fresh).toBe(true)
  mode.fail = false
  const again = await runCommand(w.host, 'symcc-init', 'git')
  expect(again?.text).toContain('is on in this project')
  expect(w.files.has('/home/me/proj/.symcc/board.json')).toBe(true)
})

test('T-844: a git step that fails after git init leaves no .git or .gitignore; the retry runs git again', async () => {
  const w = world('a', '/home/me/proj', '/home/me')
  const run = w.host.run
  let failAdd = true
  const host = {
    ...w.host,
    run: async (argv: string[], init?: { cwd?: string }) => {
      if (argv[0] === 'git' && argv[1] === 'init') w.files.set('/home/me/proj/.git', '')
      if (argv[0] === 'rm' && argv.includes('/home/me/proj/.git')) w.files.delete('/home/me/proj/.git')
      if (argv[0] === 'git' && argv[1] === 'add' && failAdd) return done({ exitCode: 1, stderr: 'Permission denied' })
      return (run as (a: string[], i?: unknown) => ReturnType<typeof run>)(argv, init)
    },
  } as typeof w.host
  await sessionStart(host)
  const r = await runCommand(host, 'symcc-init', 'git')
  expect(r?.text).toContain('Permission denied')
  expect(w.files.has('/home/me/proj/.git')).toBe(false)
  expect(w.files.has('/home/me/proj/.gitignore')).toBe(false)
  expect([...w.files.keys()].filter(k => k.includes('.symcc'))).toEqual([])
  failAdd = false
  const again = await runCommand(host, 'symcc-init', 'git')
  expect(again?.text).toContain('is on in this project')
  expect(w.ran.filter(x => x.args.startsWith('init')).length).toBe(2)
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
