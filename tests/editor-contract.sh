#!/bin/sh
# Checks that the contract between serve and the editor extension (hosts/vscode/contract.ts) wasn't changed without
# its number being reconsidered: hosts/vscode/contract.sha256 records the PROTOCOL and the file's hash it was last
# looked at with. A change an extension speaking the old number couldn't follow raises PROTOCOL; either way, record
# the new hash. Run by scripts/typecheck.sh and tests/editor-bundle.sh.
# Usage: sh tests/editor-contract.sh [folder]
set -eu
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
fail() { echo "editor-contract: $1" >&2; exit 1; }
contract=hosts/vscode/contract.ts
record=hosts/vscode/contract.sha256

if command -v sha256sum >/dev/null 2>&1; then sum() { tr -d '\r' <"$1" | sha256sum | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then sum() { tr -d '\r' <"$1" | shasum -a 256 | cut -d' ' -f1; }
else fail "neither sha256sum nor shasum is on PATH"
fi

protocol=$(sed -n 's/^export const PROTOCOL = \([0-9][0-9]*\)$/\1/p' "$contract")
[ -n "$protocol" ] || fail "$contract has no line 'export const PROTOCOL = <number>'"
hash=$(sum "$contract")
[ -f "$record" ] || fail "$record is missing; write this line into it: $protocol $hash"
read -r was washash <"$record" || true
if [ "$was" = "$protocol" ] && [ "$washash" = "$hash" ]; then
  echo "editor-contract: contract.ts is as recorded for protocol $protocol"
  exit 0
fi
if [ "$was" != "$protocol" ]; then
  fail "PROTOCOL is $protocol, and $record has $was. Write this line into it: $protocol $hash"
fi
fail "$contract changed since protocol $protocol was recorded. If an extension that speaks $protocol can still follow, write this line into $record: $protocol $hash. If not, raise PROTOCOL in $contract and record that number with the hash (see 'The contract and its number' in docs/architecture.md)."
