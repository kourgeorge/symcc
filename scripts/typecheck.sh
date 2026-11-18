#!/bin/sh
# Strict TypeScript check of the whole repo (tsconfig.json -> .claude-plugin/types/tsconfig.json).
# Exits non-zero on any type error, or when .claude-plugin/types is missing (without it tsc would
# quietly use loose settings). The TypeScript version is pinned so results don't change by themselves.
# TypeScript is installed once into a cache folder outside git (shared by all worktrees) and reused,
# so later runs need no network and don't depend on bunx loading it on the fly (T-480).
# Usage: scripts/typecheck.sh [folder]   (folder defaults to the repo this script is in)
# SYMCC_TS_CACHE sets the cache folder (default: ~/.cache/symcc/typescript-<version>).
set -eu

TS_VERSION=5.9.3

root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"

if [ ! -f .claude-plugin/types/tsconfig.json ]; then
  echo "typecheck: $root/.claude-plugin/types/tsconfig.json is missing, so the strict settings can't be used." >&2
  echo "typecheck: open the plugin in Claude Code once (it writes that folder), or copy it from the main folder." >&2
  exit 2
fi

cache=${SYMCC_TS_CACHE:-"${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}/symcc/typescript-$TS_VERSION"}
tsc="$cache/node_modules/typescript/bin/tsc"

# The cached copy counts only if it is complete and the pinned version.
cached_ok() {
  [ -f "$tsc" ] && grep -q "\"version\": *\"$TS_VERSION\"" "$cache/node_modules/typescript/package.json" 2>/dev/null
}

# Install into a fresh folder next to the cache, then move it in whole, so a failed or
# half-done install never leaves a broken cache behind.
install_ts() {
  parent=$(dirname "$cache")
  mkdir -p "$parent"
  stage=$(mktemp -d "$parent/.install.XXXXXX")
  printf '{ "name": "symcc-typescript-cache", "private": true }\n' > "$stage/package.json"
  if (cd "$stage" && bun add --exact "typescript@$TS_VERSION" >"$stage/install.log" 2>&1) \
    && [ -f "$stage/node_modules/typescript/bin/tsc" ]; then
    rm -rf "$cache"
    mv "$stage" "$cache" 2>/dev/null || rm -rf "$stage" # another run may have just put it there
    return 0
  fi
  sed 's/^/typecheck:   /' "$stage/install.log" >&2 2>/dev/null || true
  rm -rf "$stage"
  return 1
}

if ! cached_ok; then
  if ! command -v bun >/dev/null 2>&1; then
    echo "typecheck: bun is not on PATH, so TypeScript $TS_VERSION can't be installed into $cache." >&2
    exit 2
  fi
  echo "typecheck: installing TypeScript $TS_VERSION into $cache" >&2
  if ! install_ts; then
    echo "typecheck: install failed, retrying once" >&2
    if ! install_ts; then
      echo "typecheck: couldn't install TypeScript $TS_VERSION into $cache (see above)." >&2
      exit 2
    fi
  fi
  if ! cached_ok; then
    echo "typecheck: TypeScript $TS_VERSION in $cache looks incomplete; delete that folder and try again." >&2
    exit 2
  fi
fi

if command -v node >/dev/null 2>&1; then run=node
elif command -v bun >/dev/null 2>&1; then run=bun
else
  echo "typecheck: neither node nor bun is on PATH, so tsc can't run." >&2
  exit 2
fi

if "$run" "$tsc" --noEmit --pretty false -p .; then
  echo "typecheck: no type errors"
else
  echo "typecheck: type errors found (see above)" >&2
  exit 1
fi

# hooks/app/ and hooks/core/ must stay free of Claude Code (T-372): see tests/host-free.sh.
# It runs tsc from the same cached copy.
if [ -f tests/host-free.sh ] && ! SYMCC_TSC="$tsc" SYMCC_TSC_RUN="$run" sh tests/host-free.sh "$root"; then
  echo "typecheck: host-bound code found in hooks/app/ or hooks/core/ (see above)" >&2
  exit 1
fi
