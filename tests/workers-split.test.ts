// T-603: board mode / stopping moved out of hooks/app/workers.ts into board-mode.ts, and leftover / overtime
// cleanup into cleanup.ts (dropLeadUpdates and waitingOnOld moved too but stay private). Each name lives in one place only, so importers can't pick up a stale copy.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import * as workers from '../hooks/app/workers'
import * as boardMode from '../hooks/app/board-mode'
import * as cleanup from '../hooks/app/cleanup'

const BOARD_MODE = ['haltWorkers', 'haltAll', 'stopWorker', 'setBoardMode', 'setSymcc', 'stopForQuit']
const CLEANUP = ['LIVE', 'stopOrphans', 'RELOAD_SETTLE_MS', 'cleanLeftoverTmp', 'timedOut', 'overtimeLeadText', 'askOvertime', 'wrapUp', 'answerOvertime']

test('T-603: board mode and stop functions come from board-mode.ts, cleanup ones from cleanup.ts, none from workers.ts', () => {
  for (const name of BOARD_MODE) {
    expect(name in boardMode).toBe(true)
    expect(name in workers).toBe(false)
  }
  for (const name of CLEANUP) {
    expect(name in cleanup).toBe(true)
    expect(name in workers).toBe(false)
  }
  // the main flow stays in workers.ts
  for (const name of ['pump', 'check', 'stopChecks', 'stoppedChecksText', 'onPurpose']) expect(name in workers).toBe(true)
})
