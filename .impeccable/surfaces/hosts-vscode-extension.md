---
version: 1
slug: "hosts-vscode-extension"
primary_target: "hosts/vscode/extension"
related_targets: []
---

# symcc board in Cursor

Scope: the symcc board inside Cursor or VS Code (a webview editor tab, a sidebar view in the activity bar and a status
bar item), operate mode. Visitor: the manager of a team of coding agents who lives in this panel, talks to the lead,
reviews and decides, and rarely codes. Job: see what needs them, decide it in place, keep an eye on running work, tell
the lead what to do next, and interrupt it or a task when it goes the wrong way. Constraints: follows the editor theme
(dark, light, high contrast), works from 300px (the sidebar) to a full editor area, keyboard reachable, no network but
the engine process.

## Direction contract

THESIS: the board is part of the workbench, not an app inside it. The lead's chat owns the main area the way Cursor's
own chat does, and the work sits beside it as side-bar views. It refuses a branded dashboard with its own palette,
cards and scrollbars.

OWN-WORLD: nothing of its own: the theme's --vscode-* colours only (blue primary buttons, theme badges, list hover and
selection, menu colours, banner and notification colours), the editor's UI font, vscode-elements controls (tabs,
collapsible views, buttons, text fields, badges) and codicons, VS Code's thin scrollbars, 22px list rows.

STORY: the owner sees how many decisions wait and opens one to decide it in place, reads what the lead did with its
thinking and tool runs folded, types the next request (Enter goes into a busy lead's turn, Alt+Enter queues, Esc
stops), and pauses or stops a running task from its row.

FIRST VIEWPORT: panel tabs (Now, Board, Worktrees, Scouts, Memory) with project, branch, counts and the mode dropdown
on their right. Chat in the main column, max 860px, composer pinned at its bottom (the primary action). A right column
of about 300px on the side-bar background: Needs you (first one open), Running, Up next, then folded Just merged,
Backlog and Organizational memory. Under 720px the views stack above the chat.

FORM: seed: none (pinned). The user pinned it whole: "Fully native VS Code: vscode-elements components (open source,
MIT) plus codicons, the theme's own colors only (blue buttons, theme badges, list hover/selection), VS Code
scrollbars, a plain chat like Cursor's own ("Thought 12s", "Ran 3 commands" folded)" and "The chat takes the main
area; Needs you, Running and Up next become compact folding lists on the right, like VS Code's side views".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions

- Where the extension installs (development host link vs a packaged .vsix) is the owner's call.
- The Scouts page shows the engine's scouts list and a Run now button; editing scouts stays with the lead.
