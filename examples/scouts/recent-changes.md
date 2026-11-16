---
every_minutes: 90
---
Review the commits since your last run (`git log --since=... -p`; on the first run, the
last 5 commits: `git log -p -n 5`) for problems the change brought in:
- a condition, default or limit that is now wrong,
- a caller of a changed function that was not updated (grep for every use of it),
- a new parameter, field, setting or message that other parts (UI, CLI help, config,
  docs, tests) don't handle yet,
- stored data or config files written before the change that would now break when read,
- risky new code with no test.

Run the project's test command once (find it in the README, package.json scripts,
Makefile, CI config, ...) and report any failure with its output.
Name the commit (short hash and subject) for each finding, and point at file:line.
Skip typos, style and anything already on the board or just finished. If you find
nothing, start your report with NOTHING.
