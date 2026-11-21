// The band above the prompt (T-748): what is happening and what needs you. One row per running task, the next task to
// start, then the questions and the tasks that need you (in the warning color), and the [ open board ] button. No
// counts: the status line under the prompt has the board's facts (mode, who drives, branch, next scout, today).
import { drawNow } from './now'
import type { MatchedHook } from 'claude-code'
import { bandBrand, bandWhere, bandItems, bandFronts, bandNote, planBandText, questionsForYou, driveWarning, type BandItem, type LiveView, type BoardTask } from '../../board'
import { padWidth, textWidth } from '../../core/stats'
import { type PaneView, S } from '../../app/state'
import { type $, panelValues } from '../panel'
import { openPane } from '../../app/open'
import { claudeHost } from '../host'

export type AbovePromptHook = MatchedHook<'ui.render', { component: 'AbovePrompt' }>

/** The band's left column: the brand ("𝄞 symcc", no version, see bandBrand), then " · <folder>" outside the symcc project. */
export function bandTitle(root: string = S.root): string {
  return `${bandBrand(S.N.name)}${bandWhere(root, S.N.name)}`
}

/** What the band says when nothing runs, nothing is next and nothing needs you. */
export const BAND_IDLE = 'nothing running'

/** The color of a band row's front, by its kind: a running task green, next up dim, a task that needs you the warning color. */
const FRONT_COLOR: Record<BandItem['kind'], string> = { run: 'green', next: 'inactive', you: 'warning' }

/** The band above the prompt: the work, always in view inside Claude Code's own screen. */
export async function renderAbovePrompt($: $, e: Parameters<AbovePromptHook>[1], next: Parameters<AbovePromptHook>[2]) {
  if (e.props.hasSurvey || e.props.view.agentId) return next(e)
  const v = (await panelValues($).readView()) as PaneView | undefined
  const tasks = v?.tasks ?? []
  // the lead's open questions for the owner (see core/questions.ts)
  const questions = v?.questions ?? []
  if ((!tasks.length && !questions.length) || v?.enabled === false) return next(e)
  const { Box, Text, Button } = $.ui.resolve(e)
  const nowMs = await drawNow($)
  const columns = e.props.bodyColumns ?? 80
  const rows = Math.max(1, Math.min(6, e.props.maxRows ?? 8))
  // the brand on the first line, the other lines start under the first row's text
  const title = bandTitle()
  const pad = textWidth(title) + 2
  const room = columns - pad
  // T-643: another session drives: the warning stays in the band, in the warning color
  const driving = v?.driving ?? S.driving
  const drive = driveWarning(driving, tasks, nowMs, S.N.name, 'band')
  // plan mode: nothing new starts; workers already running keep going (said so)
  const plan = v?.plan_mode ? planBandText(tasks.filter(t => t.status === 'doing').length) : ''
  const since = (id: string) => v?.working?.find(w => w.task === id)?.since
  // a note the row's state already says ("worker on it" beside "▶ work 12m") is left out (see bandNote)
  const items = bandItems(v as unknown as LiveView, nowMs, since, (t: BoardTask) => bandNote(t, nowMs, since(t.id), driving))
  // what needs you is never pushed out by the work: questions and NEEDS YOU tasks first, then the running rows, then next up
  const warn = [drive, plan].filter(Boolean).length
  const you = items.filter(x => x.kind === 'you')
  const asks = questions.slice(0, Math.max(0, rows - warn))
  const yours = you.slice(0, Math.max(0, rows - warn - asks.length))
  const left = Math.max(0, rows - warn - asks.length - yours.length)
  const work = items.filter(x => x.kind !== 'you').slice(0, left)
  const shown = [...work, ...yours]
  const hidden = items.length - shown.length + questions.length - asks.length
  const fronts = bandFronts(shown, room)
  const tail = (x: BandItem) => (x.tail ? ` — ${x.tail}` : '')
  const lines = [
    ...(drive ? [<Text color={'warning' as never}>{drive}</Text>] : []),
    ...(plan ? [<Text color={'inactive' as never}>{plan}</Text>] : []),
    ...work.map(x => (
      <Text>
        <Text color={FRONT_COLOR[x.kind] as never}>{fronts.get(x.id)}</Text>
        <Text>{x.title}</Text>
        <Text color={'inactive' as never}>{tail(x)}</Text>
      </Text>
    )),
    ...asks.map((q, i) => <Text color={'warning' as never}>{i === 0 ? `⚠ ${questionsForYou(questions.length)}: ${q.id} ${q.text}` : `⚠ ${q.id} ${q.text}`}</Text>),
    ...yours.map(x => (
      <Text>
        <Text color={FRONT_COLOR[x.kind] as never}>{fronts.get(x.id)}</Text>
        <Text color={'warning' as never}>{x.title}</Text>
        <Text color={'inactive' as never}>{tail(x)}</Text>
      </Text>
    )),
    ...(hidden > 0 ? [<Text color={'inactive' as never}>+{hidden} more · /{S.N.name}</Text>] : []),
  ]
  if (!lines.length) lines.push(<Text color={'inactive' as never}>{BAND_IDLE}</Text>)
  const lead = (i: number) => (i === 0 ? <Text bold color={'ide' as never}>{padWidth(title, pad)}</Text> : <Text>{' '.repeat(pad)}</Text>)
  return (
    <Box flexDirection="column">
      {lines.map((line, i) =>
        i === lines.length - 1 ? (
          <Box flexDirection="row">
            <Text wrap="truncate">
              {lead(i)}
              {line}
            </Text>
            <Button key="open-board" label="open board" dimColor onPress={() => void openPane(claudeHost($))} />
          </Box>
        ) : (
          <Text wrap="truncate">
            {lead(i)}
            {line}
          </Text>
        ),
      )}
    </Box>
  )
}
