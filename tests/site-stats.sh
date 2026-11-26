#!/bin/sh
# Checks scripts/site-stats.ts (T-1145) on a small fake board: the fields of docs/data/symcc-stats.json, and that no
# title, detail or path of the board comes out. Not a `claude plugin test` file (it runs a process).
# Run: sh tests/site-stats.sh
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if bun "$here/tests/site-stats-check.mjs" "$here" "$tmp"; then echo "site-stats: ok"; else exit 1; fi
