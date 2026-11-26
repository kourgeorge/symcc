# Who did what: clearer task history

symcc 0.5.45 makes it easier to see what happened to a task and who did it.

Every line in a task's history now names who wrote it, with the agent's id, for example `worker symcc-T-5:` or `checker symcc-T-5-checker:`. The checker's verdict is its own line with the first problem it found, and a Checker section shows its full report.

Under the task title you now see the change size (for example `25 files · +539 −3,722`). A finished task also gets a Done line: one sentence on what the whole task did. It shows on the task page, in Live, and in the merge message.

The checker is also calmer. It sends work back only for what is worse than main. After 2 send-backs, symcc stops the loop and asks you once: Merge as is, Keep fixing, or Drop.

The agent organization now tells you more, and asks you less often.
