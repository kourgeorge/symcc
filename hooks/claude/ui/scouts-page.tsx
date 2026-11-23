// The board panel's Scouts view: the list, one scout's page, and its edit mode.
import { scoutRow, scoutFile, scoutKeys, scoutListRows, scoutHowTo, scoutListKeys, scoutEditKeys, boxHint, scoutRunTasks, scoutRunLine, scoutOutcomeTone, scoutLastRunProblem, scoutFindingsOf, findingsLine, findingsDefaultLine, FINDINGS_PICKS } from '../../board'
import { saveScout, cancelScoutEdit, runScoutNow, editScout, cycleScoutFindings, setScoutPaused, newScout, loadScoutRunHistory, loadScoutResults, readScoutRunReport, scoutPlace, scoutPlaceValue } from '../../app/scouts'
import { S } from '../../app/state'
import { type $, panelValues } from '../panel'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { resetPane } from '../../app/open'
import { scoutEditPageVs, scoutPageVs, scoutsListVs } from './vscode-scouts'
import { claudeHost } from '../host'
import { NAV_KEYS, navHint, placeIn, scoutAbout, scoutButtons, scoutListNames, scoutStateGroups } from '../../core/page-header'
import { pageHeader, type PageHeader } from './page-header'

/** A scout's edit mode: the same header as its page, then a box per part of its file, named and ordered as the
 *  page shows them: Runs every, Model, Summary, Instructions. Its Cancel button leaves it
 *  without saving (its boxes take every letter, and Esc doesn't reach the panel from a text box). */
export function scoutEditPage($: $, pane: PaneParts) {
  // VS Code's side panel: one Save Button and a Cancel link, labelled boxes (see vscode-scouts.tsx)
  if (pane.vscode) return scoutEditPageVs($, pane)
  const { Box, Text, Button, Input, act, C, scouts, heading, footer } = pane
  // A scout's edit mode: the same header as its page, then a box per part of its file.
  // (renderPane calls this only while S.draft is set)
  const d = S.draft!
  const sc = scouts.find(x => x.name === d.scout)
  const r = sc ? scoutRow(sc, pane.nowMs) : undefined
  const file = scoutFile(d.scout, S.N.name)
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('claude')}>{d.scout}</Text>{' '}
          <Text bold color={C('warning')}>{d.isNew ? 'new scout' : 'editing'}</Text>
          {r ? <Text color={C('inactive')}> · {r.every}{r.model ? ` · ${r.model}` : ''} · {r.ran}</Text> : null}
        </Text>
        <Text color={C('inactive')}>save writes {file} · other front matter keys are kept</Text>
        <Text color={C('inactive')}>the name is the file's name: to rename the scout, rename {file}</Text>
      </Box>

      <Box flexDirection="row" gap={1}>
        <Button key="scout-save" label="Save" onPress={act(() => saveScout(claudeHost($)))} />
        <Button key="scout-cancel" label="Cancel (x)" hotkey="x" onPress={() => cancelScoutEdit(claudeHost($))} />
      </Box>

      {d.error ? <Text color={C('error')}>{d.error}</Text> : null}

      <Box flexDirection="column">
        {heading('Runs every')}
        <Input key="scout-every" value={d.every} placeholder="minutes: a whole number, 0 or more" autoFocus submitLabel="keep" onInput={value => void (d.every = value)} onSubmit={value => void (d.every = value)} />
        <Text color={C('inactive')}>in minutes · 0 = only on demand</Text>
      </Box>

      <Box flexDirection="column">
        {heading('Model')}
        <Input key="scout-model" value={d.model} placeholder="empty: the session's model" submitLabel="keep" onInput={value => void (d.model = value)} onSubmit={value => void (d.model = value)} />
      </Box>

      <Box flexDirection="column">
        {heading('Findings')}
        {/* T-912: a pick list of the three choices (the saved value: '' = the board's scout_findings) */}
        {FINDINGS_PICKS.map(o => {
          const on = (d.findings || '') === o.value
          const label = o.value ? o.label : `${o.label} (now ${scoutFindingsOf(pane.v)})`
          return (
            <Button key={`scout-findings:${o.value || 'default'}`} plain label={label} onPress={() => ((d.findings = o.value), $.ui.invalidate('ui.render'))}>
              <Text bold={on} color={C(on ? 'ide' : 'text')}>{`  ${on ? '●' : '○'} ${label}`}</Text>
            </Button>
          )
        })}
        <Text color={C('inactive')}>auto: the lead decides where its tasks go · backlog: they all go to the backlog · board default: the board's scout_findings setting</Text>
      </Box>

      <Box flexDirection="column">
        {heading('Summary')}
        <Input key="scout-summary" value={d.summary} placeholder="empty: the scouts list shows the first line of the instructions" submitLabel="keep" onInput={value => void (d.summary = value)} onSubmit={value => void (d.summary = value)} />
      </Box>

      <Box flexDirection="column">
        {heading('Instructions')}
        <Input key="scout-body" value={d.body} rows={8} placeholder="what to look for, in plain words" submitLabel="keep" onInput={value => void (d.body = value)} onSubmit={value => void (d.body = value)} />
      </Box>
      {footer(scoutEditKeys(), 'scout-edit-keys')}
    </Box>
  )
}

