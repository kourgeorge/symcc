// The board panel's Scouts tab (T-559), as plain data (T-798: split out of board-view.ts): the list of scouts, a
// scout's page and one run's page.
import type { SymccScout } from '../../types'
import { sortScouts, scoutListRows, scoutFindingsOf, findingsLine, findingsDefaultLine, scoutHowTo, scoutRunLine, scoutOutcomeTone, scoutLastRunProblem, scoutFile, scoutProjectsLine } from '../board'
import { placeIn, scoutAbout, scoutListNames, scoutStateGroups } from '../core/page-header'
import { type ViewFile, type PanelChoice, type PanelButton, type Body, bodyMaker, backButton, textLines, scoutNamed, scoutRunsIn, buttonLines, BACK_BUTTON, headerLines, scoutButtons } from './board-view'

/** The "+ New scout" button (n), as on Claude Code's Scouts page. */
export const NEW_SCOUT_BUTTON: PanelButton = { label: '+ New scout', hit: { key: 'n' } }

/** The Scouts tab: the list of scouts (as Claude Code's: icon, name, how often, state, last result, model), a
 *  scout's page (its header, instructions, recent runs and file) or one run's page (its line and report). */
export function scoutsBody(f: ViewFile, choice: PanelChoice, nowMs: number, w: number): Body {
  const b = bodyMaker()
  const sc = scoutNamed(f, choice.opened)
  if (sc) return scoutPage(f, sc, choice, nowMs, w)
  const scouts = sortScouts(f.view.scouts ?? [])
  if (!scouts.length) {
    // the how-to, then Claude Code's "+ New scout" button (n, T-706)
    for (const [i, l] of scoutHowTo(f.name).entries()) b.add([{ text: l, color: i === 0 ? 'text' : 'inactive' }])
    for (const l of buttonLines([NEW_SCOUT_BUTTON], w)) b.add(l)
    b.blank()
    backButton(b, w)
    return { ...b, ids: [], selected: '' }
  }
  const ids = scouts.map(x => x.name)
  const selected = ids[Math.min(Math.max(0, choice.cursor), ids.length - 1)]!
  const board = scoutFindingsOf(f.view)
  const rows = scoutListRows(scouts, nowMs, w, 2, board)
  // T-912: where findings go for a scout with no choice of its own
  b.add([{ text: `  ${findingsDefaultLine(board)}`, color: 'inactive' }])
  // T-706: Claude Code's "+ New scout" button (n) above the list
  for (const l of buttonLines([NEW_SCOUT_BUTTON], w)) b.add(l)
  b.blank()
  scouts.forEach((x, i) => {
    const r = rows[i]!
    b.add(
      [
        { text: x.name === selected ? '› ' : '  ', color: 'ide', bold: true },
        { text: `${r.icon} `, color: r.tone },
        { text: r.name, color: x.paused ? 'inactive' : 'claude', ...(x.paused ? {} : { bold: true }) },
        { text: r.every, color: 'inactive' },
        { text: r.state, color: r.stateTone },
        { text: r.last, color: r.lastTone },
        { text: r.findings, color: 'inactive' },
        { text: r.model, color: 'inactive' },
      ],
      { scout: x.name },
    )
  })
  b.blank()
  b.add([{ text: `Enter opens a scout · /${f.name}-scout <name> runs one now`, color: 'inactive' }])
  b.blank()
  backButton(b, w)
  return { ...b, ids, selected }
}

