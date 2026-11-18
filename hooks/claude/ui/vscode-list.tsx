// The board panel's Tasks view in VS Code's side panel (see surface.ts and vscode.tsx). The terminal's list
// (list.tsx) packs each task on one cut line of a button; here each task is two readable lines of text that wrap:
//   ● T-404  Pick the colors for the review mark on light themes   (the ID a link that opens the task, the title plain,
//   ? waiting for 1m · Yellow or blue for review?                    up to two lines, then "(more)"; "●": it needs you)
// (a done or dropped task is one line: "✓ T-12 title", its mark first, no second line), the second line dim: the status in its color and how long it has run or waited, the kind or role, the try, the
// question or why it failed. Grouped under headings with their colored mark and a count badge (Questions for you,
// Waiting for you, Review, Failed, Doing, To do), a line of space between them, then Backlog, Done and Dropped, folded
// (each fold a link). No Buttons for rows or folds: VS Code draws a Button as a filled blue box whose label never wraps.
// No key hints: the mode switch is a link and the search a box in the footer. An empty board says so, with one
// primary button that starts a message to the lead in the prompt box.
import type { SymccStatus, SymccTask } from '../../../types'
import { archivedNote, archivedOf, localOffset, panelSections, BACKLOG_SHOWN, ALL_CLEAR, statusCell, rowExtra, taskMatches, tryMark, tryTone, isInvestigation, needsYou, kindMark, fmtDuration } from '../../board'
import { openDays, S } from '../../app/state'
import { type $, panelValues } from '../panel'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { vsFold, vsFooter, vsHeading, vsHref, vsLink, mdLink, mdText, twoLines, MORE, NO_TITLE } from './vscode'

/** The status groups of the VS Code list, top to bottom: what needs you first, then what runs and what waits. */
const GROUPS: { label: string; has: SymccStatus[] }[] = [
  { label: 'Waiting for you', has: ['waiting'] },
  { label: 'Review', has: ['review'] },
  { label: 'Failed', has: ['failed'] },
  { label: 'Doing', has: ['doing'] },
  { label: 'To do', has: ['todo', 'paused'] },
]

/** The empty board's button: it starts a message to the lead in the prompt box. */
export const ASK_LEAD = 'Tell the lead what to do next'
/** What that button puts in the prompt box (only when the box is empty, so what the owner typed stays). */
export const ASK_LEAD_DRAFT = 'Next task: '

async function askLead($: $) {
  const box = await $.prompt.read().catch(() => ({ text: '' }))
  if (!box.text.trim()) await $.prompt.fill({ text: ASK_LEAD_DRAFT }).catch(() => undefined)
}

