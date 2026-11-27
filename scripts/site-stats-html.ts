// Draws docs/data/symcc-stats.json (see scripts/site-stats.ts) for the site build (T-1145). Each block comes in two
// forms: HTML for the page (simple bars drawn with CSS, no scripts) and plain Markdown for the page's .md copy.
// docs/built-with-symcc.md and site/index.html hold {{stats:NAME}} markers; the build replaces them.
import type { SiteStats } from '../hooks/core/site-stats'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const grp = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'n/a'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(Math.round(n))
}

export function fmtTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'n/a'
  const m = Math.round(ms / 60_000)
  if (m < 1) return `${Math.round(ms / 1000)}s`
  if (m < 90) return `${m} min`
  const h = ms / 3_600_000
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`
}

type Row = { label: string; value: number; text?: string }

function barsHtml(rows: Row[], aria: string): string {
  const max = Math.max(1, ...rows.map(r => r.value))
  if (!rows.length) return '<p>No data yet.</p>'
  return `<ul class="bars" aria-label="${esc(aria)}">\n${rows.map(r => `<li><span class="bl">${esc(r.label)}</span><span class="bv">${esc(r.text ?? grp(r.value))}</span><span class="bb"><i style="width:${Math.max(1, Math.round((r.value / max) * 100))}%"></i></span></li>`).join('\n')}\n</ul>`
}
const barsMd = (rows: Row[]) => (rows.length ? rows.map(r => `- ${r.label}: ${r.text ?? grp(r.value)}`).join('\n') : 'No data yet.')

export type Block = { html: string; md: string }

// T-1190: each chart shaped to its data. Colors are CSS variables (--c1..--c7 in site/style.css, from the site's
// own tokens); the picture is aria-hidden and a visually hidden table carries every number.
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)
const srTable = (head: [string, string], rows: [string, string][]) =>
  `<table class="sr"><thead><tr><th>${esc(head[0])}</th><th>${esc(head[1])}</th></tr></thead><tbody>${rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>`
const color = (i: number) => `var(--c${(i % 7) + 1})`

/** Vertical columns: height = value, number on top, label under (rotated when `turn`). */
function columnsHtml(cols: { label: string; sub?: string; value: number }[], aria: string, head: [string, string], turn = false): string {
  if (!cols.length) return '<p>No data yet.</p>'
  const max = Math.max(1, ...cols.map(c => c.value))
  const items = cols.map(c => `<li><span class="cv">${grp(c.value)}</span><span class="cc"><i style="height:${c.value ? Math.max(2, Math.round((c.value / max) * 100)) : 0}%"></i></span><span class="cl">${esc(c.label)}</span>${turn ? '' : `<span class="cm">${esc(c.sub ?? '')}</span>`}</li>`).join('')
  return `<div class="chart cols${turn ? ' turn' : ''}" role="group" aria-label="${esc(aria)}"><ul aria-hidden="true">${items}</ul>${srTable(head, cols.map(c => [c.sub ? `${c.sub} ${c.label}` : c.label, grp(c.value)]))}</div>`
}

/** One stacked horizontal bar, then one legend line "name 61% · name 26%" in the segments' colors. */
function stackedHtml(rows: { name: string; n: number }[], aria: string): string {
  const total = rows.reduce((a, r) => a + r.n, 0)
  if (!total) return '<p>No data yet.</p>'
  const segs = rows.map((r, i) => `<i style="width:${(r.n / total) * 100}%;background:${color(i)}" title="${esc(r.name)} ${pct(r.n, total)}%"></i>`).join('')
  const legend = rows.map((r, i) => `<span style="color:${color(i)}">${esc(r.name)} ${pct(r.n, total)}%</span>`).join(' · ')
  return `<div class="chart stack" role="group" aria-label="${esc(aria)}"><div class="sbar" aria-hidden="true">${segs}</div><p class="legend">${legend}</p>${srTable(['Name', 'Tasks'], rows.map(r => [r.name, grp(r.n)]))}</div>`
}
const stackedMd = (rows: { name: string; n: number }[]) => {
  const total = rows.reduce((a, r) => a + r.n, 0)
  return total ? rows.map(r => `- ${r.name}: ${grp(r.n)} (${pct(r.n, total)}%)`).join('\n') : 'No data yet.'
}

const WAITING = new Set(['free', 'blocked', 'backlog', 'queue', 'owner'])
const WAIT_SHADE = [0.9, 0.7, 0.5, 0.35, 0.2]
function lifeHtml(stages: SiteStats['stages']): string {
  const total = stages.reduce((a, x) => a + x.avgMs, 0)
  if (!total) return '<p>No data yet.</p>'
  let w = 0
  const styles = stages.map((x, i) => (WAITING.has(x.stage) ? `background:var(--dim);opacity:${WAIT_SHADE[w++ % WAIT_SHADE.length]}` : `background:${color(i)}`))
  const segs = stages.map((x, i) => `<i style="width:${(x.avgMs / total) * 100}%;${styles[i]}" title="${esc(x.label)} ${fmtTime(x.avgMs)}"></i>`).join('')
  const legend = stages.map((x, i) => `<li><b style="${styles[i]}"></b>${esc(x.label)} <span>${fmtTime(x.avgMs)} · ${pct(x.avgMs, total)}%</span></li>`).join('')
  return `<div class="chart life" role="group" aria-label="A typical task's life"><div class="sbar" aria-hidden="true">${segs}</div><ul class="slegend" aria-hidden="true">${legend}</ul>${srTable(['Stage', 'Average time'], stages.map(x => [x.label, `${fmtTime(x.avgMs)} (${pct(x.avgMs, total)}%)`]))}</div>`
}
function lifeSentence(stages: SiteStats['stages']): string {
  const total = stages.reduce((a, x) => a + x.avgMs, 0)
  if (!total) return 'No data yet.'
  const wait = stages.filter(x => WAITING.has(x.stage)).reduce((a, x) => a + x.avgMs, 0)
  const w = pct(wait, total)
  return `A typical task takes ${fmtTime(total)} from idea to merge. It spends ${w}% of that waiting and ${100 - w}% being worked on, checked and merged.`
}

const originName: Record<string, string> = { owner: 'you', scout: 'scouts', worker: 'workers', lead: 'lead' }

/** Every block by name. */
export function statsBlocks(s: SiteStats): Record<string, Block> {
  const both = (rows: Row[], aria: string): Block => ({ html: barsHtml(rows, aria), md: barsMd(rows) })
  const firstTry = s.tries.firstTryRate === null ? 'n/a' : `${s.tries.firstTryRate}%`
  const big: { name: string; value: string; note: string }[] = [
    { name: 'done', value: grp(s.tasks.done), note: 'tasks merged' },
    { name: 'tries', value: grp(s.tries.total), note: 'worker tries' },
    { name: 'tokens', value: fmtTokens(s.tokens.total.all), note: 'tokens used in all' },
    { name: 'scouts', value: grp(s.scouts.reduce((n, x) => n + x.merged, 0)), note: 'scout findings merged' },
    { name: 'days', value: grp(s.days), note: `days, ${s.from} to ${s.to}` },
  ]
  const summary: Block = {
    html: `<ul class="bignums">\n${big.map(b => `<li><strong>${esc(b.value)}</strong><span>${esc(b.note)}</span></li>`).join('\n')}\n</ul>`,
    md: big.map(b => `- ${b.value} ${b.note}`).join('\n'),
  }
  const table = (head: string[], rows: string[][]): Block => ({
    html: `<div class="table"><table>\n<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>\n<tbody>\n${rows.map(r => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('\n')}\n</tbody>\n</table></div>`,
    md: `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}`,
  })
  const tokensBlock = (tb: Block): Block => {
    const rows = [['lead', s.tokens.lead], ['workers', s.tokens.workers], ['scouts', s.tokens.scouts]].filter((r): r is [string, { all: number; billed: number }] => !!r[1])
    const total = rows.reduce((a, r) => a + r[1].all, 0)
    const lines = rows.map(([n, v], i) => `<li><span class="tn">${n}</span><span class="tb"><i style="width:${Math.max(1, Math.round((v.all / Math.max(1, total)) * 100))}%;background:${color(i)}"></i></span><span class="tv">${fmtTokens(v.all)}</span></li>`).join('\n')
    return { html: `<ul class="chart trows" aria-label="Tokens by who">\n${lines}\n</ul>\n${tb.html}`, md: tb.md }
  }
  const tok = (t: { all: number; billed: number } | null) => (t ? [fmtTokens(t.all), fmtTokens(t.billed)] : ['not counted', 'not counted'])
  return {
    summary,
    perDay: { html: columnsHtml(s.perDay.map(d => ({ label: d.day.slice(8).replace(/^0/, ''), sub: d === s.perDay[0] || d.day.slice(8) === '01' ? ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.day.slice(5, 7))] : '', value: d.done })), 'Tasks done per day', ['Day', 'Tasks merged']), md: barsMd(s.perDay.map(d => ({ label: d.day, value: d.done }))) },
    totals: table(['', 'Number'], [
      ['Tasks merged', grp(s.tasks.done)],
      ['Tasks dropped', grp(s.tasks.dropped)],
      ['Questions answered (investigations)', grp(s.tasks.answered)],
      ['Errands done', grp(s.tasks.errands)],
      ['Worker tries', grp(s.tries.total)],
      ['Done on the first try', firstTry],
      ['Worker time', fmtTime(s.workMs)],
    ]),
    failed: both(s.failedTries.map(e => ({ label: e.label, value: e.n })), 'Failed tries by reason'),
    origins: { html: stackedHtml(s.origins.map(o => ({ name: originName[o.key] ?? o.label, n: o.n })), 'Where tasks came from'), md: stackedMd(s.origins.map(o => ({ name: originName[o.key] ?? o.label, n: o.n }))) },
    roles: { html: stackedHtml(s.roles.map(r => ({ name: r.role, n: r.n })), 'Tasks per role'), md: stackedMd(s.roles.map(r => ({ name: r.role, n: r.n }))) },
    scouts: table(['Scout', 'Found', 'Merged', 'Dropped', 'Scout tokens'], s.scouts.map(x => [x.name, grp(x.found), grp(x.merged), grp(x.dropped), fmtTokens(x.tokens)])),
    scoutBars: { html: columnsHtml(s.scouts.map(x => ({ label: x.name, value: x.found })), 'Tasks each scout found', ['Scout', 'Tasks found'], true), md: barsMd(s.scouts.map(x => ({ label: `${x.name}: ${x.merged} of ${x.found} merged`, value: x.found }))) },
    tokens: tokensBlock(table(['Who', 'Tokens in all', 'Billed (estimate)'], [
      ['Workers', ...tok(s.tokens.workers)],
      ['The lead', ...tok(s.tokens.lead)],
      ['Scouts', ...tok(s.tokens.scouts)],
      ['Everyone', ...tok(s.tokens.total)],
    ])),
    perDone: table(['Per merged task', 'Median', 'Average'], [
      ['Worker time', fmtTime(s.perDone.medianMs), fmtTime(s.perDone.avgMs)],
      ['Tokens in all', fmtTokens(s.perDone.medianTokens), fmtTokens(s.perDone.avgTokens)],
      ['Billed tokens', fmtTokens(s.perDone.medianBilled), fmtTokens(s.perDone.avgBilled)],
    ]),
    stages: { html: `<p class="headline">${esc(lifeSentence(s.stages))}</p>
${lifeHtml(s.stages)}`, md: `${lifeSentence(s.stages)}

${barsMd(s.stages.map(x => ({ label: x.label, value: x.avgMs, text: fmtTime(x.avgMs) })))}` },
  }
}

/** The {{stats:NAME}} markers of `src` (a paragraph of its own) replaced. */
export function fillStats(src: string, s: SiteStats, form: 'html' | 'md', paragraph = false): string {
  const blocks = statsBlocks(s)
  const put = (name: string) => {
    const b = blocks[name]
    if (!b) throw new Error(`site-stats: no block "{{stats:${name}}}"`)
    return b[form]
  }
  if (paragraph) return src.replace(/<p>\{\{stats:(\w+)\}\}<\/p>/g, (_, n: string) => put(n))
  return src.replace(/\{\{stats:(\w+)\}\}/g, (_, n: string) => put(n))
}

/** The home page's numbers: {{stat:NAME}} markers (done, tries, tokens, scouts, days). */
export function homeNumber(s: SiteStats, name: string): string {
  const n: Record<string, string> = {
    done: grp(s.tasks.done),
    tries: grp(s.tries.total),
    tokens: fmtTokens(s.tokens.total.all),
    scouts: grp(s.scouts.reduce((a, x) => a + x.merged, 0)),
    found: grp(s.scouts.reduce((a, x) => a + x.found, 0)),
    days: grp(s.days),
  }
  const v = n[name]
  if (v === undefined) throw new Error(`site-stats: no number "{{stat:${name}}}"`)
  return v
}
