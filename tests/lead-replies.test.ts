import { expect } from 'claude-code/testing'
import { test } from './reset'
import { leadGuide } from '../hooks/app/tools'
import { S } from '../hooks/app/state'
import { ALL_FEATURES, SYMCC_WORDS, type HostWords } from '../hooks/host'
import { CLAUDE_WORDS } from '../hooks/claude/host'

// T-766: the lead's replies have fixed short shapes, on every host (the guide goes into every model call:
// prompt.compose in Claude Code, the context hook in OpenCode).
// OpenCode's features and words (hooks/opencode/host.ts OPENCODE_FEATURES, OPENCODE_WORDS), copied so this test
// doesn't load the OpenCode host.
const OPENCODE_FEATURES = { ...ALL_FEATURES, panel: false, band: false, planMode: false, startQueue: false }
const OPENCODE_WORDS: HostWords = { tool: (name, tool) => `${name}_${tool}`, fileTools: 'read, edit and write', planMode: "OpenCode's Plan agent (Tab switches to it)", askPopup: '' }

const hosts: [string, HostWords, typeof ALL_FEATURES][] = [
  ['Claude Code', CLAUDE_WORDS, ALL_FEATURES],
  ['OpenCode', OPENCODE_WORDS, OPENCODE_FEATURES],
]

for (const [name, words, features] of hosts) {
  test(`T-766: the ${name} lead guide says how to write replies`, () => {
    S.W = { ...SYMCC_WORDS, ...words }
    const guide = leadGuide(features)
    const at = guide.indexOf('### How to write replies')
    expect(at).toBeGreaterThan(0)
    const part = guide.slice(at)
    expect(part).toContain('News first: the first line says what happened, no lead-in')
    // the board-update shape, with its marks and example
    expect(part).toContain('"<mark> T-n  <what happened>   <what it means, ≤ 8 words>"')
    expect(part).toContain('✓ merged, ✗ failed, ↺ sent back / retrying, ▶ started, ⌕ checker, ◐ needs your review')
    expect(part).toContain('✓ T-743  merged (b089022)    a reopen keeps the same try')
    // the routine-update rule
    expect(part).toContain('Routine update with no news')
    expect(part).toContain('one short line at most, e.g. "▶ T-751 retrying (2/4)."')
    // the new-task shape
    expect(part).toContain('New task: "Added T-n  <title in ≤ 10 words>"')
    // the question shape
    expect(part).toContain('the question in one sentence, then the choices numbered, then "(or answer on the board)"')
    expect(part).toContain('at most 3 short bullets')
    // T-924: out of work, the lead suggests a few backlog items for the owner to pick
    expect(part).toContain('Out of work (last task merged, nothing to do, running or waiting) with a backlog: name 2-3 backlog items to move to todo (bugs and safety first)')
    // it goes into every model call: keep it short
    expect(part.length).toBeLessThan(1500)
  })
}
