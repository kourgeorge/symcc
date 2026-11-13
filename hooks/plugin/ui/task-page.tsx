// The board panel's page for one task: details, actions, and for a task in review its changes.
import type { SymccTask } from '../../../types'
import { cutDiff, DIFF_LINES, diffKinds, DIFF_COLOR, diffKeys, roleChoices, roleOf, findRole, type DiffFile, type Seg, detailRows, wrapSegs, STATUS_BADGE, STATUS_MARK, detailRowLines, fmtRun, fmtTotal, sumRuns, taskKeys } from '../../board'
import { changesText, changedFiles } from '../review'
import { loadRoles } from '../roles'
import { type $, S, workers, updateOpened } from '../state'
import { tellLead } from '../tell'
import { runTool, when } from '../tools'
import type { PaneParts } from './parts'

/** One task opened: its details and actions; for a task in review also its changes. */
export async function taskPage($: $, pane: PaneParts, t: SymccTask) {
  const { Box, Text, Button, Input, v, width, color, word, mark, act, C, target, keyLines, buttonRows, heading, paragraphs } = pane
  if (!S.roles.length) await loadRoles($).catch(() => undefined)
  const agentId = [...workers.entries()].find(([, w]) => w.task === t.id)?.[0]
  const inReview = t.status === 'review'
  const showDiff = (file: string) => () => ((S.diffOpen = { task: t.id, file }), $.ui.invalidate('ui.render'))
  const approveIt = act(async () => {
    const r = await runTool($, 'approve', { task: t.id })
    S.diffOpen = null
    S.rejecting = null
    $.ui.toast(S.N.toast(r))
    tellLead($, `The owner approved ${t.id} from the board: ${r}`)
  })
  const askReason = () => ((S.rejecting = { task: t.id, reason: '' }), $.ui.invalidate('ui.render'))
  const reviewButtons = inReview
    ? [<Button key="approve" label="Approve" hotkey="a" onPress={approveIt} />, <Button key="reject" label="Reject" hotkey="x" onPress={askReason} />]
    : []
  /** The box that asks why, once Reject was pressed. */
  const rejectBox =
    inReview && S.rejecting?.task === t.id ? (
      <Box flexDirection="column" borderStyle="round" borderColor={C('error')} paddingX={1}>
        <Input
          key="reject-reason"
          label="Why reject it? "
          placeholder="what to change, for the next worker; Enter sends it back"
          value={S.rejecting.reason}
          autoFocus
          onInput={value => void (S.rejecting && (S.rejecting.reason = value))}
          onSubmit={value =>
            act(async () => {
              const why = value.trim()
              if (!why) return void $.ui.toast(S.N.toast('give a short reason, so the next worker knows what to fix'))
              const r = await runTool($, 'reject', { task: t.id, reason: why })
              S.rejecting = null
              S.diffOpen = null
              $.ui.toast(S.N.toast(r))
              tellLead($, `The owner rejected ${t.id} from the board: "${why}". ${r}`)
            })()
          }
        />
        <Text color={C('subtle')}>Enter sends it back to "todo" with the reason · Esc cancels</Text>
      </Box>
    ) : null
  if (inReview && S.diffOpen?.task === t.id) {
    // The changes themselves: the diff against the merge base, colored line by line.
    const d = S.diffOpen
    const got = await changesText($, target, t, d.file).then(
      x => ({ lines: cutDiff(x, t.id, DIFF_LINES, d.file, S.N.name), error: '' }),
      (err: Error) => ({ lines: [] as string[], error: err.message }),
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
            <Text color={C('subtle')}> · changes in {d.file || 'all files'}</Text>
          </Text>
          <Text bold color={C('text')}>
            {t.title}
          </Text>
        </Box>
        {buttonRows([
          <Button key="diff-back" label="Back" hotkey="b" autoFocus={rejectBox ? undefined : true} onPress={() => ((S.diffOpen = null), $.ui.invalidate('ui.render'))} />,
          ...reviewButtons,
          d.file ? <Button key="diff-all" label="All files" hotkey="d" onPress={showDiff('')} /> : null,
        ], 'diff-buttons')}
        {rejectBox}
        <Box flexDirection="column">
          {got.error ? <Text color={C('error')}>Could not read the changes: {got.error}</Text> : null}
          {!got.error && !got.lines.length ? <Text color={C('subtle')}>no text changes</Text> : null}
          {got.lines.map((l, i) => (
            <Text key={`diff-${i}`} bold={kinds[i] === 'hunk' || (kinds[i] === 'header' && l.startsWith('diff '))} color={C(DIFF_COLOR[kinds[i]!])}>
              {l.replace(/\t/g, '    ') || ' '}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">{keyLines(diffKeys(inReview, !!d.file), 'diff-keys')}</Box>
      </Box>
    )
  }
  // The owner's role override: a pick list of the known roles, set the same way as the lead's change role.
  const canPickRole = ['todo', 'paused', 'failed', 'backlog'].includes(t.status)
  if (S.rolePick && (S.rolePick.task !== t.id || !canPickRole)) S.rolePick = null
  const openRolePick = act(async () => {
    S.rolePick = { task: t.id, options: roleChoices(await loadRoles($).catch(() => S.roles)) }
    $.ui.invalidate('ui.render')
  })
  const pickRole = (name: string) =>
    act(async () => {
      S.rolePick = null
      $.ui.invalidate('ui.render')
      const r = await runTool($, 'change', { task: t.id, role: name })
      $.ui.toast(S.N.toast(`${t.id} role: ${name}`))
      tellLead($, `The owner set the role of ${t.id} to ${name} from the board: ${r}`)
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
              {d ? <Text color={C('subtle')}> — {d}</Text> : null}
            </Button>
          )
        })}
        <Button key="role-cancel" label="Cancel" onPress={() => ((S.rolePick = null), $.ui.invalidate('ui.render'))} />
        <Text color={C('subtle')}>Enter picks · Esc cancels</Text>
      </Box>
    ) : null
  // A task in review: the files it changed, each opening its diff.
  const changes = inReview
    ? await changedFiles($, target, t).then(
        files => ({ files, error: '' }),
        (err: Error) => ({ files: [] as DiffFile[], error: err.message }),
      )
    : null
  const fileWidth = Math.max(4, ...(changes?.files ?? []).map(f => f.file.length))
  // History lines: the try number, then the result colored by how it went.
  const historyLine = (line: string) => {
    const m = /^(try \S+:)\s*(.*)$/.exec(line)
    const body = m ? m[2]! : line
    const [said, result] = body.includes(' → ') ? [body.slice(0, body.lastIndexOf(' → ')), body.slice(body.lastIndexOf(' → ') + 3)] : [body, '']
    const bad = /not merged|fail|stopped|refused|error|outside|without a result/i.test(result || body)
    const good = /merged into|^merged/i.test(result)
    return (
      <Text>
        <Text color={C(bad ? 'error' : good ? 'success' : 'subtle')}>{bad ? '✗' : good ? '✓' : '•'}</Text>{' '}
        {m && <Text bold color={C('subtle')}>{m[1]} </Text>}
        <Text color={C('subtle')}>{said}</Text>
        {result && (
          <Text color={C(bad ? 'error' : good ? 'success' : 'text')}>
            {' '}→ {result}
          </Text>
        )}
      </Text>
    )
  }
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
  const rows = detailRows(t, { roles: S.roles, all: v.tasks, when, nowMs: Date.now(), archivedDone: v.archived_done })
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        {wrapSegs([{ text: t.id, color: 'claude', bold: true }, { text: `  ${t.title}`, color: 'text', bold: true }], width).map((l, i) => segLine(l, `title-${i}`))}
        <Text>
          <Text bold color={C(STATUS_BADGE[t.status])}>{`[${STATUS_MARK[t.status]} ${word[t.status]}]`}</Text>
          {agentId ? <Text color={C('subtle')}> · a worker is on it now</Text> : null}
        </Text>
      </Box>

      {buttonRows([
        <Button key="back" label="Back" hotkey="b" autoFocus={t.status === 'waiting' || rejectBox ? undefined : true} onPress={act(async () => ((S.diffOpen = null), (S.rejecting = null), await updateOpened($, () => '')))} />,
        ...reviewButtons,
        inReview && <Button key="show-changes" label="Show changes" hotkey="d" onPress={showDiff('')} />,
        agentId && <Button key="watch" label="Watch worker" hotkey="w" onPress={act(() => $.ui.view({ agentId }))} />,
        (t.status === 'doing' || t.status === 'todo') && (
          <Button key="pause" label="Pause" hotkey="p" onPress={act(async () => (await runTool($, 'pause', { task: t.id, reason: 'paused by the owner' }), tellLead($, `The owner paused ${t.id} from the board.`)))} />
        ),
        t.status === 'paused' && (
          <Button key="resume" label="Resume" hotkey="u" onPress={act(async () => (await runTool($, 'resume', { task: t.id }), tellLead($, `The owner resumed ${t.id} from the board.`)))} />
        ),
        (t.status === 'failed' || t.status === 'dropped') && (
          <Button key="retry" label="Retry" hotkey="r" onPress={act(async () => (await runTool($, 'retry', { task: t.id }), tellLead($, `The owner retried ${t.id} from the board.`)))} />
        ),
        t.status === 'backlog' && (
          <Button key="to-todo" label="Move to todo (o)" hotkey="o" onPress={act(async () => (await runTool($, 'change', { task: t.id, backlog: false }), tellLead($, `The owner moved ${t.id} from the backlog to todo on the board.`)))} />
        ),
        (t.status === 'todo' || t.status === 'paused' || t.status === 'failed') && (
          <Button key="stash" label="Stash to backlog (k)" hotkey="k" onPress={act(async () => (await runTool($, 'change', { task: t.id, backlog: true }), tellLead($, `The owner moved ${t.id} to the backlog on the board.`)))} />
        ),
        canPickRole && <Button key="role" label="Role (l)" hotkey="l" onPress={openRolePick} />,
        t.status !== 'done' && t.status !== 'dropped' && (
          <Button key="drop" label="Drop" hotkey={inReview ? undefined : 'x'} onPress={act(async () => (await runTool($, 'drop', { task: t.id, reason: 'dropped by the owner' }), tellLead($, `The owner dropped ${t.id} from the board.`)))} />
        ),
        t.status !== 'done' && t.status !== 'dropped' && (
          <Button
            key="needs-review"
            label={`Needs review: ${t.needs_review ? 'on' : 'off'}`}
            hotkey="n"
            onPress={act(async () => {
              const r = await runTool($, 'change', { task: t.id, needs_review: !t.needs_review })
              $.ui.toast(S.N.toast(r))
              tellLead($, `The owner turned needs_review ${t.needs_review ? 'off' : 'on'} for ${t.id} from the board.`)
            })}
          />
        ),
      ], 'task-buttons')}

      {rejectBox}
      {roleBox}

      <Box flexDirection="column">
        {heading('Details')}
        {rows.flatMap((r, i) => detailRowLines(r, width).map((l, j) => segLine(l, `row-${i}-${j}`)))}
      </Box>

      {changes && (
        <Box flexDirection="column">
          {heading(`Changes (${changes.files.length} ${changes.files.length === 1 ? 'file' : 'files'}, against ${target})`)}
          {changes.error ? <Text color={C('error')}>  Could not read the changes: {changes.error}</Text> : null}
          {!changes.error && !changes.files.length ? <Text color={C('subtle')}>  no changes</Text> : null}
          {changes.files.map(f => (
            <Button key={`file:${f.file}`} onPress={showDiff(f.file)}>
              <Text color={C('autoAccept')}>{f.file.padEnd(fileWidth)}</Text>
              {f.binary ? (
                <Text color={C('subtle')}>  binary</Text>
              ) : (
                <Text>
                  {'  '}
                  <Text color={C('success')}>+{f.added}</Text> <Text color={C('error')}>-{f.removed}</Text>
                </Text>
              )}
            </Button>
          ))}
          <Text color={C('subtle')}>  Enter on a file shows its diff · d all files</Text>
        </Box>
      )}

      {t.status === 'waiting' && (
        <Box flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
          <Text>
            <Text bold color={C('warning')}>asks: </Text>
            <Text color={C('text')}>{t.question ?? '(no question)'}</Text>
          </Text>
          <Input
            key="answer"
            label="Your answer: "
            placeholder="type and press Enter"
            autoFocus
            onSubmit={value =>
              act(async () => {
                if (!value.trim()) return
                await runTool($, 'change', { task: t.id, details: `${t.details}\n\nOwner's answer to "${t.question ?? ''}": ${value.trim()}` })
                tellLead($, `The owner answered ${t.id} on the board: "${value.trim()}". I put it into the task and sent it back to work.`)
              })()
            }
          />
        </Box>
      )}

      <Box flexDirection="column">
        {heading('What to do')}
        {t.details.trim() ? paragraphs(t.details.trimEnd()) : <Text color={C('subtle')}>(no details)</Text>}
      </Box>

      {t.history.length > 0 && (
        <Box flexDirection="column">
          {heading(`History (${t.history.length}, newest first)`)}
          {[...t.history].reverse().map(historyLine)}
        </Box>
      )}

      {(t.runs?.length ?? 0) > 0 && (
        <Box flexDirection="column">
          {heading('Runs (time and cost)')}
          {t.runs!.map((r, i) => (
            <Text color={C(r.ended ? 'subtle' : 'success')}>{`  ${fmtRun(r, i, Date.now())}`}</Text>
          ))}
          <Text bold color={C('text')}>{`  total: ${fmtTotal(sumRuns(t.runs, Date.now()))}`}</Text>
        </Box>
      )}

      <Box flexDirection="column">{keyLines(taskKeys(t.status, !!agentId), 'task-keys')}</Box>
    </Box>
  )
}
