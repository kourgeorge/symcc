# symcc short video: many hands, the holes they leave, and the scouts

A vertical short (1080x1920), drawn like an illuminated manuscript, built by `make_swarm_video.py` (it shares its look, voice, captions and drawing pieces with `make_scouts_video.py`). Read by a text-to-speech voice (Kokoro), so the spoken text has no symbols, file paths or code, and "symcc" stays spelled as is (the script says it the way `SPOKEN_NAME` spells it). The story: one agent makes you wait; with symcc the owner asks the lead for a feature, the lead splits it into tasks, and workers build them side by side; every change leaves holes, scouts find them and turn them into tasks, and workers close them; every task page keeps where its change came from.

Each scene has the narration, what the picture shows, and the caption: the burned-in caption is the spoken sentence, and the **Caption** line names the one word per sentence shown in red (in order, separated by " / "; "-" for none). The examples are real tasks from this project's own board: the owner's "investigation tasks" feature (T-253, split into T-253, T-257 and T-258), the workers that ran beside it (T-256, which failed its tests six times and passed on try 7, and T-259), and the holes the scouts found in it afterwards (T-263, T-264, and T-266, a hole left by T-264's own fix).

## Scene 1: Of the Lone Hand

**Narration:**
One coding agent does one thing at a time. You ask, and you wait.

**On screen:** A drop capital "O" and "ne agent, one task." A single robot works on one note; a column of grey notes waits its turn beside it, and a big hourglass runs. "you wait ..." in italic. The robot looks worried.

**Caption:** one / wait

## Scene 2: Of the Owner's Word

**Narration:**
With symcc, you ask the lead in your chat. Here the owner wanted tasks that only investigate, with nothing to merge.

**On screen:** A chat scroll: the owner's own words for T-253 ("today all tasks are the same in the sense that they require merge at the end, but sometimes there are exploratory like tasks ..."), and the lead's answer "Added T-253: investigation tasks". Below, the feature as one big note with the owner's seal.

**Caption:** lead / investigate

## Scene 3: Of the Many Hands

**Narration:**
The lead chops the feature into small tasks, and ties their order with red threads. Several workers build side by side, each in its own copy. Tests must pass before each merge. One task failed its tests six times, and passed on the seventh try.

**On screen:** The feature note splits into three: T-253 (1 of 3, the new kind), T-257 (2 of 3, the Answer section and its buttons), T-258 (3 of 3, stats, rules and docs), tied by red threads "after T-253" and "after T-257". Then three workers side by side, each with its own folder: T-253, T-256 and T-259. T-253 and T-259 get "PASSED"; T-256 gets a red X six times ("try 1" to "try 6: tests failed"), then "try 7" and "PASSED".

**Caption:** chops / side / pass / seventh

## Scene 4: Of the Holes

**Narration:**
But every change, even a good one, leaves small holes. The new investigation tasks could lose a question, or delete earlier work. Even a fix can open a new gap.

**On screen:** The merged feature notes on the page; cracks open where the new code went in. Red ink notes at the cracks: "Ask more could lose its own question" and "Done could delete work from earlier tries". Then the fix (T-264) is merged and a new crack runs from it: "a refused change could still wipe a folder".

**Caption:** holes / delete / gap

## Scene 5: Of the Scouts

**Narration:**
That is why symcc has scouts. They wake on timers, read what changed, and find the holes. Each finding becomes a task on the board, marked with the scout's name.

**On screen:** Three scout seals with hourglasses and magnifiers (test-gaps, gaps-bot, recent-changes). Each finding becomes a pinned task note tied to its scout by a thread: T-263 found by test-gaps, T-264 found by gaps-bot, T-266 found by recent-changes.

**Caption:** scouts / changed / name

## Scene 6: All Hands Again

**Narration:**
Those tasks go to workers like any other. Build, test, merge. The cracks close, one by one.

**On screen:** Three workers build T-263, T-264 and T-266 side by side; each gets "PASSED" and a tick. The cracks heal with gold one by one. The numbers from this project's board: 275 tasks done, 65 of them found by scouts (as of 16 November 2026).

**Caption:** workers / merge / close

## Scene 7: The Book Kept

**Narration:**
Every task page shows where it came from, its tries and its report. Nothing is lost.

**On screen:** T-264's page as an unrolled scroll: what, why, files, from (scout gaps-bot, in the feature from the owner's words, T-253), tries, the worker's report. The four kinds of origin seal: the owner's words, a scout, a worker's report, the lead.

**Caption:** came / lost

## Scene 8: Many agents, one board

**Narration:**
symcc. Many agents, one board.

**On screen:** A banner with "symcc", trumpets on both sides, "many agents, one board" and the repository link. The robot cheers.

**Caption:** - / board

---

## Title

symcc: one feature, many workers, and the scouts that find the holes

## Description

One coding agent does one thing at a time. With symcc you ask the lead for a feature in your normal chat; it splits the feature into small tasks, sets their order, and several workers build them side by side, each in its own copy, merged only when the tests pass. Every change leaves small holes, so scouts wake on timers, read what changed, and turn what they find into tasks for the workers. Every task page shows where its change came from, its tries and its report. https://github.com/kourgeorge/symcc
