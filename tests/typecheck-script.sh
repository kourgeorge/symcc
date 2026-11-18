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

# 4. T-372: tests/host-free.sh (run by the script) fails when hooks/app/ or hooks/core/ needs Claude Code.
mkdir -p "$tmp/tests" "$tmp/hooks/app" "$tmp/hooks/core" "$tmp/hooks/claude"
cp "$here/tests/host-free.sh" "$tmp/tests/host-free.sh"
clean() {
  printf "// a comment may say: import type { On } from 'claude-code', or 'Read'\nimport { c } from '../core/c'\nexport const a = c + 1\n" > "$tmp/hooks/app/a.ts"
  printf 'export const c = 1\n' > "$tmp/hooks/core/c.ts"
  printf 'export const x = 1\n' > "$tmp/hooks/claude/x.ts"
}
clean
out="$(sh "$script" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 0 ] || bad "host-free code: expected exit 0, got $code: $out"
expect_host_bound() { # $1 what, $2 the file, $3 its text, $4 the message expected
  clean
  printf "$3" > "$tmp/$2"
  out="$(sh "$tmp/tests/host-free.sh" "$tmp" 2>&1)"; code=$?
  [ "$code" -eq 1 ] || bad "$1: expected exit 1, got $code: $out"
  echo "$out" | grep -q "$4" || bad "$1: message not shown: $out"
}
expect_host_bound "claude-code import" hooks/app/a.ts "import type { On } from 'claude-code'\nexport type A = On\n" "a host-bound import.*hooks/app/a.ts:1"
expect_host_bound "claude-code/testing import" hooks/core/c.ts "import { test } from 'claude-code/testing'\nexport const c = test\n" "a host-bound import.*hooks/core/c.ts:1"
expect_host_bound "node: import" hooks/core/c.ts "import { readFileSync } from 'node:fs'\nexport const c = readFileSync\n" "a host-bound import.*node:fs"
expect_host_bound "import from hooks/claude/" hooks/app/a.ts "import { x } from '../claude/x'\nexport const a = x\n" "a host-bound import.*claude/x"
expect_host_bound "Claude tool name" hooks/core/c.ts "export const c = ['Read', 'Edit']\n" "a Claude Code tool name.*hooks/core/c.ts:1"
expect_host_bound "mcp__ tool name" hooks/app/a.ts "export const a = 'mcp__symcc__board'\n" "a Claude Code tool name"
mkdir -p "$tmp/hooks/core/sub"
expect_host_bound "claude-code import in a sub-folder" hooks/core/sub/x.ts "import { atom } from 'claude-code'\nexport const x = atom\n" "a host-bound import.*hooks/core/sub/x.ts:1"
rm -rf "$tmp/hooks/core/sub"
expect_host_bound "node: import in a .tsx file" hooks/app/y.tsx "import { readFileSync } from 'node:fs'\nexport const y = readFileSync\n" "a host-bound import.*hooks/app/y.tsx:1"
rm -f "$tmp/hooks/app/y.tsx"
expect_host_bound "needs Claude Code types" hooks/app/a.ts "export const a: EngineInterface | null = null\n" "with no Claude Code types.*TS2304"
# and through scripts/typecheck.sh, on code that type-checks fine with Claude Code's types
clean
printf "export const c = 'WebFetch'\n" > "$tmp/hooks/core/c.ts"
out="$(sh "$script" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 1 ] || bad "typecheck.sh with a tool name in core: expected exit 1, got $code: $out"
echo "$out" | grep -q "host-bound code found" || bad "typecheck.sh with a tool name in core: unclear message: $out"

if [ "$fails" -eq 0 ]; then echo "typecheck-script: all checks passed"; else exit 1; fi
