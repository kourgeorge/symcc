// The board panel's Live tab in VS Code's side panel (T-691): the same lanes and today as the terminal's Live
// tab (live.tsx), all worked out in core/live.ts (liveLanes, liveLayout, laneLines, liveTrains, liveToday ...); this file
// only draws them richer. Each lane is:
//   ▶ T-684 /symcc-doctor…               #2      (the id and cut title a link: a click, or Enter on it, opens the task)
//   ●━━━━━●━━━━━◉─────○─────○                    (real lines and dots in an Svg, the station names under the dots)
//   change try 2/3  [██████░░░░] 1.1M  ↺×1      (the token bar an Svg bar that fills)
// The current station blinks with a CSS animation inside the Svg, and stays steady when VS Code (the person's system)
// asks for reduced motion (`prefers-reduced-motion`). Each drawing's `alt` is the terminal's text for it.
// T-687, T-718: at its bottom, above the footer, the Organizational memory section (core's liveOrgMem): its title a link
// to all notes, the count and an Svg fill bar (one calm color); the 3 newest notes (day, topic, the text a
// link that opens all notes with that one marked); the topics as links with their counts, in core's grid rows.
// T-715: under each lane hang its waiting trains (core's liveTrains and trainRows): each one indented by its level,
// "└─◇", its id and cut title a link that opens the task, then "waits" and "+ also T-n" dim.
// T-767: a running lane's name starts with "▶" (the accent color) and is bold; a waiting train's whole row is dim.
// T-727: under the lanes, the Branches section (core's liveBranches) drawn with real lines: see branchesVs.
// T-747: each section has a bold heading with the terminal's names (core's LIVE_SECTIONS): Tasks, Today, Branches,
// Organizational memory (that one a link to all notes).
import { type BranchRow, type LiveBranches, liveBranches, LIVE_EMPTY, LIVE_AGENT_MARK, LIVE_RUN_MARK, liveLegend, LIVE_SECTIONS, type LiveLane, liveInner, type LiveLayout, type LiveSeg, LIVE_TONE, laneLines, liveHeader, liveHeaderSegs, liveTaskLanes, liveLayout, liveOrgMem, liveStations, liveTodayLines, liveTrains, segText, trainRows } from '../../core/live'
import { panelValues, type $ } from '../panel'
import type { PaneParts } from './parts'
import { LIVE_TICK_MS, branchKey, laneKey, liveTick, newestKey, openOrgMemPage, topicKey, trainKey } from './live'
import { mdLink, vsFooter, vsHref, vsLink } from './vscode'
import { ORG_MEM_MAX_LINES, orgMemCount, orgMemShortDay, type OrgMemNote } from '../../core/org-mem'

/** The pixels per text column in the drawings (about one character of VS Code's panel font). */
const COL_PX = 8
/** The drawings' colors: an image can't read the theme, so hues that read on light and dark themes alike. */
const INK = { mark: '#b79cff', passed: '#3fb950', current: '#3794ff', future: '#8b949e', label: '#8b949e', warning: '#d29922', bar: '#3794ff', empty: '#8b949e' }

/** The CSS of a lane's track: the current station blinks, steady with reduced motion. */
export const BLINK_CSS = '@keyframes symcc-blink{50%{opacity:.25}}.cur{animation:symcc-blink 1s steps(1) infinite}@media (prefers-reduced-motion: reduce){.cur{animation:none}}'

/** A lane's track as an Svg document: a dot per station (passed filled green, the current one blue and blinking, future
 *  hollow grey), lines between them (bold up to the current one), the station names (layout.labels) under the dots. */
