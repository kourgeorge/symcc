// The board panel's Scouts view: the list, one scout's page, and its edit mode.
import { scoutRow, scoutFile, scoutReport, scoutTone, scoutIcon, scoutKeys, scoutListRows, scoutHowTo, scoutListKeys, scoutEditKeys } from '../../board'
import { saveScout, cancelScoutEdit, runScoutNow, editScout, setScoutPaused, newScout } from '../scouts'
import { type $, S, readScoutOpen, updateScoutOpen } from '../state'
import type { PaneParts } from './parts'

/** A scout's edit mode: the same header as its page, then a box per part of its file. */
export function scoutEditPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, act, C, scouts, heading, footer } = pane
  // A scout's edit mode: the same header as its page, then a box per part of its file.
  // (renderPane calls this only while S.draft is set)
  const d = S.draft!
  const sc = scouts.find(x => x.name === d.scout)
  const r = sc ? scoutRow(sc, Date.now()) : undefined
  const file = scoutFile(d.scout, S.N.name)
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('claude')}>{d.scout}</Text>{' '}
          <Text bold color={C('warning')}>{d.isNew ? 'new scout' : 'editing'}</Text>
          {r ? <Text color={C('subtle')}> · {r.every}{r.model ? ` · ${r.model}` : ''} · {r.ran}</Text> : null}
        </Text>
        <Text color={C('subtle')}>save writes {file} · other front matter keys are kept</Text>
      </Box>

      <Box flexDirection="row" gap={1}>
        <Button key="scout-save" label="Save" onPress={act(() => saveScout($))} />
        <Button key="scout-cancel" label="Cancel" onPress={() => cancelScoutEdit($)} />
      </Box>

      {d.error ? <Text color={C('error')}>{d.error}</Text> : null}

      <Box flexDirection="column">
        {heading('every (minutes)')}
        <Input key="scout-every" value={d.every} placeholder="a whole number: 0, or 1 or more" autoFocus submitLabel="keep" onInput={value => void (d.every = value)} onSubmit={value => void (d.every = value)} />
        <Text color={C('subtle')}>0 = only on demand</Text>
      </Box>

      <Box flexDirection="column">
        {heading('model')}
        <Input key="scout-model" value={d.model} placeholder="empty: the session's model" submitLabel="keep" onInput={value => void (d.model = value)} onSubmit={value => void (d.model = value)} />
      </Box>

      <Box flexDirection="column">
        {heading('instructions')}
        <Input key="scout-body" value={d.body} rows={8} placeholder="what to look for, in plain words" submitLabel="keep" onInput={value => void (d.body = value)} onSubmit={value => void (d.body = value)} />
      </Box>
      {footer(scoutEditKeys(), 'scout-edit-keys')}
    </Box>
  )
}

/** The Scouts view: one scout's page when one is open, else the list of scouts. */
export async function scoutsPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, width, act, C, scouts, header, footer, buttonRows, heading, paragraphs } = pane
  const nowMs = Date.now()
  const opener = await readScoutOpen($)
  const sc = typeof opener === 'string' && opener ? scouts.find(x => x.name === opener) : undefined
  if (sc) {
    const r = scoutRow(sc, nowMs)
    const file = scoutFile(sc.name, S.N.name)
    const report = scoutReport(sc.last_report)
    const title = (sc.prompt ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? sc.name
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            <Text bold color={C('claude')}>{sc.name}</Text>{' '}
            <Text bold color={C(scoutTone(sc))}>
              {scoutIcon(sc)} {r.state || 'waiting'}
              {sc.running && sc.paused ? ', then paused' : ''}
            </Text>
            <Text color={C('subtle')}>
              {' · '}
              {r.every}
              {r.model ? ` · ${r.model}` : ''} · {r.ran}
            </Text>
          </Text>
          <Text bold color={C('text')}>
            {title}
          </Text>
          {sc.warning ? <Text color={C('warning')}>{sc.warning}</Text> : null}
        </Box>

        {buttonRows([
          <Button key="scout-back" label="Back" hotkey="b" autoFocus onPress={act(() => updateScoutOpen($, () => ''))} />,
          // no Run now while it runs: it couldn't start again until this run ends
          !sc.running && <Button key="scout-run" label="Run now" hotkey="r" onPress={act(async () => $.ui.toast(S.N.toast(await runScoutNow($, sc.name))))} />,
          <Button key="scout-edit" label="Edit" hotkey="e" onPress={act(() => editScout($, sc))} />,
          <Button key="scout-pause" label={sc.paused ? 'Resume' : 'Pause'} hotkey="p" onPress={act(async () => $.ui.toast(S.N.toast(await setScoutPaused($, sc.name, !sc.paused))))} />,
        ], 'scout-buttons')}

        <Box flexDirection="column">
          {heading('What it looks for')}
          {sc.prompt?.trim() ? paragraphs(sc.prompt.trim()) : <Text color={C('subtle')}>(not loaded yet: run /{S.N.name}-scouts)</Text>}
        </Box>

        <Box flexDirection="column">
          {heading('Last report')}
          {report === 'nothing found' ? <Text color={C('subtle')}>{sc.last_run ? 'nothing found' : 'nothing found (it has not run yet)'}</Text> : paragraphs(report)}
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
  /** "New scout": a button, or (once pressed) the box that asks for its name. */
  const newBox = () =>
    S.naming ? (
      <Box flexDirection="column">
        <Input
          key="scout-new-name"
          label="New scout's name: "
          placeholder="letters, digits, - and _"
          value={S.naming.name}
          autoFocus
          submitLabel="next"
          onInput={value => void (S.naming && (S.naming.name = value))}
          onSubmit={value => act(() => newScout($, value, scouts.map(x => x.name)))()}
        />
        {S.naming.error ? <Text color={C('error')}>{S.naming.error}</Text> : null}
        <Text color={C('subtle')}>Enter goes on to its file · Esc cancels</Text>
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
      {scouts.length === 0 && scoutHowTo(S.N.name).map((line, i) => <Text color={C(i === 0 ? 'text' : 'subtle')}>{line}</Text>)}
      {newBox()}
      {scouts.length > 0 && <Text key="scouts-blank-top"> </Text>}
      {scouts.map((x, i) => {
        const r = rows[i]!
        return (
          <Button key={`scout:${x.name}`} label={`${x.name}: ${scoutRow(x, nowMs).state || 'waiting'}`} autoFocus={i === 0 ? true : undefined} onPress={act(() => updateScoutOpen($, () => x.name))}>
            <Text color={C(r.tone)}>{`  ${r.icon} `}</Text>
            <Text bold={!x.paused} color={C(x.paused ? 'subtle' : 'claude')}>{r.name}</Text>
            <Text color={C('subtle')}>{r.every}</Text>
            <Text color={C(r.stateTone)}>{r.state}</Text>
            <Text color={C(r.lastTone)}>{r.last}</Text>
            <Text color={C('subtle')}>{r.model}</Text>
          </Button>
        )
      })}
      <Text key="scouts-blank"> </Text>
      {footer(scoutListKeys(), 'scouts-keys')}
    </Box>
  )
}
