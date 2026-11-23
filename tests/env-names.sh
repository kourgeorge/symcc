#!/bin/sh
# T-926: Claude Code's $.env.get only answers the names written out in envGet (hooks/claude/host.ts); any other name
# comes back undefined. This fails when a host.env(...) or $.env(...) read anywhere in hooks/ names a variable envGet
# doesn't list. A name may be a quoted word ('HOME') or a constant (DAM_ENV) set as `export const DAM_ENV = '...'`.
# Usage: sh tests/env-names.sh [folder]; tests/host-free.sh runs it (so scripts/typecheck.sh does).
root=${1:-.}
cd "$root" || exit 1
host=hooks/claude/host.ts
[ -f "$host" ] || { echo "env-names: $host not found" >&2; exit 1; }

listed=$(sed -n '/^function envGet/,/^}/p' "$host" | grep -oE "name === '[A-Za-z_][A-Za-z0-9_]*'" | sed -E "s/name === '([^']*)'/\1/")
[ -n "$listed" ] || { echo "env-names: no names found in envGet ($host)" >&2; exit 1; }

# every argument of a host.env( / $.env( read, outside tests
args=$(grep -rhoE "(host|\\$)\.env\([[:space:]]*['\"]?[A-Za-z_][A-Za-z0-9_]*" hooks --include='*.ts' --include='*.tsx' --exclude-dir=tests |
  sed -E "s/.*\.env\([[:space:]]*//" | sort -u)

fails=0
for a in $args; do
  case "$a" in
    \'*|\"*) name=$(echo "$a" | tr -d "'\"") ;;
    *)
      name=$(grep -rhoE "export const $a = ['\"][A-Za-z_][A-Za-z0-9_]*['\"]" hooks --include='*.ts' | head -1 | sed -E "s/.*= ['\"]([^'\"]*)['\"]/\1/")
      if [ -z "$name" ]; then echo "env-names: can't tell which variable $a names (no export const $a = '...' in hooks/)" >&2; fails=$((fails + 1)); continue; fi
      ;;
  esac
  if ! echo "$listed" | grep -qx "$name"; then
    echo "env-names: hooks/ reads $name, but envGet ($host) doesn't list it, so Claude Code always answers undefined" >&2
    fails=$((fails + 1))
  fi
done
[ "$fails" -eq 0 ] || exit 1
echo "env-names: every env read in hooks/ is listed in envGet"
