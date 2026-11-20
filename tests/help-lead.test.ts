import { expect, test } from 'claude-code/testing'
import { SETTINGS } from '../hooks/board'
import { TOOLS, manual } from '../hooks/app/tools'

test('/symcc-help lead names every lead tool and every setting', () => {
  const text = manual('lead')
  for (const t of TOOLS()) expect(text).toContain(t.name)
  for (const s of SETTINGS) expect(text).toContain(s.name)
  expect(text).toContain('scouts · roles · kinds · stats · setup_git')
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

test('the checker texts say it runs before the merge line, not after the tests pass; a test time-out is a normal failed try', () => {
  const view = SETTINGS.find(s => s.name === 'checker')!.meaning
  const tool = TOOLS().find(t => t.name === 'settings')!
  const props = (tool.inputSchema as unknown as { properties: Record<string, { description?: string }> }).properties
  const help = manual('lead') + manual('')
  for (const text of [view, help, tool.description, props.checker!.description!]) {
    expect(text).not.toContain('whose tests passed')
    expect(text).not.toContain('after its tests pass')
  }
  expect(view).toContain('before a change joins the merge line')
  expect(help).toContain('before a change joins the merge line')
  expect(tool.description).toContain('before a change task joins the merge line')
  expect(props.checker!.description).toContain('before it joins the merge line')
  const minutes = tool.description.slice(tool.description.indexOf('test_minutes ('), tool.description.indexOf('max_parallel'))
  expect(minutes).toContain('fails like a failing test')
  expect(minutes).not.toContain('run again')
  expect(minutes).not.toContain('owner is asked')
})
