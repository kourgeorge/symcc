# Built with symcc

symcc was built with symcc. From the first commit on, every change to it went through its own board: the owner talked to the lead, workers built the tasks, a checker and the tests looked at each change, and scouts found more work. The numbers on this page come from that board, so they are real. They show counts, times and tokens only: no task titles, no text from tasks or reports.

{{stats:summary}}

The numbers are made by `bun scripts/site-stats.ts` and kept in `docs/data/symcc-stats.json`. The owner or the lead runs the script before a release and commits the file, so the page is as fresh as the last release.

## In all

{{stats:totals}}

## Tasks over time

Tasks merged on each day.

{{stats:perDay}}

## How tasks ended

Most tasks merge on their own once the checker and the tests pass. Some wait for the owner to approve them.

{{stats:endedHow}}

When a try fails, a new one starts with what went wrong. These are the reasons tries failed.

{{stats:failed}}

## Where tasks came from

{{stats:origins}}

Tasks by worker role:

{{stats:roles}}

## What scouts found

Scouts look for bugs, missing tests and outdated parts on their own timers. "Found" is how many tasks a scout made. "Merged" is how many of those were built and merged; the rest were dropped or are still open.

{{stats:scoutBars}}

{{stats:scouts}}

## Tokens

Tokens are what the model reads and writes. "In all" adds every kind together. "Billed" is an estimate of what the tokens cost compared with plain input: cached reads count for much less, and output counts for much more. It is a way to compare work, not a price. Dollars are not shown, because symcc does not know the prices of your plan.

{{stats:tokens}}

Per merged task:

{{stats:perDone}}

## Time per stage

The average time a merged task spent in each stage, from the moment it was made to the moment it merged.

{{stats:stages}}
