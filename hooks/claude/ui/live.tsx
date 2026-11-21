// The board panel's Live tab (T-690) on the terminal (and desktop and mobile, which draw the terminal's board; VS Code
// has its own drawing of the same lanes, vscode-live.tsx): one
// lane per task in doing, then what starts next and today's numbers. All of it is worked out in core/live.ts; this
// file only draws its segments and wires the keys (↑↓ between lanes, Enter opens the task, w watches its worker).
// Claude Code doesn't say whether the person asked for reduced motion, so the current station always blinks: it
// changes between ◉ and ◎ every LIVE_TICK_MS, and while the tab is shown it is redrawn that often.
// T-687: at its bottom, just above the key hints, the "Organizational memory (n notes)" button (key m) opens the
// Organizational memory page over the tab (orgmem.tsx; VS Code's: vscode-orgmem.tsx); its Back comes back here.
import { LIVE_EMPTY, LIVE_LEGEND, type LiveSeg, type LiveTone, laneLines, liveHeader, liveKeys, liveLabelLine, liveLanes, liveLayout, liveStations, liveToday, nextUp, nextUpLine, todayLines } from '../../core/live'
import { footerRule } from '../../board'
import { S, workers } from '../../app/state'
import { type $, panelValues } from '../panel'
import type { PaneParts } from './parts'
import { arrows, row, saysArrowsMove } from './arrows'
import { ORG_MEM_KEY, orgMemButtonLabel } from '../../core/org-mem'
import { orgMemView } from '../../app/org-mem'

/** How often the Live tab is redrawn while it is shown (its blink and its times). */
export const LIVE_TICK_MS = 1000

/** The Live tab's redraws (`frame`, a count) and its redraw timer: it stops itself once a tick finds no redraw since the last one (the tab or the panel was left). */
export const live = { frame: 0, timer: null as { cancel(): void } | null, seen: -1 }

/** Stops the Live tab's redraw timer (another page is drawn). */
export function stopLiveTick() {
  live.timer?.cancel()
  live.timer = null
  live.seen = -1
}

function keepTicking($: $) {
  if (live.timer) return
  try {
    live.seen = -1
    live.timer = $.clock.every(LIVE_TICK_MS, () => {
      if (live.seen === live.frame) return stopLiveTick()
      live.seen = live.frame
      $.ui.invalidate('ui.render')
    })
  } catch {
    // no repeating timer here: it is redrawn only when something changes
    live.timer = null
  }
}

/** The key of a lane's row Button. */
export const laneKey = (id: string) => `live:${id}`

/** Notes a redraw of the Live tab and keeps its redraw timer going (the terminal's and VS Code's Live tab). */
export function liveTick($: $) {
  live.frame++
  keepTicking($)
}

/** Opens the Organizational memory page over the Live tab (its Back, resetOrgMemView, comes back to the tab). */
export function openOrgMemPage($: $) {
  return () => {
    orgMemView.open = true
    orgMemView.confirm = null
    $.ui.invalidate('ui.render')
  }
}

/** The Live tab on the terminal (and desktop and mobile); `notes`: org-mem's note count, on the button at its bottom. */
export function livePage($: $, pane: PaneParts, notes: number) {
  const { Box, Text, Button, v, width, C, act, header, keyLines, nowMs } = pane
  // the blink goes by the clock, one step per tick, so extra redraws in between don't make it flicker
  const frame = Math.floor(nowMs / LIVE_TICK_MS)
  // the key line says "↑↓ move": the arrows move between the lanes (see arrows.ts)
  arrows.move = saysArrowsMove(liveKeys())
  liveTick($)
  const lanes = liveLanes(v, nowMs)
  const layout = liveLayout(lanes, liveStations(v.checker === true), width)
  const tone: Record<LiveTone, string> = { id: 'claude', title: 'text', passed: 'success', current: 'ide', future: 'inactive', text: 'text', dim: 'inactive', warning: 'warning', bar: 'ide' }
  const draw = (xs: LiveSeg[]) => xs.map(x => <Text bold={x.tone === 'id' || x.tone === 'current'} color={C(tone[x.tone])}>{x.text}</Text>)
  const open = (id: string) => act(() => panelValues($).updateOpened(() => id))
  /** w: the worker of the lane with the focus (else the first lane with a worker), as on the task page. */
  const watch = act(async () => {
    const focused = lanes.find(l => laneKey(l.id) === arrows.focused)
    const agentOf = (id: string) => [...workers.entries()].find(([, w]) => w.task === id)?.[0]
    const target = focused ?? lanes.find(l => agentOf(l.id))
    const agentId = target && agentOf(target.id)
    if (agentId) await $.ui.view({ agentId })
    else $.ui.toast(S.N.toast(target ? `${target.id} has no worker running now.` : 'No worker is running now.'))
  })
  const today = todayLines(liveToday(v.tasks, nowMs), width)
  return (
    <Box flexDirection="column">
      {header('live')}
      <Text key="live-head" bold color={C('text')}>{liveHeader(v, lanes)}</Text>
      {lanes.length ? <Text key="live-labels" color={C('inactive')}>{liveLabelLine(layout)}</Text> : <Text key="live-empty" color={C('inactive')}>{LIVE_EMPTY}</Text>}
      {lanes.flatMap((l, i) => {
        const [first, second] = laneLines(l, layout, { nowMs, frame })
        return [
          <Button key={row(laneKey(l.id))} plain autoFocus={i === 0 ? true : undefined} onPress={open(l.id)}>
            {draw(first)}
          </Button>,
          <Text key={`live-sub:${l.id}`}>{draw(second)}</Text>,
        ]
      })}
      <Text key="live-rule" color={C('subtle')}>{footerRule(width)}</Text>
      <Text key="live-next" color={C('text')}>{nextUpLine(nextUp(v), width)}</Text>
      {today.map((line, i) => (
        <Text key={`live-today-${i}`} color={C('text')}>{line}</Text>
      ))}
      <Box key="live-keys" display="none">
        <Button key="live-watch" label="w" hotkey="w" onPress={watch} />
      </Box>
      <Button key="live-orgmem" label={`${orgMemButtonLabel(notes)} (${ORG_MEM_KEY})`} hotkey={ORG_MEM_KEY} onPress={openOrgMemPage($)} />
      <Text key="live-foot-rule" color={C('subtle')}>{footerRule(width)}</Text>
      {lanes.length ? <Text key="live-legend" color={C('inactive')}>{LIVE_LEGEND}</Text> : null}
      {keyLines(liveKeys(), 'live-hint')}
    </Box>
  )
}
