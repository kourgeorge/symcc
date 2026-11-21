// The /<name>-stats html report (T-674): one self-contained page (inline CSS and inline SVG, no script, no
// external fonts, images or links) laid out from the same StatsData the text report uses (statsData in
// core/stats.ts), so the two never disagree. Every text from the board is HTML-escaped.

import type { SymccTokens } from '../../types'
import { fmtCost, fmtDuration, fmtTokenKinds, fmtTokens, billedTokens, tokenCount } from './runs'
import { BILLED_FOOTNOTE, STAGES_NOTE, countingText, pctText, rangeText, scoutResultsText, statsTitle, unlinkedText, type StatsData, type StatsGroup, type StatsTop } from './stats'

/** `s` safe inside HTML text and attribute values. */
export const escapeHtml = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const E = escapeHtml
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const durOr = (x: number | undefined) => (x === undefined ? '-' : fmtDuration(x))
const tokOr = (x: number | undefined) => (x === undefined ? '-' : fmtTokens(x))

/** One colour per task state, the same in every chart. */
const STATE_COLOUR: Record<string, string> = { done: 'var(--green)', dropped: 'var(--grey)', doing: 'var(--blue)', todo: 'var(--slate)', review: 'var(--purple)', waiting: 'var(--amber)', paused: 'var(--orange)', failed: 'var(--red)', backlog: 'var(--grey)' }
/** One colour per origin / team part. */
const ORIGIN_COLOUR: Record<string, string> = { lead: 'var(--purple)', owner: 'var(--teal)', worker: 'var(--blue)', scout: 'var(--orange)', unknown: 'var(--grey)' }
const CYCLE = ['var(--blue)', 'var(--teal)', 'var(--purple)', 'var(--orange)', 'var(--green)', 'var(--pink)', 'var(--amber)', 'var(--slate)']

/** One horizontal bar: label, the bar (inline SVG) and its number text, always shown. */
function barRow(label: string, value: number, max: number, text: string, colour: string, sub = ''): string {
  const w = max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * 100) : 0
  return `<div class="row"><div class="lab">${E(label)}${sub ? `<small>${E(sub)}</small>` : ''}</div><svg class="bar" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${E(`${label}: ${text}`)}"><rect width="100" height="10" rx="2" class="track"/><rect width="${w.toFixed(2)}" height="10" rx="2" style="fill:${colour}"/></svg><div class="num">${E(text)}</div></div>`
}

const card = (label: string, value: string, note = '', colour = 'var(--blue)') =>
  `<div class="card" style="--c:${colour}"><div class="cl">${E(label)}</div><div class="cv">${E(value)}</div>${note ? `<div class="cn">${E(note)}</div>` : ''}</div>`

const section = (title: string, body: string, wide = false) => `<section class="panel${wide ? ' wide' : ''}"><h2>${E(title)}</h2>${body}</section>`

const kv = (rows: [string, string][]) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${E(k)}</dt><dd>${E(v)}</dd>`).join('')}</dl>`

const kinds = (t: SymccTokens | undefined) => (tokenCount(t) ? fmtTokenKinds(t) : '')

/** The per-day column chart: done tasks as columns, each with its count above, and work time and tokens under its day. */
function dayChart(d: StatsData): string {
  if (!d.days.length) return '<p class="muted">No activity.</p>'
  const n = d.days.length
  const W = 700
  const H = 220
  const top = 24
  const base = 150
  const slot = W / n
  const colW = Math.min(64, slot * 0.6)
  const max = Math.max(1, ...d.days.map(x => x.done))
  const cols = d.days.map((x, i) => {
    const cx = slot * i + slot / 2
    const h = ((base - top) * x.done) / max
    return `<g><rect x="${(cx - colW / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${colW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" class="col${x.day === d.today ? ' today' : ''}"/>`
      + `<text x="${cx.toFixed(1)}" y="${(base - h - 6).toFixed(1)}" class="cv">${x.done}</text>`
      + `<text x="${cx.toFixed(1)}" y="${base + 20}" class="cd">${E(x.label)}</text>`
      + `<text x="${cx.toFixed(1)}" y="${base + 40}" class="cs">${E(fmtDuration(x.ms))}</text>`
      + `<text x="${cx.toFixed(1)}" y="${base + 58}" class="cs">${E(fmtTokens(x.tokens))} tok</text></g>`
  })
  return `<svg class="days" viewBox="0 0 ${W} ${H}" role="img" aria-label="Done per day"><line x1="0" y1="${base}" x2="${W}" y2="${base}" class="axis"/>${cols.join('')}</svg>`
    + `<table class="t small"><thead><tr><th>day</th><th>done</th><th>work</th><th>tokens</th></tr></thead><tbody>${d.days.map(x => `<tr><td>${E(x.label)}</td><td>${x.done}</td><td>${E(fmtDuration(x.ms))}</td><td>${E(fmtTokens(x.tokens))}</td></tr>`).join('')}</tbody></table>`
}

