#!/bin/sh
# Runs the OpenCode plugin's tests (hooks/opencode/, T-462) with bun test: a fake OpenCode ctx on a scratch git repo
# with a worker's worktree. It checks which copy runs symcc's engine (one per real main folder), and that a worker's
# edits and shell writes are refused through permission.evaluate; and, on a fake session API, that workers are
# OpenCode sessions (create -> move -> prompt -> wait or interrupt, tokens, the model per role, T-463); and that symcc's lead tools and slash commands are added and run its own handlers (T-465); and that a lead.json a stopped
# OpenCode left behind never blocks the next start, and scripts/install-opencode.sh links the plugin (T-467). Not a `claude plugin test` file: that runtime has
# no files or processes, and OpenCode itself isn't needed. Needs bun and git on PATH.
# Usage: sh scripts/test-opencode-host.sh [folder]
set -eu
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
if ! command -v bun >/dev/null 2>&1; then
  echo "test-opencode-host: bun is not on PATH." >&2
  exit 2
fi
exec bun test ./hooks/opencode/
