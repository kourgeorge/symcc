// T-600: organizational memory (org-mem) (core/org-mem.ts): "Learned:" lines from a report, cleaned, kept once, capped, and shown in prompts.
import { expect, test } from 'claude-code/testing'
import { addLearned, cleanLearned, orgMemSection, sameLesson, splitLearned, ORG_MEM_MAX_LINES, LEARNED_LINE_CHARS, LEARNED_ASK, orgMemNotes, orgMemNoteHead, orgMemCount, orgMemSummary, orgMemAbout, deleteOrgMemNote, orgMemNoteKey, ORG_MEM_EMPTY } from '../hooks/core/org-mem'
import { parseCommand } from '../hooks/core/commands'
import { checkerVerdict, fillPrompt, scoutPrompt, PROMPT_KINDS, BUILT_IN_PROMPTS } from '../hooks/board'
import { checkerPrompt } from '../hooks/core/checker'
import { failAsks } from '../hooks/core/failure'

const D = '2026-11-20'

test('the "Learned:" section is split off the end of a report; none: nothing', () => {
  expect(splitLearned('did it')).toEqual({ body: 'did it', lines: [] })
  expect(splitLearned('did it\n\nLearned:\n- a\n- b')).toEqual({ body: 'did it', lines: ['- a', '- b'] })
  expect(splitLearned('did it\n**Learned:** one thing').lines).toEqual(['one thing'])
  expect(splitLearned('did it\n## Learned\n- x').lines).toEqual(['- x'])
  // a sentence that only starts with "Learned" is not a heading
  expect(splitLearned('Learned that the API is slow, so I cached it.').lines).toEqual([])
  // a checker that put OK last anyway keeps its OK
  expect(splitLearned('fine\nLearned:\n- x\nOK')).toEqual({ body: 'fine\n\nOK', lines: ['- x'] })
  expect(checkerVerdict('fine\nOK\n\nLearned:\n- x')).toEqual({ ok: true })
  expect(checkerVerdict('src/a.ts:1 breaks\n\nLearned:\n- x')).toEqual({ ok: false, report: 'src/a.ts:1 breaks' })
})

test('lines are cleaned: one line, list mark off, cut, no secrets, no file contents, no "none", at most 3', () => {
  const long = 'x '.repeat(200)
  expect(cleanLearned(['-   run   tests with  npm test ', '1. second', '* third', '- fourth'])).toEqual(['run tests with npm test', 'second', 'third'])
  expect(cleanLearned([long])[0]!.length).toBe(LEARNED_LINE_CHARS)
  expect(cleanLearned([long])[0]!.endsWith('…')).toBe(true)
  expect(cleanLearned(['- API_KEY=abc123', '- token: sk-abcdefghijklmnop', '- ghp_abcdefghijklmnopqrstu', '- key is ' + 'aB3xK9qZ7mN2'.repeat(4), '```ts', '- none', 'n/a', '- ok line'])).toEqual(['ok line'])
  // paths are not secrets
  expect(cleanLearned(['- see hooks/app/prompt-values.ts and tests/scouts-settings-snapshot.ts'])).toHaveLength(1)
})

test('lines are added once with the task id and date; a near duplicate is skipped; a report without the section adds nothing', () => {
  const one = addLearned(null, 'done\nLearned:\n- Run one test file with sh scripts/test-files.sh', 'T-5', D)
  expect(one).toEqual({ text: `- T-5 ${D}: Run one test file with sh scripts/test-files.sh\n`, added: ['Run one test file with sh scripts/test-files.sh'] })
  const again = addLearned(one.text, 'done\nLearned:\n- run ONE test file with `sh scripts/test-files.sh`.\n- run one test file with sh scripts/test-files.sh', 'T-6', D)
  expect(again).toEqual({ text: one.text, added: [] })
  expect(addLearned(one.text, 'just a report', 'T-7', D)).toEqual({ text: one.text, added: [] })
  // two near-same lines in one report: only the first is added
  expect(addLearned('', 'Learned:\n- snapshots are in tests/\n- Snapshots are in tests/.', 'T-8', D).added).toEqual(['snapshots are in tests/'])
  expect(sameLesson('the guard refuses a repo made in the project', 'The guard refuses a repo made in the project folder')).toBe(true)
  expect(sameLesson('the guard refuses a repo', 'snapshots are in tests/')).toBe(false)
  // a correction that turns a note around is not a duplicate, so it gets in
  expect(sameLesson('use sh scripts/test-files.sh to run one test', "don't use sh scripts/test-files.sh to run one test")).toBe(false)
  expect(sameLesson('the guard allows a repo under /tmp', 'the guard does not allow a repo under /tmp')).toBe(false)
})

