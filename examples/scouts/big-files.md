---
every_minutes: 1440
---
Find source files that have grown too large and say how to split them. Skip tests,
generated files, lock files, snapshots and vendored or third-party code. Look for:
- files much larger than the rest of the project: over about 800 lines, or the top few
  by size (count lines with wc -l and give the numbers),
- files that keep growing: check git log --stat over the last few weeks,
- files that many recent changes touched at once: check git log --name-only for the
  files that show up in the most commits.

For each file worth splitting, propose a concrete split: which functions or sections go
to which new file (give the new file names), and why it is safe (which imports and
callers change, and which tests cover the moved code). Only propose a split that clearly
helps, such as a file that mixes unrelated jobs or one that many tasks keep editing at the
same time; a big file that does one thing well can stay as it is.
Skip typos, style and anything already on the board or just finished. If nothing is worth
splitting, start your report with NOTHING.
