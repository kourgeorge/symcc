#!/bin/sh
# Checks that hooks/core/prompt-sections.ts (and prompts.ts) can be the very first module loaded (T-853). prompt-sections.ts
# imports board-file.ts, which (through history.ts and roles.ts) imports prompts.ts, which imports prompt-sections.ts back.
# prompts.ts used to build its prompt tables at load, which then failed with "Cannot access 'PROMPT_SECTIONS' before
# initialization". Plugin tests can't show this (other modules are always loaded first there), so this runs a fresh bun
# from /tmp for each file. Usage: sh tests/prompt-sections-first.sh
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

for f in hooks/core/prompt-sections.ts hooks/core/prompts.ts; do
  if ! out=$(cd /tmp && bun -e "const m = await import('$root/$f'); if (Object.keys(m).length === 0) throw new Error('no exports')" 2>&1); then
    echo "prompt-sections-first: importing $f first fails:"
    echo "$out" | tail -5
    fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "prompt-sections-first: ok"
exit "$fail"
