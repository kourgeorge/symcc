// The board panel's Live tab (T-690) on the terminal (and desktop and mobile, which draw the terminal's board; VS Code
// has its own drawing of the same lanes, vscode-live.tsx): one
// lane per task in doing, then what starts next and today's numbers. All of it is worked out in core/live.ts; this
// file only draws its segments and wires the keys (↑↓ between lanes, Enter opens the task, w watches its worker).
// Claude Code doesn't say whether the person asked for reduced motion, so the current station always blinks: it
// changes between ◉ and ◎ every LIVE_TICK_MS, and while the tab is shown it is redrawn that often.
// T-687, T-718: at its bottom, just above the key hints, the Organizational memory section (core's liveOrgMem): a
// header with the count and a fill bar, the 3 newest notes and the topics with their counts. Enter on a topic opens
// the Organizational memory page (orgmem.tsx; VS Code's: vscode-orgmem.tsx) filtered to it, Enter on a newest note
// opens all notes with that note focused, m opens all notes; the page's Back comes back here.
// T-715: under each lane hang its waiting trains (core's liveTrains and trainRows), each one a row Button that opens its task.
// T-727: under the lanes, the Branches section (core's liveBranches): main's latest commits and a row per open task's
// branch (commits ahead, how far behind), each task row a row Button that opens its task.
// T-747, T-789: each section (Tasks, Today, Branches, Organizational memory) starts with a bold UPPERCASE heading (core's
// liveHeading; no bar, no rule), one empty line above it (none above the first) and one under it, its lines indented by LIVE_INDENT.
import { LIVE_EMPTY, LIVE_INDENT, liveLegend, LIVE_SECTIONS, type LiveSeg, LIVE_TONE, laneLines, liveBold, liveHeading, liveIndented, liveInner, liveBranches, liveHeader, liveHeaderSegs, liveKeys, liveLabelSegs, liveNeeds, liveTaskLanes, liveLayout, liveOrgMem, liveStations, liveTodayLines, liveTrains, trainRows } from '../../core/live'
import { footerRule } from '../../board'
import { S, workers } from '../../app/state'
import { type $, panelValues } from '../panel'
import type { PaneParts } from './parts'
import { arrows, row, saysArrowsMove } from './arrows'
import { ORG_MEM_KEY, type OrgMemNote } from '../../core/org-mem'
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
/** T-786: the key of a ▍Needs you row's Button. */
export const needKey = (id: string) => `live-need:${id}`
/** The key of a waiting train's row Button (T-715). */
export const trainKey = (id: string) => `live-train:${id}`
/** The key of a Branches row's Button (T-727). */
export const branchKey = (id: string) => `live-branch:${id}`

/** Notes a redraw of the Live tab and keeps its redraw timer going (the terminal's and VS Code's Live tab). */
export function liveTick($: $) {
  live.frame++
  keepTicking($)
}

/** T-718: what the Organizational memory page shows when opened from the Live tab: one topic's notes (`topic`, null:
 *  all of them) and the note to put the focus on (`note`, null: the first). The note is kept whole, not by its number,
 *  since a delete on the page moves the numbers after it; the page finds it again with orgMemFind. Set on every open. */
export const orgMemPick = { topic: null as string | null, note: null as OrgMemNote | null }

/** The key of a newest note's row in the Live tab's org-mem section, and of a topic's cell (T-718). */
export const newestKey = (n: number) => `live-om-note:${n}`
export const topicKey = (topic: string) => `live-om-topic:${topic}`

/** Opens the Organizational memory page over the Live tab (its Back, resetOrgMemView, comes back to the tab): all
 *  notes, or (T-718) topic `topic`'s, with the focus on note `note` when given. */
export function openOrgMemPage($: $, topic: string | null = null, note: OrgMemNote | null = null) {
  return () => {
    orgMemView.open = true
    orgMemView.confirm = null
    orgMemPick.topic = topic
    orgMemPick.note = note
    $.ui.invalidate('ui.render')
  }
}

