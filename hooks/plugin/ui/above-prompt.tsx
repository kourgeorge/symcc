// The band above the prompt: the board in one or a few lines.
import type { MatchedHook } from 'claude-code'
import { statusCounts, newestFirst, STATUS_WORD, boardBrand, boardWhere, modeLabel, modeOf } from '../../board'
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
  const room = Math.max(1, Math.min(6, (e.props.maxRows ?? 8) - 1))
  const color: Record<string, string> = { review: 'cyan', waiting: 'yellow', failed: 'red', doing: 'green' }
  const word: Record<string, string> = STATUS_WORD
  const running = (v?.scouts ?? []).filter(s => s.running).map(s => s.name)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text wrap="truncate">
        <Text bold color={'ide' as never}>{boardBrand(S.N.name)}</Text>
        <Text dimColor>
          {boardWhere(S.root)}{' '}
          {summary}
          {` · ${modeLabel(modeOf(v))}`}
          {running.length ? ` · scouting: ${running.join(', ')}` : ''}{' '}
        </Text>
        </Text>
        <Button key="open-board" label="open board" dimColor onPress={() => void openPane($)} />
      </Box>
      {live.slice(0, room).map(t => (
        <Text wrap="truncate">
          <Text color={color[t.status] as never}>
            {t.id} {word[t.status]}
          </Text>
          <Text> {t.title}</Text>
          <Text dimColor>{t.status === 'waiting' ? ` — ${t.question ?? t.note}` : t.note ? ` — ${t.note}` : ''}</Text>
        </Text>
      ))}
      {live.length > room && <Text dimColor>+{live.length - room} more · /{S.N.name}</Text>}
    </Box>
  )
}
