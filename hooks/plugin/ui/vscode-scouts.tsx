// The board panel's Scouts view in VS Code's side panel (see surface.ts and vscode.tsx). The terminal's list
// (scouts-page.tsx) packs each scout on one line of columns, cut to the width; here each scout is a block of a
// few readable lines that wrap, its name a link that opens it (VS Code draws a Button as a blue box):
//   security-advisories   ◎ next in 3h       (the name, then its status as a badge in its color)
//   every day · ran 21h ago                  (how often, model, when it ran: dim)
//   Checks the advisories for our packages   (the summary, whole)
//   last report: found 5: The package left-pad has a security advisory   (the start of the last report, whole, dim)
// With no scouts, a short how-to in a box and "+ New scout" as the one primary button.
// One scout's page: a "← Scouts" button, the name and state, its facts, Run now / Pause / Edit as buttons, then the
// instructions, the whole last report as Markdown, and its Runs (newest first; a press opens that run's full report,
// with a "← <scout>" button back). It says when its last run ended on an API error or a refusal. No key hints.
import type { SymccScout } from '../../../types'
import { scoutRow, scoutFile, scoutIcon, scoutHowTo, scoutLastText, everyText, isNothing, fmtDuration, BAD_EVERY_STATE, scoutRunTasks, scoutRunLine, scoutOutcomeTone, scoutLastRunProblem } from '../../board'
import { cancelScoutEdit, runScoutNow, editScout, setScoutPaused, newScout, loadScoutRunHistory, readScoutRunReport, scoutPlaceValue } from '../scouts'
import { S } from '../state'
import { type $, panelValues } from '../../claude/panel'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { resetPane } from './open'
import { claudeHost } from '../../claude/host'
import { vsBadge, vsFooter, vsHref, vsLink, mdLink, vsSection } from './vscode'

/** The color of a scout's mark in VS Code: running blue, paused dim, a bad file in the warning color, waiting plain. */
const markTone = (s: SymccScout) => (s.running ? 'ide' : s.paused ? 'inactive' : s.warning ? 'warning' : 'text')

/** A scout's state in words, whole ("running now", "paused", "next in 3h", "on demand", "bad every_minutes"). */
export function vsScoutState(s: SymccScout, nowMs: number): string {
  if (s.running) return s.paused ? 'running now, then paused' : 'running now'
  if (s.paused) return 'paused'
  if (s.warning) return BAD_EVERY_STATE
  return scoutRow(s, nowMs).state || (everyText(s.every_minutes) === 'on demand' ? 'on demand' : 'waiting')
}

