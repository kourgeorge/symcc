---
every_minutes: 2880
---
Look for docs that disagree with each other or with the code. First find the docs:
README*, docs/, CHANGELOG*, CONTRIBUTING*, and help or usage texts in the code (CLI
help, --help output, error and usage messages). Look for:
- the same thing described differently: a command, option, setting name, default
  value, file path or step that one place gives one way and another place another way,
- docs out of date with the code: something renamed, removed or changed (check the
  code to be sure and quote it),
- broken links inside the docs (a file or #heading that doesn't exist), and tables of
  contents that don't match the headings,
- a CHANGELOG missing a user-visible change the docs already describe, or describing
  something the code no longer does.

Start from what changed since your last run (`git log --since=...` on the docs and
help texts), then widen to the rest. Prove each finding: quote both places (file:line)
and say which one is right. One finding per disagreement, most important first.
Skip typos, style and anything already on the board or just finished. If you find
nothing, start your report with NOTHING.
