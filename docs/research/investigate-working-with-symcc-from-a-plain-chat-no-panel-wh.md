# Investigate: working with symcc from a plain chat (no panel)

Kept from task T-1091.

## Question

How well can the owner work with symcc from a plain chat app (Telegram, Slack, Discord, iMessage), with no board panel? What reads well, what breaks, and what should be added?

## How it was found

The worker read Claude Code's channels docs, the Slack and Telegram message-size docs, and symcc's own code (`hooks/register.tsx`, `hooks/app/tools.ts`, `hooks/core/dam.ts` and others named below). It could not read this project's real board, so it built a sample 14-task board in `/tmp/t1091/proj` and printed each text view through the Node host (`bun hosts/node/main.ts --root /tmp/t1091/proj --claude /usr/bin/false cmd …`). For each view it counted characters, lines, the longest line, and lines wider than 40 characters (about a phone's width). No project files were changed. Points marked "a guess" were not tested.

## Answer

### Short answer

From a plain chat today you can only work with symcc by talking to the lead in plain words. The text views exist, but they are built for an 80-column monospace terminal. A chat app also never runs `/symcc-…` commands. And the lead is never told that the owner is in a chat: board updates and questions stay in the terminal unless the lead happens to forward them.

The fix that gives the most for the least code:
1. symcc notices "this owner is in a chat".
2. Every board update then tells the lead to post its reply to the chat, and questions are asked as numbered text instead of the pop-up.
3. The lead gets one narrow chat text shape for the board, Live and tasks views.

No project files were changed. I could not read this project's real board (the guard refuses the owner's `.symcc/`), so all samples come from a realistic 14-task board I built in `/tmp/t1091/proj` and ran through the Node host (`bun hosts/node/main.ts --root /tmp/t1091/proj --claude /usr/bin/false cmd …`). Deleting `/tmp/t1091` afterwards was refused, so it is still there. Nothing runs from it; delete it when you like.

### How the chat setups reach symcc (checked)