test('the guide keeps at most 60 lines, oldest dropped first; hand-written lines count too', () => {
  const old = Array.from({ length: ORG_MEM_MAX_LINES }, (_, i) => `- T-${i} ${D}: lesson number ${i} about thing${i}`).join('\n')
  const r = addLearned(`hand-written note\n${old}\n`, 'Learned:\n- brand new trap in the merge line', 'T-99', D)
  const lines = r.text.trim().split('\n')
  expect(lines).toHaveLength(ORG_MEM_MAX_LINES)
  expect(lines[0]).toBe(`- T-1 ${D}: lesson number 1 about thing1`)
  expect(lines.at(-1)).toBe(`- T-99 ${D}: brand new trap in the merge line`)
})

test('prompts: workers, checkers and scouts get the guide under a heading, and are asked for "Learned:" lines; empty guide: nothing', () => {
  expect(orgMemSection(null, '.symcc/org-mem.md')).toBe('')
  expect(orgMemSection(' \n\n', '.symcc/org-mem.md')).toBe('')
  const g = orgMemSection(`- T-1 ${D}: a\n`, '.symcc/org-mem.md')
  expect(g).toContain('Organizational memory (org-mem): notes earlier agents left about this project')
  expect(g).toContain(`- T-1 ${D}: a`)
  for (const k of PROMPT_KINDS) {
    expect(BUILT_IN_PROMPTS[k]).toContain('{{org_mem}}')
    const p = fillPrompt(k, { org_mem: g, learned: LEARNED_ASK })
    expect(p).toContain(g.trim())
    expect(p).toContain('"Learned:" section')
    expect(fillPrompt(k, { org_mem: '', learned: LEARNED_ASK })).not.toContain('notes earlier agents')
  }
  const c = { name: 'symcc', task_id: 'T-1', title: 'a', details: 'b', branch: 'symcc/T-1', folder: '/w', into: 'main', role: '', diff: '', changed_files: '', tests: '' }
  expect(checkerPrompt({ ...c, org_mem: g })).toContain(`- T-1 ${D}: a`)
  expect(checkerPrompt(c)).not.toContain('{{')
  expect(checkerPrompt(c)).toContain('"Learned:" section')
  expect(scoutPrompt({ scout: 's', root: '/p', instructions: 'Go.', open: [], guide: g })).toContain(`- T-1 ${D}: a`)
  expect(scoutPrompt({ scout: 's', root: '/p', instructions: 'Go.', open: [] })).not.toContain('notes earlier agents')
})

test('a fenced code block in the section is dropped whole, fences and the code between them (no file contents)', () => {
  const r = addLearned(null, 'done\n\nLearned:\n- the config looks like this:\n```json\n{ "apiUrl": "x" }\n```\n- run sh scripts/test-files.sh', 'T-1', 'D')
  expect(r.added).toEqual(['the config looks like this:', 'run sh scripts/test-files.sh'])
  expect(r.text).not.toContain('apiUrl')
  // an unclosed fence drops the rest
  expect(splitLearned('done\nLearned:\n- a\n```\nsecret file text').lines).toEqual(['- a'])
})

