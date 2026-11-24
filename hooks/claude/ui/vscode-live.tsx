// The board panel's Live tab in VS Code's side panel (T-691): the same lanes and today as the terminal's Live
// tab (live.tsx), all worked out in core/live.ts (liveLanes, liveLayout, laneLines, liveTrains, liveToday ...); this file
// only draws them richer.
// T-973: the tab is in sections like VS Code's side bar (the owner's pick "native sections"): each section a small bold
// UPPERCASE heading with a chevron (▾ open, ▸ folded; a press folds it, remembered while the session lasts, see
// liveFolds) and a count badge on the right where it has one; no rules and no blank lines (the page Box's gap):
//   ▾ STATUS        Mode ⏵ auto merge · agents 0/1 busy, its meaning, a quiet "Switch to …" button; Branch; Tests
//   ▾ TASKS  [17 backlog]   what needs you, then the lanes; when nothing runs why, and when all is done the last merge,
//                   "Up next from the backlog" (3 rows, then "14 more in the backlog"), and the primary "Tell the lead" button
//   ▾ BRANCHES      (T-727: core's liveBranches drawn with real lines: see branchesVs)
//   ▾ TODAY         Results, Tokens, Agent time, Per task, Hours, Yesterday, 7 days (core's liveTodayRows) as label/value rows
//   ▸ ORGANIZATIONAL MEMORY  [2 / 60]  All notes   (folded at first; open: the newest notes, one row each, and the topics)
// Each lane is:
//   ▶ T-684 /symcc-doctor…               #2      (the id and cut title a link: a click, or Enter on it, opens the task)
//   ●━━━━━●━━━━━◉─────○─────○                    (real lines and dots in an Svg, the station names under the dots)
//   change try 2/3 · ⏱ 12m · ⌀ 1.1M (0.3× median) · <worker 1.1M> · ⌕ × 1   (T-867: plain numbers, no bar)
// The current station blinks with a CSS animation inside the Svg, and stays steady when VS Code (the person's system)
// asks for reduced motion (`prefers-reduced-motion`). Each drawing's `alt` is the terminal's text for it.
// T-715: under each lane hang its waiting trains (core's liveTrains and trainRows): each one indented by its level,
// "└─◇", its id and cut title a link that opens the task, then "waits" and "+ also T-n" dim.
// T-767: a running lane's name starts with "▶" (the accent color) and is bold; a waiting train's whole row is dim.
import type { RenderChildren } from 'claude-code'
import { type BranchRow, type LiveBranches, liveBranches, liveIdle, liveIdleFacts, LIVE_AGENT_MARK, LIVE_IDLE, LIVE_RUN_MARK, liveLegend, LIVE_SECTIONS, type LiveLane, liveInner, type LiveLayout, type LiveSeg, LIVE_TONE, laneLines, liveNowSegs, liveNeeds, liveTaskLanes, liveLayout, liveOrgMem, liveColumns, liveTodayRows, liveTrains, segText, trainRows } from '../../core/live'
import { STATUS_MARK } from '../../core/details'
import { MODE_MEANING } from '../../board'
import { S } from '../../app/state'
import { panelValues, type $ } from '../panel'
import type { PaneParts } from './parts'
import { LIVE_TICK_MS, ORG_MEM_ALL_KEY, branchKey, needKey, laneKey, liveTick, newestKey, openOrgMemPage, topicKey, trainKey } from './live'
import { cutEnd, mdLink, mdText, modeColor, NO_TITLE, ROW_HOVER, switchLabel, testsValue, vsFacts, vsFooter, vsHref, vsLink, vsSectionHead } from './vscode'
import { ASK_LEAD, askLead, vsRowRoom } from './vscode-list'
import { ORG_MEM_MAX_LINES, orgMemShortDay, type OrgMemNote } from '../../core/org-mem'

/** The pixels per text column in the drawings (about one character of VS Code's panel font). */
const COL_PX = 8
/** The drawings' colors: an image can't read the theme, so hues that read on light and dark themes alike. */
const INK = { mark: '#b79cff', passed: '#3fb950', current: '#3794ff', future: '#8b949e', label: '#8b949e', warning: '#d29922', bar: '#3794ff', empty: '#8b949e' }

/** The CSS of a lane's track: the current station blinks, steady with reduced motion. */
export const BLINK_CSS = '@keyframes symcc-blink{50%{opacity:.25}}.cur{animation:symcc-blink 1s steps(1) infinite}@media (prefers-reduced-motion: reduce){.cur{animation:none}}'

