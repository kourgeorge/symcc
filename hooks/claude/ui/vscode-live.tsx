// The board panel's Live tab in VS Code's side panel (T-691, T-1003): the same lanes and today as the terminal's Live
// tab (live.tsx), worked out in core/live.ts (liveTaskLanes, liveLayout, liveTrains, liveTodayRows ...); this file draws
// them in VS Code's plain style: bold headings, no folds, no legend, links for what you go to.
//   Status        Mode (with "change" a link), Scouts, Branch, Tests: one row each
//   Tasks  17 backlog   what needs you, then the lanes; when nothing runs why, and when all is done "All done", "Up next
//                 from the backlog" and the one primary "Tell the lead" button
//   Branches      (T-1004: core's liveBranches, one line each: see branchesVs)
//   Today         Results, Tokens (one color), Agent time, Per task, Hours, 7 days (core's liveTodayRows)
//   Organizational memory  2 / 60   All notes   (one line)
// A lane is two lines: ▶ T-684  the full title (cut only when the panel is too narrow), then under it the track and the time
//   ●━━━━●━━━━◉────○────○            try 2 · 12m
// and the station names ("work check queue tests done") are drawn once above all lanes in one Svg, so every train lines
// up under them. The current station blinks with a CSS animation inside the Svg, and stays steady when VS Code asks for
// reduced motion. T-715: under a lane hang its waiting trains, one line each, indented by their level.
import type { RenderChildren } from 'claude-code'
import { laneLines, liveInner, liveBranches, liveIdle, liveIdleFacts, LIVE_AGENT_MARK, LIVE_IDLE, LIVE_RUN_MARK, LIVE_SECTIONS, type LiveLane, type LiveStation, type LiveLayout, type LiveSeg, LIVE_TONE, laneRight, liveNowSegs, liveNeeds, liveTaskLanes, liveLayout, liveColumns, liveTodayRows, liveTrains, segText, trainRows } from '../../core/live'
import { STATUS_MARK } from '../../core/details'
import { textWidth } from '../../core/width'
import { nextMode } from '../../board'
import { S } from '../../app/state'
import { panelValues, type $ } from '../panel'
import type { PaneParts } from './parts'
import { ORG_MEM_ALL_KEY, branchKey, needKey, laneKey, liveTick, openOrgMemPage, trainKey } from './live'
import { cutEnd, mdLink, mdText, modeColor, NO_TITLE, ROW_HOVER, testsValue, vsFacts, vsFooter, vsHref, vsLink, vsRow } from './vscode'
import { ASK_LEAD, askLead, vsRowRoom } from './vscode-list'
import { ORG_MEM_MAX_LINES, type OrgMemNote } from '../../core/org-mem'

/** The pixels per text column in the drawings (about one character of VS Code's panel font). */
const COL_PX = 8
/** The drawings' colors: an image can't read the theme, so hues that read on light and dark themes alike. */
const INK = { mark: '#b79cff', passed: '#3fb950', current: '#3794ff', future: '#8b949e', label: '#8b949e', warning: '#d29922', bar: '#3794ff', empty: '#8b949e' }

/** The CSS of a lane's track: the current station blinks, steady with reduced motion. */
export const BLINK_CSS = '@keyframes symcc-blink{50%{opacity:.25}}.cur{animation:symcc-blink 1s steps(1) infinite}@media (prefers-reduced-motion: reduce){.cur{animation:none}}'

/** A lane's track as an Svg document: a dot per station (passed filled green, the current one blue and blinking, future
 *  hollow grey), lines between them (bold up to the current one), the station names (layout.labels) under the dots. */
