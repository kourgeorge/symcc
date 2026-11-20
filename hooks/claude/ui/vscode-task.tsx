// The task page in VS Code's side panel (see surface.ts and vscode.tsx), drawn as a card. The terminal's task page
// (task-page.tsx) packs labelled rows cut to the panel and lists its keys; here the page uses the whole panel width and wraps every line:
//   ← Tasks                                  (back to the list)
//   T-414 and the title, large and bold; the status badge in its color, then the kind, role, try and time as small dim tags
//   the question (its answers as buttons and a box for your own), why it failed (with Retry), waiting for your files
//   (with Merge now): boxed in their tone, at the top
//   the action buttons in one row (only the ones that fit the status, at most one primary on the page)
//   Why / where it came from · What to do (Markdown) · Changes · History (a timeline, newest first) · Report (Markdown,
//   its first part with a "Show all" button), then the folds, closed by default: Files it may change · Waits for · Time and cost
// (each fold, and each task it waits for, is a link: VS Code draws a Button as a filled blue box)
// No key hints: every action is a button.
import type { SymccTask } from '../../../types'
import { type DetailRow, type DiffFile, type Seg, STATUS_BADGE, STATUS_MARK, statusMark, STATUS_WORD, originSegs, originOf, crossBranchNotes, intoOf, roleOf, findRole, kindMark, fmtDuration, fmtRun, fmtTotal, sumRuns, YOUR_EDITS, STATE_LABEL } from '../../board'
import { squash } from '../../core/text'
import { historyEvent, historyTime, HISTORY_COLOR } from '../../core/history'
import { S } from '../../app/state'
import { when } from '../../core/days'
import type { PaneParts } from './parts'
import type { $ } from '../panel'
import { vsBadge, vsCallout, vsFold, vsFooter, vsHref, vsLink, mdLink, vsSection, vsTags } from './vscode'

/** How many lines of a report VS Code's task page shows before its "Show all" button. */
export const REPORT_FIRST_LINES = 12

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
  agentId: string | undefined
  inReview: boolean
  answered: boolean
  target: string
  rows: DetailRow[]
  changes: { files: DiffFile[]; error: string } | null
  reports: { try: number; file: string }[]
  at: number
  shown: { try: number; file: string } | undefined
  reportBody: string | null
  answerShown: boolean
  answerFrom: { try: number; file: string } | undefined
  answer: string
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
    pickReport: (n: number) => () => void
  }
}

/** What a button press tells: the screen it came from, so Copy copies there. */
type Press = { surface?: Parameters<$['ui']['copy']>[0]['surface'] }
type Action = { key: string; label: string; onPress: (press?: Press) => void; main?: boolean }

