// Used by tests/build-site.sh (T-749): checks the built home page and its hero demo.
//   bun tests/home-page-check.mjs <built folder> <repo folder>
// The home page has the playing hero (site/demo.js) with its 4 tabs and a still frame for no JS, the how-it-works
// strip, the feature cards, the comparison, the install commands, the FAQ, the final call to action, the nav links
// and the "Read more" list; it loads no outside script; demo.js plays every step of its story without an error.
// Prints one "FAIL: ..." line per problem and exits 1 if there were any.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [out, root] = process.argv.slice(2)
const fails = []
const bad = m => fails.push(m)
const page = readFileSync(join(out, 'index.html'), 'utf8')
const has = (text, what) => { if (!page.includes(text)) bad(`home page: no ${what} (${text})`) }

// the hero demo, its tabs (radio buttons + labels, so they work without JS) and its script
has('id="demo"', 'hero demo')
for (const [id, label] of [['v-chat', 'Chat + board'], ['v-live', 'Live tab'], ['v-task', 'Task page'], ['v-scouts', 'Scouts']]) {
  has(`id="${id}"`, `tab input ${id}`)
  has(`<label for="${id}">${label}</label>`, `tab "${label}"`)
}
has('<script src="demo.js"></script>', 'demo script')
has('class="demo-pause"', 'pause button')
for (const m of page.matchAll(/<script\b([^>]*)>/g)) {
  const src = /\bsrc="([^"]*)"/.exec(m[1])?.[1]
  if (!src) bad('home page: an inline <script>; the demo lives in demo.js')
  else if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) bad(`home page: an outside script: ${src}`)
}
if (/<link\b[^>]*href="(https?:)?\/\//.test(page)) bad('home page: an outside stylesheet or font')

// the still frame the build writes into each view box (what a reader without JS sees)
// a view's text runs to the next view box (the chat log holds <div>s of its own)
const view = name => new RegExp(`data-view="${name}" data-still>([\\s\\S]*?)(data-view=|</section>)`).exec(page)?.[1] ?? ''
const text = html => html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const board = text(view('board'))
for (const w of ['TASKS', 'BRANCHES', 'TODAY', 'work✧', 'check✧', 'queue', 'tests', 'merged', 'T-740', 'try 2/3', '⌕ × 1'])
  if (!board.includes(w)) bad(`still frame: the board has no "${w}"`)
// (T-760) the agent mark is ✧ (in the accent color), not ·, and the legend says what it means
if (/work·|check·/.test(board)) bad('still frame: the board still marks the agent stations with ·')
if (!board.includes('✧ = an agent works here (needs an agent slot)')) bad('still frame: the board has no ✧ legend')
if (!view('board').includes('<span class="t-mark">✧</span>')) bad('still frame: the ✧ marks are not drawn in the accent color')
if (!text(view('live')).includes('ORGANIZATIONAL MEMORY')) bad('still frame: the Live tab has no ▍Organizational memory')
// (T-810, T-915) each Live tab heading is "─── ❯ NAME" followed by a thin rule; the org-mem heading has the count and no bar
for (const h of ['TASKS', 'BRANCHES', 'TODAY', 'ORGANIZATIONAL MEMORY'])
  if (!new RegExp(`^─── ❯ ${h}( +60 / 60)? ─+$`, 'm').test(text(view('live')))) bad(`still frame: the Live tab's ${h} heading has no thin rule after it`)
if (/ORGANIZATIONAL MEMORY.*▕/.test(text(view('live')))) bad('still frame: the org-mem heading still has a bar')
const chat = text(view('chat'))
for (const w of ['❯ there is no clear visual separation between the sections of the live page, show some ideas', '⏺ Four looks', 'T-747 try 1 → checks passed', 'symcc: T-747 done', 'scout gaps-bot found'])
  if (!chat.includes(w)) bad(`still frame: the chat has no "${w}"`)
const task = text(view('task'))
for (const w of ['T-740', '▍History', '▍Runs', '‹ [Tasks]', '[Try 1] [● Try 2]', '▸ worker 12m', '⌕ checker 10m', 'try 1 → the checker found problems']) if (!task.includes(w)) bad(`still frame: the task page has no "${w}"`)
// the real figures from the board on 2026-11-21 (not guesses): the looks offered, the owner's pick, slots, today, org-mem
for (const w of ['1 Same heading for all', '2 Colored headings', '3 Boxes', '4 Side bar', '❯ 4'])
  if (!chat.includes(w)) bad(`still frame: the chat has no "${w}" (the real looks and pick)`)
if (chat.includes('❯ 2')) bad('still frame: the chat shows "❯ 2"; the owner picked look 4')
for (const w of ['agents 1/3 busy', '✓ 56 merged', '↺ 47 sent back', '✗ 0 failed', 'Σ ⌀ 530.1M', '39c7f96'])
  if (!board.includes(w)) bad(`still frame: the board has no "${w}" (the real board)`)
const live = text(view('live'))
// (T-758) ▍Today holds only the figures line: no "next up" line and no "today" label
for (const [name, t] of [['board', board], ['Live tab', live]]) {
  const after = t.slice(t.indexOf('\n', t.indexOf('TODAY'))).split('\n').map(l => l.trim()).filter(Boolean)
  // (T-938) its first row is "Now:" the mode line, then the figures line
  if (!after[0]?.startsWith('Now: ⏵ auto merge · agents ')) bad(`still frame: the ${name}'s ▍Today does not start with the "Now:" row ("${after[0] ?? ''}")`)
  if (!after[1]?.startsWith('✓ ')) bad(`still frame: the ${name}'s ▍Today has no figures line under the "Now:" row ("${after[1] ?? ''}")`)
  if (/next up {2}|today {4}/.test(t)) bad(`still frame: the ${name} still shows a "next up" or "today" label in ▍Today`)
}
// (T-754) the Live tab's sections come in the real order: ▍Tasks, ▍Today, ▍Branches, ▍Organizational memory
const order = ['TASKS', 'BRANCHES', 'TODAY', 'ORGANIZATIONAL MEMORY']
// (T-789) the section headings are plain UPPERCASE words: no ▍ bar on the Live tab, and an empty line under each
if (live.includes('▍') || board.includes('▍')) bad('still frame: the Live tab or the board still has a ▍ heading')
for (const h of order) for (const [name, t] of [['board', board], ['Live tab', live]]) {
  const ls = t.split('\n')
  // (T-915) each heading line starts with "─── ❯ ", so look for that before the name; a missing heading fails
  const i = ls.findIndex(l => l.startsWith(`─── ❯ ${h}`))
  if (i < 0 && (name === 'Live tab' || h !== 'ORGANIZATIONAL MEMORY')) bad(`still frame: the ${name} has no "─── ❯ ${h}" heading line`)
  if (i >= 0 && ls[i + 1]?.trim() !== '') bad(`still frame: the ${name}'s ${h} heading has no empty line under it`)
  if (i > 0 && ls[i - 1]?.trim() !== '' && h !== 'TASKS' && h !== 'NEEDS YOU') bad(`still frame: the ${name}'s ${h} heading has no empty line above it`)
}
for (const [name, t] of [['board', board], ['Live tab', live]]) {
  const at = order.map(h => t.indexOf(h)).filter(i => i >= 0)
  if (name === 'Live tab' && at.length < order.length) bad(`still frame: the Live tab is missing one of ${order.join(', ')}`)
  if (at.some((i, k) => k > 0 && i < at[k - 1])) bad(`still frame: the ${name}'s sections are not in the order ${order.join(', ')}`)
}
for (const w of ['60 / 60', 'tests 14', 'shell · guard 11', 'ui · surfaces 11', 'probes 8', 'engine · hosts 5', 'snapshots 5'])
  if (!live.includes(w)) bad(`still frame: the Live tab has no "${w}" (the real org-mem)`)
for (const w of ['16:28', '16:50', 'try 1: 22m · 4.0M tokens in all'])
  if (!task.includes(w)) bad(`still frame: the task page has no "${w}" (T-740's real try 1)`)
if (!text(view('scouts')).includes('gaps-bot')) bad('still frame: the scouts view has no gaps-bot')
// (T-757, T-867) T-740 on try 2: its lane shows the whole task's tokens (try 1's 4.0M, more coming) against the median
// tokens per merged task (268.6M / 56 = 4.8M, so 0.8×) and its time, no bar; the key line has no bar text
// (T-931, T-1010) the clock first, the kind at the right end: "try 2/3 · ⏱ 25m · ⌀ 4.0M + … (0.8×median)   bug"
if (!/try 2\/3 · ⏱ \d+m · ⌀ 4\.0M \+ … \(0\.8×median\).* bug\b/.test(board) || /bug try 2\/3/.test(board)) bad('still frame: T-740\'s lane does not show "try 2/3 · ⏱ … · ⌀ 4.0M + … (0.8×median)" with "bug" at the right end')
if (/▕[█░]+▏ ⌀/.test(board) || /▕[█░]+▏ ⌀/.test(page)) bad('still frame: a lane still has a token bar')
if (board.includes('usual per task')) bad('still frame: the key line still explains the bar')
// (T-757, T-867) the hand-drawn Live tab card tells the same story: whole-task tokens × the median, time, who spent them
if (/tokens of each try|T-740[\s\S]{0,80}tokens at hand-back/.test(page)) bad('home page: the Live tab card still shows tokens per try ("tokens at hand-back" on T-740\'s try 2)')
if (!page.includes('try 2/3 · ⏱ 22m · ⌀ 4.0M + … (0.8×median) · worker 2.6M · checker 1.4M · ⌕ × 1  bug')) bad('home page: the Live tab card\'s T-740 lane does not show "⏱ 22m · ⌀ 4.0M + … (0.8×median) · worker … · checker …"')
if (page.includes('usual per task')) bad('home page: the Live tab card still explains the bar')
// (T-767) the lines under a ▍heading start with 1 space; a running lane with "▶ ", its id in the accent color, its title normal text
for (const [name, t] of [['board', board], ['Live tab', live]]) {
  const lines = t.split('\n')
  if (!lines.some(l => l.startsWith(' ▶ T-740 '))) bad(`still frame: the ${name}'s T-740 lane does not start " ▶ T-740 "`)
  if (!lines.some(l => l.startsWith(' ✓ 56 merged'))) bad(`still frame: the ${name}'s ▍Today line is not indented by 1`)
  if (lines.some(l => /^ {3}[✓▶]/.test(l))) bad(`still frame: the ${name} still indents by 3 under a ▍heading`)
}
// (T-769, T-779) ▍Today in 4 lines: the figures; the real medians per task and agent work time (no cost);
// the bar with the scouts' share; then the hour sparkline with its labels and the figures (no cost)
for (const [name, t] of [['board', board], ['Live tab', live]]) {
  // (T-938) past the "Now:" row, the first line under the heading
  const after = t.slice(t.indexOf('\n', t.indexOf('TODAY'))).split('\n').filter(l => l.trim()).slice(1)
  if (!/^ ⌀ █{16} workers and checkers 90% · scouts 10% \(⌀ 54\.7M of 530\.1M\)$/.test(after[1] ?? '')) bad(`still frame: the ${name}'s ▍Today line 2 is not the bar alone with the scouts' share ("${after[1] ?? ''}")`)
  if (after[2] !== ' avg ⌀ 3M/task · 9m work · 41m start-to-merge   first try 34% · avg 2.4 tries/task   ⌕ 47 sent back by the checker' && !/^ avg ⌀ 3M\/task · 9m work · 41m start-to-merge   first try 34% · avg 2\.4 tries\/task   ⌕ \d+ sent back by the checker$/.test(after[2] ?? '')) bad(`still frame: the ${name}'s ▍Today line 3 does not show the real medians, first try and tries ("${after[2] ?? ''}")`)
  if (!/^ ⏱ 16h 56m agent work {3}⌀\/h 00▕▁{8}[▁▂▃▄▅▆▇█]+·{7}▏24$/.test(after[3] ?? '')) bad(`still frame: the ${name}'s ▍Today line 4 is not the agent work time then the hour sparkline with its labels at the end ("${after[3] ?? ''}")`)
}
if (/≈ \$/.test(live + board)) bad('still frame: ▍Today shows a "≈ $" figure')
for (const w of ['workers', 'scouts']) {
  if (!view('live').includes(`<span class="t-who-${w}">`)) bad(`still frame: the ${w}' bar part is not drawn in the t-who-${w} tone`)
  if (!new RegExp(`\\.t-who-${w}\\b`).test(readFileSync(join(out, 'style.css'), 'utf8'))) bad(`style.css: no .t-who-${w} rule`)
}
// (T-776, T-787) the band above the prompt: line 1 has no task id; each running task is on its own line
const band = text(view('band')).split('\n').filter(l => l.trim())
if (!band[0]?.startsWith('𝄞 symcc') || !band[0].includes('[ open board ]') || /T-\d+/.test(band[0])) bad(`still frame: the band's first line is not "𝄞 symcc ... [ open board ]" without a task id ("${band[0] ?? ''}")`)
if (!band.some(l => /^ [▶⌕] T-740 \d+m ↺\d After a reopen/.test(l))) bad('still frame: the band has no running-task line for T-740')
if (!/<span class="t-passed">\d+m ↺\d/.test(view('band'))) bad('still frame: the band\'s "Nm ↺N" is not green')
// (T-773) Live is the first tab
if (!live.startsWith('[l] Live │ [t] Tasks │ [s] Scouts │ [c] Settings')) bad('still frame: the tab row is not "[l] Live │ [t] Tasks │ [s] Scouts │ [c] Settings"')
if (!/<span class="t-run">▶ T-740 *<\/span> /.test(view('board'))) bad('still frame: the running lane "▶ T-740" (mark and id only) is not drawn in the t-run tone')
if (!/\.t-run\b/.test(readFileSync(join(out, 'style.css'), 'utf8'))) bad('style.css: no .t-run rule')
if (!page.includes('▶ T-747  ●━━━━━━●')) bad('home page: the Live tab card\'s running lanes do not start with "▶ "')

// the chat log must scroll, so its oldest messages (the owner's ask) stay in reach; and it must not pin messages
// with justify-content: flex-end, which pushes the overflow above the top, where no scroll reaches it
const css = readFileSync(join(out, 'style.css'), 'utf8')
const chatLog = /\.chat-log\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
if (!/overflow(-y)?\s*:\s*auto/.test(chatLog)) bad('style.css: .chat-log does not scroll (needs overflow-y: auto)')
if (/justify-content\s*:\s*flex-end/.test(chatLog)) bad('style.css: .chat-log uses justify-content: flex-end, which hides the oldest messages out of reach')

// the sections after the hero
for (const id of ['how-it-works', 'what-you-get', 'why-not-parallel', 'install', 'claude-code', 'opencode', 'faq', 'get-started', 'read-more']) has(`id="${id}"`, `section #${id}`)
if ((page.match(/<details class="card">/g) ?? []).length < 4) bad('home page: fewer than 4 feature cards')
if ((page.match(/<details class="faq">/g) ?? []).length < 3) bad('home page: fewer than 3 FAQ questions')
if ((page.match(/<ol class="steps">[\s\S]*?<\/ol>/)?.[0].match(/<li>/g) ?? []).length < 4) bad('home page: the how-it-works strip has fewer than 4 steps')

// install commands, nav links, words
has('claude plugin install symcc --marketplace kourgeorge/symcc', 'Claude Code install command')
has('git clone https://github.com/kourgeorge/symcc &amp;&amp; sh symcc/scripts/install-opencode.sh', 'OpenCode install command (clone)')
has('opencode plugin add github:kourgeorge/symcc', 'OpenCode install command (no clone)')
const nav = /<header class="site"[\s\S]*?<\/header>/.exec(page)?.[0] ?? ''
for (const href of ['overview.html', 'guide.html', 'reference.html', 'engine-and-clients.html', 'research/index.html', 'https://github.com/kourgeorge/symcc'])
  if (!nav.includes(`href="${href}"`)) bad(`home page nav: no link to ${href}`)
has('agent organization', 'the words "agent organization"')
if (/swarm/i.test(page)) bad('home page calls symcc a swarm')

// demo.js: every step of the story plays, from start to end, without an error, and the views stay text the page can show
const scope = {}
new Function('globalThis', 'process', readFileSync(join(root, 'site/demo.js'), 'utf8'))(scope, { argv: [] })
const demo = scope.symccDemo
if (!demo) bad('demo.js did not set symccDemo')
else {
  if (demo.STEPS.length < 10) bad(`demo.js: only ${demo.STEPS.length} steps`)
  // (T-770) while the gaps-bot scout runs (from 16:40 to its finding at 16:44), the Live tab's mode line ends with its mark
  const mid = demo.views(demo.stateAfter(7)).live
  if (!text(mid).includes('Now: ⏵ auto merge · agents 2/3 busy · ⌕ gaps-bot ')) bad('demo.js: no "· ⌕ gaps-bot" mark on the Now row while the scout runs')
  // (T-938) no stand-alone mode line above the sections: the only one is ▍Today's "Now:" row
  if (text(mid).split('\n').filter(l => l.includes(' busy')).some(l => !l.trim().startsWith('Now: '))) bad('demo.js: a mode line outside ▍Today\'s Now row')
  for (let n = 0; n <= demo.STEPS.length; n++) {
    try {
      const v = demo.views(demo.stateAfter(n))
      for (const [k, html] of Object.entries(v)) if (/undefined|NaN/.test(text(html))) bad(`demo.js: step ${n}, view ${k} shows "undefined" or "NaN"`)
    } catch (e) { bad(`demo.js: step ${n} throws: ${e.message}`) }
  }
}

for (const f of fails) console.log(`FAIL: ${f}`)
process.exit(fails.length ? 1 : 0)
