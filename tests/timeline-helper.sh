#!/bin/sh
# T-522: every place that adds to a task's timeline goes through the one helper in hooks/core/timeline.ts
# (timelineEntry / withTimeline), so each entry is a record { at, kind, text }. The type check already refuses a
# plain string in a timeline; this check also fails on code that builds a timeline list by hand.
# Not a `claude plugin test` file (that runtime can't read files). Usage: sh tests/timeline-helper.sh [folder]
set -u
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
files=$(find hooks hosts/node -type f \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -not -path '*/tests/*' 2>/dev/null | sort)
[ -n "$files" ] || { echo "timeline-helper: no code here, nothing to check"; exit 0; }
# a timeline list written by hand: "timeline: [" not starting with timelineEntry( (an empty [] is fine), or a push onto it
bad=$(grep -nE 'timeline: \[[^]t]|timeline: \[t[^i]|\.timeline\.(push|unshift|splice)\(|\.\.\.[A-Za-z_.()!?]*timeline[^,]*, *['"'"'`]' $files | grep -v 'timeline: \[timelineEntry(')
if [ -n "$bad" ]; then
  echo "timeline-helper: timeline added without timelineEntry / withTimeline (hooks/core/timeline.ts):" >&2
  echo "$bad" >&2
  exit 1
fi
echo "timeline-helper: every timeline entry is added through the helper"
