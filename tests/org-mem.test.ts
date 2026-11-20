// T-600, T-632: organizational memory (org-mem) (core/org-mem.ts): "Learned:" suggestions from a report, cleaned and kept once; the
// lead's add / remove / replace / list; the limit; and org-mem shown in prompts.
import { expect, test } from 'claude-code/testing'
import { addSuggestions, suggestedText, orgMemAdd, orgMemRemove, orgMemReplace, orgMemList, dropTaskIds, cleanLearned, orgMemSection, sameLesson, splitLearned, ORG_MEM_MAX_LINES, LEARNED_LINE_CHARS, LEARNED_ASK, DEBRIEF_TEXT, debriefLines, orgMemNotes, orgMemNoteHead, orgMemCount, orgMemSummary, orgMemAbout, deleteOrgMemNote, orgMemNoteKey, ORG_MEM_EMPTY } from '../hooks/core/org-mem'
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

test('T-632: suggestions are kept once (exact repeats skipped), cleaned, and listed for the lead; none: nothing', () => {
  const one = addSuggestions(undefined, 'done\nLearned:\n- Run one test file with sh scripts/test-files.sh')
  expect(one).toEqual(['Run one test file with sh scripts/test-files.sh'])
  // an exact repeat (case and marks aside) is skipped; a new one is added after it
  expect(addSuggestions(one, 'done\nLearned:\n- run ONE test file with sh scripts/test-files.sh.\n- The guard refuses a repo in the project')).toEqual([...one, 'The guard refuses a repo in the project'])
  expect(addSuggestions(one, 'just a report')).toEqual(one)
  expect(suggestedText('T-5', [], 'symcc orgmem')).toBe('')
  const said = suggestedText('T-5', ['a', 'b'], 'symcc orgmem')
  expect(said).toContain('T-5: Suggested for org-mem')
  expect(said).toContain('symcc orgmem')
  expect(said.split('\n').slice(1)).toEqual(['- a', '- b'])
  expect(sameLesson('the guard refuses a repo made in the project', 'The guard refuses a repo made in the project folder')).toBe(true)
  expect(sameLesson('the guard refuses a repo', 'snapshots are in tests/')).toBe(false)
  // a correction that turns a note around is not a duplicate, so it gets in
  expect(sameLesson('use sh scripts/test-files.sh to run one test', "don't use sh scripts/test-files.sh to run one test")).toBe(false)
  expect(sameLesson('the guard allows a repo under /tmp', 'the guard does not allow a repo under /tmp')).toBe(false)
})

test('T-632: a 150-character suggestion is cut near 100 (T-656), with "…"', () => {
  const long = 'word '.repeat(30).trim()
  expect(long.length).toBeGreaterThan(140)
  const [s] = addSuggestions(undefined, `done\n\nLearned:\n- ${long}`)
  expect(s!.length <= LEARNED_LINE_CHARS).toBe(true)
  expect(s!.length >= LEARNED_LINE_CHARS - 5).toBe(true)
  expect(s!.endsWith('…')).toBe(true)
})

test('T-632: the lead adds notes as "- date: lesson" (no task id); a near repeat is refused; an add past 60 lines adds nothing', () => {
  const one = orgMemAdd(null, ['Run one test file with sh scripts/test-files.sh'], D)
  expect(one).toEqual({ text: `- ${D}: Run one test file with sh scripts/test-files.sh\n`, added: ['Run one test file with sh scripts/test-files.sh'], repeats: [], bad: [], full: false })
  const again = orgMemAdd(one.text, ['run ONE test file with `sh scripts/test-files.sh`.', '- The guard refuses a repo in the project', 'API_KEY=abc123'], D)
  expect(again.added).toEqual(['The guard refuses a repo in the project'])
  expect(again.repeats).toEqual(['run ONE test file with `sh scripts/test-files.sh`.'])
  expect(again.bad).toEqual(['API_KEY=abc123'])
  expect(again.text).toBe(`${one.text}- ${D}: The guard refuses a repo in the project\n`)
  // two near-same notes in one add: only the first
  expect(orgMemAdd('', ['snapshots are in tests/', 'Snapshots are in tests/.'], D).added).toEqual(['snapshots are in tests/'])
  // a note copied from an old line keeps no task id (or old date)
  expect(orgMemAdd('', ['- T-12 2026-11-19: copied old note', 'T-3 another old note'], D).text).toBe(`- ${D}: copied old note\n- ${D}: another old note\n`)
  const full = Array.from({ length: ORG_MEM_MAX_LINES }, (_, i) => `- ${D}: lesson number ${i} about thing${i}`).join('\n') + '\n'
  const r = orgMemAdd(full, ['brand new trap in the merge line'], D)
  expect(r.full).toBe(true)
  expect(r.added).toEqual([])
  expect(r.text).toBe(full)
  // one line short of the limit: one more fits
  const less = full.split('\n').slice(1).join('\n')
  expect(orgMemAdd(less, ['brand new trap in the merge line'], D).text.trim().split('\n')).toHaveLength(ORG_MEM_MAX_LINES)
})