export function trackSvg(lane: Pick<LiveLane, 'at'> & Partial<Pick<LiveLane, 'done'>>, l: LiveLayout): { source: string; width: number; height: number } {
  const step = (l.gap + 1) * COL_PX
  const r = 5
  const x0 = r + 2
  const width = x0 * 2 + step * (l.stations.length - 1) + COL_PX * 4
  const height = 30
  const y = 9
  const parts: string[] = [`<style>${BLINK_CSS}</style>`]
  l.stations.forEach((_, i) => {
    const x = x0 + i * step
    if (i) parts.push(i <= lane.at ? `<line x1="${x - step + r}" y1="${y}" x2="${x - r}" y2="${y}" stroke="${INK.passed}" stroke-width="3"/>` : `<line x1="${x - step + r}" y1="${y}" x2="${x - r}" y2="${y}" stroke="${INK.future}" stroke-width="1.5"/>`)
    if (i < lane.at) parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${INK.passed}"/>`)
    // T-771: a finished lane: a green ✓ at its last station, nothing blinks
    else if (i === lane.at && lane.done) parts.push(`<path d="M${x - r} ${y} L${x - 1} ${y + r - 1} L${x + r + 1} ${y - r}" fill="none" stroke="${INK.passed}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`)
    else if (i === lane.at) parts.push(`<circle class="cur" cx="${x}" cy="${y}" r="${r + 1}" fill="${INK.current}" stroke="${INK.current}" stroke-width="2" fill-opacity=".85"/>`)
    else parts.push(`<circle cx="${x}" cy="${y}" r="${r - 1}" fill="none" stroke="${INK.future}" stroke-width="1.5"/>`)
    parts.push(`<text x="${x}" y="${height - 2}" text-anchor="${i ? (i === l.stations.length - 1 ? 'end' : 'middle') : 'start'}" font-family="sans-serif" font-size="10" fill="${i === lane.at ? (lane.done ? INK.passed : INK.current) : INK.label}"${i === lane.at ? ' font-weight="bold"' : ''}>${(l.labels[i] ?? '').split(LIVE_AGENT_MARK).join(`<tspan fill="${INK.mark}">${LIVE_AGENT_MARK}</tspan>`)}</text>`)
  })
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`, width, height }
}

/** A token bar (core's "▕████░░░░▏" text) as an Svg bar filled as far as the text's blocks are. */
export function barSvg(text: string, warning: boolean): { source: string; width: number; height: number } {
  const full = [...text].filter(c => c === '█').length
  const cells = full + [...text].filter(c => c === '░').length
  const width = Math.max(4, cells) * COL_PX
  const height = 10
  const fill = cells ? Math.round((full / cells) * width) : 0
  const ink = warning ? INK.warning : INK.bar
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="3" fill="none" stroke="${INK.empty}"/><rect x="0" y="0" width="${fill}" height="${height}" rx="3" fill="${ink}"/></svg>`,
    width,
    height,
  }
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
 *  hangs from (a curve, or a tee when a row under it hangs there too) to its mark: a hollow dot, or (just merged) an arrow. */
export function branchRowSvg(r: Pick<BranchRow, 'col' | 'lines' | 'tee' | 'kind'>, k: number): { source: string; width: number; height: number } {
  const x = (i: number) => 8 + i * BR_STEP
  const width = x(k) + 8
  const y = BR_H / 2
  const end = x(k)
  const ink = r.kind === 'merged' ? INK.passed : INK.future
  const parts: string[] = []
  for (const c of new Set(r.lines)) parts.push(`<line x1="${x(c)}" y1="0" x2="${x(c)}" y2="${BR_H}" stroke="${INK.future}" stroke-width="1.5"/>`)
  const at = x(r.col)
  parts.push(r.tee ? `<path d="M${at} 0 L${at} ${y} L${end - 5} ${y}" fill="none" stroke="${ink}" stroke-width="1.5"/>` : `<path d="M${at} 0 L${at} ${y - 5} Q${at} ${y} ${at + 5} ${y} L${end - 5} ${y}" fill="none" stroke="${ink}" stroke-width="1.5"/>`)
  parts.push(r.kind === 'merged' ? `<path d="M${end - 6} ${y} L${end + 2} ${y - 5} L${end + 2} ${y + 5} Z" fill="${INK.passed}"/>` : `<circle cx="${end}" cy="${y}" r="4" fill="none" stroke="${INK.future}" stroke-width="1.5"${r.kind === 'new' ? ' stroke-dasharray="2 2"' : ''}/>`)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BR_H}" viewBox="0 0 ${width} ${BR_H}">${parts.join('')}</svg>`, width, height: BR_H }
}

