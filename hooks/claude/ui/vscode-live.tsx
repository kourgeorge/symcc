// The board panel's Live tab in VS Code's side panel (T-691): the same lanes, next up and today as the terminal's Live
// tab (live.tsx), all worked out in core/live.ts (liveLanes, liveLayout, laneLines, nextUp, liveToday ...); this file
// only draws them richer. Each lane is:
//   T-684 /symcc-doctor…                 #2      (the id and cut title a link: a click, or Enter on it, opens the task)
//   ●━━━━━●━━━━━◉─────○─────○                    (real lines and dots in an Svg, the station names under the dots)
//   change try 2/3  [██████░░░░] 1.1M  ↺×1      (the token bar an Svg bar that fills)
// The current station blinks with a CSS animation inside the Svg, and stays steady when VS Code (the person's system)
// asks for reduced motion (`prefers-reduced-motion`). Each drawing's `alt` is the terminal's text for it.
import { LIVE_EMPTY, LIVE_LEGEND, type LiveLane, type LiveLayout, type LiveSeg, type LiveTone, laneLines, liveHeader, liveLanes, liveLayout, liveStations, liveToday, nextUp, nextUpLine, segText, todayLines } from '../../core/live'
import { panelValues, type $ } from '../panel'
import type { PaneParts } from './parts'
import { LIVE_TICK_MS, laneKey, liveTick } from './live'
import { mdLink, vsFooter, vsHref, vsLink } from './vscode'

/** The pixels per text column in the drawings (about one character of VS Code's panel font). */
const COL_PX = 8
/** The drawings' colors: an image can't read the theme, so hues that read on light and dark themes alike. */
const INK = { passed: '#3fb950', current: '#3794ff', future: '#8b949e', label: '#8b949e', warning: '#d29922', bar: '#3794ff', empty: '#8b949e' }

/** The CSS of a lane's track: the current station blinks, steady with reduced motion. */
export const BLINK_CSS = '@keyframes symcc-blink{50%{opacity:.25}}.cur{animation:symcc-blink 1s steps(1) infinite}@media (prefers-reduced-motion: reduce){.cur{animation:none}}'

/** A lane's track as an Svg document: a dot per station (passed filled green, the current one blue and blinking, future
 *  hollow grey), lines between them (bold up to the current one), the station names (layout.labels) under the dots. */
export function trackSvg(lane: Pick<LiveLane, 'at'>, l: LiveLayout): { source: string; width: number; height: number } {
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
    else if (i === lane.at) parts.push(`<circle class="cur" cx="${x}" cy="${y}" r="${r + 1}" fill="${INK.current}" stroke="${INK.current}" stroke-width="2" fill-opacity=".85"/>`)
    else parts.push(`<circle cx="${x}" cy="${y}" r="${r - 1}" fill="none" stroke="${INK.future}" stroke-width="1.5"/>`)
    parts.push(`<text x="${x}" y="${height - 2}" text-anchor="${i ? (i === l.stations.length - 1 ? 'end' : 'middle') : 'start'}" font-family="sans-serif" font-size="10" fill="${i === lane.at ? INK.current : INK.label}"${i === lane.at ? ' font-weight="bold"' : ''}>${l.labels[i] ?? ''}</text>`)
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

/** The Live tab in VS Code. */
export function livePageVs($: $, pane: PaneParts) {
  const { Box, Text, v, width, C, act, banner, tabs, nowMs, vs } = pane
  const { Svg } = vs
  // the times beside the lanes ("2m") are redrawn every tick; the blink itself is the drawing's own animation
  liveTick($)
  const frame = Math.floor(nowMs / LIVE_TICK_MS)
  const lanes = liveLanes(v, nowMs)
  const layout = liveLayout(lanes, liveStations(v.checker === true), width)
  const tone: Record<LiveTone, string> = { id: 'claude', title: 'text', passed: 'success', current: 'ide', future: 'inactive', text: 'text', dim: 'inactive', warning: 'warning', bar: 'ide' }
  const open = (id: string) => act(() => panelValues($).updateOpened(() => id))
  /** A line of text in a Box of its own: VS Code keeps a Box's key (a Text's it drops), so each line can be found by it. */
  const line = (key: string, text: string, color: string, bold = false) => (
    <Box key={key} flexDirection="column">
      <Text wrap="wrap" bold={bold || undefined} color={C(color)}>{text}</Text>
    </Box>
  )
  const isTrack = (s: LiveSeg) => s.tone === 'passed' || s.tone === 'current' || s.tone === 'future'
  const laneRows = lanes.map(lane => {
    // the terminal's two lines (steady: the drawing blinks by itself), drawn in pieces
    const [first, second] = laneLines(lane, layout, { nowMs, frame, steady: true })
    const name = first.filter(s => s.tone === 'id' || s.tone === 'title').map(s => s.text.trim()).filter(Boolean).join(' ')
    const right = first[first.length - 1]?.tone === 'dim' ? first[first.length - 1]!.text.trim() : ''
    const track = trackSvg(lane, layout)
    const href = vsHref('task', lane.id)
    return (
      <Box key={`live-lane:${lane.id}`} flexDirection="column">
        <Box key={`live-top:${lane.id}`} flexDirection="row" gap={2}>
          {vsLink(vs, laneKey(lane.id), mdLink(name, href), [[href, open(lane.id)]])}
          {right ? line(`live-right:${lane.id}`, right, 'inactive') : null}
        </Box>
        <Svg key={`live-track:${lane.id}`} source={track.source} width={track.width} height={track.height} alt={`${lane.id} at ${layout.labels[lane.at] ?? lane.station}: ${segText(first.filter(isTrack))}`} />
        <Box key={`live-sub:${lane.id}`} flexDirection="row" gap={1} alignItems="center">
          {(() => {
            // the terminal's line, its lead and the padding that lines it up under the track left out; the bar (if any) drawn
            const at = second.findIndex(s => s.text.startsWith('▕'))
            const words = (xs: LiveSeg[], key: string) => {
              const parts = xs.map((s, i) => ({ ...s, text: !s.text.trim() ? '  ' : i === 0 ? s.text.trimStart() : s.text })).filter((s, i, all) => s.text.trim() || (i > 0 && i < all.length - 1))
              return parts.length ? <Text key={key}>{parts.map(s => <Text color={C(tone[s.tone])}>{s.text}</Text>)}</Text> : null
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
      </Box>
    )
  })
  return (
    <Box flexDirection="column" gap={1}>
      <Box key="vs-header" flexDirection="column">
        {[...banner(), tabs()]}
      </Box>
      {line('live-head', liveHeader(v, lanes), 'text', true)}
      {lanes.length ? <Box key="live-lanes" flexDirection="column" gap={1}>{laneRows}</Box> : line('live-empty', LIVE_EMPTY, 'inactive')}
      {lanes.length ? line('live-legend', LIVE_LEGEND, 'inactive') : null}
      <Box key="live-bottom" flexDirection="column">
        {line('live-next', nextUpLine(nextUp(v), width), 'text')}
        {todayLines(liveToday(v.tasks, nowMs), width).map((x, i) => line(`live-today-${i}`, x, 'text'))}
      </Box>
      {vsFooter(vs, 'live-hint')}
    </Box>
  )
}