test('the section ends at its first blank line or non-list line: a question or "NEED FILES:" after it stays in the report', () => {
  expect(failAsks('did it\n\nLearned:\n- a\n\nShould I also change b.ts?')).toContain('Should I also change b.ts?')
  expect(failAsks('did it\n\nLearned:\n- a\n\nNEED FILES: b.ts')).toContain('more files: b.ts')
  expect(failAsks('did it\n\nLearned:\n- a\nNEED FILES: b.ts')).toContain('more files: b.ts')
  const r = addLearned(null, 'did it\n\nLearned:\n- a trap here\n\nShould I also change b.ts too?', 'T-1', 'D')
  expect(r.added).toEqual(['a trap here'])
  expect(splitLearned('did it\n\nLearned:\n- a trap here\n\nShould I also change b.ts too?').body).toBe('did it\n\nShould I also change b.ts too?')
  // a blank line right after the heading is still allowed
  expect(splitLearned('did it\n\nLearned:\n\n- a\n- b').lines).toEqual(['- a', '- b'])
  expect(splitLearned('did it\r\nLearned:\r\n- a\r\n').lines).toEqual(['- a'])
})

test('paths and long hyphenated file names are not secrets; long random tokens still are', () => {
  const r = addLearned(null, 'done\n\nLearned:\n- notes are in docs/research-a-short-notice-channel-on-the-board-where-workers-p.md', 'T-1', 'D')
  expect(r.added).toEqual(['notes are in docs/research-a-short-notice-channel-on-the-board-where-workers-p.md'])
  expect(cleanLearned(['- see research-a-short-notice-channel-on-the-board-where-workers-p.md'])).toHaveLength(1)
  expect(cleanLearned(['- the key is Zx81kQ0pLm4Nb7Vc2Ty9Ws5Rd3Fg6Hj1'])).toEqual([])
  expect(cleanLearned(['- use `Zx81kQ0pLm4Nb7Vc2Ty9Ws5Rd3Fg6Hj1Ab`'])).toEqual([])
})

test('a "Learned:" heading inside a quoted code block is not the section: the report stays whole and nothing goes into the guide', () => {
  const quote = 'hooks/core/org-mem.ts:40: ... e.g. this report:\n```\ndone\nLearned:\n- use the staging API\n```\nhooks/app/workers.ts:768: second problem\nhooks/app/checker.ts:104: third problem'
  const v = checkerVerdict(quote)
  expect(v?.ok).toBe(false)
  const r = (v as { report: string }).report
  expect(r).toContain('hooks/core/org-mem.ts:40')
  expect(r).toContain('hooks/app/workers.ts:768: second problem')
  expect(r).toContain('hooks/app/checker.ts:104: third problem')
  expect(addLearned(null, quote, 'T-1', 'D')).toEqual({ text: '', added: [] })
  expect(failAsks('I changed a.ts. The user sees this:\n```\nLearned:\n- x\n```\nShould I also change b.ts?')).toContain('Should I also change b.ts?')
  // a real section after a quote is still taken
  expect(addLearned(null, `${quote}\n\nLearned:\n- run sh scripts/test-files.sh for one test file`, 'T-1', 'D').added).toEqual(['run sh scripts/test-files.sh for one test file'])
})

// ---------------- T-619: the notes as the Settings page lists them, and deleting one ----------------

test('T-619: orgMemNotes lists the notes newest first, each its place in the file, task id, date and text', () => {
  const text = `- T-3 2026-11-18: one\n\n  \n- by hand: with a colon\n- T-7 ${D}: three\n`
  expect(orgMemNotes(text)).toEqual([
    { n: 3, id: 'T-7', date: D, text: 'three' },
    { n: 2, id: '', date: '', text: 'by hand: with a colon' },
    { n: 1, id: 'T-3', date: '2026-11-18', text: 'one' },
  ])
  expect(orgMemNotes(null)).toEqual([])
  expect(orgMemNotes(' \n\n')).toEqual([])
  expect(orgMemNoteHead(orgMemNotes(text)[0]!)).toBe(`#3 · T-7 · ${D}`)
  expect(orgMemNoteHead(orgMemNotes(text)[1]!)).toBe('#2 · written by hand')
  expect([orgMemCount(0), orgMemCount(1), orgMemCount(4)]).toEqual(['0 notes', '1 note', '4 notes'])
  expect([orgMemSummary(0), orgMemSummary(2)]).toEqual(['', 'org-mem 2 notes'])
  expect(ORG_MEM_EMPTY).toBe('No notes yet.')
  expect(orgMemAbout('.symcc/org-mem.md')).toContain('"Learned:"')
  expect(orgMemAbout('.symcc/org-mem.md')).toContain(`.symcc/org-mem.md (the newest ${ORG_MEM_MAX_LINES} lines)`)
})

