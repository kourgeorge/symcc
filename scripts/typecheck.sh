#!/bin/sh
# Strict TypeScript check of the whole repo (tsconfig.json -> .claude-plugin/types/tsconfig.json).
# Exits non-zero on any type error, or when .claude-plugin/types is missing (without it tsc would
# quietly use loose settings). The TypeScript version is pinned so results don't change by themselves.
# Usage: scripts/typecheck.sh [folder]   (folder defaults to the repo this script is in)
set -eu

TS_VERSION=5.9.3

root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"

if [ ! -f .claude-plugin/types/tsconfig.json ]; then
  echo "typecheck: $root/.claude-plugin/types/tsconfig.json is missing, so the strict settings can't be used." >&2
  echo "typecheck: open the plugin in Claude Code once (it writes that folder), or copy it from the main folder." >&2
  exit 2
fi

if ! command -v bunx >/dev/null 2>&1; then
  echo "typecheck: bunx (from bun) is not on PATH." >&2
  exit 2
fi

if bunx -p "typescript@$TS_VERSION" tsc --noEmit --pretty false -p .; then
  echo "typecheck: no type errors"
else
  echo "typecheck: type errors found (see above)" >&2
  exit 1
fi
