import { expect, test } from 'claude-code/testing'
import { SETTINGS } from '../hooks/board'
import { TOOLS, manual, MANUAL, leadGuide } from '../hooks/app/tools'
import { ALL_FEATURES } from '../hooks/host'
import { SCOUT_EDIT_FIELDS } from '../hooks/core/commands'

test('/symcc-help lead names every lead tool and every setting', () => {
  const text = manual('lead')
  for (const t of TOOLS()) expect(text).toContain(t.name)
  for (const s of SETTINGS) expect(text).toContain(s.name)
  expect(text).toContain('scouts · roles · kinds · orgmem · stats · setup_git')
})

test('T-765: the OpenCode lead help lists open_on_start, as its board opens by itself (T-756)', () => {
  // OpenCode's features (hooks/opencode/host.ts OPENCODE_FEATURES): no panel or band in the engine's sense
  const opencode = { ...ALL_FEATURES, panel: false, band: false, planMode: false, startQueue: false }
  const text = manual('lead', opencode)
  expect(text).toContain('open_on_start (OpenCode only: the board panel opens by itself once a')
  const settings = text.slice(text.indexOf('settings: test_commands'))
  expect(settings.indexOf('open_on_start')).toBeGreaterThan(settings.indexOf('archive_days'))
  expect(settings.indexOf('open_on_start')).toBeLessThan(settings.indexOf('notify'))
})

test('T-876: the manual names plain /symcc-enable as the one on switch, never /symcc-enable here', () => {
  const text = Object.values(MANUAL()).join('\n') + leadGuide()
  expect(text).toContain('/symcc-disable here        turn it off in this window only')
  expect(text).toContain('/symcc-enable              the one on switch: symcc on, in this window')
  expect(text).not.toContain('enable here')
})

test('T-876: the manual names every /symcc-scout NAME field word', () => {
  const text = manual('commands')
  for (const field of SCOUT_EDIT_FIELDS) expect(text).toContain(`/symcc-scout NAME ${field} `)
  expect(text).toContain('/symcc-scout NAME findings auto|backlog|default')
})

test('T-876: the lead guide says the [all] button opens all org-mem notes, not an m key', () => {
  const text = leadGuide()
  expect(text).not.toContain('m opens all notes')
  expect(text).toContain('the [all] button next to "newest" opens all notes')
})

test('the lead has no prompts tool: the worker prompts are built-in only', () => {
  expect(TOOLS().map(t => t.name)).not.toContain('prompts')
  expect(manual('lead')).not.toContain('prompts/change.md')
})

test('/symcc-help says a typed test command is one whole line and several go in a list, not joined with &&', () => {
  const text = manual('lead') + manual('')
  expect(text).not.toContain('join them with " && "')
  expect(text).toContain('a typed line is one whole shell command; several go in a list like ["npm test", "npm run lint"]')
  expect(text).not.toContain('one per line')
})

test('the lead help says secret-looking files are left out of a worker\'s commit and merge', () => {
  const text = manual('safety')
  expect(text).toContain('look like secrets')
  expect(text).toContain('are left out')
  expect(text).toContain('left-out/<task>/')
})

test('the checker texts say it runs before the merge queue, not after the tests pass; a test time-out is a normal failed try', () => {
  const view = SETTINGS.find(s => s.name === 'checker')!.meaning
  const tool = TOOLS().find(t => t.name === 'settings')!
  const props = (tool.inputSchema as unknown as { properties: Record<string, { description?: string }> }).properties
  const help = manual('lead') + manual('')
  for (const text of [view, help, tool.description, props.checker!.description!]) {
    expect(text).not.toContain('whose tests passed')
    expect(text).not.toContain('after its tests pass')
  }
  expect(view).toContain('before a change joins the merge queue')
  expect(help).toContain('before a change joins the merge queue')
  expect(tool.description).toContain('before a change task joins the merge queue')
  expect(props.checker!.description).toContain('before it joins the merge queue')
  // T-605: the merge queue's words, and a row's later try as "(n)" after its time (T-604)
  expect(help).not.toContain('merge line')
  expect(help).not.toContain('tester · try 2')
  // T-642: since T-628 only the band (and the task page) show the try, not the list rows
  // T-939: every client's band writes a later try as "↺3"; the checker's send-backs on Live rows are "⌕×N"
  expect(help).toContain('The list rows show no try number; the band above the prompt (in every client) shows a later try as "↺3" right after the step\'s time ("T-5 ⊛ 3m ↺3"; nothing on try 1)')
  expect(help).toContain('"⌕×2" means the checker sent the task back twice')
  expect(help).not.toContain('(try 3)')
  expect(help).not.toContain('3m (3)')
  expect(help).not.toContain('shows a later try as "(n)"')
  // T-896: the band shows the step only as its icon, no step word, in the manual's example too
  for (const word of ['test', 'queue', 'prep', 'merge', 'checker']) expect(help).not.toContain(`T-5 ⊛ ${word} `)
  expect(help).not.toContain('Claude') // T-814: the manual names no host's band by its host name (tests/host-words.test.ts)
  expect(help).toContain('the task page shows "try 3/4"')
  expect(help).not.toContain('A later try shows as "(n)"')
  const minutes = tool.description.slice(tool.description.indexOf('test_minutes ('), tool.description.indexOf('max_parallel'))
  expect(minutes).toContain('fails like a failing test')
  expect(minutes).not.toContain('run again')
  expect(minutes).not.toContain('owner is asked')
})

test('the help, the lead guide and the settings tool call the stopped board mode paused, never off', () => {
  const settings = TOOLS().find(t => t.name === 'settings')!
  const text = Object.values(MANUAL()).join('\n') + leadGuide() + settings.description
  expect(text).toContain('one mode: paused (nothing runs)')
  expect(text).toContain('The mode (paused, review, auto)')
  expect(text).toContain('going from paused to review or auto')
  for (const old of ['mode: off', 'never to off', 'also off.', '(off, review, auto)', 'from off to review']) expect(text).not.toContain(old)
})

test('/symcc-help commands names the newer command forms and the l (Live) key', () => {
  const text = manual('commands')
  for (const form of [
    '-scout NAME every N', '-scout NAME model M', '-scout NAME prompt TEXT', '-scout NAME new TEXT',
    '-settings role|kind NAME on|off|reset|remove|add', '-settings role|kind NAME edit FIELD VALUE', '-settings role|kind NAME save {json}',
    '-settings git setup', '-settings orgmem delete N [KEY]', 'On the board: t tasks · l live',
  ]) expect(text).toContain(form)
  expect(manual('commands', { ...ALL_FEATURES, panel: false })).toContain('-board ')
})

test('T-885: the manual says a worker that symcc itself stopped goes on with the same try instead of failing (T-883)', () => {
  const text = leadGuide()
  expect(text).toContain('A worker whose run ended on an API error')
  expect(text).toContain('when symcc itself stopped that worker (a reload, a takeover, driving moved to another session), the try does not fail: a new worker goes on with the same try')
})
