// T-768: /<name>-stats as Claude Code draws it in the chat: the same figures as the short text report (statsReport in
// core/stats.ts, from the same StatsData), laid out as colored lines. A title bar, four headline figures, one "▍"
// heading per section (in the text report's order, with plain titles), bars of one style in their kind's color,
// numbers right-aligned in fixed columns, the small print dim, and a footer with hints. Pure: claude/ui/stats-output.tsx
// turns the lines into Text elements. Every line fits `width`: bars shrink first, then labels are cut with "…".
import { ICON } from '../name'
import { ORIGIN_MARK } from '../core/origin'
import { fmtCost, fmtDuration, fmtTokenKinds, fmtTokens, billedTokens, tokenCount } from '../core/runs'
import { BILLED_FOOTNOTE, countingText, cutTitle, durOr, failedCountsNote, failedShown, pctText, plural, rangeText, scoutResultsText, textWidth, tokOr, unlinkedText, unreadText, type StatsData, type StatsGroup, type StatsScout, type StatsTop, type Stage, type FailReason } from '../core/stats'
import type { SymccTokens } from '../../types'

/** A run of text in one style: a theme color name, bold, or dim. */
export type StatSeg = { text: string; color?: string; bold?: boolean; dim?: boolean }
/** One drawn line: its element key and its runs. */
export type StatLine = { key: string; segs: StatSeg[] }

/** The widest a bar gets, in blocks; every bar of the view has this width (less on a narrow screen). */
export const VIEW_BAR = 16
/** The spaces before each number column. */
const COL_GAP = 2
/** A bar table whose labels would be cut below this many columns puts its figures under each label instead. */
const MIN_LABEL = 8
/** The narrowest a bar gets before labels are cut. */
const MIN_BAR = 3
/** The bar's blocks: filled and the rest. */
export const BAR_FULL = '█'
export const BAR_EMPTY = '░'

/** Each stage's color: work blue, check purple, tests yellow, the waiting ones gray. */
export const STAGE_COLOR: Record<Stage, string> = { free: 'inactive', blocked: 'inactive', backlog: 'inactive', queue: 'inactive', owner: 'inactive', work: 'ide', prep: 'planMode', check: 'autoAccept', tests: 'warning', merge: 'success' }
/** Each failure's color: tests, the checker and a clash in their own failure colors, the rest gray. */
export const FAIL_COLOR: Partial<Record<FailReason, string>> = { tests: 'error', checker: 'autoAccept', clash: 'warning' }
/** Who spent the tokens, in the board's colors: the lead green, workers blue, scouts the scouts' color, you yours. */
export const WHO_COLOR: Record<string, string> = { lead: 'success', worker: 'ide', scout: 'suggestion', owner: 'claude', unknown: 'inactive' }
/** Each task state's color. */
const STATE_COLOR: Record<string, string> = { done: 'success', dropped: 'inactive', doing: 'ide', todo: 'text', review: 'suggestion', waiting: 'warning', paused: 'permission', failed: 'error', backlog: 'inactive' }
/** The heading color (the board's "▍" headings) and the rules'. */
export const ACCENT = 'suggestion'

/** The headline figure colors by meaning. */
export const GOOD = 'success'
export const WATCH = 'warning'
export const BAD = 'error'
/** "Right first try" is good from this share on, to watch from FIRST_TRY_BAD up to it, bad under that. */
export const FIRST_TRY_GOOD = 0.7
export const FIRST_TRY_BAD = 0.4

const dim = (text: string): StatSeg => ({ text, dim: true })
const strong = (text: string, color?: string): StatSeg => ({ text, bold: true, ...(color ? { color } : {}) })
const segsWidth = (segs: StatSeg[]) => segs.reduce((w, s) => w + textWidth(s.text), 0)

