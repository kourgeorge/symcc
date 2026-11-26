// The board panel's page for one task: details, actions, and for a task in review its changes.
import type { SymccTask } from '../../../types'
import { cutDiff, DIFF_LINES, diffKinds, DIFF_COLOR, diffKeys, roleChoices, roleOf, findRole, type DiffFile, type Seg, detailRows, taskKeys, YOUR_EDITS, intoOf, taskReports, type BoardTask, boxHint, pickHint, taskCopyText, copyToast, fileWaitText, isAnswered, showsAnswer, answerText, whyFailed, taskActions, taskAsks, canPickRole as canPickRoleOf, canMarkMerged as canMarkMergedOf, type TaskActionId, type TaskAction, type KeyHint, failNext, failAsks, answeredLeadLine, sessionNote, hasMergedChanges } from '../../board'
import { folderDiff, changedFiles, mergedChanges, mergedDiff } from '../../app/review'
import { loadRoles } from '../../app/roles'
import { loadKinds } from '../../app/kinds'
import { type PaneView, S, workers } from '../../app/state'
import { taskBranchFacts } from '../../app/branches'
import { type $, panelValues } from '../panel'
import { path, taskWithParts } from '../../app/store'
import { searchMore } from '../../app/search-parts'
import { noteForLead, brief, tellLead } from '../../app/tell'
import { when } from '../../core/days'
import { runTool, allowAskedFiles, refuseAskedFiles } from '../../app/tools'
import type { PaneParts } from './parts'
import { answerBox, dropDraft, fieldRows } from './answer-box'
import { taskPageVs } from './vscode-task'
import { taskSections, checkerReportOf, type SectionLine, type TaskSection } from '../../core/task-sections'
import { NAV_KEYS, navHint, TASK_ID_COLOR, sizeSegs, taskPlace, taskStateGroups, type PageFrom } from '../../core/page-header'
import { pageHeader, type PageHeader } from './page-header'
import { claudeHost } from '../host'
import { mergingNow, mergeOutcome } from '../../app/workers'
import { boardAnswered } from '../../app/questions'
import { canRunNow, runNowQuestion, runNowWaits, RUN_NOW_NO, RUN_NOW_YES } from '../../core/run-now'

/** The line a task's page shows in place of its review buttons while it merges. */
export const MERGING_LINE = 'Merging… (tests running)'
/** Tasks whose Approve, Done, Keep as a note or Merge now was pressed and still runs: the line their page shows meanwhile. */
const pressed = new Map<string, string>()
/** The last such press's result for each task, shown on its page once it ends (until the next press). */
const lastResult = new Map<string, { text: string; ok: boolean }>()
/** What task `id`'s page says while its merge runs, or '' when none does (pressed here, or approved another way). */
export const mergingLine = (id: string): string => pressed.get(id) ?? (mergingNow(id) ? MERGING_LINE : '')

