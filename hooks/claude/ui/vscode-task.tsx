// The task page in VS Code's side panel (see surface.ts and vscode.tsx), drawn as a card. The terminal's task page
// (task-page.tsx) packs labelled rows cut to the panel and lists its keys; here the page uses the whole panel width and wraps every line:
//   the page header (T-751, vsPageHeader): ‹ Tasks and the "‹ 2 of 6 ›" pager; the id and the title as a heading; the
//   state as small chips; the action buttons in their groups (the next step primary, Drop in red, needs review a
//   checkbox link, copy), then a divider
//   the question (its answers as buttons and a box for your own), why it failed, waiting for your files: boxed in their
//   tone, under the header
//   Details: the labelled rows the terminal and OpenCode show (detailRows: Steps, Added, Role, Kind, From, Why,
//   Files, Into, After, …, Tries) as a two-column label / value grid that wraps (T-699); each task it waits for is a link
//   Branch (T-761: the task's branch against main, the terminal's lines in the monospaced face)
//   Answer · What to do (Markdown) · Changes · History (a timeline on one rail, newest first, the newest HISTORY_FIRST
//   with a "Show all" button) · the Time and cost fold (Runs) · Report (Markdown, its first part with a "Show all" button)
// (a fold and a task id are links: VS Code draws a Button as a filled blue box)
// No key hints: every action is a button.
import type { SymccTask } from '../../../types'
import { type DetailRow, type DiffFile, type Seg, findRole, fmtTotal, sumRuns, taskActions, type TaskAction, type TaskActionId, type BoardTask } from '../../board'
import { runLines, type ReportPick, type TaskSection } from '../../core/task-sections'
import { RUN_NOW_NO, RUN_NOW_YES } from '../../core/run-now'
import { historyEvent, historyTime, HISTORY_COLOR } from '../../core/history'
import { S } from '../../app/state'
import type { PaneParts } from './parts'
import { draftFor, dropDraft, fieldRows, keepDraftText } from './answer-box'
import type { $ } from '../panel'
import { vsChoices, vsFold, vsHref, vsLink, mdLink, vsSection, VS_LABEL_W } from './vscode'
import { type PageHeader, vsPageHeader } from './page-header'

/** How many lines of a report VS Code's task page shows before its "Show all" button. */
export const REPORT_FIRST_LINES = 12
/** How many history events (the newest) VS Code's task page shows before its "Show all" button. */
export const HISTORY_FIRST = 10

/** The key of a Details row on VS Code's task page: "vs-row-status", "vs-row-stage"; a row with no label (one that
 *  goes on from the row above) gets the label above it and its place: "vs-row-after-1". */
export function vsRowKeys(rows: readonly DetailRow[]): string[] {
  let label = ''
  const seen = new Map<string, number>()
  return rows.map(r => {
    if (r.label) label = r.label
    const name = label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'row'
    const n = seen.get(name) ?? 0
    seen.set(name, n + 1)
    return n ? `vs-row-${name}-${n}` : `vs-row-${name}`
  })
}