/** Segments cut to at most `w` columns, ending in "…" when cut. */
export function cutSegs(segs: StatSeg[], w: number): StatSeg[] {
  if (segsWidth(segs) <= w) return segs
  const out: StatSeg[] = []
  let left = w
  for (const s of segs) {
    const sw = textWidth(s.text)
    if (sw < left || (sw === left && out.length + 1 === segs.length)) {
      out.push(s)
      left -= sw
      continue
    }
    if (left > 0) out.push({ ...s, text: cutTitle(s.text, left) })
    break
  }
  return out
}

/** Segments broken into lines of at most `w` columns at spaces; the next lines start `indent` columns in. */
export function wrapSegs(segs: StatSeg[], w: number, indent = 0): StatSeg[][] {
  const words: StatSeg[] = segs.flatMap(s => s.text.split(/(?<= )/).filter(Boolean).map(t => ({ ...s, text: t })))
  const lines: StatSeg[][] = []
  let cur: StatSeg[] = []
  let cw = 0
  const pad = ' '.repeat(Math.min(indent, Math.max(0, w - 8)))
  for (const word of words) {
    const ww = textWidth(word.text.trimEnd())
    if (cw && cw + ww > w) {
      lines.push(cur)
      cur = [{ text: pad }]
      cw = pad.length
      if (!word.text.trim()) continue
    }
    cur.push(word)
    cw += textWidth(word.text)
  }
  if (cur.length) lines.push(cur)
  return lines.map(l => cutSegs(trimEndSegs(l), w))
}
const trimEndSegs = (l: StatSeg[]) => {
  const out = [...l]
  while (out.length && !out[out.length - 1]!.text.trim()) out.pop()
  if (out.length) out[out.length - 1] = { ...out[out.length - 1]!, text: out[out.length - 1]!.text.trimEnd() }
  return out
}

/** A bar of `width` blocks for `value` out of `max`: whole blocks filled (at least one for any value above 0), the rest ░. */
export function viewBar(value: number, max: number, width: number, color: string): StatSeg[] {
  const n = value > 0 && max > 0 ? Math.max(1, Math.min(width, Math.round((value / max) * width))) : 0
  return [{ text: BAR_FULL.repeat(n), color }, { text: BAR_EMPTY.repeat(width - n), color: 'subtle' }].filter(s => s.text)
}

/** One row of a bar table: its label (text and color), its bar's value and color (none: no bar), its number columns and any dim rest. */
type BarRow = { stack?: StatSeg[]; label: string; color?: string; bold?: boolean; value?: number; barColor?: string; cols: StatSeg[][]; rest?: string; dimRow?: boolean; small?: string[] }

