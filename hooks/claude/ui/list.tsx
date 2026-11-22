// The board panel's Tasks view: the list of tasks by section.
import type { SymccTask } from '../../../types'
import { statusMark, archivedNote, archivedOf, localOffset, panelSections, SECTION_LABEL, BACKLOG_SHOWN, foldedRow, backlogMoreLabel, groupLabel, ALL_CLEAR, rowStates, stateText, rowMark, TITLE_ROOM, fitRow, rowExtra, listKeys, searchTasks, SEARCH_WORDS, searchLine, searchBoxHint, questionsLabel, type OwnerQuestion, ownersTurn, shownStatus, LIST_TONE } from '../../board'
import { openDays, S } from '../../app/state'
import { type $, panelValues } from '../panel'
import type { PaneParts } from './parts'
import { row } from './arrows'

/** What the terminal and VS Code lists both start from: the search (S.search) and the tasks it matches, split into
 *  sections (old days of Done no longer listed leave openDays), and which folded groups are open (while filtering,
 *  every group with a match is open, and the backlog shows all its matches). */
export function listState($: $, pane: PaneParts) {
  const { v, nowMs } = pane
  const query = S.search?.text.trim() ?? ''
  const filtering = query !== ''
  const matching = filtering ? searchTasks(v.tasks, query, nowMs, v.archived_done) : v.tasks
  const parts = panelSections(matching, nowMs, localOffset(nowMs))
  if (!filtering) for (const d of [...openDays]) if (!parts.doneDays.some(g => g.day === d)) openDays.delete(d)
  const toggleDay = (day: string) => () => {
    if (openDays.has(day)) openDays.delete(day)
    else openDays.add(day)
    $.ui.invalidate('ui.render')
  }
  return {
    query,
    filtering,
    matching,
    parts,
    backlogOpen: filtering || S.backlogOpen,
    doneOpen: filtering || S.doneOpen,
    droppedOpen: filtering || S.droppedOpen,
    dayOpen: (day: string) => filtering || openDays.has(day),
    toggleDay,
  }
}

/** The Tasks view: the tasks (needs you under its label, then doing and to do as one list,
 *  then the folded groups). Rows are plain Buttons: no "[ ]" around them; the focus inverts the row instead.
 *  With a search on (f, see S.search and searchTasks: plain words and filter words like last:5 or status:done) only the matching tasks are listed, in every group (Backlog,
 *  Done and Dropped too), groups with a match open and groups without one hidden; a line under the header says so.
 *  No way out needs Esc (it doesn't reach the panel from a text box): Enter on an empty box clears the search, and
 *  while a filter is on (not typing) [x] clear search, next to [f] change search, takes it off. */
