// The board panel's Tasks view: the list of tasks by section.
import type { SymccTask } from '../../../types'
import { archivedNote, archivedOf, localOffset, panelSections, SECTION_LABEL, BACKLOG_SHOWN, foldedRow, backlogMoreLabel, groupLabel, ALL_CLEAR, statusCell, bannerRule, fitRow, rowExtra, listKeys } from '../../board'
import { type $, openDays, S, updateOpened } from '../state'
import type { PaneParts } from './parts'

/** The Tasks view: the status strip, then the tasks (needs you under its label, then doing and to do as one list,
 *  then the folded groups). Rows are plain Buttons: no "[ ]" around them; the focus inverts the row instead. */
export function listPage($: $, pane: PaneParts) {
  const { Box, Text, Button, v, width, mark, act, C, mode, banner, tabs, keyLines } = pane
  const nowMs = Date.now()
  const offset = localOffset(nowMs)
  const parts = panelSections(v.tasks, nowMs, offset)
  for (const d of [...openDays]) if (!parts.doneDays.some(g => g.day === d)) openDays.delete(d)
  const toggleDay = (day: string) => () => {
    if (openDays.has(day)) openDays.delete(day)
    else openDays.add(day)
    $.ui.invalidate('ui.render')
  }
  const toggleBacklog = () => ((S.backlogOpen = !S.backlogOpen), $.ui.invalidate('ui.render'))
  const toggleDone = () => ((S.doneOpen = !S.doneOpen), $.ui.invalidate('ui.render'))
  const toggleDropped = () => ((S.droppedOpen = !S.droppedOpen), $.ui.invalidate('ui.render'))
  const showAllBacklog = () => ((S.backlogAll = true), $.ui.invalidate('ui.render'))
  /** A list row: a task (`indent`: 2 or 4 columns); a row one can press (`day`: 'backlog', 'done', 'dropped',
   *  'backlog-more' or an older day of Done); a section label (`head`); a subtle line (`line`); or a blank line. */
  type Row = { task: SymccTask; indent: number } | { day: string; label: string; extra?: string; indent: number } | { head: string } | { line: string } | { blank: true }
  const tasksOf = (ts: SymccTask[], indent: number): Row[] => ts.map(task => ({ task, indent }))
  // active work first (always open): NEEDS YOU under its label, then one untitled list of what runs and what
  // waits to run (the mark and status column tell them apart), a blank line between; then the folded groups
  const active: Row[][] = [
    parts.needsYou.length ? [{ head: SECTION_LABEL.needsYou }, ...tasksOf(parts.needsYou, 2)] : [],
    tasksOf([...parts.doing, ...parts.todo], 2),
  ].filter(s => s.length)
  const countWidth = Math.max(1, ...[parts.backlog, parts.done, parts.dropped].map(ts => String(ts.length).length))
  const backlogShown = S.backlogAll ? parts.backlog : parts.backlog.slice(0, BACKLOG_SHOWN)
  const backlogMore = parts.backlog.length - backlogShown.length
  const backlogRows: Row[] = parts.backlog.length
    ? [
        { day: 'backlog', label: foldedRow('Backlog', parts.backlog.length, S.backlogOpen, countWidth), indent: 2 },
        ...(!S.backlogOpen ? [] : [...tasksOf(backlogShown, 4), ...(backlogMore > 0 ? [{ day: 'backlog-more', label: backlogMoreLabel(backlogMore), indent: 4 }] : [])]),
      ]
    : []
  // tasks moved to archive.json are not listed, only counted: "▸ Done  12 (+96 archived)"
  const gone = archivedOf(v).done
  const doneHead = parts.done.length || gone ? [foldedRow('Done', parts.done.length, S.doneOpen, countWidth), archivedNote(gone)].filter(Boolean).join(' ') : ''
  const doneRows: Row[] = doneHead
    ? [
        { day: 'done', label: doneHead, indent: 2 },
        ...(!S.doneOpen
          ? []
          : [
              ...tasksOf(parts.doneToday, 4),
              ...parts.doneDays.flatMap(g => [{ day: g.day, label: groupLabel(g, openDays.has(g.day)), indent: 4 }, ...(openDays.has(g.day) ? tasksOf(g.tasks, 6) : [])]),
            ]),
      ]
    : []
  const droppedRows: Row[] = parts.dropped.length
    ? [{ day: 'dropped', label: foldedRow('Dropped', parts.dropped.length, S.droppedOpen, countWidth), indent: 2 }, ...(S.droppedOpen ? tasksOf(parts.dropped, 4) : [])]
    : []
  const folded = [...backlogRows, ...doneRows, ...droppedRows]
  const blank: Row = { blank: true }
  const list: Row[] = [
    ...(active.length ? active.flatMap((s, k) => (k ? [blank, ...s] : s)) : ALL_CLEAR.map(line => ({ line }))),
    ...(folded.length ? [blank, ...folded] : []),
  ]
  const firstButton = list.findIndex(r => 'task' in r || 'day' in r)
  const shown = list.flatMap(r => ('task' in r ? [r.task] : []))
  const since = (id: string) => v.working.find(w => w.task === id)?.since
  const cells = new Map(shown.map(x => [x.id, statusCell(x, nowMs, since(x.id))]))
  const idWidth = Math.max(4, ...shown.map(x => x.id.length))
  const cellWidth = Math.max(0, ...[...cells.values()].map(c => c.length))
  // the list's own colors: failed red, review and waiting yellow, doing blue, done green
  const tone: Record<string, string> = { backlog: 'subtle', review: 'warning', waiting: 'warning', failed: 'error', doing: 'ide', paused: 'permission', todo: 'text', done: 'success', dropped: 'inactive' }
  const pressDay = (day: string) => (day === 'backlog' ? toggleBacklog : day === 'backlog-more' ? showAllBacklog : day === 'done' ? toggleDone : day === 'dropped' ? toggleDropped : toggleDay(day))
  return (
    <Box flexDirection="column">
      {[...banner(), tabs()]}
      <Text key="header-rule" wrap="truncate" color={C('ide')}>{bannerRule(width)}</Text>
      {list.map((r, i) => {
        if ('blank' in r) return <Text key={`blank-${i}`}> </Text>
        if ('line' in r) return <Text key={`clear-${i}`} wrap="truncate" color={C('subtle')}>{`  ${r.line}`}</Text>
        if ('head' in r) return <Text key={`head:${r.head}`} bold color={C('text')}>{r.head}</Text>
        if (!('task' in r)) {
          const top = r.day === 'backlog' || r.day === 'done' || r.day === 'dropped'
          return (
            <Button key={`day:${r.day}`} plain autoFocus={i === firstButton ? true : undefined} onPress={pressDay(r.day)}>
              <Text color={C(top ? 'text' : 'subtle')}>
                {' '.repeat(r.indent)}
                {r.label}
              </Text>
              {r.extra ? <Text color={C('subtle')}>{`   ${r.extra}`}</Text> : null}
            </Button>
          )
        }
        const x = r.task
        const closed = x.status === 'done' || x.status === 'dropped' || x.status === 'backlog'
        const lead = r.indent + idWidth + 3 + cellWidth + 2
        const fit = fitRow(lead, x.title, rowExtra(x, v.tasks), width)
        return (
          <Button key={x.id} plain autoFocus={i === firstButton ? true : undefined} onPress={act(() => updateOpened($, () => x.id))}>
            <Text>{' '.repeat(r.indent)}</Text>
            <Text bold={!closed} color={C(closed ? 'inactive' : 'claude')}>
              {x.id.padEnd(idWidth)}
            </Text>
            <Text color={C(tone[x.status]!)}>{` ${mark[x.status]} ${cells.get(x.id)!.padEnd(cellWidth)}  `}</Text>
            <Text bold={x.status === 'waiting' || x.status === 'failed' || x.status === 'review'} color={C(closed ? 'subtle' : 'text')}>
              {fit.title}
            </Text>
            {fit.extra ? <Text color={C('subtle')}>{`${fit.pad}${fit.extra}`}</Text> : null}
          </Button>
        )
      })}
      <Text key="list-blank"> </Text>
      {keyLines(listKeys(), 'list-hint')}
    </Box>
  )
}
