---
description: writing or fixing tests - edge cases, error paths, no flaky tests
---
- Cover error paths and edge cases (empty, missing, too big, wrong type), not only the happy path.
- No sleeps, real network, real clocks or random data without a fixed seed; tests must not be flaky.
- One clear reason to fail per test, with a name that says what it checks.
- Follow the project's test style and helpers; don't add a new test framework.
- Don't change the code under test unless the task says so; if a test finds a bug, say so.
- Run the tests before finishing and say what ran and what passed.