export function trackSvg(lane: Pick<LiveLane, 'at'> & Partial<Pick<LiveLane, 'done' | 'stations' | 'skipped'>>, l: LiveLayout, names = true): { source: string; width: number; height: number } {
  const step = (l.gap + 1) * COL_PX
  const r = 5
  const x0 = r + 2
  const width = x0 * 2 + step * (l.stations.length - 1) + COL_PX * 4
  const height = names ? 30 : 18
  const y = 9
  const parts: string[] = [`<style>${BLINK_CSS}</style>`]
  // T-846: the lane's own stations on the shared columns; the line runs through columns it has no station at
  const own = lane.stations ?? l.stations
  l.stations.forEach((s, col) => {
    const x = x0 + col * step
    let i = -1
    for (let j = col; j < l.stations.length && i < 0; j++) i = own.indexOf(l.stations[j]!)
    const mine = own.indexOf(s)
    const through = mine < 0
    if (col && i >= 0) parts.push(i <= lane.at ? `<line x1="${x - step + r}" y1="${y}" x2="${x - r}" y2="${y}" stroke="${INK.passed}" stroke-width="3"/>` : `<line x1="${x - step + r}" y1="${y}" x2="${x - r}" y2="${y}" stroke="${INK.future}" stroke-width="1.5"/>`)
    if (through) {
      if (i >= 0) parts.push(`<line x1="${x - r}" y1="${y}" x2="${x + r}" y2="${y}" stroke="${i <= lane.at ? INK.passed : INK.future}" stroke-width="${i <= lane.at ? 3 : 1.5}"/>`)
      return
    }
    i = mine
    if (lane.skipped?.includes(s) && i !== lane.at) parts.push(`<line x1="${x - r}" y1="${y}" x2="${x + r}" y2="${y}" stroke="${INK.label}" stroke-width="2"/>`)
    else if (i < lane.at) parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${INK.passed}"/>`)
    // T-771: a finished lane: a green ✓ at its last station, nothing blinks
    else if (i === lane.at && lane.done) parts.push(`<path d="M${x - r} ${y} L${x - 1} ${y + r - 1} L${x + r + 1} ${y - r}" fill="none" stroke="${INK.passed}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`)
    else if (i === lane.at) parts.push(`<circle class="cur" cx="${x}" cy="${y}" r="${r + 1}" fill="${INK.current}" stroke="${INK.current}" stroke-width="2" fill-opacity=".85"/>`)
    else parts.push(`<circle cx="${x}" cy="${y}" r="${r - 1}" fill="none" stroke="${INK.future}" stroke-width="1.5"/>`)
    if (names) parts.push(`<text x="${x}" y="${height - 2}" text-anchor="${col ? (col === l.stations.length - 1 ? 'end' : 'middle') : 'start'}" font-family="sans-serif" font-size="10" fill="${i === lane.at ? (lane.done ? INK.passed : INK.current) : INK.label}"${i === lane.at ? ' font-weight="bold"' : ''}>${(l.labels[col] ?? '').split(LIVE_AGENT_MARK).join(`<tspan fill="${INK.mark}">${LIVE_AGENT_MARK}</tspan>`)}</text>`)
  })
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`, width, height }
}

/** T-1003: the station names in full words as one Svg (drawn once above all lanes, so every train lines up under it). */
export const FULL_LABELS: Record<LiveStation, string> = { work: 'work', check: 'check', queue: 'queue', tests: 'tests', you: 'you', done: 'done' }
export function stationsSvg(l: LiveLayout): { source: string; width: number; height: number } {
  const step = (l.gap + 1) * COL_PX
  const x0 = 5 + 2
  const width = x0 * 2 + step * (l.stations.length - 1) + COL_PX * 4
  const height = 14
  const text = l.stations.map((s, col) => `<text x="${x0 + col * step}" y="${height - 3}" text-anchor="${col ? (col === l.stations.length - 1 ? 'end' : 'middle') : 'start'}" font-family="sans-serif" font-size="11" fill="${INK.label}">${FULL_LABELS[s]}</text>`)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${text.join('')}</svg>`, width, height }
}

/** T-973: the line over the backlog picks when all is done. */
export const LIVE_UP_NEXT = 'Up next from the backlog'
/** The Live tab's Status heading. */
export const LIVE_STATUS = 'Status'

/** T-1003: one section of the Live tab in VS Code (`live-<key>`): a plain bold heading (`live-<key>-head`, with an
 *  optional dim count after it; nothing folds), then its rows tight. The page Box's gap spaces the sections. */
function liveSection($: $, pane: PaneParts, key: string, name: string, body: () => RenderChildren[], count?: number | string) {
  const { Box, Text, C } = pane
  return (
    <Box key={`live-${key}`} flexDirection="column" rowGap="xs">
      <Box key={`live-${key}-head`} flexDirection="row" columnGap={1}>
        <Text bold color={C('text')}>{name}</Text>
        {count === undefined ? null : <Text color={C('inactive')}>{String(count)}</Text>}
      </Box>
      {body() as never}
    </Box>
  )
}

