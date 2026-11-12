# The README demo (docs/demo.svg)

`docs/demo.svg` is the short animation at the top of the README. It is one SVG file with
SMIL animation only: no JavaScript, no outside fonts or images, so GitHub plays it inside
an `<img>` tag. It loops every 58 seconds and is 900x520.

## What it shows

The message: with agents, one developer directs a team with many tasks at once. symcc
keeps that organized and supervised (one board, you see everything, you approve every
merge), and the agents are proactive (workers build on their own, scouts find the next job).

| Time (s) | Caption | What happens |
|---|---|---|
| 0–4 | (opening card) | "You direct the team now." Many tasks at once, on one board; workers build them, scouts find the next job; you see everything and approve every merge |
| 4–8.5 | 1/10 You direct: just say what you want | You type "add a search command, and make the errors friendlier" |
| 8.5–12.5 | 2/10 The lead plans small tasks on one board | T-1, T-2 (after T-1), T-3 appear on the board as `todo` |
| 12.5–17.5 | 3/10 Workers run in parallel, each in its own copy | T-1 and T-3 go to `doing`, each with `.symcc/worktrees/T-…` and branch `symcc/T-…` |
| 17.5–21.5 | 4/10 Every change is checked and tested | T-1: only its own files, tests pass; it moves to `review` |
| 21.5–26 | 5/10 You see everything | The panel opens T-1: files with `+`/`-` counts and a few diff lines |
| 26–31 | 6/10 You approve every merge | "approve T-1"; T-1 is `done` ("merged into main"), T-2 starts |
| 31–37 | 7/10 Proactive: a scout wakes up on its timer | The Scouts tab: scout `tests`, `every 30 min`, goes from `due now` to `running`; its page opens; in the chat it reads `src/search.ts` and runs `npm test -- --coverage` |
| 37–41.5 | 8/10 It finds work and reports to the lead | Its last report: "`src/search.ts:42` has no tests"; it reports to the lead, and the lead adds T-4 |
| 41.5–48 | 9/10 The lead adds a task, a worker does it | Back on the Tasks tab: T-4 `todo` ("from scout "tests""), then `doing` in `.symcc/worktrees/T-4`, tests pass, `review` |
| 48–52.5 | 10/10 You approve, it is merged | "approve T-4"; T-4 is `done` ("merged into main") |
| 52.5–58 | (end card) | "symcc: many agents, one board. Organized, supervised, proactive." |

The status line, the banner and the Scouts view use the plugin's real text (see
`statusLine`, `modeLabel`, `bannerLines` and `scoutRow` in `hooks/core/`, and the Scouts
view in `hooks/plugin/ui/scouts-page.tsx`), e.g. `⏸ review merge · T-1, T-3 doing · 1 to do`. The banner
counts and the status line are worked out from the `tasks` list in the script, so they always
match the board.

## How to change it

Don't edit the SVG by hand; change the script below and run it again. Every piece of the
picture is shown during time windows `[start, end]` in seconds (`show(...)`), and typed
text uses `typed(...)`. Change the words, the times, or `T` (the loop length).

From the project folder:

```bash
mkdir -p /tmp/symcc-demo
sed -n '/^```js$/,/^```$/p' docs/demo.md | sed '1d;$d' > /tmp/symcc-demo/gen.js
node /tmp/symcc-demo/gen.js > docs/demo.svg
xmllint --noout docs/demo.svg
```

Then open `docs/demo.svg` in a browser to watch it.

## The script

