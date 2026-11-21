// hooks/claude/background.ts on its own (T-457): which of an agent's background commands still ran at its SubagentStop.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { noteBackground, stopBackground, stopSeen, takeBackground, useTaskStop } from '../hooks/claude/background'

test("T-457: a command tied to the worker by id still running is its own, even with an id-less one and another agent's running", () => {
  noteBackground('a1', { tool: 'Bash', command: 'lint', run_in_background: true }, { result: { stdout: '' } })
  noteBackground('a1', { tool: 'Bash', command: 'bun test', run_in_background: true }, { result: { backgroundTaskId: 'B1' } })
  stopSeen('a1', [
    { id: 'B1', type: 'shell', command: 'bun test' },
    { id: 'L1', type: 'shell', command: 'tsc' },
  ])
  expect(takeBackground('a1')).toEqual(['bun test'])
})

test("T-457: an id-less command done and another agent's same-text one running is unknown, never claimed by its text", () => {
  noteBackground('a1', { tool: 'Bash', command: 'bun test', run_in_background: true }, { result: { stdout: '' } })
  stopSeen('a1', [{ id: 'L1', type: 'shell', command: 'bun test' }])
  expect(takeBackground('a1')).toBeUndefined()
})

test('T-724: stopBackground stops only the agent\'s own commands still running at its turn\'s end, by their task ids, once', async () => {
  const stopped: string[] = []
  useTaskStop(async id => stopped.push(id))
  noteBackground('a1', { tool: 'Bash', command: 'bun test', run_in_background: true }, { result: { backgroundTaskId: 'B1' } })
  noteBackground('a2', { tool: 'Bash', command: 'tsc', run_in_background: true }, { result: { backgroundTaskId: 'L1' } })
  stopSeen('a1', [
    { id: 'B1', type: 'shell', command: 'bun test' },
    { id: 'L1', type: 'shell', command: 'tsc' },
  ])
  expect(takeBackground('a1')).toEqual(['bun test'])
  expect(await stopBackground('a1')).toBe(1)
  expect(stopped).toEqual(['B1'])
  expect(await stopBackground('a1')).toBe(0)
  expect(stopped).toEqual(['B1'])
})