/** T-1004: the Live tab's Branches section in VS Code: one line per branch, no graph. The id (a link that opens the
 *  task) in a sized cell, then its figures (main: "sha · age"; a task: "+3 commits · 1 behind"; a merged one: "merged 3m ago"). */
function branchesVs($: $, pane: PaneParts, open: (id: string) => () => void) {
  const { Box, Text, C, v, width, nowMs, vs } = pane
  const br = liveBranches(v, nowMs, 200)
  if (!br) return null
  const inner = liveInner(width)
  const idW = Math.max(4, textWidth(br.name), ...br.rows.map(r => textWidth(r.id ?? '')))
  const room = Math.max(1, inner - idW - 1)
  // core picks each row's wording for a width (longest first); try widths from wide to narrow and keep the first wording
  // that fits the room beside the id cell, so a narrow panel gets "+3 · 1 behind" and not a cut line
  const tries = [200, 100, 80, 64, 56, 48, 44, 40, 36, 32, 28, 24, 20, 16, 12].map(w => liveBranches(v, nowMs, w) ?? br!)
  const fits = (xs: LiveSeg[]) => textWidth(segText(xs).trim()) <= room
  const pickFor = (get: (b: NonNullable<typeof br>) => LiveSeg[]) => {
    const all = tries.map(get)
    const xs = all.find(fits) ?? all[all.length - 1]!
    // the text starts at the cell's edge: no leading blanks
    const first = xs[0]
    return first ? [{ ...first, text: first.text.replace(/^\s+/, '') }, ...xs.slice(1)] : xs
  }
  const figures = (key: string, xs: LiveSeg[]) => (
    <Box key={key} flexDirection="row" flexGrow={1} flexShrink={1}>
      {xs.map(s => <Text tabular wrap="truncate" color={C(LIVE_TONE[s.tone])}>{s.text}</Text>)}
    </Box>
  )
  const mainFig = pickFor(b => (b.right ? [{ text: b.right, tone: 'dim' as const }] : []))
  return liveSection($, pane, 'br', LIVE_SECTIONS.branches, () => [
    <Box key="live-br-main" flexDirection="column">
      {vsRow(vs, 'live-br-main-row', [
        { key: 'id', width: idW, node: <Box key="live-br-main-name" flexDirection="row"><Text bold color={C('text')}>{br.name}</Text></Box> },
        { key: 'figures', node: figures('live-br-main-text', mainFig) },
      ])}
    </Box>,
    ...br.rows.map((r, i) => {
      if (!r.id) return <Box key="live-br-more" flexDirection="column"><Text color={C('inactive')}>{segText(r.label).trim()}</Text></Box>
      const href = vsHref('task', r.id)
      const id = r.id
      const figs = pickFor(b => (b.rows.find(x => x.id === id) ?? r).label.slice(1))
      return (
        <Box key={`live-br-row:${id}`} flexDirection="column" hover={{ backgroundColor: ROW_HOVER }}>
          {vsRow(vs, `live-br-line:${id}`, [
            { key: 'id', width: idW, node: vsLink(vs, branchKey(id), mdLink(id, href), [[href, open(id)]], r.kind === 'merged') },
            { key: 'figures', node: figures(`live-br-note:${id}`, figs) },
          ])}
        </Box>
      )
    }),
  ])
}

/** A task id as markdown code (drawn in the mono face) inside a link: "[`T-5`](…)". */
const monoLink = (id: string, href: string) => `[\`${id.replace(/`/g, '')}\`](${href})`

/** The room for a time cell: "merged 10m ago", and "try 2 · " before a running time. */
const TIME_W = 14
/** The indent of a lane's second line (under the title's start: the mark's cell and a gap). */
const TRACK_INDENT = 2

/**
 * The Live tab in VS Code (T-1003: plain headings, nothing folds, one line per lane, see the top of this file);
 * `notes`: org-mem's notes, only counted for its one line (T-718).
 */
