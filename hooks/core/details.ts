// The task page: its labelled rows and wrapping them to the panel width.
import type { SymccStatus, SymccTask } from '../../types'
import { type BoardTask, intoOf, isInvestigation, modeOf, STATUS_WORD } from './board-file'
import { crossBranchNotes } from './git-setup'
import { shortSha, taskCommits } from './commits'
import { originMark, originOf } from './origin'
import { findKind, type KindDef, kindMark } from './kinds'
import { findRole, type RoleDef, roleOf } from './roles'
import { fmtTotal, sumRuns } from './runs'
import { squash } from './text'
import { checkStepNow } from './lead'
import { IN_LINE_ICON, rowTime, STEP_ICON, STEP_WORD, waitsInLine } from './panel'

/** A piece of text on the task page with its theme color name (see C() in claude/ui/parts.tsx). */
export type Seg = { text: string; color: string; bold?: boolean; italic?: boolean }
/** One labelled row on the task page ("Role:", "From:", …); a row with an empty label continues the one above. */
export type DetailRow = { label: string; segs: Seg[] }

/** The name of a task's current-state line (its `note`, e.g. "worker on it") on every view: the task page, the VS Code
 *  task page, the text board and the copied text. Change it here only; each view keeps its own casing. */
export const STATE_LABEL = 'Now'
/** STATE_LABEL in lower case, for the plain-text views ("now: worker on it"). */
export const stateLabelLower = () => STATE_LABEL.toLowerCase()

/** The status badge colors on the task page: doing blue, review and waiting yellow, done green, failed red, the rest dim. */
export const STATUS_BADGE: Record<SymccStatus, string> = { backlog: 'inactive', todo: 'inactive', doing: 'ide', review: 'warning', waiting: 'warning', paused: 'suggestion', failed: 'error', done: 'success', dropped: 'inactive' }
export const STATUS_MARK: Record<SymccStatus, string> = { backlog: '◇', review: '◆', waiting: '?', failed: '✗', doing: '▶', paused: '‖', todo: '○', done: '✓', dropped: '–' }
/** A to do task that was worked on before (at least one try: failed tests, sent back, stopped, retried) shows this
 *  filled circle instead of ○; the word stays "to do". */
export const TRIED_TODO_MARK = '●'
/** A task's own mark on every view: STATUS_MARK for its state, but ● for a to do task that already had a try. Keep
 *  STATUS_MARK for places that mean the state itself (a legend, a group heading). */
export const statusMark = (t: Pick<SymccTask, 'status'> & { runs?: readonly unknown[]; attempts?: number }): string =>
  t.status === 'todo' && ((t.runs?.length ?? 0) > 0 || (t.attempts ?? 0) > 0) ? TRIED_TODO_MARK : STATUS_MARK[t.status]

/** The step a task is in on its page, its row icon and its word ("⧗ test", "⋯ in line"); '' when it is in none. */
export function stepNowWord(t: Pick<BoardTask, 'status' | 'checking'> & { note?: string }, nowMs: number): string {
  if (inLineNow(t)) return `${IN_LINE_ICON} in line`
  const step = checkStepNow(t, nowMs)
  return step ? `${STEP_ICON[step]} ${STEP_WORD[step]}` : ''
}

/** Whether task `t` waits in the merge line: a doing task (waitsInLine) or an approved review task (its approve runs
 *  prep → line → test → merge while its status stays review, and the merge line sets its note to "in line (n)"). */
const inLineNow = (t: { status: SymccStatus; note?: string }): boolean => waitsInLine({ ...t, status: t.status === 'review' ? 'doing' : t.status })

/** What the task page's badge and Status line need of a task. */
type BadgeTask = Pick<SymccTask, 'status' | 'runs'> & { note?: string; attempts?: number } & Pick<BoardTask, 'checking'>

/**
 * The task page's status badge (and its Status line): the step a doing task is in, with the same icon as its row
 * (rowMark) and the step's word, then the total work time the rows show (rowTime): "▶ worker · 15m", "✎ prep · 15m",
 * "⌕ checker · 5m", "⋯ in line (2) · 9m", "⧗ test · 9m", "⇢ merge · 9m". A task in review or waiting in a check step
 * (an approve) shows the step without a time ("⇢ merge"), and so does a task in review whose approve this page
 * started (`merging`) before its first step is on the board ("✎ prep"): not "ready for review", the owner has
 * nothing left to do on it. Every other task: its mark and status word ("◆ ready for review", "○ to do").
 * `color`: the badge color of its status (doing's while an approve runs, see shownStatus).
 */
