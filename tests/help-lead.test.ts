import { expect, test } from 'claude-code/testing'
import { SETTINGS } from '../hooks/board'
import { TOOLS, manual } from '../hooks/plugin/tools'

test('/symcc-help lead names every lead tool and every setting', () => {
  const text = manual('lead')
  for (const t of TOOLS()) expect(text).toContain(t.name)
  for (const s of SETTINGS) expect(text).toContain(s.name)
  expect(text).toContain('scouts · roles · stats · setup_git')
})
