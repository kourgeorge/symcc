// The board panel's page for one task: details, actions, and for a task in review its changes.
import type { SymccTask } from '../../../types'
import { cutDiff, DIFF_LINES, diffKinds, DIFF_COLOR, diffKeys, roleChoices, roleOf, findRole, type DiffFile, type Seg, detailRows, wrapSegs, STATUS_BADGE, statusMark, detailRowLines, fmtRun, fmtTotal, sumRuns, taskKeys, YOUR_EDITS, intoOf, taskReports, answerChoices, type BoardTask, boxHint, pickHint, taskCopyText, copyToast, fileWaitText, OVERTIME_OPTIONS, overtimeQuestion, isAnswered, showsAnswer, answerText, isInvestigation, whyFailed, failNext, failAsks } from '../../board'
import { folderDiff, changedFiles } from '../../app/review'
import { rerunDue } from '../../core/test-timeout'
import { loadRoles } from '../../app/roles'
import { loadKinds } from '../../app/kinds'
import { S, workers } from '../../app/state'
import { type $, panelValues } from '../panel'
import { path } from '../../app/store'
import { noteForLead, brief, tellLead } from '../../app/tell'
import { runTool, when, allowAskedFiles, refuseAskedFiles } from '../../app/tools'
import type { PaneParts } from './parts'
import { answerBox } from './answer-box'
import { taskPageVs } from './vscode-task'
import { historyEvent, HISTORY_COLOR, type HistoryEvent } from '../../core/history'
import { claudeHost } from '../host'
import { answeredLeadLine } from '../../core/test-timeout'
import { mergingNow, mergeOutcome } from '../../app/workers'

/** The line a task's page shows in place of its review buttons while it merges. */
/** The statuses whose page offers "Already merged (h)": work that stopped short of the board's merge (the lead's tool takes more). */
export const MARK_MERGED_FROM: readonly SymccTask['status'][] = ['failed', 'waiting', 'paused', 'dropped']
export const MERGING_LINE = 'Merging… (tests running)'
/** The keys of the review and merge buttons (approve or done, reject or ask more, keep as a note, merge now): not offered while it merges. */
const MERGE_KEYS = ['a', 'x', 'k', 'r']
/** Tasks whose Approve, Done, Keep as a note or Merge now was pressed and still runs: the line their page shows meanwhile. */
const pressed = new Map<string, string>()
/** The last such press's result for each task, shown on its page once it ends (until the next press). */
const lastResult = new Map<string, { text: string; ok: boolean }>()
/** What task `id`'s page says while its merge runs, or '' when none does (pressed here, or approved another way). */
export const mergingLine = (id: string): string => pressed.get(id) ?? (mergingNow(id) ? MERGING_LINE : '')

