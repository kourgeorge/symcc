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
  const tok = (t: { all: number; billed: number } | null) => (t ? [fmtTokens(t.all), fmtTokens(t.billed)] : ['not counted', 'not counted'])
  return {
    summary,
    perDay: both(s.perDay.map(d => ({ label: d.day, value: d.done })), 'Tasks done per day'),
    totals: table(['', 'Number'], [
      ['Tasks merged', grp(s.tasks.done)],
      ['Tasks dropped', grp(s.tasks.dropped)],
      ['Questions answered (investigations)', grp(s.tasks.answered)],
      ['Errands done', grp(s.tasks.errands)],
      ['Worker tries', grp(s.tries.total)],
      ['Done on the first try', firstTry],
      ['Worker time', fmtTime(s.workMs)],
    ]),
    endedHow: both(s.endedHow.map(e => ({ label: e.label, value: e.n })), 'How tasks ended'),
    failed: both(s.failedTries.map(e => ({ label: e.label, value: e.n })), 'Failed tries by reason'),
    origins: both(s.origins.map(o => ({ label: o.label, value: o.n })), 'Where tasks came from'),
    roles: both(s.roles.map(r => ({ label: r.role, value: r.n })), 'Tasks per role'),
    scouts: table(['Scout', 'Found', 'Merged', 'Dropped', 'Scout tokens'], s.scouts.map(x => [x.name, grp(x.found), grp(x.merged), grp(x.dropped), fmtTokens(x.tokens)])),
    scoutBars: both(s.scouts.map(x => ({ label: `${x.name}: ${x.merged} of ${x.found} merged`, value: x.found, text: String(x.found) })), 'Tasks each scout found'),
    tokens: table(['Who', 'Tokens in all', 'Billed (estimate)'], [
      ['Workers', ...tok(s.tokens.workers)],
      ['The lead', ...tok(s.tokens.lead)],
      ['Scouts', ...tok(s.tokens.scouts)],
      ['Everyone', ...tok(s.tokens.total)],
    ]),
    perDone: table(['Per merged task', 'Median', 'Average'], [
      ['Worker time', fmtTime(s.perDone.medianMs), fmtTime(s.perDone.avgMs)],
      ['Tokens in all', fmtTokens(s.perDone.medianTokens), fmtTokens(s.perDone.avgTokens)],
      ['Billed tokens', fmtTokens(s.perDone.medianBilled), fmtTokens(s.perDone.avgBilled)],
    ]),
    stages: both(s.stages.map(x => ({ label: x.label, value: x.avgMs, text: fmtTime(x.avgMs) })), 'Average time per stage'),
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