/** The first part of a report: its first `n` lines (a code block left open there closed), and how many lines are left. */
export function reportPart(body: string, n = REPORT_FIRST_LINES): { text: string; more: number } {
  const lines = body.trimEnd().split('\n')
  if (lines.length <= n) return { text: lines.join('\n'), more: 0 }
  const head = lines.slice(0, n)
  const fences = head.filter(l => /^\s*```/.test(l)).length
  return { text: [...head, ...(fences % 2 ? ['```'] : [])].join('\n'), more: lines.length - n }
}


/** What task-page.tsx worked out for the open task, and what its buttons do. */
export type VsTaskCtx = {
  /** the page header (the same lines as the terminal's, see page-header.tsx) */
  header: PageHeader
  agentId: string | undefined
  inReview: boolean
  answered: boolean
  target: string
  rows: DetailRow[]
  changes: { files: DiffFile[]; error: string } | null
  reports: { try: number; file: string }[]
  shown: { try: number; kind: 'worker' | 'checker'; id?: string; file: string } | null
  reportBody: string | null
  answerShown: boolean
  answerFrom: { try: number; file: string } | undefined
  answer: string
  /** the page's sections (core/task-sections.ts): which ones show, their headings and lines */
  sections: TaskSection[]
  fileWait: string
  /** the line shown while its Approve, Done, Keep as a note or Merge now runs ('' when none does): no review buttons meanwhile */
  merging: string
  /** the last such press's result, once it ended ('' when there is none to show) */
  result: string
  /** whether that press really went through (merged, or done): its result is drawn in the success color, else the warning one */
  resultOk: boolean
  overtime: boolean
  answerable: boolean
  askedQuestion: string | null | undefined
  /** the answer buttons as the terminal has them; the last one ("Answer…") opens the box, which VS Code always shows */
  choices: string[]
  why: { reason: string; next: string; asks: string } | null
  canPickRole: boolean
  /** T-954: the "T-5 waits on T-3 (running). Start anyway?" question while Run now asks it, else '' */
  runNowAsk: string
  /** whether "Already merged" fits (T-514): its work was merged by hand, outside the board */
  canMarkMerged?: boolean
  nowRole: string
  redraw: () => void
  on: {
    back: () => void
    open: (id: string) => () => void
    approve: () => void
    keepNote: () => void
    askReason: () => void
    cancelReject: () => void
    submitReject: (value: string) => void
    showDiff: (file: string) => () => void
    pause: () => void
    resume: () => void
    mergeNow: () => void
    retry: () => void
    /** T-954: Run now; when it waits on unfinished tasks it opens the "Start anyway?" box (runNowAsk) instead */
    runNow: () => void
    startAnyway: () => void
    cancelRunNow: () => void
    toTodo: () => void
    stash: () => void
    markMerged: () => void
    drop: () => void
    watch: () => void
    toggleReview: () => void
    copy: (press?: Press) => void
    openRolePick: () => void
    pickRole: (name: string) => () => void
    cancelRolePick: () => void
    choicePress: (i: number) => () => void
    sendAnswer: (text: string) => () => void
    pickReport: (p: ReportPick) => () => void
  }
}

/** What a button press tells: the screen it came from, so Copy copies there. */
type Press = { surface?: Parameters<$['ui']['copy']>[0]['surface'] }
type Action = { key: string; label: string; onPress: (press?: Press) => void; main?: boolean; group: TaskAction['group'] }

/** The action buttons that fit task `t` now, in order (taskActions, shared with the terminal and OpenCode); `main`
 *  marks the one to press (one at most, none while a question waits). VS Code's buttons say no keys. */
export function vsActions(t: SymccTask, x: Pick<VsTaskCtx, 'agentId'> & Partial<Pick<VsTaskCtx, 'merging'>>, on: VsTaskCtx['on']): Action[] {
  const press: Record<TaskActionId, (press?: Press) => void> = {
    done: on.approve, approve: on.approve, 'keep-note': on.keepNote, 'ask-more': on.askReason, reject: on.askReason, 'show-changes': on.showDiff(''),
    watch: on.watch, pause: on.pause, resume: on.resume, 'merge-now': on.mergeNow, retry: on.retry, 'run-now': on.runNow, 'to-todo': on.toTodo, stash: on.stash,
    role: on.openRolePick, 'already-merged': on.markMerged, drop: on.drop, 'needs-review': on.toggleReview, copy: (p?: Press) => on.copy(p),
  }
  return taskActions(t as BoardTask, { worker: !!x.agentId, merging: !!x.merging }).map(a => ({ key: a.id, label: a.label, onPress: press[a.id], main: !!a.main, group: a.group }))
}

/** The task page in VS Code. */
export function taskPageVs(pane: PaneParts, t: SymccTask, x: VsTaskCtx) {
  const { Box, Text, Button, Input, v, C, vs } = pane
  const { Markdown } = vs
  const on = x.on
  const { nowMs } = pane
  /** Colored pieces in one Text that wraps to the panel. */
  const segs = (key: string, list: Seg[], extra: Record<string, unknown> = {}) => (
    <Text key={key} wrap="wrap" {...extra}>
      {list.map((g, i) => (
        <Text key={`${key}-${i}`} bold={g.bold} italic={g.italic} color={C(g.color)}>
          {g.text}
        </Text>
      ))}
    </Text>
  )
  const plain = (key: string, text: string, color = 'text', extra: Record<string, unknown> = {}) => (
    <Text key={key} wrap="wrap" color={C(color)} {...extra}>
      {text}
    </Text>
  )
  /** T-1006: what needs you: a heading (the mark in the tone's color, bold words) and its lines under it; no box. */
  const note = (key: string, mark: string, label: string, tone: string, body: unknown[]) => (
    <Box key={key} flexDirection="column" gap={1}>
      <Text key={`${key}-head`} wrap="wrap" bold>
        <Text key={`${key}-mark`} color={C(tone)}>{`${mark} `}</Text>
        <Text key={`${key}-label`} color={C('text')}>{label}</Text>
      </Text>
      {body as never}
    </Box>
  )
  const section = (name: string, label: string, body: unknown[]) => (
    <Box key={`vs-sec-${name}`} flexDirection="column">
      {vsSection(vs, `vs-sec-${name}-head`, label)}
      {body.filter(Boolean) as never}
    </Box>
  )
  // a less-used section folds, closed by default: its row says how many it holds; pressing it opens or closes it
  if (S.taskFolds && S.taskFolds.task !== t.id) S.taskFolds = null
  const isOpen = (name: string) => !!S.taskFolds?.open.includes(name)
  const toggle = (name: string) => () => {
    const open = S.taskFolds?.open ?? []
    S.taskFolds = { task: t.id, open: open.includes(name) ? open.filter(n => n !== name) : [...open, name] }
    x.redraw()
  }
  const fold = (name: string, label: string, n: number | string, body: unknown[]) => (
    <Box key={`vs-sec-${name}`} flexDirection="column">
      {vsFold(vs, `fold-${name}`, label, n, isOpen(name), toggle(name))}
      {isOpen(name) ? (
        <Box key={`vs-sec-${name}-body`} flexDirection="column" paddingLeft={2}>
          {body.filter(Boolean) as never}
        </Box>
      ) : null}
    </Box>
  )

  const total = sumRuns(t.runs, nowMs)
  const typingBox = S.rejecting?.task === t.id && x.inReview && !x.merging
  // while its merge runs: a line in place of the review buttons; once it ended: its result
  const mergeStatus = x.merging
    ? plain('merging', x.merging, 'success', { bold: true })
    : x.result
      ? plain('merge-result', x.result, x.resultOk ? 'success' : 'warning')
      : null
  const rolePicking = S.rolePick?.task === t.id
  // the header's buttons do what VS Code's own do (Copy copies on the screen it was pressed on)
  const acts = vsActions(t, x, on)
  const header: PageHeader = { ...x.header, buttons: x.header.buttons.map(b => ({ ...b, onPress: acts.find(a => a.key === b.id)?.onPress ?? b.onPress })) }

  // the answer and the reason being typed: kept over redraws, the field one row taller once the text needs it (T-917)
  // it belongs to the question asked now: another question, a picked choice or nothing asked drops it
  const asked = x.askedQuestion ?? ''
  if (!x.answerable) dropDraft(t.id)
  const draft = x.answerable ? draftFor(t.id, asked) : ''
  const keepDraft = (value: string) => {
    const before = fieldRows(draftFor(t.id, asked), pane.width)
    keepDraftText(t.id, asked, value)
    if (fieldRows(value, pane.width) !== before) x.redraw()
  }
  const pickChoice = (i: number) => {
    const press = on.choicePress(i)
    return () => (dropDraft(t.id), press())
  }
  const keepReason = (value: string) => {
    if (!S.rejecting) return
    const before = fieldRows(S.rejecting.reason, pane.width)
    S.rejecting.reason = value
    if (fieldRows(value, pane.width) !== before) x.redraw()
  }
  // the box that asks why, once Reject (or Ask more) was pressed
  const rejectBox = typingBox ? (
    <Box key="vs-reject" flexDirection="column">
      <Input
        key="reject-reason"
        label={x.answered ? 'Your follow-up question' : 'Reason to reject'}
        submitLabel="Send"
        placeholder={x.answered ? 'what else to find out' : 'what to change, for the next worker'}
        value={S.rejecting!.reason}
        rows={fieldRows(S.rejecting!.reason, pane.width)}
        autoFocus
        onInput={keepReason}
        onSubmit={on.submitReject}
      />
      {plain('vs-reject-note', x.answered ? 'Send starts a fresh try with your question.' : 'Send moves it back to todo with your reason.', 'inactive')}
      <Button key="reject-cancel" label="Cancel" variant="secondary" onPress={on.cancelReject} />
    </Box>
  ) : null

  // T-954: Run now's "Start anyway?" question (Cancel is the default)
  const runNowBox = x.runNowAsk ? (
    <Box key="vs-run-now" flexDirection="column">
      {note('vs-run-now-head', '?', x.runNowAsk, 'warning', [])}
      <Box key="vs-run-now-buttons" flexDirection="row" gap={1}>
        <Button key="run-now-yes" label={RUN_NOW_YES} onPress={on.startAnyway} />
        <Button key="run-now-cancel" label={RUN_NOW_NO} variant="secondary" autoFocus onPress={on.cancelRunNow} />
      </Box>
    </Box>
  ) : null

  // the role pick list
  const roleBox = rolePicking ? (
    <Box key="vs-role" flexDirection="column">
      {plain('vs-role-head', `Pick a role for ${t.id}`, 'text', { bold: true })}
      {S.rolePick!.options.map(o => {
        const cur = o.toLowerCase() === x.nowRole
        const d = findRole(S.roles, o)?.description
        return (
          <Box key={`vs-role-${o}`} flexDirection="column">
            <Button key={`role:${o}`} plain label={cur ? `● ${o}` : `○ ${o}`} onPress={on.pickRole(o)}>
              <Text bold={cur} color={C(cur ? 'ide' : 'text')}>{cur ? `● ${o}` : `○ ${o}`}</Text>
            </Button>
            {d ? plain(`vs-role-${o}-about`, `  ${d}`, 'inactive') : null}
          </Box>
        )
      })}
      <Button key="role-cancel" label="Cancel" variant="secondary" onPress={on.cancelRolePick} />
    </Box>
  ) : null

  // a question that waits: shown plainly, its answers as numbered lines you click (vsChoices) and a box for your own answer
  const answers = x.choices.slice(0, -1) // the last one is "Answer…": the box below is always there
  const askedFiles = !x.overtime ? (t.ask?.files ?? []) : []
  const question = x.answerable
    ? note('vs-sec-question', '?', x.overtime ? 'Time is up' : 'Question for you', 'warning', [
        plain('vs-question', x.askedQuestion ?? '', 'text', { bold: true }),
        ...askedFiles.map(f => plain(`vs-asked-${f}`, `  ${f}`, 'autoAccept')),
        answers.length ? vsChoices(vs, answers.map((c, i) => (askedFiles.length && i === 0 ? 'Allow files' : c)), pickChoice) : null,
        // the field keeps what was typed (draftFor) and grows with it, so a redraw (a resize) shows the same text (T-917)
        <Input key="answer" label="Your answer" submitLabel="Send" placeholder={answers.length ? 'or type your own answer' : 'type your answer'} value={draft} rows={fieldRows(draft, pane.width)} autoFocus={answers.length ? undefined : true} onInput={keepDraft} onSubmit={value => (dropDraft(t.id), on.sendAnswer(value)())} />,
      ].filter(Boolean) as never[])
    : null

  const fileWait = x.fileWait
    ? note('vs-sec-file-wait', '⧗', 'Waiting for your files', 'warning', [plain('vs-file-wait', x.fileWait), plain('vs-file-wait-note', 'Merge now merges it without waiting.', 'inactive')])
    : null

  const failed = x.why
    ? note('vs-sec-why-failed', '✗', 'Why it failed', 'error', [plain('vs-why-reason', x.why.reason), x.why.asks ? plain('vs-why-asks', x.why.asks, 'warning') : null, plain('vs-why-next', `Next: ${x.why.next}`, 'inactive')].filter(Boolean) as never[])
    : null

  // which of the shared sections show, and their headings, come from core's taskSections (as on the terminal)
  const sec = (id: TaskSection['id']) => x.sections.find(s => s.id === id)
  // T-1080: what the whole task has done so far, at the top
  const doneSec = sec('done')
  const done = doneSec ? section('done', doneSec.title, [plain('vs-done-text', (t as BoardTask).done ?? '')]) : null
  const answerSec = sec('answer')
  const answer = answerSec
    ? section('answer', answerSec.title, [
        x.answerFrom ? plain('vs-answer-file', x.answerFrom.file, 'inactive') : null,
        x.answer ? <Markdown key="vs-answer-md" text={x.answer} /> : plain('vs-answer-none', '(no answer saved)', 'inactive'),
      ])
    : null

  // the Details (T-699): the same labelled rows as the terminal's and OpenCode's task pages (detailRows, in their
  // order and colours), as a two-column grid: the label on the left in a fixed column, the value beside it, wrapped
  // whole; a row with no label goes on under the one above. A task it waits for (an After row) is a link that opens it.
  const detailsSec = sec('details')
  const rowKeys = vsRowKeys(x.rows)
  let rowLabel = ''
  const gridRow = (r: DetailRow, i: number) => {
    if (r.label) rowLabel = r.label
    const key = rowKeys[i]!
    const dep = rowLabel === 'After' && r.segs[0] && t.after.includes(r.segs[0].text) ? v.tasks.find(d => d.id === r.segs[0]!.text) : undefined
    const value = dep ? (
      <Box key={`${key}-value`} flexDirection="row" flexWrap="wrap" columnGap={1} flexGrow={1} flexShrink={1}>
        {vsLink(vs, `after-${dep.id}`, `**${mdLink(dep.id, vsHref('task', dep.id))}**`, [[vsHref('task', dep.id), on.open(dep.id)]])}
        {segs(`${key}-rest`, r.segs.slice(1).map((g, j) => (j === 0 ? { ...g, text: g.text.trimStart() } : g)).filter(g => g.text))}
      </Box>
    ) : (
      <Box key={`${key}-value`} flexDirection="column" flexGrow={1} flexShrink={1}>
        {segs(`${key}-text`, r.segs)}
      </Box>
    )
    return (
      <Box key={key} flexDirection="row">
        <Box key={`${key}-label`} width={VS_LABEL_W} flexShrink={0}>
          <Text key={`${key}-label-text`} color={C('inactive')}>{r.label}</Text>
        </Box>
        {value}
      </Box>
    )
  }
  const detailGrid = section('details', detailsSec?.title ?? 'Details', [
    <Box key="vs-details-grid" flexDirection="column">
      {x.rows.map(gridRow)}
    </Box>,
  ])

  // T-761: the task's branch against main (core/task-branch.ts): the terminal's lines, in the monospaced face so the
  // dots and lines stay over each other, in the same colors
  const branchSec = sec('branch')
  const branch = branchSec
    ? section('branch', branchSec.title, [
        <Box key="vs-branch" flexDirection="column">
          {branchSec.lines.map((l, i) => (
            <Text key={l.key ?? `vs-branch-${i}`} wrap="truncate" mono>
              {l.segs.map((g, j) => (
                <Text key={`${l.key ?? i}-${j}`} mono bold={g.bold} color={C(g.color)}>
                  {g.text}
                </Text>
              ))}
            </Text>
          ))}
        </Box>,
      ])
    : null

  const details = section('what', 'What to do', [t.details.trim() ? <Markdown key="vs-details-md" text={t.details.trimEnd()} /> : plain('vs-details-none', '(no details)', 'inactive')])

  // a task in review (or a done one, T-1086): the files it changed, each opening its diff
  const changesSec = sec('changes')
  const changes = x.changes && changesSec
    ? section('changes', changesSec.title, [
        x.inReview ? plain('vs-changes-folder', `folder: ${S.N.dir}/worktrees/${t.id}; edit files there, then approve (the tests run again)`, 'inactive') : null,
        x.changes.error ? plain('vs-changes-error', `Could not read the changes: ${x.changes.error}`, 'error') : null,
        !x.changes.error && !x.changes.files.length ? plain('vs-changes-none', 'no changes', 'inactive') : null,
        ...x.changes.files.map(f => (
          <Box key={`vs-file-${f.file}`} flexDirection="column">
            {vsLink(vs, `file:${f.file}`, mdLink(f.file, vsHref('file', f.file)), [[vsHref('file', f.file), on.showDiff(f.file)]])}
            <Text key={`vs-file-${f.file}-info`} wrap="wrap">
              {f.binary ? <Text color={C('inactive')}>binary</Text> : <Text><Text color={C('success')}>+{f.added}</Text> <Text color={C('error')}>-{f.removed}</Text></Text>}
              {f.edited ? <Text color={C('warning')}> · edited by you</Text> : null}
            </Text>
          </Box>
        )),
      ])
    : null

  // the history as a timeline (T-512, T-699), newest first: the same events and marks as the terminal page (historyEvent).
  // A left rail: each event is a row, its mark (in its tone) at the top of a one-cell column and, under it, a thin
  // line (a Box that grows to the event's whole height, not a "│" row of its own) that meets the next event's mark, so
  // the marks sit on one unbroken line; the oldest event has none below it. To the right: when it happened
  // (T-522, historyTime) and its try, then the words, wrapped whole. A long history shows its newest HISTORY_FIRST
  // events and a "Show all (N more)" button.
  const events = [...t.history].reverse().map(historyEvent)
  const historyAll = isOpen('history-all')
  const shownEvents = historyAll ? events : events.slice(0, HISTORY_FIRST)
  const hidden = events.length - shownEvents.length
  const historySec = sec('history')
  const history = historySec
    ? section('history', historySec.title, [
        <Box key="vs-history" flexDirection="column">
          {shownEvents.map((e, i) => {
            const stamp = [historyTime(e.at, nowMs), e.by, e.label].filter(Boolean).join(' · ')
            const resultColor = e.tone === 'good' || e.tone === 'bad' ? HISTORY_COLOR[e.tone] : 'text'
            // the line goes on below the last shown event when older ones are hidden behind "Show all"
            const line = i < shownEvents.length - 1 || hidden > 0
            return (
              <Box key={`vs-history-${i}`} flexDirection="row" columnGap={1}>
                <Box key="rail" flexDirection="column" alignItems="center" width={1} flexShrink={0}>
                  <Text key="mark" bold color={C(HISTORY_COLOR[e.tone])}>{e.mark}</Text>
                  {line ? <Box key="line" flexGrow={1} width={1} minHeight={1} backgroundColor={C('subtle')} /> : null}
                </Box>
                <Box key="body" flexDirection="column" flexGrow={1} flexShrink={1} paddingBottom={line ? 1 : 0}>
                  {stamp ? <Text key="when" wrap="wrap" size="caption" bold color={C('inactive')}>{stamp}</Text> : null}
                  <Text key="text" wrap="wrap">
                    <Text color={C(e.tone === 'bad' && !e.result ? 'error' : 'text')}>{e.said}</Text>
                    {e.result ? <Text color={C(resultColor)}>{` → ${e.result}`}</Text> : null}
                  </Text>
                </Box>
              </Box>
            )
          })}
        </Box>,
        events.length > HISTORY_FIRST ? (
          <Box key="vs-history-buttons" flexDirection="row">
            <Button key="history-all" label={historyAll ? 'Show less' : `Show all (${hidden} more)`} variant="secondary" onPress={toggle('history-all')} />
          </Box>
        ) : null,
      ])
    : null

  // the tries, one line each with a dim line per agent under it (T-774), and their total (the dates are on the Added
  // row); the folded row sums them on one line ("3 tries · 21m · 10.1M tokens (3.6× the usual task) · checkers 2.4M")
  const time = fold('time', 'Time and cost', sec('runs')?.summary || (t.runs?.length ?? 0), [
    // T-1104: an agent line with a report file is a link-style button that shows that report; the one shown has a ●
    ...(t.runs ?? []).flatMap((r, i) => runLines(t, r, i, nowMs, x.shown).map((l, k) => {
      const text = l.segs[0]!.text.slice(2)
      const color = l.segs[0]!.color
      return l.pick ? (
        <Button key={`vs-${l.key}`} plain label={text} onPress={on.pickReport(l.pick)}>
          <Text color={C(color)}>{text}</Text>
        </Button>
      ) : (
        plain(`vs-${l.key ?? `run-${i}-${k}`}`, text, color)
      )
    })),
    t.runs?.length ? plain('vs-total', `total: ${fmtTotal(total)}`, 'text', { bold: true }) : plain('vs-no-runs', 'no tries yet', 'inactive'),
  ])

  // the report of the try shown (the latest unless one was picked): its first part, then "Show all"
  if (S.reportAll && S.reportAll !== t.id) S.reportAll = null
  const all = S.reportAll === t.id
  const part = x.reportBody !== null ? (all ? { text: x.reportBody.trimEnd(), more: 0 } : reportPart(x.reportBody)) : null
  const longReport = x.reportBody !== null && reportPart(x.reportBody).more > 0
  const reportSec = sec('report')
  const report =
    reportSec
      ? section('report', reportSec.title, [
          !x.shown ? plain('vs-report-none', 'no saved report', 'inactive') : null,
          x.shown ? plain('vs-report-file', x.shown.file, 'inactive') : null,
          x.shown && x.reportBody === null ? plain('vs-report-error', `Could not read the ${x.shown.kind === 'checker' ? 'checker ' : ''}report file.`, 'error') : null,
          part && part.text.trim() ? <Markdown key="vs-report-md" text={part.text} /> : null,
          longReport ? (
            <Box key="vs-report-buttons" flexDirection="row" flexWrap="wrap" gap={1}>
              {longReport ? (
                <Button key="report-all" label={all ? 'Show less' : `Show all (${reportPart(x.reportBody!).more} more lines)`} variant="secondary" onPress={() => ((S.reportAll = all ? null : t.id), x.redraw())} />
              ) : null}
            </Box>
          ) : null,
        ])
      : null

  return (
    <Box flexDirection="column" gap={1}>
      {vsPageHeader(pane, { ...header, backFocus: !(x.answerable || typingBox) })}
      {mergeStatus}
      {done}
      {question}
      {fileWait}
      {failed}
      {rejectBox}
      {runNowBox}
      {roleBox}
      {detailGrid}
      {branch}
      {answer}
      {details}
      {changes}
      {history}
      {time}
      {report}
    </Box>
  )
}
