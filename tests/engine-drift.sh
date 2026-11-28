#!/bin/sh
# T-645: hooks/engine.ts may lag behind the hosts. On a copy of the project, a host file gets a new engine import and
# another loses one; tests/engine-names.mjs must then still exit 0 and print both differences as notes.
# (tests/engine.test.ts never looks at the hosts, so host work can't fail it either.) Usage: sh tests/engine-drift.sh [folder]; tests/host-free.sh runs it
set -u
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for d in hooks hosts opencode tests types; do [ -d "$root/$d" ] && cp -R "$root/$d" "$tmp/$d"; done
if command -v node >/dev/null 2>&1; then js=node; else js=bun; fi
fail() { echo "engine-drift: $1" >&2; exit 1; }

# hosts stop using engine names: every host file on the copy is emptied (so it holds whatever names they use today)
for f in $(find "$tmp/hooks/claude" "$tmp/hooks/opencode" "$tmp/hosts/node" "$tmp/opencode" -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null) "$tmp/hooks/register.tsx"; do
  case "$f" in */board-view.ts|*/board-view-*.ts) ;; *) [ -f "$f" ] && : > "$f" ;; esac
done
# and a host starts to use an engine name hooks/engine.ts does not list
mkdir -p "$tmp/hooks/claude"
printf "import { notListedAnywhereT645 } from '../app/state'\n" > "$tmp/hooks/claude/drift-probe.ts"

out=$("$js" "$tmp/tests/engine-names.mjs" "$tmp" 2>&1) || fail "engine-names failed on drift (it must only note it): $out"
echo "$out" | grep -q 'is missing notListedAnywhereT645' || fail "no note for the new host import: $out"
echo "$out" | grep -q 'which no host imports any more' || fail "no note for the dropped host import: $out"

# the shape of hooks/engine.ts itself still fails
printf "\nconst x = 1\n" >> "$tmp/hooks/engine.ts"
"$js" "$tmp/tests/engine-names.mjs" "$tmp" >/dev/null 2>&1 && fail "a non-re-export line in hooks/engine.ts passed"
echo "engine-drift: drift is only noted (exit 0); a bad line in hooks/engine.ts still fails"
