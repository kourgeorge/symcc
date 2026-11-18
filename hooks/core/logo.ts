// The banner logo's little moves (T-292): sway now and then, turn into a shape on an event, sing when all is done.
// Pure: the frames, which move an event plays, and whether one may play. app/logo.ts plays them.
import type { SymccStatus } from '../../types'
import { ICON_ART } from '../name'

/** A move the logo can play. */
export type LogoMove = 'sway' | 'check' | 'robot' | 'note' | 'sing'
/** One frame: LOGO_ROWS rows of LOGO_AREA columns, each character one column. */
export type LogoFrame = string[]

/** How long one frame shows: about 4 a second. */
export const LOGO_FRAME_MS = 250
/** The idle sway plays about this often while the panel is open and nothing else plays. */
export const SWAY_EVERY_MS = 5 * 60_000
/** The art area's width: the 5-column logo with one free column on each side (room for the sway, and the notes). */
export const LOGO_AREA = 7
export const LOGO_ROWS = ICON_ART.length
const COLS = 5

/** The logo at rest: one column of room on the left and on the right. */
export const restFrame = (): LogoFrame => ICON_ART.map(r => ` ${r} `)

/** The shapes the clef turns into, 4 rows x 5 columns like ICON_ART. */
export const LOGO_SHAPES: Record<'check' | 'robot' | 'note', string[]> = {
  check: ['    ┏', '    ┃', '┗┓ ┏┛', ' ┗━┛ '],
  robot: ['┏━━━┓', '┃◉ ◉┃', '┃ ━ ┃', '┗┳━┳┛'],
  note: ['  ┏━┓', '  ┃ ┗', '┏━┫  ', '┗━┛  '],
}

/** The sparks shown on a cell while it changes. */
export const SPARKS = ['·', '∙', '•']

/** The cells (k = row*5 + col) in the order the dissolve changes them: by (k*7) mod 20. */
export const DISSOLVE_ORDER: number[] = Array.from({ length: LOGO_ROWS * COLS }, (_, k) => k).sort((a, b) => ((a * 7) % 20) - ((b * 7) % 20))
/** How many steps a dissolve takes each way. */
export const DISSOLVE_STEPS = 5
/** How many frames the shape holds (about 1 s). */
export const HOLD_FRAMES = 4

/** A 4x5 drawing put into the art area at left padding `pad` (0-2; 1 is the resting place). */
const place = (rows: string[], pad = 1): LogoFrame => rows.map(r => (' '.repeat(pad) + r).padEnd(LOGO_AREA).slice(0, LOGO_AREA))

/** The sway: the drawing steps one column right, back, one column left, back. */
export function swayFrames(): LogoFrame[] {
  return [0, 1, 1, 0, -1, -1, 0, 0].map(d => place(ICON_ART, 1 + d))
}

/**
 * One dissolve step from `from` to `to` (4x5 drawings): the first `done` cells in DISSOLVE_ORDER show `to`,
 * the next `spark` cells show a spark where the two differ, the rest show `from`.
 */
function blend(from: string[], to: string[], done: number, spark: number): string[] {
  const cells = from.map(r => [...r])
  DISSOLVE_ORDER.forEach((k, rank) => {
    const r = Math.floor(k / COLS), c = k % COLS
    const a = [...from[r]!][c]!, b = [...to[r]!][c]!
    if (rank < done) cells[r]![c] = b
    else if (rank < done + spark && a !== b) cells[r]![c] = SPARKS[rank % SPARKS.length]!
  })
  return cells.map(r => r.join(''))
}

/** The steps of one dissolve from `from` to `to`, ending on `to` itself. */
function dissolve(from: string[], to: string[]): string[][] {
  const per = Math.ceil((LOGO_ROWS * COLS) / DISSOLVE_STEPS)
  return [...Array.from({ length: DISSOLVE_STEPS - 1 }, (_, s) => blend(from, to, s * per, per)), to]
}

/** The transform: the clef dissolves into `shape`, holds about 1 s, and dissolves back to the clef. */
export function transformFrames(shape: keyof typeof LOGO_SHAPES): LogoFrame[] {
  const to = LOGO_SHAPES[shape]
  return [...dissolve(ICON_ART, to), ...Array.from({ length: HOLD_FRAMES - 1 }, () => to), ...dissolve(to, ICON_ART)].map(r => place(r))
}

/** The column the sing's notes float up in: right of the logo, inside the art area. */
export const NOTE_COLUMN = LOGO_AREA - 1

