// The /<name>-stats report as plain text (statsReport), the figures it was made from (statsDataOf), and the text
// lines of its parts (spreads, stages, the whole team). The figures themselves are made in ./stats.
import type { SymccTokens } from '../../types'
import { DEFAULT_NAME } from '../name'
import { ORIGIN_MARK } from './origin'
import { plural } from './text'
import { cutTitle, padWidth, wrapLine } from './width'
import { billedTokens, fmtCost, fmtDuration, fmtTokenKinds, fmtTokens, tokenCount } from './runs'
import { BAR_WIDTH, BILLED_FOOTNOTE, BILLED_NOTE, STAGES_NOTE, bar, billedText, countingText, durOr, failedShown, pctText as pct, scoutResultsText, statsData, statsTitle, teamData, tokOr, tokensText, unlinkedText, type Spread, type SpreadRow, type StageFigures, type StatsData, type StatsGroup, type StatsInput, type StatsTop, type TeamData, type TeamInput } from './stats'

const row = (label: string, text: string, w = 12) => `  ${label.padEnd(w)} ${text}`

/** One bar row: "  label  ▇▇▇▇  81  39%" plus any `rest`; the bar padded so the numbers line up. */
const barRow = (label: string, w: number, value: number, max: number, total: number | null, rest = '') =>
  `  ${label.padEnd(w)} ${bar(value, max).padEnd(BAR_WIDTH)} ${String(value).padStart(4)}${total === null ? '' : ` ${pct(value, total).padStart(4)}`}${rest ? `  ${rest}` : ''}`

/** The kinds of `t` on their own line under a figure, e.g. "               input 1k · output 2k · ..."; none for no tokens. */
const kindsRow = (t: SymccTokens | undefined, w = 12): string[] => (tokenCount(t) ? [row('', fmtTokenKinds(t), w)] : [])

/** The text lines of a spread chart (same bars and columns as the other bar rows). */
export function spreadLines(sp: Spread): string[] {
  if (!sp.rows) return [`  ${sp.tooFew}`]
  const w = Math.max(...sp.rows.map(r => r.label.length))
  const max = Math.max(...sp.rows.map(r => r.n))
  const line = (r: SpreadRow) => `  ${r.label.padEnd(w)} ${bar(r.n, max).padEnd(BAR_WIDTH)} ${String(r.n).padStart(4)}${r.note ? `  ${r.note}` : ''}`
  const mid = `median ${sp.medianText}`
  const width = w + 1 + BAR_WIDTH + 5
  const dash = Math.max(3, Math.floor((width - mid.length - 2) / 2))
  return [`${sp.title} · median ${sp.medianText} · ${plural(sp.n, 'task')}`, ...sp.rows.slice(0, 3).map(line), `  ${'─'.repeat(dash)} ${mid} ${'─'.repeat(dash)}`, ...sp.rows.slice(3).map(line)]
}

/** The one-line summary figures, in the order both reports show them: "12 done", "3 answered", "4h 10m of work", "1.2M tokens", "75% right first try". */
export function headlineParts(d: StatsData): string[] {
  return [`${d.done} done`, ...(d.invCount ? [`${d.answered} answered`] : []), `${fmtDuration(d.workMs)} of work`, ...(d.tokKnown ? [`${fmtTokens(tokenCount(d.tokens))} tokens`] : []), ...(d.doneWithData ? [`${pct(d.first, d.doneWithData)} right first try`] : [])]
}

/**
 * T-735: when "Each failed try" (each try's own end) and "Failed tries" (timeline lines) count differently, why; '' when
 * they agree. Both leave out tries stopped on purpose (onPurposeStop). T-736: "Failed tries" now has every failed end
 * (checker send-backs, time-outs, no result, no change, not merged ...); what still differs is a try rejected by the
 * owner or restarted by a change (its own end is "ready for review" or "restarted"). T-743: a restart symcc did itself
 * (a reopen, a reload) is counted in neither: the same try goes on.
 */
