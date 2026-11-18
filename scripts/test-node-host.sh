#!/bin/sh
# Runs the Node host's tests (hosts/node/, T-377) with bun test: symcc's engine outside Claude Code, one task end to
# end through the CLI on a scratch git repo with a fake `claude -p`. Not a `claude plugin test` file: that runtime has
# no files or processes. Needs bun and git on PATH. Usage: sh scripts/test-node-host.sh [folder]
set -eu
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
if ! command -v bun >/dev/null 2>&1; then
  echo "test-node-host: bun is not on PATH." >&2
  exit 2
fi
exec bun test ./hosts/node/
