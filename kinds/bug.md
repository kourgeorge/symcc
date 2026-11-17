---
description: something that works wrongly
---
## code
worker: task
The worker finds why it goes wrong and fixes it, with a test that fails before the fix and passes after.

## tests
check: tests
on fail: back to code, 2 times
