// The Host type (hooks/host.ts, T-240): the plugin's logic asks for a Host, not for Claude Code's `$`.
// Claude Code's real `$` must fit a Host as it is (checked by the type check, below), and a Host written by hand,
// as another program (an OpenCode plugin, a standalone app) would build one, must be enough to run the logic.
import { expect } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import type { Host, HostRunResult } from '../hooks/host'
import { S } from '../hooks/plugin/state'
import { findRoot, load, saveBoard, takeLock, dropLock } from '../hooks/plugin/store'
import { addTask, emptyBoard } from '../hooks/board'
import { test } from './reset'

// Fails the type check (scripts/typecheck.sh) if Claude Code's `$` stops fitting a Host with no wrapper.
const fromClaude = (claude: EngineInterface): Host => claude

/** A Host over files kept in memory, written out in full with no casts: what a second adapter has to give. */
function memoryHost(root: string) {
  const files = new Map<string, string>()
  const ran: string[] = []
  const done = (r: Partial<HostRunResult> = {}): HostRunResult => ({ exitCode: 0, stdout: '', stderr: '', ...r })
  const timer = { cancel: () => undefined }
  const host: Host = {
    plugin: { name: 'symcc', root: '/plugin' },
    session: {
      id: async () => 'session-1',
      repo: async () => ({ root }),
      root: async () => root,
      usage: async () => ({}),
      send: async () => undefined,
    },
    prompt: { submit: async () => undefined },
    agent: { spawn: async () => ({ agentId: 'agent-1' }), list: async () => [] },
    env: { get: async () => undefined },
    fs: {
      read: async p => {
        const text = files.get(p)
        if (text === undefined) throw new Error(`no file ${p}`)
        return text
      },
      write: async (p, text) => void files.set(p, text),
      exists: async p => files.has(p),
      list: async () => [],
      stat: async p => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return { kind: 'file', size: files.get(p)!.length, mtimeMs: 0, isLink: false }
      },
    },
    process: {
      run: async argv => {
        ran.push(argv[0]!)
        const [cmd, ...rest] = argv
        const args = rest.filter(a => !a.startsWith('-'))
        if (cmd === 'mv' || cmd === 'ln') {
          const [from, to] = args as [string, string]
          if (!files.has(from)) return done({ exitCode: 1, stderr: 'No such file' })
          if (cmd === 'ln' && files.has(to)) return done({ exitCode: 1, stderr: 'File exists' })
          files.set(to, files.get(from)!)
          if (cmd === 'mv') files.delete(from)
          return done()
        }
        if (cmd === 'rm') {
          for (const a of args) files.delete(a)
          return done()
        }
        return done({ exitCode: 127, stderr: `${cmd}: not in this fake` })
      },
    },
    clock: { after: () => timer, every: () => timer, sleep: async () => undefined },
    ui: { toast: () => undefined, status: () => undefined, log: () => undefined, invalidate: () => undefined, open: async () => ({ isPlaced: false }), panes: async () => [] },
  }
  return { host, files, ran }
}

test("Claude Code's $ fits a Host as it is (the type check proves it; nothing to run)", () => {
  expect(typeof fromClaude).toBe('function')
})

test('a Host written by hand runs the board store: find the project, take the lock, save and load the board', async () => {
  const { host, files, ran } = memoryHost('/proj')
  expect(await findRoot(host)).toBe(true)
  expect(S.root).toBe('/proj')

  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Do it', files: ['src/'] }, '2026-11-18T00:00:00Z')
  await saveBoard(host, b)
  expect(files.has(`/proj/${S.N.boardFile}`)).toBe(true)
  expect((await load(host)).tasks.map(t => t.title)).toEqual(['Do it'])

  // the lock is taken with ln (a second take would wait) and let go with rm; no temp file is left behind
  const mine = await takeLock(host)
  expect(files.get(`/proj/${S.N.lockFile}`)).toBe(mine)
  await saveBoard(host, { ...b, max_parallel: 3 })
  await dropLock(host, mine)
  expect((await load(host)).max_parallel).toBe(3)
  expect(ran).toEqual(['mv', 'ln', 'rm', 'mv', 'rm'])
  expect([...files.keys()]).toEqual([`/proj/${S.N.boardFile}`])
  // Not yet: change() also publishes the board to the panel, and that still needs Claude Code's own panel state
  // (state.ts); a Host with no panel gets its own way to show the board in a later step of the plan.
})
