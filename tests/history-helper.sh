#!/bin/sh
# T-522: every place that adds to a task's history goes through the one helper in hooks/core/history.ts
# (historyEntry / withHistory), so each entry is a record { at, kind, text }. The type check already refuses a
# plain string in a history; this check also fails on code that builds a history list by hand.
# Not a `claude plugin test` file (that runtime can't read files). Usage: sh tests/history-helper.sh [folder]
set -u
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
files=$(find hooks hosts/node -type f \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -not -path '*/tests/*' 2>/dev/null | sort)
[ -n "$files" ] || { echo "history-helper: no code here, nothing to check"; exit 0; }
# a history list written by hand: "history: [" not starting with historyEntry( (an empty [] is fine), or a push onto it
bad=$(grep -nE 'history: \[[^]h]|history: \[h[^i]|\.history\.(push|unshift|splice)\(|\.\.\.[A-Za-z_.()!?]*history[^,]*, *['"'"'`]' $files | grep -v 'history: \[historyEntry(')
if [ -n "$bad" ]; then
  echo "history-helper: history added without historyEntry / withHistory (hooks/core/history.ts):" >&2
  echo "$bad" >&2
  exit 1
fi
echo "history-helper: every history entry is added through the helper"