export function failedCountsNote(d: Pick<StatsData, 'failedTries' | 'failedTotal'>): string {
  if (d.failedTries.length === d.failedTotal) return ''
  return `${d.failedTries.length} here, ${d.failedTotal} under "Failed tries": this list reads each saved try's own end; that count reads the timeline lines, which also count tries rejected by you and restarts by a change, whose own end is a review or a restart`
}

/**
 * The whole /<name>-stats report as plain text, every line at most 80 columns. The summary view
 * keeps every figure, with bars; `full` adds the long explanations (how billed is weighed,
 * where the lead's tokens come from, how the stage times, waiting included, are read).
 */
export function statsReport(input: StatsInput & { full?: boolean }): string {
  const d = statsData(input)
  const { full, name } = d
  const out: string[] = []
  const done$ = () => remember(out.flatMap(l => wrapLine(l)).join('\n'), d)
  out.push(`${statsTitle(d)}${full ? ' · full' : ''}`)
  const counting = countingText(d.range, d.counting, d.insideAsked, name)
  if (counting) out.push(counting)
  if (d.archiveProblem) out.push(`Archived tasks are not counted: ${d.archiveProblem}`)
  if (!d.total) {
    out.push('', d.range.kind === 'all' ? 'No tasks yet.' : 'No tasks in this range.')
    return done$()
  }

  // The one-line summary
  out.push('', headlineParts(d).join(' · '))
  if (d.noData) out.push(`(${plural(d.noData, 'task')} with no try data ${d.noData === 1 ? 'is' : 'are'} left out of averages)`)

  // Tasks by status
  const maxCount = Math.max(...d.states.map(s => s.n))
  out.push('', 'Tasks')
  for (const s of d.states) out.push(barRow(s.label, 12, s.n, maxCount, d.total))

  // Worker totals
  out.push('', 'Work')
  out.push(row('worker time', fmtDuration(d.workMs)))
  out.push(row('tokens', d.tokKnown ? `${tokensText(d.tokens)}${d.tokKnown < d.withData ? ` (${d.tokKnown} of ${d.withData} tasks report tokens)` : ''}` : '-'))
  if (d.tokKnown) out.push(...kindsRow(d.tokens))
  if (full && d.tokKnown) out.push(row('billed-eq.', billedText(d.tokens)))
  out.push(row('with data', `${d.withData} of ${d.total} tasks`))

  // Investigations: how many, how many answered, their time and tokens
  const v = d.inv
  out.push('', `Investigations (${d.invCount}, ${d.answered} answered; not in done, first-try or merge figures)`)
  if (d.invCount) {
    out.push(row('answered', `${d.answered} of ${d.invCount} (${v.readByOwner} read by you, ${v.waiting} waiting to be read)`))
    out.push(row('time', v.withData ? `${fmtDuration(v.ms)} in all · avg ${durOr(v.avgMs)} per investigation` : '-'))
    out.push(row('tokens', v.tokKnown ? `${fmtTokens(tokenCount(v.tokens))} in all · avg ${tokOr(v.avgTok)} per investigation` : '-'))
    if (v.tokKnown) out.push(...kindsRow(v.tokens))
    out.push(row('tries', v.withData ? `${v.tries} in all · avg ${(v.avgTries ?? 0).toFixed(1)} per investigation` : '-'))
  } else out.push('  none')
  if (d.errandsDone) out.push('', `Errands: ${d.errandsDone} errand done`)

  // Whole team: the lead and the scouts too, not only the workers
  if (d.team) {
    out.push('', `Whole team (${d.team.label})`)
    out.push(...teamDataLines(d.team.data, name, full))
  }

  // Per done task, per try, lead time
  const p = d.perDone
  out.push('', `Per done task (${plural(d.doneWithData, 'done task')} with data${d.invCount ? ', investigations left out' : ''})`)
  if (d.doneWithData) {
    out.push(row('time', `avg ${durOr(p.avgMs)} · median ${durOr(p.medianMs)} · total ${durOr(p.sumMs)}`))
    out.push(row('tokens', p.avgTok !== undefined ? `avg ${tokOr(p.avgTok)} · median ${tokOr(p.medianTok)} · total ${tokOr(p.sumTok)} (in all)` : '-'))
    out.push(row('tries', `avg ${(p.avgTries ?? 0).toFixed(1)} per task`))
    out.push(row('first try', `${pct(d.first, d.doneWithData)} of done tasks (${d.first} of ${d.doneWithData})`))
    out.push('', ...spreadLines(d.spreadTime), '', ...spreadLines(d.spreadTok))
  } else out.push('  no done tasks with data')
  out.push(row('lead time', d.leadTime.n ? `avg ${durOr(d.leadTime.avgMs)} · median ${durOr(d.leadTime.medianMs)} · total ${durOr(d.leadTime.sumMs)} (made to done, ${plural(d.leadTime.n, 'task')})` : '-'))
  out.push('', `Per try (${plural(d.perTry.n, 'try', 'tries')})`)
  out.push(row('time', `avg ${durOr(d.perTry.avgMs)} · total ${durOr(d.perTry.sumMs)}`))
  out.push(row('tokens', `avg ${tokOr(d.perTry.avgTok)} in all · total ${tokOr(d.perTry.sumTok)}`))

  // Time per stage (T-719): where the done tasks' lifetime went, from their tries and timed timeline
  out.push('', ...stageLines(d.stages, full))

  // The biggest tasks
  const top = (title: string, ts: StatsTop[], fmt: (n: number) => string) => {
    if (!ts.length) return
    const max = ts[0]!.value
    out.push('', title, ...ts.map(t => `  ${t.id.padEnd(6)} ${padWidth(cutTitle(t.title), 35)} ${bar(t.value, max).padEnd(BAR_WIDTH)} ${fmt(t.value).padStart(7)}`))
  }
  top('Most tokens', d.topTokens, fmtTokens)
  top('Most time', d.topTime, fmtDuration)

  // How tasks ended: merged changes, and investigations answered (read by the owner)
  out.push('', `How tasks ended (${plural(d.finished, 'done task')})`)
  const maxEnd = Math.max(...d.ended.map(e => e.n))
  for (const e of d.ended) out.push(barRow(e.label, 24, e.n, maxEnd, d.finished))
  const maxFail = Math.max(0, ...d.failed.map(f => f.n))
  out.push(`  Failed tries (${d.failedTotal}, from timeline)`)
  for (const f of d.failed) out.push(barRow(`  ${f.label}`, 24, f.n, maxFail, null, f.folded ? `(${f.folded})` : ''))

  // T-721: each failed try (short: the latest FAILED_TRIES_SHORT), and the tests that failed most (short: the top FAILED_TESTS_SHORT)
  const differ = failedCountsNote(d)
  const failed = failedShown(d)
  if (d.failedTries.length || differ) {
    const shown = failed.tries
    out.push('', `Each failed try (${d.failedTries.length}${d.failedTries.length ? ': task · try · reason · failing command · first failing test' : ''})`)
    if (shown.length < d.failedTries.length) out.push(`  (the latest ${shown.length}; every one: /${name}-stats full)`)
    if (differ) out.push(`  (${differ})`)
    for (const f of shown) out.push(`  ${f.id.padEnd(6)} try ${String(f.try).padEnd(2)} ${[f.reason, f.command && `\`${cutTitle(f.command, 40)}\``, f.test && cutTitle(f.test, 60)].filter(Boolean).join(' · ')}`)
  }
  if (d.failedTests.length) {
    const shown = failed.tests
    out.push('', `Tests that failed most (tries · tasks${shown.length < d.failedTests.length ? `; top ${shown.length} of ${d.failedTests.length}` : ''})`)
    for (const x of shown) out.push(`  ${padWidth(cutTitle(x.name, 50), 50)} ${plural(x.tries, 'try', 'tries').padStart(9)} · ${plural(x.tasks, 'task')}`)
  }

  // By role and by origin: tasks, share, avg tokens and avg time per group
  const figsOf = (g: StatsGroup) => `avg ${tokOr(g.avgTok).padStart(6)} tok · ${durOr(g.avgMs).padStart(7)}`
  const totalOf = (g: StatsGroup, pad: number) => (g.sumTok === undefined && g.sumMs === undefined ? [] : [`${' '.repeat(pad)}total ${tokOr(g.sumTok)} tok · ${durOr(g.sumMs)}`])
  const roleW = Math.max(12, ...d.roles.map(g => g.key.length))
  out.push('', 'By role (tasks · share · avg tokens · avg time; total under it)')
  for (const g of d.roles) out.push(barRow(g.label, roleW, g.n, d.roles[0]!.n, d.total, figsOf(g)), ...totalOf(g, 4))

  const scouts = d.origins.find(o => o.key === 'scout')?.scouts ?? []
  const originW = Math.max(14, ...scouts.map(s => s.key.length + 4))
  const maxOrigin = d.origins[0]!.n
  out.push('', 'Where tasks came from (tasks · share · avg tokens · avg time; total under it)')
  for (const o of d.origins) {
    out.push(barRow(o.label, originW, o.n, maxOrigin, d.total, o.n ? figsOf(o) : ''), ...(o.n ? totalOf(o, 4) : []))
    for (const s of o.scouts ?? []) {
      out.push(s.idle ? barRow(`    ${s.label}`, originW, 0, maxOrigin, d.total) : barRow(`    ${s.label}`, originW, s.n, maxOrigin, d.total, figsOf(s)), `        ${scoutResultsText(s.results)}`, ...(s.idle ? [] : totalOf(s, 8)))
      if (s.unlinked !== undefined && !s.idle) out.push(`        ${unlinkedText(s.unlinked)}`)
    }
  }

  // Done per day
  const maxDay = Math.max(0, ...d.days.map(x => x.done))
  out.push('', 'Done per day (the last 7 days with activity: done · work · tokens)')
  if (!d.days.length) out.push('  no activity')
  for (const x of d.days) out.push(barRow(x.label, 12, x.done, maxDay, null, `${fmtDuration(x.ms).padStart(7)} · ${fmtTokens(x.tokens).padStart(6)} tokens`))

  // Footnotes
  out.push('')
  if (full) out.push(`Stages: ${STAGES_NOTE}`, `Tokens "in all" add every kind up; billed is ${BILLED_NOTE}.`)
  else out.push(BILLED_FOOTNOTE, `Every detail: /${name}-stats full`)
  return done$()
}

/** T-768: how many of the latest report texts keep their figures (see statsDataOf). */
const REMEMBERED_MAX = 20
const remembered = new Map<string, StatsData>()
/** Keeps the figures `d` of report text `text` (the latest REMEMBERED_MAX texts), and gives the text back. */
function remember(text: string, d: StatsData): string {
  remembered.delete(text)
  remembered.set(text, d)
  while (remembered.size > REMEMBERED_MAX) remembered.delete(remembered.keys().next().value!)
  return text
}
/**
 * T-768: the figures a report text (from statsReport) was made from, so a client can draw that report its own way
 * (Claude Code's chat, claude/ui/stats-output.tsx) without reading the text back; undefined for a text it didn't make
 * (or one made before the plugin was loaded again), which is then shown as it is.
 */
export function statsDataOf(text: string): StatsData | undefined {
  const t = String(text ?? '').trim()
  // Claude Code puts "<name>: " (e.g. "symcc: ") before a command's text (T-788)
  return remembered.get(text) ?? remembered.get(t) ?? remembered.get(t.replace(/^[\w.-]+: /, ''))
}

/** The "Time per stage" lines for figures `f`: per stage the total, the average per done task and its share of the lifetime; then active, waiting and the lifetime. */
export function stageLines(f: StageFigures, full = false): string[] {
  const out = [`Time per stage (${plural(f.n, 'done task')}${f.lacking ? `; ${f.lacking} without timed timeline, left out` : ''})`]
  if (!f.n) return [...out, '  no done tasks with timed timeline']
  const shown = f.stages.filter(s => s.ms > 0 || (s.stage !== 'backlog' && s.stage !== 'blocked'))
  const max = Math.max(...shown.map(s => s.ms))
  const w = 16
  const line = (label: string, ms: number, avg: number, b = '') => `  ${label.padEnd(w)} ${b.padEnd(BAR_WIDTH)} ${fmtDuration(ms).padStart(8)} · avg ${fmtDuration(avg).padStart(7)} ${pct(ms, f.lifetime).padStart(4)}`
  out.push(`  ${''.padEnd(w)} ${''.padEnd(BAR_WIDTH)} ${'total'.padStart(8)} · ${'per task'.padStart(11)} share`)
  for (const s of shown) out.push(line(s.label, s.ms, s.avgMs, bar(s.ms, max)))
  out.push(line('active', f.active, f.active / f.n), line('waiting', f.waiting, f.waiting / f.n), line('lifetime', f.lifetime, f.avgLifetime))
  if (full) out.push('  active: work, prep, check, tests and merge; waiting: the rest (to start, on tasks, merge queue, you)')
  return out
}

/**
 * The "Whole team" lines: lead · workers · scouts with bars, each with its kinds apart on the next
 * line, the total with its billed-equivalent, the tokens per merged task and the dollar line.
 * `full` adds where the lead's tokens come from and how billed is weighed.
 */
export function teamLines(team: TeamInput, span: { from?: number; to?: number }, workers: { tokens: SymccTokens; tries: number }, merged: number, name: string = DEFAULT_NAME, full = false): string[] {
  return teamDataLines(teamData(team, span, workers, merged), name, full)
}

/** T-762: the note after the lead's row when some session logs couldn't be read, so its figure is never silently low ("" when all were read). */
export const unreadText = (n: number | undefined) => n ? ` · ${plural(n, 'session log')} too big to read` : ''

/** The "Whole team" lines for figures `d` (see teamLines). */
export function teamDataLines(d: TeamData, name: string = DEFAULT_NAME, full = false): string[] {
  const { lead, workers, merged, total } = d
  const sc = d.scouts
  const max = Math.max(tokenCount(lead?.tokens), tokenCount(workers.tokens), tokenCount(sc.tokens))
  const n = (t: SymccTokens) => fmtTokens(tokenCount(t)).padStart(6)
  const w = 12
  const part = (label: string, t: SymccTokens, what: string) => [`  ${label.padEnd(w)} ${bar(tokenCount(t), max).padEnd(BAR_WIDTH)} ${n(t)} tokens · ${what}`, ...kindsRow(t, w)]
  const out: string[] = []
  if (lead) out.push(...part(`${ORIGIN_MARK.lead} lead`, lead.tokens, `${plural(lead.calls, 'call')}${lead.sessions !== undefined ? ` · ${plural(lead.sessions, 'session')}` : ''}${full && lead.from ? `, from ${lead.from}` : ''}${unreadText(d.leadUnread)}`))
  else out.push(row(`${ORIGIN_MARK.lead} lead`, `not counted: ${d.leadProblem ?? 'no session logs'}${unreadText(d.leadUnread)}`))
  out.push(...part(`${ORIGIN_MARK.worker} workers`, workers.tokens, plural(workers.tries, 'try', 'tries')))
  out.push(...part(`${ORIGIN_MARK.scout} scouts`, sc.tokens, `${plural(sc.runs, 'run')}${sc.runs ? ` · ${fmtDuration(sc.ms)}` : ''}`))
  out.push(row('total', `${tokensText(total)}${lead ? '' : ' (without the lead)'}`), ...kindsRow(total))
  if (full) out.push(row('billed-eq.', billedText(total)))
  out.push(row('per merged', merged ? `${fmtTokens(tokenCount(total) / merged)} in all, about ${fmtTokens(billedTokens(total) / merged)} billed per merged task (${merged} merged)` : '- no merged tasks'))
  out.push(row('dollars', `not shown: ${name} doesn't know the model prices${d.sessionUsd !== undefined ? ` (this session so far, as /cost says: ${fmtCost(d.sessionUsd)}, all of it, not split by range)` : ''}`))
  return out
}
