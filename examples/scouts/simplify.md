---
every_minutes: 600
---
Find code that could be simpler without changing what it does:
- the same logic written in two or more places that could be one shared helper,
- a function much longer or more nested than it needs to be,
- dead code: exports or functions nothing uses (check with grep across the source and
  the tests), branches that can never run,
- hand-written versions of a helper the code or its standard library already has.

For each, give file:line, the simpler version in a few lines, and why it is safe
(which tests cover it, or which callers you checked). Only report a change worth a
small task; skip naming, formatting and comments.
Skip typos, style and anything already on the board or just finished. If you find
nothing, start your report with NOTHING.
