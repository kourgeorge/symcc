// The band above the prompt: the board in one or a few lines.
import { drawNow } from './now'
import type { MatchedHook } from 'claude-code'
import { statusCounts, newestFirst, bandLeads, bandNote, bandBrand, bandWhere, modeLabel, modeOf, planBandText, withCrew, fileWaitText, questionsForYou, waitsForYou } from '../../board'
import { type PaneView, S } from '../../app/state'
import { type $, panelValues } from '../panel'
import { openPane } from '../../app/open'
import { claudeHost } from '../host'

export type AbovePromptHook = MatchedHook<'ui.render', { component: 'AbovePrompt' }>

/**
 * The band's first line: the brand ("𝄞 symcc", no version, see bandBrand) and the facts after it, made by `facts(room)`
 * for the room left in `columns` beside the brand and the "open board" button.
 */
export function bandTitle(columns: number, facts: (room: number) => string): { brand: string; facts: string } {
  const brand = bandBrand(S.N.name)
  return { brand, facts: facts(columns - brand.length - ' open board'.length - 2) }
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
  const nowMs = await drawNow($)
  const crew = { mode: modeOf(v), plan_mode: !!plan, max_parallel: (v as PaneView | undefined)?.max_parallel, tasks, scouts: v?.scouts ?? [] }
  const { brand, facts } = bandTitle(e.props.bodyColumns ?? 80, room => withCrew((w, s) => `${bandWhere(S.root, S.N.name)} ${[modeLabel(modeOf(v)), questionsForYou(questions.length), w, summary, s, plan].filter(Boolean).join(' · ')} `, crew, nowMs, room))
  // the questions take the first rows, then the tasks that need you or run
  const asks = questions.slice(0, rows)
  const taskRows = Math.max(0, rows - asks.length)
  // each row's front, lined up like the board list's: "T-434 ▶ prep · try 2", "T-440 ▶ 12m" (see bandLeads)
  const shownTasks = live.slice(0, taskRows)
  const since = (id: string) => v?.working?.find(w => w.task === id)?.since
  const leads = bandLeads(shownTasks, nowMs, since, e.props.bodyColumns ?? 80)
  // a note the row's state already says ("worker on it" beside "▶ 12m") is left out; every other note stays (see bandNote)
  const note = (t: (typeof live)[number]) => bandNote(t, nowMs, since(t.id))
  const tail = (t: (typeof live)[number]) =>
    fileWaitText(t) ? ` — ${fileWaitText(t)}` : waitsForYou(t) ? ` — ${t.question ?? t.note}` : note(t) ? ` — ${note(t)}` : ''
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
      {shownTasks.map(t => (
        <Text wrap="truncate">
          <Text color={color[t.status] as never}>
            {leads.get(t.id)}
          </Text>
          <Text> {t.title}</Text>
          <Text color={'inactive' as never}>{tail(t)}</Text>
        </Text>
      ))}
      {live.length + questions.length > rows && <Text color={'inactive' as never}>+{live.length + questions.length - rows} more · /{S.N.name}</Text>}
    </Box>
  )
}
