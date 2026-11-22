// The home page's hero demo (T-749): a played-out symcc session, drawn as HTML text in the look of the real panel
// (core/live.ts: lanes work · check · queue · tests · merged, the ▍ section headings, token bars) and the lead's chat.
// The story is a real one from symcc's own board on 2026-11-21: T-747 (the owner's ask, four looks, one picked,
// worker → check → queue → tests → merged), T-740 sent back by the checker and tried again, and a scout's finding
// (gaps-bot) turned into T-736. No libraries, no outside files. Without JS the page shows the still frame written
// into the built index.html by scripts/build-site.ts (stillFrame; `bun site/demo.js --still` prints it). With JS it plays, loops, and can be paused.
;(function () {
  'use strict'

  // ---------- small text helpers ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const sp = (text, tone) => (tone ? `<span class="t-${tone}">${esc(text)}</span>` : esc(text))
  const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
  const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + '…')
  const clock = sec => {
    const h = Math.floor(sec / 3600) % 24
    const m = Math.floor(sec / 60) % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const dur = sec => (sec < 60 ? `${Math.max(0, Math.round(sec))}s` : `${Math.round(sec / 60)}m`)
  const tok = n => `${(n / 1e6).toFixed(1)}M`
  const at = (h, m, s = 0) => h * 3600 + m * 60 + s

  // ---------- the tasks of the story (words from the real board and history) ----------
  const TITLES = {
    'T-740': 'After a reopen, one hand-back started two checkers; a checker symcc stopped was read as "found problems" and cost a try',
    'T-747': 'Live tab: each section gets a "▍Name" side-bar heading like the task page (Tasks, Branches, Today, Organizational memory)',
    'T-736': 'Stats: count checker send-backs, timeouts and empty hand-backs as their own reasons in "Failed tries by reason"',
  }
  const ASK = 'there is no clear visual separation between the sections of the live page, show some ideas'
  const SCOUT_FOUND = 'Checker send-backs, the most common failure, are left out of the failed-tries reasons and total'
  // The real board at the end of the story: "✓ 56 merged ↺ 47 sent back ✗ 0 failed Σ 530.1M tokens" (268.6M of it the tries). The story starts
  // just before T-747 merged (5.7M tokens) and T-740's try 1 was sent back (4M tokens).
  const END_TODAY = { merged: 56, back: 47, failed: 0, tokens: 268.6e6 }
  const T747_TOKENS = 5.7e6
  const T740_TRY1_TOKENS = 4e6
  const USUAL = END_TODAY.tokens / END_TODAY.merged // the board's usual tokens per merged task; a full bar is that
  const MAX_AGENTS = 3
  // (T-769, T-779) ▍Today's second, third and fourth lines, real figures from this project's stats for 21 November: the medians per
  // merged task, the agent work time, and the scouts' share of the tokens (54.7M of 530.1M; the rest is the workers' and
  // checkers'; the lead's share and the day's cost are not known). The hour sparkline is a plain shape rising through the afternoon.
  const TODAY_MORE = {
    perTask: '3M · 9m work · 41m start-to-merge',
    work: '16h 56m',
    scoutsPct: 10,
    scoutsTokens: '54.7M of 530.1M',
    spark: '▁▁▁▂▂▃▄▅▆',
    // (T-781) line 4's figures: today's right-first-try share and tries per merged task (from /symcc-stats for 21 November)
    firstTry: 34,
    avgTries: '2.4',
  }
  // the scouts' tokens on top of the tries, so Σ is everyone's total (the bar's 530.1M at the end)
  const OTHERS_TOKENS = 530.1e6 - END_TODAY.tokens
  const WHO_CELL = { workers: '█', scouts: '▒' }

  // ---------- the state ----------
  function start() {
    return {
      now: at(16, 36, 0),
      frame: 0,
      chat: [{ k: 'note', text: '⏵ auto merge · the board is open · 1 task running' }],
      input: '',
      thinking: false,
      // T-786: the board question that waits for the owner (▍Needs you), null when none
      q: null,
      voice: '',
      lanes: [
        { id: 'T-740', kind: 'bug', at: 0, since: at(16, 28), tryNo: 1, tries: 3, tokens: null, back: 0, agent: true },
      ],
      today: { merged: END_TODAY.merged - 1, back: END_TODAY.back - 1, failed: END_TODAY.failed, tokens: END_TODAY.tokens - T747_TOKENS - T740_TRY1_TOKENS },
      head: '50ab5a9',
      commits: 3,
      branches: [{ id: 'T-740', col: 2, ahead: 0, behind: 0 }],
      merged747: false,
      t740: [
        ['16:28', 'try 1: worker started (from the lead)'],
      ],
      t740runs: [{ from: '16:28', start: at(16, 28), to: null, tokens: null }],
      t736: 'none',
      scout: null,
    }
  }

  // ---------- the board panel (the Live tab) ----------
  const ID_W = 5
  const TITLE_W = 12
  const GAP = 6
  const LABELS = ['work✧', 'check✧', 'queue', 'tests', 'merged']
  // T-767: the lines under a ▍heading start with 1 space; a running lane then "▶ " and its id in the accent ('run' tone), its title normal text
  const LEAD_W = 1 + 2 + ID_W + 1 + TITLE_W + 2

  function tabRow(active) {
    const tabs = [['l', 'Live'], ['t', 'Tasks'], ['s', 'Scouts'], ['c', 'Settings']]
    return tabs.map(([k, n]) => sp(`[${k}] ${n}`, n === active ? 'tab-on' : 'dim')).join(sp(' │ ', 'dim'))
  }
  const heading = (name, rest = '') => sp('▍', 'heading') + sp(name, 'heading') + rest
  // (T-789, T-810) the Live tab's section heading: the name in UPPERCASE, bold, then a thin rule in the heading color to the right edge
  // (the demo panel is 64 columns wide); an empty line above it (none above the first) and one under it
  const PANEL_W = 64
  const liveHead = (name, rest = '', plain = '') => sp(name.toUpperCase(), 'heading') + rest + sp(' ' + '─'.repeat(Math.max(0, PANEL_W - name.length - plain.length - 1)), 'heading')

  function laneLines(s, l) {
    let track = ''
    LABELS.forEach((_, i) => {
      if (i) track += i <= l.at ? sp('━'.repeat(GAP), 'passed') : sp('─'.repeat(GAP), 'future')
      // T-771: a just-merged lane has ✓ (done color) at merged, nothing blinking
      track += i < l.at ? sp('●', 'passed') : i === l.at ? (l.done ? sp('✓', 'passed') : sp(s.frame % 2 ? '◎' : '◉', 'current')) : sp('○', 'future')
    })
    const right = l.done ? `merged ${dur(s.now - l.done)} ago` : l.place ? `#${l.place}` : dur(s.now - l.since)
    // T-771: a just-merged lane: "✓ " (dim), its id in the accent, title and second line dim
    const title = ' ' + pad(cut(TITLES[l.id], TITLE_W), TITLE_W)
    const one = ' ' + (l.done ? sp('✓ ', 'dim') + sp(pad(l.id, ID_W), 'run') + sp(title, 'dim') : sp('▶ ' + pad(l.id, ID_W), 'run') + title) + '  ' + track + sp('  ' + right.padStart(6), 'dim')
    const lead = `   ${l.kind} try ${l.tryNo}/${l.tries}`
    // the whole task's tokens (every try); the running try's are known only at its hand-back
    const total = (l.prior || 0) + (l.tokens || 0)
    let rest
    if (!total) rest = sp('⌀ at hand-back', 'dim')
    else {
      const n = Math.max(0, Math.min(13, Math.round((total / USUAL) * 13)))
      const over = total > 2 * USUAL
      rest = sp(`▕${'█'.repeat(n)}${'░'.repeat(13 - n)}▏ `, l.done ? 'dim' : over ? 'warning' : 'bar') + sp('⌀ ' + tok(total), l.done ? 'dim' : over ? 'warning' : 'text') + (l.tokens === null ? sp(' + …', 'dim') : '') + (over ? sp(' ⚠', 'warning') : '')
    }
    const two = sp(pad(lead, LEAD_W), 'dim') + rest + (l.back ? sp(`  ↺×${l.back}`, 'dim') : '')
    return [one, two]
  }

  function branchLines(s) {
    const main = 'main   '
    const n = s.commits
    const line = [...Array(n)].map(() => '●').join('───')
    const out = ['  ' + sp('main', 'id') + '   ' + sp(line, 'passed') + sp(`   ${s.head} · now`, 'dim')]
    const rows = s.branches.filter(b => !b.merged || s.now - b.merged < 10 * 60).sort((a, b) => b.col - a.col)
    const width = main.length + 4 * (n - 1) + 1
    rows.forEach((b, r) => {
      const cells = Array(width + 2).fill(' ')
      for (const below of rows.slice(r + 1)) cells[main.length + 4 * below.col] = '│'
      const c = main.length + 4 * b.col
      cells[c] = '╰'
      for (let i = c + 1; i < width + 1; i++) cells[i] = '─'
      cells[width + 1] = b.merged ? '◀' : '○'
      const label = b.merged ? ` ${b.id}  merged ${dur(s.now - b.merged)} ago (${s.head})` : b.ahead === null ? ` ${b.id}  not started` : ` ${b.id}  +${b.ahead} commit${b.ahead === 1 ? '' : 's'} · ${b.behind} behind`
      out.push('  ' + sp(cells.join(''), 'dim') + sp(label, b.merged ? 'dim' : 'text'))
    })
    return out
  }

  function board(s, wide) {
    const busy = s.lanes.filter(l => l.agent).length
    const L = []
    L.push(tabRow('Live'))
    L.push(sp(`⏵ auto merge · agents ${busy}/${MAX_AGENTS} busy` + (s.scout ? ` · ⌕ gaps-bot ${dur(s.now - s.scout)} · next: simplify in 40m` : ' · ⌕ next: gaps-bot in 12m'), 'dim'))
    // T-786: NEEDS YOU first, only while something waits, every row in the warning color
    if (s.q) {
      L.push(liveHead('Needs you'), '')
      L.push(' ' + sp(cut('⚠ ' + s.q.id + '  ' + s.q.text, 56), 'warning'))
      L.push('')
    }
    L.push(liveHead('Tasks'), '')
    if (s.lanes.length) {
      // the ✧ after work and check in the accent color (core/live.ts's 'mark' tone)
      L.push((' '.repeat(LEAD_W) + LABELS.map((x, i) => (i < LABELS.length - 1 ? pad(x, GAP + 1) : x)).join('')).split('✧').map(x => sp(x, 'dim')).join(sp('✧', 'mark')))
      // T-771: the running lanes on top, then the just-merged ones (kept 10 minutes, at most 3, newest first)
      const kept = s.lanes.filter(l => l.done && s.now - l.done < 10 * 60).sort((a, b) => b.done - a.done).slice(0, 3)
      for (const l of [...s.lanes.filter(l => !l.done), ...kept]) L.push(...laneLines(s, l))
    } else L.push(' No task is running right now.')
    if (s.lanes.length) L.push(' ' + sp('─'.repeat(12), 'dim'))
    if (s.lanes.length) L.push(' ' + sp(`✧ = an agent works here (needs an agent slot) · ⌀ = tokens   bar: ⌀ of the task so far, full = usual per task (⌀ ${tok(USUAL)})`, 'dim'))
    L.push('')
    L.push(liveHead('Branches'), '')
    L.push(...branchLines(s))
    L.push('')
    L.push(liveHead('Today'), '')
    const d = s.today
    L.push(' ' + sp(`✓ ${d.merged} merged`, 'passed') + sp(`   ↺ ${d.back} sent back   ✗ ${d.failed} failed   Σ ⌀ ${tok(d.tokens + OTHERS_TOKENS)}`, 'dim'))
    // (T-809) line 2: the bar alone (16 cells in the board colors) with the scouts' share; line 3: the medians per merged task, first try,
    // tries and the checker's send-backs; line 4: the agent work time, then the tokens per hour over the whole day, 00 to 24, at the very end (hours to come are dim dots)
    const cells = Math.round((TODAY_MORE.scoutsPct / 100) * 16)
    const bar = sp(WHO_CELL.workers.repeat(16 - cells), 'who-workers') + sp(WHO_CELL.scouts.repeat(cells), 'who-scouts')
    const shares = ' ' + sp(`workers and checkers ${100 - TODAY_MORE.scoutsPct}%`, 'who-workers') + sp(' · ', 'dim') + sp(`scouts ${TODAY_MORE.scoutsPct}%`, 'who-scouts') + sp(` (⌀ ${TODAY_MORE.scoutsTokens})`, 'dim')
    L.push(' ' + sp('⌀ ', 'dim') + bar + shares)
    L.push(' ' + sp('avg ', 'dim') + sp(`⌀ ${TODAY_MORE.perTask.replace(' · ', '/task · ')}`, 'text') + sp(`   first try ${TODAY_MORE.firstTry}% · avg ${TODAY_MORE.avgTries} tries/task   ⌕ ${d.back} sent back by the checker`, 'dim'))
    L.push(' ' + sp('⏱ ', 'dim') + sp(`${TODAY_MORE.work} agent work`, 'text') + sp('   ⌀/h 00 ', 'dim') + sp('▕', 'dim') + sp('▁'.repeat(8), 'dim') + sp(TODAY_MORE.spark.slice(0, -1), 'bar') + sp(TODAY_MORE.spark.slice(-1), 'now') + sp('·'.repeat(24 - 8 - TODAY_MORE.spark.length) + '▏ 24', 'dim'))
    if (!s.lanes.length) L.push(' ' + sp('⌀ = tokens', 'dim'))
    if (wide) {
      L.push('')
      L.push(liveHead('Organizational memory', '   ' + sp('60 / 60', 'dim'), '   60 / 60'), '')
      L.push(sp('   newest ', 'dim') + '[all]')
      L.push('    ' + sp('11-21', 'dim') + '  ' + sp('ui · surfaces', 'topic') + '  ' + cut('VS Code board pages space their children with the page Box\'s gap={1}', 42))
      L.push('    ' + sp('11-21', 'dim') + '  ' + sp('probes       ', 'topic') + '  ' + cut('Draw the OpenCode panel from /tmp with bun: panelLines(view, …)', 42))
      L.push('    ' + sp('11-21', 'dim') + '  ' + sp('tests        ', 'topic') + '  ' + cut('In tests, put dates relative to now, never a fixed date', 42))
      L.push(sp('   topics', 'dim'))
      L.push('    ' + sp('tests', 'topic') + ' ' + sp('14', 'dim') + '   ' + sp('shell · guard', 'topic') + ' ' + sp('11', 'dim') + '   ' + sp('ui · surfaces', 'topic') + ' ' + sp('11', 'dim') + '   ' + sp('probes', 'topic') + ' ' + sp('8', 'dim'))
      L.push('    ' + sp('engine · hosts', 'topic') + ' ' + sp('5', 'dim') + '   ' + sp('snapshots', 'topic') + ' ' + sp('5', 'dim') + '   ' + sp('board data', 'topic') + ' ' + sp('3', 'dim') + '   ' + sp('site', 'topic') + ' ' + sp('3', 'dim'))
    }
    L.push('')
    L.push(sp('↑↓ move · Enter open task · w watch worker · Esc close', 'dim'))
    return L.join('\n')
  }

  // ---------- the band above the prompt (T-776, T-787) ----------
  // Line 1: "𝄞 symcc", the dim summary and [ open board ]; then each running task on its own line: the id in the accent
  // color, "10m · try 1" green, the title normal text.
  const STAGE = ['', '', 'queue', 'tests', 'merge']
  function band(s) {
    const running = s.lanes.filter(l => !l.done)
    const busy = s.lanes.filter(l => l.agent).length
    const waiting = 2 + (s.t736 === 'todo' ? 1 : 0)
    const L = [sp('𝄞 symcc', 'heading') + '  ' + sp(`⏵ auto merge · ${busy}/${MAX_AGENTS} agents busy · ${waiting} ${waiting === 1 ? 'task' : 'tasks'} waiting · ${s.today.merged} completed today`, 'dim') + '  ' + sp('[ open board ]', 'text')]
    for (const l of running) L.push(' ' + sp((l.at === 1 ? '⌕ ' : '▶ ') + l.id, 'run') + '  ' + sp(`${STAGE[l.at] ? STAGE[l.at] + ' ' : ''}${dur(s.now - l.since)} · try ${l.tryNo}`, 'passed') + '  ' + esc(cut(TITLES[l.id], 60)))
    return L.join('\n')
  }

  // ---------- the lead's chat (Claude Code style) ----------
  function chat(s) {
    const H = []
    for (const m of s.chat) {
      if (m.k === 'you') H.push(`<div class="m you">${sp('❯ ', 'dim')}${esc(m.text)}</div>`)
      else if (m.k === 'lead') H.push(`<div class="m lead">${sp('⏺ ', 'lead')}${m.lines.map((x, i) => (i ? '<br>' : '') + x).join('')}</div>`)
      else if (m.k === 'tool') H.push(`<div class="m tool">${sp('⏺ ', 'passed')}<b>${esc(m.name)}</b>${sp(`(${m.args})`, 'dim')}<br>${sp('  ⎿  ', 'dim')}${esc(m.result)}</div>`)
      else if (m.k === 'event') H.push(`<div class="m event">${sp(m.mark + ' ', m.tone)}${esc(m.text)}</div>`)
      else H.push(`<div class="m note">${sp(m.text, 'dim')}</div>`)
    }
    if (s.thinking) H.push(`<div class="m think">${sp((s.frame % 2 ? '✻' : '✢') + ' Thinking…', 'lead')}</div>`)
    if (s.voice) H.push(`<div class="m voice">${sp('♪ ', 'passed')}${sp('said out loud: ', 'dim')}${esc(s.voice)}</div>`)
    return H.join('')
  }
  const inputBox = s => `${sp('> ', 'dim')}${esc(s.input)}<span class="caret">▌</span>`

  // ---------- the task page (T-740) ----------
  function taskPage(s) {
    const L = []
    L.push(sp('‹ [Tasks]', 'dim') + '  ' + s.t740runs.map((_, k) => (k === s.t740runs.length - 1 ? '[● Try ' : '[Try ') + (k + 1) + ']').join(' '))
    L.push('')
    L.push(sp('T-740', 'id') + ' ' + `<b>${esc(TITLES['T-740'])}</b>`)
    L.push('')
    L.push(heading('Details'))
    const lane = s.lanes.find(l => l.id === 'T-740')
    const status = lane ? (lane.at === 0 ? `doing · try ${lane.tryNo}/3 · the worker is building it` : `doing · try ${lane.tryNo}/3 · the checker is trying to break it`) : 'done'
    const row = (k, v, tone) => L.push('   ' + sp(pad(k, 8), 'dim') + sp(v, tone))
    row('Status', status, 'current')
    row('Kind', 'bug', 'heading')
    row('From', 'lead', 'text')
    row('Why', 'On T-738 a doubled hand-back started two checkers and a stopped checker\'s "stopped" answer sent the task back, wasting a try (~$7)', 'text')
    row('Files', 'hooks/app/checker.ts, hooks/app/workers.ts, tests/', 'file')
    row('Into', 'merges into: main', 'text')
    L.push('')
    L.push(heading(`History (${s.t740.length}, newest first)`))
    for (const [t, text] of [...s.t740].reverse()) {
      const tone = /found problems/.test(text) ? 'warning' : /passed|merged/.test(text) ? 'passed' : 'text'
      L.push('   ' + sp(t, 'dim') + '  ' + sp(text, tone))
    }
    L.push('')
    // (T-774, T-779) the heading sums the tries; each try has one dim line per agent (times from the story; the split of tokens is not known)
    const mins = r => (r.to === null ? Math.round((s.now - r.start) / 60) : r.mins)
    const total = s.t740runs.reduce((a, r) => a + mins(r), 0)
    const toks = s.t740runs.reduce((a, r) => a + (r.tokens || 0), 0)
    const n = s.t740runs.length
    L.push(heading('Runs', `   ${n} ${n === 1 ? 'try' : 'tries'} · ${total}m` + (toks ? ` · ${tok(toks)} tokens` : '')))
    s.t740runs.forEach((r, i) => {
      const running = r.to === null
      const parts = [`try ${i + 1}: ${mins(r)}m`, r.tokens !== null && `${tok(r.tokens)} tokens in all`, r.end].filter(Boolean).join(' · ')
      L.push('   ' + sp(parts + (running ? ' (running)' : ''), running ? 'passed' : 'dim'))
      if (r.agents) for (const a of r.agents) L.push('     ' + sp(a, 'dim'))
    })
    return L.join('\n')
  }

  // ---------- the scouts tab ----------
  function scouts(s) {
    const L = []
    L.push(tabRow('Scouts'))
    L.push(sp('Scouts run on a timer and only look. The lead turns what they find into tasks.', 'dim'))
    L.push('')
    const one = (name, found, id, title, state) => {
      L.push(heading(name))
      L.push('   ' + sp('found  ', 'dim') + esc(found))
      L.push('   ' + sp('task   ', 'dim') + sp(id, 'id') + ' ' + esc(cut(title, 58)) + '  ' + state)
      L.push('')
    }
    const st = s.t736 === 'todo' ? sp('next up', 'current') : s.t736 === 'doing' ? sp('◉ work', 'current') : sp('· not yet found', 'dim')
    one('gaps-bot', SCOUT_FOUND, 'T-736', TITLES['T-736'], st)
    one('board-review', 'Finished, passing tries were lost (T-726, T-724) only because of a hand commit to main or a plugin reload', 'T-733', 'Merge line: re-test and merge the same branch instead of failing the try', sp('✓ merged · try 6', 'passed'))
    one('recent-changes', '"Each failed try" (442) and "Failed tries" (350) disagree because paused/dropped tries are counted as failures', 'T-735', 'Stats: one failed-tries count', sp('✓ merged · try 7', 'passed'))
    one('simplify', 'The same helpers and short-view cut are copied in the stats text and HTML code, so they can drift apart', 'T-739', 'Cleanup: share plural, durOr, tokOr between stats.ts and stats-html.ts', sp('✓ merged · try 1', 'passed'))
    return L.join('\n')
  }

  // ---------- the story, step by step ----------
  // Each step: how long to wait first (ms of real time), the clock it happens at, and what changes.
  const lane = (s, id) => s.lanes.find(l => l.id === id)
  const say = (s, m) => { s.chat.push(m); if (s.chat.length > 14) s.chat.shift() }
  const STEPS = [
    [1200, at(16, 36, 20), { type: ASK }],
    [300, at(16, 36, 30), s => { s.thinking = true }],
    [1800, at(16, 37, 0), s => {
      s.thinking = false
      say(s, { k: 'lead', lines: [
        esc('Four looks for the Live tab\'s sections (Tasks, Branches, Today, Organizational memory):'),
        sp('  1 ', 'dim') + esc('Same heading for all  ') + sp('Tasks', 'dim'),
        sp('  2 ', 'dim') + esc('Colored headings  ') + sp('Tasks', 'heading'),
        sp('  3 ', 'dim') + esc('Boxes  ') + sp('╭─ Tasks ─╮', 'dim'),
        sp('  4 ', 'dim') + esc('Side bar  ') + sp('▍Tasks', 'heading'),
        esc('Which one do you want?'),
      ] })
      s.q = { id: 'Q-12', text: 'Which look should the Live tab sections have?' }
    }],
    [2400, at(16, 37, 40), { type: '4' }],
    [300, at(16, 37, 45), s => { s.thinking = true; s.q = null }],
    [1400, at(16, 38, 0), s => {
      s.thinking = false
      say(s, { k: 'tool', name: 'symcc · add_task', args: 'T-747, kind: change', result: 'added T-747 · a worker starts now' })
      say(s, { k: 'lead', lines: [esc('Added T-747: each Live tab section gets a "▍Name" side-bar heading, like the task page. I\'ll tell you when it merges.')] })
      s.lanes.push({ id: 'T-747', kind: 'change', at: 0, since: s.now, tryNo: 1, tries: 3, tokens: null, back: 0, agent: true })
      s.branches.push({ id: 'T-747', col: s.commits - 1, ahead: 0, behind: 0 })
    }],
    // T-740's worker hands back (its commit 24bd543) and the checker starts
    [2200, at(16, 40, 0), s => {
      Object.assign(lane(s, 'T-740'), { at: 1, since: s.now })
      Object.assign(s.branches.find(b => b.id === 'T-740'), { ahead: 1 })
      s.t740.push(['16:40', 'try 1: checker started'])
      s.scout = s.now
    }],
    // main moves on: T-737 merges (18bc450)
    [1800, at(16, 41, 0), s => {
      s.commits += 1
      s.head = '18bc450'
      for (const b of s.branches) b.behind += 1
    }],
    [2400, at(16, 44, 0), s => {
      say(s, { k: 'event', mark: '◇', tone: 'id', text: `scout gaps-bot found: ${SCOUT_FOUND}` })
      say(s, { k: 'lead', lines: [esc('A scout found a gap in the stats. I added it as T-736 (bug); it starts when an agent slot is free.')] })
      s.t736 = 'todo'
      s.scout = null
    }],
    // main moves on: the version bump (1f8cdb8)
    [2200, at(16, 46, 0), s => {
      s.commits += 1
      s.head = '1f8cdb8'
      for (const b of s.branches) b.behind += 1
    }],
    // T-747's worker hands back after 10m (its commit 65096b8) and the checker starts
    [2000, at(16, 48, 0), s => {
      Object.assign(lane(s, 'T-747'), { at: 1, since: s.now })
      Object.assign(s.branches.find(b => b.id === 'T-747'), { ahead: 1 })
    }],
    [2400, at(16, 50, 0), s => {
      Object.assign(lane(s, 'T-740'), { at: 0, since: s.now, tryNo: 2, prior: T740_TRY1_TOKENS, tokens: null, back: 1 })
      s.today.back += 1
      s.today.tokens += T740_TRY1_TOKENS
      s.t740.push(['16:50', 'try 1 → the checker found problems'], ['16:50', 'try 2: worker started'])
      Object.assign(s.t740runs[0], { to: '16:50', mins: 22, tokens: T740_TRY1_TOKENS, end: 'the checker found problems', agents: ['▸ worker 12m', '⌕ checker 10m'] })
      s.t740runs.push({ from: '16:50', start: s.now, to: null, tokens: null })
      say(s, { k: 'event', mark: '↺', tone: 'warning', text: 'T-740 try 1 → the checker found problems · try 2/3 started' })
    }],
    // the checker says "OK"; T-747 is brought up to date with main (39c7f96) and waits in the queue
    [1600, at(16, 50, 20), s => {
      Object.assign(lane(s, 'T-747'), { at: 2, since: s.now, place: 1, agent: false, tokens: T747_TOKENS })
      Object.assign(s.branches.find(b => b.id === 'T-747'), { ahead: 2, behind: 0 })
      say(s, { k: 'event', mark: '✓', tone: 'passed', text: 'T-747 try 1 → checks passed: the checker said "OK" · waits in the merge queue (place 1)' })
    }],
    [1600, at(16, 50, 40), s => { Object.assign(lane(s, 'T-747'), { at: 3, since: s.now, place: undefined }) }],
    [2600, at(16, 53, 0), s => { Object.assign(lane(s, 'T-747'), { at: 4, since: s.now }) }],
    [900, at(16, 53, 10), s => {
      // T-771: T-747 keeps its lane for a while, drawn finished (dim, ✓ at merged, "merged 0s ago")
      Object.assign(lane(s, 'T-747'), { done: s.now, agent: false })
      s.today.merged += 1
      s.today.tokens += T747_TOKENS
      s.commits += 1
      s.head = '39c7f96'
      Object.assign(s.branches.find(b => b.id === 'T-747'), { merged: s.now, col: s.commits - 1 })
      for (const b of s.branches) if (!b.merged) b.behind += 1
      s.voice = 'symcc: T-747 done'
      say(s, { k: 'event', mark: '✓', tone: 'passed', text: 'T-747 try 1 → merged into main' })
      say(s, { k: 'lead', lines: [esc('T-747 is merged. The Live tab\'s sections now start with ▍Tasks, ▍Today, ▍Branches and ▍Organizational memory.')] })
    }],
    [3200, at(16, 53, 40), s => { s.voice = '' }],
  ]
  const LOOP_PAUSE = 6000

  // The state after the first `n` steps (typed lines put in whole): the still frame and the tests use it.
  function stateAfter(n) {
    const s = start()
    for (const [, when, step] of STEPS.slice(0, n)) {
      s.now = Math.max(s.now, when)
      if (typeof step === 'function') step(s)
      else say(s, { k: 'you', text: step.type })
    }
    s.thinking = false
    return s
  }
  const views = s => ({ chat: chat(s), band: band(s), input: inputBox(s), board: board(s, false), live: board(s, true), task: taskPage(s), scouts: scouts(s) })

  // ---------- under bun: print the still frame for index.html ----------
  if (typeof document === 'undefined') {
    globalThis.symccDemo = { STEPS, stateAfter, views }
    if (typeof process !== 'undefined' && process.argv.includes('--still')) {
      const v = views(stateAfter(STEPS.length - 1))
      for (const [k, html] of Object.entries(v)) console.log(`==== ${k}\n${html}`)
    }
    return
  }

  // ---------- in the browser ----------
  const root = document.getElementById('demo')
  if (!root) return
  const $ = name => root.querySelector(`[data-view="${name}"]`)
  const out = { chat: $('chat'), band: $('band'), input: $('input'), board: $('board'), live: $('live'), task: $('task'), scouts: $('scouts') }
  const pauseBtn = root.querySelector('.demo-pause')
  const stepLabel = root.querySelector('.demo-step')
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let s = start()
  let paused = false
  root.classList.add('playing')

  function draw() {
    const v = views(s)
    for (const k of Object.keys(out)) if (out[k] && out[k].innerHTML !== v[k]) {
      out[k].innerHTML = v[k]
      // a new chat message: show the newest one, like a terminal (older ones stay a scroll away)
      if (k === 'chat') out[k].scrollTop = out[k].scrollHeight
    }
    if (stepLabel) stepLabel.textContent = clock(s.now)
  }
  // a wait that stands still while paused
  const wait = ms => new Promise(done => {
    let left = ms
    const t = setInterval(() => { if (!paused) { left -= 40; if (left <= 0) { clearInterval(t); done() } } }, 40)
  })
  // the clock and the blinking mark move on their own: one real second is ten seconds of the session
  setInterval(() => {
    if (paused) return
    s.frame = still ? 0 : s.frame + 1
    s.now += 10
    draw()
  }, 1000)

  async function type(text) {
    for (const ch of text) {
      s.input += ch
      draw()
      await wait(still ? 0 : 40)
    }
    await wait(500)
    say(s, { k: 'you', text })
    s.input = ''
    draw()
  }
  async function play() {
    for (;;) {
      s = start()
      draw()
      for (const [ms, when, step] of STEPS) {
        await wait(ms)
        s.now = Math.max(s.now, when)
        if (typeof step === 'function') step(s)
        else await type(step.type)
        draw()
      }
      await wait(LOOP_PAUSE)
    }
  }
  if (pauseBtn) {
    pauseBtn.hidden = false
    pauseBtn.addEventListener('click', () => {
      paused = !paused
      pauseBtn.textContent = paused ? '▶ Play' : '❚❚ Pause'
      pauseBtn.setAttribute('aria-pressed', String(paused))
    })
  }
  play()
})()
