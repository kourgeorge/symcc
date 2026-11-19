// T-475: the texts the owner sees name no host in the shared code (hooks/app/, hooks/core/; tests/host-free.sh greps
// them for "Claude" and "ctrl+x"): they take the host's words (HostWords.assistant, app, backToBoard). With Claude
// Code's words they read as before; a host that leaves the words out gets symcc's own. The version is read through
// the Host (host.plugin.version), and from the plugin's manifest when the host gives none.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost } from './fake-host'
import { SYMCC_WORDS, wordsOf } from '../hooks/host'
import { CLAUDE_WORDS } from '../hooks/claude/host'
import { S, useName, loadVersion } from '../hooks/app/state'
import { COMMANDS } from '../hooks/app/symcc'
import { manual } from '../hooks/app/tools'
import { settingInfo } from '../hooks/board'

const offCommand = () => COMMANDS().find(c => c.name === `${S.N.name}-off`)!.description

test("Claude Code's words keep its texts as they were", () => {
  useName(fakeHost({ words: CLAUDE_WORDS }).host)
  expect(S.W.assistant).toBe('Claude')
  expect(S.W.app).toBe('Claude Code')
  expect(S.W.backToBoard).toBe('ctrl+x tab')
  expect(offCommand()).toBe(`Turn ${S.N.name} off for this project: Claude works as normal, nothing runs; the board is kept`)
  expect(manual('')).toContain(`turn ${S.N.name} off for this project: Claude works as normal (no lead`)
  expect(settingInfo('enabled')!.meaning).toBe('off: the whole plugin rests and Claude works as normal')
})

test('a host with no such words gets symcc\'s own, which name no host', () => {
  useName(fakeHost({ words: { tool: (_n, t) => t, fileTools: 'read, edit and write', planMode: 'Plan', askPopup: '' } }).host)
  expect(S.W).toMatchObject({ assistant: 'the assistant', app: 'the app', backToBoard: '' })
  expect(offCommand()).toContain('the assistant works as normal')
  expect(settingInfo('enabled')!.meaning).toBe('off: the whole plugin rests and the assistant works as normal')
  for (const text of [offCommand(), manual(''), settingInfo('enabled')!.meaning]) {
    expect(text).not.toContain('Claude')
    expect(text).not.toContain('ctrl+x')
  }
})

test('wordsOf fills in only the words a host leaves out', () => {
  expect(wordsOf(CLAUDE_WORDS)).toEqual(CLAUDE_WORDS)
  expect(wordsOf({ ...CLAUDE_WORDS, app: undefined }).app).toBe(SYMCC_WORDS.app)
})

test('the version comes from host.plugin.version when the host gives one', async () => {
  const reads: string[] = []
  const { host } = fakeHost({ plugin: { version: async () => '1.2.3' }, fs: { read: async p => (reads.push(p), '{"version":"9.9.9"}') } })
  await loadVersion(host)
  expect(S.version).toBe('1.2.3')
  expect(reads).toEqual([])
})

test('a version that rejects leaves none, and never throws', async () => {
  await loadVersion(fakeHost({ plugin: { version: async () => Promise.reject(new Error('no')) } }).host)
  expect(S.version).toBe('')
})
