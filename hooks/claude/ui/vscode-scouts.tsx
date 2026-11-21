// The board panel's Scouts view in VS Code's side panel (see surface.ts and vscode.tsx). Like the terminal's list
// (scouts-page.tsx, scoutListRows), each scout is one line of columns, its name a link that opens it (VS Code draws
// a Button as a blue box), the end cut with "…" to the room a task row has (vsRowRoom), so it never wraps (T-697):
//   ◷ security-advisories  every day  next in 3h  last: found 5: The package left-pad has a security…
// With no scouts, a short how-to in a box and "+ New scout" as the one primary button.
// One scout's page: the page header (T-751, vsPageHeader: "‹ Scouts" and the "‹ 2 of 6 ›" pager, the name and what
// it does, its state as chips, Run now / Edit / Pause as buttons, a divider), then the instructions, and its Runs (newest first; a press opens that run's full report, with a "← <scout>" button back;
// the page itself shows no report text). It says when its last run ended on an API error or a refusal. No key hints.
import type { SymccScout } from '../../../types'
import { scoutRow, scoutFile, scoutHowTo, scoutListRows, type ScoutListRow, everyText, isNothing, BAD_EVERY_STATE, scoutRunTasks, scoutRunLine, scoutOutcomeTone, scoutLastRunProblem } from '../../board'
import { cancelScoutEdit, saveScout, runScoutNow, editScout, setScoutPaused, newScout, loadScoutRunHistory, loadScoutResults, readScoutRunReport, scoutPlaceValue } from '../../app/scouts'
import { S } from '../../app/state'
import { type $, panelValues } from '../panel'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { resetPane } from '../../app/open'
import { claudeHost } from '../host'
import { vsBadge, vsFooter, vsHref, vsLink, mdLink, vsSection, cutEnd } from './vscode'
import { vsRowRoom } from './vscode-list'
import { type PageHeader, vsPageHeader } from './page-header'

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

/** Spaces that HTML does not squeeze, so a row's cells keep their padding in VS Code's panel. */
const hard = (s: string) => s.replace(/ /g, ' ')

/** The end of a Scouts list row after its state, as plain text, fitted to `room` characters (never wider): the
 *  terminal row's "last:" cell with the start of the last report after it ("last: found 5: The package left-pad…"),
 *  then the model; the report start is cut with "…" first, then the whole end. */
export function scoutRowEnd(s: SymccScout, r: ScoutListRow, room: number): string {
  const last = r.last.trim()
  const model = r.model.trim()
  const start = last && !s.running && !isNothing(s.last_report) ? reportStart(s.last_report) : ''
  const modelPart = model ? `  ${model}` : ''
  if (!last) return room >= modelPart.length ? modelPart : ''
  const free = room - 2 - last.length - modelPart.length - 2
  const said = start && free >= 2 ? `: ${cutEnd(start, free)}` : ''
  const all = `${last}${said}${modelPart}`
  if (room <= 2) return ''
  return `  ${all.length <= room - 2 ? all : cutEnd(all, room - 2)}`
}

/** The Scouts list in VS Code: one line per scout, like the terminal list (scouts-page.tsx, scoutListRows): the
 *  icon, the name (a link that opens the scout), how often, the state in its color (running blue, paused dim, a bad
 *  file yellow), then dim "last:" with the start of the last report and the model, cut with "…" to the room a task
 *  row has (vsRowRoom), so a row never wraps. */
