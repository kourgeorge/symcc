// The band above OpenCode's prompt (session.composer.top), as plain data (T-798: split out of board-view.ts): its
// lines of colored text and what a click on each does, made from the view file with hooks/core's band helpers.
import { statusCounts, newestFirst, bandLeads, bandNote, bandBrand, bandWhere, modeLabel, modeOf, planBandText, withCrew, questionsForYou, rowTitle, driveWarning, rowEndText, taskPhase, shownStatus } from '../board'
import type { ViewFile, Line } from './board-view'

/** The colors of the band's rows, as Claude Code's band has them (above-prompt.tsx). */
const BAND_COLOR: Record<string, string> = { review: 'cyan', waiting: 'yellow', failed: 'red', doing: 'green' }

/** What a click on a line of the band does (T-567): open (or close) the board panel, or open a task's or question's
 *  page in it. */
export type BandHit = { board: true } | { open: string }

/** The hint at the header's end that it is a button; dropped first when the line has no room for it. */
export const BAND_CLICK_HINT = ' (click: board)'

/** What OpenCode's strip says in a folder with no board. */
export const NO_BOARD_HINT = 'no board here · /symcc-init'

/** The band above the prompt (bandDraw's lines). */
export function bandLines(f: ViewFile | null, nowMs: number, width: number, rows = 6): Line[] {
  return bandDraw(f, nowMs, width, rows).lines
}

/**
 * The band above the prompt, like Claude Code's (T-455/T-461), with what a click on each line does (the header and
 * the "+N more" line open the board panel, a question's or task's row opens its page): the header line (brand,
 * folder, mode, questions for you, workers, counts, scouts, then the " (click: board)" hint, dropped first when short
 * of room), the owner's open questions, then the tasks that need the owner or run, newest first, each with its
 * lined-up front ("T-434 ✎ 2m ↺2", "T-440 ▶ 12m", see bandLeads) and its note when the state doesn't already say
 * it (bandNote), and "+N more" when they don't all fit. No lines when there is nothing to show (an empty board, or
 * symcc disabled). `rows`: at most this many rows under the header.
 */
export function bandDraw(f: ViewFile | null, nowMs: number, width: number, rows = 6): { lines: Line[]; hits: (BandHit | null)[] } {
  const v = f?.view
  const tasks = v?.tasks ?? []
  const questions = v?.questions ?? []
  // T-860: no view file means no board in this folder: the one quiet hint
  if (!f) return { lines: [[{ text: NO_BOARD_HINT, color: 'inactive' }]], hits: [null] }
  if ( !v || (!tasks.length && !questions.length) || v.on_here === false) return { lines: [], hits: [] }
  // an approved task whose approve runs counts and shows as doing (shownStatus)
  const summary = statusCounts(tasks, ['doing', 'todo', 'paused', 'review', 'waiting', 'failed', 'done'], nowMs).join(' · ')
  const order = ['review', 'waiting', 'failed', 'doing']
  const live = tasks.filter(t => order.includes(t.status)).sort(newestFirst)
  const plan = v.plan_mode ? planBandText(tasks.filter(t => t.status === 'doing').length) : ''
  const crew = { mode: modeOf(v), plan_mode: !!plan, max_parallel: v.max_parallel, tasks, scouts: v.scouts ?? [] }
  const facts = (room: number) => withCrew((w, s) => `${bandWhere(f.root, f.name)} ${[modeLabel(modeOf(v)), questionsForYou(questions.length), w, summary, s, plan].filter(Boolean).join(' · ')}`, crew, nowMs, room)
  // "𝄞 symcc", then " · <project>" only when it isn't called symcc too (see bandBrand), then the state
  const brand = bandBrand(f.name)
  // T-643: another session drives: a warning mark right after the brand, so it is never cut off
  // T-952: it names the driver when there is room; the band's facts keep about 32 columns beside it
  const drive = driveWarning(v.driving ?? false, tasks, nowMs, f.name, Math.max(24, width - brand.length - 33), v.driver)
  const mark = drive ? ` ${drive}` : ''
  const head = { brand, facts: facts(width - brand.length - mark.length - 1) }
  const headLen = head.brand.length + mark.length + head.facts.length
  const hint = headLen + BAND_CLICK_HINT.length <= width ? [{ text: BAND_CLICK_HINT, color: 'inactive' }] : []
  const out: Line[] = [[{ text: head.brand, color: 'ide', bold: true }, ...(mark ? [{ text: mark, color: 'warning' }] : []), { text: head.facts, color: 'inactive' }, ...hint]]
  const hits: (BandHit | null)[] = [{ board: true }]
  const asks = questions.slice(0, rows)
  for (const q of asks) hits.push({ open: q.id }), out.push([{ text: `${q.id} for you`, color: 'yellow' }, { text: ` ${q.text}`, color: 'text' }, ...(q.options.length ? [{ text: ` — ${q.options.join(' | ')}`, color: 'inactive' }] : [])])
  const shown = live.slice(0, Math.max(0, rows - asks.length))
  const since = (id: string) => v.working?.find(w => w.task === id)?.since
  const leads = bandLeads(shown, nowMs, since, width)
  for (const t of shown) {
    // the row's end text, the same in Claude Code's band and the lead's board (rowEndText)
    const end = rowEndText(t, taskPhase(t, nowMs), bandNote(t, nowMs, since(t.id), v.driving ?? false))
    const tail = end ? ` — ${end}` : ''
    hits.push({ open: t.id })
    out.push([{ text: leads.get(t.id)!, color: BAND_COLOR[shownStatus(t, nowMs)] ?? 'text' }, { text: ` ${rowTitle(t)}`, color: 'text' }, ...(tail ? [{ text: tail, color: 'inactive' }] : [])])
  }
  if (live.length + questions.length > rows) hits.push({ board: true }), out.push([{ text: `+${live.length + questions.length - rows} more · /${f.name}`, color: 'inactive' }])
  return { lines: out, hits }
}
