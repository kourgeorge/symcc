#!/bin/sh
# Runs the Node host's tests (hosts/node/, T-377) with bun test: symcc's engine outside Claude Code, one task end to
# end through the CLI on a scratch git repo with a fake `claude -p`. Not a `claude plugin test` file: that runtime has
# no files or processes. Needs bun and git on PATH. When a test fails, a short summary comes last (T-515): each failing
# test's name and the first lines of its error, so a board that keeps only the tail of the output still shows them. A test
# that timed out shows bun's "this test timed out after Nms" line.
# Usage: sh scripts/test-node-host.sh [folder]
set -eu
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
if ! command -v bun >/dev/null 2>&1; then
  echo "test-node-host: bun is not on PATH." >&2
  exit 2
fi
out=$(mktemp "${TMPDIR:-/tmp}/symcc-test-out.XXXXXX")
code=$(mktemp "${TMPDIR:-/tmp}/symcc-test-code.XXXXXX")
trap 'rm -f "$out" "$code"' EXIT
{ set +e; bun test ./hosts/node/ 2>&1; echo $? >"$code"; } | tee "$out"
status=$(cat "$code"); status=${status:-1}
if [ "$status" != 0 ]; then
  # bun prints a test's error (code frame, "error: ...", the diff, "at ...") before its "(fail) <name>" line
  awk -v status="$status" '
    { gsub(/\033\[[0-9;]*m/, "") }
    /^ *[0-9]+ \| / { src = $0 }
    /^(error|[A-Za-z]*Error)(:| )/ { cap = 1; n = 0; delete buf; if (src != "") buf[++n] = src; src = "" }
    cap && NF { if (n < 12) buf[++n] = $0; if ($0 ~ /^ +at /) cap = 0 }
    /^\(fail\) / { fails++; print "FAILED: " substr($0, 8); for (i = 1; i <= n; i++) print "    " buf[i]; n = 0; cap = 0 }
    # a time-out reason comes on the line after "(fail) <name>"
    /this test timed out/ { sub(/^[ ^]*/, ""); print "    " $0 }
    /[Uu]nhandled error/ { print "FAILED: " $0 }
    BEGIN { print ""; print "test-node-host: failed tests (bun exit " status "):" }
    END { if (!fails) print "    (no failing test named: see the output above)" }
  ' "$out"
fi
exit "$status"