export function listPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, v, width, mark, act, C, header, footer } = pane
  const { nowMs } = pane
  const search = S.search
  const typing = !!search?.typing
  const { query, filtering, matching, parts, backlogOpen, doneOpen, droppedOpen, dayOpen, toggleDay } = listState($, pane)
  const toggleBacklog = () => ((S.backlogOpen = !S.backlogOpen), $.ui.invalidate('ui.render'))
  const toggleDone = () => ((S.doneOpen = !S.doneOpen), $.ui.invalidate('ui.render'))
  const toggleDropped = () => ((S.droppedOpen = !S.droppedOpen), $.ui.invalidate('ui.render'))
  const showAllBacklog = () => ((S.backlogAll = true), $.ui.invalidate('ui.render'))
  /** A list row: a task (`indent`: 0, 2 or 4 columns); a row one can press (`day`: 'backlog', 'done', 'dropped',
   *  'backlog-more' or an older day of Done); a section label (`head`); a secondary-color line (`line`); or a blank line. */
  type Row = { task: SymccTask; indent: number } | { question: OwnerQuestion } | { day: string; label: string; extra?: string; indent: number } | { head: string } | { line: string } | { blank: true }
  const tasksOf = (ts: SymccTask[], indent: number): Row[] => ts.map(task => ({ task, indent }))
  // active work first (always open): NEEDS YOU under its label, then one untitled list of what runs and what
  // waits to run (the mark and status column tell them apart), a blank line between; then the folded groups
  // the lead's open questions for the owner come first of all: "Questions for you (2)", one row each (not while searching)
  const questions = filtering ? [] : (v.questions ?? [])
  const active: Row[][] = [
    questions.length ? [{ head: questionsLabel(questions.length) }, ...questions.map(question => ({ question }))] : [],
    parts.needsYou.length ? [{ head: SECTION_LABEL.needsYou }, ...tasksOf(parts.needsYou, 0)] : [],
    tasksOf([...parts.doing, ...parts.todo], 0),
  ].filter(s => s.length)
  const countWidth = Math.max(1, ...[parts.backlog, parts.done, parts.dropped].map(ts => String(ts.length).length))
  const backlogShown = S.backlogAll || filtering ? parts.backlog : parts.backlog.slice(0, BACKLOG_SHOWN)
  const backlogMore = parts.backlog.length - backlogShown.length
  const backlogRows: Row[] = parts.backlog.length
    ? [
        { day: 'backlog', label: foldedRow('Backlog', parts.backlog.length, backlogOpen, countWidth), indent: 0 },
        ...(!backlogOpen ? [] : [...tasksOf(backlogShown, 2), ...(backlogMore > 0 ? [{ day: 'backlog-more', label: backlogMoreLabel(backlogMore), indent: 2 }] : [])]),
      ]
    : []
  // tasks moved to archive.json are not listed, only counted: "▸ Done  12 (+96 archived)"; a search leaves them out
  const gone = filtering ? 0 : archivedOf(v).done
  const doneHead = parts.done.length || gone ? [foldedRow('Done', parts.done.length, doneOpen, countWidth), archivedNote(gone)].filter(Boolean).join(' ') : ''
  const doneRows: Row[] = doneHead
    ? [
        { day: 'done', label: doneHead, indent: 0 },
        ...(!doneOpen
          ? []
          : [
              ...tasksOf(parts.doneToday, 2),
              ...parts.doneDays.flatMap(g => [{ day: g.day, label: groupLabel(g, dayOpen(g.day)), indent: 2 }, ...(dayOpen(g.day) ? tasksOf(g.tasks, 4) : [])]),
            ]),
      ]
    : []
  const droppedRows: Row[] = parts.dropped.length
    ? [{ day: 'dropped', label: foldedRow('Dropped', parts.dropped.length, droppedOpen, countWidth), indent: 0 }, ...(droppedOpen ? tasksOf(parts.dropped, 2) : [])]
    : []
  const folded = [...backlogRows, ...doneRows, ...droppedRows]
  const blank: Row = { blank: true }
  const list: Row[] = [
    ...(active.length ? active.flatMap((s, k) => (k ? [blank, ...s] : s)) : filtering ? [] : ALL_CLEAR.map(line => ({ line }))),
    ...(folded.length ? [...(active.length || !filtering ? [blank] : []), ...folded] : []),
  ]
  // while the search box is open it has the focus, not a row
  const firstButton = typing ? -1 : list.findIndex(r => 'task' in r || 'day' in r || 'question' in r)
  const shown = list.flatMap(r => ('task' in r ? [r.task] : []))
  const since = (id: string) => v.working.find(w => w.task === id)?.since
  const idWidth = Math.max(4, ...shown.map(x => x.id.length))
  // a doing task: the total work time of all tries, "1h40m", after its step's icon in a check step (rowMark): "⊛ 9m",
  // with no try mark (T-628: the band and the task page show it); narrow, the time is left out (see rowStates)
  const { states, width: cellWidth } = rowStates(shown, nowMs, since, w => w <= width - (4 + idWidth + 3 + 2) - TITLE_ROOM, false)
  // the list's own colors: failed red, review and waiting yellow, doing blue, done green
  const tone = LIST_TONE
  const pressDay = (day: string) => (day === 'backlog' ? toggleBacklog : day === 'backlog-more' ? showAllBacklog : day === 'done' ? toggleDone : day === 'dropped' ? toggleDropped : toggleDay(day))
  const redraw = () => $.ui.invalidate('ui.render')
  const openSearch = () => ((S.search = { text: S.search?.text ?? '', typing: true }), redraw())
  const clearSearch = () => ((S.search = null), redraw())
  const count = filtering ? (matching.length ? `${matching.length} of ${v.tasks.length} tasks` : 'no tasks match') : 'type to filter the tasks'
  // the search line under the header: the box while typing (with the count under it), else the filter in use
  const searchRows = typing
    ? [
        <Input
          key="search"
          label="search"
          submitLabel="keep"
          placeholder={`words, or ${SEARCH_WORDS}`}
          value={search!.text}
          autoFocus
          onInput={value => void ((S.search = { text: value, typing: true }), redraw())}
          onSubmit={value => void ((S.search = value.trim() ? { text: value.trim(), typing: false } : null), redraw())}
        />,
        <Text key="search-count" wrap="truncate" color={C('inactive')}>{searchBoxHint(count)}</Text>,
      ]
    : filtering
      ? [<Text key="search-line" wrap="truncate" bold color={C('warning')}>{searchLine(query, matching.length, v.tasks.length)}</Text>]
      : []
  // with a filter on, [f] change search and [x] clear search sit under the search line (the footer's mode row has
  // no room for both); with none, [f] search sits in the footer
  const searchButtons = filtering && !typing
    ? [
        <Box key="search-buttons" flexDirection="row" gap={2}>
          <Button key="search-open" label="[f] change search" hotkey="f" dimColor onPress={openSearch} />
          <Button key="search-clear" label="[x] clear search" hotkey="x" dimColor onPress={clearSearch} />
        </Box>,
      ]
    : []
  const searchButton = typing || filtering ? null : [<Text key="search-gap">  </Text>, <Button key="search-open" label="[f] search" hotkey="f" dimColor onPress={openSearch} />]
  return (
    <Box flexDirection="column">
      {header('tasks')}
      {searchRows}
      {searchButtons}
      {list.map((r, i) => {
        if ('blank' in r) return <Text key={`blank-${i}`}> </Text>
        if ('line' in r) return <Text key={`clear-${i}`} wrap="truncate" color={C('inactive')}>{r.line}</Text>
        if ('head' in r) return <Text key={`head:${r.head}`} bold color={C('text')}>{r.head}</Text>
        if ('question' in r) {
          const q = r.question
          return (
            <Button key={row(q.id)} plain autoFocus={i === firstButton ? true : undefined} onPress={act(() => panelValues($).updateOpened(() => q.id))}>
              <Text bold color={C('claude')}>{q.id.padEnd(idWidth)}</Text>
              <Text color={C('warning')}>{' ? '}</Text>
              <Text bold color={C('text')}>{fitRow(idWidth + 3, q.text, '', width, false).title}</Text>
            </Button>
          )
        }
        if (!('task' in r)) {
          const top = r.day === 'backlog' || r.day === 'done' || r.day === 'dropped'
          return (
            <Button key={row(`day:${r.day}`)} plain autoFocus={i === firstButton ? true : undefined} onPress={pressDay(r.day)}>
              <Text color={C(top ? 'text' : 'inactive')}>
                {' '.repeat(r.indent)}
                {r.label}
              </Text>
              {r.extra ? <Text color={C('inactive')}>{`   ${r.extra}`}</Text> : null}
            </Button>
          )
        }
        const x = r.task
        const closed = x.status === 'done' || x.status === 'dropped' || x.status === 'backlog'
        const lead = r.indent + idWidth + 3 + cellWidth + 2
        const state = states.get(x.id) ?? { front: '', tag: '', back: '' }
        const fit = fitRow(lead, x.title, rowExtra(x, v.tasks, v.home_branch ?? '', v.max_minutes, nowMs), width, x.status === 'failed')
        return (
          <Button key={row(x.id)} plain autoFocus={i === firstButton ? true : undefined} onPress={act(() => panelValues($).updateOpened(() => x.id))}>
            {r.indent ? <Text>{' '.repeat(r.indent)}</Text> : null}
            <Text bold={!closed} color={C(closed ? 'inactive' : 'claude')}>
              {x.id.padEnd(idWidth)}
            </Text>
            {/* an approved task whose approve runs is shown as running (shownStatus): the doing tone, not bold */}
            <Text color={C(tone[shownStatus(x, nowMs)]!)}>{` ${rowMark(x, nowMs)} ${stateText(state)}  `}</Text>
            <Text bold={ownersTurn(x, nowMs)} color={C(closed ? 'inactive' : 'text')}>
              {fit.title}
            </Text>
            {fit.extra ? <Text color={C('inactive')}>{`${fit.pad}${fit.extra}`}</Text> : null}
          </Button>
        )
      })}
      <Text key="list-blank"> </Text>
      {footer(listKeys(), 'list-hint', true, searchButton)}
    </Box>
  )
}