/** Sing: little notes "♪" and "♫" float up in the column right of the logo. */
export function singFrames(): LogoFrame[] {
  // each frame: which row holds which note (bottom row is LOGO_ROWS - 1)
  const notes: [number, string][][] = [[[3, '♪']], [[2, '♪']], [[1, '♪'], [3, '♫']], [[0, '♪'], [2, '♫']], [[1, '♫']], [[0, '♫']]]
  return notes.map(ns =>
    restFrame().map((row, r) => {
      const n = ns.find(([at]) => at === r)
      return n ? row.slice(0, NOTE_COLUMN) + n[1] + row.slice(NOTE_COLUMN + 1) : row
    }),
  )
}

/** Every frame of `move`, played once in order; after the last the logo rests. */
export function moveFrames(move: LogoMove): LogoFrame[] {
  if (move === 'sway') return swayFrames()
  if (move === 'sing') return singFrames()
  return transformFrames(move)
}

/** How long `move` plays. */
export const moveMs = (move: LogoMove) => moveFrames(move).length * LOGO_FRAME_MS

/** What is playing: the move and when it started (ms), or null. */
export type LogoPlay = { move: LogoMove; start: number } | null

/** Is `p` still playing at `nowMs`? */
export const isPlaying = (p: LogoPlay, nowMs: number): p is { move: LogoMove; start: number } => !!p && nowMs >= p.start && nowMs < p.start + moveMs(p.move)

/** The frame to draw at `nowMs`: the playing move's frame, else the logo at rest. */
export function logoFrame(p: LogoPlay, nowMs: number): LogoFrame {
  if (!isPlaying(p, nowMs)) return restFrame()
  return moveFrames(p.move)[Math.floor((nowMs - p.start) / LOGO_FRAME_MS)]!
}

/**
 * Starts `move` at `nowMs`, unless a move still plays: then the new one is dropped (only one plays at a time,
 * and nothing queues up). Returns what plays now.
 */
export const startMove = (p: LogoPlay, move: LogoMove, nowMs: number): LogoPlay => (isPlaying(p, nowMs) ? p : { move, start: nowMs })

/** Is the idle sway due: nothing plays and nothing played (or swayed) for SWAY_EVERY_MS since `lastMs`? */
export const swayDue = (p: LogoPlay, lastMs: number, nowMs: number) => !isPlaying(p, nowMs) && nowMs - lastMs >= SWAY_EVERY_MS

/** The width (in columns) from which the banner shows the logo; the same as BANNER_NARROW in banner.ts. */
export const LOGO_MIN_WIDTH = 50

/** May a move play: the panel is shown and wide enough to show the logo, and the board is not off. */
export function mayMove(o: { enabled?: boolean; mode?: string; width: number; shown: boolean }): boolean {
  return o.shown && o.enabled !== false && o.mode !== 'off' && o.width >= LOGO_MIN_WIDTH
}

/** The statuses that mean "not done yet": while any task has one, the board is not all done. */
const BUSY: SymccStatus[] = ['todo', 'doing', 'review', 'waiting']

/** Is the board all done: it has tasks, and none is to do, doing, in review or waiting? */
export const allDone = (tasks: { status: SymccStatus }[]) => tasks.length > 0 && !tasks.some(t => BUSY.includes(t.status))

/** What pickMove compares: the tasks' ids and statuses, and the scouts' last runs and reports. */
export type LogoFacts = { tasks: { id: string; status: SymccStatus }[]; scouts?: { name: string; last_run?: string | null; last_report?: string }[] }

/**
 * The move an update of the board plays, from what it was (`before`) to what it is now (`after`); null for none.
 * The board becoming all done sings; a task that turned done (merged) shows the check mark; a scout that
 * reported a finding (a new report, not "nothing", see `isNothing`) the note; a task that
 * started (turned doing) the robot. With no `before` (the first look) nothing plays.
 * The note follows `last_report`, not `last_run`: a scout's run start publishes a new `last_run` with the old
 * report still in place, and its finish publishes the new report with `last_run` unchanged. A stopped or failed
 * run keeps the old report, so it plays nothing (and so does a new report with the very same text).
 */
export function pickMove(before: LogoFacts | undefined, after: LogoFacts, isNothing: (report: string | undefined) => boolean): LogoMove | null {
  if (!before) return null
  const was = new Map(before.tasks.map(t => [t.id, t.status]))
  const turned = (st: SymccStatus) => after.tasks.some(t => t.status === st && was.get(t.id) !== st)
  if (allDone(after.tasks) && !allDone(before.tasks)) return 'sing'
  if (turned('done')) return 'check'
  const said = new Map((before.scouts ?? []).map(s => [s.name, s.last_report]))
  if ((after.scouts ?? []).some(s => s.last_report !== undefined && said.has(s.name) && said.get(s.name) !== s.last_report && !isNothing(s.last_report))) return 'note'
  if (turned('doing')) return 'robot'
  return null
}
