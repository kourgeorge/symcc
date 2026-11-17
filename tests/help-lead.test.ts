import { expect, test } from 'claude-code/testing'
import { SETTINGS } from '../hooks/board'
import { TOOLS, manual } from '../hooks/plugin/tools'

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