```js
// Every element is shown in time windows [start, end] (seconds) inside one loop of T seconds.
const T = 58
const W = 900, H = 520
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace"
const CW = 7.8 // width of one character at 13px
const C = {
  bg: '#0d1117', bar: '#161b22', line: '#30363d', text: '#e6edf3', dim: '#8b949e',
  accent: '#d97757', green: '#3fb950', red: '#f85149', cyan: '#39c5cf', user: '#1c2128',
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const r3 = n => Math.round(n * 1000) / 1000

// The parts of the loop: the opening card, the first story (you ask, it is built and merged),
// the scouts story (a scout finds work, it is built and merged), the end card.
const OPEN_END = 4, PART1_END = 31, PART2_END = 52.5

/** An opacity animation that shows an element during the windows `ws`, fading in and out. */
function fade(ws, f = 0.25) {
  const pts = []
  for (const [a, b] of ws) {
    if (a <= 0) pts.push([0, 1]); else pts.push([a, 0], [Math.min(a + f, b), 1])
    if (b >= T) pts.push([T, 1]); else pts.push([Math.max(b - f, a), 1], [b, 0])
  }
  if (pts[0][0] > 0) pts.unshift([0, 0])
  if (pts[pts.length - 1][0] < T) pts.push([T, 0])
  for (let i = 1; i < pts.length; i++) if (pts[i][0] <= pts[i - 1][0]) pts[i][0] = pts[i - 1][0] + 0.001
  return `<animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="${pts.map(p => p[1]).join(';')}" keyTimes="${pts.map(p => r3(Math.min(p[0], T) / T)).join(';')}"/>`
}
/** A group shown during the windows `ws`. */
const show = (ws, inner) => `<g opacity="0">${fade(ws)}${inner}</g>`

/** Text: parts are [text, color, bold?]; anchor 'end' for right-aligned. */
function text(x, y, parts, o = {}) {
  if (typeof parts === 'string') parts = [[parts, o.fill || C.text]]
  const spans = parts.map(([s, fill, bold]) => `<tspan fill="${fill}"${bold ? ' font-weight="bold"' : ''}>${esc(s)}</tspan>`).join('')
  return `<text xml:space="preserve" x="${x}" y="${y}" font-size="${o.size || 13}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.clip ? ` clip-path="url(#${o.clip})"` : ''}>${spans}</text>`
}

let clips = 0
const defs = []
/** Text typed one character at a time between a and b (it stays until the loop ends). */
function typed(x, y, prefix, s, a, b, color = C.text) {
  const id = `type${++clips}`
  const n = s.length
  const vals = [0], keys = [0]
  for (let k = 1; k <= n; k++) { vals.push(r3((prefix.length + k) * CW + 2)); keys.push(r3((a + (k - 1) * (b - a) / n) / T)) }
  vals.push(W); keys.push(r3(b / T + 0.002))
  vals[0] = r3(prefix.length * CW + 2)
  defs.push(`<clipPath id="${id}"><rect x="${x}" y="${y - 14}" height="20" width="${vals[0]}"><animate attributeName="width" dur="${T}s" repeatCount="indefinite" calcMode="discrete" values="${vals.join(';')}" keyTimes="${keys.join(';')}"/></rect></clipPath>`)
  return text(x, y, [[prefix, C.accent, true], [s, color]], { clip: id })
}

const out = []
const push = s => out.push(s)

