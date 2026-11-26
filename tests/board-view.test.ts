// T-1102: the lead's board tool takes view "tasks" / "status": the same text as /symcc-tasks and /symcc-status (chat shape
// while S.chat is set). With no view the board text is unchanged, also in chat mode; the guide line is chat mode only.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost, memoryFs } from './fake-host'
import { ALL_FEATURES } from '../hooks/host'
import { S } from '../hooks/app/state'
import { runCommand } from '../hooks/app/symcc'
import { runTool, leadGuide } from '../hooks/app/tools'
import { taskListBoard } from './task-list-fixture'

const ROOT = '/repo'

function world() {
  const files = new Map<string, string>()
  const f = fakeHost({ features: ALL_FEATURES, session: { repo: async () => ({ root: ROOT }), root: async () => ROOT }, fs: memoryFs(files) })
  S.root = ROOT
  files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(taskListBoard(Date.now()), null, 2) + '\n')
  return f.host
}

test('T-1102: board view tasks / status gives the slash commands text, in chat shape with S.chat', async () => {
  const host = world()
  const plainBoard = await runTool(host, 'board', {})
  for (const chat of ['', 'telegram']) {
    S.chat = chat
    try {
      const tasks = (await runCommand(host, `${S.N.name}-tasks`, ''))?.text
      const status = (await runCommand(host, `${S.N.name}-status`, ''))?.text
      expect(await runTool(host, 'board', { view: 'tasks' })).toBe(tasks)
      expect(await runTool(host, 'board', { view: 'status' })).toBe(status)
      expect(tasks!.includes('Say: ')).toBe(!!chat)
      expect(status!.includes('Say: ')).toBe(!!chat)
      // the lead's own board text stays the full one, also in chat mode
      expect(await runTool(host, 'board', {})).toBe(plainBoard)
    } finally {
      S.chat = ''
    }
  }
})

test('T-1102: the lead guide names the board views only in chat mode', () => {
  const line = 'board view status, view tasks, or task T-5'
  expect(leadGuide().includes(line)).toBe(false)
  S.chat = 'telegram'
  try {
    expect(leadGuide().includes(line)).toBe(true)
    expect(leadGuide().includes('"more tasks" ') && leadGuide().includes('page 2')).toBe(true)
  } finally {
    S.chat = ''
  }
})

test('T-1111: in chat mode board task / page equals /symcc-task and "more"; outside chat mode it is unchanged', async () => {
  const host = world()
  const plain = await runTool(host, 'board', { task: 'T-1' })
  S.chat = 'telegram'
  try {
    const slash = (await runCommand(host, `${S.N.name}-task`, 'T-1'))?.text
    expect(await runTool(host, 'board', { task: 'T-1' })).toBe(slash)
    expect(slash).not.toBe(plain)
    expect(slash).toContain('Say: approve')
    expect(await runTool(host, 'board', { task: 'T-1', page: 2 })).toBe((await runCommand(host, `${S.N.name}-task`, 'T-1 more'))?.text)
    expect(await runTool(host, 'board', { task: 'T-1', page: 3 })).toBe((await runCommand(host, `${S.N.name}-task`, 'T-1 page 3'))?.text)
  } finally {
    S.chat = ''
  }
  expect(await runTool(host, 'board', { task: 'T-1' })).toBe(plain)
})