/** The first line of a report that says something (a heading or "1." taken off), whole; '' when there is none. */
export function reportStart(report: string | undefined): string {
  const line = String(report ?? '').split('\n').map(l => l.trim()).find(l => l && !/^#{1,6}\s/.test(l)) ?? ''
  const num = line.match(/^(\*\*|__)?\d{1,2}[.):]\s+/)
  let t = num ? line.slice(num[0].length) : line
  if (num?.[1] && t.endsWith(num[1])) t = t.slice(0, -num[1].length)
  return t
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '$1')
    .replace(/__(\S(?:.*?\S)?)__/g, '$1')
    .replace(/\*(\S(?:.*?\S)?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

/** The "last report" line of a scout row: "last report: found 2: <its first finding>", or "last report: nothing". */
function lastLine(s: SymccScout): { text: string; tone: string } {
  if (s.running) return { text: '', tone: 'inactive' }
  const l = scoutLastText(s)
  if (l.text === 'never ran') return { text: '', tone: 'inactive' }
  if (isNothing(s.last_report)) return { text: 'last report: nothing', tone: 'inactive' }
  const start = reportStart(s.last_report)
  return { text: `last report: ${l.text.replace(/^last: /, '')}${start ? `: ${start}` : ''}`, tone: 'text' }
}

/** The Scouts list in VS Code. */
export function scoutsListVs($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, act, C, scouts, banner, tabs, vs } = pane
  const { nowMs } = pane
  const plain = (key: string, text: string, color = 'inactive') => (
    <Text key={key} wrap="wrap" color={C(color)}>
      {text}
    </Text>
  )

  const scoutBox = (x: SymccScout) => {
    const r = scoutRow(x, nowMs)
    const facts = [r.every, r.model, r.ran].filter(Boolean).join(' · ')
    const title = x.summary?.trim() || (x.prompt ?? '').split('\n').map(l => l.trim()).find(Boolean) || ''
    const last = lastLine(x)
    // the name a link that opens it (text, not a Button: VS Code draws a Button as a blue box) and its status badge,
    // then dim lines: how often and the last run, the summary, a bad file's warning, the start of the last report
    const line = (key: string, text: string, color = 'inactive') => (
      <Text key={key} wrap="wrap" color={C(color)}>
        {text}
      </Text>
    )
    const href = vsHref('scout', x.name)
    const name = mdLink(x.name, href)
    return (
      <Box key={`vs-scout-${x.name}`} flexDirection="column">
        <Box key={`vs-scout-${x.name}-top`} flexDirection="row" flexWrap="wrap" columnGap={2}>
          {vsLink(vs, row(`scout:${x.name}`), x.paused ? name : `**${name}**`, [[href, act(() => panelValues($).updateScoutOpen(() => x.name))]], x.paused)}
          {vsBadge(vs, 'mark', `${scoutIcon(x)} ${vsScoutState(x, nowMs)}`, markTone(x))}
        </Box>
        {line('facts', facts)}
        {title ? line('summary', title, 'text') : null}
        {x.warning ? line('warning', x.warning, 'warning') : null}
        {last.text ? line('last', last.text) : null}
      </Box>
    )
  }

  const newBox = S.naming ? (
    <Box key="vs-scout-new" flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
      <Input
        key="scout-new-name"
        label="New scout's name"
        placeholder="letters, digits, - and _"
        value={S.naming.name}
        autoFocus
        submitLabel="Next"
        onInput={value => void (S.naming && (S.naming.name = value))}
        onSubmit={value => (value.trim() ? act(() => newScout(claudeHost($), value, scouts.map(x => x.name)))() : cancelScoutEdit(claudeHost($)))}
      />
      {S.naming.error ? plain('scout-new-error', S.naming.error, 'error') : null}
      <Button key="scout-new-cancel" label="Cancel" variant="secondary" onPress={() => cancelScoutEdit(claudeHost($))} />
    </Box>
  ) : (
    <Box key="vs-scout-new-row" flexDirection="row">
      <Button key="scout-new" label="+ New scout" variant={scouts.length === 0 ? 'primary' : 'secondary'} autoFocus={scouts.length === 0 ? true : undefined} onPress={() => ((S.naming = { name: '', error: '' }), $.ui.invalidate('ui.render'))} />
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Box key="vs-header" flexDirection="column">
        {[...banner(), tabs()]}
      </Box>
      {scouts.length === 0 ? <Box key="vs-scouts-howto" flexDirection="column" borderStyle="round" borderColor={C('subtle')} paddingX={1}>{scoutHowTo(S.N.name).map((line, i) => plain(`howto-${i}`, line.replace(/ \([a-z]\)(?=\s|$)/g, ''), i === 0 ? 'text' : 'inactive'))}</Box> : null}
      {scouts.map(scoutBox)}
      {newBox}
      <Box key="vs-scouts-back-row" flexDirection="row">
        <Button key="scouts-back" label="← Tasks" variant="secondary" onPress={act(() => resetPane(claudeHost($), 'tasks'))} />
      </Box>
      {vsFooter(vs, 'scouts-keys')}
    </Box>
  )
}

/** One scout's page in VS Code, or one of its runs: `run` is when the open run ended ('' = none, the scout's page). */
export async function scoutPageVs($: $, pane: PaneParts, sc: SymccScout, run = '') {
  const { Box, Text, Button, act, C, vs } = pane
  const { Markdown } = vs
  const { nowMs } = pane
  const r = scoutRow(sc, nowMs)
  const file = scoutFile(sc.name, S.N.name)
  const title = sc.summary?.trim() || ''
  const next = Date.parse(sc.next_run ?? '')
  const nextText = sc.running || sc.paused || r.every === 'on demand' || sc.warning || !Number.isFinite(next) ? '' : next <= nowMs ? 'due now' : `in ${fmtDuration(next - nowMs)}`
  const plain = (key: string, text: string, color = 'inactive', bold?: true) => (
    <Text key={key} wrap="wrap" bold={bold} color={C(color)}>
      {text}
    </Text>
  )
  const section = (name: string, label: string, body: unknown[]) => (
    <Box key={`vs-sec-${name}`} flexDirection="column">
      {vsSection(vs, `vs-sec-${name}-head`, label)}
      {body.filter(Boolean) as never}
    </Box>
  )
  // its runs, newest first, each with the tasks made from it
  const host = claudeHost($)
  const runs = await loadScoutRunHistory(host, sc.name)
  const made = scoutRunTasks(runs, pane.v.tasks ?? [], sc.name)
  const shown = runs.map((run, i) => ({ run, tasks: made[i]! })).reverse()
  const problem = sc.running ? '' : scoutLastRunProblem(runs)
  const opened = run ? shown.find(x => x.run.ended === run) : undefined
  // the open run is kept in the panel's saved scout value, next to the scout (scoutPlace); then the page is drawn again
  const showRun = (run: string) => act(async () => (await panelValues($).updateScoutOpen(() => scoutPlaceValue(sc.name, run)), $.ui.invalidate('ui.render')))
  const closeRun = showRun('')
  if (opened) {
    const text = (await readScoutRunReport(host, opened.run))?.trim() ?? ''
    return (
      <Box key="vs-scout-run-page" flexDirection="column" gap={1}>
        <Box key="vs-scout-run-top" flexDirection="column">
          <Box key="vs-run-back-row" flexDirection="row">
            <Button key="scout-run-back" label={`← ${sc.name}`} variant="secondary" autoFocus onPress={closeRun} />
          </Box>
          <Text key="vs-run-title" wrap="wrap">
            <Text bold color={C('claude')}>{sc.name}</Text>
            <Text color={C('inactive')}>{` · run that ended ${opened.run.ended}`}</Text>
          </Text>
          {plain('vs-run-line', scoutRunLine(opened.run, opened.tasks, nowMs), scoutOutcomeTone(opened.run.outcome))}
          {opened.run.why ? plain('vs-run-why', opened.run.why, 'error') : null}
        </Box>
        {section('run-report', 'Report', [text ? <Markdown key="vs-run-report-md" text={text} /> : plain('vs-run-report-none', opened.run.report ? `(its report file ${opened.run.report} can't be read)` : '(this run reported nothing)')])}
        {opened.run.report ? section('run-file', 'File', [plain('vs-run-file', opened.run.report, 'autoAccept')]) : null}
        {vsFooter(vs, 'scout-run-keys')}
      </Box>
    )
  }
  const report = String(sc.last_report ?? '').trim()
  return (
    <Box key="vs-scout-page" flexDirection="column" gap={1}>
      <Box key="vs-scout-top" flexDirection="column">
        <Box key="vs-back-row" flexDirection="row">
          <Button key="scout-back" label="← Scouts" variant="secondary" autoFocus onPress={act(() => panelValues($).updateScoutOpen(() => ''))} />
        </Box>
        <Text key="vs-scout-status" wrap="wrap">
          <Text bold color={C('claude')}>{sc.name}</Text>
          <Text>{'  '}</Text>
          <Text bold color={C(markTone(sc))}>{`${scoutIcon(sc)} ${vsScoutState(sc, nowMs)}`}</Text>
        </Text>
        {title ? plain('vs-scout-summary', title, 'text', true) : null}
        {sc.warning ? plain('vs-scout-warning', sc.warning, 'warning') : null}
        {problem ? plain('vs-scout-problem', problem, 'error') : null}
      </Box>
      <Box key="vs-scout-facts" flexDirection="column">
        {plain('every', `runs: ${r.every}`)}
        {r.model ? plain('model', `model: ${r.model}`) : null}
        {nextText ? plain('next', `next run: ${nextText}`) : null}
        {plain('ran', `last run: ${r.ran}`)}
      </Box>
      <Box key="vs-scout-actions" flexDirection="row" flexWrap="wrap" gap={1}>
        {/* no Run now while it runs: it couldn't start again until this run ends */}
        {!sc.running ? <Button key="scout-run" label="Run now" variant="primary" onPress={act(async () => $.ui.toast(S.N.toast(await runScoutNow(claudeHost($), sc.name))))} /> : null}
        <Button key="scout-pause" label={sc.paused ? 'Resume' : 'Pause'} variant="secondary" onPress={act(async () => $.ui.toast(S.N.toast(await setScoutPaused(claudeHost($), sc.name, !sc.paused))))} />
        <Button key="scout-edit" label="Edit" variant="secondary" onPress={act(() => editScout(claudeHost($), sc))} />
      </Box>
      {section('instructions', 'Instructions', [sc.prompt?.trim() ? <Markdown key="vs-scout-prompt" text={sc.prompt.trim()} /> : plain('vs-scout-prompt-none', `(not loaded yet: run /${S.N.name}-scouts)`)])}
      {section('report', 'Last report', [
        !report ? plain('vs-report-none', sc.last_run ? 'nothing found' : 'nothing found (it has not run yet)') : isNothing(report) ? plain('vs-report-nothing', 'nothing found') : null,
        report && isNothing(report) && report.split('\n').length > 1 ? <Markdown key="vs-report-md" text={report} /> : null,
        report && !isNothing(report) ? <Markdown key="vs-report-md" text={report} /> : null,
      ])}
      {shown.length
        ? section(
            'runs',
            'Runs',
            shown.map(x => (
              <Button key={row(`scout-run:${x.run.ended}`)} plain label={`Open the run ${scoutRunLine(x.run, x.tasks, nowMs)}`} onPress={showRun(x.run.ended)}>
                <Text wrap="wrap" color={C(scoutOutcomeTone(x.run.outcome))}>{scoutRunLine(x.run, x.tasks, nowMs)}</Text>
              </Button>
            )),
          )
        : null}
      {section('file', 'File', [plain('vs-scout-file', file, 'autoAccept')])}
      {vsFooter(vs, 'scout-keys')}
    </Box>
  )
}