/** A lane's track as an Svg document: a dot per station (passed filled green, the current one blue and blinking, future
 *  hollow grey), lines between them (bold up to the current one), the station names (layout.labels) under the dots. */
export function trackSvg(lane: Pick<LiveLane, 'at'> & Partial<Pick<LiveLane, 'done' | 'stations' | 'skipped'>>, l: LiveLayout): { source: string; width: number; height: number } {
  const step = (l.gap + 1) * COL_PX
  const r = 5
  const x0 = r + 2
  const width = x0 * 2 + step * (l.stations.length - 1) + COL_PX * 4
  const height = 30
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
    parts.push(`<text x="${x}" y="${height - 2}" text-anchor="${col ? (col === l.stations.length - 1 ? 'end' : 'middle') : 'start'}" font-family="sans-serif" font-size="10" fill="${i === lane.at ? (lane.done ? INK.passed : INK.current) : INK.label}"${i === lane.at ? ' font-weight="bold"' : ''}>${(l.labels[col] ?? '').split(LIVE_AGENT_MARK).join(`<tspan fill="${INK.mark}">${LIVE_AGENT_MARK}</tspan>`)}</text>`)
  })
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`, width, height }
}

/** T-727: the pixels from one commit's dot to the next in the Branches drawings, and each drawing's height. */
const BR_STEP = 22
const BR_H = 18

/** T-727: the Branches section's main line as an Svg: a dot per shown commit (oldest left), lines between them, and a
 *  line down from each commit a row hangs from. Every Branches drawing is as wide, so the rows' lines meet it. */
export function branchMainSvg(b: Pick<LiveBranches, 'commits' | 'rows'>): { source: string; width: number; height: number } {
  const k = b.commits.length
  const x = (i: number) => 8 + i * BR_STEP
  const width = x(k) + 8
  const y = BR_H / 2
  const parts: string[] = []
  if (k > 1) parts.push(`<line x1="${x(0)}" y1="${y}" x2="${x(k - 1)}" y2="${y}" stroke="${INK.future}" stroke-width="1.5"/>`)
  for (const c of new Set(b.rows.filter(r => r.kind !== 'more').map(r => r.col))) parts.push(`<line x1="${x(c)}" y1="${y}" x2="${x(c)}" y2="${BR_H}" stroke="${INK.future}" stroke-width="1.5"/>`)
  b.commits.forEach((c, i) => parts.push(`<circle cx="${x(i)}" cy="${y}" r="4" fill="${INK.bar}"><title>${c.sha.slice(0, 7)}</title></circle>`))
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BR_H}" viewBox="0 0 ${width} ${BR_H}">${parts.join('')}</svg>`, width, height: BR_H }
}

/** T-727: a Branches row's lines as an Svg: the lines passing by to the rows under it, its own line from the commit it
 *  hangs from (a curve, or a tee when a row under it hangs there too) to its mark: a hollow dot, or (merged in the last 10 minutes, T-794) a dim arrow. */
export function branchRowSvg(r: Pick<BranchRow, 'col' | 'lines' | 'tee' | 'kind'>, k: number): { source: string; width: number; height: number } {
  const x = (i: number) => 8 + i * BR_STEP
  const width = x(k) + 8
  const y = BR_H / 2
  const end = x(k)
  const ink = INK.future
  const parts: string[] = []
  for (const c of new Set(r.lines)) parts.push(`<line x1="${x(c)}" y1="0" x2="${x(c)}" y2="${BR_H}" stroke="${INK.future}" stroke-width="1.5"/>`)
  const at = x(r.col)
  parts.push(r.tee ? `<path d="M${at} 0 L${at} ${y} L${end - 5} ${y}" fill="none" stroke="${ink}" stroke-width="1.5"/>` : `<path d="M${at} 0 L${at} ${y - 5} Q${at} ${y} ${at + 5} ${y} L${end - 5} ${y}" fill="none" stroke="${ink}" stroke-width="1.5"/>`)
  parts.push(r.kind === 'merged' ? `<path d="M${end - 6} ${y} L${end + 2} ${y - 5} L${end + 2} ${y + 5} Z" fill="${INK.future}"/>` : `<circle cx="${end}" cy="${y}" r="4" fill="none" stroke="${INK.future}" stroke-width="1.5"${r.kind === 'new' ? ' stroke-dasharray="2 2"' : ''}/>`)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BR_H}" viewBox="0 0 ${width} ${BR_H}">${parts.join('')}</svg>`, width, height: BR_H }
}

