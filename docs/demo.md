# The README demo (docs/demo.svg)

`docs/demo.svg` is the short animation at the top of the README. It is one SVG file with
SMIL animation only: no JavaScript, no outside fonts or images, so GitHub plays it inside
an `<img>` tag. It loops every 41 seconds and is 900x520.

## What it shows

| Time (s) | Caption | What happens |
|---|---|---|
| 0–4.5 | 1/7 You talk to the lead | You type "add a search command, and make the errors friendlier" |
| 4.5–9 | 2/7 The lead plans tasks | T-1, T-2 (after T-1), T-3 appear on the board as `todo` |
| 9–15 | 3/7 Workers run in parallel, each in its own copy | T-1 and T-3 go to `doing`, each with `.symcc/worktrees/T-…` and branch `symcc/T-…` |
| 15–20 | 4/7 Checks and tests | T-1: only its own files, tests pass; it moves to `review` |
| 20–25.5 | 5/7 You see the change | The panel opens T-1: files with `+`/`-` counts and a few diff lines |
| 25.5–31 | 6/7 You approve, it merges | "approve T-1"; T-1 is `done` ("merged into main"), T-2 starts |
| 31–36.5 | 7/7 Scouts look ahead | The Scouts tab: scout "tests" reports risky code in `src/search.ts:42`; the lead adds T-4 |
| 36.5–41 | (end card) | "symcc — one chat, a whole team." |

The status line uses the plugin's real text (see `statusLine` and `modeLabel` in
`hooks/board.ts`), e.g. `⏸ review merge · T-1, T-3 doing · 1 to do`.

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
const T = 41
const W = 900, H = 520
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace"
const CW = 7.8 // width of one character at 13px
const C = {
  bg: '#0d1117', bar: '#161b22', line: '#30363d', text: '#e6edf3', dim: '#8b949e',
  accent: '#d97757', green: '#3fb950', red: '#f85149', cyan: '#39c5cf', user: '#1c2128',
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const r3 = n => Math.round(n * 1000) / 1000

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
  [0, 4.5, 'You talk to the lead'],
  [4.5, 9, 'The lead plans tasks'],
  [9, 15, 'Workers run in parallel, each in its own copy'],
  [15, 20, 'Checks and tests'],
  [20, 25.5, 'You see the change'],
  [25.5, 31, 'You approve, it merges'],
  [31, 36.5, 'Scouts look ahead'],
]
scenes.forEach(([a, b, s], i) => push(show([[a, b]], text(W / 2, 58, [[`${i + 1}/7  `, C.accent, true], [s, C.text, true]], { size: 17, anchor: 'middle' }))))

// ---------- the chat (left) ----------
const LX = 24
const lead = (y, a, s, cont = false) => show([[a, 36.5]], text(LX, y, cont ? [['  ' + s, C.text]] : [['● ', C.green], [s, C.text]]))
push(show([[0, 36.5]], `<rect x="16" y="88" width="458" height="20" rx="4" fill="${C.user}"/>` + typed(LX, 102, '> ', 'add a search command, and make the errors friendlier', 0.6, 3.6)))
push(lead(130, 5.0, 'Three tasks on the board:'))
push(lead(149, 5.6, 'T-1 the search index', true))
push(lead(168, 6.2, 'T-2 the search command (after T-1)', true))
push(lead(187, 6.8, 'T-3 friendlier errors', true))
push(lead(215, 9.4, 'T-1 and T-3 start now, each in its own copy.'))
push(show([[15.5, 36.5]], text(LX, 243, [['● ', C.green], ['T-1: only its own files ', C.text], ['✓', C.green], ['  tests pass ', C.text], ['✓', C.green]])))
push(lead(262, 16.5, 'T-1 is ready for review.', true))
push(lead(290, 20.5, 'T-1 changed 3 files (+86 -1), see the board.'))
push(show([[25.6, 36.5]], `<rect x="16" y="304" width="458" height="20" rx="4" fill="${C.user}"/>` + typed(LX, 318, '> ', 'approve T-1', 25.8, 26.8)))
push(lead(346, 27.4, 'T-1 merged into main. T-2 starts now.'))
push(lead(374, 31.6, 'Scout "tests": risky code without tests in'))
push(lead(393, 31.6, 'src/search.ts:42.', true))
push(lead(421, 34.5, 'Added T-4: tests for search edge cases.'))

