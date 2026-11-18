// The board panel's Tasks view in VS Code's side panel (see surface.ts and vscode.tsx). The terminal's list
// (list.tsx) packs each task on one cut line of a button; here each task gets a few readable lines instead:
//   T-401  ▶ 2m              (the ID is the button that opens it; the mark in the status color)
//     Show the plugin version in the board title …  (the full title, wrapped to the panel)
//     worker · try 2        (role, kind, try, question or why it failed: dim)
// grouped under small headings (Waiting for you, Review, Failed, Doing, To do), then the folded Backlog, Done and
// Dropped as heading rows. No key hints: the mode switch is a button and the search a box in the footer.
import type { SymccStatus, SymccTask } from '../../../types'
import { archivedNote, archivedOf, localOffset, panelSections, BACKLOG_SHOWN, ALL_CLEAR, statusCell, rowExtra, taskMatches, tryMark, tryTone, isInvestigation } from '../../board'
import { openDays, S } from '../state'
import { type $, panelValues } from '../../claude/panel'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { vsFold, vsFooter, vsHeading } from './vscode'

/** The status groups of the VS Code list, top to bottom: what needs you first, then what runs and what waits. */
const GROUPS: { label: string; has: SymccStatus[] }[] = [
  { label: 'Waiting for you', has: ['waiting'] },
  { label: 'Review', has: ['review'] },
  { label: 'Failed', has: ['failed'] },
  { label: 'Doing', has: ['doing'] },
  { label: 'To do', has: ['todo', 'paused'] },
]

export function listPageVs($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, v, mark, word, act, C, banner, tabs, vs, switchMode, mode } = pane
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

  /** One task: the ID button and its status, the full title, then a dim line with the rest. */
  const taskRow = (x: SymccTask, depth = 0) => {
    const closed = x.status === 'done' || x.status === 'dropped' || x.status === 'backlog'
    const cell = statusCell(x, nowMs, since(x.id))
    const status = `${mark[x.status]} ${cell && cell !== x.status ? cell : word[x.status]}`
    const extra = rowExtra(x, v.tasks, v.branch ?? '', v.max_minutes).replace(/^Enter to review$/, isInvestigation(x) ? '' : 'ready for your review')
    const tried = tryMark(x)
    const rest = tried && extra.endsWith(tried) ? extra.slice(0, extra.length - tried.length).replace(/ · $/, '') : extra
    const open = act(() => panelValues($).updateOpened(() => x.id))
    return (
      <Box key={`vs-task-${x.id}`} flexDirection="column" paddingLeft={depth}>
        <Box key={`vs-task-${x.id}-top`} flexDirection="row" gap={1}>
          <Button key={row(x.id)} plain label={`Open ${x.id}`} autoFocus={focusFirst()} onPress={open}>
            <Text bold={!closed} color={C(closed ? 'inactive' : 'claude')}>{x.id}</Text>
          </Button>
          <Text key="mark" color={C(tone[x.status]!)}>{status}</Text>
        </Box>
        <Box key={`vs-task-${x.id}-body`} flexDirection="column" paddingLeft={2}>
          <Text key="title" wrap="wrap" bold={x.status === 'waiting' || x.status === 'failed' || x.status === 'review'} color={C(closed ? 'inactive' : 'text')}>
            {x.title}
          </Text>
          {rest || tried ? (
            <Text key="extra" wrap="wrap" color={C('inactive')}>
              {rest}
              {tried ? <Text color={C(tryTone(x))}>{`${rest ? ' · ' : ''}${tried}`}</Text> : null}
            </Text>
          ) : null}
        </Box>
      </Box>
    )
  }

  const open = [...parts.needsYou, ...parts.doing, ...parts.todo]
  const groups = GROUPS.map(g => ({ ...g, tasks: open.filter(t => g.has.includes(t.status)) })).filter(g => g.tasks.length)
  // the lead's open questions for the owner, first of all (not while searching); each ID opens its answer page
  const questions = filtering ? [] : (v.questions ?? [])
  const asks = questions.length
    ? [
        <Box key="vs-group-questions" flexDirection="column">
          {vsHeading(vs, 'vs-head-questions', '?', 'warning', 'Questions for you', questions.length)}
          {questions.map(q => (
            <Box key={`vs-question-${q.id}`} flexDirection="column">
              <Button key={row(q.id)} plain label={`Open ${q.id}`} autoFocus={focusFirst()} onPress={act(() => panelValues($).updateOpened(() => q.id))}>
                <Text bold color={C('claude')}>{q.id}</Text>
              </Button>
              <Box key={`vs-question-${q.id}-body`} paddingLeft={2}>
                <Text key="title" wrap="wrap" bold color={C('text')}>{q.text}</Text>
              </Box>
            </Box>
          ))}
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
        {vsFold(vs, row('day:backlog'), 'Backlog', parts.backlog.length, backlogOpen, () => ((S.backlogOpen = !S.backlogOpen), redraw()), true, focusFirst())}
        {backlogOpen ? backlogShown.map(t => taskRow(t, 2)) : null}
        {backlogOpen && backlogMore > 0 ? (
          <Box key="vs-backlog-more-row" paddingLeft={2}>
            <Button key={row('day:backlog-more')} plain label={`Show ${backlogMore} more`} onPress={() => ((S.backlogAll = true), redraw())}>
              <Text color={C('inactive')}>{`Show ${backlogMore} more`}</Text>
            </Button>
          </Box>
        ) : null}
      </Box>
    ) : null,
    parts.done.length || gone ? (
      <Box key="vs-done" flexDirection="column">
        {vsFold(vs, row('day:done'), 'Done', `${parts.done.length}${gone ? ` ${archivedNote(gone)}` : ''}`, doneOpen, () => ((S.doneOpen = !S.doneOpen), redraw()), true, focusFirst())}
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
        {vsFold(vs, row('day:dropped'), 'Dropped', parts.dropped.length, droppedOpen, () => ((S.droppedOpen = !S.droppedOpen), redraw()), true, focusFirst())}
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

  return (
    <Box flexDirection="column" gap={1}>
      <Box key="vs-header" flexDirection="column">
        {[...banner(), tabs()]}
      </Box>
      {active.length ? active : filtering ? null : ALL_CLEAR.map((line, i) => <Text key={`clear-${i}`} wrap="wrap" color={C('inactive')}>{line}</Text>)}
      {folded.length ? <Box key="vs-folded" flexDirection="column">{folded}</Box> : null}
      {vsFooter(vs, 'list-hint', { mode, onSwitch: switchMode, search, extra: clear })}
    </Box>
  )
}
