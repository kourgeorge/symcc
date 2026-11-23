// T-922: symcc from Slack through DAM. In a DAM session (DAM sets PLATFORM_HARNESS=claude-code) every board update
// that wants a reply, a "needs you" too, carries a short core of the lead's guide and ends with the line telling the
// lead to post its reply to Slack; in any other session it doesn't. A window that doesn't drive says how to drive.
import { expect } from 'claude-code/testing'
import { emptyBoard } from '../hooks/board'
import { S } from '../hooks/app/state'
import { leadGuideText, sessionStart } from '../hooks/app/symcc'
import { saveBoard } from '../hooks/app/store'
import { tellLead, takeBoardUpdate, START_LINE_END } from '../hooks/app/tell'
import { workerQuestionText } from '../hooks/app/workers'
import { damOwnerPrompt, isDamSession } from '../hooks/app/dam'
import { DAM_ENV, DAM_POST_LINE, damGuideCore, notDrivingText } from '../hooks/core/dam'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'

function world(env: Record<string, string>) {
  const files = new Map<string, string>()
  const w = fakeHost({
    fs: memoryFs(files),
    env: async name => env[name],
    session: { id: async () => 'a', repo: async () => ({ root: ROOT }), root: async () => ROOT },
    run: async argv => {
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
      if (cmd === 'rm') for (const a of args) files.delete(a)
      return done()
    },
  })
  return { ...w, files }
}

/** Starts a session in a project with a board, with `env`; answers the board update for a merge and for a worker's question. */
async function updates(env: Record<string, string>, sdkPrompt = false) {
  S.root = ROOT
  const w = world(env)
  await saveBoard(w.host, emptyBoard())
  await sessionStart(w.host)
  if (sdkPrompt) damOwnerPrompt()
  tellLead(w.host, 'T-5 "Fix login" merged.')
  const merged = w.toLead.shift() ?? takeBoardUpdate() ?? ''
  tellLead(w.host, workerQuestionText('T-6', 'Which color?', ['red', 'blue']), { urgent: true })
  const needs = w.toLead.shift() ?? takeBoardUpdate() ?? ''
  tellLead(w.host, `Starting T-7.${START_LINE_END}`)
  const start = w.toLead.shift() ?? takeBoardUpdate() ?? ''
  return { w, merged, needs, start }
}

const CHAT_EXE = '/usr/local/bin/harness-claude'
const twoEnv = (h: string | undefined, exe: string | undefined) => ({ env: async (n: string) => (n === 'PLATFORM_HARNESS' ? h : n === 'CLAUDE_CODE_EXECUTABLE' ? exe : undefined) })

test("T-929: the DAM check needs PLATFORM_HARNESS and DAM's chat program (harness-claude)", async () => {
  expect(DAM_ENV).toBe('PLATFORM_HARNESS')
  expect(await isDamSession(twoEnv('claude-code', CHAT_EXE))).toBe(true)
  // PLATFORM_HARNESS alone is a DAM terminal window or shell, not Slack
  expect(await isDamSession(twoEnv('claude-code', undefined))).toBe(false)
  expect(await isDamSession(twoEnv('claude-code', '/usr/local/bin/claude'))).toBe(false)
  expect(await isDamSession(twoEnv(undefined, CHAT_EXE))).toBe(false)
  expect(await isDamSession(twoEnv('something-else', CHAT_EXE))).toBe(false)
  expect(await isDamSession({ env: async () => Promise.reject(new Error('no env')) })).toBe(false)
})

test('T-922: in a DAM Slack session (harness-claude), a board update and a "needs you" carry the guide core and end with the post-to-Slack line', async () => {
  const { w, merged, needs, start } = await updates({ PLATFORM_HARNESS: 'claude-code', CLAUDE_CODE_EXECUTABLE: CHAT_EXE })
  expect(S.dam).toBe(true)
  for (const u of [merged, needs]) {
    expect(u.startsWith('[symcc] Board update:')).toBe(true)
    expect(u.endsWith(DAM_POST_LINE)).toBe(true)
    expect(u).toContain(damGuideCore('symcc'))
    expect(u).toContain('Reply shape: news first')
  }
  expect(needs).toContain('Which color?')
  // an update that only says an agent starts asks for no reply, so nothing to post
  expect(start).toContain('No reply needed')
  expect(start.includes(DAM_POST_LINE)).toBe(false)
  // the guide keeps it short
  expect(damGuideCore('symcc').length).toBeLessThan(1200)
  // the lead's guide (when prompt.compose runs) says it too
  expect((await leadGuideText(w.host))?.endsWith(DAM_POST_LINE)).toBe(true)
})

const quiet: [string, Record<string, string>, boolean][] = [
  ['without the DAM env', {}, false],
  ['without the DAM env, even after an sdk prompt', {}, true],
  ['T-929: with PLATFORM_HARNESS alone (a DAM terminal window)', { PLATFORM_HARNESS: 'claude-code' }, false],
]
for (const [name, env, sdk] of quiet) {
  test(`T-922: ${name}, board updates have no Slack line and no guide core`, async () => {
    const { w, merged, needs } = await updates(env, sdk)
    expect(S.dam).toBe(false)
    for (const u of [merged, needs]) {
      expect(u.startsWith('[symcc] Board update:')).toBe(true)
      expect(u.includes('Slack')).toBe(false)
      expect(u.includes(damGuideCore('symcc'))).toBe(false)
    }
    expect((await leadGuideText(w.host))?.includes('Slack')).toBe(false)
  })
}

test('T-929: with PLATFORM_HARNESS, an sdk-origin owner prompt turns the Slack line on from then on', async () => {
  S.root = ROOT
  const w = world({ PLATFORM_HARNESS: 'claude-code' })
  await saveBoard(w.host, emptyBoard())
  await sessionStart(w.host)
  tellLead(w.host, 'T-5 "Fix login" merged.')
  const before = w.toLead.shift() ?? takeBoardUpdate() ?? ''
  expect(before.includes(DAM_POST_LINE)).toBe(false)
  damOwnerPrompt()
  expect(S.dam).toBe(true)
  tellLead(w.host, 'T-6 "Fix logout" merged.')
  const after = w.toLead.shift() ?? takeBoardUpdate() ?? ''
  expect(after.endsWith(DAM_POST_LINE)).toBe(true)
  expect(after).toContain(damGuideCore('symcc'))
  expect((await leadGuideText(w.host))?.endsWith(DAM_POST_LINE)).toBe(true)
})

test("T-922: a window with symcc on that doesn't drive says /symcc-drive makes it drive; a driving one doesn't", async () => {
  S.root = ROOT
  const w = world({})
  await saveBoard(w.host, emptyBoard())
  await sessionStart(w.host)
  expect(S.driving).toBe(true)
  expect(await leadGuideText(w.host)).not.toContain(notDrivingText('symcc'))
  S.driving = false
  expect(notDrivingText('symcc')).toBe("this window doesn't drive the board; /symcc-drive makes it drive")
  expect(await leadGuideText(w.host)).toContain(notDrivingText('symcc'))
})
