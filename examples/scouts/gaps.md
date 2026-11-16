---
every_minutes: 60
---
Find real gaps between what this project promises and what it does. Look for:
- things the README, docs, help texts or CLI descriptions say that the code does not
  do, or does differently (commands, options, defaults, messages),
- error paths that are not handled: a command, file, network call or value that can
  fail, be missing or be empty, and what the user would see when it does,
- risky code with no test at all.

Start from what changed since your last run (`git log`), then widen to the rest.
Prove each finding: quote the lines on both sides (file:line), or run a read-only
command or the tests and show the output. Plain wrong logic is the bugs scout's job;
report it here only when it breaks a promise or an error path.
Skip typos, style and anything already on the board or just finished. If you find
nothing, start your report with NOTHING.
