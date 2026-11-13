// The board panel's Tasks view: the list of tasks by section.
import type { SymccTask } from '../../../types'
import { archivedNote, archivedOf, localOffset, panelSections, SECTION_LABEL, BACKLOG_SHOWN, foldedRow, backlogMoreLabel, groupLabel, ALL_CLEAR, statusCell, bannerRule, fitRow, rowExtra, listKeys, taskMatches, searchLine } from '../../board'
import { type $, openDays, S, updateOpened } from '../state'
import type { PaneParts } from './parts'

/** The Tasks view: the status strip, then the tasks (needs you under its label, then doing and to do as one list,
 *  then the folded groups). Rows are plain Buttons: no "[ ]" around them; the focus inverts the row instead.
 *  With a search on (f, see S.search and taskMatches) only the matching tasks are listed, in every group (Backlog,
 *  Done and Dropped too), groups with a match open and groups without one hidden; a line under the header says so. */
export function listPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, v, width, mark, act, C, banner, tabs, footer } = pane
  const nowMs = Date.now()
  const offset = localOffset(nowMs)
  const search = S.search
  const query = search?.text.trim() ?? ''
  const filtering = query !== ''
  const typing = !!search?.typing
  const matching = filtering ? v.tasks.filter(t => taskMatches(t, query)) : v.tasks
  const parts = panelSections(matching, nowMs, offset)
  if (!filtering) for (const d of [...openDays]) if (!parts.doneDays.some(g => g.day === d)) openDays.delete(d)
  // while filtering, every group with a match is open (and the backlog shows all its matches)
  const backlogOpen = filtering || S.backlogOpen
  const doneOpen = filtering || S.doneOpen
  const droppedOpen = filtering || S.droppedOpen
  const dayOpen = (day: string) => filtering || openDays.has(day)
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
  const backlogShown = S.backlogAll || filtering ? parts.backlog : parts.backlog.slice(0, BACKLOG_SHOWN)
  const backlogMore = parts.backlog.length - backlogShown.length
  const backlogRows: Row[] = parts.backlog.length
    ? [
        { day: 'backlog', label: foldedRow('Backlog', parts.backlog.length, backlogOpen, countWidth), indent: 2 },
        ...(!backlogOpen ? [] : [...tasksOf(backlogShown, 4), ...(backlogMore > 0 ? [{ day: 'backlog-more', label: backlogMoreLabel(backlogMore), indent: 4 }] : [])]),
      ]
    : []
  // tasks moved to archive.json are not listed, only counted: "▸ Done  12 (+96 archived)"; a search leaves them out
  const gone = filtering ? 0 : archivedOf(v).done
  const doneHead = parts.done.length || gone ? [foldedRow('Done', parts.done.length, doneOpen, countWidth), archivedNote(gone)].filter(Boolean).join(' ') : ''
  const doneRows: Row[] = doneHead
    ? [
        { day: 'done', label: doneHead, indent: 2 },
        ...(!doneOpen
          ? []
          : [
              ...tasksOf(parts.doneToday, 4),
              ...parts.doneDays.flatMap(g => [{ day: g.day, label: groupLabel(g, dayOpen(g.day)), indent: 4 }, ...(dayOpen(g.day) ? tasksOf(g.tasks, 6) : [])]),
            ]),
      ]
    : []
  const droppedRows: Row[] = parts.dropped.length
    ? [{ day: 'dropped', label: foldedRow('Dropped', parts.dropped.length, droppedOpen, countWidth), indent: 2 }, ...(droppedOpen ? tasksOf(parts.dropped, 4) : [])]
    : []
  const folded = [...backlogRows, ...doneRows, ...droppedRows]
  const blank: Row = { blank: true }
  const list: Row[] = [
    ...(active.length ? active.flatMap((s, k) => (k ? [blank, ...s] : s)) : filtering ? [] : ALL_CLEAR.map(line => ({ line }))),
    ...(folded.length ? [...(active.length || !filtering ? [blank] : []), ...folded] : []),
  ]
  // while the search box is open it has the focus, not a row
  const firstButton = typing ? -1 : list.findIndex(r => 'task' in r || 'day' in r)
  const shown = list.flatMap(r => ('task' in r ? [r.task] : []))
  const since = (id: string) => v.working.find(w => w.task === id)?.since
  const cells = new Map(shown.map(x => [x.id, statusCell(x, nowMs, since(x.id))]))
  const idWidth = Math.max(4, ...shown.map(x => x.id.length))
  const cellWidth = Math.max(0, ...[...cells.values()].map(c => c.length))
  // the list's own colors: failed red, review and waiting yellow, doing blue, done green
  const tone: Record<string, string> = { backlog: 'subtle', review: 'warning', waiting: 'warning', failed: 'error', doing: 'ide', paused: 'permission', todo: 'text', done: 'success', dropped: 'inactive' }
  const pressDay = (day: string) => (day === 'backlog' ? toggleBacklog : day === 'backlog-more' ? showAllBacklog : day === 'done' ? toggleDone : day === 'dropped' ? toggleDropped : toggleDay(day))
  const redraw = () => $.ui.invalidate('ui.render')
  const openSearch = () => ((S.search = { text: S.search?.text ?? '', typing: true }), redraw())
  const count = filtering ? (matching.length ? `${matching.length} of ${v.tasks.length} tasks` : 'no tasks match') : 'type to filter the tasks'
  // the search line under the header: the box while typing (with the count under it), else the filter in use
  const searchRows = typing
    ? [
        <Input
          key="search"
          label="search"
          submitLabel="keep"
          placeholder="words to look for"
          value={search!.text}
          autoFocus
          onInput={value => void ((S.search = { text: value, typing: true }), redraw())}
          onSubmit={value => void ((S.search = value.trim() ? { text: value.trim(), typing: false } : null), redraw())}
        />,
        <Text key="search-count" wrap="truncate" color={C('subtle')}>{`${count} · Esc clears`}</Text>,
      ]
    : filtering
      ? [<Text key="search-line" wrap="truncate" bold color={C('warning')}>{searchLine(query, matching.length, v.tasks.length)}</Text>]
      : []
  const searchButton = typing ? null : [<Text key="search-gap">  </Text>, <Button key="search-open" label={filtering ? '[f] change search' : '[f] search'} hotkey="f" dimColor onPress={openSearch} />]
  return (
    <Box flexDirection="column">
      {[...banner(), tabs()]}
      <Text key="header-rule" wrap="truncate" color={C('ide')}>{bannerRule(width)}</Text>
      {searchRows}
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
      {footer(listKeys(), 'list-hint', true, searchButton)}
    </Box>
  )
}