/** The Scouts view: one scout's page when one is open, else the list of scouts. */
export async function scoutsPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, width, act, C, scouts, header, footer, buttonRows, heading, paragraphs } = pane
  const { nowMs } = pane
  const place = scoutPlace(await panelValues($).readScoutOpen())
  const sc = place.scout ? scouts.find(x => x.name === place.scout) : undefined
  // VS Code's side panel: readable rows and pages, with buttons and no key hints (see vscode-scouts.tsx)
  if (pane.vscode && !sc) return scoutsListVs($, pane)
  if (sc) {
    const file = scoutFile(sc.name, S.N.name)
    const host = claudeHost($)
    // its runs, newest first, each with the tasks made from it (the board's tasks from this scout)
    const runs = await loadScoutRunHistory(host, sc.name)
    const made = scoutRunTasks(runs, pane.v.tasks ?? [], sc.name)
    const shown = runs.map((run, i) => ({ run, tasks: made[i]! })).reverse()
    const problem = scoutLastRunProblem(runs)
    const results = (await loadScoutResults(host, [sc.name], pane.v.tasks ?? [], nowMs))[sc.name] ?? ''
    const opened = place.run ? shown.find(x => x.run.ended === place.run) : undefined
    // the open run is kept in the panel's saved scout value, next to the scout (scoutPlace); then the page is drawn again
    const showRun = (run: string) => act(async () => (await panelValues($).updateScoutOpen(() => scoutPlaceValue(sc.name, run)), $.ui.invalidate('ui.render')))
    const closeRun = showRun('')
    // the page header (T-751): ‹ Scouts and its place in the list, its name and what it does, its state, its buttons
    const at = placeIn(scoutListNames(scouts), sc.name)
    const openScout = (name: string) => act(() => panelValues($).updateScoutOpen(() => name))
    const onPress: Record<string, () => void> = {
      'scout-run': act(async () => $.ui.toast(S.N.toast(await runScoutNow(claudeHost($), sc.name)))),
      'scout-edit': act(() => editScout(claudeHost($), sc)),
      'scout-pause': act(async () => $.ui.toast(S.N.toast(await setScoutPaused(claudeHost($), sc.name, !sc.paused)))),
    }
    // T-912: its findings choice, near the top; f (or a press on the line) moves it on and saves it in its file
    const board = scoutFindingsOf(pane.v)
    const cycleFindings = act(async () => $.ui.toast(S.N.toast(await cycleScoutFindings(claudeHost($), sc.name))))
    const header: PageHeader = {
      from: 'scouts', label: sc.name, place: at, title: scoutAbout(sc), color: 'claude',
      state: scoutStateGroups(sc, nowMs, shown[0]),
      buttons: scoutButtons(sc).map(b => ({ ...b, onPress: onPress[b.id] ?? (() => undefined) })),
      onBack: openScout(''), onPrev: at ? openScout(at.prev) : () => undefined, onNext: at ? openScout(at.next) : () => undefined,
      backFocus: true, nav: NAV_KEYS.claude, backKey: 'scout-back',
    }
    // VS Code's side panel: the same header, then its own sections (see vscode-scouts.tsx)
    if (pane.vscode) return scoutPageVs($, pane, sc, place.run, header)
    if (opened) {
      // one run's page: its line, then its full report (from its file)
      const text = (await readScoutRunReport(host, opened.run))?.trim() ?? ''
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text>
              <Text bold color={C('claude')}>{sc.name}</Text>
              <Text color={C('inactive')}> · run that ended {opened.run.ended}</Text>
            </Text>
            <Text color={C(scoutOutcomeTone(opened.run.outcome))}>{scoutRunLine(opened.run, opened.tasks, nowMs)}</Text>
            {opened.run.why ? <Text color={C('error')}>{opened.run.why}</Text> : null}
          </Box>
          {buttonRows([<Button key="scout-run-back" label="Back" hotkey="b" autoFocus onPress={closeRun} />], 'scout-run-buttons')}
          <Box flexDirection="column">
            {heading('Report')}
            {text ? paragraphs(text) : <Text color={C('inactive')}>{opened.run.report ? `(its report file ${opened.run.report} can't be read)` : '(this run reported nothing)'}</Text>}
          </Box>
          {opened.run.report ? (
            <Box flexDirection="column">
              {heading('File')}
              <Text>
                {'  '}
                <Text color={C('autoAccept')}>{opened.run.report}</Text>
              </Text>
            </Box>
          ) : null}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" gap={1}>
        {pageHeader(pane, header)}
        <Button key="scout-findings" plain hotkey="f" label={`${findingsLine(sc.findings, board)} (f changes it)`} onPress={cycleFindings}>
          <Text>
            <Text bold color={C('text')}>Findings: </Text>
            <Text color={C('inactive')}>{findingsLine(sc.findings, board).slice('Findings: '.length)}</Text>
            <Text color={C('inactive')}>{'  (f changes it)'}</Text>
          </Text>
        </Button>
        {sc.warning || (problem && !sc.running) ? (
          <Box flexDirection="column">
            {sc.warning ? <Text color={C('warning')}>{sc.warning}</Text> : null}
            {problem && !sc.running ? <Text color={C('error')}>{problem}</Text> : null}
          </Box>
        ) : null}

        <Box flexDirection="column">
          {heading('Instructions')}
          {sc.prompt?.trim() ? paragraphs(sc.prompt.trim()) : <Text color={C('inactive')}>(not loaded yet: run /{S.N.name}-scouts)</Text>}
        </Box>

        {/* no report text here: a run's report shows on its page (Enter on the run); the newest run is first */}
        <Box key="scout-runs" flexDirection="column">
          {heading('Runs')}
          {shown.length ? <Text color={C('inactive')}>{'  Enter on a run shows its report'}</Text> : <Text color={C('inactive')}>{'  (no runs yet)'}</Text>}
          {shown.map(x => (
            <Button key={row(`scout-run:${x.run.ended}`)} plain label={`run ${scoutRunLine(x.run, x.tasks, nowMs)}`} onPress={showRun(x.run.ended)}>
              <Text color={C(scoutOutcomeTone(x.run.outcome))}>{`  ${scoutRunLine(x.run, x.tasks, nowMs)}`}</Text>
            </Button>
          ))}
        </Box>

        {/* T-686: its Results figures (last 7 days, then in all) in their own section, just before File */}
        {results ? (
          <Box key="scout-results" flexDirection="column">
            {heading('Results')}
            {results.split('\n').map((l, i) => (
              <Text key={`scout-results-${i}`} color={C('inactive')}>{`  ${l}`}</Text>
            ))}
          </Box>
        ) : null}

        <Box flexDirection="column">
          {heading('File')}
          <Text>
            {'  '}
            <Text color={C('autoAccept')}>{file}</Text>
          </Text>
        </Box>
        {footer(scoutKeys(sc.paused === true, sc.running === true, at && at.of > 1 ? navHint('claude') : null), 'scout-keys')}
      </Box>
    )
  }
  /** "New scout": a button, or (once pressed) the box that asks for its name; Enter on it empty, or its Cancel
   *  button (x), leaves it. */
  const newBox = () =>
    S.naming ? (
      <Box flexDirection="column">
        <Input
          key="scout-new-name"
          label="New scout's name"
          placeholder="letters, digits, - and _"
          value={S.naming.name}
          autoFocus
          submitLabel="next"
          onInput={value => void (S.naming && (S.naming.name = value))}
          onSubmit={value => (value.trim() ? act(() => newScout(claudeHost($), value, scouts.map(x => x.name)))() : cancelScoutEdit(claudeHost($)))}
        />
        {S.naming.error ? <Text color={C('error')}>{S.naming.error}</Text> : null}
        <Button key="scout-new-cancel" label="Cancel (x)" hotkey="x" onPress={() => cancelScoutEdit(claudeHost($))} />
        <Text color={C('inactive')}>{boxHint('Enter goes on')}</Text>
      </Box>
    ) : (
      <Button key="scout-new" label="+ New scout" hotkey="n" autoFocus={scouts.length === 0 ? true : undefined} onPress={() => ((S.naming = { name: '', error: '' }), $.ui.invalidate('ui.render'))}>
        <Text color={C('text')}>{'  + New scout'}</Text>
      </Button>
    )
  // the rows: icon, name, how often, state, last report, model; columns that don't fit are left out
  const board = scoutFindingsOf(pane.v)
  const rows = scoutListRows(scouts, nowMs, width, 2, board)
  return (
    <Box flexDirection="column">
      {header('scouts')}
      {scouts.length > 0 && <Text key="scouts-findings-default" color={C('inactive')}>{`  ${findingsDefaultLine(board)}`}</Text>}
      {scouts.length === 0 && scoutHowTo(S.N.name).map((line, i) => <Text color={C(i === 0 ? 'text' : 'inactive')}>{line}</Text>)}
      {newBox()}
      {scouts.length > 0 && <Text key="scouts-blank-top"> </Text>}
      {scouts.map((x, i) => {
        const r = rows[i]!
        return (
          <Button key={row(`scout:${x.name}`)} plain label={`${x.name}: ${scoutRow(x, nowMs).state || 'waiting'}`} autoFocus={i === 0 ? true : undefined} onPress={act(() => panelValues($).updateScoutOpen(() => x.name))}>
            <Text color={C(r.tone)}>{`  ${r.icon} `}</Text>
            <Text bold={!x.paused} color={C(x.paused ? 'inactive' : 'claude')}>{r.name}</Text>
            <Text color={C('inactive')}>{r.every}</Text>
            <Text color={C(r.stateTone)}>{r.state}</Text>
            <Text color={C(r.lastTone)}>{r.last}</Text>
            <Text color={C('inactive')}>{r.findings}</Text>
            <Text color={C('inactive')}>{r.model}</Text>
          </Button>
        )
      })}
      <Text key="scouts-blank"> </Text>
      <Button key="scouts-back" label="Back (b)" hotkey="b" onPress={act(() => resetPane(claudeHost($), 'tasks'))} />
      {footer(scoutListKeys(), 'scouts-keys')}
    </Box>
  )
}
