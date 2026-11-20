// The board panel's Tasks view in VS Code's side panel (see surface.ts and vscode.tsx). Like the terminal's list
// (list.tsx), each open task is one line: the ID (a link that opens the task), its state cell in the status color,
// lined up in one column with the other rows' ("▶ 5m" for a doing task, "○" for a to do one), the title, then dim the
// kind or role, "after …", the question or why it failed:
//   T-401 ▶ 5m  Show the plugin version in the board title · [investigation · researcher]
//   ● T-404 ? waiting for 1m  Pick the colors for the review mark · Yellow or blue for review?
// The row is fitted to the panel's width (paneWidth in parts.tsx: wide when VS Code tells none) times VS_ROW_SCALE,
// since VS Code counts columns in its code font but draws titles narrower; only when it is too
// narrow is the title cut with "…" (the whole title is on the task's page). A done or dropped task is one line:
// "✓ T-12 title", its mark first, no state. What needs you sits under headings with their colored mark and a count
// badge (Questions for you, Waiting for you, Review, Failed, Needs you for a running task asking for more time); doing and to do follow as one list with no heading, in the
// terminal list's order (T-644); a line of space between them, then Backlog, Done and Dropped, folded (each fold a link). No Buttons for rows or folds: VS Code draws a Button as a filled blue box whose label never wraps.
// No key hints: the mode switch is a link and the search a box in the footer. An empty board says so, with one
// primary button that starts a message to the lead in the prompt box.
import type { SymccStatus, SymccTask } from '../../../types'
import { statusMark, archivedNote, archivedOf, localOffset, panelSections, BACKLOG_SHOWN, ALL_CLEAR, statusCell, rowCell, rowMark, rowStates, stateText, TITLE_ROOM, rowExtra, roleTag, kindTag, searchTasks, SEARCH_WORDS, isInvestigation, needsYou, kindMark, roleMark, fmtDuration, ownersTurn, shownStatus } from '../../board'
import { openDays, S } from '../../app/state'
import { type $, panelValues } from '../panel'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { vsFold, vsFooter, vsHeading, vsHref, vsLink, mdLink, mdText, twoLines, cutEnd, MORE, MIN_TITLE, NO_TITLE } from './vscode'

/** The groups of what needs you, top to bottom, each under its heading; what runs and what waits to run follow them
 *  as one list with no heading, in the terminal list's order (doing, then to do; T-644). */
const GROUPS: { label: string; has: SymccStatus[] }[] = [
  { label: 'Waiting for you', has: ['waiting'] },
  { label: 'Review', has: ['review'] },
  { label: 'Failed', has: ['failed'] },
]

/** How many characters of a list row fit in one of the columns VS Code reports (T-644). VS Code counts the panel's
 *  columns in its code font's cells, but draws a row's title in its narrower text font: in the owner's 950px panel it
 *  reported about 70-80 columns, yet a 66-character row filled less than half the line. So a row is fitted to this many
 *  times the reported columns (a bit under the 2 that screenshot shows, so a title of wide letters still fits on its
 *  one line); only a really narrow panel cuts the title with "…". */
export const VS_ROW_SCALE = 1.8
/** The characters a VS Code list row is fitted to, for a panel of `columns` reported columns (see VS_ROW_SCALE). */
export const vsRowRoom = (columns: number) => Math.floor(columns * VS_ROW_SCALE)

/** The heading of what needs you but has no heading of its own (a running task that asks for more time). */
export const NEEDS_YOU_OTHER = 'Needs you'

/** Spaces that HTML does not squeeze, so a state cell keeps its padding in VS Code's panel. */
const hard = (s: string) => s.replace(/ /g, ' ')

/** The empty board's button: it starts a message to the lead in the prompt box. */
export const ASK_LEAD = 'Tell the lead what to do next'
/** What that button puts in the prompt box (only when the box is empty, so what the owner typed stays). */
export const ASK_LEAD_DRAFT = 'Next task: '

/** A piece of an open row's state part after its status words: `drop` says which goes first when the line is too
 *  wide (higher first; 0 only after the title is down to "…"), `long` marks a question, failure reason or note, capped
 *  to about half the free room, `short` a shorter form used before the part is dropped ("[researcher]" for
 *  "[investigation · researcher]", "after T-1 +2" for "after T-1, T-2, T-3"). */
export type RowPart = { text: string; drop: number; long?: boolean; short?: string }

