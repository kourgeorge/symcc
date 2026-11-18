// The board panel's Scouts view in VS Code's side panel (see surface.ts and vscode.tsx). The terminal's list
// (scouts-page.tsx) packs each scout on one line of columns, cut to the width; here each scout gets a few readable
// lines instead:
//   security-advisories  ◎ next in 3h        (the name is the button that opens it; the mark in its color)
//     every day · ran 21h ago                (how often, model, when it ran: dim)
//     Checks the advisories …                (the summary, whole)
//     last report: found 5: The package …    (the start of the last report, whole)
// One scout's page: a "← Scouts" button, the name and state, its facts, Run now / Pause / Edit as buttons, then the
// instructions and the whole last report as Markdown. No key hints.
import type { SymccScout } from '../../../types'
import { scoutRow, scoutFile, scoutIcon, scoutHowTo, scoutLastText, everyText, isNothing, fmtDuration, BAD_EVERY_STATE } from '../../board'
import { cancelScoutEdit, runScoutNow, editScout, setScoutPaused, newScout } from '../scouts'
import { S } from '../state'
import { type $, panelValues } from '../../claude/panel'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { resetPane } from './open'
import { claudeHost } from '../../claude/host'
import { vsFooter, vsSection } from './vscode'

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
  return line.replace(/^(?:\*\*|__)?\d{1,2}[.):]\s+/, '').replace(/[*_`]/g, '')
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
  const nowMs = Date.now()
  let first = true
  const focusFirst = (): true | undefined => (first ? ((first = false), true) : undefined)
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
    return (
      <Box key={`vs-scout-${x.name}`} flexDirection="column">
        <Box key={`vs-scout-${x.name}-top`} flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button key={row(`scout:${x.name}`)} plain label={`Open ${x.name}`} autoFocus={focusFirst()} onPress={act(() => panelValues($).updateScoutOpen(() => x.name))}>
            <Text wrap="wrap" bold={!x.paused} color={C(x.paused ? 'inactive' : 'claude')}>{x.name}</Text>
          </Button>
          <Text key="mark" color={C(markTone(x))}>{`${scoutIcon(x)} ${vsScoutState(x, nowMs)}`}</Text>
        </Box>
        <Box key={`vs-scout-${x.name}-body`} flexDirection="column" paddingLeft={2}>
          {plain('facts', facts)}
          {title ? plain('title', title, 'text') : null}
          {x.warning ? plain('warning', x.warning, 'warning') : null}
          {last.text ? plain('last', last.text, last.tone) : null}
        </Box>
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
      <Button key="scout-new" label="+ New scout" variant="secondary" autoFocus={scouts.length === 0 ? true : undefined} onPress={() => ((S.naming = { name: '', error: '' }), $.ui.invalidate('ui.render'))} />
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Box key="vs-header" flexDirection="column">
        {[...banner(), tabs()]}
      </Box>
      {scouts.length === 0 ? <Box key="vs-scouts-howto" flexDirection="column">{scoutHowTo(S.N.name).map((line, i) => plain(`howto-${i}`, line.replace(/ \([a-z]\)(?=\s|$)/g, ''), i === 0 ? 'text' : 'inactive'))}</Box> : null}
      {scouts.map(scoutBox)}
      {newBox}
      <Box key="vs-scouts-back-row" flexDirection="row">
        <Button key="scouts-back" label="← Tasks" variant="secondary" onPress={act(() => resetPane(claudeHost($), 'tasks'))} />
      </Box>
      {vsFooter(vs, 'scouts-keys')}
    </Box>
  )
}

/** One scout's page in VS Code. */
export function scoutPageVs($: $, pane: PaneParts, sc: SymccScout) {
  const { Box, Text, Button, act, C, vs } = pane
  const { Markdown } = vs
  const nowMs = Date.now()
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
      {section('file', 'File', [plain('vs-scout-file', file, 'autoAccept')])}
      {vsFooter(vs, 'scout-keys')}
    </Box>
  )
}
