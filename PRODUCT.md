# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The Cursor extension's panel (a VS Code webview, so it also runs in VS Code) is built with React (the owner's choice). The engine it talks to is `hosts/cursor/` (Node, Cursor SDK).

## Users

The primary user of the symcc panel in Cursor mostly manages: they live in the panel, talk to the lead, answer questions and review finished work, and rarely write code themselves. They run several pieces of work at once and come back to the panel to see what changed and what needs them.

## Product Purpose

symcc is a team lead for coding agents. The owner talks to one lead; the lead turns ideas into tasks on a shared board, workers build them in parallel in their own git worktrees, tests run, and finished work merges. The owner is asked only for real decisions. Success: nothing the owner asked for slips, they always know what needs them, and the work keeps moving when they are not pushing it.

## Positioning

A team, not a session: other tools run coding agents one chat at a time with the owner as the manager. symcc gives the agents a lead that plans, a board everyone shares, and workers that build in parallel, with a merge gate (scope check, tests, then merge) in front of the owner's branch.

## Operating Context

- Lives inside Cursor (or VS Code) as an extension panel next to the editor, on the owner's own machine or over Remote-SSH.
- The panel talks to one symcc engine process per project; the board is the plain file `.symcc/board.json`.
- Work flows through statuses: backlog, todo, doing, review, done, plus failed, paused, waiting (on the owner) and dropped.
- Board modes: off (nothing starts), review (finished work waits for the owner's approval), auto (work that passes merges on its own).
- Questions reach the owner from workers (`ask_owner`) and from the lead; answers continue the work.
- Scouts run on timers and only look; their findings become tasks if the lead adds them.

## Capabilities and Constraints

- Lead chat: the lead is a Cursor SDK agent run by symcc; board updates wake it at once; an urgent one goes into its running turn.
- Workers: Cursor SDK agents; the owner or symcc can message a running worker (wrap up), stop it, or give it a follow-up turn.
- Every task records who asked for it and why; each try keeps its report, tokens and commits.
- Cost per run is not reported on the current account (tokens are).
- Terms: task ids look like `T-12`; the parts are the lead, the board, workers, scouts, the checker (optional), org-mem (shared agent notes).
- Undecided: whether the Cursor chat plugin (Cursor's own chat as the lead) ships alongside the panel.

## Brand Commitments

- Name: symcc, written in lower case.
- Existing logo: a treble clef on staff lines (`docs/logo.svg`), with a coral accent (`#d97757` to `#f2a58a`) on dark navy and plum. The existing board UIs (Claude Code panel, OpenCode TUI) use the same words for statuses and actions.
- Voice (from the README and board texts): plain, short, calm English; says what happened and what to do next.

## Evidence on Hand

- README.md, docs/docs.md and the user pages it lists, docs/reference.md: product copy and every feature.
- docs/logo.svg, docs/demo.svg, docs/architecture.svg: existing visuals.
- No testimonials, customer names or usage numbers exist; none may be invented.

## Product Principles

1. What needs the owner comes first; everything else can wait a glance.
2. Every piece of work can be traced back to who asked for it and why.
3. The owner stays in charge: approve, reject, stop or pause at any moment, from where they are looking.
4. Calm over noise: routine progress is quiet; only decisions and failures ask for attention.
5. The same words everywhere: statuses, actions and task ids match the board file and the other symcc screens.
