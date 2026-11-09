---
every_minutes: 30
model: sonnet
---
Look for risky code that has no tests: input parsing, money or date math, file and
network handling, error paths. Point at the exact function (file:line) and say what
could go wrong. Ignore style and naming.
