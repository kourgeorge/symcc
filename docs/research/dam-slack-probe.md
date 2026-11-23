# DAM Slack probe: a checklist to run once

T-920 looked at running symcc under [DAM](https://dam-agents.github.io/docs/) (IBM Research's platform
that runs long-lived agents, each in its own small VM, and lets you talk to them in Slack). Some
questions could only be settled by trying it. This page is that try. **None of the steps below has
been tested yet**; the "what it means" lines say what each result would tell us.

Before you start: a project with symcc on the DAM VM, and a Slack thread with the agent. In DAM,
one Slack thread is one session, and in a channel each message needs an `@mention` of the agent
([DAM Slack page](https://dam-agents.github.io/docs/integrations/slack/)). Close any other symcc
window on this project.

**1. Make the Slack thread drive.**
Type in the thread: `/symcc-enable`, then `/symcc-drive`.
Look for: the lead says this session drives (the board banner says "this session drives"; see
`/symcc-drive` in [reference.md](../reference.md)).
Means: yes, the Slack session can be symcc's lead. No reply, or "Another session drives": slash
commands may not reach Claude Code from Slack, or another window still holds the board.

**2. Is symcc's lead guide there?**
Look in the session output (in a terminal on the VM if Slack hides it) for "was skipped" lines from
`cc-plugin-sec-default`, Claude Code's built-in guard plugin. Its README says it skips a person's
own plugins on `prompt.compose`, the step symcc uses to add its lead guide to the system prompt
([sec-default README](https://github.com/anthropics/claude-code/blob/main/mods/sec-default/README.md);
symcc side: `hooks/register.tsx`). Then ask in Slack: "Without reading files or calling tools,
quote the first line of your symcc guide." The guide starts `## symcc: you are the lead (main
conversation only)` (`hooks/app/tools.ts`).
Means: it quotes that line: the guide arrives. It can't: the guide is skipped, and the lead only
knows symcc from its tools' answers.

**3. Does a worker keep DAM awake?**
Ask the lead to add a small task that takes about 10 minutes. Then send nothing for 20 minutes.
Look for: on the board or in `git log` on the VM, did the task merge with no new Slack message?
Means: yes, a running worker keeps the session alive. No (it stopped, or only went on after your
next message): DAM let the session sleep. DAM's
[Sessions page](https://dam-agents.github.io/docs/core-concepts/sessions/) does not say whether
background work keeps an agent awake.

**4. Does a board update start a turn, and can it post to Slack?**
During step 3, watch for a "[symcc] Board update" turn (sent when a worker finishes; see "What
reaches the lead" in [guide.md](../guide.md)), and whether anything shows up in the thread.
Means: a turn and a Slack post: the owner hears about merges in Slack. A turn but no post: the lead
does not use DAM's post/reply tools by itself (DAM says it has tools to post and reply, but gives
no names: [Slack page](https://dam-agents.github.io/docs/integrations/slack/)). No turn: updates
only show up when you next write.

**5. Does AskUserQuestion show in Slack?**
Ask the lead: "Ask me with a pop-up whether to raise the version."
Look for: a question with buttons, a plain text question, or nothing.
Means: buttons or text: questions reach you. Nothing: questions only live on the board. DAM's Slack
page says tool permission prompts are refused on a Slack turn; it does not mention
AskUserQuestion.

**6. After a long quiet time, does symcc take driving back?**
Leave the thread alone until DAM has closed the session (for example overnight), with a task
ready on the board. Then send any message.
Look for: the lead says this session drives again, and the ready task starts.
Means: yes, symcc picks up by itself after DAM closes it. No: you must type `/symcc-drive` (or
`/symcc-enable`) after each long break.

## Results

| Step | Result (yes / no / partly) | Notes |
|---|---|---|
| 1. Slack thread drives | | |
| 2. Lead guide arrives | | |
| 3. Worker keeps DAM awake | | |
| 4. Board update turn / Slack post | | |
| 5. AskUserQuestion in Slack | | |
| 6. Drives again after a long quiet time | | |
