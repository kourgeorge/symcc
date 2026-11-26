#!/bin/sh
# Checks scripts/test-node-host.sh (T-1124). Not a `claude plugin test` file: that runtime can't run processes.
# Run: sh tests/node-host-script.sh
# Uses a fake `bun` first on PATH (fast: no real tests run), so it checks the script itself:
# 1. It runs both the Node host's tests (./hosts/node/) and the Cursor host's tests (./hosts/cursor/).
# 2. When bun passes, it exits 0 with no failure summary.
# 3. When bun fails (say a Cursor test), it exits with bun's code and names the failing test last.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fails=0
bad() { echo "FAIL: $1"; fails=$((fails + 1)); }

mkdir "$tmp/bin"
cat > "$tmp/bin/bun" <<'EOF'
#!/bin/sh
echo "$@" > "$FAKE_BUN_ARGS"
if [ -n "${FAKE_BUN_FAIL:-}" ]; then
  echo "error: expect(received).toBe(expected)"
  echo "(fail) cursor host > the probe test [1.00ms]"
  exit 1
fi
echo " 3 pass"
exit 0
EOF
chmod +x "$tmp/bin/bun"
script="$here/scripts/test-node-host.sh"
args="$tmp/args"

out="$(PATH="$tmp/bin:$PATH" FAKE_BUN_ARGS="$args" sh "$script" 2>&1)"; code=$?
[ "$code" -eq 0 ] || bad "passing run: expected exit 0, got $code: $out"
ran="$(cat "$args" 2>/dev/null)"
echo " $ran " | grep -q " ./hosts/node/ " || bad "the Node host's tests are not run: bun got '$ran'"
echo " $ran " | grep -q " ./hosts/cursor/ " || bad "the Cursor host's tests are not run: bun got '$ran'"
echo "$out" | grep -q "failed tests" && bad "passing run: a failure summary was shown: $out"

out="$(PATH="$tmp/bin:$PATH" FAKE_BUN_ARGS="$args" FAKE_BUN_FAIL=1 sh "$script" 2>&1)"; code=$?
[ "$code" -eq 1 ] || bad "failing run: expected exit 1 (bun's code), got $code: $out"
echo "$out" | tail -n 3 | grep -q "FAILED: cursor host > the probe test" || bad "failing run: the failing test is not named last: $out"

if [ "$fails" -eq 0 ]; then echo "node-host-script: all checks passed"; else exit 1; fi