export function livePageVs($: $, pane: PaneParts, notes: readonly OrgMemNote[]) {
  const { Box, Text, Button, v, width, C, act, header, nowMs, vs, goTab, mode, switchMode } = pane
  const { Svg } = vs
  // the times beside the lanes ("2m") are redrawn every tick; the blink itself is the drawing's own animation
  liveTick($)
  // T-771: the running lanes, then the just-merged ones (dim, ✓ at "merged")
  const lanes = liveTaskLanes(v, nowMs)
  const running = lanes.filter(l => !l.done)
  // the shared columns, in full words, 4 columns (40px) between stations so the words never run into each other
  const stations = liveColumns(lanes, v.checker === true)
  const base = liveLayout(lanes, stations, liveInner(width))
  const layout = { ...base, gap: 4, labels: stations.map(s => FULL_LABELS[s]) }
  const trains = liveTrains(v, nowMs, lanes)
  // a lane is two lines: line 1 mark, id, title; line 2 (indented 2) the track and the time at the right. The track and
  // the header are drawn smaller (one scale for both) when the panel is too narrow for them.
  const inner = liveInner(width)
  const trainLists = lanes.map(l => trainRows(trains.lanes[l.id] ?? [], inner))
  const idW = Math.max(4, layout.idW, ...trainLists.flat().map(r => textWidth(r.id ?? '')))
  const natural = stationsSvg(layout)
  const trackRoom = Math.max(8, inner - TRACK_INDENT - 1 - TIME_W) * COL_PX
  const scale = Math.min(1, trackRoom / natural.width)
  const shown = (d: { width: number; height: number }) => ({ width: Math.floor(d.width * scale), height: Math.ceil(d.height * scale) })
  const trackCols = Math.ceil(natural.width * scale / COL_PX)
  const open = (id: string) => act(() => panelValues($).updateOpened(() => id))
  /** A line of text in a Box of its own: VS Code keeps a Box's key (a Text's it drops), so each line can be found by it. */
  const line = (key: string, text: string, color: string, bold = false) => (
    <Box key={key} flexDirection="column">
      <Text wrap="wrap" bold={bold || undefined} color={C(color)}>{text}</Text>
    </Box>
  )
  const segsText = (xs: readonly LiveSeg[], tone?: string) => xs.map(s => <Text tabular color={C(tone ?? LIVE_TONE[s.tone])}>{s.text}</Text>)

  // ---- Status: Mode, Scouts, Branch and Tests, one row each (the label column is VS_LABEL_W wide)
  const nowSegs = liveNowSegs(v, running, nowMs, Infinity).slice(1)
  const driving = v.driving ?? S.driving
  const tv = testsValue(v)
  const modeTo = vsHref('mode', nextMode(mode))
  const scoutsText = nowSegs.length > 3 ? nowSegs.slice(3).map(x => x.text).join('').trim() : ''
  const scoutsTo = vsHref('tab', 'scouts')
  const status = () => [
    vsFacts(vs, 'live-status-rows', [
      {
        key: 'mode',
        label: 'Mode',
        value: [
          <Box key="live-head" flexDirection="row"><Text bold color={C(modeColor(mode))}>{nowSegs[0]?.text ?? ''}</Text></Box>,
          vsLink(vs, 'live-mode-switch', mdLink('change', modeTo), [[modeTo, switchMode]]),
        ],
      },
      {
        key: 'scouts',
        label: 'Scouts',
        value: [scoutsText ? vsLink(vs, 'live-scouts', mdLink(scoutsText, scoutsTo), [[scoutsTo, goTab('scouts')]]) : <Text key="live-scouts-none" color={C('inactive')}>none running</Text>],
      },
      {
        key: 'branch',
        label: 'Branch',
        value: [
          v.branch_note ? <Text key="b" wrap="wrap" color={C('warning')}>{v.branch_note}</Text> : <Text key="b" color={C('text')}>{v.home_branch || 'no branch'}</Text>,
          <Text key="d" color={C('inactive')}>{driving ? '· this window drives' : '· another window drives'}</Text>,
        ],
      },
      {
        key: 'tests',
        label: 'Tests',
        value: [tv.tests ? <Text key="t" wrap="wrap" color={C('text')}>{tv.tests}</Text> : <Text key="t" color={C('warning')}>no test command</Text>, <Text key="l" tabular color={C('inactive')}>{`· ${tv.limits}`}</Text>],
      },
    ]),
  ]

  // ---- Tasks: what needs you, then the lanes (or why nothing runs, and what is next)
  // T-786: the needs-you rows: the warning mark and text, the id a link that opens the task or question
  const needs = liveNeeds(v, nowMs, Infinity)
  const needRows = needs.map(n => {
    const text = segText(n.segs)
    const rest = text.slice(text.indexOf(n.id) + n.id.length).trim()
    const href = vsHref('task', n.id)
    return (
      <Box key={`live-need-row:${n.id}`} hover={{ backgroundColor: ROW_HOVER }}>
        {vsRow(vs, `live-need:${n.id}`, [
          { key: 'mark', width: 1, node: line(`live-need-mark:${n.id}`, '⚠', LIVE_TONE.warning) },
          { key: 'id', width: Math.max(4, textWidth(n.id)), node: vsLink(vs, needKey(n.id), mdLink(n.id, href), [[href, open(n.id)]]) },
          { key: 'text', node: line(`live-need-text:${n.id}`, rest, LIVE_TONE.warning) },
        ])}
      </Box>
    )
  })
  // T-1017: a running lane's third line: core's numbers line (laneLines' second line, built without the time and the kind),
  // dim, indented like line 2; the task type is its own cell at the right end, under line 2's time. The kind keeps its room;
  // it is dropped only when even "try 1/3" does not fit beside it.
  const numbersLayout = liveLayout(lanes, stations, inner - TRACK_INDENT)
  const numbersLine = (lane: LiveLane) => {
    const kindW = lane.kind ? textWidth(lane.kind) + 1 : 0
    const lineFor = (room: number) => {
      const [, second] = laneLines(lane, { ...numbersLayout, width: room + 2 }, { nowMs, frame: 0, steady: true, noTime: true, noKind: true })
      const xs = second.map(s => ({ ...s }))
      const first = xs.findIndex(s => s.text.trim())
      const ys = xs.map((s, i) => (i === first ? { ...s, text: s.text.replace(/^\s+/, '') } : s)).filter(s => s.text)
      return ys.some(s => s.text.trim()) && textWidth(segText(ys)) <= room ? ys : null
    }
    const full = inner - TRACK_INDENT
    // like core: the type goes before any numbers part does (each level is tried with the type, then without it)
    const xs = lineFor(full)
    if (!xs) return null
    const narrow = kindW ? lineFor(full - kindW) : null
    const withKind = narrow && segText(narrow) === segText(xs) ? narrow : null
    return (
      <Box key={`live-numbers:${lane.id}`} flexDirection="row" paddingLeft={TRACK_INDENT}>
        <Box key={`live-numbers-text:${lane.id}`} flexDirection="row" flexGrow={1} flexShrink={1}>
          {xs.map(s => <Text tabular wrap="truncate" color={C(LIVE_TONE[s.tone])}>{s.text}</Text>)}
        </Box>
        {withKind ? <Box key={`live-kind:${lane.id}`} flexDirection="row" justifyContent="flex-end"><Text tabular color={C('inactive')}>{lane.kind}</Text></Box> : null}
      </Box>
    )
  }
  // up to three lines per lane (see above); under them hang the waiting trains, one line each
  const head = lanes.length ? natural : null
  const laneRows = lanes.map((lane, li) => {
    const done = !!lane.done
    const track = trackSvg(lane, layout, false)
    const tShown = shown(track)
    const href = vsHref('task', lane.id)
    const time = laneRight(lane, nowMs, TIME_W)
    const when = [!done && lane.tryNo > 1 ? `try ${lane.tryNo}` : '', time].filter(Boolean).join(' · ')
    return (
      <Box key={`live-lane:${lane.id}`} flexDirection="column" hover={{ backgroundColor: ROW_HOVER }}>
        {vsRow(vs, `live-top:${lane.id}`, [
          { key: 'mark', width: 1, node: line(`live-run-mark:${lane.id}`, done ? '✓' : LIVE_RUN_MARK.trim(), done ? 'inactive' : LIVE_TONE.run, true) },
          { key: 'id', width: idW, node: vsLink(vs, laneKey(lane.id), mdLink(lane.id, href), [[href, open(lane.id)]], done) },
          {
            key: 'title',
            node: (
              <Box key={`live-title:${lane.id}`} flexDirection="row" flexGrow={1} flexShrink={1}>
                <Text wrap="truncate" color={C(done ? 'inactive' : 'text')}>{lane.title.replace(/\s+/g, ' ').trim() || NO_TITLE}</Text>
              </Box>
            ),
          },
        ])}
        <Box key={`live-line2:${lane.id}`} paddingLeft={TRACK_INDENT}>
          {vsRow(vs, `live-bottom:${lane.id}`, [
            { key: 'track', width: trackCols, node: <Svg key={`live-track:${lane.id}`} source={track.source} width={tShown.width} height={tShown.height} alt={`${lane.id} at ${layout.labels[layout.stations.indexOf(lane.station)] ?? lane.station}`} /> },
            { key: 'time', node: <Box key={`live-time:${lane.id}`} flexDirection="row" flexGrow={1} justifyContent="flex-end">{line(`live-right:${lane.id}`, when, 'inactive')}</Box> },
          ])}
        </Box>
        {numbersLine(lane)}
        {trainLists[li]!.map(r => {
          // a waiting train: one line, the id and title a link, "waits" and "+ also" dim
          if (!r.id) return <Box key={`live-more:${lane.id}`} flexDirection="column" paddingLeft={2}>{line(`live-more-text:${lane.id}`, segText(r.segs).trim(), 'inactive')}</Box>
          const name = r.segs.filter(s => s.tone === 'wait').map(s => s.text.trim()).join(' ')
          const rest = r.segs.slice(1).filter(s => s.tone === 'dim').map(s => s.text.trim()).filter(Boolean).join('  ')
          const href = vsHref('task', r.id)
          return (
            <Box key={`live-train-row:${r.id}`} paddingLeft={2 * r.depth}>
              {vsRow(vs, `live-train:${r.id}-row`, [
                { key: 'mark', width: 3, node: line(`live-train-mark:${r.id}`, '└─◇', 'inactive') },
                ...(name ? [{ key: 'id', width: idW, node: line(`live-train-id:${r.id}`, r.id, LIVE_TONE.run, true) }] : []),
                { key: 'name', node: vsLink(vs, trainKey(r.id), mdLink(name || r.id, href), [[href, open(r.id)]], true) },
                ...(rest ? [{ key: 'note', node: line(`live-train-note:${r.id}`, rest, 'inactive') }] : []),
              ])}
            </Box>
          )
        })}
      </Box>
    )
  })
  // the one station header, drawn once above the lanes, lined up with the tracks (line 2 of a lane)
  const hShown = head ? shown(head) : null
  const stationRow = head && hShown
    ? (
        <Box key="live-stations-line" paddingLeft={TRACK_INDENT}>
          {vsRow(vs, 'live-stations', [{ key: 'track', width: trackCols, node: <Svg key="live-stations-svg" source={head.source} width={hShown.width} height={hShown.height} alt={layout.labels.join(' ')} /> }])}
        </Box>
      )
    : null
  const idle = liveIdleFacts(v, nowMs)
  const backlogCount = v.tasks.filter(t => t.status === 'backlog').length
  /** The backlog's fold on the Tasks tab opens, then the Tasks tab shows. */
  const toBacklog = () => ((S.backlogOpen = true), goTab('tasks')())
  const room = Math.max(16, vsRowRoom(width) - 12)
  const idleRows = (): RenderChildren[] => {
    if (running.length) return []
    const ask = (
      <Box key="live-ask-row" flexDirection="row">
        <Button key="live-ask-lead" label={ASK_LEAD} variant="primary" onPress={act(() => askLead($))} />
      </Box>
    )
    if (idle.kind !== 'done')
      return [
        <Box key="live-idle" flexDirection="column">
          {liveIdle(v, nowMs, Infinity).map((x, i) => line(i ? `live-empty-${i}` : 'live-empty', x, 'inactive'))}
        </Box>,
        ask,
      ]
    const moreTo = vsHref('more', 'backlog')
    return [
      <Box key="live-idle" flexDirection="column" rowGap="xs">
        <Box key="live-empty" flexDirection="row" flexWrap="wrap">
          <Text bold color={C('success')}>{`✓ ${LIVE_IDLE.done}`}</Text>
          {idle.last ? <Text tabular color={C('inactive')}>{` · last merged ${idle.last.id} ${idle.last.ago} ago`}</Text> : null}
        </Box>
        {idle.next.length ? (
          <Box key="live-next" flexDirection="column">
            {line('live-next-head', LIVE_UP_NEXT, 'inactive')}
            {idle.next.map(x => {
              const href = vsHref('task', x.id)
              return (
                <Box key={`live-next-row:${x.id}`} flexDirection="row" columnGap={1} hover={{ backgroundColor: ROW_HOVER }}>
                  <Text color={C('inactive')}>{STATUS_MARK.backlog}</Text>
                  {vsLink(vs, `live-next:${x.id}`, `${monoLink(x.id, href)} ${mdText(cutEnd(x.title, room) || NO_TITLE)}`, [[href, open(x.id)]])}
                </Box>
              )
            })}
            {idle.more > 0 ? <Box key="live-backlog-more-box" flexDirection="row">{vsLink(vs, 'live-backlog-more', mdLink(`${idle.more} more in the backlog`, moreTo), [[moreTo, toBacklog]])}</Box> : null}
          </Box>
        ) : (
          line('live-empty-1', `${LIVE_IDLE.next}.`, 'inactive')
        )}
      </Box>,
      ask,
    ]
  }
  const tasks = () => [
    ...(needs.length ? [<Box key="live-needs" flexDirection="column">{needRows}</Box>] : []),
    ...idleRows(),
    ...(lanes.length ? [<Box key="live-lanes" flexDirection="column" rowGap="xs">{[stationRow, ...laneRows]}</Box>] : []),
  ]

  // ---- Today: the day's figures as label/value rows (core's liveTodayRows); Tokens in one color
  const today = () => [vsFacts(vs, 'live-today-rows', liveTodayRows(v, nowMs).map(r => ({ key: r.key, label: r.key === 'gap' ? ' ' : r.label, value: [<Text key="v" wrap="wrap">{r.key === 'gap' ? ' ' : segsText(r.segs, r.key === 'tokens' ? 'text' : undefined)}</Text>] })))]

  // T-1037: one thin dim line between each pair of shown sections (none above the first or below the last)
  const sections = [
    liveSection($, pane, 'status', LIVE_STATUS, status),
    liveSection($, pane, 'tasks', LIVE_SECTIONS.tasks, tasks, backlogCount ? `${backlogCount} backlog` : undefined),
    branchesVs($, pane, open),
    liveSection($, pane, 'today', LIVE_SECTIONS.today, today),
    orgMemLineVs($, pane, notes),
  ].filter(Boolean)
  const spaced = sections.flatMap((s, i) => (i ? [
    <Box key={`live-sep-${i}`} flexDirection="row">
      <Text wrap="truncate" color={C('inactive')}>{'─'.repeat(Math.max(1, liveInner(width)))}</Text>
    </Box>,
    s,
  ] : [s]))

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      {header('live')}
      {spaced}
      {/* T-930, T-933: the footer's Box takes the room left on a short page and puts the footer at its bottom */}
      <Box key="live-foot" flexDirection="column" flexGrow={1} justifyContent="flex-end">{vsFooter(vs, 'live-hint')}</Box>
    </Box>
  )
}

/** T-1003: Organizational memory on the Live tab is one line: the bold name, the dim count "2 / 60", and an "All notes"
 *  link (ORG_MEM_ALL_KEY) that opens the notes page. The newest notes and the topics live on that page. */
function orgMemLineVs($: $, pane: PaneParts, notes: readonly OrgMemNote[]) {
  const { Box, Text, C, vs } = pane
  const to = vsHref('page', 'orgmem')
  return (
    <Box key="live-om" flexDirection="row" columnGap={2} alignItems="center">
      <Box key="live-om-head" flexDirection="row" columnGap={1}>
        <Text bold color={C('text')}>{LIVE_SECTIONS.orgMem}</Text>
        <Text key="live-om-head-count" color={C('inactive')}>{`${notes.length} / ${ORG_MEM_MAX_LINES}`}</Text>
      </Box>
      {vsLink(vs, ORG_MEM_ALL_KEY, mdLink('All notes', to), [[to, openOrgMemPage($)]])}
    </Box>
  )
}
