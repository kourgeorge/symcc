// The built-in "docs" kind (see hooks/core/kinds.ts). To change it for your project, don't edit this file: use the Kinds page
// (Settings) or the lead's kinds tool, which copy it to .symcc/kinds/docs.md, and that file is used instead.
export default `---
description: documentation only
---
## code
worker: task
The worker changes documentation only (README, docs/, comments), not code.

## tests
check: tests
on fail: back to code, 2 times
`
