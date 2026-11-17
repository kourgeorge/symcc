// The built-in "refactor" kind (see hooks/core/kinds.ts). To change it for your project, don't edit this file: use the Kinds page
// (Settings) or the lead's kinds tool, which copy it to .symcc/kinds/refactor.md, and that file is used instead.
export default `---
description: cleaning up code without changing what it does
---
## code
worker: task
The worker changes how the code is written, not what it does; the tests that pass before still pass after.

## tests
check: tests
on fail: back to code, 2 times
`
