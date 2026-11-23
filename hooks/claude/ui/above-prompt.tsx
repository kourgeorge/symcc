// The band above the prompt (T-748, T-776): its first line "𝄞 symcc", a short board summary (mode, agents, waiting,
// today) and the [ open board ] button; under it one row per running task, the next task to start, then the questions
// and the tasks that need you (in the warning color). The status line under the prompt has the rest of the board's facts.
import { drawNow } from './now'
import type { MatchedHook } from 'claude-code'
import { bandBrand, bandWhere, bandItems, bandFronts, bandNote, bandSummary, BAND_INDENT, type BandSummaryView, planBandText, questionsForYou, driveWarning, liveIdle, type BandItem, type LiveView, type BoardTask } from '../../board'
import { cutTitle, padWidth, textWidth } from '../../core/width'
import { type PaneView, S } from '../../app/state'
import { type $, panelValues } from '../panel'
import { openPane } from '../../app/open'
import { claudeHost } from '../host'

export type AbovePromptHook = MatchedHook<'ui.render', { component: 'AbovePrompt' }>

/** The band's left column: the brand ("𝄞 symcc", no version, see bandBrand), then " · <folder>" outside the symcc project. */
export function bandTitle(root: string = S.root): string {
  return `${bandBrand(S.N.name)}${bandWhere(root, S.N.name)}`
}

/** The color of a band row's front, by its kind: a running task green, next up dim, a task that needs you the warning color. */
const FRONT_COLOR: Record<BandItem['kind'], string> = { run: 'green', next: 'inactive', you: 'warning' }


/** The columns the [ open board ] button takes at the end of the band's first line, its space before it included. */
export const BAND_BUTTON = 15

/** A task row's title and tail cut to fit `room` columns: the tail goes first, then the title is cut with "…". */
function fitRow(title: string, tail: string, room: number): { title: string; tail: string } {
  const r = Math.max(1, room)
  if (textWidth(title) > r) return { title: cutTitle(title, r), tail: '' }
  const left = r - textWidth(title)
  return { title, tail: !tail ? '' : textWidth(tail) <= left ? tail : left >= 4 ? cutTitle(tail, left) : '' }
}

/** The band above the prompt (T-748, T-776): "𝄞 symcc", a short board summary (bandSummary) and [ open board ] on the
 *  first line, so folding the band ([-]) keeps just that; under it, indented 1 space, one line per running task, then
 *  next up, the questions and the tasks that need you, and the drive and plan warnings. */
export async function renderAbovePrompt($: $, e: Parameters<AbovePromptHook>[1], next: Parameters<AbovePromptHook>[2]) {
  if (e.props.hasSurvey || e.props.view.agentId) return next(e)
  const v = (await panelValues($).readView()) as PaneView | undefined
  const tasks = v?.tasks ?? []
  // the lead's open questions for the owner (see core/questions.ts)
  const questions = v?.questions ?? []
  if ((!tasks.length && !questions.length) || v?.on_here === false) return next(e)
  const { Box, Text, Button } = $.ui.resolve(e)
  const nowMs = await drawNow($)
  const columns = e.props.bodyColumns ?? 80
  // the first line is one of the rows; the others hold the work and what needs you
  const rows = Math.max(1, Math.min(6, e.props.maxRows ?? 8) - 1)
  const title = bandTitle()
  const summaryRoom = Math.max(1, columns - textWidth(title) - 2 - BAND_BUTTON)
  const summary = bandSummary(v as unknown as BandSummaryView, nowMs, summaryRoom)
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
  const fronts = bandFronts(shown, columns)
  const line = (s: string) => ` ${cutTitle(s, Math.max(1, columns - 1))}`
  // a running row's front: the id in the accent color, the stage part ("7m (try 4)") in green
  const runFront = (front: string) => {
    const m = /^(\S+)(\s+)(.*?)(\s*)$/u.exec(front)
    if (!m) return <Text>{front}</Text>
    return (
      <Text>
        <Text color={'claude' as never}>{m[1]}</Text>
        {m[2]}
        <Text color={'green' as never}>{m[3]}</Text>
        {m[4]}
      </Text>
    )
  }
  const row = (x: BandItem) => {
    const front = fronts.get(x.id) ?? ''
    const cut = fitRow(x.title, x.tail ? ` — ${x.tail}` : '', columns - BAND_INDENT - textWidth(front))
    return (
      <Text wrap="truncate">
        {' '}
        <Text color={FRONT_COLOR[x.kind] as never}>{x.icon}</Text>
        {' '}
        {x.kind === 'run' ? runFront(front) : <Text color={FRONT_COLOR[x.kind] as never}>{front}</Text>}
        <Text color={(x.kind === 'you' ? 'warning' : undefined) as never}>{cut.title}</Text>
        <Text color={'inactive' as never}>{cut.tail}</Text>
      </Text>
    )
  }
  const lines = [
    ...work.map(row),
    ...asks.map((q, i) => <Text wrap="truncate" color={'warning' as never}>{line(i === 0 ? `⚠ ${questionsForYou(questions.length)}: ${q.id} ${q.text}` : `⚠ ${q.id} ${q.text}`)}</Text>),
    ...yours.map(row),
    ...(drive ? [<Text wrap="truncate" color={'warning' as never}>{line(drive)}</Text>] : []),
    ...(plan ? [<Text wrap="truncate" color={'inactive' as never}>{line(plan)}</Text>] : []),
    ...(hidden > 0 ? [<Text wrap="truncate" color={'inactive' as never}>{line(`+${hidden} more · /${S.N.name}`)}</Text>] : []),
  ]
  // T-903: nothing runs, nothing is next and nothing needs you: the first of the Live tab's idle lines (why, what to do next)
  if (!lines.length) lines.push(<Text wrap="truncate" color={'inactive' as never}>{line(liveIdle(v as unknown as LiveView, nowMs, Math.max(1, columns - 1))[0] ?? '')}</Text>)
  return (
    <Box flexDirection="column">
      <Box key="band-head" flexDirection="row">
        <Text wrap="truncate">
          <Text bold color={'ide' as never}>{title}</Text>
          {'  '}
          <Text key="band-summary" color={'inactive' as never}>{padWidth(summary, summaryRoom)}</Text>
          {' '}
        </Text>
        <Button key="open-board" label="open board" dimColor onPress={() => void openPane(claudeHost($))} />
      </Box>
      {lines}
    </Box>
  )
}
