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

# 3b. T-480: TypeScript is installed once into a cache and reused; an install is retried once;
# once the cache exists, a failing install (no network) doesn't matter. A fake bun stands in.
mkdir -p "$tmp/fakebin"
cat > "$tmp/fakebin/bun" <<'FAKE'
#!/bin/sh
n=$(cat "$FAKE_BUN_COUNT" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$FAKE_BUN_COUNT"
if [ "$FAKE_BUN_FAIL" = always ] || [ "$n" -le "$FAKE_BUN_FAIL" ]; then echo "fake bun: no network" >&2; exit 1; fi
mkdir -p node_modules/typescript/bin
printf '{ "name": "typescript", "version": "5.9.3" }\n' > node_modules/typescript/package.json
printf 'console.log("fake tsc ran")\n' > node_modules/typescript/bin/tsc
FAKE
chmod +x "$tmp/fakebin/bun"
fake() { # $1 failures before bun works ("always" = never works); runs the script on the fixed copy
  FAKE_BUN_FAIL=$1 FAKE_BUN_COUNT="$tmp/bun-count" SYMCC_TS_CACHE="$tmp/tscache/ts" PATH="$tmp/fakebin:$PATH" \
    sh "$script" "$tmp" 2>&1
}
rm -f "$tmp/bun-count"
out="$(fake always)"; code=$?
[ "$code" -eq 2 ] || bad "install never works: expected exit 2, got $code: $out"
echo "$out" | grep -q "retrying once" || bad "install never works: no retry: $out"
echo "$out" | grep -q "couldn't install TypeScript" || bad "install never works: unclear message: $out"
[ ! -e "$tmp/tscache/ts" ] || bad "install never works: a broken cache was left behind"
rm -f "$tmp/bun-count"
out="$(fake 1)"; code=$?
[ "$code" -eq 0 ] || bad "install works on the retry: expected exit 0, got $code: $out"
echo "$out" | grep -q "retrying once" || bad "install works on the retry: no retry: $out"
echo "$out" | grep -q "fake tsc ran" || bad "install works on the retry: tsc from the cache did not run: $out"
rm -f "$tmp/bun-count"
out="$(fake always)"; code=$?
[ "$code" -eq 0 ] || bad "cache exists, no network: expected exit 0, got $code: $out"
echo "$out" | grep -q "fake tsc ran" || bad "cache exists, no network: tsc from the cache did not run: $out"
[ ! -f "$tmp/bun-count" ] || bad "cache exists: bun was called again"
rm -rf "$tmp/fakebin" "$tmp/tscache" "$tmp/bun-count" "$tmp/bun.lock"

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
# T-377: hosts/node/ may use Node, but never Claude Code or hooks/claude/, in any import form
mkdir -p "$tmp/hosts/node"
printf "import { readFileSync } from 'node:fs'\nimport { S } from '../../hooks/app/state'\n// it never imports 'claude-code'\nexport const n = [readFileSync, S]\n" > "$tmp/hosts/node/ok.ts"
clean
out="$(sh "$tmp/tests/host-free.sh" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 0 ] || bad "host-free with a clean hosts/node/: expected exit 0, got $code: $out"
expect_host_bound "hosts/node/: claude-code import" hosts/node/n.ts "import type { On } from 'claude-code'\n" "hosts/node/ imports Claude Code.*n.ts:1"
expect_host_bound "hosts/node/: dynamic import('claude-code')" hosts/node/n.ts "export const m = import('claude-code')\n" "hosts/node/ imports Claude Code.*n.ts:1"
expect_host_bound "hosts/node/: await import of hooks/claude/" hosts/node/n.ts "export const h = await import('../../hooks/claude/host')\n" "hosts/node/ imports Claude Code.*n.ts:1"
expect_host_bound "hosts/node/: multi-line name list" hosts/node/n.ts "import { a,\n  b } from '../../hooks/claude/host'\n" "hosts/node/ imports Claude Code.*n.ts:2"
expect_host_bound "hosts/node/: the hooks/claude folder itself" hosts/node/n.ts "import { claudeHost } from '../../hooks/claude'\n" "hosts/node/ imports Claude Code.*n.ts:1"
rm -rf "$tmp/hosts"
# T-462: hooks/app/ and hooks/core/ never import OpenCode; the OpenCode plugin never imports Claude Code
expect_host_bound "@opencode import" hooks/app/a.ts "import type { Plugin } from '@opencode/plugin'\nexport type A = Plugin\n" "a host-bound import.*@opencode/plugin"
expect_host_bound "import from hooks/opencode/" hooks/core/c.ts "import { x } from '../opencode/host'\nexport const c = x\n" "a host-bound import.*opencode/host"
mkdir -p "$tmp/hooks/opencode" "$tmp/opencode"
expect_host_bound "hooks/opencode/: claude-code import" hooks/opencode/o.ts "import type { On } from 'claude-code'\n" "the OpenCode plugin imports Claude Code.*o.ts:1"
expect_host_bound "hooks/opencode/: import of hooks/claude/" hooks/opencode/o.ts "import { claudeHost } from '../claude/host'\n" "the OpenCode plugin imports Claude Code.*o.ts:1"
rm -f "$tmp/hooks/opencode/o.ts"
expect_host_bound "opencode/: import of hooks/claude/" opencode/server.ts "export const h = await import('../hooks/claude/host')\n" "the OpenCode plugin imports Claude Code.*server.ts:1"
rm -rf "$tmp/hooks/opencode" "$tmp/opencode"
# T-634: hooks/process/ and hooks/opencode/board-view.ts import no host either (imports only: tool names stay allowed)
mkdir -p "$tmp/hooks/process" "$tmp/hooks/opencode"
printf "// the claude -p runner, no import of 'claude-code'\nimport { c } from '../core/c'\nexport const p = [c, 'Read', 'Claude']\n" > "$tmp/hooks/process/p.ts"
printf "import { c } from '../core/c'\nexport const v = c\n" > "$tmp/hooks/opencode/board-view.ts"
clean
out="$(sh "$tmp/tests/host-free.sh" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 0 ] || bad "host-free with a clean hooks/process/ and board-view.ts: expected exit 0, got $code: $out"
expect_host_bound "hooks/process/: claude-code import" hooks/process/p.ts "import type { On } from 'claude-code'\n" "a host-bound import.*hooks/process/p.ts:1"
expect_host_bound "hooks/process/: node: import" hooks/process/p.ts "import { spawn } from 'node:child_process'\n" "a host-bound import.*hooks/process/p.ts:1"
expect_host_bound "hooks/process/: import of hooks/opencode/" hooks/process/p.ts "import { x } from '../opencode/host'\n" "a host-bound import.*hooks/process/p.ts:1"
# put p.ts back to its clean form, so the board-view.ts cases below fail on board-view.ts alone
printf "import { c } from '../core/c'\nexport const p = c\n" > "$tmp/hooks/process/p.ts"
expect_host_bound "board-view.ts: @opencode import" hooks/opencode/board-view.ts "import type { Plugin } from '@opencode/plugin'\n" "a host-bound import.*board-view.ts:1"
expect_host_bound "board-view.ts: fs import" hooks/opencode/board-view.ts "import { readFileSync } from 'fs'\n" "a host-bound import.*board-view.ts:1"
expect_host_bound "board-view.ts: import of a sibling OpenCode file" hooks/opencode/board-view.ts "import { tui } from './tui'\n" "a host-bound import.*board-view.ts:1"
expect_host_bound "board-view.ts: require of a sibling OpenCode file" hooks/opencode/board-view.ts "const t = require('./tui')\n" "board-view.ts may not import hooks/opencode/ files.*board-view.ts:1"
# T-798: board-view.ts and its parts (board-view-*.ts) may import each other, but no other OpenCode file nor a host
printf "import { c } from '../core/c'\nexport * from './board-view-band'\nexport const v = c\n" > "$tmp/hooks/opencode/board-view.ts"
printf "import type { V } from './board-view'\nexport type B = V\n" > "$tmp/hooks/opencode/board-view-band.ts"
clean
out="$(sh "$tmp/tests/host-free.sh" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 0 ] || bad "host-free with board-view.ts and board-view-band.ts importing each other: expected exit 0, got $code: $out"
expect_host_bound "board-view-band.ts: import of a sibling OpenCode file" hooks/opencode/board-view-band.ts "import { tui } from './tui'\n" "board-view.ts may not import hooks/opencode/ files.*board-view-band.ts:1"
expect_host_bound "board-view-band.ts: fs import" hooks/opencode/board-view-band.ts "import { readFileSync } from 'fs'\n" "a host-bound import.*board-view-band.ts:1"
rm -rf "$tmp/hooks/process" "$tmp/hooks/opencode"
# and through scripts/typecheck.sh, on code that type-checks fine with Claude Code's types
clean
printf "export const c = 'WebFetch'\n" > "$tmp/hooks/core/c.ts"
out="$(sh "$script" "$tmp" 2>&1)"; code=$?
[ "$code" -eq 1 ] || bad "typecheck.sh with a tool name in core: expected exit 1, got $code: $out"
echo "$out" | grep -q "host-bound code found" || bad "typecheck.sh with a tool name in core: unclear message: $out"

if [ "$fails" -eq 0 ]; then echo "typecheck-script: all checks passed"; else exit 1; fi
