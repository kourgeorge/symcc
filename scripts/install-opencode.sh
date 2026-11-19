#!/bin/sh
# Installs symcc into OpenCode 2.x (T-467): links this symcc folder's opencode/ into OpenCode's plugins folder, where
# OpenCode 2.3 loads a local plugin from (its server.ts and tui.ts), so nothing is copied and nothing is downloaded.
#   for you (every project):   $XDG_CONFIG_HOME/opencode/plugins/symcc   (default ~/.config/opencode/plugins/symcc)
#   for one project only:      <project>/.opencode/plugins/symcc         (with --project <folder>)
# The Claude Code plugin is not touched. A link already there that points elsewhere is replaced; a real folder or file
# there is left alone (the script stops). --remove takes the link away again.
# Usage: sh scripts/install-opencode.sh [--project <folder>] [--remove]
set -eu

here="$(cd "$(dirname "$0")/.." && pwd)"
project=''
remove=0
while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      [ $# -ge 2 ] || { echo "install-opencode: --project needs a folder" >&2; exit 2; }
      project=$2
      shift 2
      ;;
    --remove) remove=1; shift ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install-opencode: unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
done

if [ ! -f "$here/opencode/server.ts" ] || [ ! -f "$here/opencode/tui.ts" ]; then
  echo "install-opencode: $here/opencode/ has no server.ts and tui.ts; run this from a symcc folder." >&2
  exit 2
fi

if [ -n "$project" ]; then
  [ -d "$project" ] || { echo "install-opencode: no folder $project" >&2; exit 2; }
  plugins="$(cd "$project" && pwd)/.opencode/plugins"
else
  plugins="${XDG_CONFIG_HOME:-${HOME:?}/.config}/opencode/plugins"
fi
link="$plugins/symcc"

if [ "$remove" = 1 ]; then
  if [ -L "$link" ]; then
    rm "$link"
    echo "install-opencode: removed $link"
  else
    echo "install-opencode: no symcc link at $link"
  fi
  exit 0
fi

if [ -e "$link" ] && [ ! -L "$link" ]; then
  echo "install-opencode: $link exists and is not a link; move it away first." >&2
  exit 1
fi
mkdir -p "$plugins"
rm -f "$link"
ln -s "$here/opencode" "$link"
echo "install-opencode: linked $link -> $here/opencode"

# Only the 2.x line has this plugin API (the 1.x line is different): warn when the opencode on PATH is older.
if command -v opencode >/dev/null 2>&1; then
  v=$(opencode --version 2>/dev/null | sed -n 's/^[^0-9]*\([0-9][0-9]*\)\..*/\1/p' | head -n 1)
  if [ -n "$v" ] && [ "$v" -lt 2 ]; then
    echo "install-opencode: the opencode on your PATH is version $v.x; symcc needs OpenCode 2.3 or newer." >&2
  fi
fi
echo "install-opencode: start OpenCode in your project; check with: opencode plugin list"