export function statusBadge(t: BadgeTask, nowMs: number, since?: number | string, merging = false): { text: string; color: string } {
  const step = checkStepNow(t, nowMs) || (merging && t.status === 'review' ? 'prep' : '')
  const color = STATUS_BADGE[step ? 'doing' : t.status]
  if (t.status !== 'doing') return { text: inLineNow(t) ? `${IN_LINE_ICON} ${t.note}` : step ? `${STEP_ICON[step]} ${STEP_WORD[step]}` : `${statusMark(t)} ${STATUS_WORD[t.status]}`, color }
  const word = inLineNow(t) ? `${IN_LINE_ICON} ${t.note}` : step ? `${STEP_ICON[step]} ${STEP_WORD[step]}` : `${STATUS_MARK.doing} worker`
  const time = rowTime(t, nowMs, since)
  return { text: time ? `${word} · ${time}` : word, color }
}

/** The steps of a task's way to the merge, in order, as its Stage line names them. */
export type StageStep = 'worker' | 'prep' | 'checker' | 'line' | 'test' | 'review' | 'merge'
/** One step on the Stage line: done (✓), the one it is in now (●), or later (dim). */
export type StageMark = { step: StageStep; state: 'done' | 'now' | 'later' }

/**
 * Where task `t` is on its way to the merge (the task page's Stage line): worker → prep → checker → line → test →
 * merge, with "checker" only when the checker setting is on (`board.checker`) or a checker ran on this try, and
 * "review" after "test" when the task waits for the owner's review (any mode but auto, or needs review; always for a
 * task in review). A doing task: the steps before its step done, its step now, the rest later; a task in review: all
 * done up to review, review now; once approved and in a check step, all done up to "review ✓", then only the
 * approve's step it is in now and the merge ("… test ✓ → review ✓ → ● test → merge", "… review ✓ → ● merge"); a done task: all done. null for the
 * other statuses and for an investigation (nothing is merged).
 */
export function taskStage(t: BadgeTask & Pick<SymccTask, 'needs_review'> & { kind?: unknown; checker?: string }, nowMs: number, board: { mode?: unknown; checker?: unknown } = {}): StageMark[] | null {
  if (!['doing', 'review', 'done'].includes(t.status) || isInvestigation(t)) return null
  const step = checkStepNow(t, nowMs)
  const hadChecker = (t.runs?.[t.runs.length - 1]?.checkers?.length ?? 0) > 0 || !!t.checker || step === 'checker'
  const review = t.status === 'review' || modeOf(board) !== 'auto' || t.needs_review === true
  const first: StageStep[] = ['worker', 'prep', ...(board.checker === true || hadChecker ? ['checker' as const] : []), 'line', 'test']
  // an approved task in review runs prep → line → test → merge again (its status stays review): every step up to
  // "review ✓" done, then only the approve's step it is in now and the merge, never its own finished steps again, so
  // the line agrees with the badge and names no step twice (waiting in the merge line, note "in line (n)", it is at
  // "line" even while its step still says prep)
  const inLine = inLineNow(t)
  if (t.status === 'review' && (step || inLine)) {
    const cur: StageStep = inLine ? 'line' : step === 'testing' ? 'test' : step === 'merging' ? 'merge' : step || 'prep'
    const after: StageMark[] = cur === 'merge' ? [{ step: 'merge', state: 'now' }] : [{ step: cur, state: 'now' }, { step: 'merge', state: 'later' }]
    return [...[...first, 'review' as const].map(s => ({ step: s, state: 'done' as const })), ...after]
  }
  const steps: StageStep[] = [...first, ...(review ? ['review' as const] : []), 'merge']
  const now: StageStep | 'all' =
    t.status === 'done' ? 'all'
    : t.status === 'review' ? 'review'
    : inLine ? 'line'
    : step === 'testing' ? 'test'
    : step === 'merging' ? 'merge'
    : step || 'worker'
  const at = now === 'all' ? steps.length : steps.indexOf(now)
  return steps.map((s, i) => ({ step: s, state: i < at ? 'done' : i === at ? 'now' : 'later' }))
}

