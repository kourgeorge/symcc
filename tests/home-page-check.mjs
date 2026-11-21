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
for (const w of ['▍Tasks', '▍Branches', '▍Today', 'work✧', 'check✧', 'queue', 'tests', 'merged', 'T-740', 'try 2/3', '↺×1'])
  if (!board.includes(w)) bad(`still frame: the board has no "${w}"`)
// (T-760) the agent mark is ✧ (in the accent color), not ·, and the legend says what it means
if (/work·|check·/.test(board)) bad('still frame: the board still marks the agent stations with ·')
if (!board.includes('✧ = an agent works here (needs an agent slot)')) bad('still frame: the board has no ✧ legend')
if (!view('board').includes('<span class="t-mark">✧</span>')) bad('still frame: the ✧ marks are not drawn in the accent color')
if (!text(view('live')).includes('▍Organizational memory')) bad('still frame: the Live tab has no ▍Organizational memory')
const chat = text(view('chat'))
for (const w of ['❯ there is no clear visual separation between the sections of the live page, show some ideas', '⏺ Four looks', 'T-747 try 1 → checks passed', 'symcc: T-747 done', 'scout gaps-bot found'])
  if (!chat.includes(w)) bad(`still frame: the chat has no "${w}"`)
const task = text(view('task'))
for (const w of ['T-740', '▍History', '▍Runs (time and cost)', 'try 1 → the checker found problems']) if (!task.includes(w)) bad(`still frame: the task page has no "${w}"`)
// the real figures from the board on 2026-11-21 (not guesses): the looks offered, the owner's pick, slots, today, org-mem
for (const w of ['1 Same heading for all', '2 Colored headings', '3 Boxes', '4 Side bar', '❯ 4'])
  if (!chat.includes(w)) bad(`still frame: the chat has no "${w}" (the real looks and pick)`)
if (chat.includes('❯ 2')) bad('still frame: the chat shows "❯ 2"; the owner picked look 4')
for (const w of ['agents 1/3 busy', '✓ 56 merged', '↺ 47 sent back', '✗ 0 failed', 'Σ 268.6M tokens', '39c7f96'])
  if (!board.includes(w)) bad(`still frame: the board has no "${w}" (the real board)`)
const live = text(view('live'))
// (T-758) ▍Today holds only the figures line: no "next up" line and no "today" label
for (const [name, t] of [['board', board], ['Live tab', live]]) {
  const after = t.slice(t.indexOf('▍Today') + '▍Today'.length).split('\n').map(l => l.trim()).filter(Boolean)
  if (!after[0]?.startsWith('✓ ')) bad(`still frame: the ${name}'s ▍Today does not start with the figures line ("${after[0] ?? ''}")`)
  if (/next up {2}|today {4}/.test(t)) bad(`still frame: the ${name} still shows a "next up" or "today" label in ▍Today`)
}
// (T-754) the Live tab's sections come in the real order: ▍Tasks, ▍Today, ▍Branches, ▍Organizational memory
const order = ['▍Tasks', '▍Today', '▍Branches', '▍Organizational memory']
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
// (T-757) T-740 on try 2: its lane shows the whole task's tokens (try 1's 4.0M, more coming), the bar full at the
// usual tokens per merged task (268.6M / 56 = 4.8M, so 4.0M fills 11 of 13 cells), and the legend says so
if (!board.includes('▕███████████░░▏ 4.0M + …')) bad('still frame: T-740\'s lane does not show "▕███████████░░▏ 4.0M + …" (bar full = the usual per task)')
if (!board.includes('bar: tokens of the task so far, full = usual per task (4.8M)')) bad('still frame: the board has no bar legend')
// (T-757) the hand-drawn Live tab card tells the same story: whole-task tokens, full bar = the usual per task
if (/tokens of each try|T-740[\s\S]{0,80}tokens at hand-back/.test(page)) bad('home page: the Live tab card still shows tokens per try ("tokens at hand-back" on T-740\'s try 2)')
if (!page.includes('▕███████████░░▏ 4.0M + …')) bad('home page: the Live tab card\'s T-740 lane does not show "4.0M + …"')
// (T-767) the lines under a ▍heading start with 1 space; a running lane with "▶ ", its id and title bold in the accent color
for (const [name, t] of [['board', board], ['Live tab', live]]) {
  const lines = t.split('\n')
  if (!lines.some(l => l.startsWith(' ▶ T-740 '))) bad(`still frame: the ${name}'s T-740 lane does not start " ▶ T-740 "`)
  if (!lines.some(l => l.startsWith(' ✓ 56 merged'))) bad(`still frame: the ${name}'s ▍Today line is not indented by 1`)
  if (lines.some(l => /^ {3}[✓▶]/.test(l))) bad(`still frame: the ${name} still indents by 3 under a ▍heading`)
}
if (!/<span class="t-run">▶ T-740 /.test(view('board'))) bad('still frame: the running lane "▶ T-740" is not drawn in the t-run tone')
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
  for (let n = 0; n <= demo.STEPS.length; n++) {
    try {
      const v = demo.views(demo.stateAfter(n))
      for (const [k, html] of Object.entries(v)) if (/undefined|NaN/.test(text(html))) bad(`demo.js: step ${n}, view ${k} shows "undefined" or "NaN"`)
    } catch (e) { bad(`demo.js: step ${n} throws: ${e.message}`) }
  }
}

for (const f of fails) console.log(`FAIL: ${f}`)
process.exit(fails.length ? 1 : 0)
