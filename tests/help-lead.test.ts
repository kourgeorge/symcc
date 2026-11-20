import { expect, test } from 'claude-code/testing'
import { SETTINGS } from '../hooks/board'
import { TOOLS, manual, MANUAL, leadGuide } from '../hooks/app/tools'

test('/symcc-help lead names every lead tool and every setting', () => {
  const text = manual('lead')
  for (const t of TOOLS()) expect(text).toContain(t.name)
  for (const s of SETTINGS) expect(text).toContain(s.name)
  expect(text).toContain('scouts · roles · kinds · orgmem · stats · setup_git')
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
  expect(help).toContain('The list rows show no try number; the band above the prompt shows a later try as "(n)" right after the row\'s time ("T-5 ⊛ 3m (3)")')
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