test('T-632: the lead removes and replaces a note by number or text, and lists them oldest first', () => {
  const g = `- 2026-11-18: run one test file with sh scripts/test-files.sh\n- by hand: with a colon\n- ${D}: the type check is separate from the tests\n`
  expect(orgMemList(g, '.symcc/org-mem.md')).toBe(`.symcc/org-mem.md: 3 notes (at most ${ORG_MEM_MAX_LINES}), oldest first:\n#1 2026-11-18: run one test file with sh scripts/test-files.sh\n#2 by hand: with a colon\n#3 ${D}: the type check is separate from the tests`)
  expect(orgMemList('', '.symcc/org-mem.md')).toContain('no notes yet')
  expect(orgMemRemove(g, 2).text).toBe(`- 2026-11-18: run one test file with sh scripts/test-files.sh\n- ${D}: the type check is separate from the tests\n`)
  expect(orgMemRemove(g, '#3').removed?.text).toBe('the type check is separate from the tests')
  expect(orgMemRemove(g, 'The type check is separate from the tests.').removed?.n).toBe(3)
  expect(orgMemRemove(g, 9)).toEqual({ text: g, removed: null })
  const r = orgMemReplace(g, 1, 'run one test file: sh scripts/test-files.sh tests/x.test.ts', D)
  expect(r.why).toBe(undefined)
  expect(r.text.split('\n')[0]).toBe(`- ${D}: run one test file: sh scripts/test-files.sh tests/x.test.ts`)
  expect(r.text.split('\n').slice(1).join('\n')).toBe(g.split('\n').slice(1).join('\n'))
  // the new note repeats another one: refused
  expect(orgMemReplace(g, 1, 'The type check is separate from the tests', D).why).toContain('repeats note 3')
  expect(orgMemReplace(g, 7, 'x y z', D).why).toBe('no such note')
})

test('T-632: the one-time conversion takes the task ids off old lines and leaves other lines alone', () => {
  expect(dropTaskIds(`- T-611 ${D}: a\n- written by hand T-5\n- T-7 2026-11-18: b\n`)).toEqual({ text: `- ${D}: a\n- written by hand T-5\n- 2026-11-18: b\n`, changed: true })
  expect(dropTaskIds(`- ${D}: a\n`)).toEqual({ text: `- ${D}: a\n`, changed: false })
})

test('prompts: workers, checkers and scouts get the guide under a heading, and are asked for "Learned:" lines; empty guide: nothing', () => {
  // T-632: the ask is for suggestions the lead decides on: surprising, for other tasks, short, not already there
  for (const words of ['suggested notes', 'the lead reads your suggestions', 'useful to agents working on other tasks in this project', 'true beyond this task', 'one short plain sentence', 'not already in the org-mem notes shown above (not even in other words)', 'no task ids', 'Leaving the section out is the normal case']) expect(LEARNED_ASK).toContain(words)
  expect(orgMemSection(null, '.symcc/org-mem.md')).toBe('')
  expect(orgMemSection(' \n\n', '.symcc/org-mem.md')).toBe('')
  const g = orgMemSection(`- ${D}: a\n`, '.symcc/org-mem.md')
  expect(g).toContain('Organizational memory (org-mem): notes earlier agents left about this project')
  expect(g).toContain(`- ${D}: a`)
  for (const k of PROMPT_KINDS) {
    expect(BUILT_IN_PROMPTS[k]).toContain('{{org_mem}}')
    const p = fillPrompt(k, { org_mem: g, learned: LEARNED_ASK })
    expect(p).toContain(g.trim())
    expect(p).toContain('"Learned:" section')
    expect(fillPrompt(k, { org_mem: '', learned: LEARNED_ASK })).not.toContain('notes earlier agents')
  }
  const c = { name: 'symcc', task_id: 'T-1', title: 'a', details: 'b', branch: 'symcc/T-1', folder: '/w', into: 'main', role: '', diff: '', changed_files: '', tests: '' }
  expect(checkerPrompt({ ...c, org_mem: g })).toContain(`- ${D}: a`)
  expect(checkerPrompt(c)).not.toContain('{{')
  // T-656: the ask is only there when given (a host with no debrief)
  expect(checkerPrompt(c)).not.toContain('"Learned:" section')
  expect(checkerPrompt({ ...c, learned: LEARNED_ASK })).toContain('"Learned:" section')
  expect(scoutPrompt({ scout: 's', root: '/p', instructions: 'Go.', open: [], guide: g })).toContain(`- ${D}: a`)
  expect(scoutPrompt({ scout: 's', root: '/p', instructions: 'Go.', open: [] })).not.toContain('notes earlier agents')
})