function topTable(ts: StatsTop[], fmt: (n: number) => string, colour: string): string {
  if (!ts.length) return '<p class="muted">No done tasks with data.</p>'
  const max = ts[0]!.value
  return ts.map(t => barRow(`${t.id} ${t.title}`, t.value, max, fmt(t.value), colour)).join('')
}

const groupText = (g: StatsGroup, total: number) => `${g.n} · ${pctText(g.n, total)}`
const groupSub = (g: StatsGroup) => `avg ${tokOr(g.avgTok)} tokens · ${durOr(g.avgMs)}${g.sumTok !== undefined || g.sumMs !== undefined ? ` · total ${tokOr(g.sumTok)} tokens · ${durOr(g.sumMs)}` : ''}`

/** The tokens per merged task the headline card shows: the whole team's when known, else the workers'. */
export function perMergedHeadline(d: StatsData): string {
  if (d.team) return d.team.data.merged ? fmtTokens(tokenCount(d.team.data.total) / d.team.data.merged) : '-'
  return d.done && d.tokKnown ? fmtTokens(tokenCount(d.tokens) / d.done) : '-'
}

/** The headline cards' values, in order: done, answered, work time, tokens, right first try, per merged task. */
export function headlineCards(d: StatsData): { label: string; value: string; note?: string }[] {
  return [
    { label: 'Done', value: String(d.done), note: plural(d.total, 'task') + ' in range' },
    { label: 'Answered', value: String(d.answered), note: `of ${plural(d.invCount, 'investigation')}` },
    { label: 'Work time', value: fmtDuration(d.workMs), note: `${d.withData} of ${d.total} tasks with data` },
    { label: 'Tokens', value: d.tokKnown ? fmtTokens(tokenCount(d.tokens)) : '-', note: d.tokKnown ? `about ${fmtTokens(billedTokens(d.tokens))} billed*` : 'none reported' },
    { label: 'Right first try', value: d.doneWithData ? pctText(d.first, d.doneWithData) : '-', note: `${d.first} of ${d.doneWithData} done tasks` },
    { label: 'Per merged task', value: perMergedHeadline(d), note: d.team ? 'tokens, whole team' : 'tokens, workers' },
  ]
}