/** T-727: the Live tab's Branches section in VS Code: core's liveBranches drawn with real lines (an Svg per line, each
 *  one's `alt` the terminal's text), each task's id a link that opens it, its figures after it. */
function branchesVs(pane: PaneParts, open: (id: string) => () => void) {
  const { Box, Text, C, v, width, nowMs, vs } = pane
  const { Svg } = vs
  const br = liveBranches(v, nowMs, width)
  if (!br) return null
  const main = branchMainSvg(br)
  const words = (xs: LiveSeg[]) => xs.map(s => <Text color={C(LIVE_TONE[s.tone])}>{s.text}</Text>)
  return (
    <Box key="live-br" flexDirection="column">
      <Box key="live-br-head" flexDirection="column">
        <Text bold color={C('text')}>{LIVE_SECTIONS.branches}</Text>
      </Box>
      <Box key="live-br-main" flexDirection="row" gap={1} alignItems="center">
        <Svg key="live-br-main-svg" source={main.source} width={main.width} height={main.height} alt={segText(br.main).trim()} />
        <Box key="live-br-main-text" flexDirection="column">
          <Text color={C('inactive')}>
            <Text bold color={C('text')}>{br.name}</Text>
            {br.right ? `  ${br.right}` : ''}
          </Text>
        </Box>
      </Box>
      {br.rows.map(r => {
        if (!r.id) return <Box key="live-br-more" flexDirection="column" paddingLeft={1}><Text color={C('inactive')}>{segText(r.label)}</Text></Box>
        const svg = branchRowSvg(r, br.commits.length)
        const href = vsHref('task', r.id)
        return (
          <Box key={`live-br-row:${r.id}`} flexDirection="row" gap={1} alignItems="center">
            <Svg key={`live-br-svg:${r.id}`} source={svg.source} width={svg.width} height={svg.height} alt={segText(r.segs).trim()} />
            {vsLink(vs, branchKey(r.id), mdLink(r.id, href), [[href, open(r.id)]])}
            <Box key={`live-br-note:${r.id}`} flexDirection="column">
              <Text>{words(r.label.slice(1).map((s, i) => (i ? s : { ...s, text: s.text.trimStart() })))}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** The Live tab in VS Code; `notes`: org-mem's notes (newest first), for the section at its bottom (T-718). */
export function livePageVs($: $, pane: PaneParts, notes: readonly OrgMemNote[]) {
  const { Box, Text, v, width, C, act, header, nowMs, vs, goTab } = pane
  const { Svg } = vs
  // the times beside the lanes ("2m") are redrawn every tick; the blink itself is the drawing's own animation
  liveTick($)
  const frame = Math.floor(nowMs / LIVE_TICK_MS)
  // T-771: the running lanes, then the just-merged ones (dim, ✓ at "merged")
  const lanes = liveTaskLanes(v, nowMs)
  const running = lanes.filter(l => !l.done)
  // the terminal's words at its width under a heading (liveInner), so both say the same
  const inner = liveInner(width)
  const layout = liveLayout(lanes, liveStations(v.checker === true), inner)
  const trains = liveTrains(v, nowMs, lanes)
  const open = (id: string) => act(() => panelValues($).updateOpened(() => id))
  /** A line of text in a Box of its own: VS Code keeps a Box's key (a Text's it drops), so each line can be found by it. */
  const line = (key: string, text: string, color: string, bold = false) => (
    <Box key={key} flexDirection="column">
      <Text wrap="wrap" bold={bold || undefined} color={C(color)}>{text}</Text>
    </Box>
  )
  const headSegs = liveHeaderSegs(v, running, nowMs, width)
  const isTrack = (s: LiveSeg) => s.tone === 'passed' || s.tone === 'current' || s.tone === 'future'
  const laneRows = lanes.map(lane => {
    // the terminal's two lines (steady: the drawing blinks by itself), drawn in pieces
    const [first, second] = laneLines(lane, layout, { nowMs, frame, steady: true })
    // T-767/T-777: the running lane's id (the 'run' tone, past its "▶ " mark) in the accent color, its title normal text
    // T-771: a finished lane's id and title are dim, with no mark before them
    const done = !!lane.done
    const idAt = first.findIndex(s => s.tone === 'run' && s.text !== LIVE_RUN_MARK)
    const runId = done ? '' : (first[idAt]?.text.trim() ?? '')
    const name = (done ? first.filter(s => s.tone === 'dim' && s !== first[first.length - 1]) : first[idAt + 1]?.tone === 'text' ? [first[idAt + 1]!] : []).map(s => s.text.trim()).filter(Boolean).join(' ')
    const right = first[first.length - 1]?.tone === 'dim' ? first[first.length - 1]!.text.trim() : ''
    const track = trackSvg(lane, layout)
    const href = vsHref('task', lane.id)
    return (
      <Box key={`live-lane:${lane.id}`} flexDirection="column">
        <Box key={`live-top:${lane.id}`} flexDirection="row" gap={2}>
          <Box key={`live-run:${lane.id}`} flexDirection="row" gap={1}>
            {done ? null : line(`live-run-mark:${lane.id}`, `${LIVE_RUN_MARK}${name ? runId : ''}`.trim(), LIVE_TONE.run, true)}
            {done ? vsLink(vs, laneKey(lane.id), mdLink(name, href), [[href, open(lane.id)]], true) : vsLink(vs, laneKey(lane.id), mdLink(name || lane.id, href), [[href, open(lane.id)]])}
          </Box>
          {right ? line(`live-right:${lane.id}`, right, 'inactive') : null}
        </Box>
        <Svg key={`live-track:${lane.id}`} source={track.source} width={track.width} height={track.height} alt={`${lane.id} at ${layout.labels[lane.at] ?? lane.station}: ${segText(first.filter(isTrack))}`} />
        <Box key={`live-sub:${lane.id}`} flexDirection="row" gap={1} alignItems="center">
          {(() => {
            // the terminal's line, its lead and the padding that lines it up under the track left out; the bar (if any) drawn
            const at = second.findIndex(s => s.text.startsWith('▕'))
            const words = (xs: LiveSeg[], key: string) => {
              const parts = xs.map((s, i) => ({ ...s, text: !s.text.trim() ? '  ' : i === 0 ? s.text.trimStart() : s.text })).filter((s, i, all) => s.text.trim() || (i > 0 && i < all.length - 1))
              return parts.length ? <Text key={key}>{parts.map(s => <Text color={C(LIVE_TONE[s.tone])}>{s.text}</Text>)}</Text> : null
            }
            if (at < 0) return [words(second, 'w0')]
            const barSeg = second[at]!
            const bar = barSvg(barSeg.text, barSeg.tone === 'warning')
            return [
              words(second.slice(0, at), 'w0'),
              <Svg key={`live-bar:${lane.id}`} source={bar.source} width={bar.width} height={bar.height} alt={barSeg.text.trim()} />,
              words(second.slice(at + 1), 'w1'),
            ]
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
              {vsLink(vs, trainKey(r.id), mdLink(name, href), [[href, open(r.id)]], true)}
              {rest ? line(`live-train-note:${r.id}`, rest, 'inactive') : null}
            </Box>
          )
        })}
      </Box>
    )
  })
  return (
    <Box flexDirection="column" gap={1}>
      {header('live')}
      {headSegs.length > 1 ? (
        // T-770: while scouts run, their mark at the end of the mode line ("⌕ gaps-bot 4m"): the mark in the scout
        // color, the names a dim link that opens the Scouts tab
        <Box key="live-head" flexDirection="row" flexWrap="wrap">
          <Text bold color={C('text')}>{headSegs[0]!.text + headSegs[1]!.text}</Text>
          <Text color={C(LIVE_TONE.scouts)}>{headSegs[2]!.text + ' '}</Text>
          {vsLink(vs, 'live-scouts', mdLink(headSegs[3]!.text.trim(), vsHref('tab', 'scouts')), [[vsHref('tab', 'scouts'), goTab('scouts')]], true)}
        </Box>
      ) : (
        line('live-head', liveHeader(v, running), 'text', true)
      )}
      <Box key="live-tasks" flexDirection="column">
        {line('live-tasks-head', LIVE_SECTIONS.tasks, 'text', true)}
        {running.length ? null : line('live-empty', LIVE_EMPTY, 'inactive')}
        {lanes.length ? <Box key="live-lanes" flexDirection="column" gap={1}>{laneRows}</Box> : null}
      </Box>
      {lanes.length ? line('live-legend', liveLegend(lanes, Infinity).join(' '), 'inactive') : null}
      <Box key="live-bottom" flexDirection="column">
        {line('live-today-head', LIVE_SECTIONS.today, 'text', true)}
        {liveTodayLines(v, nowMs, inner).map((x, i) => (
          <Box key={`live-today-${i}`} flexDirection="column">
            <Text wrap="wrap">{x.map(s => <Text color={C(LIVE_TONE[s.tone])}>{s.text}</Text>)}</Text>
          </Box>
        ))}
      </Box>
      {branchesVs(pane, open)}
      {orgMemSectionVs($, pane, notes)}
      {vsFooter(vs, 'live-hint')}
    </Box>
  )
}

/** T-718: the Live tab's Organizational memory section in VS Code (see the top of this file). */
function orgMemSectionVs($: $, pane: PaneParts, notes: readonly OrgMemNote[]) {
  const { Box, Text, C, width, vs } = pane
  const { Svg } = vs
  const om = liveOrgMem(notes, width)
  const all = vsHref('page', 'orgmem')
  // T-772: one calm look at every fill (dim count, the quiet bar ink), never the warning color
  const full = Math.max(0, Math.min(10, Math.round((notes.length / ORG_MEM_MAX_LINES) * 10)))
  const bar = barSvg(`▕${'█'.repeat(full)}${'░'.repeat(10 - full)}▏`, false)
  const label = (key: string, text: string) => (
    <Text key={key} color={C('inactive')}>
      {text.trim()}
    </Text>
  )
  return (
    <Box key="live-om" flexDirection="column">
      <Box key="live-om-head" flexDirection="row" gap={1} alignItems="center">
        {vsLink(vs, 'live-orgmem', `**${mdLink(LIVE_SECTIONS.orgMem, all)}**`, [[all, openOrgMemPage($)]])}
        <Text key="live-om-count" color={C('inactive')}>{`${notes.length} / ${ORG_MEM_MAX_LINES}`}</Text>
        <Svg key="live-om-bar" source={bar.source} width={bar.width} height={bar.height} alt={`${orgMemCount(notes.length)} of at most ${ORG_MEM_MAX_LINES}`} />
      </Box>
      {label('live-om-newest', om.newestLabel)}
      {om.empty ? label('live-om-empty', om.empty) : null}
      {om.newest.map(x => {
        const href = vsHref('do', `orgmem-note/${x.note.n}`)
        const text = x.segs[x.segs.length - 1]!.text.trim()
        return (
          <Box key={`live-om-note-row:${x.note.n}`} flexDirection="row" gap={2} paddingLeft={1}>
            <Text key="day" color={C('inactive')}>{orgMemShortDay(x.note.date)}</Text>
            <Text key="topic" bold color={C('claude')}>{x.segs[2]!.text.trim()}</Text>
            {vsLink(vs, newestKey(x.note.n), mdLink(text, href), [[href, openOrgMemPage($, null, x.note)]])}
          </Box>
        )
      })}
      {om.grid.length ? label('live-om-topics', om.topicsLabel) : null}
      {om.grid.map((r, i) => (
        <Box key={`live-om-row-${i}`} flexDirection="row" gap={3} paddingLeft={1}>
          {r.map(c => {
            const href = vsHref('page', `orgmem-topic/${c.topic}`)
            return vsLink(vs, topicKey(c.topic), `${mdLink(c.topic, href)} ${c.count}`, [[href, openOrgMemPage($, c.topic)]])
          })}
        </Box>
      ))}
    </Box>
  )
}
