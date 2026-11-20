#!/bin/sh
# Checks the shipped example scouts (T-599): every examples/scouts/*.md has front matter with a whole
# every_minutes above 0 and instructions after it; the EXAMPLES list in tests/example-scouts.test.tsx names
# exactly the files in the folder; and that test's copy of big-files.md (BIG_FILES) matches the real file.
# Plugin tests can't read the real folder, so this is what ties them to it. Usage: sh tests/example-scouts.sh
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/examples/scouts"
test_file="$root/tests/example-scouts.test.tsx"
fail=0

for f in "$dir"/*.md; do
  name=$(basename "$f")
  if [ "$(sed -n 1p "$f")" != "---" ]; then echo "example-scouts: $name does not start with front matter (---)"; fail=1; continue; fi
  every=$(awk 'NR > 1 && /^---$/ { exit } NR > 1 && /^every_minutes:/ { sub(/^every_minutes:[ ]*/, ""); print }' "$f")
  case $every in
    ''|*[!0-9]*) echo "example-scouts: $name has no whole every_minutes ($every)"; fail=1 ;;
    *) [ "$every" -gt 0 ] || { echo "example-scouts: $name has every_minutes 0"; fail=1; } ;;
  esac
  body=$(awk 'n >= 2 { print } /^---$/ { n++ }' "$f" | tr -d '[:space:]')
  [ -n "$body" ] || { echo "example-scouts: $name has no instructions after its front matter"; fail=1; }
done

on_disk=$(cd "$dir" && ls *.md | sed 's/\.md$//' | sort | tr '\n' ' ')
listed=$(sed -n "s/^const EXAMPLES = \[\(.*\)\]$/\1/p" "$test_file" | tr -d "' " | tr ',' '\n' | sort | tr '\n' ' ')
if [ "$on_disk" != "$listed" ]; then
  echo "example-scouts: EXAMPLES in tests/example-scouts.test.tsx ($listed) is not the examples folder ($on_disk)"
  fail=1
fi

copy=$(awk '/^const BIG_FILES = `/ { on = 1; sub(/^const BIG_FILES = `/, "") } on && /^`$/ { exit } on { print }' "$test_file")
if [ "$copy" != "$(cat "$dir/big-files.md")" ]; then
  echo "example-scouts: BIG_FILES in tests/example-scouts.test.tsx differs from examples/scouts/big-files.md"
  fail=1
fi

[ $fail -eq 0 ] && echo "example-scouts: ok"
exit $fail
