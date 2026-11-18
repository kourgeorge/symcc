// T-245: symcc's entry points (hooks/app/symcc.ts) take a Host and plain values, not Claude Code's events, so an
// OpenCode plugin or a standalone app can call them the way register.tsx does for Claude Code. These call them
// with a Host written by hand (no `$`), and check that register.tsx still exports what it did.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { type Host, noUi } from '../hooks/host'
import { commandNames } from '../hooks/board'
import { S, heard, stopped } from '../hooks/plugin/state'
import * as app from '../hooks/app/symcc'
import * as wiring from '../hooks/register'

/** A Host with no files and no screen: enough for the entry points that answer before touching the project. */
function bareHost(): Host {
  const timer = { cancel: () => undefined }
  return {
    plugin: { name: 'symcc', root: '/plugin' },
    session: { id: async () => 's1', repo: async () => null, root: async () => '/p', usage: async () => ({}) },
    lead: { send: async () => undefined },
    agents: { spawn: async () => ({}), list: async () => [], send: async () => undefined, stop: async () => undefined },
    env: { get: async () => undefined },
    fs: {
      read: async p => {
        throw new Error(`no file ${p}`)
      },
      write: async () => undefined,
      exists: async () => false,
      list: async () => [],
      stat: async p => {
        throw new Error(`no file ${p}`)
      },
    },
    process: { run: async () => ({ exitCode: 1, stdout: '', stderr: '' }) },
    clock: { after: () => timer, every: () => timer, sleep: async () => undefined },
    ui: noUi,
  }
}

test('register.tsx still exports BOARD_OPENED and registerAll, now from app/ and claude/', () => {
  expect(wiring.BOARD_OPENED).toBe(app.BOARD_OPENED)
  expect(typeof wiring.registerAll).toBe('function')
})

test('the slash commands symcc registers are the ones runCommand takes', () => {
  const names = app.COMMANDS().map(c => c.name)
  expect(names).toContain(S.N.name)
  for (const n of names) expect(commandNames(S.N.name).includes(n) || n === `${S.N.name}-stats`).toBe(true)
})

test('runCommand answers null for a command that is not symcc\'s', async () => {
  expect(await app.runCommand(bareHost(), 'compact', '')).toBe(null)
})

test('ownerTyped keeps the trimmed text and skips a blank one', () => {
  app.ownerTyped('   ')
  expect(heard.owner).toBeFalsy()
  app.ownerTyped('  add search  ')
  expect(heard.owner?.text).toBe('add search')
})

test('toolCall refuses a stopped agent, and leaves a tool that is not symcc\'s to the host', async () => {
  const host = bareHost()
  stopped.add('a1')
  expect(await app.toolCall(host, 'Read', 'a1', {})).toEqual({ deny: `${S.N.name} stopped this agent. Do nothing more; answer "stopped" and end.` })
  expect(await app.toolCall(host, 'Read', undefined, {})).toBe(null)
  expect(app.isSymccTool('Read')).toBe(false)
  expect(app.isSymccTool(S.N.tool('board'))).toBe(true)
})

test('toolCallFailed: the lead\'s own call goes on, its call of a symcc tool gets the error', () => {
  const host = bareHost()
  expect(app.toolCallFailed(host, 'Read', undefined, { kind: 'timeout' })).toBe(null)
  const r = app.toolCallFailed(host, S.N.tool('board'), undefined, { kind: 'error', message: 'boom' })
  expect(r && 'result' in r ? r.result : '').toContain(`error: ${S.N.name} couldn't run this tool`)
})