/** The view's lines, built up section by section. */
class Lines {
  out: StatLine[] = []
  constructor(readonly width: number) {}
  private n = 0
  line(segs: StatSeg[], key = `l${this.n}`) {
    this.n++
    this.out.push({ key, segs: cutSegs(segs, this.width) })
  }
  blank() {
    this.line([{ text: '' }])
  }
  /** Text wrapped to the width (the next lines `indent` columns in). */
  wrapped(segs: StatSeg[], indent = 2) {
    for (const l of wrapSegs(segs, this.width, indent)) this.line(l)
  }
  /** Dim small print, two columns in. */
  small(text: string, at = 4) {
    this.wrapped([dim(`${' '.repeat(at)}${text}`)], at + 2)
  }
  /** A "▍Title" heading in the accent color, and its dim note after it (wrapped under it when it doesn't fit). */
  heading(title: string, note?: string) {
    this.blank()
    const head = strong(`▍${title}`, ACCENT)
    if (note && textWidth(head.text) + 2 + textWidth(note) <= this.width) this.line([head, dim(`  ${note}`)], `h-${title}`)
    else {
      this.line([head], `h-${title}`)
      if (note) this.small(note, 2)
    }
  }
  /** A label and its value: "  label        value". */
  kv(label: string, value: StatSeg[], w = 12) {
    this.wrapped([{ text: `  ${label.padEnd(w)} ` }, ...value], w + 3)
  }
  /** A table of bar rows: labels in one column, bars of one width, each number column right-aligned to its widest. */
  bars(rows: BarRow[], header?: string[]) {
    if (!rows.length) return
    const ncol = Math.max(...rows.map(r => r.cols.length))
    const colW = Array.from({ length: ncol }, (_, i) => Math.max(textWidth(header?.[i] ?? ''), ...rows.map(r => (r.cols[i] ? segsWidth(r.cols[i]!) : 0))))
    const colsW = colW.reduce((s, w) => s + w + COL_GAP, 0)
    const hasBar = rows.some(r => r.value !== undefined)
    const wantLabel = Math.max(...rows.map(r => textWidth(r.label)))
    // bars shrink first, then the labels are cut
    const room = this.width - 2 - colsW
    const barW = hasBar ? Math.max(MIN_BAR, Math.min(VIEW_BAR, room - wantLabel - 1)) : 0
    const labelW = Math.max(4, Math.min(wantLabel, room - (hasBar ? barW + 1 : 0)))
    // too narrow for the columns beside a readable label: each row's figures go on a line of their own under it
    if (room - (hasBar ? MIN_BAR + 1 : 0) < Math.min(wantLabel, MIN_LABEL)) return this.stacked(rows, header)
    const cell = (segs: StatSeg[], w: number): StatSeg[] => [{ text: ' '.repeat(Math.max(0, w - segsWidth(segs)) + COL_GAP) }, ...segs]
    if (header) this.line([dim(`  ${' '.repeat(labelW)}${hasBar ? ' '.repeat(barW + 1) : ''}${header.map((h, i) => h.padStart(colW[i]! + COL_GAP)).join('')}`)])
    for (const r of rows) {
      const label = cutTitle(r.label, labelW)
      const lab: StatSeg = { text: label + ' '.repeat(labelW - textWidth(label)), ...(r.color ? { color: r.color } : {}), ...(r.bold ? { bold: true } : {}), ...(r.dimRow ? { dim: true } : {}) }
      const b = !hasBar ? [] : [{ text: ' ' }, ...(r.value === undefined ? [{ text: ' '.repeat(barW) }] : viewBar(r.value, Math.max(...rows.map(x => x.value ?? 0)), barW, r.barColor ?? 'ide'))]
      const cols = colW.flatMap((w, i) => cell(r.cols[i] ?? [], w))
      const segs = [{ text: '  ' }, lab, ...b, ...cols].map(s => (r.dimRow && s.text.trim() ? { ...s, dim: true, bold: false } : s))
      const rest = r.rest ? `  ${r.rest}` : ''
      if (rest && segsWidth(segs) + textWidth(rest) <= this.width) this.line([...segs, dim(rest)])
      else {
        this.line(segs)
        if (rest) this.small(r.rest!)
      }
      for (const s of r.small ?? []) this.small(s)
    }
  }
  /** The narrow form of `bars`: the label and its bar on one line, its figures (each with its column's name) under it. */
  private stacked(rows: BarRow[], header?: string[]) {
    const wantLabel = Math.max(...rows.map(r => textWidth(r.label)))
    const hasBar = rows.some(r => r.value !== undefined)
    const barW = hasBar ? Math.max(MIN_BAR, Math.min(VIEW_BAR, this.width - 3 - wantLabel)) : 0
    const labelW = Math.max(4, Math.min(wantLabel, this.width - 2 - (hasBar ? barW + 1 : 0)))
    const max = Math.max(...rows.map(x => x.value ?? 0))
    for (const r of rows) {
      const label = cutTitle(r.label, labelW)
      const lab: StatSeg = { text: label + ' '.repeat(labelW - textWidth(label)), ...(r.color ? { color: r.color } : {}), ...(r.bold ? { bold: true } : {}), ...(r.dimRow ? { dim: true } : {}) }
      this.line([{ text: '  ' }, lab, ...(hasBar && r.value !== undefined ? [{ text: ' ' }, ...viewBar(r.value, max, barW, r.barColor ?? 'ide')] : [])])
      const figs = r.stack ?? r.cols.flatMap((c, i) => [...(i ? [dim(' · ')] : []), ...c, ...(header?.[i] ? [dim(` ${header[i]}`)] : [])])
      if (figs.length) this.wrapped([{ text: '    ' }, ...figs], 6)
      if (r.rest) this.small(r.rest)
      for (const s of r.small ?? []) this.small(s)
    }
  }
}

