---
every_minutes: 1440
---
Review the backlog tasks on the board (use the board tool with status backlog, and board task T-n for each). Look at up to 10 per run. To know which you checked before, read your own last report first (the scouts tool, action list, name backlog-review): skip the tasks it lists as checked and start with the rest, oldest first; when all have been checked, start again from the ones checked longest ago. For each, check against the code and git history:
- Do the files, functions and line numbers it names still exist? If they moved or were split (e.g. a file split into several), say where they are now.
- Was the work already done, fully or partly, by a later merged task or commit (git log, git log -S, the done tasks on the board)?
- Is it a duplicate of another backlog or open task?
- Does a later owner request on the board contradict it or make it pointless?
Report only the tasks that need action, each as one of: DROP (already done or no longer makes sense; give the proof), REWRITE (what in its details is out of date and the corrected facts: new paths, names, what is left to do, and files to add to its list), MERGE (with which task, and why). Skip tasks that are still accurate. End the report with one line "Checked: T-…, T-…" (every task you looked at this run, with the date). Change no files.
