#!/bin/sh
# Checks scripts/typecheck.sh (T-361). Not a `claude plugin test` file: that runtime can't run processes.
# Run: sh tests/typecheck-script.sh
# 1. A small copy of the project with a deliberate type error must fail (exit 1) and name the error.
# 2. The same copy without .claude-plugin/types must fail (exit 2) with a clear message, not pass on loose settings.
# 3. The same copy with the error fixed must pass.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"
script="$here/scripts/typecheck.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fails=0
bad() { echo "FAIL: $1"; fails=$((fails + 1)); }

mkdir -p "$tmp/.claude-plugin" "$tmp/hooks"
cp "$here/tsconfig.json" "$tmp/tsconfig.json"
cp -R "$here/.claude-plugin/types" "$tmp/.claude-plugin/types"
printf 'const n: number = "not a number"\nexport { n }\n' > "$tmp/hooks/bad.ts"
# noUncheckedIndexedAccess must be on (strict settings, not loose ones)
printf 'const a: string[] = []\nconst s: string = a[0]\nexport { s }\n' > "$tmp/hooks/strict.ts"

out="$(sh "$script" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 1 ] || bad "type error: expected exit 1, got $code"
echo "$out" | grep -q "hooks/bad.ts.*TS2322" || bad "type error: bad.ts error not shown: $out"
echo "$out" | grep -q "hooks/strict.ts.*TS2322" || bad "strict settings: a[0] as string was not caught: $out"

mv "$tmp/.claude-plugin/types" "$tmp/types-away"
out="$(sh "$script" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 2 ] || bad "no types folder: expected exit 2, got $code"
echo "$out" | grep -q ".claude-plugin/types/tsconfig.json is missing" || bad "no types folder: unclear message: $out"
mv "$tmp/types-away" "$tmp/.claude-plugin/types"

printf 'const n: number = 1\nexport { n }\n' > "$tmp/hooks/bad.ts"
printf 'const a: string[] = []\nconst s: string = a[0] ?? ""\nexport { s }\n' > "$tmp/hooks/strict.ts"
out="$(sh "$script" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 0 ] || bad "fixed code: expected exit 0, got $code: $out"

if [ "$fails" -eq 0 ]; then echo "typecheck-script: all checks passed"; else exit 1; fi