test('a fenced code block in the section is dropped whole, fences and the code between them (no file contents)', () => {
  const r = addSuggestions(undefined, 'done\n\nLearned:\n- the config looks like this:\n```json\n{ "apiUrl": "x" }\n```\n- run sh scripts/test-files.sh')
  expect(r).toEqual(['the config looks like this:', 'run sh scripts/test-files.sh'])
  // an unclosed fence drops the rest
  expect(splitLearned('done\nLearned:\n- a\n```\nsecret file text').lines).toEqual(['- a'])
})

test('the section ends at its first blank line or non-list line: a question or "NEED FILES:" after it stays in the report', () => {
  expect(failAsks('did it\n\nLearned:\n- a\n\nShould I also change b.ts?')).toContain('Should I also change b.ts?')
  expect(failAsks('did it\n\nLearned:\n- a\n\nNEED FILES: b.ts')).toContain('more files: b.ts')
  expect(failAsks('did it\n\nLearned:\n- a\nNEED FILES: b.ts')).toContain('more files: b.ts')
  expect(addSuggestions(undefined, 'did it\n\nLearned:\n- a trap here\n\nShould I also change b.ts too?')).toEqual(['a trap here'])
  expect(splitLearned('did it\n\nLearned:\n- a trap here\n\nShould I also change b.ts too?').body).toBe('did it\n\nShould I also change b.ts too?')
  // a blank line right after the heading is still allowed
  expect(splitLearned('did it\n\nLearned:\n\n- a\n- b').lines).toEqual(['- a', '- b'])
  expect(splitLearned('did it\r\nLearned:\r\n- a\r\n').lines).toEqual(['- a'])
})

test('paths and long hyphenated file names are not secrets; long random tokens still are', () => {
  expect(addSuggestions(undefined, 'done\n\nLearned:\n- notes are in docs/research-a-short-notice-channel-on-the-board-p.md')).toEqual(['notes are in docs/research-a-short-notice-channel-on-the-board-p.md'])
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
  expect(addSuggestions(undefined, quote)).toEqual([])
  expect(failAsks('I changed a.ts. The user sees this:\n```\nLearned:\n- x\n```\nShould I also change b.ts?')).toContain('Should I also change b.ts?')
  // a real section after a quote is still taken
  expect(addSuggestions(undefined, `${quote}\n\nLearned:\n- run sh scripts/test-files.sh for one test file`)).toEqual(['run sh scripts/test-files.sh for one test file'])
})

// ---------------- T-619: the notes as the Settings page lists them, and deleting one ----------------

test('T-619, T-632: orgMemNotes lists the notes newest first, each its place in the file, date and text (no task id)', () => {
  const text = `- 2026-11-18: one\n\n  \n- by hand: with a colon\n- ${D}: three\n`
  expect(orgMemNotes(text)).toEqual([
    { n: 3, date: D, text: 'three' },
    { n: 2, date: '', text: 'by hand: with a colon' },
    { n: 1, date: '2026-11-18', text: 'one' },
  ])
  expect(orgMemNotes(null)).toEqual([])
  expect(orgMemNotes(' \n\n')).toEqual([])
  expect(orgMemNoteHead(orgMemNotes(text)[0]!)).toBe(`#3 · ${D}`)
  expect(orgMemNoteHead(orgMemNotes(text)[1]!)).toBe('#2 · written by hand')
  expect([orgMemCount(0), orgMemCount(1), orgMemCount(4)]).toEqual(['0 notes', '1 note', '4 notes'])
  expect([orgMemSummary(0), orgMemSummary(2)]).toEqual(['', 'org-mem 2 notes'])
  expect(ORG_MEM_EMPTY).toBe('No notes yet.')
  expect(orgMemAbout('.symcc/org-mem.md')).toContain('right after they hand back a task (one short follow-up question)')
  expect(orgMemAbout('.symcc/org-mem.md')).toContain(`.symcc/org-mem.md (at most ${ORG_MEM_MAX_LINES} lines)`)
  expect(orgMemAbout('.symcc/org-mem.md')).toContain('the lead decides what goes in')
})