export function listPageVs($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, v, mark, word, act, C, banner, tabs, vs, switchMode, mode, width } = pane
  const { nowMs } = pane
  const query = S.search?.text.trim() ?? ''
  const filtering = query !== ''
  const matching = filtering ? v.tasks.filter(t => taskMatches(t, query)) : v.tasks
  const parts = panelSections(matching, nowMs, localOffset(nowMs))
  if (!filtering) for (const d of [...openDays]) if (!parts.doneDays.some(g => g.day === d)) openDays.delete(d)
  const redraw = () => $.ui.invalidate('ui.render')
  const backlogOpen = filtering || S.backlogOpen
  const doneOpen = filtering || S.doneOpen
  const droppedOpen = filtering || S.droppedOpen
  const dayOpen = (day: string) => filtering || openDays.has(day)
  const toggleDay = (day: string) => () => (openDays.has(day) ? openDays.delete(day) : openDays.add(day), redraw())
  const since = (id: string) => v.working.find(w => w.task === id)?.since
  // the status colors, on the mark only (the same as the terminal list's)
  const tone: Record<string, string> = { backlog: 'inactive', review: 'warning', waiting: 'warning', failed: 'error', doing: 'ide', paused: 'permission', todo: 'text', done: 'success', dropped: 'inactive' }
  let first = true
  const focusFirst = (): true | undefined => (first ? ((first = false), true) : undefined)

  /** How long ago `iso` was ("4m"), '' when it can't be read. */
  const ago = (iso: string | undefined) => {
    const at = Date.parse(iso ?? '')
    return Number.isFinite(at) ? fmtDuration(Math.max(0, nowMs - at)) : ''
  }
  /** The status words of a row's second line: the mark and the step or running time ("▶ 2m"), how long a task has
   *  waited for you ("? waiting for 1m", "◆ review for 5m") or since it failed ("✗ failed 3m ago"). */
  const statusText = (x: SymccTask) => {
    const cell = statusCell(x, nowMs, since(x.id))
    const waited = x.status === 'waiting' || x.status === 'review' || x.status === 'failed' ? ago(x.updated_at) : ''
    // with a time, the short word ("waiting for 1m", not "waiting for you for 1m")
    if (waited) return `${mark[x.status]} ${cell || x.status} ${x.status === 'failed' ? `${waited} ago` : `for ${waited}`}`
    return `${mark[x.status]} ${cell && cell !== x.status ? cell : word[x.status]}`
  }

  /** One task: a line of text, its ID a link that opens it, then the title (up to two lines; bold when it needs you,
   *  dim when closed), with "●" first in the status color when it needs you; under it a dim line with the rest.
   *  Text, not a Button, so it wraps (VS Code draws a Button as a blue box on one line). */
  const taskRow = (x: SymccTask, depth = 0) => {
    const closed = x.status === 'done' || x.status === 'dropped' || x.status === 'backlog'
    // a done or dropped task is one line: its mark (the terminal list's), the ID link, the dim title; no status line
    const ended = x.status === 'done' || x.status === 'dropped'
    const needs = needsYou(x)
    const extra = rowExtra(x, v.tasks, v.branch ?? '', v.max_minutes).replace(/^Enter to review$/, isInvestigation(x) ? '' : 'ready for your review')
    const tried = tryMark(x)
    let rest = tried && extra.endsWith(tried) ? extra.slice(0, extra.length - tried.length).replace(/ · $/, '') : extra
    const kind = kindMark(x)
    // the kind once: rowExtra already shows it as a tag ("[bug · tester]", "[investigation]") for some rows; a question
    // or failure reason that only mentions the word does not count
    const tagged = rest.split(' · ').some(p => p === `[${kind}]` || p === `[${kind}`)
    if (kind && !tagged) rest = rest ? `${kind} · ${rest}` : kind
    const title = twoLines(x.title, width - depth, (needs || ended ? 2 : 0) + x.id.length + 2)
    const href = vsHref('task', x.id)
    const words = `${mdText(title.text)}${title.cut ? ` ${mdText(MORE)}` : ''}`
    return (
      <Box key={`vs-task-${x.id}`} flexDirection="column" paddingLeft={depth}>
        <Box key={`vs-task-${x.id}-top`} flexDirection="row">
          {needs ? <Text key="needs" bold color={C(tone[x.status] ?? 'warning')}>● </Text> : null}
          {ended ? <Text key="ended" color={C(tone[x.status]!)}>{`${mark[x.status]} `}</Text> : null}
          <Box key="title" flexDirection="column" flexGrow={words ? 1 : 0} flexShrink={1}>
            {vsLink(vs, row(x.id), words ? `${mdLink(x.id, href)} \u00a0${needs ? `**${words}**` : words}` : mdLink(x.id, href), [[href, act(() => panelValues($).updateOpened(() => x.id))]], closed)}
          </Box>
          {words ? null : <Text key="no-title" color={C('inactive')}>{` \u00a0${NO_TITLE}`}</Text>}
        </Box>
        {ended ? null : (
          <Text key={`vs-task-${x.id}-info`} wrap="wrap" color={C('inactive')}>
            <Text color={C(tone[x.status]!)}>{statusText(x)}</Text>
            {rest ? ` · ${rest}` : ''}
            {tried ? <Text color={C(tryTone(x))}>{` · ${tried}`}</Text> : null}
          </Text>
        )}
      </Box>
    )
  }

  const open = [...parts.needsYou, ...parts.doing, ...parts.todo]
  const groups = GROUPS.map(g => ({ ...g, tasks: open.filter(t => g.has.includes(t.status)) })).filter(g => g.tasks.length)
  // the lead's open questions for the owner, first of all (not while searching); each row opens its answer page
  const questions = filtering ? [] : (v.questions ?? [])
  const asks = questions.length
    ? [
        <Box key="vs-group-questions" flexDirection="column">
          {vsHeading(vs, 'vs-head-questions', '?', 'warning', 'Questions for you', questions.length)}
          {questions.map(q => {
            const asked = ago(q.asked_at)
            const choices = q.options?.length ?? 0
            const href = vsHref('question', q.id)
            return (
              <Box key={`vs-question-${q.id}`} flexDirection="column">
                <Box key={`vs-question-${q.id}-top`} flexDirection="row">
                  <Text key="needs" bold color={C('warning')}>● </Text>
                  <Box key="title" flexDirection="column" flexGrow={mdText(q.text) ? 1 : 0} flexShrink={1}>
                    {vsLink(vs, row(q.id), mdText(q.text) ? `${mdLink(q.id, href)} \u00a0**${mdText(q.text)}**` : mdLink(q.id, href), [[href, act(() => panelValues($).updateOpened(() => q.id))]])}
                  </Box>
                  {mdText(q.text) ? null : <Text key="no-title" color={C('inactive')}>{` \u00a0${NO_TITLE}`}</Text>}
                </Box>
                <Text key={`vs-question-${q.id}-info`} wrap="wrap" color={C('inactive')}>
                  <Text color={C('warning')}>{`? question for you${asked ? ` for ${asked}` : ''}`}</Text>
                  {choices ? ` · ${choices} ${choices === 1 ? 'choice' : 'choices'}` : ''}
                </Text>
              </Box>
            )
          })}
        </Box>,
      ]
    : []
  const active = [
    ...asks,
    ...groups.map(g => (
      <Box key={`vs-group-${g.label}`} flexDirection="column">
        {vsHeading(vs, `vs-head-${g.label}`, mark[g.has[0]!]!, tone[g.has[0]!]!, g.label, g.tasks.length)}
        {g.tasks.map(t => taskRow(t))}
      </Box>
    )),
  ]

  const backlogShown = S.backlogAll || filtering ? parts.backlog : parts.backlog.slice(0, BACKLOG_SHOWN)
  const backlogMore = parts.backlog.length - backlogShown.length
  const gone = filtering ? 0 : archivedOf(v).done
  const folded = [
    parts.backlog.length ? (
      <Box key="vs-backlog" flexDirection="column">
        {vsFold(vs, row('day:backlog'), 'Backlog', parts.backlog.length, backlogOpen, () => ((S.backlogOpen = !S.backlogOpen), redraw()))}
        {backlogOpen ? backlogShown.map(t => taskRow(t, 2)) : null}
        {backlogOpen && backlogMore > 0 ? (
          <Box key="vs-backlog-more-row" paddingLeft={2}>
            {vsLink(vs, row('day:backlog-more'), mdLink(`Show ${backlogMore} more`, vsHref('more', 'backlog')), [[vsHref('more', 'backlog'), () => ((S.backlogAll = true), redraw())]], true)}
          </Box>
        ) : null}
      </Box>
    ) : null,
    parts.done.length || gone ? (
      <Box key="vs-done" flexDirection="column">
        {vsFold(vs, row('day:done'), 'Done', parts.done.length, doneOpen, () => ((S.doneOpen = !S.doneOpen), redraw()), true, gone ? archivedNote(gone) : '')}
        {doneOpen
          ? [
              ...parts.doneToday.map(t => taskRow(t, 2)),
              ...parts.doneDays.map(g => (
                <Box key={`vs-day-${g.day}`} flexDirection="column" paddingLeft={2}>
                  {vsFold(vs, row(`day:${g.day}`), g.label, g.tasks.length, dayOpen(g.day), toggleDay(g.day), false)}
                  {dayOpen(g.day) ? g.tasks.map(t => taskRow(t, 2)) : null}
                </Box>
              )),
            ]
          : null}
      </Box>
    ) : null,
    parts.dropped.length ? (
      <Box key="vs-dropped" flexDirection="column">
        {vsFold(vs, row('day:dropped'), 'Dropped', parts.dropped.length, droppedOpen, () => ((S.droppedOpen = !S.droppedOpen), redraw()))}
        {droppedOpen ? parts.dropped.map(t => taskRow(t, 2)) : null}
      </Box>
    ) : null,
  ].filter(Boolean)

  const count = filtering ? (matching.length ? `${matching.length} of ${v.tasks.length} tasks match "${query}"` : `no tasks match "${query}"`) : ''
  const search = (
    <Box key="vs-search" flexDirection="column">
      <Input
        key="search"
        label="Search tasks"
        submitLabel="Search"
        placeholder="Search tasks"
        value={S.search?.text ?? ''}
        onInput={value => void ((S.search = value.trim() ? { text: value, typing: false } : null), redraw())}
        onSubmit={value => void ((S.search = value.trim() ? { text: value.trim(), typing: false } : null), redraw())}
      />
      {count ? <Text key="search-count" wrap="wrap" color={C(matching.length ? 'inactive' : 'warning')}>{count}</Text> : null}
    </Box>
  )
  const clear = filtering ? <Button key="search-clear" label="Clear search" variant="secondary" onPress={() => ((S.search = null), redraw())} /> : null
  // nothing open: a friendly note and one primary button that starts a message to the lead in the prompt box
  const empty = (
    <Box key="vs-empty" flexDirection="column" borderStyle="round" borderColor={C('subtle')} paddingX={1}>
      <Text key="vs-empty-0" wrap="wrap" bold color={C('success')}>{`✓ ${ALL_CLEAR[0]}`}</Text>
      <Text key="vs-empty-1" wrap="wrap" color={C('inactive')}>{ALL_CLEAR[1]}</Text>
      <Box key="vs-empty-row" flexDirection="row" marginTop={1}>
        <Button key="vs-ask-lead" label={ASK_LEAD} variant="primary" autoFocus={focusFirst()} onPress={act(() => askLead($))} />
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Box key="vs-header" flexDirection="column">
        {[...banner(), tabs()]}
      </Box>
      {active.length ? active : filtering ? null : empty}
      {folded.length ? <Box key="vs-folded" flexDirection="column" gap={1}>{folded}</Box> : null}
      {vsFooter(vs, 'list-hint', { mode, onSwitch: switchMode, search, extra: clear })}
    </Box>
  )
}
