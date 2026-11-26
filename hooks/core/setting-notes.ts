// The words in a setting's pick box or edit box (T-1105): one plain sentence about the setting, and one short note per
// choice. One list, drawn by the terminal's box, VS Code's panel and OpenCode's dialog, so the words match everywhere.
import { settingInfo, settingShown, type SettingName } from './settings'
import { textWidth } from './width'

/** The unit written after a number setting's range ("1-120 minutes"). */
const UNIT: Partial<Record<SettingName, string>> = { test_minutes: ' minutes', max_minutes: ' minutes', archive_days: ' days' }

/** One plain sentence on what setting `name` does; a number setting ends with its allowed range. '' for an unknown name. */
export function settingAbout(name: string): string {
  const x = settingInfo(name)
  if (!x) return ''
  const range = `${x.range.replace(/ \(.*\)$/, '')}${UNIT[x.name] ?? ''}`
  const zero = x.name === 'archive_days' ? ' (0 = never)' : ''
  switch (x.name) {
    case 'test_commands': return 'Shell commands that must all pass before work is merged: one line, or up to 5 as a list.'
    case 'docs_test_commands': return 'Run instead of the test commands when only prose changed, such as a docs link check.'
    case 'test_minutes': return `How long each test command may run before it fails: ${range}.`
    case 'max_parallel': return `How many workers run at once: ${range}.`
    case 'max_minutes': return `How long a worker runs before symcc asks you for more time: ${range}.`
    case 'auto_retries': return `How many new tries a task gets on its own after failing tests: ${range}.`
    case 'archive_days': return `Done and dropped tasks older than this move to the archive: ${range}${zero}.`
    case 'open_on_start': return 'Whether the board panel opens when a session starts.'
    case 'notify': return 'What plays when a task is merged or a worker asks you something.'
    case 'scout_findings': return 'Where the tasks made from a scout finding go, for scouts without their own choice.'
    case 'tests_with_changes': return 'What happens to a change that edits code but no test file.'
    case 'checker': return 'Whether a fresh checker tries to break each change before it joins the merge queue.'
    case 'mode': return 'Whether work runs, and whether finished work merges on its own or waits for you.'
    case 'enabled': return 'Whether symcc works at all in this project.'
  }
}

const NOTES: Partial<Record<SettingName, Record<string, string>>> = {
  mode: { paused: 'nothing starts; running work stops', review: 'finished work waits for you to approve', auto: 'finished work that passes merges on its own' },
  notify: { voice: 'says what happened out loud', 'sound 1': 'a short chime, sound set 1', 'sound 2': 'a short chime, sound set 2', 'sound 3': 'a short chime, sound set 3', off: 'nothing plays' },
  scout_findings: { auto: 'the lead decides; a new task goes to todo and runs', backlog: 'a new task waits in the backlog for you' },
  tests_with_changes: { off: 'not checked', ask: 'it merges, and the lead is told it had no test', review: 'it waits for your review instead of merging' },
  checker: { on: 'a checker looks at each change first', off: 'changes go straight on' },
  open_on_start: { on: 'the panel opens with the session', off: 'the panel stays closed' },
  enabled: { on: 'symcc works as normal', off: 'symcc rests' },
}

/** The short note after choice `value` of setting `name`; '' when it has none. */
export const choiceNote = (name: string, value: string): string => NOTES[name as SettingName]?.[value] ?? ''

/** Setting `name` in one line for the lead and the text board: its sentence, then each choice with its note ("review: finished work waits for you"). */
export function settingWords(name: string): string {
  const notes = Object.entries(NOTES[name as SettingName] ?? {}).map(([value, note]) => `${value}: ${note}`)
  return [settingAbout(name), ...notes].join(' · ')
}

/** `text` cut at spaces into lines of at most `width` columns (a longer word stays whole). */
export function wrapWords(text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && textWidth(line) + 1 + textWidth(w) > width) (out.push(line), (line = w))
    else line = line ? `${line} ${w}` : w
  }
  return line ? [...out, line] : out
}

/** One choice of a pick box: `label` as shown, `pad` the spaces between it and its note when they share a line, `note`
 *  its wrapped lines (`inline`: the first one sits on the choice's line; else all sit under it, indented 2). */
export type PickRow = { value: string; label: string; inline: boolean; pad: string; note: string[] }

/** The lines of setting `name`'s pick box for `inner` columns inside its border: the description (wrapped), and a row per
 *  choice with its note. `extra` is what the choice's own line takes besides its label (a Button's "[ ", the ○ or ● and " ]": 6). */
export function pickBoxParts(name: string, values: readonly string[], inner: number, extra = 6): { about: string[]; rows: PickRow[] } {
  const labels = values.map(v => settingShown(name, v))
  const labelW = Math.max(0, ...labels.map(l => textWidth(l) + extra))
  const rows = values.map((value, i): PickRow => {
    const label = labels[i]!
    const note = choiceNote(name, value)
    const room = inner - labelW - 2
    if (!note) return { value, label, inline: true, pad: '', note: [] }
    if (textWidth(note) <= room) return { value, label, inline: true, pad: ' '.repeat(labelW - textWidth(label) - extra + 2), note: [note] }
    return { value, label, inline: false, pad: '  ', note: wrapWords(note, Math.max(10, inner - 2)) }
  })
  return { about: wrapWords(settingAbout(name), inner), rows }
}