/** `text` cut at a word to at most `max` columns, ending with "…"; '' when not even one whole word fits. */
const cutWords = (text: string, max: number) => {
  if (text.length <= max) return text
  const head = text.slice(0, Math.max(0, max - 1))
  const space = head.lastIndexOf(' ')
  return space > 0 ? `${head.slice(0, space).replace(/[\s,;:·-]+$/, '')}…` : ''
}

/** An open row's one line, fitted to `room` columns, never wider (but for a room too small for even the status mark
 *  and the status). In order, until it fits: a long part (the question, why it failed) is held to about half the free
 *  room, cut at a word; parts with a `drop` are shortened (their `short` form) or dropped whole, the highest first (the
 *  role tag, the kind, the choices count, the long text), until the title keeps MIN_TITLE; "after …" takes its short
 *  form; the title is cut with "…", down to just "…"; "after …" and "→ branch" are dropped; last, the status words lose
 *  words from their end ("for 5m"). A part is never cut mid-word. No try mark: the band and the task page show it (T-628). */
export function fitRow(title: string, room: number, status: string, parts: RowPart[]): { title: string; status: string; rest: string } {
  const t = title.replace(/\s+/g, ' ').trim()
  // `status` '' (a list row, whose state sits before the title): only " · " and the parts follow the title
  const size = (st: string, ps: RowPart[]) => (st ? 3 + st.length : 0) + ps.reduce((n, p) => n + 3 + p.text.length, 0)
  let kept = parts.filter(p => p.text)
  let st = status
  const left = () => room - size(st, kept)
  const done = (shown: string) => ({ title: shown, status: st, rest: kept.map(p => p.text).join(' · ') })
  const shorten = (at: number) => {
    const p = kept[at]!
    kept = p.short && p.short !== p.text ? kept.map((q, i) => (i === at ? { ...q, text: p.short!, short: undefined } : q)) : kept.filter((_, i) => i !== at)
  }
  if (t.length <= left()) return done(t)
  // a long part: at most about half the room the status and the short parts leave (more when the whole title
  // needs less), so the title keeps the rest
  const free = room - size(st, kept.filter(p => !p.long))
  const cap = Math.max(Math.floor(free / 2), free - t.length) - 3
  kept = kept.map(p => (p.long ? { ...p, text: cutWords(p.text, cap) } : p)).filter(p => p.text)
  const floor = Math.min(t.length, MIN_TITLE)
  while (left() < floor) {
    const top = Math.max(0, ...kept.map(p => p.drop))
    if (!top) break
    shorten(kept.map(p => p.drop).lastIndexOf(top))
  }
  for (let i = 0; i < kept.length && left() < floor; i++) if (kept[i]!.short) shorten(i)
  // the title goes below its floor, down to "…", before the state part loses anything more
  while (left() < 1 && kept.length) kept = kept.slice(0, -1)
  const words = status.split(' ')
  while (left() < 1 && words.length > 1) st = (words.pop(), words.join(' '))
  return done(cutEnd(t, Math.max(1, left())))
}

async function askLead($: $) {
  const box = await $.prompt.read().catch(() => ({ text: '' }))
  if (!box.text.trim()) await $.prompt.fill({ text: ASK_LEAD_DRAFT }).catch(() => undefined)
}