test('T-619: deleteOrgMemNote takes out exactly that line; a wrong number or a changed line takes out nothing', () => {
  const text = `- 2026-11-18: one\n\n- two\n- ${D}: three\n`
  const r = deleteOrgMemNote(text, 2)
  expect(r.text).toBe(`- 2026-11-18: one\n\n- ${D}: three\n`)
  expect(r.removed).toEqual({ n: 2, date: '', text: 'two' })
  expect(deleteOrgMemNote(text, 3).text).toBe('- 2026-11-18: one\n\n- two\n')
  expect(deleteOrgMemNote(text, 1, 'one').text).toBe(`\n- two\n- ${D}: three\n`)
  for (const [n, expect_] of [[0, undefined], [4, undefined], [1, 'not what it says']] as const) {
    const bad = deleteOrgMemNote(text, n, expect_)
    expect(bad).toEqual({ text, removed: null })
  }
  expect(deleteOrgMemNote(`- ${D}: only\n`, 1).text).toBe('')
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

test('T-619: a delete by number with the note\'s check word deletes nothing when the numbers moved (a note before it was removed)', () => {
  const D = '2026-11-20'
  let g = Array.from({ length: ORG_MEM_MAX_LINES }, (_, i) => `- ${D}: lesson number ${i + 1}`).join('\n') + '\n'
  const shown = orgMemNotes(g).find(x => x.n === 30)!
  expect(shown.text).toBe('lesson number 30')
  const key = orgMemNoteKey(shown.text)
  expect(key).toMatch(/^[0-9a-f]{6}$/)
  expect(orgMemNoteKey('lesson number 31')).not.toBe(key)
  g = orgMemRemove(g, 1).text
  expect(deleteOrgMemNote(g, 30, undefined, key)).toEqual({ text: g, removed: null })
  // the note's new number with its check word still deletes it, and only it
  const r = deleteOrgMemNote(g, 29, undefined, key)
  expect(r.removed?.text).toBe('lesson number 30')
  expect(orgMemNotes(r.text).map(x => x.text)).not.toContain('lesson number 30')
  expect(orgMemNotes(r.text)).toHaveLength(ORG_MEM_MAX_LINES - 2)
})

test('T-656: the debrief asks for 0-3 short facts for other agents under "Suggested for org-mem:"; its answer\'s lines are kept, "none" gives nothing', () => {
  for (const words of ['help other agents on other tasks in this project', 'how to test or check something quickly', 'a trap or a refusal', 'Suggest 0-3, under "Suggested for org-mem:"', 'at most ~20 words', 'not already in the org-mem notes above (not even in other words)', 'no task ids, file contents or secrets', 'The lead decides what goes in', 'answer "none"', 'change no files and run nothing']) expect(DEBRIEF_TEXT).toContain(words)
  expect(LEARNED_LINE_CHARS).toBe(100)
  expect(debriefLines('none')).toEqual([])
  expect(debriefLines('None.')).toEqual([])
  expect(debriefLines('Suggested for org-mem:\n- a\n- b')).toEqual(['- a', '- b'])
  expect(debriefLines('**Suggested for org-mem:**\n- a')).toEqual(['- a'])
  expect(debriefLines('- only a list')).toEqual(['- only a list'])
  expect(debriefLines('I think nothing here.\n- maybe this')).toEqual([])
  expect(addSuggestions(['x'], 'Suggested for org-mem:\n- Run one test with sh scripts/test-files.sh.', true)).toEqual(['x', 'Run one test with sh scripts/test-files.sh.'])
  expect(addSuggestions(['x'], 'none', true)).toEqual(['x'])
  // any "no" answer after the heading is nothing, with or without a list mark and words after it
  for (const no of ['Suggested for org-mem: none — nothing here is true beyond this task.', 'Suggested for org-mem: No new facts.', 'Suggested for org-mem: nothing to add', 'Suggested for org-mem:\n- None from this task.', 'Suggested for org-mem:\n- N/A here', 'Suggested for org-mem:\n- no facts beyond this task']) expect(addSuggestions(undefined, no, true)).toEqual([])
  expect(addSuggestions(undefined, 'Suggested for org-mem:\n- Nonetheless, one test file runs fast.\n- No new facts.', true)).toEqual(['Nonetheless, one test file runs fast.'])
})
