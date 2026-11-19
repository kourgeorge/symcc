#!/bin/sh
# Runs only the named test files through `claude plugin test`, the same way the full run does (T-533).
# `claude plugin test` only takes a plugin folder and runs every test file in it, so this copies the plugin
# (without .git, .symcc, node_modules and the other test files) to a temporary folder, runs it there, and
# deletes the copy. Prints the same pass/fail summary and exits with the same code (non-zero on a failure).
# Usage: sh scripts/test-files.sh tests/checker.test.ts tests/merge.test.ts
#   A name may also be given without "tests/" (checker.test.ts). Unknown names stop with exit 2.
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"

if [ $# -eq 0 ]; then
  echo "test-files: name one or more test files, e.g. sh scripts/test-files.sh tests/checker.test.ts" >&2
  exit 2
fi

# Turn each name into a path under tests/, or stop with a clear error.
files=""
for arg in "$@"; do
  name=${arg#./}
  case $name in
    "$root"/*) name=${name#"$root"/} ;;
  esac
  case $name in
    tests/*) ;;
    *) name="tests/$name" ;;
  esac
  case $name in
    *.test.ts|*.test.tsx) ;;
    *)
      echo "test-files: $arg is not a test file (a test file is tests/<name>.test.ts or .test.tsx)" >&2
      exit 2 ;;
  esac
  if [ ! -f "$root/$name" ]; then
    echo "test-files: no such test file: $arg (looked for $root/$name)" >&2
    exit 2
  fi
  files="$files $name"
done

tmp="$(mktemp -d "${TMPDIR:-/tmp}/symcc-test-files.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT INT TERM

# A real copy, not symlinks: `claude plugin test` refuses hooks that point outside the folder.
rsync -a --exclude=/.git --exclude=/.symcc --exclude=/.scratch --exclude=node_modules \
  --exclude='/tests/*.test.ts' --exclude='/tests/*.test.tsx' "$root/" "$tmp/plugin/"
for f in $files; do
  cp "$root/$f" "$tmp/plugin/$f"
done

set +e
claude plugin test "$tmp/plugin"
code=$?
set -e
exit "$code"
