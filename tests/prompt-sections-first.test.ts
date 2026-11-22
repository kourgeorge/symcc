// T-853: hooks/core/prompt-sections.ts can be the first module loaded. It imports board-file.ts, which (through history.ts and
// roles.ts) imports prompts.ts, which imports prompt-sections.ts back. prompts.ts used to build its prompt tables at load, so
// loading prompt-sections.ts first failed with "Cannot access 'PROMPT_SECTIONS' before initialization". The tables are now
// made on first read; this test checks they hold the same values as before. The test kit loads other modules first, so the
// load order itself is checked by tests/prompt-sections-first.sh (a fresh bun per file).
import { PROMPT_SECTIONS, promptTemplate } from '../hooks/core/prompt-sections'
import { expect, test } from 'claude-code/testing'
import { BUILT_IN_PROMPTS, PROMPT_KINDS, PROMPT_PLACEHOLDERS, ROLE_PLACEHOLDERS, ROLE_PROMPTS } from '../hooks/core/prompts'

test('T-853: prompt-sections.ts loads first, and the prompt tables still hold the same values', () => {
  expect(PROMPT_SECTIONS.length > 0).toBe(true)
  for (const k of PROMPT_KINDS) {
    expect(BUILT_IN_PROMPTS[k]).toBe(promptTemplate(k))
    expect(ROLE_PROMPTS[k]).toBe(promptTemplate(k))
  }
  expect(ROLE_PROMPTS.checker).toBe(promptTemplate('checker'))
  expect(Object.keys(BUILT_IN_PROMPTS)).toEqual(['change', 'investigation'])
  expect(Object.keys(ROLE_PROMPTS)).toEqual(['change', 'investigation', 'checker'])
  expect({ ...ROLE_PROMPTS }).toEqual({ change: promptTemplate('change'), investigation: promptTemplate('investigation'), checker: promptTemplate('checker') })
  // made once, then kept: the same object every read
  expect(PROMPT_PLACEHOLDERS.change === PROMPT_PLACEHOLDERS.change).toBe(true)
  expect(ROLE_PLACEHOLDERS.files).toBe(PROMPT_PLACEHOLDERS.change.files)
  expect(ROLE_PLACEHOLDERS.test_command).toBe(PROMPT_PLACEHOLDERS.change.test_command)
  expect(PROMPT_PLACEHOLDERS.investigation).toHaveProperty('ask_more')
})
