---
every_minutes: 240
model: sonnet
---
Find risky code that no test checks. Look for:
- error paths: a command, file, network call or parse that fails, a missing or broken
  input or config file, an empty or odd value,
- edge cases: empty lists, zero, very long or unusual input, two things happening at
  once, dates and money math,
- state changes: each step of a workflow, retries, undo, pause and resume.

For each, name the function (file:line), the case that is not tested, and one or two
concrete test cases to add (input → expected result).
Search the tests with grep first so you don't report something already tested.
Skip simple getters and code that only formats text.
Skip typos, style and anything already on the board or just finished. If you find
nothing, start your report with NOTHING.
