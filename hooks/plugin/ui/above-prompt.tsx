// The band above the prompt: the board in one or a few lines.
import type { MatchedHook } from 'claude-code'
import { statusCounts, newestFirst, bandStatus, boardBrand, boardWhere, modeLabel, modeOf, planBandText, withCrew, fileWaitText, questionsForYou } from '../../board'
import { type PaneView, S } from '../state'
import { type $, panelValues } from '../../claude/panel'
import { openPane } from './open'
import { claudeHost } from '../../claude/host'

export type AbovePromptHook = MatchedHook<'ui.render', { component: 'AbovePrompt' }>

/**
 * The band's first line: the brand ("𝄞 symcc v0.3.0 board") and the facts after it, made by `facts(room)` for the room
 * left in `columns` beside the brand and the "open board" button. The version is dropped first: it stays only when the
 * facts are as long with it as without it (nothing else had to be cut or left out for it) and the line still fits.
 */
export function bandTitle(columns: number, facts: (room: number) => string): { brand: string; facts: string } {
  const roomFor = (brand: string) => columns - brand.length - ' open board'.length - 2
  const bare = boardBrand(S.N.name, '')
  const plain = facts(roomFor(bare))
  if (!S.version) return { brand: bare, facts: plain }
  const brand = boardBrand(S.N.name, S.version)
  const room = roomFor(brand)
  const full = facts(room)
  return full === plain && full.length <= room ? { brand, facts: full } : { brand: bare, facts: plain }
}

/** The band above the prompt: the board, always in view inside Claude Code's own screen. */
export async function renderAbovePrompt($: $, e: Parameters<AbovePromptHook>[1], next: Parameters<AbovePromptHook>[2]) {
  if (e.props.hasSurvey || e.props.view.agentId) return next(e)
  const v = await panelValues($).readView()
  const tasks = v?.tasks ?? []
  // the lead's open questions for the owner (see core/questions.ts): "2 questions for you" and a row each
  const questions = (v as PaneView | undefined)?.questions ?? []
  if ((!tasks.length && !questions.length) || (v as PaneView | undefined)?.enabled === false) return next(e)
  const { Box, Text, Button } = $.ui.resolve(e)
  const summary = statusCounts(tasks, ['doing', 'todo', 'paused', 'review', 'waiting', 'failed', 'done']).join(' · ')
  const order = ['review', 'waiting', 'failed', 'doing']
  const live = tasks.filter(t => order.includes(t.status)).sort(newestFirst)
  const rows = Math.max(1, Math.min(6, (e.props.maxRows ?? 8) - 1))
  const color: Record<string, string> = { review: 'cyan', waiting: 'yellow', failed: 'red', doing: 'green' }
    // plan mode: nothing new starts; workers already running keep going (said so)
  const plan = (v as PaneView | undefined)?.plan_mode ? planBandText(tasks.filter(t => t.status === 'doing').length) : ''
  // the mode, the busy workers, the counts and the scouts, fitted beside the name and the "open board" button:
  // "(next: …)" goes first when short of room, then the scouts (see withCrew)
  const crew = { mode: modeOf(v), plan_mode: !!plan, max_parallel: (v as PaneView | undefined)?.max_parallel, tasks, scouts: v?.scouts ?? [] }
  const { brand, facts } = bandTitle(e.props.bodyColumns ?? 80, room => withCrew((w, s) => `${boardWhere(S.root)} ${[modeLabel(modeOf(v)), questionsForYou(questions.length), w, summary, s, plan].filter(Boolean).join(' · ')} `, crew, Date.now(), room))
  // the questions take the first rows, then the tasks that need you or run
  const asks = questions.slice(0, rows)
  const taskRows = Math.max(0, rows - asks.length)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text wrap="truncate">
          <Text bold color={'ide' as never}>{brand}</Text>
          <Text color={'inactive' as never}>{facts}</Text>
        </Text>
        <Button key="open-board" label="open board" dimColor onPress={() => void openPane(claudeHost($))} />
      </Box>
      {asks.map(q => (
        <Text wrap="truncate">
          <Text color={'yellow' as never}>{`${q.id} for you`}</Text>
          <Text> {q.text}</Text>
          <Text color={'inactive' as never}>{` — ${q.options.join(' | ')}`}</Text>
        </Text>
      ))}
      {live.slice(0, taskRows).map(t => (
        <Text wrap="truncate">
          <Text color={color[t.status] as never}>
            {bandStatus(t)}
          </Text>
          <Text> {t.title}</Text>
          <Text color={'inactive' as never}>{fileWaitText(t) ? ` — ${fileWaitText(t)}` : t.status === 'waiting' ? ` — ${t.question ?? t.note}` : t.note ? ` — ${t.note}` : ''}</Text>
        </Text>
      ))}
      {live.length + questions.length > rows && <Text color={'inactive' as never}>+{live.length + questions.length - rows} more · /{S.N.name}</Text>}
    </Box>
  )
}