// ---------- the window ----------
push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>`)
push(`<path d="M0.5 30 V10.5 a10 10 0 0 1 10 -10 H${W - 10.5} a10 10 0 0 1 10 10 V30 Z" fill="${C.bar}"/>`)
push(`<circle cx="18" cy="15" r="5.5" fill="#ff5f57"/><circle cx="36" cy="15" r="5.5" fill="#febc2e"/><circle cx="54" cy="15" r="5.5" fill="#28c840"/>`)
push(text(W / 2, 20, 'claude · ~/my-app', { fill: C.dim, anchor: 'middle' }))
push(`<line x1="0" y1="74" x2="${W}" y2="74" stroke="${C.line}"/>`)
push(`<line x1="482" y1="84" x2="482" y2="466" stroke="${C.line}"/>`)

// ---------- scene captions ----------
const scenes = [
  [4, 8.5, 'You direct: just say what you want'],
  [8.5, 12.5, 'The lead plans small tasks on one board'],
  [12.5, 17.5, 'Workers run in parallel, each in its own copy'],
  [17.5, 21.5, 'Every change is checked and tested'],
  [21.5, 26, 'You see everything'],
  [26, 31, 'You approve every merge'],
  [31, 37, 'Proactive: a scout wakes up on its timer'],
  [37, 41.5, 'It finds work and reports to the lead'],
  [41.5, 48, 'The lead adds a task, a worker does it'],
  [48, 52.5, 'You approve, it is merged'],
]
scenes.forEach(([a, b, s], i) => push(show([[a, b]], text(W / 2, 58, [[`${i + 1}/${scenes.length}  `, C.accent, true], [s, C.text, true]], { size: 17, anchor: 'middle' }))))

// ---------- the chat (left) ----------
const LX = 24
const say = (y, a, end, s, cont = false) => show([[a, end]], text(LX, y, cont ? [['  ' + s, C.text]] : [['● ', C.green], [s, C.text]]))
const you = (y, a, end, s, t0, t1) => show([[a, end]], `<rect x="16" y="${y - 14}" width="458" height="20" rx="4" fill="${C.user}"/>` + typed(LX, y, '> ', s, t0, t1))
const ok = (y, a, end, id) => show([[a, end]], text(LX, y, [['● ', C.green], [`${id}: only its own files `, C.text], ['✓', C.green], ['  tests pass ', C.text], ['✓', C.green]]))
// the first story
const lead = (y, a, s, cont) => say(y, a, PART1_END, s, cont)
push(you(102, OPEN_END, PART1_END, 'add a search command, and make the errors friendlier', 4.5, 7.5))
push(lead(130, 8.9, 'Three tasks on the board:'))
push(lead(149, 9.4, 'T-1 the search index', true))
push(lead(168, 9.9, 'T-2 the search command (after T-1)', true))
push(lead(187, 10.4, 'T-3 friendlier errors', true))
push(lead(215, 12.9, 'T-1 and T-3 start now, each in its own copy.'))
push(ok(243, 17.9, PART1_END, 'T-1'))
push(lead(262, 18.8, 'T-1 is ready for review.', true))
push(lead(290, 22, 'T-1 changed 3 files (+86 -1), see the board.'))
push(you(318, 26.1, PART1_END, 'approve T-1', 26.3, 27.1))
push(lead(346, 27.6, 'T-1 merged into main. T-2 starts now.'))
// the scouts story (the chat has moved on)
const step = (y, a, s) => show([[a, PART2_END]], text(LX, y, [['  ⎿ ', C.dim], [s, C.dim]]))
const lead2 = (y, a, s, cont) => say(y, a, PART2_END, s, cont)
push(show([[31.8, PART2_END]], text(LX, 102, [['● ', C.accent], ['Scout "tests" woke up on its timer (every 30 min)', C.text]])))
push(step(121, 32.6, 'Read src/search.ts'))
push(step(140, 33.6, 'Bash npm test -- --coverage'))
push(step(159, 34.8, 'line 42 of src/search.ts never runs in a test'))
push(lead2(187, 37.3, 'Scout "tests" reports:'))
push(show([[37.3, PART2_END]], text(LX, 206, [['  ', C.text], ['src/search.ts:42', C.accent], [' has no tests.', C.text]])))
push(lead2(234, 39.6, 'Worth doing. I added T-4 to the board:'))
push(lead2(253, 39.6, 'tests for search() with an empty query.', true))
push(lead2(281, 43.2, 'T-4 starts now, in .symcc/worktrees/T-4.'))
push(ok(309, 45.2, PART2_END, 'T-4'))
push(lead2(328, 46.4, 'T-4 is ready for review.', true))
push(you(356, 47.9, PART2_END, 'approve T-4', 48.2, 48.9))
push(lead2(384, 49.6, 'T-4 merged into main. A scout found it,'))
push(lead2(403, 49.6, 'a worker did it, you approved it.', true))

// ---------- the board panel (right) ----------
const PX = 504
push(`<rect x="492" y="84" width="392" height="382" rx="6" fill="#0b0e13" stroke="${C.line}"/>`)
;['  ╭╮ ', '╭─┼╯ ', '╰─┼─╯', ' ╰╯  '].forEach((l, i) => push(`<text x="${PX}" y="${104 + i * 14}" font-size="14" fill="${C.accent}" xml:space="preserve">${esc(l)}</text>`))
push(text(552, 104, [['symcc board', C.accent, true], [' · my-app', C.text]], { size: 14 }))
push(text(552, 122, '~/my-app · main · this session drives', { fill: C.dim }))
push(text(552, 140, 'tests: npm test · 3 at once · 45 min', { fill: C.dim }))

// The tasks, and when each one changes state. The counts line in the banner and the status
// line are worked out from this, the same way the plugin does (statusCounts, statusLine).
const tasks = [
  { id: 'T-1', title: 'the search index', y: 230, states: [[9.4, 'todo'], [12.9, 'doing'], [18.8, 'review'], [27.6, 'done']],
    subs: [[12.9, 17.9, '.symcc/worktrees/T-1 · branch symcc/T-1'], [17.9, 27.6, '✓ only its own files · ✓ tests pass', C.green], [27.6, PART2_END, '✓ merged into main', C.green]] },
  { id: 'T-2', title: 'the search command', y: 268, states: [[9.9, 'todo'], [28.2, 'doing']],
    subs: [[9.9, 28.2, 'after T-1'], [28.2, PART2_END, '.symcc/worktrees/T-2 · branch symcc/T-2']] },
  { id: 'T-3', title: 'friendlier errors', y: 306, states: [[10.4, 'todo'], [12.9, 'doing']],
    subs: [[12.9, PART2_END, '.symcc/worktrees/T-3 · branch symcc/T-3']] },
  { id: 'T-4', title: 'tests for search edge cases', y: 344, states: [[39.6, 'todo'], [43.2, 'doing'], [46.4, 'review'], [49.6, 'done']],
    subs: [[39.6, 43.2, 'from scout "tests"', C.accent], [43.2, 45.2, '.symcc/worktrees/T-4 · branch symcc/T-4'], [45.2, 49.6, '✓ only its own files · ✓ tests pass', C.green], [49.6, PART2_END, '✓ merged into main', C.green]] },
]
const WORD = { review: 'ready for review', doing: 'doing', todo: 'to do', done: 'done' }
const stateAt = (t, x) => { let s = null; for (const [a, st] of t.states) if (a <= x) s = st; return s }
const marks = [...new Set([0, ...tasks.flatMap(t => t.states.map(s => s[0])), PART2_END])].sort((a, b) => a - b)
for (let i = 0; i + 1 < marks.length; i++) {
  const [a, b] = [marks[i], marks[i + 1]]
  const on = tasks.map(t => ({ id: t.id, st: stateAt(t, a) })).filter(t => t.st)
  const ids = st => on.filter(t => t.st === st).map(t => t.id)
  const n = st => ids(st).length
  // the banner's counts line
  const counts = ['doing', 'review', 'todo', 'done'].filter(n).map(st => `${n(st)} ${WORD[st]}`).join(' · ')
  if (counts) push(show([[a, b]], text(PX, 172, counts, { fill: C.dim })))
  // the status line
  const parts = [n('doing') && `${ids('doing').join(', ')} doing`, n('review') && `${n('review')} to review (${ids('review').join(', ')})`, n('todo') && `${n('todo')} to do`].filter(Boolean)
  if (on.length && !parts.length) parts.push('all done')
  push(show([[a, b]], text(LX, 500, [['symcc: ', C.dim], ['⏸ review merge', C.accent], ...parts.map(p => [' · ' + p, C.text])])))
}

// tabs
const scoutsTab = [[31, 41]], tasksTab = [[OPEN_END, 31], [41, PART2_END]]
const tab = (on) => text(PX, 196, [['Tasks', on ? C.text : C.dim, on], ['   ', C.dim], ['Scouts', on ? C.dim : C.text, !on]])
push(show(tasksTab, tab(true) + `<rect x="${PX}" y="200" width="${5 * CW}" height="2" fill="${C.accent}"/>`))
push(show(scoutsTab, tab(false) + `<rect x="${PX + 8 * CW}" y="200" width="${6 * CW}" height="2" fill="${C.accent}"/>`))
push(`<line x1="496" y1="208" x2="880" y2="208" stroke="${C.line}"/>`)

// the task list
const badge = { todo: C.text, doing: C.green, review: C.cyan, done: C.dim }
function row(t) {
  let g = text(PX, t.y, [[t.id, C.text, true], ['  ' + t.title, C.text]])
  t.states.forEach(([a, st], i) => {
    const b = i + 1 < t.states.length ? t.states[i + 1][0] : PART2_END
    const blink = st === 'doing' ? `<animate attributeName="fill-opacity" dur="1.2s" repeatCount="indefinite" values="1;0.25;1"/>` : ''
    g += show([[a, b]], `<text x="872" y="${t.y}" font-size="13" text-anchor="end" fill="${badge[st]}"><tspan>●${blink}</tspan> ${st}</text>`)
  })
  for (const [a, b, s, color] of t.subs) g += show([[a, b]], text(546, t.y + 17, s, { fill: color || C.dim }))
  return show([[t.states[0][0], PART2_END]], g)
}
push(show([[OPEN_END, 21.5], [27.6, 31], [41, PART2_END]], tasks.map(row).join('')))
push(show([[OPEN_END, 9.4]], text(PX, 230, 'The board is empty.', { fill: C.dim })))

// the open task (scene 5)
const diffLine = (y, s, color, bg) => `<rect x="500" y="${y - 13}" width="376" height="18" fill="${bg}"/>` + text(PX, y, s, { fill: color })
push(show([[21.5, 27.6]], [
  text(PX, 230, [['T-1', C.text, true], ['  the search index', C.text]]),
  text(872, 230, [['● review', C.cyan]], { anchor: 'end' }),
  text(PX, 248, 'ready for review · branch symcc/T-1', { fill: C.dim }),
  text(PX, 274, 'Files changed', { fill: C.text }),
  text(PX + 16, 292, 'src/search.ts', { fill: C.text }), text(872, 292, [['+58 ', C.green], ['-0', C.red]], { anchor: 'end' }),
  text(PX + 16, 310, 'src/cli.ts', { fill: C.text }), text(872, 310, [['+4 ', C.green], ['-1', C.red]], { anchor: 'end' }),
  text(PX + 16, 328, 'tests/search.test.ts', { fill: C.text }), text(872, 328, [['+24 ', C.green], ['-0', C.red]], { anchor: 'end' }),
  `<rect x="500" y="338" width="376" height="86" rx="4" fill="${C.bar}"/>`,
  text(PX, 354, 'src/cli.ts  @@ -12,3 +12,6 @@', { fill: C.dim }),
  diffLine(374, "-  throw new Error('bad input')", C.red, '#3d1d20'),
  diffLine(394, '+  const hits = search(index, query)', C.green, '#12301b'),
  diffLine(414, '+  printHits(hits)', C.green, '#12301b'),
  show([[26.6, 27.6]], `<rect x="${PX - 3}" y="439" width="${11 * CW + 6}" height="19" rx="3" fill="${C.accent}"/>`),
  text(PX, 452, [['[a] approve', C.text, true], ['  [x] reject  [d] changes  [b] back', C.dim]]),
].join('')))

// the Scouts view: first the list (the scout wakes up), then the scout's page (its work and report)
const SCOUT_LIST = [31, 33.6], SCOUT_PAGE = [33.6, 41]
const scoutRow = (y, name, every, state, ran, color) => text(PX, y, [[name.padEnd(5), C.accent, true], [' ' + every.padEnd(12), C.dim], [' · ', C.dim], [state, color], [' · ' + ran, C.dim]])
push(show([SCOUT_LIST], [
  text(PX, 230, 'Enter opens · t tasks · s scouts · Esc closes', { fill: C.dim }),
  `<rect x="${PX - 4}" y="246" width="376" height="20" rx="3" fill="${C.user}"/>`,
  show([[31, 31.8]], scoutRow(260, 'tests', 'every 30 min', 'due now', 'ran 30m ago', C.text)),
  show([[31.8, 33.6]], scoutRow(260, 'tests', 'every 30 min', 'running', 'ran 30m ago', C.green)),
  scoutRow(282, 'deps', 'every hour', 'next in 41m', 'ran 19m ago', C.text),
].join('')))
const RUN_END = 37.3 // the scout finishes and reports
push(show([SCOUT_PAGE], [
  show([[33.6, RUN_END]], text(PX, 230, [['tests ', C.accent, true], ['▶ running', C.green, true], [' · every 30 min · ran 30m ago', C.dim]])),
  show([[RUN_END, 41]], text(PX, 230, [['tests ', C.accent, true], ['next in 30m', C.text, true], [' · every 30 min · ran 5s ago', C.dim]])),
  text(PX, 248, 'Find code that has no tests.', { fill: C.text }),
  text(PX, 274, [['[b] Back', C.text], ['  [r] Run now  [e] Edit', C.dim]]),
  text(PX, 302, 'What it looks for', { fill: C.text }),
  text(PX, 320, 'Find code that has no tests. Run the', { fill: C.dim }),
  text(PX, 338, 'tests with coverage and report the', { fill: C.dim }),
  text(PX, 356, 'riskiest gap, with file:line.', { fill: C.dim }),
  text(PX, 384, 'Last report', { fill: C.text }),
  show([[33.6, RUN_END]], text(PX, 402, 'nothing found', { fill: C.dim })),
  show([[RUN_END, 41]], `<rect x="500" y="389" width="376" height="62" rx="4" fill="${C.bar}"/>` + [
    text(PX, 405, [['src/search.ts:42', C.accent], [' has no tests:', C.text]]),
    text(PX, 423, 'search() with an empty query returns', { fill: C.text }),
    text(PX, 441, 'nothing, and no test covers it.', { fill: C.text }),
  ].join('')),
].join('')))

// ---------- the status line (bottom) ----------
push(`<rect x="0.5" y="474" width="${W - 1}" height="1" fill="${C.line}"/>`)
push(text(876, 500, 'board: /symcc', { fill: C.dim, anchor: 'end' }))

// ---------- the cards ----------
const card = (ws, lines) => show(ws, [
  `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>`,
  ...['  ╭╮ ', '╭─┼╯ ', '╰─┼─╯', ' ╰╯  '].map((l, i) => `<text x="${W / 2 - 45}" y="${110 + i * 30}" font-size="30" fill="${C.accent}" xml:space="preserve">${esc(l)}</text>`),
  ...lines,
].join(''))
// opening card
push(card([[0, OPEN_END]], [
  text(W / 2, 270, 'You direct the team now.', { size: 30, anchor: 'middle', fill: C.text }),
  text(W / 2, 315, 'Many tasks at once, on one board.', { size: 17, anchor: 'middle', fill: C.text }),
  text(W / 2, 343, 'Workers build them. Scouts find the next job.', { size: 17, anchor: 'middle', fill: C.text }),
  text(W / 2, 371, 'You see everything and approve every merge.', { size: 17, anchor: 'middle', fill: C.accent }),
]))
// end card
push(card([[PART2_END, T]], [
  text(W / 2, 270, [['symcc', C.accent, true], [': many agents, one board.', C.text, true]], { size: 28, anchor: 'middle' }),
  text(W / 2, 312, 'Organized, supervised, proactive.', { size: 20, anchor: 'middle', fill: C.text }),
  text(W / 2, 352, 'You see everything and approve every merge.', { size: 16, anchor: 'middle', fill: C.dim }),
  text(W / 2, 377, 'Scouts find work, workers do it.', { size: 16, anchor: 'middle', fill: C.dim }),
  text(W / 2, 425, 'claude --plugin-dir /path/to/symcc', { size: 14, anchor: 'middle', fill: C.dim }),
]))

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-label="symcc demo: you are the owner. You talk to the lead, it plans tasks, workers build them in parallel in their own copies, checks and tests run, you see the change and approve it, and it merges. Then a scout wakes up on its timer, finds code without tests and reports it; the lead adds a task, a worker does it, you approve it and it is merged.">
<title>symcc demo</title>
<defs>${defs.join('')}</defs>
${out.join('\n')}
</svg>
`)
```