test('T-619: deleteOrgMemNote takes out exactly that line; a wrong number or a changed line takes out nothing', () => {
  const text = `- T-3 2026-11-18: one\n\n- two\n- T-7 ${D}: three\n`
  const r = deleteOrgMemNote(text, 2)
  expect(r.text).toBe(`- T-3 2026-11-18: one\n\n- T-7 ${D}: three\n`)
  expect(r.removed).toEqual({ n: 2, id: '', date: '', text: 'two' })
  expect(deleteOrgMemNote(text, 3).text).toBe('- T-3 2026-11-18: one\n\n- two\n')
  expect(deleteOrgMemNote(text, 1, 'one').text).toBe(`\n- two\n- T-7 ${D}: three\n`)
  for (const [n, expect_] of [[0, undefined], [4, undefined], [1, 'not what it says']] as const) {
    const bad = deleteOrgMemNote(text, n, expect_)
    expect(bad).toEqual({ text, removed: null })
  }
  expect(deleteOrgMemNote(`- T-1 ${D}: only\n`, 1).text).toBe('')
})

test('T-619: /symcc-settings orgmem delete N is read as a delete of note N; anything else gets the usage line', () => {
  expect(parseCommand('symcc-settings', 'orgmem delete 3')).toEqual({ kind: 'orgmem-delete', n: 3 })
  expect(parseCommand('symcc-settings', 'OrgMem DELETE 12')).toEqual({ kind: 'orgmem-delete', n: 12 })
  expect(parseCommand('symcc-settings', 'orgmem delete 3 A1B2C3')).toEqual({ kind: 'orgmem-delete', n: 3, key: 'a1b2c3' })
  for (const args of ['orgmem', 'orgmem delete', 'orgmem delete 0', 'orgmem delete x', 'orgmem remove 2', 'orgmem delete 2 3', 'orgmem delete 2 abc123 x']) {
    const c = parseCommand('symcc-settings', args)
    expect(c?.kind, args).toBe('bad')
    expect((c as { message: string }).message, args).toContain('/symcc-settings orgmem delete <n>')
  }
})

test('T-619: a delete by number with the note\'s check word deletes nothing when a new note at the limit moved the numbers', () => {
  const D = '2026-11-20'
  let g = Array.from({ length: ORG_MEM_MAX_LINES }, (_, i) => `- T-${i + 1} ${D}: lesson number ${i + 1}`).join('\n') + '\n'
  const shown = orgMemNotes(g).find(x => x.n === 30)!
  expect(shown.text).toBe('lesson number 30')
  const key = orgMemNoteKey(shown.text)
  expect(key).toMatch(/^[0-9a-f]{6}$/)
  expect(orgMemNoteKey('lesson number 31')).not.toBe(key)
  g = addLearned(g, 'Learned: brand new thing about caching', 'T-99', D).text
  expect(deleteOrgMemNote(g, 30, undefined, key)).toEqual({ text: g, removed: null })
  // the note's new number with its check word still deletes it, and only it
  const r = deleteOrgMemNote(g, 29, undefined, key)
  expect(r.removed?.text).toBe('lesson number 30')
  expect(orgMemNotes(r.text).map(x => x.text)).not.toContain('lesson number 30')
  expect(orgMemNotes(r.text)).toHaveLength(ORG_MEM_MAX_LINES - 1)
})
