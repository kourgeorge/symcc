// symcc's band in GitHub Copilot CLI (T-961): Copilot draws a status line under its prompt from the command in its
// settings (~/.copilot/settings.json: "statusLine": { "type": "command", "command": "bun <plugin>/hooks/copilot/band.ts" }),
// run again and again; this prints symcc's status text for it: the same one line the Claude Code status line shows
// (core's statusLine, or offStatusLine when symcc is turned off in the project), read from the board on disk
// (.symcc/board.json, .symcc/lead.json and the branch in .git/HEAD), with "symcc: " in front as Claude Code puts it.
// Nothing here reads a file itself: band.ts (the command) hands in the file reader, the folder and the clock.
import { parseBoard, parseLead, statusLine, offStatusLine, statusRoom, LEAD_STALE_MS, modeOf } from '../board'
import { joinedText } from '../core/board-parts'
import { driverFacts } from '../core/driver-notice'
import { namesFor, DEFAULT_NAME } from '../name'

/** The files the band reads, as text (null: missing). `head`: .git/HEAD's text, for the branch. */
export type BandFiles = { board: string | null; lead: string | null; head?: string | null }

/** The branch in .git/HEAD's text ("ref: refs/heads/main" is "main"); '' for a detached HEAD or none. */
export function headBranch(head: string | null | undefined): string {
  const m = /^ref:\s*refs\/heads\/(.+)$/m.exec(head ?? '')
  return m?.[1]?.trim() ?? ''
}

export type BandOptions = {
  nowMs: number
  /** symcc's plugin name (default "symcc") */
  name?: string
  /** this window's session id, when known: a fresh lead.json naming another session means this window follows */
  session?: string
  /** room for the text after "<name>: " (default statusRoom) */
  width?: number
}

/**
 * The status text for the board in `f` (without the name in front): undefined for a fresh project (nothing to say,
 * as on Claude Code) or no board file. This window drives unless lead.json names another, fresh session than `o.session`.
 */
export function bandStatusText(f: BandFiles, o: BandOptions): string | undefined {
  if (f.board === null) return undefined
  const name = o.name ?? DEFAULT_NAME
  const width = o.width ?? statusRoom(name)
  const b = parseBoard(f.board)
  const lead = parseLead(f.lead)
  const fresh = !!lead && o.nowMs - lead.heartbeat < LEAD_STALE_MS
  const driving = !fresh || !o.session || lead!.session === o.session
  const driver = driving ? undefined : driverFacts(lead)
  if (b.enabled === false) return offStatusLine(name, false, false, driver, o.nowMs, width)
  const facts = { tasks: b.tasks, questions: b.questions, home_branch: headBranch(f.head), mode: modeOf(b) }
  return statusLine(facts, driving, { nowMs: o.nowMs, width, ...(driver ? { driver } : {}) })
}

/** The line the band prints: "<name>: <text>", or '' when there is nothing to say. */
export function bandLine(f: BandFiles, o: BandOptions): string {
  const text = bandStatusText(f, o)
  return text ? `${o.name ?? DEFAULT_NAME}: ${text}` : ''
}

/** What the band command needs from the program it runs in. */
export type BandDeps = {
  /** the folder Copilot runs the command in (the project, or a folder in it) */
  cwd: string
  /** a file's text, or null when it can't be read */
  readText: (path: string) => string | null
  nowMs: number
  name?: string
  session?: string
}

/** The project's top for `cwd`: the nearest folder up from it with .<name>/board.json; none: null. */
export function projectRoot(d: Pick<BandDeps, 'cwd' | 'readText' | 'name'>): string | null {
  const n = namesFor(d.name ?? DEFAULT_NAME)
  let dir = d.cwd.replace(/\/+$/, '') || '/'
  for (;;) {
    if (d.readText(`${dir === '/' ? '' : dir}/${n.boardFile}`) !== null) return dir
    if (dir === '/' || !dir.includes('/')) return null
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  }
}

/** board.json's text with each done task's stub joined with its parts file (as the store does), so today's merges and cost count. */
function joinedBoard(text: string | null, read: (rel: string) => string | null): string | null {
  return text === null ? null : joinedText(text, read)
}

/** The band's line for the project around `d.cwd` ('' outside a symcc project). */
export function bandOutput(d: BandDeps): string {
  const root = projectRoot(d)
  if (root === null) return ''
  const n = namesFor(d.name ?? DEFAULT_NAME)
  const at = (p: string) => `${root === '/' ? '' : root}/${p}`
  const files: BandFiles = { board: joinedBoard(d.readText(at(n.boardFile)), rel => d.readText(at(`${n.dir}/${rel}`))), lead: d.readText(at(n.leadFile)), head: d.readText(at('.git/HEAD')) }
  return bandLine(files, { nowMs: d.nowMs, ...(d.name ? { name: d.name } : {}), ...(d.session ? { session: d.session } : {}) })
}
