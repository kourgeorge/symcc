#!/bin/sh
# Builds what symcc ships for VS Code and Cursor into editor/: serve.mjs (symcc for an editor, from hosts/vscode/main.ts),
# webview/ (the board's page, from hosts/vscode/extension/webview/) and THIRD-PARTY-NOTICES.md. The symcc extension
# finds an installed symcc and runs its editor/serve.mjs; it bundles no engine of its own. The built files are
# committed: an install from GitHub copies the repo as it is and runs no build. The sources stay in hosts/vscode/.
# Rebuild after engine or webview changes; --check says whether the committed files are out of date.
# Needs node, and npm ci done in hosts/vscode and hosts/vscode/extension.
# Usage: sh scripts/build-editor.sh [--out <folder>] [--check]
#   --out <folder>  build into <folder> instead of editor/ (tests use this)
#   --check         build into a scratch folder and exit 1 when it differs from the committed editor/
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/editor"
check=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      [ $# -ge 2 ] || { echo "build-editor: --out needs a folder" >&2; exit 2; }
      out=$2
      shift 2
      ;;
    --check) check=1; shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "build-editor: unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
done
command -v node >/dev/null 2>&1 || { echo "build-editor: node is not on PATH." >&2; exit 2; }
for d in hosts/vscode hosts/vscode/extension; do
  [ -d "$root/$d/node_modules" ] || { echo "build-editor: run npm ci in $d first." >&2; exit 2; }
done

if [ "$check" = 1 ]; then
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/symcc-editor-check.XXXXXX")
  trap 'rm -rf "$tmp"' EXIT
  sh "$0" --out "$tmp/editor" >/dev/null
  if diff -r "$tmp/editor" "$root/editor" >/dev/null 2>&1; then
    echo "build-editor: editor/ is up to date"
    exit 0
  fi
  echo "build-editor: editor/ is out of date; run sh scripts/build-editor.sh" >&2
  exit 1
fi

case $out in /*) ;; *) out="$(pwd)/$out" ;; esac
rm -rf "$out"
mkdir -p "$out"
cd "$root/hosts/vscode"
node build-editor.mjs "$out" >/dev/null
echo "build-editor: wrote $out"