// ---------- the board panel (right) ----------
const PX = 504
push(`<rect x="492" y="84" width="392" height="382" rx="6" fill="#0b0e13" stroke="${C.line}"/>`)
;['  ╭╮ ', '╭─┼╯ ', '╰─┼─╯', ' ╰╯  '].forEach((l, i) => push(`<text x="${PX}" y="${104 + i * 14}" font-size="14" fill="${C.accent}" xml:space="preserve">${esc(l)}</text>`))
push(text(552, 104, [['symcc board', C.accent, true], [' · my-app', C.text]], { size: 14 }))
push(text(552, 122, '~/my-app · main · this session drives', { fill: C.dim }))
push(text(552, 140, 'tests: npm test · 3 at once · 45 min', { fill: C.dim }))
const counts = [
  [4.5, 9, '3 to do'], [9, 15, '2 doing · 1 to do'], [15, 27.2, '1 doing · 1 ready for review · 1 to do'],
  [27.2, 34.5, '2 doing · 1 done'], [34.5, 36.5, '2 doing · 1 to do · 1 done'],
]
counts.forEach(([a, b, s]) => push(show([[a, b]], text(PX, 172, s, { fill: C.dim }))))
// tabs
const tasksTab = [[0, 31], [34.5, 36.5]], scoutsTab = [[31, 34.5]]
const tab = (on) => text(PX, 196, [['Tasks', on ? C.text : C.dim, on], ['   ', C.dim], ['Scouts', on ? C.dim : C.text, !on]])
push(show(tasksTab, tab(true) + `<rect x="${PX}" y="200" width="${5 * CW}" height="2" fill="${C.accent}"/>`))
push(show(scoutsTab, tab(false) + `<rect x="${PX + 8 * CW}" y="200" width="${6 * CW}" height="2" fill="${C.accent}"/>`))
push(`<line x1="496" y1="208" x2="880" y2="208" stroke="${C.line}"/>`)

// the task list
const badge = { todo: C.text, doing: C.green, review: C.cyan, done: C.dim }
function row(y, id, title, states, subs, appear) {
  let g = text(PX, y, [[id, C.text, true], ['  ' + title, C.text]])
  for (const [a, b, st] of states) {
    const blink = st === 'doing' ? `<animate attributeName="fill-opacity" dur="1.2s" repeatCount="indefinite" values="1;0.25;1"/>` : ''
    g += show([[a, b]], `<text x="872" y="${y}" font-size="13" text-anchor="end" fill="${badge[st]}"><tspan>●${blink}</tspan> ${st}</text>`)
  }
  for (const [a, b, s, color] of subs) g += show([[a, b]], text(546, y + 17, s, { fill: color || C.dim }))
  return show([[appear, 36.5]], g)
}
const list = [[0, 20], [27.2, 31], [34.5, 36.5]]
push(show(list, [
  row(230, 'T-1', 'the search index',
    [[5.6, 9.4, 'todo'], [9.4, 16.5, 'doing'], [16.5, 27.2, 'review'], [27.2, 36.5, 'done']],
    [[9.4, 15.5, '.symcc/worktrees/T-1 · branch symcc/T-1'], [15.5, 27.2, '✓ only its own files · ✓ tests pass', C.green], [27.2, 36.5, '✓ merged into main', C.green]], 5.6),
  row(268, 'T-2', 'the search command',
    [[6.2, 27.8, 'todo'], [27.8, 36.5, 'doing']],
    [[6.2, 27.8, 'after T-1'], [27.8, 36.5, '.symcc/worktrees/T-2 · branch symcc/T-2']], 6.2),
  row(306, 'T-3', 'friendlier errors',
    [[6.8, 9.4, 'todo'], [9.4, 36.5, 'doing']],
    [[9.4, 36.5, '.symcc/worktrees/T-3 · branch symcc/T-3']], 6.8),
  row(344, 'T-4', 'tests for search edge cases',
    [[34.5, 36.5, 'todo']], [[34.5, 36.5, 'from scout "tests"', C.accent]], 34.5),
].join('')))

