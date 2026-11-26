// T-1098: chat mode. While the owner writes from a chat app (S.chat), board updates that want a reply end with a
// post line, and every owner question is numbered plain text (no pop-up).
import { expect } from 'claude-code/testing'
import { emptyBoard } from '../hooks/board'
import { S } from '../hooks/app/state'
import { leadGuideText, sessionStart } from '../hooks/app/symcc'
import { saveBoard } from '../hooks/app/store'
import { tellLead, takeBoardUpdate } from '../hooks/app/tell'
import { workerQuestionText } from '../hooks/app/workers'
import { chatPostLine, damGuideCore } from '../hooks/core/dam'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'

async function start() {
  S.root = ROOT
  const files = new Map<string, string>()
  const w = fakeHost({
    fs: memoryFs(files),
    env: async () => undefined,
    session: { id: async () => 'a', repo: async () => ({ root: ROOT }), root: async () => ROOT },
    run: async argv => {
      const [cmd, ...rest] = argv
      const args = rest.filter(a => !a.startsWith('-'))
      if (cmd === 'mv' || cmd === 'ln') {
        const [from, to] = args as [string, string]
        if (!files.has(from)) return done({ exitCode: 1, stderr: 'No such file' })
        files.set(to, files.get(from)!)
        if (cmd === 'mv') files.delete(from)
      }
      return done()
    },
  })
  await saveBoard(w.host, emptyBoard())
  await sessionStart(w.host)
  S.W = { ...S.W, askPopup: 'AskUserQuestion' }
  return w
}

test('T-1098: in chat mode a board update ends with the post line naming the server, and questions are numbered text', async () => {
  const w = await start()
  tellLead(w.host, 'T-5 "Fix login" merged.')
  expect((w.toLead.shift() ?? takeBoardUpdate() ?? '').includes('reply tool')).toBe(false)
  expect(workerQuestionText('T-6', 'Which color?', ['red', 'blue'])).toContain('with AskUserQuestion')
  S.chat = 'telegram'
  tellLead(w.host, 'T-7 "Fix logout" merged.', { urgent: true })
  const update = w.toLead.shift() ?? takeBoardUpdate() ?? ''
  expect(update.endsWith(chatPostLine('telegram'))).toBe(true)
  expect(update).toContain("telegram server's reply tool")
  const q = workerQuestionText('T-6', 'Which color?', ['red', 'blue'])
  expect(q).toContain('as numbered plain chat text')
  expect(q).toContain('reply with the number or your own words')
  expect(q).not.toContain('AskUserQuestion')
  const guide = (await leadGuideText(w.host)) ?? ''
  expect(guide.endsWith(chatPostLine('telegram'))).toBe(true)
  expect(guide).toContain('reply with the number or your own words')
  expect(guide).not.toContain('AskUserQuestion')
})

test('T-1100: in chat mode no lead guide, worker question or DAM guide text says "answer on the board"', async () => {
  const w = await start()
  const plain = (await leadGuideText(w.host)) ?? ''
  expect(plain).toContain('or answer on the board')
  expect(workerQuestionText('T-6', 'Which color?')).toContain('answer on the board')
  expect(damGuideCore('symcc')).toContain('reply with the number or your own words')
  S.chat = 'telegram'
  const guide = (await leadGuideText(w.host)) ?? ''
  expect(guide.includes('or answer on the board')).toBe(false)
  expect(guide.includes('they can also answer on the board')).toBe(false)
  expect(/(or|also) answer on the board/.test(workerQuestionText('T-6', 'Which color?'))).toBe(false)
  expect(/(or|also) answer on the board/.test(workerQuestionText('T-6', 'Which color?', ['red', 'blue']))).toBe(false)
  expect(damGuideCore('symcc').includes('answer on the board')).toBe(false)
})

test('T-1103: the board-as-a-picture guide line is only in chat mode', async () => {
  const w = await start()
  expect(((await leadGuideText(w.host)) ?? '').includes('board view html')).toBe(false)
  S.chat = 'telegram'
  expect(((await leadGuideText(w.host)) ?? '').includes('board view html')).toBe(true)
})