/** The Stage line's pieces: "worker ✓ → prep ✓ → ● checker → line → test → merge", the steps done with ✓, the one it is
 *  in bold with ●, the later ones dim. */
export function stageSegs(stage: readonly StageMark[]): Seg[] {
  return stage.flatMap((m, i): Seg[] => [
    ...(i ? [{ text: ' → ', color: 'inactive' }] : []),
    m.state === 'done' ? { text: `${m.step} ✓`, color: 'success' } : m.state === 'now' ? { text: `● ${m.step}`, color: 'ide', bold: true } : { text: m.step, color: 'inactive' },
  ])
}

/** The Stage line as plain text (see stageSegs). */
export const stageText = (stage: readonly StageMark[]): string => stageSegs(stage).map(g => g.text).join('')

/**
 * Who a task came from, with its own color, after its one-width mark (ORIGIN_MARK) and a space: ♟ owner, ⌕ scout NAME,
 * ▸ T-x (worker report), ◆ lead, ↳ T-x (split); "unknown" (no mark) when its origin is missing or broken (hand-edited).
 */
export function originSegs(t: { origin?: unknown }): Seg[] {
  const o = originOf(t)
  if (!o) return [{ text: 'unknown', color: 'inactive' }]
  const segs = originWordSegs(o)
  return [{ text: `${originMark(o)} `, color: segs[0]?.color ?? 'inactive' }, ...segs]
}

function originWordSegs(o: NonNullable<ReturnType<typeof originOf>>): Seg[] {
  const how = o.how ?? (o.by === 'worker' ? 'worker report' : '')
  const taskPart: Seg[] = o.task ? [{ text: o.task, color: 'claude', bold: true }, ...(how ? [{ text: ` (${how})`, color: 'inactive' }] : [])] : []
  const then = (who: Seg[]) => (taskPart.length ? [...who, { text: ', ', color: 'subtle' }, ...taskPart] : who)
  if (o.by === 'owner') return then([{ text: 'owner', color: 'claude', bold: true }])
  if (o.by === 'scout') return then([{ text: `scout ${o.scout || '?'}`, color: 'suggestion', bold: true }])
  if (o.by === 'lead' && o.task && !o.how) return [{ text: 'lead', color: 'success', bold: true }, { text: ', about ', color: 'inactive' }, ...taskPart]
  if (taskPart.length) return taskPart
  return [{ text: 'lead', color: 'success', bold: true }]
}

/**
 * The labelled rows of the task page, in order: Status, Stage (`board`: its mode and checker setting, see taskStage), Now (STATE_LABEL), Role, From, Why, Request, Seen, Files, Into (the branch it
 * merges into), After (with a warning row for a task it waits for that merges into another branch), Research, Branch, Commits, Tries.
 * `when` turns an ISO time into a short date; `all` finds the tasks this one waits for.
 */
