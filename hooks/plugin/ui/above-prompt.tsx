// The band above the prompt: the board in one or a few lines.
import type { MatchedHook } from 'claude-code'
import { statusCounts, newestFirst, STATUS_WORD, boardBrand, boardWhere, modeLabel, modeOf, planBandText, withCrew, fileWaitText } from '../../board'
import { type $, readView, type PaneView, S } from '../state'
import { openPane } from './open'

export type AbovePromptHook = MatchedHook<'ui.render', { component: 'AbovePrompt' }>

/** The band above the prompt: the board, always in view inside Claude Code's own screen. */
export async function renderAbovePrompt($: $, e: Parameters<AbovePromptHook>[1], next: Parameters<AbovePromptHook>[2]) {
  if (e.props.hasSurvey || e.props.view.agentId) return next(e)
  const v = await readView($)
  const tasks = v?.tasks ?? []
  if (!tasks.length || (v as PaneView | undefined)?.enabled === false) return next(e)
  const { Box, Text, Button } = $.ui.resolve(e)
  const summary = statusCounts(tasks, ['doing', 'todo', 'paused', 'review', 'waiting', 'failed', 'done']).join(' · ')
  const order = ['review', 'waiting', 'failed', 'doing']
  const live = tasks.filter(t => order.includes(t.status)).sort(newestFirst)
  const rows = Math.max(1, Math.min(6, (e.props.maxRows ?? 8) - 1))
  const color: Record<string, string> = { review: 'cyan', waiting: 'yellow', failed: 'red', doing: 'green' }
  const word: Record<string, string> = STATUS_WORD
  // plan mode: nothing new starts; workers already running keep going (said so)
  const plan = (v as PaneView | undefined)?.plan_mode ? planBandText(tasks.filter(t => t.status === 'doing').length) : ''
  // the mode, the busy workers, the counts and the scouts, fitted beside the name and the "open board" button:
  // "(next: …)" goes first when short of room, then the scouts (see withCrew)
  const brand = boardBrand(S.N.name)
  const room = (e.props.bodyColumns ?? 80) - brand.length - ' open board'.length - 2
  const crew = { mode: modeOf(v), plan_mode: !!plan, max_parallel: (v as PaneView | undefined)?.max_parallel, tasks, scouts: v?.scouts ?? [] }
  const facts = withCrew((w, s) => `${boardWhere(S.root)} ${[modeLabel(modeOf(v)), w, summary, s, plan].filter(Boolean).join(' · ')} `, crew, Date.now(), room)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text wrap="truncate">
          <Text bold color={'ide' as never}>{brand}</Text>
          <Text dimColor>{facts}</Text>
        </Text>
        <Button key="open-board" label="open board" dimColor onPress={() => void openPane($)} />
      </Box>
      {live.slice(0, rows).map(t => (
        <Text wrap="truncate">
          <Text color={color[t.status] as never}>
            {t.id} {word[t.status]}
          </Text>
          <Text> {t.title}</Text>
          <Text dimColor>{fileWaitText(t) ? ` — ${fileWaitText(t)}` : t.status === 'waiting' ? ` — ${t.question ?? t.note}` : t.note ? ` — ${t.note}` : ''}</Text>
        </Text>
      ))}
      {live.length > rows && <Text dimColor>+{live.length - rows} more · /{S.N.name}</Text>}
    </Box>
  )
}
