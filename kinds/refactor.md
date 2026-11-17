---
description: cleaning up code without changing what it does
---
## code
worker: task
The worker changes how the code is written, not what it does; the tests that pass before still pass after.

## tests
check: tests
on fail: back to code, 2 times
