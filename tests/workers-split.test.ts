// T-603: board mode / stopping moved out of hooks/app/workers.ts into board-mode.ts, and leftover / overtime
// cleanup into cleanup.ts (dropLeadUpdates and waitingOnOld moved too but stay private). Each name lives in one place only, so importers can't pick up a stale copy.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import * as workers from '../hooks/app/workers'
import * as boardMode from '../hooks/app/board-mode'
import * as cleanup from '../hooks/app/cleanup'
import * as approveMod from '../hooks/app/approve'
import * as watch from '../hooks/app/watch'

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
  for (const name of ['pump', 'stopChecks', 'stoppedChecksText', 'onPurpose']) expect(name in workers).toBe(true)
})

// T-755: Approve / Merge now moved into approve.ts, the regular check and reload recovery into watch.ts. Both import
// workers.ts, never the other way, so endInvestigation (Done), fullAnswer and the restartCheckers group stay in workers.ts.
const APPROVE = ['mergeOutcome', 'approve', 'mergeWaiting', 'mergeFinished']
const WATCH = ['check', 'sendBackIdle', 'stoppedHandBack', 'seenEnded', 'ENDED_GRACE_MS', 'retryFileWaits']

test('T-755: approve and merge functions come from approve.ts, the regular check from watch.ts, none from workers.ts', () => {
  for (const name of APPROVE) {
    expect(name in approveMod).toBe(true)
    expect(name in workers).toBe(false)
  }
  for (const name of WATCH) {
    expect(name in watch).toBe(true)
    expect(name in workers).toBe(false)
  }
  for (const name of ['endInvestigation', 'fullAnswer', 'restartCheckers', 'checkAgain', 'mergeAgain', 'settle', 'onPurpose', 'unclaimQueued']) expect(name in workers).toBe(true)
})
