// The board panel's Scouts view: the list, one scout's page, and its edit mode.
import { scoutRow, scoutFile, scoutTone, scoutIcon, scoutKeys, scoutListRows, scoutHowTo, scoutListKeys, scoutEditKeys, boxHint, scoutRunTasks, scoutRunLine, scoutOutcomeTone, scoutLastRunProblem } from '../../board'
import { saveScout, cancelScoutEdit, runScoutNow, editScout, setScoutPaused, newScout, loadScoutRunHistory, loadScoutResults, readScoutRunReport, scoutPlace, scoutPlaceValue } from '../../app/scouts'
import { S } from '../../app/state'
import { type $, panelValues } from '../panel'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { resetPane } from '../../app/open'
import { scoutEditPageVs, scoutPageVs, scoutsListVs } from './vscode-scouts'
import { claudeHost } from '../host'

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
        {heading('Summary')}
        <Input key="scout-summary" value={d.summary} placeholder="empty: the first line of the instructions" submitLabel="keep" onInput={value => void (d.summary = value)} onSubmit={value => void (d.summary = value)} />
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
  if (pane.vscode) return sc ? scoutPageVs($, pane, sc, place.run) : scoutsListVs($, pane)
  if (sc) {
    const r = scoutRow(sc, nowMs)
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
    // the subheader: the summary from the file's front matter, else the first line of the instructions (in the inactive colour)
    const firstLine = (sc.prompt ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? ''
    const title = sc.summary?.trim() || firstLine
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            <Text bold color={C('claude')}>{sc.name}</Text>{' '}
            <Text bold color={C(scoutTone(sc))}>
              {scoutIcon(sc)} {r.state || 'waiting'}
              {sc.running && sc.paused ? ', then paused' : ''}
            </Text>
            <Text color={C('inactive')}>
              {' · '}
              {r.every}
              {r.model ? ` · ${r.model}` : ''} · {r.ran}
            </Text>
          </Text>
          {title ? (
            <Text bold={!!sc.summary?.trim()} color={C(sc.summary?.trim() ? 'text' : 'inactive')}>
              {title}
            </Text>
          ) : null}
          {sc.warning ? <Text color={C('warning')}>{sc.warning}</Text> : null}
          {problem && !sc.running ? <Text color={C('error')}>{problem}</Text> : null}
          {results ? <Text color={C('inactive')}>{results}</Text> : null}
        </Box>

        {buttonRows([
          <Button key="scout-back" label="Back" hotkey="b" autoFocus onPress={act(() => panelValues($).updateScoutOpen(() => ''))} />,
          // no Run now while it runs: it couldn't start again until this run ends
          !sc.running && <Button key="scout-run" label="Run now" hotkey="r" onPress={act(async () => $.ui.toast(S.N.toast(await runScoutNow(claudeHost($), sc.name))))} />,
          <Button key="scout-edit" label="Edit" hotkey="e" onPress={act(() => editScout(claudeHost($), sc))} />,
          <Button key="scout-pause" label={sc.paused ? 'Resume' : 'Pause'} hotkey="p" onPress={act(async () => $.ui.toast(S.N.toast(await setScoutPaused(claudeHost($), sc.name, !sc.paused))))} />,
        ], 'scout-buttons')}

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

        <Box flexDirection="column">
          {heading('File')}
          <Text>
            {'  '}
            <Text color={C('autoAccept')}>{file}</Text>
          </Text>
        </Box>
        {footer(scoutKeys(sc.paused === true, sc.running === true), 'scout-keys')}
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
  const rows = scoutListRows(scouts, nowMs, width)
  return (
    <Box flexDirection="column">
      {header()}
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
