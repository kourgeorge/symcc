// T-245: symcc's entry points (hooks/app/symcc.ts) take a Host and plain values, not Claude Code's events, so an
// OpenCode plugin or a standalone app can call them the way register.tsx does for Claude Code. These call them
// with a Host written by hand (no `$`), and check that register.tsx still exports what it did.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { CLAUDE_WORDS } from '../hooks/claude/host'
import { fakeHost } from './fake-host'
import { commandNames } from '../hooks/board'
import { S, heard, stopped, toolName, useName } from '../hooks/app/state'
import * as app from '../hooks/app/symcc'
import * as wiring from '../hooks/register'

/** The shared fake Host with no files and no screen: enough for the entry points that answer before touching the project. */
function bareHost() {
  return fakeHost({
    session: { id: async () => 's1', root: async () => '/p' },
    agents: { spawn: async () => ({}) },
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  }).host
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
  expect(app.isSymccTool(toolName('board'))).toBe(true)
  // symcc's own words: its tools are called by their plain names
  expect(app.isSymccTool('board')).toBe(true)
  expect(app.isSymccTool('ask_owner')).toBe(true)
})

test("a host's words name symcc's tools: Claude Code's are mcp__<name>__<tool>, and only those count as symcc's there", () => {
  useName(fakeHost({ words: CLAUDE_WORDS }).host)
  expect(toolName('board')).toBe('mcp__symcc__board')
  expect(app.isSymccTool('mcp__symcc__board')).toBe(true)
  expect(app.isSymccTool('mcp__symcc__ask_owner')).toBe(true)
  expect(app.isSymccTool('board')).toBe(false)
})

test('toolCallFailed: the lead\'s own call goes on, its call of a symcc tool gets the error', () => {
  const host = bareHost()
  expect(app.toolCallFailed(host, 'Read', undefined, { kind: 'timeout' })).toBe(null)
  const r = app.toolCallFailed(host, toolName('board'), undefined, { kind: 'error', message: 'boom' })
  expect(r && 'result' in r ? r.result : '').toContain(`error: ${S.N.name} couldn't run this tool`)
})
