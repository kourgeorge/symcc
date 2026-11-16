# symcc short video: scouts, the owner and the pipeline

A vertical short (1080x1920), drawn like an illuminated manuscript, built by `make_scouts_video.py`. Read by a text-to-speech voice (Kokoro), so the spoken text has no symbols, file paths or code, and "symcc" stays spelled as is (the script says it the way `SPOKEN_NAME` spells it). The story: code rots, scouts and the owner turn problems into tasks, the pipeline builds and tests them, the lead orders them and keeps every change traceable, and the holes close.

Each scene has the narration, what the picture shows, and the caption: the burned-in caption is the spoken sentence, and the **Caption** line names the one word per sentence shown in red (in order, separated by " / "; "-" for none). The examples are real tasks and numbers from this project's own board.

## Scene 1: Of Rot and Holes

**Narration:**
Code rots. Every change can open a hole: a bug, a missing test, stale docs.

**On screen:** A drop capital "C" and "ode rots." A crack runs down the page. Three pinned notes get rot marks and red stamps: a code line that loses the whole board ("BUG"), a test file with a hole ("NO TEST"), the guide ("STALE"). The robot looks worried.

**Caption:** rots / hole

## Scene 2: Of the Scouts

**Narration:**
So symcc sends out scouts. They wake on timers, read the code, and hunt for problems. One found that the answer, no rush, give it another hour, would stop a worker. Each finding becomes a task.

**On screen:** Three scout seals with hourglasses (gaps-bot, test-gaps, recent-changes). A code note with the check that reads "no" as stop, underlined in red, and the owner's friendly answer stamped "WOULD STOP THE WORKER". A new task note, T-262, found by test-gaps.

**Caption:** scouts / timers / stop / task

## Scene 3: Of the Owner's Word

**Narration:**
You can ask too. Tell the lead in your chat, and it writes a task. Both kinds meet on one board.

**On screen:** A chat scroll: the owner asks for this very video, the lead answers "Added T-290". On the board, the owner's task and the scout's task are pinned side by side, each with its seal.

**Caption:** ask / task / board

## Scene 4: Of the Pipeline

**Narration:**
Then the pipeline runs. A worker builds the task in its own copy. Tests must pass before it merges. If they fail, it goes back for another try.

**On screen:** Four stations down the page: todo, doing, test, merge. T-262 moves down: a worker in its own folder, then the tests, a "PASSED" stamp, merged. Another task fails its tests: a big red X, and an arrow back to doing for try 2.

**Caption:** pipeline / copy / pass / try

## Scene 5: What a Task Holds

**Narration:**
Every task is a page. What and why, which files, and where it came from. Its tries, the report, the time and tokens.

**On screen:** T-262 as an unrolled scroll: what, why, files, origin (scout test-gaps), tries, the worker's report, time and tokens. Beside it, the four kinds of origin seal: the owner's words, a scout, a worker's report, the lead.

**Caption:** page / came / tokens

## Scene 6: Of the Lead's Judgement

**Narration:**
The lead judges. Bugs and safety go first. When two tasks touch the same files, one waits. Every commit carries its task number, so each change traces back to its request.

**On screen:** The robot with a quill ranks the notes: a bug (T-271) and a safety fix (T-170) first; T-291 waits "after T-289", tied with a red thread because both change the tests. A commit line starting with "T-262:" is underlined, and a red thread runs from it back to its task.

**Caption:** judges / first / waits / traces

## Scene 7: The Holes Closed

**Narration:**
And the holes close. In this one project, two hundred seventy tasks are done, sixty three found by scouts. The product gets better every day.

**On screen:** The crack heals with gold. A list of real closed findings is ticked off one by one. The numbers from this project's board: 270 tasks done, 63 found by scouts.

**Caption:** close / scouts / better

## Scene 8: Many agents, one board

**Narration:**
symcc. Many agents, one board.

**On screen:** A banner with "symcc", trumpets on both sides, "many agents, one board" and the repository link. The robot cheers.

**Caption:** - / board

---

## Title

symcc: how scouts and you feed one board of coding agents

## Description

Code rots: every change can open a hole. symcc's scouts wake on timers, read the code and turn what they find into tasks. You can ask the lead for work in your normal chat too. Each task is built by a worker in its own copy, tested, and merged only when the tests pass. Every task shows what, why, which files, where it came from, its tries, the report, time and tokens, and every commit carries its task number. https://github.com/kourgeorge/symcc
