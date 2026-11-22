// Which surface the board panel is drawn on, and what changes in VS Code.
// VS Code's chat page (the Claude Code extension) shows each Button as a web button with its label only: letter keys
// and ↑↓ do nothing there, you click (or Tab to a button and press Enter). So on that surface every action is a
// button, button labels carry no key marks ("Cancel (x)" → "Cancel", "[m] auto" → "auto"), and no key hints are printed.
// Every other surface (terminal, desktop, mobile) draws the board exactly as before.
import type { ButtonProps, ElementConstructor, RenderSurface } from 'claude-code'

/** True when the board is drawn in VS Code's side panel. */
export const isVscode = (surface: RenderSurface | string | undefined) => surface === 'vscode'

/** A button label without its key mark: "Cancel (x)" → "Cancel", "[m] approve merge" → "approve merge", "[f] search" → "search". */
export const plainLabel = (label: string): string =>
  label
    .replace(/^\[[a-z0-9]\]:?\s+/i, '')
    .replace(/\s+\([a-z]\)$/, "")
    .trim() || label

/** The line VS Code shows where the terminal shows its key hints. */
export const CLICK_HINT = 'Click a button, or Tab to it and press Enter.'

/** A Button for VS Code: the same Button with the key mark taken off its label (its key stays the old label, so
 *  presses and tests find it by the same name). */
export function vscodeButton(Button: ElementConstructor<ButtonProps>): ElementConstructor<ButtonProps> {
  return props => Button(typeof props.label === 'string' ? { ...props, key: props.key ?? props.label, label: plainLabel(props.label) } : props)
}
