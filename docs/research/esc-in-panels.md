# Esc in the board panel

Written for T-154. The owner tried T-150: in the board's search box, Esc moved the keyboard
to the Claude Code prompt line and the search was **not** cleared. So the T-150 path
(`ui.close` → `escBack` → `takeKeysBack`) did not run at all.

## What Claude Code does with Esc in a panel

Taken from the plugin API's own type notes (`.claude-plugin/types/claude-code/index.d.ts`,
Claude Code 2.1.319):

- **Input**: "while it has focus every printable key reaches it alone and Esc returns them"
  (gives the keys back to the prompt). Input has no `onCancel`, `onEscape` or `onKey`.
- **Select**: "Esc always returns to the prompt".
- **Client** (a different element) has `onKey`, but "Escape never arrives: it returns the focus".
- **`closeOnEscape`** (an option of `$.ui.open`): "While the pane holds the keyboard, the key
  that hands it back (Escape) also closes it as the person's close does: `ui.close`, origin
  `person`." Also: "Left out, Escape returns the keys and the pane stays. Each open sets it
  anew, as a title."

So a plugin never sees the Esc key itself. The only sign is a `ui.close` from the person,
and only on a panel that was opened with `closeOnEscape`.

## Why the Esc step never ran

1. **The panel that opens by itself has no `closeOnEscape`.** At the start of a session (and
   when symcc is turned on) the board opens with `focus: false`, and `paneArgs` in
   `hooks/plugin/ui/open.ts` only adds `closeOnEscape` along with `focus`. If you then click
   into that panel or use ctrl+x tab, Esc only gives the keys back: no `ui.close`, so no step
   back. This matches what the owner saw exactly. Only `/symcc`, `/symcc-tasks`, the "open
   board" button and the other commands open it with `closeOnEscape`.
2. **Even with `closeOnEscape`**, the notes say the close comes from "the key that hands it
   back". Whether Esc inside an Input counts as that, or whether the Input hands the keys
   back first and swallows the close, is not said. We could not check it: the test kit
   can't press a real Esc (`ui.close` from the person can't be raised in a test).

What we did not do: always open with `closeOnEscape`. The notes say that also makes "Escape
at an idle, empty prompt" close the panel, so a person pressing Esc at the prompt (for
example a double Esc to go back in the chat) would close the board, or move it a step back,
without having touched it. That seemed worse than the bug.

## What we tried

- T-150: `escBack` in `ui.close` plus `takeKeysBack` (ask for the keyboard again, at once and
  50 ms later). It works only when Claude Code sends the close.
- T-154: nothing in the panel needs Esc any more. Enter on an empty text box cancels it (the
  search: clears it), every pick list and box has a Cancel button, every page a Back button
  (`b`), the search has `[x] clear search`, and the hints say so. T-150's Esc steps are kept
  for when the close does arrive.
- T-154 also writes each `ui.close` of the board to the debug log
  (`symcc board: ui.close from person, went one step back`). To check point 2 in a real
  terminal: run `claude --debug`, open `/symcc`, press `f`, type, press Esc, and look for that
  line in the debug log. No line means Claude Code did not send the close.

## A request we could send to the Claude Code team

> Plugin panels: please let a plugin hear Esc inside its own panel. For example an
> `onCancel` (or `onEscape`) prop on `Input` and `Select`, called when the person presses
> Esc while that element has focus, with the focus kept in the panel when the prop is set.
> Today Esc in an Input always gives the keys to the prompt, and the panel only hears of it
> as a `ui.close` when it was opened with `closeOnEscape`, which also makes Esc at an
> empty prompt close the panel. So a plugin can't offer the usual "Esc clears the search"
> or "Esc cancels this box" without side effects. A pane-wide `onKey` that gets Esc first
> would work too.