/** T-973: the Live tab's sections in VS Code, in order, and whether each is open until the owner folds it (the
 *  Organizational memory section starts folded). */
export const LIVE_FOLD_DEFAULT = { status: true, tasks: true, branches: true, today: true, orgmem: false } as const
export type LiveFold = keyof typeof LIVE_FOLD_DEFAULT
/** T-973: the folds the owner changed on VS Code's Live tab; kept while the session lasts, not on disk. */
export const liveFolds = new Map<LiveFold, boolean>()
export const resetLiveFolds = () => liveFolds.clear()
export const liveFoldOpen = (name: LiveFold): boolean => liveFolds.get(name) ?? LIVE_FOLD_DEFAULT[name]
/** T-973: the section names on VS Code's Live tab (core's LIVE_SECTIONS, and Status). */
export const LIVE_STATUS = 'Status'
/** T-973: the line over the backlog picks when all is done. */
export const LIVE_UP_NEXT = 'Up next from the backlog'

/** T-973: one section of the Live tab in VS Code (`live-<key>`): its heading (`live-<key>-head`, a press folds or opens
 *  it, see vsSectionHead), then what it holds while open. No rules and no blank lines: the page Box's gap spaces the
 *  sections, and a section holds its rows tight. */
function liveSection($: $, pane: PaneParts, key: string, fold: LiveFold, name: string, body: () => RenderChildren[], count?: number | string, extra?: RenderChildren) {
  const { Box, vs } = pane
  const open = liveFoldOpen(fold)
  const toggle = () => (liveFolds.set(fold, !open), $.ui.invalidate('ui.render'))
  return (
    <Box key={`live-${key}`} flexDirection="column" rowGap="xs">
      {vsSectionHead(vs, `live-${key}-head`, name, open, toggle, count, extra)}
      {open ? (body() as never) : null}
    </Box>
  )
}

/** T-727: the Live tab's Branches section in VS Code: core's liveBranches drawn with real lines (an Svg per line, each
 *  one's `alt` the terminal's text), each task's id a link that opens it, its figures after it. */
function branchesVs($: $, pane: PaneParts, open: (id: string) => () => void) {
  const { Box, Text, C, v, width, nowMs, vs } = pane
  const { Svg } = vs
  const br = liveBranches(v, nowMs, width)
  if (!br) return null
  const main = branchMainSvg(br)
  const words = (xs: LiveSeg[]) => xs.map(s => <Text color={C(LIVE_TONE[s.tone])}>{s.text}</Text>)
  return liveSection($, pane, 'br', 'branches', LIVE_SECTIONS.branches, () => [
    <Box key="live-br-main" flexDirection="row" gap={1} alignItems="center">
      <Svg key="live-br-main-svg" source={main.source} width={main.width} height={main.height} alt={segText(br.main).trim()} />
      <Box key="live-br-main-text" flexDirection="column">
        <Text color={C('inactive')}>
          <Text bold color={C('text')}>{br.name}</Text>
          {br.right ? `  ${br.right}` : ''}
        </Text>
      </Box>
    </Box>,
    ...br.rows.map(r => {
      if (!r.id) return <Box key="live-br-more" flexDirection="column" paddingLeft={1}><Text color={C('inactive')}>{segText(r.label)}</Text></Box>
      const svg = branchRowSvg(r, br.commits.length)
      const href = vsHref('task', r.id)
      return (
        <Box key={`live-br-row:${r.id}`} flexDirection="row" gap={1} alignItems="center" hover={{ backgroundColor: ROW_HOVER }}>
          <Svg key={`live-br-svg:${r.id}`} source={svg.source} width={svg.width} height={svg.height} alt={segText(r.segs).trim()} />
          {vsLink(vs, branchKey(r.id), mdLink(r.id, href), [[href, open(r.id)]])}
          <Box key={`live-br-note:${r.id}`} flexDirection="column">
            <Text>{words(r.label.slice(1).map((s, i) => (i ? s : { ...s, text: s.text.trimStart() })))}</Text>
          </Box>
        </Box>
      )
    }),
  ])
}

