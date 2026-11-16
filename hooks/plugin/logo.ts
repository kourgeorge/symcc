// Plays the banner logo's moves (the frames and the rules are in core/logo.ts). Light on purpose: a move runs a
// LOGO_FRAME_MS timer that redraws the panel only while it plays (about 4 redraws a second, for 2 to 4 seconds);
// the idle sway is looked at on the lead heartbeat (claimLead, every 30 s), so no timer runs while the logo rests.
import { isNothing } from '../board'
import { type LogoFacts, type LogoFrame, type LogoMove, type LogoPlay, LOGO_FRAME_MS, isPlaying, logoFrame, mayMove, pickMove, startMove, swayDue } from '../core/logo'
import { type $, type PaneView, S, readView } from './state'

/** What plays (its `start` counted in frame time, LOGO_FRAME_MS per tick of the timer), and the plugin's memory of the logo. */
export const logo = {
  play: null as LogoPlay,
  /** frame time now: ticks of the frame timer times LOGO_FRAME_MS (the timer, not the wall clock, moves the frames) */
  t: 0,
  /** when (wall clock, ms) the last move started, for the idle sway */
  last: Date.now(),
  /** the board as the last publish saw it, to tell what changed */
  before: undefined as LogoFacts | undefined,
  /** the panel's body width at its last draw (0 before it was drawn) */
  width: 0,
  ticker: null as (() => void) | null,
}

/** The logo frame the banner draws now. */
export const logoNow = (): LogoFrame => logoFrame(logo.play, logo.t)

/** The panel tells its width at every draw (a move plays only when the logo shows). */
export const noteLogoWidth = (width: number) => void (logo.width = width)

/** Is the board panel shown (placed and the pane in front)? */
async function paneShown($: $): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === S.N.pane && p.isShown && p.isPlaced)
  } catch {
    return false
  }
}

/** Plays `move` now, if one may play (see mayMove) and none plays yet; one that comes while another plays is dropped. */
export async function playLogo($: $, move: LogoMove, v: Partial<PaneView>): Promise<boolean> {
  if (isPlaying(logo.play, logo.t)) return false
  if (!mayMove({ logo_motion: v.logo_motion, enabled: v.enabled, mode: v.mode, width: logo.width, shown: await paneShown($) })) return false
  if (isPlaying(logo.play, logo.t)) return false
  logo.play = startMove(logo.play, move, logo.t)
  logo.last = Date.now()
  const stop = () => {
    logo.ticker?.()
    logo.ticker = null
    logo.play = null
  }
  try {
    const timer = $.clock.every(LOGO_FRAME_MS, () => {
      logo.t += LOGO_FRAME_MS
      if (!isPlaying(logo.play, logo.t)) stop()
      $.ui.invalidate('ui.render')
    })
    logo.ticker = () => timer.cancel()
  } catch {
    // no repeating timer here: no move
    stop()
    return false
  }
  $.ui.invalidate('ui.render')
  return true
}

/** After each publish: plays the move for what changed (a merge, a worker start, a scout finding, all done). */
export async function logoOnPublish($: $, v: PaneView): Promise<void> {
  const facts: LogoFacts = { tasks: v.tasks.map(t => ({ id: t.id, status: t.status })), scouts: (v.scouts ?? []).map(s => ({ name: s.name, last_run: s.last_run, last_report: s.last_report })) }
  const move = pickMove(logo.before, facts, isNothing)
  logo.before = facts
  if (move) await playLogo($, move, v)
}

/** On the heartbeat: the idle sway, about every SWAY_EVERY_MS while the panel is open and nothing else played. */
export async function logoIdle($: $): Promise<void> {
  if (isPlaying(logo.play, logo.t) || !swayDue(null, logo.last, Date.now())) return
  await playLogo($, 'sway', await readView($))
}

/** Stops a running move's frame timer and puts the logo's memory back to its start values (what a reload starts with); for the tests' resetPlugin() only. */
export function resetLogo() {
  try {
    logo.ticker?.()
  } catch {
    // already gone
  }
  Object.assign(logo, { play: null, t: 0, last: Date.now(), before: undefined, width: 0, ticker: null })
}