/** A scout's page, or the page of its open run (choice.run). The cursor goes over its runs. */
function scoutPage(f: ViewFile, sc: SymccScout, choice: PanelChoice, nowMs: number, w: number): Body {
  const b = bodyMaker()
  const shown = scoutRunsIn(f, sc.name)
  const opened = choice.run ? shown.find(x => x.run.ended === choice.run) : undefined
  if (opened) {
    b.add([{ text: sc.name, color: 'claude', bold: true }, { text: ` · run that ended ${opened.run.ended}`, color: 'inactive' }])
    for (const l of buttonLines([BACK_BUTTON], w)) b.add(l)
    const head = b.lines.length
    b.add([{ text: scoutRunLine(opened.run, opened.tasks, nowMs), color: scoutOutcomeTone(opened.run.outcome) }])
    if (opened.run.why) b.add([{ text: opened.run.why, color: 'error' }])
    b.blank()
    b.heading('Report')
    const report = opened.run.report
    if (!report) b.add([{ text: '  (this run reported nothing)', color: 'inactive' }])
    else if (choice.report === undefined) b.add([{ text: '  (reading the report…)', color: 'inactive' }])
    else if (choice.report === null || !choice.report.trim()) b.add([{ text: `  (its report file ${report} can't be read)`, color: 'inactive' }])
    else for (const l of textLines(choice.report.trim(), 'text', w)) b.add(l)
    if (report) {
      b.blank()
      b.heading('File')
      b.add([{ text: `  ${report}`, color: 'autoAccept' }])
    }
    return { ...b, ids: [], selected: '', head }
  }
  // T-751: the page header, as on Claude Code's scout page: ‹ Scouts and its place, its name and what it does, its
  // state, its buttons in groups, a thin rule; it stays at the top while the rest scrolls
  const last = shown[0]
  for (const l of headerLines({ from: 'scouts', label: sc.name, place: placeIn(scoutListNames(f.view.scouts ?? []), sc.name), title: scoutAbout(sc), color: 'claude', state: scoutStateGroups(sc, nowMs, last), buttons: scoutButtons(sc) }, w)) b.add(l)
  const headLines = b.lines.length
  // T-912: its findings choice; f (or a click on the line) moves it on, sent as /<name>-scout <name> findings ...
  const said = findingsLine(sc.findings, scoutFindingsOf(f.view))
  b.add([{ text: 'Findings: ', color: 'text', bold: true }, { text: said.slice('Findings: '.length), color: 'inactive' }, { text: '  (f changes it)', color: 'inactive' }], { key: 'f' })
  b.add([{ text: scoutProjectsLine((sc as { projects?: string[] }).projects, f.view.projects), color: 'inactive' }])
  // the summary from the file's front matter, if one is set (the instructions show in full below)
  if (sc.warning) b.add([{ text: sc.warning, color: 'warning' }])
  const problem = scoutLastRunProblem([...shown].reverse().map(x => x.run))
  if (problem && !sc.running) b.add([{ text: problem, color: 'error' }])
  b.blank()
  b.heading('Instructions')
  if (sc.prompt?.trim()) for (const l of textLines(sc.prompt.trim(), 'text', w)) b.add(l)
  else b.add([{ text: `  (not loaded yet: run /${f.name}-scout)`, color: 'inactive' }])
  b.blank()
  b.heading('Runs')
  const ids = shown.map(x => x.run.ended)
  const selected = ids.length ? ids[Math.min(Math.max(0, choice.cursor), ids.length - 1)]! : ''
  b.add([{ text: shown.length ? '  Enter on a run shows its report' : '  (no runs yet)', color: 'inactive' }])
  for (const x of shown) b.add([{ text: x.run.ended === selected ? '› ' : '  ', color: 'ide', bold: true }, { text: scoutRunLine(x.run, x.tasks, nowMs), color: scoutOutcomeTone(x.run.outcome) }], { run: x.run.ended })
  // T-686: its Results figures (last 7 days, then in all) in their own section, just before File
  const results = f.view.scout_results?.[sc.name]
  if (typeof results === 'string' && results) {
    b.blank()
    b.heading('Results')
    for (const l of textLines(results, 'inactive', w)) b.add(l)
  }
  b.blank()
  b.heading('File')
  b.add([{ text: `  ${scoutFile(sc.name, f.name)}`, color: 'autoAccept' }])
  return { ...b, ids, selected, head: headLines }
}
