#!/bin/sh
# Builds symcc's GitHub Copilot CLI extension (T-960): bundles copilot/entry.ts (with hooks/copilot/, the engine and
# the Node host's parts) into one file, copilot/extensions/symcc/extension.mjs, the only form Copilot CLI runs.
# "@microsoft/copilot-sdk" and "@microsoft/copilot-sdk/extension" stay outside the bundle: Copilot CLI gives them.
# The plugin manifest is .github/plugin/plugin.json ("extensions": "copilot/extensions") and the marketplace file
# .github/plugin/marketplace.json, so the plugin is the whole repo (the extension finds roles/, kinds/ and examples/
# three folders up). The built file is committed: an install from GitHub copies the repo as it is and runs no build.
# Rebuild after engine changes, before going live; --check says whether the committed file is out of date.
# Usage: sh scripts/build-copilot.sh [--out <folder>] [--check]
#   --out <folder>  write <folder>/extensions/symcc/extension.mjs instead of copilot/ (tests use this)
#   --check         build into a scratch folder and exit 1 when it differs from the committed file
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/copilot"
check=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      [ $# -ge 2 ] || { echo "build-copilot: --out needs a folder" >&2; exit 2; }
      out=$2
      shift 2
      ;;
    --check) check=1; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "build-copilot: unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
done
command -v bun >/dev/null 2>&1 || { echo "build-copilot: bun is not on PATH." >&2; exit 2; }

if [ "$check" = 1 ]; then
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/symcc-copilot-check.XXXXXX")
  trap 'rm -rf "$tmp"' EXIT
  sh "$0" --out "$tmp" >/dev/null
  if cmp -s "$tmp/extensions/symcc/extension.mjs" "$root/copilot/extensions/symcc/extension.mjs"; then
    echo "build-copilot: copilot/extensions/symcc/extension.mjs is up to date"
    exit 0
  fi
  echo "build-copilot: copilot/extensions/symcc/extension.mjs is out of date; run sh scripts/build-copilot.sh" >&2
  exit 1
fi

file="$out/extensions/symcc/extension.mjs"
mkdir -p "$(dirname "$file")"
# run from the repo, so bun finds no other project's settings; a banner says where the file comes from
cd "$root"
bun build copilot/entry.ts --target=node --format=esm \
  --external @microsoft/copilot-sdk --external @microsoft/copilot-sdk/extension \
  --banner "// Built by scripts/build-copilot.sh from copilot/entry.ts: do not edit by hand." \
  --outfile "$file" >/dev/null
echo "build-copilot: wrote $file"