export function scoutsListVs($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, act, C, scouts, header, vs, width } = pane
  const { nowMs } = pane
  const room = vsRowRoom(width)
  const rows = scoutListRows(scouts, nowMs, room)
  const plain = (key: string, text: string, color = 'inactive') => (
    <Text key={key} wrap="wrap" color={C(color)}>
      {text}
    </Text>
  )

  const scoutLine = (x: SymccScout, i: number) => {
    const r = rows[i]!
    const href = vsHref('scout', x.name)
    const name = mdLink(x.name, href)
    const pad = ' '.repeat(Math.max(0, r.name.length - x.name.length))
    const lead = r.icon.length + 1 + r.name.length + r.every.length + r.state.length
    const end = scoutRowEnd(x, r, room - lead)
    // the name a link that opens it (text, not a Button: VS Code draws a Button as a blue box)
    return (
      <Box key={`vs-scout-${x.name}`} flexDirection="row">
        <Text key="icon" color={C(r.tone)}>{hard(`${r.icon} `)}</Text>
        <Box key="name" flexShrink={0} minWidth={r.name.length}>
          {vsLink(vs, row(`scout:${x.name}`), `${x.paused ? name : `**${name}**`}${pad}`, [[href, act(() => panelValues($).updateScoutOpen(() => x.name))]], x.paused)}
        </Box>
        {r.every ? <Text key="every" color={C('inactive')}>{hard(r.every)}</Text> : null}
        {r.state ? <Text key="state" color={C(r.stateTone)}>{hard(r.state)}</Text> : null}
        {end ? <Text key="end" wrap="truncate" color={C('inactive')}>{hard(end)}</Text> : null}
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
      {header('scouts')}
      {scouts.length === 0 ? <Box key="vs-scouts-howto" flexDirection="column" borderStyle="round" borderColor={C('subtle')} paddingX={1}>{scoutHowTo(S.N.name).map((line, i) => plain(`howto-${i}`, line.replace(/ \([a-z]\)(?=\s|$)/g, ''), i === 0 ? 'text' : 'inactive'))}</Box> : null}
      {scouts.length ? (
        <Box key="vs-scouts-rows" flexDirection="column">
          {scouts.map(scoutLine)}
        </Box>
      ) : null}
      {newBox}
      <Box key="vs-scouts-back-row" flexDirection="row">
        <Button key="scouts-back" label="← Tasks" variant="secondary" onPress={act(() => resetPane(claudeHost($), 'tasks'))} />
      </Box>
      {vsFooter(vs, 'scouts-keys')}
    </Box>
  )
}

/** One scout's page in VS Code, or one of its runs: `run` is when the open run ended ('' = none, the scout's page). */
export async function scoutPageVs($: $, pane: PaneParts, sc: SymccScout, run: string, header: PageHeader) {
  const { Box, Text, Button, act, C, vs } = pane
  const { Markdown } = vs
  const { nowMs } = pane
  const file = scoutFile(sc.name, S.N.name)
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
  const results = (await loadScoutResults(host, [sc.name], pane.v.tasks ?? [], nowMs))[sc.name] ?? ''
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
  return (
    <Box key="vs-scout-page" flexDirection="column" gap={1}>
      {vsPageHeader(pane, header)}
      {sc.warning || problem ? (
        <Box key="vs-scout-top" flexDirection="column">
          {sc.warning ? plain('vs-scout-warning', sc.warning, 'warning') : null}
          {problem ? plain('vs-scout-problem', problem, 'error') : null}
        </Box>
      ) : null}
      {section('instructions', 'Instructions', [sc.prompt?.trim() ? <Markdown key="vs-scout-prompt" text={sc.prompt.trim()} /> : plain('vs-scout-prompt-none', `(not loaded yet: run /${S.N.name}-scouts)`)])}
      {/* no report text here: a run's report shows on its page (a press on the run); the newest run is first */}
      {section(
        'runs',
        'Runs',
        shown.length
          ? [
              plain('vs-runs-hint', 'Click a run to see its report'),
              // each run: its time a link that opens its report (text, not a Button: VS Code draws a Button as a blue box),
              // and under it what it found, in its outcome's color
              ...shown.map(x => {
                const line = scoutRunLine(x.run, x.tasks, nowMs)
                const cut = line.indexOf(' · ')
                const href = vsHref('run', x.run.ended)
                return (
                  <Box key={`vs-run-${x.run.ended}`} flexDirection="column">
                    {vsLink(vs, row(`scout-run:${x.run.ended}`), `run ${mdLink(cut < 0 ? line : line.slice(0, cut), href)}`, [[href, showRun(x.run.ended)]])}
                    {cut < 0 ? null : <Text key={`vs-run-${x.run.ended}-info`} wrap="wrap" color={C(scoutOutcomeTone(x.run.outcome))}>{line.slice(cut + 3)}</Text>}
                  </Box>
                )
              }),
            ]
          : [plain('vs-runs-none', '(no runs yet)')],
      )}
      {/* T-686: its Results figures (last 7 days, then in all) in their own section, just before File */}
      {results ? section('results', 'Results', results.split('\n').map((l, i) => plain(`vs-scout-results-${i}`, l))) : null}
      {section('file', 'File', [plain('vs-scout-file', file, 'autoAccept')])}
      {vsFooter(vs, 'scout-keys')}
    </Box>
  )
}