/** The action buttons that fit task `t` now, in order; `main` marks the one to press (one at most, none while a question waits). */
export function vsActions(t: SymccTask, x: Pick<VsTaskCtx, 'agentId' | 'inReview' | 'answered' | 'fileWait' | 'answerable' | 'canPickRole' | 'canMarkMerged'> & Partial<Pick<VsTaskCtx, 'merging'>>, on: VsTaskCtx['on']): Action[] {
  const s = t.status
  const open = s !== 'done' && s !== 'dropped'
  // while it merges: no Approve, Reject, Done, Keep as a note, Ask more or Merge now (see MERGING_LINE)
  const out: (Action | false)[] = x.merging
    ? []
    : x.answered
    ? [
        { key: 'done', label: 'Done', onPress: on.approve, main: true },
        { key: 'keep-note', label: 'Keep as a note', onPress: on.keepNote },
        { key: 'ask-more', label: 'Ask more', onPress: on.askReason },
      ]
    : [
        x.inReview && { key: 'approve', label: 'Approve', onPress: on.approve, main: true },
        x.inReview && { key: 'reject', label: 'Reject', onPress: on.askReason },
        x.inReview && { key: 'show-changes', label: 'Show changes', onPress: on.showDiff('') },
      ]
  out.push(
    !!x.agentId && { key: 'watch', label: 'Watch worker', onPress: on.watch },
    (s === 'doing' || s === 'todo') && { key: 'pause', label: 'Pause', onPress: on.pause },
    s === 'paused' && { key: 'resume', label: 'Resume', onPress: on.resume, main: true },
    !!x.fileWait && !x.merging && { key: 'merge-now', label: 'Merge now', onPress: on.mergeNow, main: true },
    (s === 'failed' || s === 'dropped') && { key: 'retry', label: 'Retry', onPress: on.retry, main: s === 'failed' },
    s === 'backlog' && { key: 'to-todo', label: 'Move to todo', onPress: on.toTodo, main: true },
    (s === 'todo' || s === 'paused' || s === 'failed') && { key: 'stash', label: 'Stash to backlog', onPress: on.stash },
    x.canPickRole && { key: 'role', label: 'Role', onPress: on.openRolePick },
    !!x.canMarkMerged && { key: 'already-merged', label: 'Already merged', onPress: on.markMerged },
    open && { key: 'drop', label: 'Drop', onPress: on.drop },
    open && { key: 'needs-review', label: `Needs review: ${t.needs_review ? 'on' : 'off'}`, onPress: on.toggleReview },
    { key: 'copy', label: 'Copy', onPress: (press?: Press) => on.copy(press) },
  )
  const list = out.filter((a): a is Action => !!a)
  // one primary at most: the first main one, and none while a question waits (its first answer is the primary then)
  let primary = !x.answerable
  return list.map(a => (a.main && primary ? ((primary = false), a) : { ...a, main: false }))
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

  // the top: the id and the title large and bold, the status badge in its color, then the kind, role, try and time as small tags
  const role = findRole(S.roles, roleOf(t))?.name ?? roleOf(t)
  const kind = kindMark(t)
  const total = sumRuns(t.runs, nowMs)
  const tags = [kind, role, t.attempts ? `try ${t.attempts}` : '', t.runs?.length ? fmtDuration(total.ms) : '', x.agentId ? 'a worker is on it now' : ''].filter(Boolean)
  const statusWord = x.answered ? 'answered: read it' : STATUS_WORD[t.status]
  const shown = t.status
  const head = (
    <Box key="vs-head" flexDirection="column">
      <Text key="vs-id" bold size="title" color={C('claude')}>{t.id}</Text>
      <Text key="vs-title" wrap="wrap" bold size="title" color={C('text')}>{t.title}</Text>
      <Box key="vs-status" flexDirection="row" flexWrap="wrap" columnGap={1}>
        {vsBadge(vs, 'vs-badge', `${statusMark({ ...t, status: shown })} ${statusWord}`, x.answered ? 'success' : STATUS_BADGE[shown])}
        {tags.length ? vsTags(vs, 'vs-tags', tags) : null}
      </Box>
    </Box>
  )
  const typingBox = S.rejecting?.task === t.id && x.inReview && !x.merging
  // while its merge runs: a line in place of the review buttons; once it ended: its result
  const mergeStatus = x.merging
    ? plain('merging', x.merging, 'success', { bold: true })
    : x.result
      ? plain('merge-result', x.result, x.resultOk ? 'success' : 'warning')
      : null
  const rolePicking = S.rolePick?.task === t.id
  const acts = vsActions(t, x, on)
  // Retry sits in "Why it failed" and Merge now in "Waiting for your files", right by their words
  const inCallout = (a: Action) => (a.key === 'retry' && !!x.why) || (a.key === 'merge-now' && !!x.fileWait)
  const button = (a: Action) => <Button key={a.key} label={a.label} variant={a.main ? 'primary' : 'secondary'} onPress={a.onPress} />
  const calloutButtons = (key: string) => {
    const list = acts.filter(a => inCallout(a) && a.key === key)
    return list.length ? <Box key={`vs-${key}-row`} flexDirection="row" flexWrap="wrap" gap={1}>{list.map(button)}</Box> : null
  }
  const actionRow = (
    <Box key="vs-actions" flexDirection="row" flexWrap="wrap" gap={1}>
      {acts.filter(a => !inCallout(a)).map(button)}
    </Box>
  )

  // the box that asks why, once Reject (or Ask more) was pressed
  const rejectBox = typingBox ? (
    <Box key="vs-reject" flexDirection="column" borderStyle="round" borderColor={C(x.answered ? 'warning' : 'error')} paddingX={1}>
      <Input
        key="reject-reason"
        label={x.answered ? 'Your follow-up question' : 'Reason to reject'}
        submitLabel="Send"
        placeholder={x.answered ? 'what else to find out' : 'what to change, for the next worker'}
        value={S.rejecting!.reason}
        autoFocus
        onInput={value => void (S.rejecting && (S.rejecting.reason = value))}
        onSubmit={on.submitReject}
      />
      {plain('vs-reject-note', x.answered ? 'Send starts a fresh try with your question.' : 'Send moves it back to todo with your reason.', 'inactive')}
      <Button key="reject-cancel" label="Cancel" variant="secondary" onPress={on.cancelReject} />
    </Box>
  ) : null

  // the role pick list
  const roleBox = rolePicking ? (
    <Box key="vs-role" flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
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

  // a question that waits: shown plainly, its answers as buttons (the first the primary) and a box for your own answer
  const answers = x.choices.slice(0, -1) // the last one is "Answer…": the box below is always there
  const askedFiles = !x.overtime ? ((t as { asked_files?: string[] }).asked_files ?? []) : []
  const question = x.answerable
    ? vsCallout(vs, 'vs-sec-question', '?', x.overtime ? 'Time is up' : 'Question for you', 'warning', [
        plain('vs-question', x.askedQuestion ?? (askedFiles.length ? 'The worker asks to change more files:' : '(no question)'), 'text', { bold: true }),
        ...askedFiles.map(f => plain(`vs-asked-${f}`, `  ${f}`, 'autoAccept')),
        answers.length ? (
          <Box key="vs-answers" flexDirection="row" flexWrap="wrap" gap={1}>
            {answers.map((c, i) => (
              <Button key={`choice-${i + 1}`} label={askedFiles.length && i === 0 ? 'Allow files' : c} variant={i === 0 ? 'primary' : 'secondary'} autoFocus={i === 0 ? true : undefined} onPress={on.choicePress(i)} />
            ))}
          </Box>
        ) : null,
        <Input key="answer" label="Your answer" submitLabel="Send" placeholder={answers.length ? 'or type your own answer' : 'type your answer'} autoFocus={answers.length ? undefined : true} onSubmit={value => on.sendAnswer(value)()} />,
      ].filter(Boolean) as never[])
    : null

  const fileWait = x.fileWait
    ? vsCallout(vs, 'vs-sec-file-wait', '⧗', 'Waiting for your files', 'warning', [plain('vs-file-wait', x.fileWait), plain('vs-file-wait-note', 'Merge now merges it without waiting.', 'inactive'), calloutButtons('merge-now')].filter(Boolean) as never[])
    : null

  const failed = x.why
    ? vsCallout(vs, 'vs-sec-why-failed', '✗', 'Why it failed', 'error', [plain('vs-why-reason', x.why.reason), x.why.asks ? plain('vs-why-asks', x.why.asks, 'warning') : null, plain('vs-why-next', `Next: ${x.why.next}`, 'inactive'), calloutButtons('retry')].filter(Boolean) as never[])
    : null

  const answer = x.answerShown
    ? section('answer', x.answerFrom ? `Answer (try ${x.answerFrom.try})` : 'Answer', [
        x.answerFrom ? plain('vs-answer-file', x.answerFrom.file, 'inactive') : null,
        x.answer ? <Markdown key="vs-answer-md" text={x.answer} /> : plain('vs-answer-none', '(no answer saved)', 'inactive'),
      ])
    : null

  // where it came from: who, why, the owner's words, what was seen, and the note
  const og = originOf(t)
  const origin = section('origin', 'Why / where it came from', [
    segs('vs-from', [{ text: 'From ', color: 'inactive' }, ...originSegs(t)]),
    og?.why ? plain('vs-why', squash(og.why)) : null,
    og?.by === 'owner' && og.request?.trim() ? plain('vs-request', `“${squash(og.request)}”`, 'text', { italic: true }) : null,
    og?.evidence ? plain('vs-seen', `Seen: ${squash(og.evidence)}`, 'inactive') : null,
    t.note ? plain('vs-note', `${STATE_LABEL}: ${t.note}`, 'inactive', { italic: true }) : null,
  ])

  const details = section('details', 'What to do', [t.details.trim() ? <Markdown key="vs-details-md" text={t.details.trimEnd()} /> : plain('vs-details-none', '(no details)', 'inactive')])

  // the rows the sections above don't cover: the branch, the commits and research notes
  const more: DetailRow[] = []
  let label = ''
  for (const r of x.rows) {
    if (r.label) label = r.label
    if (['Branch', 'Commits', 'Research'].includes(label)) more.push(r)
  }
  const files = fold('files', 'Files it may change', t.files.length || 'any', [
    ...(t.files.length ? t.files.map(f => plain(`vs-file-${f}`, f, 'autoAccept')) : [plain('vs-files-any', 'anywhere in the project', 'inactive')]),
    segs('vs-into', [{ text: 'merges into ', color: 'inactive' }, { text: intoOf(t), color: 'ide', bold: true }]),
    ...more.map((r, i) => segs(`vs-more-${i}`, [...(r.label ? [{ text: `${r.label}: `, color: 'inactive' }] : []), ...r.segs])),
  ])

  // the tasks it waits for: each id a link that opens it, its status and title beside
  const waits = t.after.length
    ? fold('after', 'Waits for', t.after.length, [
        ...t.after.map(id => {
          const dep = v.tasks.find(d => d.id === id)
          const gone = !dep && (v.archived_done ?? []).includes(id)
          const state = dep ? `${statusMark(dep)} ${STATUS_WORD[dep.status]}` : gone ? `${STATUS_MARK.done} done (archived)` : 'missing'
          return (
            <Box key={`vs-after-${id}`} flexDirection="column">
              <Box key={`vs-after-${id}-top`} flexDirection="row" gap={1}>
                {dep ? (
                  vsLink(vs, `after-${id}`, `**${mdLink(id, vsHref('task', id))}**`, [[vsHref('task', id), on.open(id)]])
                ) : (
                  <Text key="id" bold color={C('inactive')}>{id}</Text>
                )}
                <Text key="state" color={C(dep ? STATUS_BADGE[dep.status] : gone ? STATUS_BADGE.done : 'error')}>{state}</Text>
              </Box>
              {dep ? <Box key={`vs-after-${id}-title`} paddingLeft={2}>{plain('title', dep.title, 'inactive')}</Box> : null}
            </Box>
          )
        }),
        ...crossBranchNotes(t, v.tasks).map((n, i) => plain(`vs-cross-${i}`, `⚠ ${n}`, 'warning')),
      ])
    : null

  // a task in review: the files it changed, each opening its diff
  const changes = x.changes
    ? section('changes', `Changes (${x.changes.files.length} ${x.changes.files.length === 1 ? 'file' : 'files'}, against ${x.target})${x.changes.files.some(f => f.edited) ? ` ${YOUR_EDITS}` : ''}`, [
        plain('vs-changes-folder', `folder: ${S.N.dir}/worktrees/${t.id}; edit files there, then approve (the tests run again)`, 'inactive'),
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
        x.changes.files.length ? plain('vs-changes-hint', 'Click a file to see its changes.', 'inactive') : null,
      ])
    : null

  // the history as a timeline (T-512), newest first: the same events and marks as the terminal page (historyEvent),
  // each mark in its tone, when it happened (T-522, historyTime) and its try, then the words, wrapped whole; a dim connector (│) between events
  const events = [...t.history].reverse().map(historyEvent)
  const history = events.length
    ? section('history', `History (${events.length}, newest first)`, events.flatMap((e, i) => {
        const stamp = [historyTime(e.at, nowMs), e.label].filter(Boolean).join(' · ')
        const resultColor = e.tone === 'good' || e.tone === 'bad' ? HISTORY_COLOR[e.tone] : 'text'
        const event = (
          <Box key={`vs-history-${i}`} flexDirection="row" gap={1}>
            <Text key="mark" bold color={C(HISTORY_COLOR[e.tone])}>{e.mark}</Text>
            <Box key="body" flexDirection="column" flexShrink={1}>
              {stamp ? <Text key="when" wrap="wrap" size="caption" bold color={C('inactive')}>{stamp}</Text> : null}
              <Text key="text" wrap="wrap">
                <Text color={C(e.tone === 'bad' && !e.result ? 'error' : 'text')}>{e.said}</Text>
                {e.result ? <Text color={C(resultColor)}>{` → ${e.result}`}</Text> : null}
              </Text>
            </Box>
          </Box>
        )
        return i === events.length - 1 ? [event] : [event, <Text key={`vs-history-${i}-line`} color={C('inactive')}>│</Text>]
      }))
    : null

  const time = fold('time', 'Time and cost', t.runs?.length ?? 0, [
    plain('vs-dates', `added ${when(t.created_at)} · changed ${when(t.updated_at)}`, 'inactive'),
    ...(t.runs ?? []).map((r, i) => plain(`vs-run-${i}`, fmtRun(r, i, nowMs), r.ended ? 'inactive' : 'success')),
    t.runs?.length ? plain('vs-total', `total: ${fmtTotal(total)}`, 'text', { bold: true }) : plain('vs-no-runs', 'no tries yet', 'inactive'),
  ])

  // the report of the try shown (the latest unless one was picked): its first part, then "Show all"
  if (S.reportAll && S.reportAll !== t.id) S.reportAll = null
  const all = S.reportAll === t.id
  const part = x.reportBody !== null ? (all ? { text: x.reportBody.trimEnd(), more: 0 } : reportPart(x.reportBody)) : null
  const longReport = x.reportBody !== null && reportPart(x.reportBody).more > 0
  const report =
    (x.reports.length > 0 || t.attempts > 0) && !(x.answerShown && x.answerFrom && x.reports.length === 1)
      ? section('report', x.shown ? `Report (try ${x.shown.try}${x.reports.length > 1 ? `, ${x.at + 1} of ${x.reports.length}` : ''})` : 'Report', [
          !x.shown ? plain('vs-report-none', 'no saved report', 'inactive') : null,
          x.shown ? plain('vs-report-file', x.shown.file, 'inactive') : null,
          x.shown && x.reportBody === null ? plain('vs-report-error', 'Could not read the report file.', 'error') : null,
          part && part.text.trim() ? <Markdown key="vs-report-md" text={part.text} /> : null,
          longReport || x.reports.length > 1 ? (
            <Box key="vs-report-buttons" flexDirection="row" flexWrap="wrap" gap={1}>
              {longReport ? (
                <Button key="report-all" label={all ? 'Show less' : `Show all (${reportPart(x.reportBody!).more} more lines)`} variant="secondary" onPress={() => ((S.reportAll = all ? null : t.id), x.redraw())} />
              ) : null}
              {x.reports.length > 1 ? x.reports.map((r, i) => <Button key={`report-try-${r.try}`} label={`${i === x.at ? '● ' : ''}Try ${r.try}`} variant="secondary" onPress={on.pickReport(r.try)} />) : null}
            </Box>
          ) : null,
        ])
      : null

  return (
    <Box flexDirection="column" gap={1}>
      <Box key="vs-task-top" flexDirection="column" gap={1}>
        <Box key="vs-back-row" flexDirection="row">
          <Button key="back" label="← Tasks" variant="secondary" autoFocus={x.answerable || typingBox ? undefined : true} onPress={on.back} />
        </Box>
        {head}
      </Box>
      {question}
      {fileWait}
      {failed}
      {mergeStatus}
      {actionRow}
      {rejectBox}
      {roleBox}
      {answer}
      {origin}
      {details}
      {changes}
      {history}
      {report}
      {files}
      {waits}
      {time}
      {vsFooter(vs, 'task-keys')}
    </Box>
  )
}
