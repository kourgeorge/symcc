// T-795, T-844, T-860: a folder with no .symcc in it (never one above) stays off until the owner runs /symcc-init (like git init). Off means
// plain Claude: no lead prompt, no board updates, tools refuse, the band says so, and nothing is written. A project
// that already has a board still starts on (with or without `enabled`).
import { expect } from 'claude-code/testing'
import { gitNotice, gitInstallStep, emptyBoard, parseCommand, notSetUpAnswer, offStatusLine, offStatusParts, parseLead, type Board } from '../hooks/board'
import { S, toolName } from '../hooks/app/state'
import { COMMANDS, watchdogTick, leadBeat, leadGuideText, ownerTyped, sessionStart, sessionEnd, toolCall, runCommand } from '../hooks/app/symcc'
import { tellLead, takeBoardUpdate, noteForLead, meanwhileForPrompt } from '../hooks/app/tell'
import { setupGit, gitReady } from '../hooks/app/git'
import { MANUAL } from '../hooks/app/tools'
import { openPane } from '../hooks/app/open'
import { change, load } from '../hooks/app/store'
import { addTask } from '../hooks/board'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'

function world(id: string, root = ROOT, repoRoot = root, machine: { uname?: string; noGit?: boolean; macStub?: boolean; noBrew?: boolean; repo?: { on: boolean }; nested?: string[]; noCommit?: boolean } = {}) {
  const files = new Map<string, string>()
  const opened: string[] = []
  const ran: { args: string; cwd?: string }[] = []
  const gits = { n: 0 } // every git run, a missing git's too (T-887)
  const w = fakeHost({
    fs: { ...memoryFs(files), list: async (p: string) => (p === root ? (machine.nested ?? []).map(name => ({ name, kind: 'dir' as const })) : []) } as never,
    session: { id: async () => id, repo: async () => ({ root: repoRoot }), root: async () => root },
    run: async (argv, init) => {
      const [cmd, ...rest] = argv
      if (cmd === 'git') gits.n++
      if (cmd === 'uname') return machine.uname ? done({ stdout: machine.uname + '\n' }) : done({ exitCode: 127 })
      if (cmd === 'sh' && machine.uname) return done({ exitCode: (machine.noBrew ? ['apt-get'] : ['brew', 'apt-get']).includes(rest[rest.length - 1]!) ? 0 : 1 })
      if (cmd === 'git' && machine.noGit) return done({ exitCode: 127, stderr: 'git: command not found' })
      if (cmd === 'git' && machine.macStub) return done({ exitCode: 1, stderr: 'xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun\n' })
      if (cmd === 'git' && machine.noCommit && rest[0] === 'rev-parse' && rest.includes('--verify')) return done({ exitCode: 1 })
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
  return { ...w, files, opened, ran, gits, lead: `${root}/${S.N.leadFile}`, board: `${root}/${S.N.boardFile}` }
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

test('T-844: a window that started with no board looks again: /symcc-enable turns it on as a second lead; /symcc-init says already set up here, and when another window drives it adds the /symcc-enable hint (window stays off)', async () => {
  for (const cmd of ['symcc-enable', 'symcc-init'] as const) {
    const w = world('b')
    w.files.set(`${ROOT}/.git`, '')
    await sessionStart(w.host)
    expect(S.fresh).toBe(true)
    // another window made the board and drives it
    w.files.set(w.board, JSON.stringify(emptyBoard()))
    w.files.set(w.lead, JSON.stringify({ session: 'a', heartbeat: Date.now() }))
    const r = await runCommand(w.host, cmd, '')
    expect(r?.text).toContain(cmd === 'symcc-enable' ? 'already enabled' : 'already set up here')
    if (cmd === 'symcc-init') expect(r?.text).not.toContain('/symcc-enable')
    expect(S.fresh).toBe(false)
    // T-1041: another window drives, so this one follows: on, a lead, not off here
    expect(S.offHere).toBe(false)
    expect(await leadGuideText(w.host)).toBeDefined()
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

test('/symcc-init with another window on follows it, with its heartbeat running', async () => {
  const w = world('b')
  w.files.set(`${ROOT}/.git`, '')
  await sessionStart(w.host)
  w.files.set(w.lead, JSON.stringify({ session: 'a', heartbeat: Date.now() }))
  const r = await runCommand(w.host, 'symcc-init', '')
  expect(r?.text).toContain('is on in this project')
  expect(S.offHere).toBe(false)
  expect(S.driving).toBe(false)
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
    const told = w.toLead.join('\n') + (takeBoardUpdate() ?? '')
    expect(told).toContain(step)
    // T-887: symcc no longer looks again by itself while git is missing, so the lead must tell the owner how to make it look
    expect(told.includes('on its own')).toBe(false)
    expect(told).toContain('Check again (g)')
    expect(told).toContain('/symcc-settings git check')
  }
  expect(gitInstallStep({ os: 'mac' })).toBe('xcode-select --install')
  expect(gitInstallStep({ os: 'windows' })).toBe('winget install --id Git.Git')
  expect(gitInstallStep({ os: 'linux', linux: 'dnf' })).toBe('sudo dnf install git')
  expect(gitInstallStep({ os: 'linux', linux: 'pacman' })).toBe('sudo pacman -S git')
})

test('T-861: on a Mac without the command-line tools, the /usr/bin/git stub (exit 1, xcrun message) counts as git not installed, with the xcode-select step', async () => {
  const w = world('a', '/home/me/proj', '/home/me', { uname: 'Darwin', macStub: true, noBrew: true })
  S.gitState = 'ok'
  S.toldGit = 'ok'
  S.gitInstall = ''
  await sessionStart(w.host)
  await runCommand(w.host, 'symcc-init', '')
  expect(w.files.has('/home/me/proj/.symcc/board.json')).toBe(true)
  expect(S.gitState).toBe('no-git')
  const view = w.panel.view() as unknown as { git_state: string; git_install: string }
  expect(view.git_state).toBe('no-git')
  expect(view.git_install).toBe('xcode-select --install')
  expect(w.toLead.join('\n') + (takeBoardUpdate() ?? '')).toContain('xcode-select --install')
})

test('T-861, T-887: git missing is looked at again only on Check again, never by the regular check or a panel open (the Mac stand-in opens an install pop-up); no repo here is looked at by the regular check', async () => {
  const machine: { uname?: string; macStub?: boolean; repo?: { on: boolean } } = { uname: 'Darwin', macStub: true }
  const w = world('a', '/home/me/proj', '/home/me', machine)
  await sessionStart(w.host)
  await runCommand(w.host, 'symcc-init', '')
  expect(S.gitState).toBe('no-git')
  const wait = async () => { for (let i = 0; i < 300; i++) await Promise.resolve() }
  // git installed by hand: while the state is no-git, the regular check and a panel open run no git at all
  machine.macStub = false
  let before = w.gits.n
  watchdogTick(w.host)
  await wait()
  await openPane(w.host)
  await wait()
  expect(w.gits.n - before).toBe(0)
  expect(S.gitState).toBe('no-git')
  // Check again does look
  expect((await runCommand(w.host, 'symcc-settings', 'git check'))?.text).toContain('No git repo here')
  expect(w.gits.n > before).toBe(true)
  expect(S.gitState).toBe('no-repo')
  expect(w.panel.view()).toMatchObject({ git_state: 'no-repo' })
  // git init and a first commit by hand: the next regular check (git is there, so no pop-up) clears it
  machine.repo = { on: true }
  before = w.gits.n
  watchdogTick(w.host)
  await wait()
  expect(w.gits.n > before).toBe(true)
  expect(S.gitState).toBe('ok')
  expect(w.panel.view()).toMatchObject({ git_state: 'ok' })
})

test('T-887: with a task ready to start and git missing, the lead heartbeat and the regular check run no git (pump skips git while it is missing)', async () => {
  const machine: { uname?: string; macStub?: boolean } = { uname: 'Darwin', macStub: true }
  const w = world('a', '/home/me/proj', '/home/me', machine)
  await sessionStart(w.host)
  await runCommand(w.host, 'symcc-init', '')
  expect(S.gitState).toBe('no-git')
  await change(w.host, b => addTask(b, { origin: { why: 'a test' }, title: 'Do it', details: 'Do it.\nDone when: done.', files: ['src/'] }, new Date().toISOString()))
  const wait = async () => { for (let i = 0; i < 300; i++) await Promise.resolve() }
  await wait()
  const before = w.gits.n
  watchdogTick(w.host)
  await wait()
  leadBeat(w.host)
  await wait()
  expect(w.gits.n - before).toBe(0)
  expect(S.gitState).toBe('no-git')
  expect((await load(w.host)).tasks.filter(t => t.status === 'todo').length).toBe(1)
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
  const r = await runCommand(w.host, 'symcc-init', '')
  expect(r?.text).toContain('already set up here')
  expect(r?.text).not.toContain('another window')
  expect(r?.text).toContain('/symcc-enable turns it back on')
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

test('T-861: the /symcc-init description and help say plain init makes the board and shows the no-git notice (it no longer asks first)', () => {
  const init = COMMANDS().find(c => c.name === `${S.N.name}-init`)!.description
  expect(init.includes('asks first')).toBe(false)
  expect(init.includes('No git repo here')).toBe(true)
  const help = Object.values(MANUAL()).join('\n')
  expect(help.includes('asked about first')).toBe(false)
  expect(help.includes('asks first, then')).toBe(false)
  expect(help.includes('No git repo here')).toBe(true)
})

/** T-968: a new project with no git repo, the lead already told so, and one task ready to start. */
async function noRepoWithTask() {
  const machine: { uname?: string; repo?: { on: boolean } } = { uname: 'Darwin' }
  const w = world('a', '/home/me/proj', '/home/me', machine)
  w.files.set('/home/me/.git', '')
  await sessionStart(w.host)
  await runCommand(w.host, 'symcc-init', '')
  expect(S.gitState).toBe('no-repo')
  await change(w.host, b => addTask(b, { origin: { why: 'a test' }, title: 'Do it', details: 'Do it.\nDone when: done.', files: ['src/'] }, new Date().toISOString()))
  const wait = async () => { for (let i = 0; i < 300; i++) await Promise.resolve() }
  await wait()
  // the lead heard "no git repo" (and asks the owner); nothing started
  expect(w.toLead.join('\n') + (takeBoardUpdate() ?? '')).toContain('no git repo')
  w.toLead.splice(0)
  expect((await load(w.host)).tasks.map(t => t.status)).toEqual(['todo'])
  return { w, machine, wait }
}

const GIT_READY_LINE = "Tasks can start now; don't ask the owner about git again."

test('T-968: the owner sets up git from the board: the lead gets one board update at once saying so, and the ready task starts', async () => {
  const { w, wait } = await noRepoWithTask()
  await setupGit(w.host, 'you')
  await wait()
  const update = takeBoardUpdate() ?? ''
  expect(update).toContain('The owner set up git here (branch main')
  expect(update).toContain(GIT_READY_LINE)
  expect(update.split(GIT_READY_LINE).length).toBe(2)
  expect(update).not.toContain('Meanwhile (')
  expect(takeBoardUpdate()).toBeUndefined()
  expect((await load(w.host)).tasks.map(t => t.status)).toEqual(['doing'])
})

test("T-968: the lead's own setup_git sends no extra board update (its tool answer says it)", async () => {
  const { w, wait } = await noRepoWithTask()
  const said = await toolCall(w.host, toolName('setup_git'), undefined, {})
  expect(JSON.stringify(said)).toContain('Git is set up')
  await wait()
  expect(takeBoardUpdate() ?? '').not.toContain('git')
  expect((await load(w.host)).tasks.map(t => t.status)).toEqual(['doing'])
})

test('T-968: Check again finds git the owner set up by hand: the lead gets one board update at once saying so, and the ready task starts', async () => {
  const { w, machine, wait } = await noRepoWithTask()
  machine.repo = { on: true }
  expect((await runCommand(w.host, 'symcc-settings', 'git check'))?.text).toContain('git is ready')
  await wait()
  const update = takeBoardUpdate() ?? ''
  expect(update).toContain('Git is ready here now')
  expect(update.split(GIT_READY_LINE).length).toBe(2)
  // a later check tells nothing again
  expect((await runCommand(w.host, 'symcc-settings', 'git check'))?.text).toContain('git is ready')
  expect(takeBoardUpdate() ?? '').not.toContain('Git is ready')
  expect((await load(w.host)).tasks.map(t => t.status)).toEqual(['doing'])
})

test("T-968: a Meanwhile line goes with the owner's next prompt (not the lead's guide) once, and is not repeated in a later board update", async () => {
  const w = world('a')
  w.files.set(w.board, JSON.stringify(emptyBoard()))
  await sessionStart(w.host)
  takeBoardUpdate()
  noteForLead('The owner dropped T-6.')
  ownerTyped('create a task for the search')
  const block = meanwhileForPrompt().text
  expect(block).toContain('Meanwhile (nothing to answer):\n- The owner dropped T-6.')
  // the guide (the system prompt) never carries it, so it stays the same
  expect(await leadGuideText(w.host)).not.toContain('The owner dropped T-6.')
  // the owner's next prompt gets nothing again
  expect(meanwhileForPrompt().text).toBe('')
  // a board update sent later doesn't carry it again
  tellLead(w.host, 'T-2 "x" merged.')
  const update = takeBoardUpdate() ?? ''
  expect(update).toContain('T-2 "x" merged.')
  expect(update).not.toContain('The owner dropped T-6.')
  await sessionEnd(w.host)
})

test('T-968: Meanwhile lines not yet given with a prompt still go at the top of the next board update', async () => {
  const w = world('a')
  w.files.set(w.board, JSON.stringify(emptyBoard()))
  await sessionStart(w.host)
  takeBoardUpdate()
  noteForLead('The owner paused T-3.')
  tellLead(w.host, 'T-2 "x" merged.')
  expect(takeBoardUpdate() ?? '').toContain('- The owner paused T-3.')
  expect(meanwhileForPrompt().text).toBe('')
  await sessionEnd(w.host)
})

test('T-1136: a folder with repos in its project table is ready with no repo of its own; a task with no project is noted; the old several-repos text is gone', async () => {
  const w = world('a', '/home/me/proj', '/home/me', { uname: 'Darwin', nested: ['a', 'b'] })
  w.files.set('/home/me/.git', '')
  w.files.set('/home/me/proj/a/.git', '')
  w.files.set('/home/me/proj/b/.git', '')
  await sessionStart(w.host)
  await runCommand(w.host, 'symcc-init', '')
  await change(w.host, bb => ({ ...bb, projects: { a: { path: '/home/me/proj/a' }, b: { path: '/home/me/proj/b' } } }))
  expect(await gitReady(w.host)).toBe(true)
  expect((w.panel.view() as unknown as { git_state: string }).git_state).toBe('ok')
  await change(w.host, bb => addTask(bb, { origin: { why: 'a test' }, title: 'Loose', details: 'Do it.\nDone when: done.', files: ['src/'] }, new Date().toISOString()))
  expect(await gitReady(w.host)).toBe(true)
  const lv = w.panel.view() as unknown as { git_state: string; branch_note?: string }
  expect(lv.git_state).toBe('ok')
  expect(lv.branch_note ?? '').toContain('has no project')
  expect(lv.branch_note ?? '').not.toContain('several repos yet')
  expect(JSON.stringify(lv)).not.toContain('git_workspace')
})