export function detailRows(t: SymccTask, o: { roles: readonly Pick<RoleDef, 'name' | 'description' | 'model'>[]; kinds?: readonly Pick<KindDef, 'name' | 'description'>[]; all: SymccTask[]; when: (iso: string) => string; nowMs: number; archivedDone?: string[]; board?: { mode?: unknown; checker?: unknown } }): DetailRow[] {
  const R: DetailRow[] = []
  // the status names the step a doing task is in ("⌕ checker · 5m"), and the Stage line where that is on the way to the merge
  const badge = statusBadge(t as BoardTask, o.nowMs)
  R.push({ label: 'Status', segs: [{ text: badge.text, color: badge.color, bold: true }, { text: ` · added ${o.when(t.created_at)} · changed ${o.when(t.updated_at)}`, color: 'inactive' }] })
  const stage = taskStage(t as BoardTask, o.nowMs, o.board)
  if (stage) R.push({ label: 'Stage', segs: stageSegs(stage) })
  if (t.note) R.push({ label: STATE_LABEL, segs: [{ text: t.note, color: 'inactive', italic: true }] })
  const name = roleOf(t)
  const r = findRole(o.roles, name)
  const more = [r?.description, r?.model ? `model ${r.model}` : ''].filter(Boolean).join(' · ')
  R.push({ label: 'Role', segs: [{ text: r?.name ?? name, color: 'ide', bold: true }, ...(more ? [{ text: ` — ${more}`, color: 'inactive' }] : [])] })
  // the kind, next to the role (a plain change shows none): an investigation says nothing is merged, another kind what it is for
  const kind = kindMark(t)
  const about = isInvestigation(t) ? 'nothing is merged' : findKind(o.kinds ?? [], kind)?.description ?? ''
  if (kind) R.push({ label: 'Kind', segs: [{ text: kind, color: 'suggestion', bold: true }, ...(about ? [{ text: ` — ${about}`, color: 'inactive' }] : [])] })
  R.push({ label: 'From', segs: originSegs(t) })
  const og = originOf(t)
  if (og?.why) R.push({ label: 'Why', segs: [{ text: squash(og.why), color: 'text' }] })
  if (og?.by === 'owner' && og.request?.trim()) R.push({ label: 'Request', segs: [{ text: `“${squash(og.request)}”`, color: 'text', italic: true }] })
  if (og?.evidence) R.push({ label: 'Seen', segs: [{ text: squash(og.evidence), color: 'inactive' }] })
  R.push({ label: 'Files', segs: t.files.length ? t.files.flatMap((f, i) => [...(i ? [{ text: ', ', color: 'subtle' }] : []), { text: f, color: 'autoAccept' }]) : [{ text: 'anywhere in the project', color: 'inactive' }] })
  R.push({ label: 'Into', segs: [{ text: 'merges into: ', color: 'inactive' }, { text: intoOf(t), color: 'ide', bold: true }] })
  t.after.forEach((id, i) => {
    const dep = o.all.find(x => x.id === id)
    // a done task moved to archive.json counts as done
    const gone = !dep && (o.archivedDone ?? []).includes(id)
    const state: Seg = dep ? { text: `${statusMark(dep)} ${STATUS_WORD[dep.status]}`, color: STATUS_BADGE[dep.status] } : gone ? { text: `${STATUS_MARK.done} ${STATUS_WORD.done} (archived)`, color: STATUS_BADGE.done } : { text: 'missing', color: 'error' }
    R.push({
      label: i ? '' : 'After',
      segs: [{ text: id, color: 'claude', bold: true }, { text: ' ', color: 'text' }, state, ...(dep ? [{ text: ` · ${dep.title}`, color: 'inactive' }] : [])],
    })
  })
  for (const n of crossBranchNotes(t, o.all)) R.push({ label: '', segs: [{ text: `⚠ ${n}`, color: 'warning' }] })
  // research notes the merged work added or changed (docs/research/…), one row each
  const notes = t.research_notes ?? []
  notes.forEach((f, i) => R.push({ label: i ? '' : 'Research', segs: [{ text: f, color: 'autoAccept' }] }))
  if (t.branch) R.push({ label: 'Branch', segs: [{ text: t.branch, color: 'ide' }] })
  const commits = taskCommits(t)
  if (commits.length) {
    R.push({
      label: 'Commits',
      segs: commits.flatMap((c, i) => [
        ...(i ? [{ text: ', ', color: 'subtle' }] : []),
        { text: shortSha(c.sha), color: c.merged ? 'success' : 'ide', bold: c.merged },
        ...(c.merged ? [{ text: ' (merged)', color: 'success' }] : c.try ? [{ text: ` (try ${c.try})`, color: 'inactive' }] : []),
      ]),
    })
  }
  const tries: Seg[] = [{ text: `${t.attempts} ${t.attempts === 1 ? 'try' : 'tries'}`, color: t.attempts > 2 ? 'warning' : 'text', bold: t.attempts > 2 }]
  if (t.runs?.length) tries.push({ text: ` · ${fmtTotal(sumRuns(t.runs, o.nowMs))}`, color: 'inactive' })
  R.push({ label: 'Tries', segs: tries })
  return R
}

/**
 * The text of an investigation's Answer section on the task page: the full answer from its latest report file
 * (`report`, when it could be read), else the answer saved on the task (cut to ANSWER_MAX_CHARS); '' when there is none.
 */
