// T-768: /<name>-stats's row in Claude Code's chat, drawn from the report's figures (claude/stats-lines.ts) in colors,
// in place of its plain text. The text stays what the row keeps; the engine draws it as it is when the figures are not
// known (a text made before the plugin was loaded again), for "full", and when it refuses this tree.
import type { MatchedHook } from 'claude-code'
import { statsDataOf } from '../../core/stats-text'
import { S } from '../../app/state'
import { statsLines } from '../stats-lines'
import type { $ } from '../panel'

export type CommandOutputHook = MatchedHook<'ui.render', { component: 'CommandOutput' }>

/** The widest the drawn stats get, whatever the screen's width. */
export const STATS_VIEW_MAX = 100

/** The columns the stats are drawn in: the transcript's width less a little room for the row's own margin, at most STATS_VIEW_MAX. */
export const statsViewWidth = (columns: number | undefined) => Math.max(20, Math.min(STATS_VIEW_MAX, (typeof columns === 'number' && columns > 0 ? columns : 80) - 2))

/** The /<name>-stats row: its lines as Text, every run in its color; any other command's row is left to the engine. */
export async function renderStatsOutput($: $, e: Parameters<CommandOutputHook>[1], next: Parameters<CommandOutputHook>[2]) {
  if (e.props.command !== `${S.N.name}-stats` || e.props.isErrored) return next(e)
  const d = statsDataOf(e.props.text)
  if (!d || d.full) return next(e)
  const { Box, Text } = $.ui.resolve(e)
  const lines = statsLines(d, statsViewWidth(e.viewport?.columns))
  return (
    <Box key="stats" flexDirection="column">
      {lines.map(l => (
        <Text key={l.key} wrap="truncate" mono>
          {l.segs.map((s, i) => (
            <Text key={`${l.key}:${i}`} color={s.color as never} bold={s.bold || undefined} dimColor={s.dim || undefined}>
              {s.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}