const CSS = `
:root{--bg:#f6f7fb;--fg:#1d2330;--muted:#677086;--panel:#fff;--line:#e3e6ee;--track:#eef0f5;
--green:#2f9e62;--grey:#9aa1b1;--blue:#3b74d9;--slate:#5c6f8f;--purple:#8a5cd6;--amber:#d39b1c;--orange:#e07b39;--red:#d64545;--teal:#1f9c9c;--pink:#cf4f8f;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e6e9f0;--muted:#98a0b3;--panel:#1b2029;--line:#2b3240;--track:#262c38;
--green:#4cc184;--grey:#7c8496;--blue:#6a9cf0;--slate:#8396b5;--purple:#ad87ef;--amber:#e8b84a;--orange:#f0985e;--red:#ef6b6b;--teal:#3fc2c2;--pink:#e877ad}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-wrap:anywhere}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
header h1{margin:0;font-size:1.6rem;letter-spacing:-.01em}
header p{margin:4px 0 0;color:var(--muted)}
.note{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--amber);border-radius:8px;padding:8px 12px;margin:12px 0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
.card{background:var(--panel);border:1px solid var(--line);border-top:4px solid var(--c);border-radius:12px;padding:12px 14px}
.cl{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}
.cv{font-size:1.7rem;font-weight:650;line-height:1.2;margin-top:2px}
.cn{color:var(--muted);font-size:.8rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:16px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0;break-inside:avoid}
.panel.wide{grid-column:1/-1}
h2{font-size:1.05rem;margin:0 0 12px}
h3{font-size:.9rem;margin:16px 0 8px;color:var(--muted);font-weight:600}
.row{display:grid;grid-template-columns:minmax(0,38%) minmax(0,1fr) auto;gap:10px;align-items:center;margin:6px 0}
.lab{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:.9rem}
.lab small{display:block;color:var(--muted);font-size:.78rem}
.bar{width:100%;height:12px;display:block}
.track{fill:var(--track)}
.num{font-variant-numeric:tabular-nums;font-size:.9rem;text-align:right;white-space:nowrap}
.indent .lab{padding-left:14px}
.results{color:var(--muted);font-size:.8rem;margin:-2px 0 8px 14px}
.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px;margin:0;font-size:.9rem}
.kv dt{color:var(--muted)}.kv dd{margin:0;font-variant-numeric:tabular-nums}
.days{width:100%;height:auto;display:block}
.days .col{fill:var(--green)}.days .col.today{fill:var(--blue)}
.days .axis{stroke:var(--line);stroke-width:1}
.days text{text-anchor:middle;fill:var(--fg);font-size:13px}
.days .cv{font-weight:650}.days .cs{fill:var(--muted);font-size:12px}
.t{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:10px}
.t th,.t td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}
.t th{color:var(--muted);font-weight:600}
.muted{color:var(--muted)}
footer{color:var(--muted);font-size:.8rem;margin-top:24px}
@media (max-width:520px){.row{grid-template-columns:minmax(0,1fr) auto}.row .bar{grid-column:1/-1;order:3}.cv{font-size:1.4rem}}
@media print{:root{--bg:#fff;--panel:#fff;color-scheme:light}body{font-size:12px}main{max-width:none;padding:0}.panel,.card{border-color:#ccc}.grid{display:block}.panel{margin-bottom:12px}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`

/**
 * The whole report as one HTML page, from figures `d`. `project` is the project's name (its folder name) for the
 * header; the date is today's day in the owner's time zone (d.today).
 */
