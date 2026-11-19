#!/bin/sh
# Checks scripts/test-files.sh (T-533). Not a `claude plugin test` file: that runtime can't run processes.
# Run: sh tests/test-files-script.sh
# Works on a copy of this project with two extra test files, one that passes and one that fails:
# 1. One passing file: only its tests run (1 test, 1 file), exit 0.
# 2. One failing file: exit non-zero, and the failure is shown.
# 3. Two files: both run, nothing else.
# 4. An unknown name or a non-test file: exit 2 with a clear message.
# 5. The temporary copy is deleted afterwards.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fails=0
bad() { echo "FAIL: $1"; fails=$((fails + 1)); }

proj="$tmp/proj"
rsync -a --exclude=/.git --exclude=/.symcc --exclude=/.scratch --exclude=node_modules "$here/" "$proj/"
cat > "$proj/tests/zz-pass.test.ts" <<'EOF'
import { expect, test } from 'claude-code/testing'
test('zz the passing probe', () => { expect(1 + 1).toBe(2) })
EOF
cat > "$proj/tests/zz-fail.test.ts" <<'EOF'
import { expect, test } from 'claude-code/testing'
test('zz the failing probe', () => { expect(1 + 1).toBe(3) })
EOF
script="$proj/scripts/test-files.sh"
runs="$tmp/runs"; mkdir "$runs"

out="$(TMPDIR="$runs" sh "$script" tests/zz-pass.test.ts 2>&1)"; code=$?
[ "$code" -eq 0 ] || bad "one passing file: expected exit 0, got $code: $out"
echo "$out" | grep -q "zz the passing probe" || bad "one passing file: its test was not shown: $out"
echo "$out" | grep -q "Ran 1 test across 1 file" || bad "one passing file: more than that file ran: $out"

out="$(TMPDIR="$runs" sh "$script" zz-fail.test.ts 2>&1)"; code=$?
[ "$code" -ne 0 ] || bad "one failing file: expected a non-zero exit: $out"
echo "$out" | grep -q "zz the failing probe" || bad "one failing file: the failure was not shown: $out"
echo "$out" | grep -q "1 fail" || bad "one failing file: no fail count: $out"

out="$(TMPDIR="$runs" sh "$script" ./tests/zz-pass.test.ts "$proj/tests/zz-fail.test.ts" 2>&1)"; code=$?
[ "$code" -ne 0 ] || bad "two files: expected a non-zero exit (one fails): $out"
echo "$out" | grep -q "across 2 files" || bad "two files: expected exactly 2 files to run: $out"

out="$(TMPDIR="$runs" sh "$script" tests/no-such.test.ts 2>&1)"; code=$?
[ "$code" -eq 2 ] || bad "unknown file: expected exit 2, got $code"
echo "$out" | grep -q "no such test file: tests/no-such.test.ts" || bad "unknown file: unclear message: $out"

out="$(TMPDIR="$runs" sh "$script" tests/fakes.ts 2>&1)"; code=$?
[ "$code" -eq 2 ] || bad "not a test file: expected exit 2, got $code"
echo "$out" | grep -q "is not a test file" || bad "not a test file: unclear message: $out"

out="$(TMPDIR="$runs" sh "$script" 2>&1)"; code=$?
[ "$code" -eq 2 ] || bad "no names: expected exit 2, got $code"

[ -z "$(ls -A "$runs")" ] || bad "the temporary copies were not deleted: $(ls -A "$runs")"

if [ "$fails" -eq 0 ]; then echo "test-files-script: all checks passed"; else exit 1; fi
