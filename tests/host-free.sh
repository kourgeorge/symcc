#!/bin/sh
# Guards the host-free code (T-372, step 9 of docs/research/host-independence.md): hooks/app/ and hooks/core/, with
# what they import (hooks/board.ts, name.ts, host.ts, types/index.d.ts, prompts/, kinds/), must load in another program
# (an OpenCode plugin, a standalone client) with no Claude Code. Not a `claude plugin test` file: that runtime can't
# read files or run processes. scripts/typecheck.sh runs it. Usage: sh tests/host-free.sh [folder]
# It fails when one of those files
#   1. imports 'claude-code' (or 'claude-code/...'), a Node built-in ('node:...', 'fs', ...), Bun, or anything in
#      hooks/claude/ or hooks/register.tsx;
#   2. names a Claude Code tool in its code ('Read', 'WebSearch', mcp__..., not in comments): those live in hooks/claude/;
#   3. does not type-check with no Claude Code types loaded (plain es2023, "types": []).
set -u
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
fails=0
bad() { echo "host-free: $1" >&2; fails=$((fails + 1)); }
# tsc: scripts/typecheck.sh passes its cached copy in SYMCC_TSC (run with SYMCC_TSC_RUN, T-480); run alone, use bunx
have_tsc() { [ -n "${SYMCC_TSC:-}" ] || command -v bunx >/dev/null 2>&1; }
tsc() {
  if [ -n "${SYMCC_TSC:-}" ]; then "${SYMCC_TSC_RUN:-node}" "$SYMCC_TSC" "$@"; else bunx -p typescript@5.9.3 tsc "$@"; fi
}

# the shared files (those that exist: scripts/typecheck.sh's own test runs it on a small copy)
# every .ts and .tsx file under hooks/app/ and hooks/core/, sub-folders too
shared=$(find hooks/app hooks/core -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | sort)
files=$(printf '%s\n' $shared; ls hooks/board.ts hooks/name.ts hooks/host.ts types/index.d.ts prompts/*.ts kinds/*.ts 2>/dev/null)
files=$(echo $files)
[ -n "$files" ] || { echo "host-free: no shared files here, nothing to check"; exit 0; }

# the code without its comment lines (// ..., and the * lines of /** ... */ blocks), as "file:line:text"
code() { grep -nHvE '^[[:space:]]*(//|/?\*)' $files; }

NODE='fs|fs/promises|path|os|child_process|process|crypto|util|events|stream|url|http|https|net|tty|readline|buffer|assert|zlib|worker_threads|module|vm'
hits=$(code | grep -E "(from|import|require)[[:space:]]*\(?[[:space:]]*['\"]" |
  grep -E "['\"](claude-code(/[^'\"]*)?|node:[^'\"]*|bun(:[^'\"]*)?|($NODE))['\"]|['\"][^'\"]*(/claude/|/claude['\"]|register(\.tsx)?['\"])")
if [ -n "$hits" ]; then
  echo "$hits" | while IFS= read -r hit; do echo "host-free: a host-bound import (keep it in hooks/claude/): $hit" >&2; done
  fails=$((fails + 1))
fi

# Claude Code's tool names, quoted. Role files use symcc's words (tools: web); only hooks/claude/ maps them.
TOOLS='Read|Edit|Write|MultiEdit|NotebookEdit|Bash|BashOutput|KillShell|Glob|Grep|LS|WebSearch|WebFetch|TodoWrite|Task|Agent|AskUserQuestion|ExitPlanMode|EnterPlanMode|Skill'
hits=$(code | grep -E "['\"\`]($TOOLS)['\"\`]|mcp__")
if [ -n "$hits" ]; then
  echo "$hits" | while IFS= read -r hit; do echo "host-free: a Claude Code tool name (keep it in hooks/claude/): $hit" >&2; done
  fails=$((fails + 1))
fi

# They type-check on their own, with no Claude Code types: an import of 'claude-code' or 'node:...' can't be found then.
if have_tsc; then
  tmp="$(mktemp -d)"
  list=$(printf '%s\n' $shared | grep . | sed "s|.*|\"$root/&\"|" | paste -sd, -)
  if [ -n "$list" ]; then
    printf '{ "compilerOptions": { "target": "es2023", "lib": ["es2023"], "module": "esnext", "jsx": "react-jsx", "moduleResolution": "bundler", "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true, "skipLibCheck": false, "types": [], "typeRoots": [] }, "files": [%s] }\n' "$list" > "$tmp/tsconfig.json"
    if ! out=$(tsc --noEmit --pretty false -p "$tmp/tsconfig.json" 2>&1); then
      echo "$out" | grep "error TS" | sed "s|$root/||" | while IFS= read -r e; do echo "host-free: with no Claude Code types: $e" >&2; done
      fails=$((fails + 1))
    fi
  fi
  rm -rf "$tmp"
else
  bad "no tsc (bunx is not on PATH), so the type check with no Claude Code types was skipped"
fi

# The Node host (hosts/node/, T-377) runs symcc with no Claude Code: it may use Node and Bun, but never imports
# 'claude-code' or anything in hooks/claude/ or hooks/register.tsx, and it type-checks with its own Node declarations
# (hosts/node/env.d.ts, hosts/node/tsconfig.json). hosts/node/tests/node-host.spec.ts checks the same imports under bun test.
node_files=$(find hosts/node -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | sort)
if [ -n "$node_files" ]; then
  # a module name after `from` (any line, so a long name list's last line too), a bare `import '...'`, or a dynamic
  # `import('...')`; the name is claude-code(/...), a path through or ending in /claude, or register(.tsx)
  q="['\"\`]"
  nq="[^'\"\`]"
  hits=$(grep -nHE "(^|[^[:alnum:]_\$.])(from|import)[[:space:]]*\(?[[:space:]]*$q(claude-code(/$nq*)?|$nq*/claude(/$nq*)?|$nq*/register(\.tsx)?)$q" $node_files)
  if [ -n "$hits" ]; then
    echo "$hits" | while IFS= read -r hit; do echo "host-free: hosts/node/ imports Claude Code (it must run without it): $hit" >&2; done
    fails=$((fails + 1))
  fi
  if [ -f hosts/node/tsconfig.json ] && have_tsc; then
    if ! out=$(tsc --noEmit --pretty false -p hosts/node/tsconfig.json 2>&1); then
      echo "$out" | grep "error TS" | while IFS= read -r e; do echo "host-free: hosts/node/: $e" >&2; done
      fails=$((fails + 1))
    fi
  fi
fi

if [ "$fails" -eq 0 ]; then echo "host-free: hooks/app/, hooks/core/ and hosts/node/ need no Claude Code"; else exit 1; fi