- **Claude Code channels (Telegram, Discord, iMessage)** ([docs](https://code.claude.com/docs/en/channels)). A chat message goes into the running local session. The chat only sees what the model sends with the channel's `reply` tool: "you see the inbound message in your terminal but not the reply text". A prompt that needs terminal input stalls the session ("If Claude hits a permission prompt while you're away from the terminal, the session pauses until you respond").
- **Claude Code's prompt origin has a `channel` kind.** It is `{ kind: 'channel', server: string }`, "A message from a channel an MCP server relays (Slack, Telegram)" (`.claude-plugin/types/claude-code/index.d.ts:9553`).
- **symcc ignores that kind.** `hooks/register.tsx:125` counts only `composer`, `bridge` and `sdk` prompts as the owner's. So a chat message is not recorded as the owner's request (`ownerTyped`), and the "Meanwhile the owner" lines are not attached to it. This is a small real bug for chat use.
- **Slack through DAM** (`hooks/core/dam.ts`, `hooks/app/dam.ts`, `hooks/app/tell.ts:105`). This is the only chat path symcc knows about. Board updates there get the short guide core plus `DAM_POST_LINE`. It is still untried: every step in `docs/research/dam-slack-probe.md` is blank.
- **Remote Control** (Claude app on the phone, prompt kind `bridge`). Here slash commands do work, because the phone shows the session itself.
- **Message size limits.** Slack: "limit the `text` field to 4,000 characters … longer `text` may be split into multiple messages of up to about 4,000 characters each" ([chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage)). Telegram's 4,096 characters per message comes from secondary sources ([vercel/chat #866](https://github.com/vercel/chat/issues/866)); I could not reach that part of the official Bot API page.

### Findings per view

Measured on the sample board: characters, lines, longest line, and lines wider than 40 characters (about a phone's width). None of the views has ANSI colour codes.

**1. `/symcc-tasks`: 1,195 chars, 25 lines, 14 lines over 40.**
- This is the best one. It puts what needs you first and is short.
- But it lines up columns with spaces and cuts every row at 80 characters, so on a phone it wraps and the alignment is lost in a proportional font.
- It even cuts a question's choices, which are the part you need to answer:
  ```
    ? Q-7 Which chat should symcc support first for headless work? (Slack | Teleg…
    ? T-1072  waiting       Live tab: Organizational memory lines indented like T…
  ```
- The last line is `/symcc-board opens the board`. On a host with no panel that command answers "There is no board panel here".

**2. `/symcc-status` (the Live tab as text): 1,340 chars, 27 lines, 16 over 40.**
- This is the worst in a chat. It is drawn as a picture that only works in a fixed-width font: rule lines (`───`), a progress-bar row whose stops sit under column titles, a bar chart, an hour-by-hour graph, and many special symbols.
  ```
  ─── ❯ TASKS ────────────────────────────────────────────────────────────────────
                                       work✧    queue    tests    you      done
   ▶ T-1074 Live tab as text: NEEDS …  ●━━━━━━━━●━━━━━━━━●━━━━━━━━◉────────○ ↺3
     try 3/5 · ⏱ 2h · ⌀ 27.6k · worker 27.6k · ⌕ × 1  change
   ⏱ 3h 05m agent work   ⌀/h 00▕▁▁▁▁▁▁▁▁▃▆▁█············▏24
   ✧ = an agent works here (needs an agent slot) · ⌀ = tokens
  ```
- The NEEDS YOU block at the top does read well. It is the part a chat needs most.

**3. `/symcc` with no panel (the same text the lead's `board` tool gives): 2,833 chars for 12 open tasks, 30 lines, 27 over 40, longest 172.**
- Each task takes two long lines. The second, `♟ from: owner — “…”`, often just repeats the title.
- The whole backlog is listed too. My estimate (not measured): your real board, with many open and backlog tasks, would go well past 4,000 characters.
- The header shows a local path (`/tmp/t1091/proj`).
- Symbols like `𝄞 ♟ ◆ ◇ ‖` may show as empty boxes in some apps (a guess).

**4. One task page (`/symcc-task T-1074`, 3 tries, 15 history lines): 1,712 chars, 44 lines.**
- It reads well and is all plain text.
- Problems: it points to local files (`Report (try 3, .symcc/reports/T-1074-try-3.md)` and the older tries' report paths); it mixes time formats ("changed Nov 26 at 11:53 AM" in the header, "10:38" in the history); and a long history alone takes a phone screen.
- The waiting task's page is good: `ASKS: …` and `OPTIONS: Two spaces like Today | Four like task rows`.

**5. A question for you.**
- On Claude Code the lead guide tells the lead to ask with `AskUserQuestion` (`hooks/claude/host.ts:35`, `hooks/app/tools.ts:394`). That is a pop-up in the terminal, which nobody sees from a chat, and per the channels docs the session waits on it.
- Numbered plain text ("the question, numbered choices, '(or answer on the board)'", `hooks/core/dam.ts:35`, `hooks/app/tools.ts:396`) is only used on hosts with no pop-up.
- "(or answer on the board)" means nothing when you have no board.

**6. A board update and the lead's reply.**
- The lead receives `[symcc] Board update: … ✓ T-5 "title" merged into main (abc123); it is done.`, ending with `Lead: … then tell the owner briefly. Reply shape: one line per task ("✓ T-5  merged   what it means")`.
- That one-line reply shape suits a chat well. But outside DAM nothing tells the lead to send it to the chat, so in a Telegram channel session it lands in the terminal.

**7. `/symcc-help`: 19,474 chars, 242 lines.** That is about 5 Slack messages. Its no-panel note ("just say to the lead…") is the right idea.

**8. `/symcc-diff T-5`.** It gives a short list of changed files, which fits a chat. A full one-file diff can be very long.

### What you can't do from a chat today

1. **Get told without asking.** "T-5 merged" and "T-7 needs you" are only voice or sound on the computer (the `notify` setting). Board updates reach the lead, but outside DAM the lead isn't told to post them to the chat.
2. **Answer a question by replying "2".** The lead uses the terminal pop-up, so there are no numbers to reply to, and the session may wait on the pop-up.
3. **See what needs you at a glance in a readable shape.** The lead's only view is `board`, which gives the long two-lines-per-task text. It has no tasks-list or Live view (`hooks/app/tools.ts:447`); those exist only as slash commands.
4. **Use slash commands.** In a channel, a typed `/symcc-tasks` most likely arrives as plain text and does not run (a guess; worth one check). So everything depends on the lead and its tools.
5. **See a picture of the board.** There is no board web page or image. `/symcc-stats html` writes a local `.symcc/stats.html` and opens it on the computer.
6. **Read reports or diffs by link.** Every link is a local file path.

Approving, rejecting, dropping, pausing and answering do work, but only by saying it in plain words to the lead, which has tools for all of them.

### Recommended changes, smallest and most useful first

**0. Check the guesses first (no code, about 15 minutes, for you).**
- Run Claude Code with the official `fakechat` channel (a chat page on localhost:8787) on a throwaway project with symcc.
- Check: does `/symcc-tasks` typed in the chat run? Does a board update turn post anything? Does an `AskUserQuestion` pop-up stall the session?
- Add the results to `docs/research/dam-slack-probe.md`.

**1. Notice "the owner is in a chat" and make the lead post every reply there.**
- What:
  - In `prompt.submit`, count `origin.kind === 'channel'` as the owner's prompt and remember the `server` name.
  - Make the current DAM flag one general "chat" flag, with no special case per chat app.
  - When it is on, every board update and the lead guide end with one line: post your short reply with that chat server's reply tool.
- Files: `hooks/register.tsx`, `hooks/app/dam.ts` and `hooks/core/dam.ts` (could be renamed to chat), `hooks/app/tell.ts`, `hooks/app/symcc.ts`, `tests/`.
- Test: a fake `prompt.submit` with origin `{kind:'channel', server:'telegram'}`. The next board update should end with the post line, and `ownerTyped` should record the text.

**2. In a chat, ask questions as numbered text, never with the pop-up.**
- What: when the chat flag is on, use the no-pop-up branch of the lead guide and of the question replies. Choices are numbered, with "reply with the number or your own words" instead of "(or answer on the board)".
- Files: `hooks/app/tools.ts` (around 390-396), `hooks/app/questions.ts`, `hooks/app/workers.ts:941` (`workerQuestionText`), `hooks/app/cleanup.ts:175`, `tests/`.
- Test: with the chat flag on, the lead guide has no `AskUserQuestion` and the worker-question text asks for numbers.

**3. One chat text shape, used by every view (one shared helper).**
- Rules:
  - At most about 40 characters before the first title word.
  - No space-padded columns, rule lines, progress bars, charts or key hints.
  - Headings are plain words: "Needs you", "Running", "Review", "Failed", "To do".
  - One task per line: `T-1072 waiting: Live tab: Org memory lines…`.
  - Question choices are never cut.
  - Plain words instead of slash-command hints ("say: status, tasks, show T-5").
  - At most about 3,500 characters, then "+N more: say 'more'".
- Files: `hooks/core/task-list.ts`, `hooks/core/live-text.ts`, `hooks/core/banner.ts` (`boardText`), maybe a new `hooks/core/chat-text.ts`, `tests/live-text.test.ts`, the board and tasks tests.
- Test: for each view on the sample board, the output fits 3,500 characters, has no line rules or padded columns, and the question lines are whole.

**4. Give the lead the views as a tool, so "status" in plain words works.**
- What: the lead's `board` tool takes `view: "tasks" | "status"` and returns the chat shape from step 3 when in a chat (the normal text otherwise).
- Files: `hooks/app/tools.ts`, `tests/`.
- Test: the tool with `view: "status"` returns the Live text with NEEDS YOU first.

**5. Later, only if you still want it: a board picture.**
- What: a self-contained `board.html`, built the way `stats-html.ts` builds `stats.html`, which the lead sends as a file (Telegram's `reply` takes files). Same idea for long reports and diffs.
- Files: a new `hooks/core/board-html.ts`, plus `hooks/app/tools.ts`.
- I would leave it until steps 1-4 are in use.

### Still unsure

- Whether a typed `/symcc-…` runs from a channel. Step 0 settles it.
- Whether Slack or Telegram collapse repeated spaces, or turn `_` and `*` in titles (like `max_parallel`) into italics or bold. Both are well-known behaviour, but I did not test them.
- How long your real board's text is.
- Whether DAM posts anything on a board-update turn.

**Recommended next step:** do step 0 (fakechat check), then make steps 1 and 2 one small task, since they share the "in a chat" flag. Step 3 is a second task and step 4 a third, chained after step 3 because they share the text code.

Sources: [Claude Code channels](https://code.claude.com/docs/en/channels), [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage), [vercel/chat #866 (Telegram 4,096 limit)](https://github.com/vercel/chat/issues/866), [Telegram Bot API](https://core.telegram.org/bots/api) (the limit itself was not confirmed there).