export function listPageVs($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, v, mark, word, act, C, banner, tabs, vs, switchMode, mode, width } = pane
  /** The characters an open row is fitted to: more than the reported columns (see VS_ROW_SCALE). */
  const room = vsRowRoom(width)
  const { nowMs } = pane
  const query = S.search?.text.trim() ?? ''
  const filtering = query !== ''
  const matching = filtering ? searchTasks(v.tasks, query, nowMs) : v.tasks
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
  /** The status words of a row's state part: the mark and the running time ("▶ 2m"; in a check step its icon in
   *  place of ▶ and the step word, "⊛ 9m", see rowMark), how long a task has waited for you ("? waiting for 1m",
   *  "◆ review for 5m") or since it failed ("✗ failed 3m ago"). */
  const statusText = (x: SymccTask) => {
    const mark = rowMark(x, nowMs)
    // a task in a check step or the merge line: its icon and its time, "⌕ 5m" (an approve in review too)
    if (mark !== statusMark(x)) return `${mark} ${rowCell(x, nowMs, since(x.id))}`.trimEnd()
    const cell = statusCell(x, nowMs, since(x.id))
    const waited = ownersTurn(x, nowMs) ? ago(x.updated_at) : ''
    // with a time, the short word ("waiting for 1m", not "waiting for you for 1m")
    if (waited) return `${mark} ${cell || x.status} ${x.status === 'failed' ? `${waited} ago` : `for ${waited}`}`
    // a doing task shows the total work time of all its tries: "▶ 1h40m"
    const shown = x.status === 'doing' ? rowCell(x, nowMs, since(x.id)) : cell
    return `${mark} ${shown && shown !== x.status ? shown : word[x.status]}`
  }

  /** One task on one line of text, like the terminal list's row (T-644): its ID a link that opens it, then its state
   *  cell in the status color, lined up with the other rows' (`col`, see cellsOf: "▶ 5m", "○"), then the title (bold
   *  when it needs you, dim when closed), with "●" first in the status color when it needs you; then, dim on the same
   *  line, the kind or role, "after …", the question or why it failed. When the line is too wide the title is cut with
   *  "…" (the whole title is on the task's page). A done or dropped task: its mark, the ID and the title, no state.
   *  Text, not a Button (VS Code draws a Button as a blue box). */
  const taskRow = (x: SymccTask, depth = 0, col?: Column) => {
    const closed = x.status === 'done' || x.status === 'dropped' || x.status === 'backlog'
    // a done or dropped task is one line: its mark (the terminal list's), the ID link, the dim title; no status line
    const ended = x.status === 'done' || x.status === 'dropped'
    const needs = needsYou(x, nowMs)
    const extra = rowExtra(x, v.tasks, v.branch ?? '', v.max_minutes, nowMs).replace(/^Enter to review$/, isInvestigation(x) ? '' : 'ready for your review')
    let body = extra
    // "→ other-branch" first, when it merges elsewhere (kept whole)
    const branch = body.startsWith('→ ') ? body.split(' · ')[0]! : ''
    if (branch) body = body.slice(branch.length).replace(/^ · /, '')
    const kind = kindMark(x)
    // the kind once: rowExtra already shows it as a tag ("[bug · tester]", "[investigation]") for some rows; a question
    // or failure reason that only mentions the word does not count
    const tagged = body.split(' · ').some(p => p === `[${kind}]` || p === `[${kind}`)
    // "after T-3" stays longest ("after T-1 +2" when narrow); the role tag goes first ("[researcher]" before that), then
    // the kind, then a question or reason (cut at a word)
    // the "after" list comes from the task's own `after` field (its unfinished ones, as rowExtra shows them), never
    // from text that only starts with the word: a question or note "after you look at …" is a normal long part
    const ids = x.status === 'todo' || x.status === 'paused' ? (x.after ?? []).filter(id => v.tasks.some(t => t.id === id && t.status !== 'done')) : []
    const after = ids.length && body === `after ${ids.join(', ')}` ? body : ''
    const role = !after && body && (body === roleTag(x) || body === kindTag(x)) ? body : ''
    const roleOnly = roleMark(x)
    const parts: RowPart[] = [
      { text: branch, drop: 0 },
      { text: after, drop: 0, short: after && ids.length > 1 ? `after ${ids[0]} +${ids.length - 1}` : undefined },
      { text: kind && !tagged ? kind : '', drop: 3 },
      { text: role, drop: 4, short: role.startsWith('[') && roleOnly && role !== `[${roleOnly}]` ? `[${roleOnly}]` : undefined },
      { text: after || role ? '' : body, drop: 1, long: true },
    ]
    let rest = ''
    const href = vsHref('task', x.id)
    const open = act(() => panelValues($).updateOpened(() => x.id))
    if (ended) {
      const lead = 2 + x.id.length + 2
      const title = twoLines(x.title, width - depth, lead)
      const words = `${mdText(title.text)}${title.cut ? ` ${mdText(MORE)}` : ''}`
      return (
        <Box key={`vs-task-${x.id}`} flexDirection="column" paddingLeft={depth}>
          <Box key={`vs-task-${x.id}-top`} flexDirection="row">
            <Text key="ended" color={C(tone[x.status]!)}>{`${statusMark(x)} `}</Text>
            <Box key="title" flexDirection="column" flexGrow={words ? 1 : 0} flexShrink={1}>
              {vsLink(vs, row(x.id), words ? `${mdLink(x.id, href)}  ${words}` : mdLink(x.id, href), [[href, open]], closed)}
            </Box>
            {words ? null : <Text key="no-title" color={C('inactive')}>{`  ${NO_TITLE}`}</Text>}
          </Box>
        </Box>
      )
    }
    // the state cell between the ID and the title, lined up with the other rows' (see cellsOf)
    const cell = col?.cells.get(x.id) ?? soloCell(x)
    const idWidth = col?.idWidth ?? x.id.length
    const lead = (needs ? 2 : 0) + idWidth + 1 + cell.length + 2
    const fit = fitRow(x.title.trim() || NO_TITLE, room - depth - lead, '', parts)
    const words = x.title.trim() ? mdText(fit.title) : ''
    rest = fit.rest
    return (
      <Box key={`vs-task-${x.id}`} flexDirection="column" paddingLeft={depth}>
        <Box key={`vs-task-${x.id}-top`} flexDirection="row">
          {needs ? <Text key="needs" bold color={C(tone[x.status] ?? 'warning')}>● </Text> : null}
          <Box key="id" flexShrink={0} minWidth={idWidth}>
            {vsLink(vs, row(x.id), `${mdLink(x.id, href)}${' '.repeat(Math.max(0, idWidth - x.id.length))}`, [[href, open]], closed)}
          </Box>
          {/* an approved task whose approve runs is shown as running (shownStatus): the doing tone */}
          <Box key="state" flexShrink={0} minWidth={1 + cell.length + 2}>
            <Text key={`vs-task-${x.id}-state`} color={C(tone[shownStatus(x, nowMs)]!)}>{hard(` ${cell}  `)}</Text>
          </Box>
          <Box key="title" flexDirection="column" flexGrow={0} flexShrink={1}>
            {words ? vsLink(vs, `${x.id}-title`, needs ? `**${words}**` : words, [], closed) : <Text key="no-title" color={C('inactive')}>{NO_TITLE}</Text>}
          </Box>
          {rest ? (
            <Text key={`vs-task-${x.id}-info`} wrap="truncate" color={C('inactive')}>
              {` · ${rest}`}
            </Text>
          ) : null}
        </Box>
      </Box>
    )
  }

  /** A row's state cell when it has no column to line up with: its mark and its status cell ("◇" for a backlog task). */
  const soloCell = (x: SymccTask) => `${rowMark(x, nowMs)} ${rowCell(x, nowMs, since(x.id))}`.trimEnd()
  type Column = { cells: Map<string, string>; idWidth: number }
  /** The state cells of a run of rows, padded to one width so they line up in one column, and the width of their IDs.
   *  `terminal`: the terminal list's cells (rowStates: "▶ 5m" for a doing task, the step's icon and time in a check
   *  step, "○" for a to do one; the time left out when the panel is narrow); else the cells of what needs you, with
   *  how long it has waited ("? waiting for 1m", see statusText). */
  const cellsOf = (ts: SymccTask[], terminal: boolean): Column => {
    const idWidth = Math.max(0, ...ts.map(x => x.id.length))
    if (terminal) {
      const { states } = rowStates(ts, nowMs, since, w => w <= room - (2 + idWidth + 3 + 2) - TITLE_ROOM, false)
      return { cells: new Map(ts.map(x => [x.id, `${rowMark(x, nowMs)} ${stateText(states.get(x.id))}`])), idWidth }
    }
    const cells = new Map(ts.map(x => [x.id, statusText(x)]))
    const w = Math.max(0, ...[...cells.values()].map(c => c.length))
    return { cells: new Map([...cells].map(([id, c]) => [id, c.padEnd(w)])), idWidth }
  }

  // what needs you, under its headings; an approved task whose approve runs is listed with the running ones (shownStatus)
  const found = GROUPS.map(g => ({ ...g, mark: mark[g.has[0]!]!, tone: tone[g.has[0]!]!, tasks: parts.needsYou.filter(t => g.has.includes(shownStatus(t, nowMs))) }))
  // anything else that needs you (a running task asking for more time) under its own heading, as the terminal list
  // keeps it in its needs-you part: never in the running list, where its "●" and longer cell would put its row out
  // of line with the others (T-644)
  const inGroup = new Set(found.flatMap(g => g.tasks.map(t => t.id)))
  const others = parts.needsYou.filter(t => !inGroup.has(t.id))
  const groups = [...found, { label: NEEDS_YOU_OTHER, has: [] as SymccStatus[], mark: '●', tone: 'warning', tasks: others }].filter(g => g.tasks.length)
  const grouped = new Set(groups.flatMap(g => g.tasks.map(t => t.id)))
  // then doing and to do as one list, the terminal list's order (T-644)
  const running = [...parts.doing, ...parts.todo].filter((t, i, all) => !grouped.has(t.id) && all.findIndex(o => o.id === t.id) === i)
  const runCol = cellsOf(running, true)
  // the lead's open questions for the owner, first of all (not while searching); each row opens its answer page
  const questions = filtering ? [] : (v.questions ?? [])
  const qCells = new Map(questions.map(q => [q.id, `? ${ago(q.asked_at)}`.trimEnd()]))
  const qCell = Math.max(0, ...[...qCells.values()].map(c => c.length))
  const qId = Math.max(0, ...questions.map(q => q.id.length))
  const asks = questions.length
    ? [
        <Box key="vs-group-questions" flexDirection="column">
          {vsHeading(vs, 'vs-head-questions', '?', 'warning', 'Questions for you', questions.length)}
          {questions.map(q => {
            const choices = q.options?.length ?? 0
            const href = vsHref('question', q.id)
            const cell = qCells.get(q.id)!.padEnd(qCell)
            const more = choices ? `${choices} ${choices === 1 ? 'choice' : 'choices'}` : ''
            const fit = fitRow(q.text.trim() || NO_TITLE, room - 2 - qId - 1 - cell.length - 2, '', [{ text: more, drop: 2 }])
            const words = q.text.trim() ? mdText(fit.title) : ''
            return (
              <Box key={`vs-question-${q.id}`} flexDirection="column">
                <Box key={`vs-question-${q.id}-top`} flexDirection="row">
                  <Text key="needs" bold color={C('warning')}>● </Text>
                  <Box key="id" flexShrink={0} minWidth={qId}>
                    {vsLink(vs, row(q.id), `${mdLink(q.id, href)}${' '.repeat(Math.max(0, qId - q.id.length))}`, [[href, act(() => panelValues($).updateOpened(() => q.id))]])}
                  </Box>
                  <Box key="state" flexShrink={0} minWidth={1 + cell.length + 2}>
                    <Text key={`vs-question-${q.id}-state`} color={C('warning')}>{hard(` ${cell}  `)}</Text>
                  </Box>
                  <Box key="title" flexDirection="column" flexGrow={0} flexShrink={1}>
                    {words ? vsLink(vs, `${q.id}-title`, `**${words}**`, []) : <Text key="no-title" color={C('inactive')}>{NO_TITLE}</Text>}
                  </Box>
                  {fit.rest ? (
                    <Text key={`vs-question-${q.id}-info`} wrap="truncate" color={C('inactive')}>
                      {` · ${fit.rest}`}
                    </Text>
                  ) : null}
                </Box>
              </Box>
            )
          })}
        </Box>,
      ]
    : []
  const active = [
    ...asks,
    ...groups.map(g => {
      const col = cellsOf(g.tasks, false)
      return (
        <Box key={`vs-group-${g.label}`} flexDirection="column">
          {vsHeading(vs, `vs-head-${g.label}`, g.mark, g.tone, g.label, g.tasks.length)}
          {g.tasks.map(t => taskRow(t, 0, col))}
        </Box>
      )
    }),
    ...(running.length
      ? [
          <Box key="vs-group-running" flexDirection="column">
            {running.map(t => taskRow(t, 0, runCol))}
          </Box>,
        ]
      : []),
  ]

  const backlogShown = S.backlogAll || filtering ? parts.backlog : parts.backlog.slice(0, BACKLOG_SHOWN)
  const backlogCol = cellsOf(backlogShown, true)
  const backlogMore = parts.backlog.length - backlogShown.length
  const gone = filtering ? 0 : archivedOf(v).done
  const folded = [
    parts.backlog.length ? (
      <Box key="vs-backlog" flexDirection="column">
        {vsFold(vs, row('day:backlog'), 'Backlog', parts.backlog.length, backlogOpen, () => ((S.backlogOpen = !S.backlogOpen), redraw()))}
        {backlogOpen ? backlogShown.map(t => taskRow(t, 2, backlogCol)) : null}
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
        placeholder={`Search tasks: words, or ${SEARCH_WORDS}`}
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