push(show([[0, 5.6]], text(PX, 230, 'The board is empty.', { fill: C.dim })))

// the open task (scene 5)
const diffLine = (y, s, color, bg) => `<rect x="500" y="${y - 13}" width="376" height="18" fill="${bg}"/>` + text(PX, y, s, { fill: color })
push(show([[20, 27.2]], [
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
  show([[26.1, 27.2]], `<rect x="${PX - 3}" y="439" width="${11 * CW + 6}" height="19" rx="3" fill="${C.accent}"/>`),
  text(PX, 452, [['[a] approve', C.text, true], ['  [x] reject  [d] changes  [b] back', C.dim]]),
].join('')))

// the scouts view (scene 7)
push(show(scoutsTab, [
  text(PX, 230, [['tests', C.text, true]]), text(872, 230, 'every 30 min · sonnet', { fill: C.dim, anchor: 'end' }),
  text(PX, 248, 'ran just now · next in 30 min', { fill: C.dim }),
  text(PX, 274, 'Last report', { fill: C.text }),
  `<rect x="500" y="282" width="376" height="80" rx="4" fill="${C.bar}"/>`,
  text(PX, 300, 'risky code without tests in', { fill: C.text }),
  text(PX, 318, [['src/search.ts:42', C.accent], [': search() returns', C.text]]),
  text(PX, 336, 'nothing for an empty query, and no', { fill: C.text }),
  text(PX, 354, 'test covers it.', { fill: C.text }),
  text(PX, 390, [['deps', C.text, true]]), text(872, 390, 'every 60 min · sonnet', { fill: C.dim, anchor: 'end' }),
  text(PX, 408, 'next in 41 min', { fill: C.dim }),
].join('')))

// ---------- the status line (bottom) ----------
push(`<rect x="0.5" y="474" width="${W - 1}" height="1" fill="${C.line}"/>`)
const status = [
  [0, 4.5, []], [4.5, 9, ['3 to do']], [9, 15, ['T-1, T-3 doing', '1 to do']],
  [15, 27.2, ['T-3 doing', '1 to review (T-1)', '1 to do']], [27.2, 34.5, ['T-2, T-3 doing']],
  [34.5, 36.5, ['T-2, T-3 doing', '1 to do']],
]
status.forEach(([a, b, parts]) => push(show([[a, b]], text(LX, 500, [['symcc: ', C.dim], ['⏸ review merge', C.accent], ...parts.map(p => [' · ' + p, C.text])]))))
push(text(876, 500, 'board: /symcc', { fill: C.dim, anchor: 'end' }))

// ---------- the end card ----------
push(show([[36.5, T]], [
  `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>`,
  ...['  ╭╮ ', '╭─┼╯ ', '╰─┼─╯', ' ╰╯  '].map((l, i) => `<text x="${W / 2 - 45}" y="${150 + i * 30}" font-size="30" fill="${C.accent}" xml:space="preserve">${esc(l)}</text>`),
  text(W / 2, 300, [['symcc', C.accent, true], [' — one chat, a whole team.', C.text, true]], { size: 28, anchor: 'middle' }),
  text(W / 2, 342, 'Parallel work, no collisions, you approve every merge.', { size: 17, anchor: 'middle', fill: C.text }),
  text(W / 2, 392, 'claude --plugin-dir /path/to/symcc', { size: 14, anchor: 'middle', fill: C.dim }),
].join('')))

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-label="symcc demo: you talk to the lead, it plans tasks, workers build them in parallel in their own copies, checks and tests run, you see the change and approve it, it merges, and scouts suggest new work.">
<title>symcc demo</title>
<defs>${defs.join('')}</defs>
${out.join('\n')}
</svg>
`)
```
