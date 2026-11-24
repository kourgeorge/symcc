#!/bin/sh
# Guards the host-free code (T-372, step 9 of docs/research/host-independence.md): hooks/app/ and hooks/core/, with
# what they import (hooks/board.ts, name.ts, host.ts, types/index.d.ts, prompts/, kinds/), must load in another program
# (an OpenCode plugin, a standalone client) with no Claude Code. Not a `claude plugin test` file: that runtime can't
# read files or run processes. scripts/typecheck.sh runs it. Usage: sh tests/host-free.sh [folder]
# It fails when one of those files
#   1. imports 'claude-code' (or 'claude-code/...'), OpenCode ('@opencode/...'), a Node built-in ('node:...', 'fs',
#      ...), Bun, or anything in hooks/claude/, hooks/opencode/ or hooks/register.tsx;
#   2. names a Claude Code tool in its code ('Read', 'WebSearch', mcp__..., not in comments): those live in hooks/claude/;
#   3. does not type-check with no Claude Code types loaded (plain es2023, "types": []);
#   4. (hooks/app/ and hooks/core/ only) says "Claude" or "ctrl+x" in its code, not in comments (T-475): the texts the
#      owner sees take those from the host's words (HostWords.assistant, app, backToBoard; claude/host.ts CLAUDE_WORDS).
# The engine's other host-free files (T-634, step S1 of docs/research/standalone-app.md section 12): hooks/process/ and
# the board's view helpers in hooks/opencode/board-view.ts get check 1 only (imports), so a later standalone client can
# load them too; so does hooks/engine.ts (T-635: it may re-export './opencode/board-view', no other hooks/opencode/
# file). They may still name Claude Code tools and words (the `claude -p` runner does).
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
# imports only (T-634): every .ts file under hooks/process/, hooks/opencode/board-view.ts, and hooks/engine.ts (T-635)
imports_only=$(echo $(find hooks/process -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | sort; ls hooks/opencode/board-view.ts hooks/engine.ts 2>/dev/null))
[ -n "$files$imports_only" ] || { echo "host-free: no shared files here, nothing to check"; exit 0; }

# the code without its comment lines (// ..., and the * lines of /** ... */ blocks), as "file:line:text"
code() { [ -n "$files" ] || return 0; grep -nHvE '^[[:space:]]*(//|/?\*)' $files; }
imports_code() { grep -nHvE '^[[:space:]]*(//|/?\*)' $files $imports_only; }

NODE='fs|fs/promises|path|os|child_process|process|crypto|util|events|stream|url|http|https|net|tty|readline|buffer|assert|zlib|worker_threads|module|vm'
hits=$(imports_code | grep -E "(from|import|require)[[:space:]]*\(?[[:space:]]*['\"]" |
  grep -E "['\"](claude-code(/[^'\"]*)?|@opencode/[^'\"]*|node:[^'\"]*|bun(:[^'\"]*)?|($NODE))['\"]|['\"][^'\"]*(/claude/|/claude['\"]|/opencode/|/opencode['\"]|register(\.tsx)?['\"])" |
  grep -vE "^hooks/engine\.ts:[0-9]+:.*from '\./opencode/board-view'$")
if [ -n "$hits" ]; then
  echo "$hits" | while IFS= read -r hit; do echo "host-free: a host-bound import (keep it in hooks/claude/ or hooks/opencode/): $hit" >&2; done
  fails=$((fails + 1))
fi

# board-view.ts lives inside hooks/opencode/, so a './...' import is an OpenCode file (T-634)
if [ -f hooks/opencode/board-view.ts ]; then
  hits=$(grep -nHvE '^[[:space:]]*(//|/?\*)' hooks/opencode/board-view.ts | grep -E "(from|import|require)[[:space:]]*\(?[[:space:]]*['\"]\./")
  if [ -n "$hits" ]; then
    echo "$hits" | while IFS= read -r hit; do echo "host-free: a host-bound import (board-view.ts may not import hooks/opencode/ files): $hit" >&2; done
    fails=$((fails + 1))
  fi
fi

# hooks/engine.ts (T-635) lists the engine names the hosts import; tests/engine-names.mjs prints where it lags behind
# the hosts as notes only (T-645: drift never fails), and fails only when hooks/engine.ts itself is not re-exports only
if [ -f hooks/engine.ts ] && [ -f tests/engine-names.mjs ]; then
  if command -v node >/dev/null 2>&1; then js=node; else js=bun; fi
  "$js" tests/engine-names.mjs "$root" || bad "hooks/engine.ts is not a plain list of engine re-exports (see above)"
  # drift (a host starting or stopping to use an engine name) is only noted, never a failure
  if [ -f tests/engine-drift.sh ]; then
    sh tests/engine-drift.sh "$root" >/dev/null || bad "tests/engine-drift.sh: drift in hooks/engine.ts must only be noted (see above)"
  fi
fi

# T-926: every host.env / $.env name read in hooks/ is written out in the Claude host's envGet
if [ -f tests/env-names.sh ] && [ -f hooks/claude/host.ts ]; then
  sh tests/env-names.sh "$root" >/dev/null || bad "tests/env-names.sh: an env read is missing from envGet in hooks/claude/host.ts (see above)"
fi

