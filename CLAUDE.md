# Working on symcc

## Run only some tests

While you work, run only the tests for what you changed:

    sh scripts/test-files.sh tests/checker.test.ts tests/merge.test.ts

It runs just those files through `claude plugin test` (from a temporary copy of the plugin) and
exits non-zero when one fails. A name without `tests/` also works (`checker.test.ts`). Plain
`bun test` does not work here (it can't find `claude-code/testing`), and `claude plugin test`
only takes a whole plugin folder.

Shell checks in `tests/` (like `tests/typecheck-script.sh` and `tests/test-files-script.sh`)
run on their own: `sh tests/<name>.sh`.

## Type check

    sh scripts/typecheck.sh

## The full test commands

symcc runs these four before merging, so you don't need to run them all at the end:

    claude plugin test .
    sh scripts/typecheck.sh
    sh scripts/test-opencode-host.sh
    sh scripts/test-node-host.sh

`sh scripts/test-node-host.sh` runs both the Node host's tests (`hosts/node/`) and the Cursor
host's tests (`hosts/cursor/tests/`).

## Engine and clients

What is engine, what is a client, and the rule between them: `docs/engine-and-clients.md`.