/** A number column: the figure (bold, or dim when nothing) and its unit, dim. */
const num = (figure: string, unit = ''): StatSeg[] => [figure === '-' || figure === '0' ? dim(figure) : { text: figure }, ...(unit ? [dim(unit)] : [])]
/** Words and figures by turns: the words dim, the figures bold ("avg 29m · median 28m"). */
const mixed = (...parts: string[]): StatSeg[] => parts.filter(p => p !== '').map((p, i) => (i % 2 ? strong(p) : dim(p)))

/** The kinds of `t` as small print ("input 33k · output 3.2k · ..."); nothing for no tokens. */
const kinds = (t: SymccTokens | undefined): string[] => (tokenCount(t) ? [fmtTokenKinds(t)] : [])

/** The color of a "right first try" share. */
export const firstTryColor = (first: number, of: number) => (!of ? 'inactive' : first / of >= FIRST_TRY_GOOD ? GOOD : first / of >= FIRST_TRY_BAD ? WATCH : BAD)

/** The four headline figures: what each says, its label and its color. */
export function headlineFigures(d: StatsData): { value: string; label: string; color: string }[] {
  const t = d.team?.data
  const perMerged = t ? (t.merged ? fmtTokens(tokenCount(t.total) / t.merged) : '-') : tokOr(d.perDone.avgTok)
  return [
    { value: String(d.done), label: 'merged', color: d.done ? GOOD : 'inactive' },
    { value: pctText(d.first, d.doneWithData), label: 'right first try', color: firstTryColor(d.first, d.doneWithData) },
    { value: perMerged, label: 'tok per merged', color: perMerged === '-' ? 'inactive' : 'text' },
    { value: t?.sessionUsd !== undefined ? fmtCost(t.sessionUsd) : '-', label: 'session (/cost)', color: t?.sessionUsd !== undefined ? 'text' : 'inactive' },
  ]
}

