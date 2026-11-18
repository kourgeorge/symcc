// What only Claude Code's board panel needs when it opens: taking the keys back after an Esc. Opening the panel and
// choosing what it shows is host-free, in app/open.ts.
import { type $ } from '../panel'
import { paneArgs } from '../../app/open'

/**
 * Asks for the keyboard back after an Esc the panel kept open. Claude Code always hands the keys to its
 * prompt on Esc (from a text box, a button or a pick list) before the panel hears of it, and a plugin
 * can't stop that; so the panel asks for them again, at once and once more a moment later in case the
 * prompt took them after. Claude Code says no while the prompt holds text: the keys then stay there.
 */
export function takeKeysBack($: $) {
  const ask = () => void $.ui.open(paneArgs(true)).catch(() => undefined)
  ask()
  $.clock.after(50, ask)
}