/** A task id as markdown code (drawn in the mono face) inside a link: "[`T-5`](…)". */
const monoLink = (id: string, href: string) => `[\`${id.replace(/`/g, '')}\`](${href})`

/**
 * The Live tab in VS Code (T-973: in sections like VS Code's side bar, see the top of this file); `notes`: org-mem's
 * notes (newest first), for its Organizational memory section (T-718).
 */
export function livePageVs($: $, pane: PaneParts, notes: readonly OrgMemNote[]) {
  const { Box, Text, Button, v, width, C, act, header, nowMs, vs, goTab, mode, switchMode } = pane
  const { Svg } = vs
  // the times beside the lanes ("2m") are redrawn every tick; the blink itself is the drawing's own animation
  liveTick($)
  const frame = Math.floor(nowMs / LIVE_TICK_MS)
  // T-771: the running lanes, then the just-merged ones (dim, ✓ at "merged")
  const lanes = liveTaskLanes(v, nowMs)
  const running = lanes.filter(l => !l.done)
  // the terminal's words at its width under a heading (liveInner), so both say the same
  const inner = liveInner(width)
  const layout = liveLayout(lanes, liveColumns(lanes, v.checker === true), inner)
  const trains = liveTrains(v, nowMs, lanes)
  const open = (id: string) => act(() => panelValues($).updateOpened(() => id))
  /** A line of text in a Box of its own: VS Code keeps a Box's key (a Text's it drops), so each line can be found by it. */
  const line = (key: string, text: string, color: string, bold = false) => (
    <Box key={key} flexDirection="column">
      <Text wrap="wrap" bold={bold || undefined} color={C(color)}>{text}</Text>
    </Box>
  )
  const segsText = (xs: readonly LiveSeg[]) => xs.map(s => <Text tabular color={C(LIVE_TONE[s.tone])}>{s.text}</Text>)

  // ---- Status: the mode line (T-938's "Now:" row, with its scout mark), the branch and who drives, the tests and limits
  const nowSegs = liveNowSegs(v, running, nowMs, Infinity).slice(1)
  const driving = v.driving ?? S.driving
  const tv = testsValue(v)
  const status = () => [
    vsFacts(vs, 'live-status-rows', [
      {
        key: 'mode',
        label: 'Mode',
        value: [
          // T-770: while scouts run or one is due, their mark at the end: the names a quiet button that opens the Scouts tab
          <Box key="live-head" flexDirection="row" flexWrap="wrap" alignItems="center">
            <Text bold color={C(modeColor(mode))}>{nowSegs[0]?.text ?? ''}</Text>
            {nowSegs.length > 2 ? <Text color={C(LIVE_TONE.scouts)}>{`${nowSegs[1]!.text}${nowSegs[2]!.text} `}</Text> : null}
            {nowSegs.length > 3 ? (
              <Box key="live-scouts-box" flexDirection="row">
                <Button key="live-scouts" plain dimColor label={nowSegs.slice(3).map(x => x.text).join('').trim()} hover={{ dimColor: false }} onPress={goTab('scouts')} />
              </Box>
            ) : null}
          </Box>,
          <Text key="live-mode-meaning" wrap="wrap" color={C('inactive')}>{MODE_MEANING[mode]}</Text>,
          <Box key="live-mode-switch-box" flexDirection="row">
            <Button key="live-mode-switch" plain dimColor label={switchLabel(mode)} hover={{ dimColor: false }} onPress={switchMode} />
          </Box>,
        ],
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

  // ---- Tasks: what needs you, then the lanes (or why nothing runs, and what is next), then the key to the marks
  // T-786: the needs-you rows: the warning mark and text, the id a link that opens the task or question
  const needs = liveNeeds(v, nowMs, Infinity)
  const needRows = needs.map(n => {
    const text = segText(n.segs)
    const rest = text.slice(text.indexOf(n.id) + n.id.length).trim()
    const href = vsHref('task', n.id)
    return (
      <Box key={`live-need-row:${n.id}`} flexDirection="row" gap={1} hover={{ backgroundColor: ROW_HOVER }}>
        {line(`live-need-mark:${n.id}`, '⚠', LIVE_TONE.warning)}
        {vsLink(vs, needKey(n.id), mdLink(n.id, href), [[href, open(n.id)]])}
        {line(`live-need-text:${n.id}`, rest, LIVE_TONE.warning)}
      </Box>
    )
  })
  const isTrack = (s: LiveSeg) => s.tone === 'passed' || s.tone === 'current' || s.tone === 'future'
  const laneRows = lanes.map(lane => {
    // the terminal's two lines (steady: the drawing blinks by itself), drawn in pieces
    const [first, second] = laneLines(lane, layout, { nowMs, frame, steady: true })
    // T-767/T-777: the running lane's id (the 'run' tone, past its "▶ " mark) in the accent color, its title normal text
    // T-771: a finished lane's id and title are dim, with no mark before them
    const done = !!lane.done
    const idAt = first.findIndex(s => s.tone === 'run' && s.text !== LIVE_RUN_MARK)
    const runId = first[idAt]?.text.trim() ?? ''
    // T-850: a finished lane has a dim "✓" before its id (still the accent color), then its dim title
    const name = (done ? first.slice(idAt + 1, -1).filter(s => s.tone === 'dim') : first[idAt + 1]?.tone === 'text' ? [first[idAt + 1]!] : []).map(s => s.text.trim()).filter(Boolean).join(' ')
    const right = first[first.length - 1]?.tone === 'dim' ? first[first.length - 1]!.text.trim() : ''
    const track = trackSvg(lane, layout)
    const href = vsHref('task', lane.id)
    return (
      <Box key={`live-lane:${lane.id}`} flexDirection="column" hover={{ backgroundColor: ROW_HOVER }}>
        <Box key={`live-top:${lane.id}`} flexDirection="row" gap={2}>
          <Box key={`live-run:${lane.id}`} flexDirection="row" gap={1}>
            {done ? line(`live-done-mark:${lane.id}`, '✓', 'inactive') : null}
            {done ? (name ? line(`live-run-mark:${lane.id}`, runId, LIVE_TONE.run, true) : vsLink(vs, laneKey(lane.id), mdLink(runId || lane.id, href), [[href, open(lane.id)]], true)) : line(`live-run-mark:${lane.id}`, `${LIVE_RUN_MARK}${name ? runId : ''}`.trim(), LIVE_TONE.run, true)}
            {done ? (name ? vsLink(vs, laneKey(lane.id), mdLink(name, href), [[href, open(lane.id)]], true) : null) : vsLink(vs, laneKey(lane.id), mdLink(name || lane.id, href), [[href, open(lane.id)]])}
          </Box>
          {right ? line(`live-right:${lane.id}`, right, 'inactive') : null}
        </Box>
        <Svg key={`live-track:${lane.id}`} source={track.source} width={track.width} height={track.height} alt={`${lane.id} at ${layout.labels[layout.stations.indexOf(lane.station)] ?? lane.station}: ${segText(first.filter(isTrack))}`} />
        <Box key={`live-sub:${lane.id}`} flexDirection="row" gap={1} alignItems="center">
          {(() => {
            // the terminal's line (T-867: plain numbers, no bar), its leading spaces left out
            const parts = second.map((s, i) => ({ ...s, text: !s.text.trim() ? '  ' : i === 0 ? s.text.trimStart() : s.text })).filter((s, i, all) => s.text.trim() || (i > 0 && i < all.length - 1))
            return parts.length ? [<Text key="w0">{segsText(parts)}</Text>] : []
          })()}
        </Box>
        {trainRows(trains.lanes[lane.id] ?? [], inner).map(r => {
          // the terminal's row in pieces: the connector, the id and title (a link), then "waits" and "+ also"
          if (!r.id) return <Box key={`live-more:${lane.id}`} flexDirection="column" paddingLeft={2}>{line(`live-more-text:${lane.id}`, segText(r.segs).trim(), 'inactive')}</Box>
          const name = r.segs.filter(s => s.tone === 'wait').map(s => s.text.trim()).join(' ')
          const rest = r.segs.slice(1).filter(s => s.tone === 'dim').map(s => s.text.trim()).filter(Boolean).join('  ')
          const href = vsHref('task', r.id)
          return (
            <Box key={`live-train-row:${r.id}`} flexDirection="row" gap={1} paddingLeft={2 * r.depth}>
              {line(`live-train-mark:${r.id}`, '└─◇', 'inactive')}
              {name ? line(`live-train-id:${r.id}`, r.id, LIVE_TONE.run, true) : null}
              {vsLink(vs, trainKey(r.id), mdLink(name || r.id, href), [[href, open(r.id)]], true)}
              {rest ? line(`live-train-note:${r.id}`, rest, 'inactive') : null}
            </Box>
          )
        })}
      </Box>
    )
  })
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
            {idle.more > 0 ? (
              <Box key="live-backlog-more-box" flexDirection="row">
                <Button key="live-backlog-more" plain dimColor label={`${idle.more} more in the backlog`} hover={{ dimColor: false }} onPress={toBacklog} />
              </Box>
            ) : null}
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
    ...(lanes.length ? [<Box key="live-lanes" flexDirection="column" rowGap="sm">{laneRows}</Box>] : []),
    ...(lanes.length ? [<Box key="live-key" flexDirection="column">{line('live-legend', liveLegend(Infinity).join(' '), 'inactive')}</Box>] : []),
  ]

  // ---- Today: the day's figures as label/value rows (core's liveTodayRows)
  const today = () => [vsFacts(vs, 'live-today-rows', liveTodayRows(v, nowMs).map(r => ({ key: r.key, label: r.label, value: [<Text key="v" wrap="wrap">{segsText(r.segs)}</Text>] })))]

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      {header('live')}
      {liveSection($, pane, 'status', 'status', LIVE_STATUS, status)}
      {liveSection($, pane, 'tasks', 'tasks', LIVE_SECTIONS.tasks, tasks, backlogCount ? `${backlogCount} backlog` : undefined)}
      {branchesVs($, pane, open)}
      {liveSection($, pane, 'today', 'today', LIVE_SECTIONS.today, today)}
      {orgMemSectionVs($, pane, notes)}
      {/* T-930, T-933: the footer's Box takes the room left on a short page and puts the footer at its bottom */}
      <Box key="live-foot" flexDirection="column" flexGrow={1} justifyContent="flex-end">{vsFooter(vs, 'live-hint', { rule: false })}</Box>
    </Box>
  )
}

/** T-718/T-973: the Live tab's Organizational memory section in VS Code: folded at first; its heading's count "2 / 60"
 *  and a quiet "All notes" button (ORG_MEM_ALL_KEY, there even while folded). Open, the newest notes one row each
 *  (the day, the text cut short, a link that opens all notes with that one marked, the topic dim), then the topics as
 *  links with their counts. */
function orgMemSectionVs($: $, pane: PaneParts, notes: readonly OrgMemNote[]) {
  const { Box, Text, Button, C, width, vs } = pane
  const om = liveOrgMem(notes, width)
  const room = Math.max(16, vsRowRoom(width) - 24)
  const all = (
    <Box key="live-om-all-box" flexDirection="row">
      <Button key={ORG_MEM_ALL_KEY} plain dimColor label="All notes" hover={{ dimColor: false }} onPress={openOrgMemPage($)} />
    </Box>
  )
  return liveSection(
    $,
    pane,
    'om',
    'orgmem',
    LIVE_SECTIONS.orgMem,
    () => [
      ...(om.empty ? [<Box key="live-om-empty" flexDirection="column"><Text wrap="wrap" color={C('inactive')}>{om.empty.trim()}</Text></Box>] : []),
      ...om.newest.map(x => {
        const href = vsHref('do', `orgmem-note/${x.note.n}`)
        return (
          <Box key={`live-om-note-row:${x.note.n}`} flexDirection="row" columnGap={2} hover={{ backgroundColor: ROW_HOVER }}>
            <Text key="day" tabular color={C('inactive')}>{orgMemShortDay(x.note.date)}</Text>
            {vsLink(vs, newestKey(x.note.n), mdLink(cutEnd(x.note.text, room), href), [[href, openOrgMemPage($, null, x.note)]])}
            <Text key="topic" color={C('inactive')}>{x.note.topic}</Text>
          </Box>
        )
      }),
      ...(om.grid.length
        ? [
            <Box key="live-om-topics" flexDirection="row" flexWrap="wrap" columnGap={2} alignItems="center">
              <Text key="live-om-topics-label" color={C('inactive')}>Topics</Text>
              {om.grid.flat().map(c => {
                const href = vsHref('page', `orgmem-topic/${c.topic}`)
                return vsLink(vs, topicKey(c.topic), `${mdLink(c.topic, href)} ${c.count}`, [[href, openOrgMemPage($, c.topic)]])
              })}
            </Box>,
          ]
        : []),
    ],
    `${notes.length} / ${ORG_MEM_MAX_LINES}`,
    all,
  )
}
