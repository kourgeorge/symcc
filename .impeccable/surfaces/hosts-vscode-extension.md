---
version: 1
slug: "hosts-vscode-extension"
primary_target: "hosts/vscode/extension"
related_targets: []
---

# symcc board in Cursor

Scope: the symcc panel inside Cursor (a webview editor tab plus a status bar item), operate mode. Visitor: the manager
of a team of coding agents who lives in this panel, talks to the lead, reviews and decides, and rarely codes. Job: see
what needs them, decide it in place, keep an eye on running work, tell the lead what to do next. Constraints: follows
the editor theme (dark, light, high contrast), works from 360px (docked in a side bar) to a full editor area, keyboard
reachable, no network but the engine process.

## Direction contract

THESIS: one stream. The lead's conversation and the board's news are one timeline, and what needs the owner is pinned
above it as decision cards that are decided in place. It refuses the category default of a kanban board with a chat
bolted on in a second window.

OWN-WORLD: the editor's own ground and text (theme variables), a deep navy-to-plum rail carrying the symcc treble-clef
mark, symcc coral only for what needs the owner and the one primary action per card, green merged, amber waiting, red
failed. Standard controls in the editor's UI font; codicons for every icon.

STORY: the owner sees at once how many decisions wait and what each one is, answers or approves without leaving the
card, reads what the lead and the board did since, and types the next request in the box at the bottom.

FIRST VIEWPORT: left rail 56px (mark, Now, Board, Scouts). Header: project name, running / up next / done today counts,
mode switch Off / Review / Auto. Under it the Needs you row: up to three decision cards side by side (heading, meta line,
answer or action buttons; the primary is coral). Below, the stream fills the height, newest at the bottom, with the
composer pinned at the bottom of the centre column (the main action). Right column 300px: Running lanes, then Up next.
Under 760px the rail becomes a top bar and the right column folds into a Running strip above the stream.

FORM: one stream (assigned lead), position 5 on the ordered list, seed:1f8cfd3d33ff5859. Signature move: each running
task's stages (work, check, queue, tests, you, merged) drawn as notes on one thin staff line, done notes green, the
current note coral with a slow breathing ring, and the note sliding to its next station when the task moves.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions

- Where the extension installs (development host link vs a packaged .vsix) is the owner's call.
- The Scouts page shows the engine's scouts list and a Run now button; editing scouts stays with the lead.
