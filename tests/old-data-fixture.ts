// T-804: reading an old-shape file as the doctor's migrate-data step does (core/old-data.ts upgrades the parsed JSON,
// then today's reader cleans it). Loading itself no longer migrates anything.
import { type BoardRead, readBoardValue } from '../hooks/board'
import { upgradeBoard } from '../hooks/core/old-data'

/** board.json's text read through the old-data upgrade. */
export const readOld = (text: string, root = ''): BoardRead => readBoardValue(upgradeBoard(JSON.parse(text), root))

/** Whether the upgrade would still change `board` (an object as it would be saved): false once it is in today's shape. */
export const stillOld = (board: object): boolean => JSON.stringify(upgradeBoard(JSON.parse(JSON.stringify(board)), '')) !== JSON.stringify(board)