export function answerText(t: Pick<BoardTask, 'answer'>, report: string | null | undefined): string {
  return report?.trim() || t.answer?.trim() || ''
}

/** Whether the task page shows an Answer section for `t`: an investigation with an answer (in review, or done after it was read). */
export const showsAnswer = (t: Pick<BoardTask, 'kind' | 'answer' | 'status'>): boolean => isInvestigation(t) && (!!t.answer?.trim() || t.status === 'review')

/** The width of the label column on the task page: the longest label, its colon and a space. */
export const DETAIL_LABEL_WIDTH = 'Research: '.length

/**
 * Splits colored text into lines of at most `width` characters, breaking between words
 * (a word longer than a line is cut). Spaces at a line break are dropped.
 */
export function wrapSegs(segs: Seg[], width: number): Seg[][] {
  const w = Math.max(1, width)
  const lines: Seg[][] = []
  let line: Seg[] = []
  let len = 0
  const add = (s: Seg, text: string) => {
    const last = line[line.length - 1]
    if (last && last.color === s.color && !!last.bold === !!s.bold && !!last.italic === !!s.italic) last.text += text
    else line.push({ ...s, text })
    len += text.length
  }
  const breakLine = () => {
    const last = line[line.length - 1]
    if (last) last.text = last.text.trimEnd()
    lines.push(line.filter(s => s.text))
    line = []
    len = 0
  }
  for (const s of segs) {
    for (const tok of s.text.replace(/\s+/g, ' ').match(/ +|[^ ]+/g) ?? []) {
      if (tok.startsWith(' ')) {
        if (len && len + 1 <= w) add(s, ' ')
        continue
      }
      let word = tok
      if (len && len + word.length > w) breakLine()
      while (word.length > w) {
        add(s, word.slice(0, w))
        word = word.slice(w)
        breakLine()
      }
      if (word) add(s, word)
    }
  }
  if (line.length || !lines.length) breakLine()
  return lines
}

/** A labelled row as lines of colored text within `width`: the label (padded) on the first line, spaces under it after. */
export function detailRowLines(row: DetailRow, width: number): Seg[][] {
  const pad = DETAIL_LABEL_WIDTH
  return wrapSegs(row.segs, Math.max(12, width - pad)).map((l, i) => [{ text: (i === 0 && row.label ? `${row.label}:` : '').padEnd(pad), color: 'text', bold: true }, ...l])
}

/**
 * A task as plain text for the clipboard (the task page's Copy button, y): the id and title, its status, role and
 * origin in the page's words, why, the note, what to do (the details, with the notes and the owner's answers in
 * them), the files it may change, what it waits for and the latest worker report (`report`), when there is one.
 */
export function taskCopyText(t: SymccTask, o: { roles?: RoleDef[]; report?: string | null } = {}): string {
  const name = roleOf(t)
  const role = findRole(o.roles ?? [], name)?.name ?? name
  const og = originOf(t)
  const from = og ? originWordSegs(og).map(s => s.text).join('') : 'unknown'
  const kind = kindMark(t)
  const L = [`${t.id}  ${t.title}`, `${STATUS_WORD[t.status]} · ${kind ? `${kind} · ` : ''}${role} · from: ${from}`]
  if (og?.why) L.push(`why: ${squash(og.why)}`)
  if (t.note) L.push(`${stateLabelLower()}: ${t.note}`)
  L.push('What to do:', t.details.trim() ? t.details.trimEnd() : '(no details)')
  L.push(`May change: ${t.files.length ? t.files.join(', ') : 'anywhere in the project'}`)
  if (t.after.length) L.push(`Waits for: ${t.after.join(', ')}`)
  if (o.report?.trim()) L.push('Latest report:', o.report.trimEnd())
  return L.join('\n') + '\n'
}

/** The toast after the Copy button: "T-12 copied", or why the clipboard didn't take it, in plain words. */
export function copyToast(id: string, r: { isCopied: true } | { isCopied: false; reason: string }): string {
  if (r.isCopied) return `${id} copied`
  const why: Record<string, string> = { 'no-surface': 'nothing is showing the panel right now', 'no-clipboard': 'this terminal has no clipboard access', refused: 'the copy was refused' }
  return `couldn't copy: ${why[r.reason] ?? r.reason}`
}