/** A scout's edit page in VS Code: the name with a "new scout" or "editing" badge, notes, then the one Save Button and
 *  a Cancel link (not two Buttons side by side: VS Code's Buttons don't wrap), then a labelled box per part of its file. */
export function scoutEditPageVs($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, act, C, scouts, vs } = pane
  const d = S.draft!
  const sc = scouts.find(x => x.name === d.scout)
  const r = sc ? scoutRow(sc, pane.nowMs) : undefined
  const file = scoutFile(d.scout, S.N.name)
  const plain = (key: string, text: string, color = 'inactive') => (
    <Text key={key} wrap="wrap" color={C(color)}>
      {text}
    </Text>
  )
  const cancelHref = vsHref('do', 'scout-edit/cancel')
  const box = (key: 'every' | 'model' | 'summary' | 'body', label: string, placeholder: string, more: Record<string, unknown> = {}) => (
    <Input key={`scout-${key}`} label={label} value={d[key]} placeholder={placeholder} submitLabel="Keep" {...more} onInput={value => void (d[key] = value)} onSubmit={value => void (d[key] = value)} />
  )
  return (
    <Box key="vs-scout-edit-page" flexDirection="column" gap={1}>
      <Box key="vs-scout-edit-top" flexDirection="column">
        <Box key="vs-edit-title" flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text key="name" wrap="wrap" bold color={C('claude')}>{d.scout}</Text>
          <Text key="badge" wrap="wrap">{vsBadge(vs, 'vs-edit-badge', d.isNew ? 'new scout' : 'editing', 'warning')}</Text>
        </Box>
        {r ? plain('vs-edit-facts', [r.every, r.model, r.ran].filter(Boolean).join(' · ')) : null}
        {plain('vs-edit-note-0', `Save writes ${file}; other front matter keys are kept.`)}
        {plain('vs-edit-note-1', `The name is the file's name: to rename the scout, rename ${file}.`)}
      </Box>
      <Box key="vs-scout-edit-actions" flexDirection="row" flexWrap="wrap" columnGap={2} alignItems="center">
        <Button key="scout-save" label="Save" variant="primary" onPress={act(() => saveScout(claudeHost($)))} />
        {vsLink(vs, 'scout-cancel', mdLink('Cancel', cancelHref), [[cancelHref, () => void cancelScoutEdit(claudeHost($))]])}
      </Box>
      {d.error ? plain('vs-scout-edit-error', d.error, 'error') : null}
      {box('every', 'Runs every', 'minutes: a whole number, 0 or more', { autoFocus: true })}
      {plain('vs-every-about', 'in minutes · 0 = only on demand')}
      {box('model', 'Model', "empty: the session's model")}
      {box('summary', 'Summary', 'empty: the first line of the instructions')}
      {box('body', 'Instructions', 'what to look for, in plain words', { rows: 8 })}
      {vsFooter(vs, 'scout-edit-keys')}
    </Box>
  )
}