# Claude Code's tool names, quoted. Role files use symcc's words (tools: web); only hooks/claude/ maps them.
TOOLS='Read|Edit|Write|MultiEdit|NotebookEdit|Bash|BashOutput|KillShell|Glob|Grep|LS|WebSearch|WebFetch|TodoWrite|Task|Agent|AskUserQuestion|ExitPlanMode|EnterPlanMode|Skill'
hits=$(code | grep -E "['\"\`]($TOOLS)['\"\`]|mcp__")
if [ -n "$hits" ]; then
  echo "$hits" | while IFS= read -r hit; do echo "host-free: a Claude Code tool name (keep it in hooks/claude/): $hit" >&2; done
  fails=$((fails + 1))
fi

# Texts the owner sees name no host: "Claude", "Claude Code" and Claude Code's keys come from the host's words.
if [ -n "$shared" ]; then
  hits=$(grep -nHvE '^[[:space:]]*(//|/?\*)' $shared | grep -E 'Claude|ctrl\+x')
  if [ -n "$hits" ]; then
    echo "$hits" | while IFS= read -r hit; do echo "host-free: a Claude Code word in a shared text (take it from the host's words, HostWords): $hit" >&2; done
    fails=$((fails + 1))
  fi
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

# The OpenCode plugin (hooks/opencode/ and its entries in opencode/, T-462) may use Node, Bun and OpenCode, but never
# imports 'claude-code' or anything in hooks/claude/ or hooks/register.tsx, and it type-checks with its own settings
# (hooks/opencode/tsconfig.json, with hosts/node/env.d.ts's Node declarations and its own OpenCode types in ctx.ts).
oc_files=$(find hooks/opencode opencode -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | sort)
if [ -n "$oc_files" ]; then
  q="['\"\`]"
  nq="[^'\"\`]"
  hits=$(grep -nHE "(^|[^[:alnum:]_\$.])(from|import)[[:space:]]*\(?[[:space:]]*$q(claude-code(/$nq*)?|$nq*/claude(/$nq*)?|$nq*/register(\.tsx)?)$q" $oc_files)
  if [ -n "$hits" ]; then
    echo "$hits" | while IFS= read -r hit; do echo "host-free: the OpenCode plugin imports Claude Code (it must run without it): $hit" >&2; done
    fails=$((fails + 1))
  fi
  if [ -f hooks/opencode/tsconfig.json ] && have_tsc; then
    if ! out=$(tsc --noEmit --pretty false -p hooks/opencode/tsconfig.json 2>&1); then
      echo "$out" | grep "error TS" | while IFS= read -r e; do echo "host-free: hooks/opencode/: $e" >&2; done
      fails=$((fails + 1))
    fi
  fi
fi

# The Copilot CLI host (hooks/copilot/, T-957) is type-checked with the rest of hooks/ (the program parts are given
# in, so it imports no Node), but like the other hosts it never imports 'claude-code', hooks/claude/, hooks/opencode/
# or hooks/register.tsx, nor a Node built-in or Bun.
cp_files=$(find hooks/copilot -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | sort)
if [ -n "$cp_files" ]; then
  q="['\"\`]"
  nq="[^'\"\`]"
  hits=$(grep -nHE "(^|[^[:alnum:]_\$.])(from|import)[[:space:]]*\(?[[:space:]]*$q(claude-code(/$nq*)?|node:$nq*|bun(:$nq*)?|$nq*/claude(/$nq*)?|$nq*/opencode(/$nq*)?|$nq*/register(\.tsx)?)$q" $cp_files)
  if [ -n "$hits" ]; then
    echo "$hits" | while IFS= read -r hit; do echo "host-free: the Copilot host imports Claude Code, OpenCode, Node or Bun (its program parts are given in): $hit" >&2; done
    fails=$((fails + 1))
  fi
fi

# The Copilot extension's entry (copilot/entry.ts, T-960) may use Node and the Copilot SDK, never Claude Code, and it
# type-checks with its own settings (copilot/tsconfig.json: hosts/node/env.d.ts plus copilot/sdk.d.ts).
ce_files=$(find copilot -maxdepth 1 -type f -name '*.ts' -not -name '*.d.ts' 2>/dev/null | sort)
if [ -n "$ce_files" ]; then
  q="['\"\`]"
  nq="[^'\"\`]"
  hits=$(grep -nHE "(^|[^[:alnum:]_\$.])(from|import)[[:space:]]*\(?[[:space:]]*$q(claude-code(/$nq*)?|$nq*/claude(/$nq*)?|$nq*/opencode(/$nq*)?|$nq*/register(\.tsx)?)$q" $ce_files)
  if [ -n "$hits" ]; then
    echo "$hits" | while IFS= read -r hit; do echo "host-free: the Copilot extension entry imports Claude Code or OpenCode: $hit" >&2; done
    fails=$((fails + 1))
  fi
  if [ -f copilot/tsconfig.json ] && have_tsc; then
    if ! out=$(tsc --noEmit --pretty false -p copilot/tsconfig.json 2>&1); then
      echo "$out" | grep "error TS" | while IFS= read -r e; do echo "host-free: copilot/: $e" >&2; done
      fails=$((fails + 1))
    fi
  fi
fi

if [ "$fails" -eq 0 ]; then echo "host-free: hooks/app/, hooks/core/, hooks/process/, hosts/node/, hooks/opencode/ and hooks/copilot/ need no Claude Code, and hooks/engine.ts is re-exports only"; else exit 1; fi