/** One task opened: its details and actions; for a task in review also its changes. */
export async function taskPage($: $, pane: PaneParts, t: SymccTask) {
  const { Box, Text, Button, Input, v, width, color, word, mark, act, C, footer, buttonRows, heading, paragraphs } = pane
  if (!S.roles.length) await loadRoles(claudeHost($)).catch(() => undefined)
  if (!S.kinds.length) await loadKinds(claudeHost($)).catch(() => undefined)
  // the branch this task merges into: its changes are shown against it
  const target = intoOf(t)
  const agentId = [...workers.entries()].find(([, w]) => w.task === t.id)?.[0]
  const inReview = t.status === 'review'
  // An answered investigation in review: nothing to merge; Done, Keep as a note and Ask more instead of Approve and Reject.
  const answered = isAnswered(t as BoardTask)
  const showDiff = (file: string) => () => ((S.diffOpen = { task: t.id, file }), $.ui.invalidate('ui.render'))
  // The merge runs without holding the press: the page redraws at once with its merging line (no Approve, Reject or
  // Merge now buttons meanwhile), and once more with the result. A second press meanwhile starts nothing.
  const merging = mergingLine(t.id)
  const redraw = () => $.ui.invalidate('ui.render')
  const startMerge = (line: string, start: string, run: () => Promise<string>, tell: (r: string) => void) => () => {
    if (mergingLine(t.id)) return void $.ui.toast(S.N.toast(`${t.id} is already merging`))
    pressed.set(t.id, line)
    lastResult.delete(t.id)
    S.diffOpen = null
    S.rejecting = null
    $.ui.toast(S.N.toast(start))
    redraw()
    void run()
      .then(
        // its color comes from how it really ended (merged, done or failed), not from the words of the reply
        r => (lastResult.set(t.id, { text: r, ok: ['merged', 'done'].includes(mergeOutcome(t.id) ?? '') }), $.ui.toast(S.N.toast(r)), tell(r)),
        (err: Error) => (lastResult.set(t.id, { text: err.message, ok: false }), $.ui.toast(S.N.toast(err.message))),
      )
      .finally(() => (pressed.delete(t.id), redraw()))
  }
  const approveIt = startMerge(
    answered ? 'Marking it done…' : MERGING_LINE,
    answered ? `Marking ${t.id} done…` : `Approving ${t.id}: running the tests, then merging…`,
    () => runTool(claudeHost($), 'approve', { task: t.id }),
    r => noteForLead(answered ? `The owner read the answer of ${t.id} and marked it done: ${brief(r)}` : `The owner approved ${t.id}: ${brief(r)}`),
  )
  const keepNote = startMerge(
    'Keeping the answer as a note…',
    `Keeping the answer of ${t.id} as a note…`,
    () => runTool(claudeHost($), 'approve', { task: t.id, keep_note: true }),
    r => tellLead(claudeHost($), `The owner kept the answer of ${t.id} as a note: ${brief(r)}`),
  )
  const last = merging ? undefined : lastResult.get(t.id)
  const result = last?.text ?? ''
  const resultOk = !!last?.ok
  /** The merging line, or the last merge press's result, in the status area. */
  const mergeStatus = merging ? (
    <Text key="merging" bold color={C('success')}>{merging}</Text>
  ) : result ? (
    <Text key="merge-result" color={C(resultOk ? 'success' : 'warning')}>{result}</Text>
  ) : null
  const askReason = () => ((S.rejecting = { task: t.id, reason: '' }), $.ui.invalidate('ui.render'))
  const cancelReject = () => ((S.rejecting = null), $.ui.invalidate('ui.render'))
  const reviewButtons = merging
    ? []
    : answered
    ? [<Button key="done" label="Done (a)" hotkey="a" onPress={approveIt} />, <Button key="keep-note" label="Keep as a note (k)" hotkey="k" onPress={keepNote} />, <Button key="ask-more" label="Ask more (x)" hotkey="x" onPress={askReason} />]
    : inReview
      ? [<Button key="approve" label="Approve" hotkey="a" onPress={approveIt} />, <Button key="reject" label="Reject" hotkey="x" onPress={askReason} />]
      : []
  const submitReject = (value: string) =>
    act(async () => {
      const why = value.trim()
      if (!why) return cancelReject()
      const r = await runTool(claudeHost($), 'reject', { task: t.id, reason: why })
      S.rejecting = null
      S.diffOpen = null
      $.ui.toast(S.N.toast(r))
      noteForLead(answered ? `The owner asked more on ${t.id} ("${brief(why)}"): ${brief(r)}` : `The owner rejected ${t.id} ("${brief(why)}"): ${brief(r)}`)
    })()
  /** The box that asks why, once Reject was pressed. Enter on it empty, or its Cancel button (c), leaves it: Esc
   *  doesn't reach the panel from a text box. */
  const rejectBox =
    inReview && !merging && S.rejecting?.task === t.id ? (
      <Box flexDirection="column" borderStyle="round" borderColor={C(answered ? 'warning' : 'error')} paddingX={1}>
        <Input
          key="reject-reason"
          label={answered ? 'Your follow-up question' : 'Reason to reject'}
          placeholder={answered ? 'what else to find out; Enter sends it for a fresh try' : 'what to change, for the next worker; Enter sends it back'}
          value={S.rejecting.reason}
          autoFocus
          onInput={value => void (S.rejecting && (S.rejecting.reason = value))}
          onSubmit={submitReject}
        />
        <Button key="reject-cancel" label="Cancel (c)" hotkey="c" onPress={cancelReject} />
        <Text color={C('inactive')}>{boxHint('Enter sends it to todo')}</Text>
      </Box>
    ) : null
  if (inReview && !answered && S.diffOpen?.task === t.id) {
    // The changes themselves: the folder as it is now (the owner's edits too) against the merge base, colored line by line.
    const d = S.diffOpen
    const got = await folderDiff(claudeHost($), target, t, [], d.file).then(
      x => ({ lines: cutDiff(x.text, t.id, DIFF_LINES, d.file, S.N.name), error: '', mine: x.edits.length > 0 }),
      (err: Error) => ({ lines: [] as string[], error: err.message, mine: false }),
    )
    const kinds = diffKinds(got.lines)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            <Text bold color={C('claude')}>{t.id}</Text>{' '}
            <Text bold color={C(color.review!)}>
              {mark.review} {word.review}
            </Text>
            <Text color={C('inactive')}> · changes in {d.file || 'all files'}</Text>
            {got.mine ? <Text color={C('warning')}> {YOUR_EDITS}</Text> : null}
          </Text>
          <Text bold color={C('text')}>
            {t.title}
          </Text>
          {mergeStatus}
        </Box>
        {buttonRows([
          <Button key="diff-back" label="Back" hotkey="b" autoFocus={rejectBox ? undefined : true} onPress={() => ((S.diffOpen = null), $.ui.invalidate('ui.render'))} />,
          ...reviewButtons,
          d.file ? <Button key="diff-all" label="All files" hotkey="d" onPress={showDiff('')} /> : null,
        ], 'diff-buttons')}
        {rejectBox}
        <Box flexDirection="column">
          {got.error ? <Text color={C('error')}>Could not read the changes: {got.error}</Text> : null}
          {!got.error && !got.lines.length ? <Text color={C('inactive')}>no text changes</Text> : null}
          {got.lines.map((l, i) => (
            <Text key={`diff-${i}`} bold={kinds[i] === 'hunk' || (kinds[i] === 'header' && l.startsWith('diff '))} color={C(DIFF_COLOR[kinds[i]!])}>
              {l.replace(/\t/g, '    ') || ' '}
            </Text>
          ))}
        </Box>
        {footer(diffKeys(inReview && !merging, !!d.file), 'diff-keys')}
      </Box>
    )
  }
  // The owner's role override: a pick list of the known roles, set the same way as the lead's change role.
  const canPickRole = ['todo', 'paused', 'failed', 'backlog'].includes(t.status)
  if (S.rolePick && (S.rolePick.task !== t.id || !canPickRole)) S.rolePick = null
  const openRolePick = act(async () => {
    S.rolePick = { task: t.id, options: roleChoices(await loadRoles(claudeHost($)).catch(() => S.roles)) }
    $.ui.invalidate('ui.render')
  })
  const pickRole = (name: string) =>
    act(async () => {
      S.rolePick = null
      $.ui.invalidate('ui.render')
      const r = await runTool(claudeHost($), 'change', { task: t.id, role: name })
      $.ui.toast(S.N.toast(`${t.id} role: ${name}`))
      noteForLead(`The owner set the role of ${t.id} to ${name}: ${brief(r)}`)
    })
  const nowRole = roleOf(t).toLowerCase()
  const roleBox =
    S.rolePick?.task === t.id ? (
      <Box flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
        <Text bold color={C('text')}>Pick a role for {t.id}</Text>
        {S.rolePick.options.map(o => {
          const cur = o.toLowerCase() === nowRole
          const d = findRole(S.roles, o)?.description
          return (
            <Button key={`role:${o}`} autoFocus={cur ? true : undefined} onPress={pickRole(o)}>
              <Text bold={cur} color={C(cur ? 'ide' : 'text')}>{cur ? `● ${o}` : `○ ${o}`}</Text>
              {d ? <Text color={C('inactive')}> — {d}</Text> : null}
            </Button>
          )
        })}
        <Button key="role-cancel" label="Cancel (c)" hotkey="c" onPress={() => ((S.rolePick = null), $.ui.invalidate('ui.render'))} />
        <Text color={C('inactive')}>{pickHint('c')}</Text>
      </Box>
    ) : null
  // A task in review: the files it changed, each opening its diff.
  const changes = inReview && !answered
    ? await changedFiles(claudeHost($), target, t).then(
        files => ({ files, error: '' }),
        (err: Error) => ({ files: [] as DiffFile[], error: err.message }),
      )
    : null
  const fileWidth = Math.max(4, ...(changes?.files ?? []).map(f => f.file.length))
  // One line of colored pieces (from detailRowLines / wrapSegs).
  const segLine = (segs: Seg[], key: string) => (
    <Text key={key}>
      {segs.map((g, i) => (
        <Text key={`${key}-${i}`} bold={g.bold} italic={g.italic} color={C(g.color)}>
          {g.text}
        </Text>
      ))}
    </Text>
  )
  // The history as a timeline (T-512), newest first: each event's mark in its tone, its try label in bold, the words
  // wrapped under the mark with the connector (│) beside them, and a connector line between events.
  const historyLines = (events: HistoryEvent[]) =>
    events.flatMap((e, i) => {
      const last = i === events.length - 1
      const words: Seg[] = [
        ...(e.label ? [{ text: `${e.label}: `, color: 'text', bold: true } as Seg] : []),
        { text: e.said, color: e.tone === 'bad' && !e.result ? 'error' : 'inactive' },
        ...(e.result ? [{ text: ` → ${e.result}`, color: e.tone === 'good' || e.tone === 'bad' ? HISTORY_COLOR[e.tone] : 'text' } as Seg] : []),
      ]
      const wrapped = wrapSegs(words, Math.max(12, width - 2))
      return [
        ...wrapped.map((w, j) => segLine([j ? { text: last ? '  ' : '│ ', color: 'inactive' } : { text: `${e.mark} `, color: HISTORY_COLOR[e.tone], bold: true }, ...w], `history-${i}-${j}`)),
        ...(last ? [] : [segLine([{ text: '│', color: 'inactive' }], `history-${i}-line`)]),
      ]
    })
  const rows = detailRows(t, { roles: S.roles, kinds: S.kinds, all: v.tasks, when, nowMs: pane.nowMs, archivedDone: v.archived_done })
  // The saved worker reports, one per try: the latest shown, unless the owner picked another try (its number key).
  const reports = taskReports(t)
  if (S.reportTry && S.reportTry.task !== t.id) S.reportTry = null
  const picked = S.reportTry ? reports.findIndex(r => r.try === S.reportTry!.try) : -1
  const at = picked >= 0 ? picked : reports.length - 1
  const shown = reports[at]
  const reportBody = shown ? await $.fs.read(path(shown.file)).then(x => String(x), () => null) : null
  // An investigation's answer: the full text from its latest report, else the answer saved on the task.
  const answerShown = showsAnswer(t as BoardTask)
  const answerFrom = answerShown ? reports[reports.length - 1] : undefined
  const answerReport = !answerFrom ? null : answerFrom === shown ? reportBody : await $.fs.read(path(answerFrom.file)).then(x => String(x), () => null)
  const answer = answerShown ? answerText(t as BoardTask, answerReport).trimEnd() : ''
  const pickReport = (n: number) => () => ((S.reportTry = { task: t.id, try: n }), $.ui.invalidate('ui.render'))
  // A waiting task: buttons for a file request (Allow / Don't allow) or the worker's options, each with a number key, plus Answer….
  const asked = t as BoardTask
  // Finished work that waits only for the owner's files: nothing to answer; it merges on its own once they are
  // committed or stashed, and r runs just the merge now.
  const fileWait = fileWaitText(asked)
  // A running worker over its time limit: "Give it more time?" with +30 min / +60 min / Stop it (see overtimeQuestion).
  const overtime = t.status === 'doing' && !!asked.time_ask
  // T-511: a task whose tests run again on their own (rerunDue) has nothing to answer either
  const answerable = (t.status === 'waiting' && !fileWait && !rerunDue(asked)) || overtime
  const askedOptions = overtime ? [...OVERTIME_OPTIONS] : asked.options
  const askedQuestion = overtime ? overtimeQuestion(t.id, (v.max_minutes ?? 45) + (asked.extra_minutes ?? 0)) : t.question
  const choices = answerable ? answerChoices(overtime ? undefined : asked.asked_files, askedOptions) : []
  if (S.answering !== null && S.answering !== t.id) S.answering = null
  const typing = !choices.length || S.answering === t.id
  const cancelAnswer = () => ((S.answering = null), $.ui.invalidate('ui.render'))
  // Enter on the empty "Your answer" box leaves it: back to the answer buttons when Answer… opened it, else (a
  // plain question: the box is all there is) back to the board list
  const leaveAnswer = act(async () => (choices.length ? cancelAnswer() : await panelValues($).updateOpened(() => '')))
  const sendAnswer = (text: string) =>
    act(async () => {
      if (!text.trim()) return leaveAnswer()
      S.answering = null
      await runTool(claudeHost($), 'change', { task: t.id, answer: text.trim() })
      noteForLead(overtime ? `The owner answered ${t.id}'s "more time?" question: "${brief(text.trim())}".` : answeredLeadLine(t, text.trim(), brief))
    })
  const choicePress = (i: number) => {
    if (i === choices.length - 1) return () => ((S.answering = t.id), $.ui.invalidate('ui.render'))
    if (!overtime && asked.asked_files?.length) return act(async () => $.ui.toast(S.N.toast(i === 0 ? await allowAskedFiles(claudeHost($), t.id) : await refuseAskedFiles(claudeHost($), t.id))))
    return sendAnswer(choices[i]!)
  }
  // A failed task: why it failed (the same sentence as its board row and the lead's board), what to do next, and
  // what the failed try's report asks for (a NEED FILES line or a question), if anything. Only the report of the
  // try that failed counts: a try that left no report (no result, could not start) must not show an older try's ask.
  const failed = t.status === 'failed'
  const latest = reports[reports.length - 1]
  const latestBody = !failed || !latest || latest.try !== t.attempts ? null : latest === shown ? reportBody : await $.fs.read(path(latest.file)).then(x => String(x), () => null)
  const why = failed ? { reason: whyFailed(t), next: failNext(t), asks: failAsks(latestBody ?? t.history.at(-1) ?? '') } : null
  // Copy (y): the task as plain text on the clipboard, with the latest worker report, and a toast saying whether it took.
  const goBack = act(async () => ((S.diffOpen = null), (S.rejecting = null), await panelValues($).updateOpened(() => '')))
  const openTask = (id: string) => act(async () => ((S.diffOpen = null), (S.rejecting = null), await panelValues($).updateOpened(() => id)))
  const pauseIt = act(async () => (await runTool(claudeHost($), 'pause', { task: t.id, reason: 'paused by the owner' }), noteForLead(`The owner paused ${t.id}.`)))
  const resumeIt = act(async () => (await runTool(claudeHost($), 'resume', { task: t.id }), noteForLead(`The owner resumed ${t.id}.`)))
  const mergeNow = startMerge(MERGING_LINE, `Merging ${t.id} now…`, () => runTool(claudeHost($), 'retry', { task: t.id }), () => noteForLead(`The owner asked to merge ${t.id} now (it waited for their files).`))
  const retryIt = act(async () => (await runTool(claudeHost($), 'retry', { task: t.id }), noteForLead(`The owner retried ${t.id}.`)))
  const toTodo = act(async () => (await runTool(claudeHost($), 'change', { task: t.id, backlog: false }), noteForLead(`The owner moved ${t.id} from the backlog to todo.`)))
  const stashIt = act(async () => (await runTool(claudeHost($), 'change', { task: t.id, backlog: true }), noteForLead(`The owner moved ${t.id} to the backlog.`)))
  const dropIt = act(async () => (await runTool(claudeHost($), 'drop', { task: t.id, reason: 'dropped by the owner' }), noteForLead(`The owner dropped ${t.id}.`)))
  // Already merged (h, T-514): the owner merged its branch by hand; symcc checks it with git and marks it done (nothing is merged or tested)
  const canMarkMerged = MARK_MERGED_FROM.includes(t.status) && !isInvestigation(t) && t.attempts > 0
  const markMergedIt = act(async () => {
    const r = await runTool(claudeHost($), 'merged', { task: t.id, by: 'the owner' })
    $.ui.toast(S.N.toast(r))
    noteForLead(`The owner marked ${t.id} done: its work was already merged outside the board.`)
  })
  const watchIt = act(async () => (agentId ? $.ui.view({ agentId }) : undefined))
  const toggleReview = act(async () => {
    const r = await runTool(claudeHost($), 'change', { task: t.id, needs_review: !t.needs_review })
    $.ui.toast(S.N.toast(r))
    noteForLead(`The owner turned needs_review ${t.needs_review ? 'off' : 'on'} for ${t.id}.`)
  })
  const copyTask = (press?: { surface?: Parameters<typeof $.ui.copy>[0]['surface'] }) =>
    act(async () => {
      const latest = reports[reports.length - 1]
      const report = latest ? await $.fs.read(path(latest.file)).then(x => String(x), () => null) : null
      const r = await $.ui.copy({ text: taskCopyText(t, { roles: S.roles, report }), ...(press?.surface ? { surface: press.surface } : {}) })
      $.ui.toast(S.N.toast(copyToast(t.id, r)))
    })()
  // VS Code's side panel: its own wide page, with buttons and no key hints (see vscode-task.tsx)
  if (pane.vscode)
    return taskPageVs(pane, t, {
      agentId, inReview, answered, target, merging, result, resultOk, rows, changes, reports, at, shown, reportBody, answerShown, answerFrom, answer, fileWait, overtime, answerable, askedQuestion, choices, why, canPickRole, canMarkMerged, nowRole,
      redraw: () => $.ui.invalidate('ui.render'),
      on: { back: goBack, open: openTask, approve: approveIt, keepNote, askReason, cancelReject, submitReject, showDiff, pause: pauseIt, resume: resumeIt, mergeNow, retry: retryIt, toTodo, stash: stashIt, markMerged: markMergedIt, drop: dropIt, watch: watchIt, toggleReview, copy: copyTask, openRolePick, pickRole, cancelRolePick: () => ((S.rolePick = null), $.ui.invalidate('ui.render')), choicePress, sendAnswer, pickReport },
    })
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        {wrapSegs([{ text: t.id, color: 'claude', bold: true }, { text: `  ${t.title}`, color: 'text', bold: true }], width).map((l, i) => segLine(l, `title-${i}`))}
        <Text>
          <Text bold color={C(STATUS_BADGE[t.status])}>{`[${statusMark(t)} ${answered ? 'answered: read it' : word[t.status]}]`}</Text>
          {agentId ? <Text color={C('inactive')}> · a worker is on it now</Text> : null}
        </Text>
        {mergeStatus}
      </Box>

      {why && (
        <Box flexDirection="column">
          {heading('Why it failed')}
          {wrapSegs([{ text: why.reason, color: 'text' }], Math.max(12, width - 2)).map((w, j) => segLine([{ text: '  ', color: 'text' }, ...w], `why-${j}`))}
          {why.asks ? wrapSegs([{ text: why.asks, color: 'warning' }], Math.max(12, width - 2)).map((w, j) => segLine([{ text: '  ', color: 'text' }, ...w], `why-asks-${j}`)) : null}
          {wrapSegs([{ text: `Next: ${why.next}`, color: 'inactive' }], Math.max(12, width - 2)).map((w, j) => segLine([{ text: '  ', color: 'text' }, ...w], `why-next-${j}`))}
        </Box>
      )}

      {buttonRows([
        <Button key="back" label="Back" hotkey="b" autoFocus={answerable || rejectBox ? undefined : true} onPress={goBack} />,
        ...reviewButtons,
        inReview && !answered && <Button key="show-changes" label="Show changes" hotkey="d" onPress={showDiff('')} />,
        agentId && <Button key="watch" label="Watch worker" hotkey="w" onPress={watchIt} />,
        (t.status === 'doing' || t.status === 'todo') && (
          <Button key="pause" label="Pause" hotkey="p" onPress={pauseIt} />
        ),
        t.status === 'paused' && (
          <Button key="resume" label="Resume" hotkey="u" onPress={resumeIt} />
        ),
        fileWait && !merging && (
          <Button key="merge-now" label="Merge now (r)" hotkey="r" onPress={mergeNow} />
        ),
        (t.status === 'failed' || t.status === 'dropped') && (
          <Button key="retry" label="Retry" hotkey="r" onPress={retryIt} />
        ),
        t.status === 'backlog' && (
          <Button key="to-todo" label="Move to todo (o)" hotkey="o" onPress={toTodo} />
        ),
        (t.status === 'todo' || t.status === 'paused' || t.status === 'failed') && (
          <Button key="stash" label="Stash to backlog (k)" hotkey="k" onPress={stashIt} />
        ),
        canPickRole && <Button key="role" label="Role (l)" hotkey="l" onPress={openRolePick} />,
        canMarkMerged && <Button key="already-merged" label="Already merged (h)" hotkey="h" onPress={markMergedIt} />,
        t.status !== 'done' && t.status !== 'dropped' && (
          <Button key="drop" label="Drop" hotkey={inReview ? undefined : 'x'} onPress={dropIt} />
        ),
        t.status !== 'done' && t.status !== 'dropped' && (
          <Button
            key="needs-review"
            label={`Needs review: ${t.needs_review ? 'on' : 'off'}`}
            hotkey="n"
            onPress={toggleReview}
          />
        ),
        <Button key="copy" label="Copy (y)" hotkey="y" onPress={copyTask} />,
      ], 'task-buttons')}

      {rejectBox}
      {roleBox}

      {answerShown && (
        <Box flexDirection="column">
          {heading(answerFrom ? `Answer (try ${answerFrom.try})` : 'Answer')}
          {answerFrom ? <Text color={C('inactive')}>  {answerFrom.file}</Text> : null}
          {!answer ? <Text color={C('inactive')}>  (no answer saved)</Text> : null}
          {answer
            .split('\n')
            .flatMap((l, i) => (l.trim() ? wrapSegs([{ text: l, color: 'text' }], Math.max(12, width - 2)).map((w, j) => segLine([{ text: '  ', color: 'text' }, ...w], `answer-${i}-${j}`)) : answer ? [<Text key={`answer-${i}`}> </Text>] : []))}
        </Box>
      )}

      <Box flexDirection="column">
        {heading('Details')}
        {rows.flatMap((r, i) => detailRowLines(r, width).map((l, j) => segLine(l, `row-${i}-${j}`)))}
      </Box>

      {changes && (
        <Box flexDirection="column">
          {heading(`Changes (${changes.files.length} ${changes.files.length === 1 ? 'file' : 'files'}, against ${target})${changes.files.some(f => f.edited) ? ` ${YOUR_EDITS}` : ''}`)}
          <Text color={C('inactive')}>  folder: {S.N.dir}/worktrees/{t.id} · edit files there, then approve (the tests run again)</Text>
          {changes.error ? <Text color={C('error')}>  Could not read the changes: {changes.error}</Text> : null}
          {!changes.error && !changes.files.length ? <Text color={C('inactive')}>  no changes</Text> : null}
          {changes.files.map(f => (
            <Button key={`file:${f.file}`} onPress={showDiff(f.file)}>
              <Text color={C('autoAccept')}>{f.file.padEnd(fileWidth)}</Text>
              {f.binary ? (
                <Text color={C('inactive')}>  binary</Text>
              ) : (
                <Text>
                  {'  '}
                  <Text color={C('success')}>+{f.added}</Text> <Text color={C('error')}>-{f.removed}</Text>
                </Text>
              )}
              {f.edited ? <Text color={C('warning')}>  edited by you</Text> : null}
            </Button>
          ))}
          <Text color={C('inactive')}>  Enter on a file shows its diff · d all files</Text>
        </Box>
      )}

      {fileWait && (
        <Box flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
          <Text color={C('text')}>{fileWait}</Text>
          {merging ? null : <Text color={C('inactive')}>r merges it now</Text>}
        </Box>
      )}

      {answerable && answerBox(pane, { question: askedQuestion ?? '(no question)', choices, typing, onChoice: choicePress, onSubmit: value => sendAnswer(value)(), onCancel: cancelAnswer })}

      <Box flexDirection="column">
        {heading('What to do')}
        {t.details.trim() ? paragraphs(t.details.trimEnd()) : <Text color={C('inactive')}>(no details)</Text>}
      </Box>

      {t.history.length > 0 && (
        <Box flexDirection="column">
          {heading(`History (${t.history.length}, newest first)`)}
          {historyLines([...t.history].reverse().map(historyEvent))}
        </Box>
      )}

      {/* An answered investigation with one try: its report is the Answer above, so it is not shown twice. */}
      {(reports.length > 0 || t.attempts > 0) && !(answerShown && answerFrom && reports.length === 1) && (
        <Box flexDirection="column">
          {heading(shown ? `Report (try ${shown.try}${reports.length > 1 ? `, ${at + 1} of ${reports.length}` : ''})` : 'Report')}
          {!shown ? <Text color={C('inactive')}>  no saved report</Text> : null}
          {shown ? <Text color={C('inactive')}>  {shown.file}</Text> : null}
          {shown && reportBody === null ? <Text color={C('error')}>  Could not read the report file.</Text> : null}
          {reportBody !== null
            ? reportBody
                .trimEnd()
                .split('\n')
                .flatMap((l, i) => (l.trim() ? wrapSegs([{ text: l, color: 'text' }], Math.max(12, width - 2)).map((w, j) => segLine([{ text: '  ', color: 'text' }, ...w], `report-${i}-${j}`)) : [<Text key={`report-${i}`}> </Text>]))
            : null}
          {reports.length > 1
            ? buttonRows(
                reports.map((r, i) => <Button key={`report-try-${r.try}`} label={`${i === at ? '● ' : ''}Try ${r.try}${r.try <= 9 && !choices.length ? ` (${r.try})` : ''}`} hotkey={r.try <= 9 && !choices.length ? String(r.try) : undefined} onPress={pickReport(r.try)} />),
                'report-buttons',
              )
            : null}
        </Box>
      )}

      {(t.runs?.length ?? 0) > 0 && (
        <Box flexDirection="column">
          {heading('Runs (time and cost)')}
          {t.runs!.map((r, i) => (
            <Text color={C(r.ended ? 'inactive' : 'success')}>{`  ${fmtRun(r, i, pane.nowMs)}`}</Text>
          ))}
          <Text bold color={C('text')}>{`  total: ${fmtTotal(sumRuns(t.runs, pane.nowMs))}`}</Text>
        </Box>
      )}

      {footer(taskKeys(t.status, !!agentId, reports.map(r => r.try), answerable && choices.length > 0, !!fileWait, isInvestigation(t)).filter(h => !merging || !MERGE_KEYS.includes(h.key)), 'task-keys')}
    </Box>
  )
}