/** The whole view at `width` columns (see the top of this file). */
export function statsLines(d: StatsData, width: number): StatLine[] {
  const W = Math.max(20, Math.floor(width))
  const L = new Lines(W)
  const { name } = d

  // the title bar: "𝄞 symcc stats · <range>" on the left, the task count on the right, a heavy rule
  const left = `${ICON} ${name} stats · ${rangeText(d.range)}`
  const right = `${plural(d.total, 'task')}${d.archivedIn ? `, incl. ${d.archivedIn} archived` : ''}`
  const gap = W - textWidth(left) - textWidth(right)
  if (gap >= 2) L.line([strong(left, ACCENT), { text: ' '.repeat(gap) }, dim(right)], 'title')
  else {
    L.line([strong(left, ACCENT)], 'title')
    L.line([dim(right)], 'title-count')
  }
  L.line([{ text: '━'.repeat(W), color: ACCENT }], 'title-rule')
  const counting = countingText(d.range, d.counting, d.insideAsked, name)
  if (counting) L.wrapped([dim(counting)], 0)
  if (d.archiveProblem) L.wrapped([{ text: `Archived tasks are not counted: ${d.archiveProblem}`, color: WATCH }], 0)
  if (!d.total) {
    L.blank()
    L.line([{ text: d.range.kind === 'all' ? 'No tasks yet.' : 'No tasks in this range.' }])
    footer(L, name)
    return L.out
  }

  // the four headline figures, big and bold, a dim label under each (two to a row on a narrow screen)
  L.blank()
  const figs = headlineFigures(d)
  const per = W >= 48 ? 4 : 2
  const cw = Math.floor(W / per)
  for (let i = 0; i < figs.length; i += per) {
    const row = figs.slice(i, i + per)
    const cellOf = (text: string, w: number) => {
      const t = cutTitle(text, w - 1)
      return t + ' '.repeat(Math.max(0, w - textWidth(t)))
    }
    L.line(row.map(f => ({ text: cellOf(f.value, cw), bold: true, color: f.color })), `headline-${i}`)
    L.line(row.map(f => dim(cellOf(f.label, cw))), `headline-${i}-labels`)
  }
  const more: [string, string][] = [...(d.invCount ? [[`${d.answered}`, ' answered'] as [string, string]] : []), [fmtDuration(d.workMs), ' of work'], ...(d.tokKnown ? [[fmtTokens(tokenCount(d.tokens)), ' tokens'] as [string, string]] : [])]
  L.blank()
  L.wrapped(more.flatMap(([fig, words], i) => [...(i ? [dim(' · ')] : []), strong(fig), dim(words)]), 0)
  if (d.noData) L.wrapped([dim(`(${plural(d.noData, 'task')} with no try data ${d.noData === 1 ? 'is' : 'are'} left out of averages)`)], 1)

  // tasks by state
  L.heading('Tasks by state')
  L.bars(d.states.map(s => ({ label: s.label, color: STATE_COLOR[s.status], value: s.n, barColor: STATE_COLOR[s.status] ?? 'ide', cols: [num(String(s.n)), num(pctText(s.n, d.total))] })))

  // the workers' time and tokens
  L.heading('Worker time and tokens')
  L.kv('worker time', [strong(fmtDuration(d.workMs))])
  L.kv('tokens', d.tokKnown ? tokenSegs(d.tokens) : [dim('-')])
  if (d.tokKnown < d.withData && d.tokKnown) L.small(`${d.tokKnown} of ${d.withData} tasks report tokens`, 15)
  for (const k of kinds(d.tokKnown ? d.tokens : undefined)) L.small(k, 15)
  L.kv('with data', mixed('', `${d.withData}`, ` of ${d.total} tasks`))

  // investigations
  const v = d.inv
  L.heading('Investigations', `${d.invCount}, ${d.answered} answered; not in done, first-try or merge figures`)
  if (d.invCount) {
    L.kv('answered', [...mixed('', `${d.answered}`, ` of ${d.invCount}`), dim(` (${v.readByOwner} read by you, ${v.waiting} waiting to be read)`)])
    L.kv('time', v.withData ? mixed('', fmtDuration(v.ms), ' in all · avg ', durOr(v.avgMs), ' per investigation') : [dim('-')])
    L.kv('tokens', v.tokKnown ? mixed('', fmtTokens(tokenCount(v.tokens)), ' in all · avg ', tokOr(v.avgTok), ' per investigation') : [dim('-')])
    for (const k of kinds(v.tokKnown ? v.tokens : undefined)) L.small(k, 15)
    L.kv('tries', v.withData ? mixed('', `${v.tries}`, ' in all · avg ', (v.avgTries ?? 0).toFixed(1), ' per investigation') : [dim('-')])
  } else L.small('none', 2)

  // the whole team: lead, workers, scouts
  if (d.team) {
    const t = d.team.data
    L.heading('Who spent the tokens', d.team.label)
    const rows: BarRow[] = []
    const tok = (x: SymccTokens) => num(fmtTokens(tokenCount(x)), ' tok')
    if (t.lead) rows.push({ label: `${ORIGIN_MARK.lead} lead`, color: WHO_COLOR.lead, value: tokenCount(t.lead.tokens), barColor: WHO_COLOR.lead, cols: [tok(t.lead.tokens)], rest: `${plural(t.lead.calls, 'call')}${t.lead.sessions !== undefined ? ` · ${plural(t.lead.sessions, 'session')}` : ''}${unreadText(t.leadUnread)}`, small: kinds(t.lead.tokens) })
    rows.push({ label: `${ORIGIN_MARK.worker} workers`, color: WHO_COLOR.worker, value: tokenCount(t.workers.tokens), barColor: WHO_COLOR.worker, cols: [tok(t.workers.tokens)], rest: plural(t.workers.tries, 'try', 'tries'), small: kinds(t.workers.tokens) })
    rows.push({ label: `${ORIGIN_MARK.scout} scouts`, color: WHO_COLOR.scout, value: tokenCount(t.scouts.tokens), barColor: WHO_COLOR.scout, cols: [tok(t.scouts.tokens)], rest: `${plural(t.scouts.runs, 'run')}${t.scouts.runs ? ` · ${fmtDuration(t.scouts.ms)}` : ''}`, small: kinds(t.scouts.tokens) })
    L.bars(rows)
    if (!t.lead) L.wrapped([{ text: `  ${ORIGIN_MARK.lead} lead`, color: WHO_COLOR.lead }, { text: `  not counted: ${t.leadProblem ?? 'no session logs'}${unreadText(t.leadUnread)}`, color: WATCH }], 4)
    L.kv('total', [...tokenSegs(t.total), ...(t.lead ? [] : [dim(' (without the lead)')])])
    for (const k of kinds(t.total)) L.small(k, 15)
    L.kv('per merged', t.merged ? [...mixed('', fmtTokens(tokenCount(t.total) / t.merged), ' in all · about ', fmtTokens(billedTokens(t.total) / t.merged), ' billed'), dim(` (${t.merged} merged)`)] : [dim('- no merged tasks')])
    L.kv('dollars', t.sessionUsd !== undefined ? [strong(fmtCost(t.sessionUsd)), dim(' this session so far, as /cost says (all of it, not split by range)')] : [dim('-')])
    L.small(`not shown per task: ${name} doesn't know the model prices`, 15)
  }

  // per merged task, lead time, per try
  const p = d.perDone
  L.heading('Per merged task', `${plural(d.doneWithData, 'done task')} with data${d.invCount ? ', investigations left out' : ''}`)
  if (d.doneWithData) {
    L.kv('time', mixed('avg ', durOr(p.avgMs), ' · median ', durOr(p.medianMs), ' · total ', durOr(p.sumMs)))
    L.kv('tokens', p.avgTok !== undefined ? [...mixed('avg ', tokOr(p.avgTok), ' · median ', tokOr(p.medianTok), ' · total ', tokOr(p.sumTok)), dim(' (in all)')] : [dim('-')])
    L.kv('tries', mixed('avg ', (p.avgTries ?? 0).toFixed(1), ' per task'))
    L.kv('first try', [strong(pctText(d.first, d.doneWithData), firstTryColor(d.first, d.doneWithData)), dim(` of done tasks (${d.first} of ${d.doneWithData})`)])
  } else L.small('no done tasks with data', 2)
  L.kv('lead time', d.leadTime.n ? [...mixed('avg ', durOr(d.leadTime.avgMs), ' · median ', durOr(d.leadTime.medianMs), ' · total ', durOr(d.leadTime.sumMs)), dim(` (made to done, ${plural(d.leadTime.n, 'task')})`)] : [dim('-')])
  L.heading('Per try', plural(d.perTry.n, 'try', 'tries'))
  L.kv('time', mixed('avg ', durOr(d.perTry.avgMs), ' · total ', durOr(d.perTry.sumMs)))
  L.kv('tokens', mixed('avg ', tokOr(d.perTry.avgTok), ' in all · total ', tokOr(d.perTry.sumTok)))

  // where the time goes: each stage in its color
  const f = d.stages
  L.heading('Where the time goes', `${plural(f.n, 'done task')}${f.lacking ? `; ${f.lacking} without timed history, left out` : ''}`)
  if (!f.n) L.small('no done tasks with timed history', 2)
  else {
    const shown = f.stages.filter(s => s.ms > 0 || (s.stage !== 'backlog' && s.stage !== 'blocked'))
    const stageRow = (label: string, ms: number, avg: number, color?: string, stage?: Stage): BarRow => ({ label, ...(color ? { color } : { bold: true }), ...(stage ? { value: ms, barColor: STAGE_COLOR[stage] } : {}), cols: [num(fmtDuration(ms)), num(fmtDuration(avg)), num(pctText(ms, f.lifetime))] })
    L.bars([...shown.map(s => stageRow(s.label, s.ms, s.avgMs, STAGE_COLOR[s.stage], s.stage)), stageRow('active', f.active, f.active / f.n), stageRow('waiting', f.waiting, f.waiting / f.n), stageRow('lifetime', f.lifetime, f.avgLifetime)], ['total', 'per task', 'share'])
  }

  // the biggest tasks
  const top = (title: string, ts: StatsTop[], fmt: (n: number) => string, color: string) => {
    if (!ts.length) return
    L.heading(title)
    L.bars(ts.map(t => ({ label: `${t.id.padEnd(6)} ${cutTitle(t.title)}`, value: t.value, barColor: color, cols: [num(fmt(t.value))] })))
  }
  top('Most tokens', d.topTokens, fmtTokens, 'claude')
  top('Most time', d.topTime, fmtDuration, 'ide')

  // how tasks ended, and why tries were sent back
  L.heading('How tasks ended', plural(d.finished, 'done task'))
  const endColor = (l: string) => (/^merged on its own/.test(l) ? GOOD : /^approved/.test(l) ? ACCENT : /^answered/.test(l) ? 'ide' : 'inactive')
  L.bars(d.ended.map(e => ({ label: e.label, color: endColor(e.label), value: e.n, barColor: endColor(e.label), cols: [num(String(e.n)), num(pctText(e.n, d.finished))], dimRow: !e.n })))
  L.heading('Why tries were sent back', `${d.failedTotal}, from history`)
  L.bars(d.failed.map(x => ({ label: x.label, color: FAIL_COLOR[x.key] ?? 'text', value: x.n, barColor: FAIL_COLOR[x.key] ?? 'inactive', cols: [num(String(x.n))], dimRow: !x.n, ...(x.folded ? { rest: `(${x.folded})` } : {}) })))

  // each failed try, and the tests that failed most
  const differ = failedCountsNote(d)
  const failed = failedShown(d)
  if (d.failedTries.length || differ) {
    L.heading('Each failed try', `${d.failedTries.length}${d.failedTries.length ? ': task · try · reason · failing command · first failing test' : ''}`)
    if (failed.tries.length < d.failedTries.length) L.small(`(the latest ${failed.tries.length}; every one: /${name}-stats full)`, 2)
    if (differ) L.small(`(${differ})`, 2)
    for (const x of failed.tries)
      L.wrapped([strong(`  ${x.id.padEnd(6)}`, 'claude'), dim(` try ${String(x.try).padEnd(2)} `), { text: x.reason, color: BAD }, ...(x.command ? [dim(' · '), { text: `\`${cutTitle(x.command, 40)}\``, color: 'ide' }] : []), ...(x.test ? [dim(' · '), { text: cutTitle(x.test, 60) }] : [])], 16)
  }
  if (d.failedTests.length) {
    L.heading('Tests that failed most', `tries · tasks${failed.tests.length < d.failedTests.length ? `; top ${failed.tests.length} of ${d.failedTests.length}` : ''}`)
    L.bars(failed.tests.map(x => ({ label: cutTitle(x.name, 50), color: BAD, cols: [num(plural(x.tries, 'try', 'tries')), num(plural(x.tasks, 'task'))] })))
  }

  // by role and where tasks came from: tasks · share · avg tokens · avg time; the totals as small print
  const figCols = (g: StatsGroup) => [num(String(g.n)), num(pctText(g.n, d.total)), num(tokOr(g.avgTok), ' tok'), num(durOr(g.avgMs))]
  const figStack = (g: StatsGroup) => mixed('', String(g.n), ` ${g.n === 1 ? 'task' : 'tasks'} · `, pctText(g.n, d.total), ' share · avg ', tokOr(g.avgTok), ' tok · avg ', durOr(g.avgMs))
  const totalOf = (g: StatsGroup) => (g.sumTok === undefined && g.sumMs === undefined ? [] : [`total ${tokOr(g.sumTok)} tok · ${durOr(g.sumMs)}`])
  const HEAD = ['tasks', 'share', 'avg tokens', 'avg time']
  L.heading('By role')
  L.bars(d.roles.map(g => ({ label: g.label, value: g.n, barColor: 'ide', cols: figCols(g), stack: figStack(g), small: totalOf(g) })), HEAD)
  L.heading('Where tasks came from')
  L.bars(d.origins.map(o => ({ label: o.label, color: WHO_COLOR[o.key] ?? 'inactive', value: o.n, barColor: WHO_COLOR[o.key] ?? 'inactive', cols: o.n ? figCols(o) : [num('0'), num(pctText(0, d.total))], ...(o.n ? { stack: figStack(o) } : {}), small: o.n ? totalOf(o) : [] })), HEAD)
  const scouts: StatsScout[] = d.origins.find(o => o.key === 'scout')?.scouts ?? []
  if (scouts.length) {
    L.heading('Scouts')
    L.bars(scouts.map(s => ({ label: s.label, color: WHO_COLOR.scout, value: s.n, barColor: WHO_COLOR.scout, cols: s.idle ? [num('0'), num(pctText(0, d.total))] : figCols(s), ...(s.idle ? {} : { stack: figStack(s) }), dimRow: !!s.idle, small: [scoutResultsText(s.results), ...(s.idle ? [] : totalOf(s)), ...(s.unlinked !== undefined && !s.idle ? [unlinkedText(s.unlinked)] : [])] })), HEAD)
  }

  // the last 7 days with activity
  L.heading('Last 7 days', 'with activity: done · work · tokens')
  if (!d.days.length) L.small('no activity', 2)
  L.bars(d.days.map(x => ({ label: x.label, ...(x.day === d.today ? { bold: true } : {}), value: x.done, barColor: GOOD, cols: [num(String(x.done)), num(fmtDuration(x.ms)), num(fmtTokens(x.tokens), ' tok')] })))

  // the small print, the footer rule and the hints
  L.blank()
  L.small(BILLED_FOOTNOTE, 0)
  footer(L, name)
  return L.out
}

/** "100.6k in all · about 55.5k billed*", the figures bold; the unsplit tokens the billed figure leaves out as small print. */
function tokenSegs(t: SymccTokens): StatSeg[] {
  const un = t.unsplit ?? 0
  return [...mixed('', fmtTokens(tokenCount(t)), ' in all · about ', fmtTokens(billedTokens(t)), ' billed*'), ...(un ? [dim(` (leaves out ${fmtTokens(un)} unsplit)`)] : [])]
}

/** The footer: a rule, then the hints ("/symcc-stats full · every number   /symcc-stats 7d · last week"), each whole. */
function footer(L: Lines, name: string) {
  L.line([{ text: '─'.repeat(L.width), color: 'subtle' }], 'footer-rule')
  const hints = [[`/${name}-stats full`, 'every number'], [`/${name}-stats 7d`, 'last week']] as const
  const segs = (h: readonly [string, string]): StatSeg[] => [strong(h[0]), dim(` · ${h[1]}`)]
  const one = [...segs(hints[0]), { text: '   ' }, ...segs(hints[1])]
  if (segsWidth(one) <= L.width) L.line(one, 'footer')
  else hints.forEach((h, i) => L.line(segs(h), `footer-${i}`))
}