/** One task opened: its details and actions; for a task in review also its changes. */
export async function taskPage($: $, pane: PaneParts, viewTask: SymccTask) {
  // T-829: a task the view slimmed gets its details and history back from its parts file, for this page only
  const t = await taskWithParts(claudeHost($), viewTask)
  const { Box, Text, Button, Input, v, width, color, word, mark, act, C, footer, buttonRows, heading, paragraphs } = pane
  // desktop and mobile draw every Button as a native button: there a button gets its label plain, no brackets (as the header)
  const terminal = pane.vs.surface === 'terminal'
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
    // a pop-up asking about this task gets the press as its answer (T-579)
    () => (boardAnswered(t.id, answered ? 'Done' : 'Approve'), runTool(claudeHost($), 'approve', { task: t.id })),
    r => noteForLead(answered ? `The owner read the answer of ${t.id} and marked it done: ${brief(r)}` : `The owner approved ${t.id}: ${brief(r)}`),
  )
  const keepNote = startMerge(
    'Keeping the answer as a note…',
    `Keeping the answer of ${t.id} as a note…`,
    () => (boardAnswered(t.id, 'Keep as a note'), runTool(claudeHost($), 'approve', { task: t.id, keep_note: true })),
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
  // the page's actions (shared with VS Code and OpenCode, see taskActions); the terminal draws each as a Button, and its key hints are the ones with a key
  // T-899: on an answered investigation Done and Keep as a note end the task and nothing undoes them, so they get no
  // letter key here (a, v are in everyday words: typing a question while the keys reach the page pressed Done); they
  // are pressed as buttons only. Ask more (x) only opens its box.
  const actions = taskActions(t as BoardTask, { worker: !!agentId, merging: !!merging }).map((x): TaskAction =>
    answered && (x.id === 'done' || x.id === 'keep-note') ? (({ key: _, ...rest }) => rest)(x) : x,
  )
  // T-899: while the Ask more / Reject box is open, no letter or digit key on the page presses anything: every key
  // belongs to the box (the box may have lost the focus, e.g. to the lead's pop-up question)
  const boxOpen = inReview && !merging && S.rejecting?.task === t.id
  // T-899: the page's other keys don't work while the box is open, so its footer names only the box's way out
  const boxKeys: KeyHint[] = [{ key: 'Enter', word: 'sends to todo' }, { key: 'Enter on empty', word: 'cancels' }]
  // the diff view keeps its own row of review buttons (Approve, Reject; Back there goes back to the task)
  const reviewButtons = actions.filter(x => x.id === 'approve' || x.id === 'reject').map(x => <Button key={x.id} label={x.label} hotkey={boxOpen ? undefined : x.key} onPress={x.id === 'approve' ? approveIt : askReason} />)
  const submitReject = (value: string) =>
    act(async () => {
      const why = value.trim()
      if (!why) return cancelReject()
      const r = await runTool(claudeHost($), 'reject', { task: t.id, reason: why })
      boardAnswered(t.id, `${answered ? 'Ask more' : 'Reject'}: ${why}`)
      S.rejecting = null
      S.diffOpen = null
      $.ui.toast(S.N.toast(r))
      noteForLead(answered ? `The owner asked more on ${t.id} ("${brief(why)}"): ${brief(r)}` : `The owner rejected ${t.id} ("${brief(why)}"): ${brief(r)}`)
    })()
  /** The box that asks why, once Reject was pressed. Enter on it empty, or its Cancel button, leaves it: Esc doesn't
   *  reach the panel from a text box. Its Cancel has no key (T-899: a typed letter must never leave the box). */
  const rejectLabel = answered ? 'Your follow-up question' : 'Reason to reject'
  /** Keeps what is typed and draws the page again when the field needs another row (T-917: it grows with the text). */
  const growWith = (value: string) => {
    if (!S.rejecting) return
    const before = fieldRows(S.rejecting.reason, width, rejectLabel)
    S.rejecting.reason = value
    if (fieldRows(value, width, rejectLabel) !== before) $.ui.invalidate('ui.render')
  }
  const rejectBox =
    boxOpen && S.rejecting ? (
      <Box flexDirection="column" borderStyle="round" borderColor={C(answered ? 'warning' : 'error')} paddingX={1}>
        <Input
          key="reject-reason"
          label={rejectLabel}
          placeholder={answered ? 'what else to find out; Enter sends it for a fresh try' : 'what to change, for the next worker; Enter sends it back'}
          value={S.rejecting.reason}
          rows={fieldRows(S.rejecting.reason, width, rejectLabel)}
          autoFocus
          onInput={growWith}
          onSubmit={submitReject}
        />
        {terminal ? (
          <Button key="reject-cancel" plain label="Cancel" onPress={cancelReject}>
            <Text color={C('text')}>[Cancel]</Text>
          </Button>
        ) : (
          <Button key="reject-cancel" label="Cancel" variant="secondary" onPress={cancelReject} />
        )}
        <Text color={C('inactive')}>{boxHint('Enter sends to todo', 'cancels')}</Text>
      </Box>
    ) : null
  // T-1086: a done change task keeps its changes: the diff comes from git (what its merge brought into main)
  const doneDiff = hasMergedChanges(t)
  if (((inReview && !answered) || doneDiff) && S.diffOpen?.task === t.id) {
    // The changes themselves: the folder as it is now (the owner's edits too) against the merge base, colored line by line.
    const d = S.diffOpen
    const got = await (doneDiff ? mergedDiff(claudeHost($), t, d.file).then(text => ({ text, edits: [] as string[] })) : folderDiff(claudeHost($), target, t, [], d.file)).then(
      x => ({ lines: cutDiff(x.text, t.id, DIFF_LINES, d.file, S.N.name), error: '', mine: x.edits.length > 0 }),
      (err: Error) => ({ lines: [] as string[], error: err.message, mine: false }),
    )
    const kinds = diffKinds(got.lines)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            <Text bold color={C('claude')}>{t.id}</Text>{' '}
            <Text bold color={C(color[doneDiff ? t.status : 'review']!)}>
              {mark[doneDiff ? t.status : 'review']} {word[doneDiff ? t.status : 'review']}
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
          <Button key="diff-back" label="Back" hotkey={rejectBox ? undefined : 'b'} autoFocus={rejectBox ? undefined : true} onPress={() => ((S.diffOpen = null), $.ui.invalidate('ui.render'))} />,
          ...reviewButtons,
          d.file ? <Button key="diff-all" label="All files" hotkey={rejectBox ? undefined : 'd'} onPress={showDiff('')} /> : null,
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
        {footer(boxOpen ? boxKeys : diffKeys(inReview && !merging, !!d.file), 'diff-keys')}
      </Box>
    )
  }
  // The owner's role override: a pick list of the known roles, set the same way as the lead's change role.
  const canPickRole = canPickRoleOf(t)
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
  const cancelRole = () => ((S.rolePick = null), $.ui.invalidate('ui.render'))
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
        {terminal ? (
          <Button key="role-cancel" plain label="Cancel" onPress={cancelRole}>
            <Text color={C('text')}>[Cancel]</Text>
          </Button>
        ) : (
          <Button key="role-cancel" label="Cancel" variant="secondary" onPress={cancelRole} />
        )}
        <Box key="role-cancel-keys" display="none">
          <Button key="role-cancel-key" label="Cancel" hotkey="c" onPress={cancelRole} />
        </Box>
        <Text color={C('inactive')}>{pickHint('c')}</Text>
      </Box>
    ) : null
  // A task in review: the files it changed, each opening its diff.
  const changes = inReview && !answered
    ? await changedFiles(claudeHost($), target, t).then(
        files => ({ files, error: '' }),
        (err: Error) => ({ files: [] as DiffFile[], error: err.message }),
      )
    : doneDiff
      ? await mergedChanges(claudeHost($), t).catch(() => null)
      : null
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
  // an approve this page started shows its step at once, not "ready for review": on the Status row and the
  // Stage line alike (one flag for the whole page)
  const pageMerging = !!mergingLine(t.id)
  const rows = detailRows(t, { roles: S.roles, kinds: S.kinds, all: v.tasks, when, nowMs: pane.nowMs, archivedDone: v.archived_done, board: v, merging: pageMerging, driving: v.driving ?? S.driving })
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
  const failed = t.status === 'failed'
  const latest = reports[reports.length - 1]
  // the report texts the sections need: the one shown, and the latest for an answer or a failed try's ask
  const texts: Record<string, string | null> = shown ? { [shown.file]: reportBody } : {}
  if (latest && !(latest.file in texts) && (answerShown || (failed && latest.try === t.attempts))) texts[latest.file] = await $.fs.read(path(latest.file)).then(x => String(x), () => null)
  // T-1079: the checker's saved report of the try shown (its own section)
  const checkerSaved = checkerReportOf(t, shown?.try ?? t.attempts)
  if (checkerSaved) texts[checkerSaved.file] = await $.fs.read(path(checkerSaved.file)).then(x => String(x), () => null)
  const answer = answerShown ? answerText(t as BoardTask, answerFrom ? texts[answerFrom.file] : null).trimEnd() : ''
  const pickReport = (n: number) => () => ((S.reportTry = { task: t.id, try: n }), $.ui.invalidate('ui.render'))
  // A waiting task: buttons for a file request (Allow / Don't allow) or the worker's options, each with a number key, plus Answer….
  // Finished work that waits only for the owner's files: nothing to answer; it merges on its own once they are
  // committed or stashed, and r runs just the merge now.
  const fileWait = fileWaitText(t as BoardTask)
  // What it asks (taskAsks): a waiting task's question, or a running worker over its time limit: "Give it more
  // time?" with +30 min / +60 min / Stop it.
  const asks = taskAsks(t as BoardTask, v.max_minutes)
  const overtime = !!asks?.overtime
  const answerable = !!asks
  const askedQuestion = asks?.text
  const choices = asks?.choices ?? []
  // nothing asked any more (answered elsewhere, or it stopped waiting): a half-typed answer must not come back on its next question (T-917)
  if (!asks) dropDraft(t.id)
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
      // a pop-up asking about this task gets the answer; then the lead needs no "Meanwhile" line as well, unless the
      // pop-up ends without a result (T-579)
      const note = () => noteForLead(overtime ? `The owner answered ${t.id}'s "more time?" question: "${brief(text.trim())}".` : answeredLeadLine(t, text.trim(), brief))
      if (boardAnswered(t.id, text.trim(), note)) return
      note()
    })
  const choicePress = (i: number) => {
    if (i === choices.length - 1) return () => ((S.answering = t.id), $.ui.invalidate('ui.render'))
    if (asks?.files.length)
      return act(async () => {
        // an open pop-up of the lead's for this task gets the answer; the lead is told only once (T-968)
        const said = i === 0 ? await allowAskedFiles(claudeHost($), t.id, true) : await refuseAskedFiles(claudeHost($), t.id, true)
        $.ui.toast(S.N.toast(said))
      })
    return sendAnswer(choices[i]!)
  }
  // A failed task: why it failed (the same sentence as its board row and the lead's board), what to do next, and
  // what the failed try's report asks for (a NEED FILES line or a question), if anything. Only the report of the
  // try that failed counts: a try that left no report (no result, could not start) must not show an older try's ask.
  const latestBody = !failed || !latest || latest.try !== t.attempts ? null : (texts[latest.file] ?? null)
  const why = failed ? { reason: whyFailed(t), next: failNext(t), asks: failAsks(latestBody ?? t.history.at(-1)?.text ?? '') } : null
  // Copy (y): the task as plain text on the clipboard, with the latest worker report, and a toast saying whether it took.
  const goBack = act(async () => ((S.diffOpen = null), (S.rejecting = null), await panelValues($).updateOpened(() => '')))
  const openTask = (id: string) => act(async () => ((S.diffOpen = null), (S.rejecting = null), await panelValues($).updateOpened(() => id)))
  const pauseIt = act(async () => (await runTool(claudeHost($), 'pause', { task: t.id, reason: 'paused by the owner' }), noteForLead(`The owner paused ${t.id}.`)))
  const resumeIt = act(async () => (await runTool(claudeHost($), 'resume', { task: t.id }), noteForLead(`The owner resumed ${t.id}.`)))
  const mergeNow = startMerge(MERGING_LINE, `Merging ${t.id} now…`, () => runTool(claudeHost($), 'retry', { task: t.id }), () => noteForLead(`The owner asked to merge ${t.id} now (it waited for their files).`))
  const retryIt = act(async () => (await runTool(claudeHost($), 'retry', { task: t.id }), noteForLead(`The owner retried ${t.id}.`)))
  // T-954: Run now starts its worker at once; when it waits on unfinished tasks, it asks "Start anyway?" first (Cancel is the default)
  const waits = runNowWaits({ tasks: v.tasks, ...(v.archived_done ? { archived_done: v.archived_done } : {}) }, t)
  if (S.runNowAsk && (S.runNowAsk !== t.id || !canRunNow(t) || !waits.length)) S.runNowAsk = null
  const runNowGo = (anyway: boolean) =>
    act(async () => {
      S.runNowAsk = null
      redraw()
      const r = await runTool(claudeHost($), 'run', { task: t.id, ...(anyway ? { anyway: true } : {}) })
      $.ui.toast(S.N.toast(r))
      noteForLead(`The owner ran ${t.id} now${anyway ? ' (start anyway)' : ''}: ${brief(r)}`)
    })
  const runNowIt = waits.length ? () => ((S.runNowAsk = t.id), redraw()) : runNowGo(false)
  const cancelRunNow = () => ((S.runNowAsk = null), redraw())
  const runNowBox =
    S.runNowAsk === t.id ? (
      <Box key="run-now-box" flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
        <Text color={C('warning')}>{runNowQuestion(t.id, waits)}</Text>
        <Box flexDirection="row" gap={1}>
          <Button key="run-now-yes" label={RUN_NOW_YES} onPress={runNowGo(true)} />
          <Button key="run-now-cancel" label={RUN_NOW_NO} autoFocus onPress={cancelRunNow} />
        </Box>
      </Box>
    ) : null
  const toTodo = act(async () => (await runTool(claudeHost($), 'change', { task: t.id, backlog: false }), noteForLead(`The owner moved ${t.id} from the backlog to todo.`)))
  const stashIt = act(async () => (await runTool(claudeHost($), 'change', { task: t.id, backlog: true }), noteForLead(`The owner moved ${t.id} to the backlog.`)))
  const dropIt = act(async () => (await runTool(claudeHost($), 'drop', { task: t.id, reason: 'dropped by the owner' }), noteForLead(`The owner dropped ${t.id}.`)))
  // Already merged (h, T-514): the owner merged its branch by hand; symcc checks it with git and marks it done (nothing is merged or tested)
  const canMarkMerged = canMarkMergedOf(t)
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
  /** What each of the page's action buttons does here. */
  const press: Record<TaskActionId, () => void> = {
    done: approveIt, approve: approveIt, 'keep-note': keepNote, 'ask-more': askReason, reject: askReason,
    'show-changes': showDiff(''), watch: watchIt, pause: pauseIt, resume: resumeIt, 'merge-now': mergeNow, retry: retryIt, 'run-now': runNowIt, 'to-todo': toTodo, stash: stashIt,
    role: openRolePick, 'already-merged': markMergedIt, drop: dropIt, 'needs-review': toggleReview, copy: copyTask,
  }
  // the page header (T-751): where you are (the tab it was opened from, its place in that list), the title, the state,
  // the buttons in groups (core's taskActions), then a thin rule
  const from: PageFrom = pane.onLive ? 'live' : 'tasks'
  const place = taskPlace(v, t.id, from, pane.nowMs, S.search?.text ?? '', searchMore)
  const header: PageHeader = {
    from, label: t.id, place, title: t.title, color: TASK_ID_COLOR, size: sizeSegs(t as BoardTask),
    state: taskStateGroups(t as BoardTask, { nowMs: pane.nowMs, merging: pageMerging, ...(v.auto_retries !== undefined ? { autoRetries: v.auto_retries } : {}), note: sessionNote(t, v.driving ?? S.driving, pane.nowMs) }),
    buttons: actions.map(x => ({ id: x.id, label: x.label, group: x.group, ...(x.key ? { key: x.key } : {}), onPress: press[x.id] })),
    onBack: goBack, onPrev: place ? openTask(place.prev) : () => undefined, onNext: place ? openTask(place.next) : () => undefined,
    backFocus: !(answerable || rejectBox || runNowBox), nav: NAV_KEYS.claude, ...(rejectBox ? { noKeys: true } : {}),
  }
  // T-761: the Branch section's git facts: the last ones read (the view's, or this page's own read); a stale read runs
  // in the background, never waited for here, and redraws the page once it is done
  const branchRead = taskBranchFacts(claudeHost($), t, target, pane.nowMs, redraw).facts
  const branch = branchRead ?? (v as PaneView).task_branches?.[t.id]
  // The page's sections (shared with OpenCode, and their contents with VS Code; see core/task-sections.ts)
  const sections = taskSections(t, {
    ...(branch ? { branch } : {}),
    width, nowMs: pane.nowMs, detail: { roles: S.roles, kinds: S.kinds, all: v.tasks, when, archivedDone: v.archived_done, board: v, merging: pageMerging, driving: v.driving ?? S.driving }, texts,
    ...(shown ? { shownTry: shown.try } : {}), changes, target, dataDir: S.N.dir, numberKeysTaken: choices.length > 0,
  })
  const section = (id: TaskSection['id']) => sections.find(x => x.id === id)
  /** One line of a section, as the terminal draws it. */
  const lineEl = (l: SectionLine, i: number, name: string) =>
    l.plain ? (
      <Text key={l.key} bold={l.segs[0]!.bold} color={C(l.segs[0]!.color)}>{l.segs.map(g => g.text)}</Text>
    ) : !l.segs.length ? (
      <Text key={l.key ?? `${name}-${i}`}> </Text>
    ) : (
      segLine(l.segs, l.key ?? `${name}-${i}`)
    )
  /** A changed file's line: a button that opens its diff. */
  const fileButton = (f: DiffFile) => (
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
  )
  const fileWidth = Math.max(4, ...(changes?.files ?? []).map(f => f.file.length))
  /** Section `id` with its heading and lines (nothing when the task has none); What to do keeps its rich drawing. */
  const sectionEl = (id: TaskSection['id']) => {
    const sec = section(id)
    if (!sec) return null
    const body =
      id === 'what'
        ? t.details.trim() ? paragraphs(t.details.trimEnd()) : sec.lines.map((l, i) => lineEl(l, i, id))
        : sec.lines.map((l, i) => {
            const file = l.action ? changes?.files.find(f => f.file === l.action!.diff) : undefined
            return file ? fileButton(file) : lineEl(l, i, id)
          })
    return (
      <Box flexDirection="column">
        {heading(sec.title)}
        {body}
        {sec.tries
          ? buttonRows(
              // "[Try 1] [● Try 2]" as the header's buttons (T-775): plain, framed the same, no key in the label; the
              // keys (1-9, listed in the footer) belong to hidden Buttons below
              sec.tries.map(r => {
                const label = `${r.shown ? '● ' : ''}Try ${r.try}`
                if (!terminal) return <Button key={`report-try-${r.try}`} label={label} variant="secondary" onPress={pickReport(r.try)} />
                return (
                  <Button key={`report-try-${r.try}`} plain label={label} onPress={pickReport(r.try)}>
                    <Text color={C('text')}>{`[${label}]`}</Text>
                  </Button>
                )
              }),
              'report-buttons',
            )
          : null}
        {sec.tries?.some(r => r.key) && !rejectBox ? (
          <Box key="report-try-keys" display="none">
            {sec.tries.filter(r => r.key).map(r => <Button key={`report-try-${r.try}-key`} label={r.key!} hotkey={r.key!} onPress={pickReport(r.try)} />)}
          </Box>
        ) : null}
      </Box>
    )
  }
  // VS Code's side panel: its own wide page, with buttons and no key hints (see vscode-task.tsx)
  if (pane.vscode)
    return taskPageVs(pane, t, {
      header, agentId, inReview, runNowAsk: S.runNowAsk === t.id ? runNowQuestion(t.id, waits) : '', answered, target, merging, result, resultOk, rows, changes, reports, at, shown, reportBody, checkerBody: checkerSaved ? (texts[checkerSaved.file] ?? null) : null, answerShown, answerFrom, answer, sections, fileWait, overtime, answerable, askedQuestion, choices, why, canPickRole, canMarkMerged, nowRole,
      redraw: () => $.ui.invalidate('ui.render'),
      on: { back: goBack, open: openTask, approve: approveIt, keepNote, askReason, cancelReject, submitReject, showDiff, pause: pauseIt, resume: resumeIt, mergeNow, retry: retryIt, runNow: runNowIt, startAnyway: runNowGo(true), cancelRunNow, toTodo, stash: stashIt, markMerged: markMergedIt, drop: dropIt, watch: watchIt, toggleReview, copy: copyTask, openRolePick, pickRole, cancelRolePick: () => ((S.rolePick = null), $.ui.invalidate('ui.render')), choicePress, sendAnswer, pickReport },
    })
  return (
    <Box flexDirection="column" gap={1}>
      {pageHeader(pane, header)}
      {mergeStatus}

      {sectionEl('done')}
      {sectionEl('why')}

      {rejectBox}
      {runNowBox}
      {roleBox}

      {sectionEl('answer')}
      {sectionEl('details')}
      {sectionEl('branch')}
      {sectionEl('changes')}

      {fileWait && (
        <Box flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
          <Text color={C('text')}>{fileWait}</Text>
          {merging ? null : <Text color={C('inactive')}>r merges it now</Text>}
        </Box>
      )}

      {asks && answerBox(pane, { id: t.id, redraw: () => $.ui.invalidate('ui.render'), question: asks.text, choices, typing, onChoice: choicePress, onSubmit: value => sendAnswer(value)(), onCancel: cancelAnswer })}

      {sectionEl('what')}
      {sectionEl('history')}
      {sectionEl('report')}
      {sectionEl('checker')}
      {sectionEl('runs')}

      {footer(boxOpen ? boxKeys : taskKeys(actions, reports.map(r => r.try), choices.length > 0, place && place.of > 1 ? navHint('claude') : null), 'task-keys')}
    </Box>
  )
}
