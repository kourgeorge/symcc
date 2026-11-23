// T-877: symcc.ts's session start and slash commands moved to session-start.ts and slash-commands.ts; symcc.ts still
// hands out the very same entry points, so the hosts and tests importing '../hooks/app/symcc' keep working.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import * as symcc from '../hooks/app/symcc'
import * as start from '../hooks/app/session-start'
import * as commands from '../hooks/app/slash-commands'

test('symcc.ts re-exports the session start entry points from session-start.ts', () => {
  expect(symcc.sessionStarting).toBe(start.sessionStarting)
  expect(symcc.watchdogTick).toBe(start.watchdogTick)
  expect(symcc.leadBeat).toBe(start.leadBeat)
  expect(symcc.sessionStart).toBe(start.sessionStart)
  expect(symcc.guardStart).toBe(start.guardStart)
  expect(symcc.sessionCleared).toBe(start.sessionCleared)
  expect(symcc.sessionEnd).toBe(start.sessionEnd)
})

test('symcc.ts re-exports the slash commands from slash-commands.ts', () => {
  expect(symcc.runCommand).toBe(commands.runCommand)
  expect(symcc.COMMANDS).toBe(commands.COMMANDS)
  expect(symcc.taskDoTool).toBe(commands.taskDoTool)
  expect(symcc.boardOpened).toBe(commands.boardOpened)
  expect(symcc.noPanelText).toBe(commands.noPanelText)
  expect(symcc.BOARD_OPENED).toBe(commands.BOARD_OPENED)
})