/** The Live tab on the terminal (and desktop and mobile); `notes`: org-mem's notes (newest first), for the section at its bottom. */
export function livePage($: $, pane: PaneParts, notes: readonly OrgMemNote[]) {
  const { Box, Text, Button, v, width, C, act, header, keyLines, nowMs, goTab } = pane
  // the blink goes by the clock, one step per tick, so extra redraws in between don't make it flicker
  const frame = Math.floor(nowMs / LIVE_TICK_MS)
  // the key line says "↑↓ move": the arrows move between the lanes (see arrows.ts)
  arrows.move = saysArrowsMove(liveKeys())
  liveTick($)
  // T-771: the running lanes, then the just-merged ones (dim, ✓ at "merged")
  const lanes = liveTaskLanes(v, nowMs)
  const running = lanes.filter(l => !l.done)
  const inner = liveInner(width)
  const layout = liveLayout(lanes, liveStations(v.checker === true), inner)
  const trains = liveTrains(v, nowMs, lanes)
  const draw = (xs: LiveSeg[]) => xs.map(x => <Text bold={liveBold(x.tone)} color={C(LIVE_TONE[x.tone])}>{x.text}</Text>)
  /** A line under a section heading: indented. */
  const under = (xs: LiveSeg[]) => draw(liveIndented(xs))
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
  const today = liveTodayLines(v, nowMs, inner)
  const headSegs = liveHeaderSegs(v, running, nowMs, width)
  const needs = liveNeeds(v, nowMs, inner)
  const om = liveOrgMem(notes, width)
  const br = liveBranches(v, nowMs, width)
  return (
    <Box flexDirection="column">
      {header('live')}
      {headSegs.length > 1 ? (
        // T-770: while scouts run, their mark at the end of the mode line ("⌕ gaps-bot 4m"), a plain Button that opens the Scouts tab
        <Box key="live-head" flexDirection="row">
          <Text bold color={C('text')}>{headSegs[0]!.text + headSegs[1]!.text}</Text>
          <Button key="live-scouts" plain label={headSegs.slice(2).map(x => x.text).join('')} onPress={goTab('scouts')}>
            <Text>{draw(headSegs.slice(2))}</Text>
          </Button>
        </Box>
      ) : (
        <Text key="live-head" bold color={C('text')}>{liveHeader(v, running)}</Text>
      )}
      {needs.length ? <Text key="live-needs-head">{draw(liveHeading(LIVE_SECTIONS.needs, width))}</Text> : null}
      {needs.length ? <Text key="live-needs-under"> </Text> : null}
      {needs.map((n, i) => (
        <Button key={row(needKey(n.id))} plain autoFocus={i === 0 ? true : undefined} onPress={open(n.id)}>
          {under(n.segs)}
        </Button>
      ))}
      {needs.length ? <Text key="live-needs-blank"> </Text> : null}
      <Text key="live-tasks-head">{draw(liveHeading(LIVE_SECTIONS.tasks, width))}</Text>
      <Text key="live-tasks-under"> </Text>
      {running.length ? null : <Text key="live-empty" color={C('inactive')}>{LIVE_INDENT + LIVE_EMPTY}</Text>}
      {lanes.length ? <Text key="live-labels">{under(liveLabelSegs(layout))}</Text> : null}
      {lanes.flatMap((l, i) => {
        const [first, second] = laneLines(l, layout, { nowMs, frame })
        return [
          <Button key={row(laneKey(l.id))} plain autoFocus={i === 0 && !needs.length ? true : undefined} onPress={open(l.id)}>
            {under(first)}
          </Button>,
          <Text key={`live-sub:${l.id}`}>{under(second)}</Text>,
          ...trainRows(trains.lanes[l.id] ?? [], inner).map(r =>
            r.id ? (
              <Button key={row(trainKey(r.id))} plain onPress={open(r.id)}>
                {under(r.segs)}
              </Button>
            ) : (
              <Text key={`live-more:${l.id}`}>{under(r.segs)}</Text>
            ),
          ),
        ]
      })}
      {br ? <Text key="live-br-blank"> </Text> : null}
      {br ? <Text key="live-br-head">{draw(br.head)}</Text> : null}
      {br ? <Text key="live-br-under"> </Text> : null}
      {br ? <Text key="live-br-main">{under(br.main)}</Text> : null}
      {br?.rows.map(r =>
        r.id ? (
          <Button key={row(branchKey(r.id))} plain onPress={open(r.id)}>
            {under(r.segs)}
          </Button>
        ) : (
          <Text key="live-br-more">{under(r.segs)}</Text>
        ),
      )}
      <Text key="live-today-blank"> </Text>
      <Text key="live-today-head">{draw(liveHeading(LIVE_SECTIONS.today, width))}</Text>
      <Text key="live-today-under"> </Text>
      {today.map((line, i) => (
        <Text key={`live-today-${i}`}>{under(line)}</Text>
      ))}
      <Box key="live-keys" display="none">
        <Button key="live-watch" label="w" hotkey="w" onPress={watch} />
        <Button key="live-orgmem" label={ORG_MEM_KEY} hotkey={ORG_MEM_KEY} onPress={openOrgMemPage($)} />
      </Box>
      <Text key="live-om-blank"> </Text>
      <Text key="live-om-head">{draw(om.head)}</Text>
      <Text key="live-om-under"> </Text>
      <Text key="live-om-newest" color={C('inactive')}>{LIVE_INDENT + om.newestLabel}</Text>
      {om.empty ? <Text key="live-om-empty" color={C('inactive')}>{LIVE_INDENT + om.empty}</Text> : null}
      {om.newest.map(x => (
        <Button key={row(newestKey(x.note.n))} plain onPress={openOrgMemPage($, null, x.note)}>
          {under(x.segs)}
        </Button>
      ))}
      {om.grid.length ? <Text key="live-om-topics" color={C('inactive')}>{LIVE_INDENT + om.topicsLabel}</Text> : null}
      {om.grid.map((r, i) => (
        <Box key={`live-om-row-${i}`} flexDirection="row">
          {r.map((c, j) => (
            <Button key={row(topicKey(c.topic))} plain onPress={openOrgMemPage($, c.topic)}>
              {j ? draw(c.segs) : under(c.segs)}
            </Button>
          ))}
        </Box>
      ))}
      {om.keys.map((k, i) => (
        <Text key={`live-om-keys-${i}`} color={C('inactive')}>{LIVE_INDENT + k}</Text>
      ))}
      <Text key="live-foot-rule" color={C('subtle')}>{footerRule(width)}</Text>
      {lanes.length ? liveLegend(lanes, width).map((x, i) => <Text key={i ? `live-legend-${i}` : 'live-legend'} color={C('inactive')}>{x}</Text>) : null}
      {keyLines(liveKeys(), 'live-hint')}
    </Box>
  )
}