export function statsHtml(d: StatsData, project: string): string {
  const title = `${d.name} stats · ${project}`
  const counting = countingText(d.range, d.counting, d.insideAsked, d.name)
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(title)}</title><style>${CSS}</style></head><body><main>`
    + `<header><h1>${E(title)}</h1><p>${E(rangeText(d.range))} · ${E(plural(d.total, 'task'))}${d.archivedIn ? ` (incl. ${d.archivedIn} archived)` : ''} · ${E(d.today)}</p>${counting ? `<p>${E(counting)}</p>` : ''}</header>`
    + (d.archiveProblem ? `<div class="note">Archived tasks are not counted: ${E(d.archiveProblem)}</div>` : '')
  const end = `<footer><p>${E(statsTitle(d))}</p><p>${E(BILLED_FOOTNOTE)}</p><p>${E(`Stages: ${STAGES_NOTE}`)}</p></footer></main></body></html>\n`
  if (!d.total) return `${head}<div class="note">${d.range.kind === 'all' ? 'No tasks yet.' : 'No tasks in this range.'}</div>${end}`

  const cards = `<div class="cards">${headlineCards(d).map((c, i) => card(c.label, c.value, c.note, CYCLE[i % CYCLE.length]!)).join('')}</div>`
    + (d.noData ? `<p class="muted">${E(plural(d.noData, 'task'))} with no try data ${d.noData === 1 ? 'is' : 'are'} left out of averages.</p>` : '')

  const maxState = Math.max(...d.states.map(s => s.n))
  const states = section('Tasks by state', d.states.map(s => barRow(s.label, s.n, maxState, `${s.n} · ${pctText(s.n, d.total)}`, STATE_COLOUR[s.status] ?? 'var(--slate)')).join(''))

  const maxEnd = Math.max(0, ...d.ended.map(e => e.n))
  const maxFail = Math.max(0, ...d.failed.map(f => f.n))
  const ended = section(`How tasks ended (${plural(d.finished, 'done task')})`,
    d.ended.map((e, i) => barRow(e.label, e.n, maxEnd, `${e.n} · ${pctText(e.n, d.finished)}`, CYCLE[i % CYCLE.length]!)).join('')
    + `<h3>Failed tries by reason (${d.failedTotal}, from history)</h3>`
    + d.failed.map(f => barRow(f.label, f.n, maxFail, String(f.n), f.key === 'changed' ? 'var(--grey)' : 'var(--red)')).join(''))

  const maxRole = Math.max(0, ...d.roles.map(g => g.n))
  const roles = section('By role', d.roles.map((g, i) => barRow(g.label, g.n, maxRole, groupText(g, d.total), CYCLE[i % CYCLE.length]!, groupSub(g))).join(''))

  const maxOrigin = Math.max(0, ...d.origins.map(o => o.n))
  const origins = section('Where tasks came from', d.origins.map(o => barRow(o.label, o.n, maxOrigin, groupText(o, d.total), ORIGIN_COLOUR[o.key] ?? 'var(--slate)', o.n ? groupSub(o) : '')
    + (o.scouts?.length ? `<h3>Scout scorecard</h3>` + o.scouts.map(s => `<div class="indent">${barRow(s.label, s.n, maxOrigin, groupText(s, d.total), ORIGIN_COLOUR.scout!, s.idle ? 'no tasks here' : groupSub(s))}</div><div class="results">${E(scoutResultsText(s.results))}${s.unlinked !== undefined && !s.idle ? ` · ${E(unlinkedText(s.unlinked))}` : ''}</div>`).join('') : '')).join(''))

  const days = section('Done per day (the last 7 days with activity)', dayChart(d), true)

  const p = d.perDone
  const perDone = section(`Per done task (${plural(d.doneWithData, 'done task')} with data)`, d.doneWithData ? kv([
    ['time', `avg ${durOr(p.avgMs)} · median ${durOr(p.medianMs)} · total ${durOr(p.sumMs)}`],
    ['tokens', p.avgTok !== undefined ? `avg ${tokOr(p.avgTok)} · median ${tokOr(p.medianTok)} · total ${tokOr(p.sumTok)} (in all)` : '-'],
    ['tries', `avg ${(p.avgTries ?? 0).toFixed(1)} per task`],
    ['first try', `${pctText(d.first, d.doneWithData)} (${d.first} of ${d.doneWithData})`],
    ['lead time', d.leadTime.n ? `avg ${durOr(d.leadTime.avgMs)} · median ${durOr(d.leadTime.medianMs)} · total ${durOr(d.leadTime.sumMs)} (made to done)` : '-'],
  ]) : '<p class="muted">No done tasks with data.</p>')
  const perTry = section(`Per try (${plural(d.perTry.n, 'try', 'tries')})`, kv([['time', `avg ${durOr(d.perTry.avgMs)} · total ${durOr(d.perTry.sumMs)}`], ['tokens', `avg ${tokOr(d.perTry.avgTok)} in all · total ${tokOr(d.perTry.sumTok)}`], ['worker time', fmtDuration(d.workMs)], ['tokens in all', d.tokKnown ? fmtTokens(tokenCount(d.tokens)) : '-'], ...(kinds(d.tokens) ? [['kinds', kinds(d.tokens)] as [string, string]] : [])]))

  // T-719: time per stage, each with its total, its average per done task and its share of the lifetime
  const f = d.stages
  const shown = f.stages.filter(x => x.ms > 0 || (x.stage !== 'backlog' && x.stage !== 'blocked'))
  const maxStage = Math.max(0, ...shown.map(x => x.ms))
  const stageRow = (label: string, ms: number, avg: number, colour: string) => barRow(label, ms, maxStage, `${fmtDuration(ms)} · avg ${fmtDuration(avg)} · ${pctText(ms, f.lifetime)}`, colour)
  const stages = section(`Time per stage (${plural(f.n, 'done task')}${f.lacking ? `; ${f.lacking} without timed history, left out` : ''})`, f.n
    ? shown.map((x, i) => stageRow(x.label, x.ms, x.avgMs, CYCLE[i % CYCLE.length]!)).join('')
      + kv([['active', `${fmtDuration(f.active)} · avg ${fmtDuration(f.active / f.n)} · ${pctText(f.active, f.lifetime)}`], ['waiting', `${fmtDuration(f.waiting)} · avg ${fmtDuration(f.waiting / f.n)} · ${pctText(f.waiting, f.lifetime)}`], ['lifetime', `${fmtDuration(f.lifetime)} · avg ${fmtDuration(f.avgLifetime)}`]])
    : '<p class="muted">No done tasks with timed history.</p>', true)

  const v = d.inv
  const inv = section(`Investigations (${d.invCount}, ${d.answered} answered)`, d.invCount ? kv([
    ['answered', `${d.answered} of ${d.invCount} (${v.readByOwner} read by you, ${v.waiting} waiting)`],
    ['time', v.withData ? `${fmtDuration(v.ms)} in all · avg ${durOr(v.avgMs)}` : '-'],
    ['tokens', v.tokKnown ? `${fmtTokens(tokenCount(v.tokens))} in all · avg ${tokOr(v.avgTok)}` : '-'],
    ['tries', v.withData ? `${v.tries} in all · avg ${(v.avgTries ?? 0).toFixed(1)}` : '-'],
  ]) : '<p class="muted">None.</p>')

  const topTok = section('Most tokens', topTable(d.topTokens, fmtTokens, 'var(--purple)'))
  const topTime = section('Most time', topTable(d.topTime, fmtDuration, 'var(--teal)'))

  let team = ''
  if (d.team) {
    const t = d.team.data
    const parts: [string, string, SymccTokens | undefined, string][] = [
      ['lead', 'lead', t.lead?.tokens, t.lead ? `${plural(t.lead.calls, 'call')}${t.lead.sessions !== undefined ? ` · ${plural(t.lead.sessions, 'session')}` : ''}` : `not counted: ${t.leadProblem ?? 'no session logs'}`],
      ['worker', 'workers', t.workers.tokens, plural(t.workers.tries, 'try', 'tries')],
      ['scout', 'scouts', t.scouts.tokens, `${plural(t.scouts.runs, 'run')}${t.scouts.runs ? ` · ${fmtDuration(t.scouts.ms)}` : ''}`],
    ]
    const max = Math.max(0, ...parts.map(x => tokenCount(x[2])))
    team = section(`Whole team (${d.team.label})`, parts.map(([k, label, tok, sub]) => barRow(label, tokenCount(tok), max, t.lead || k !== 'lead' ? `${fmtTokens(tokenCount(tok))} tokens` : '-', ORIGIN_COLOUR[k]!, sub)).join('')
      + kv([
        ['total', `${fmtTokens(tokenCount(t.total))} in all, about ${fmtTokens(billedTokens(t.total))} billed*${t.lead ? '' : ' (without the lead)'}`],
        ['per merged', t.merged ? `${fmtTokens(tokenCount(t.total) / t.merged)} in all, about ${fmtTokens(billedTokens(t.total) / t.merged)} billed (${t.merged} merged)` : '- no merged tasks'],
        ['dollars', `not shown: ${d.name} doesn't know the model prices${t.sessionUsd !== undefined ? ` (this session so far: ${fmtCost(t.sessionUsd)})` : ''}`],
      ]), true)
  }

  return `${head}${cards}<div class="grid">${states}${ended}${team}${days}${stages}${perDone}${perTry}${inv}${roles}${origins}${topTok}${topTime}</div>${end}`
}

/** The command that opens `file` in the browser on `platform` (process.platform's words), or every one to try when not known. */
export function openCommands(file: string, platform: string | undefined): string[][] {
  const mac = ['open', file]
  const linux = ['xdg-open', file]
  const win = ['cmd', '/c', 'start', '""', file]
  if (platform === 'darwin') return [mac]
  if (platform === 'win32') return [win]
  if (platform) return [linux]
  return [mac, linux, win]
}
