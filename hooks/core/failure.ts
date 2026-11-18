// Why a failed task failed, in plain words: one sentence for the board row, the lead's text board and the
// task page (so all three agree), what to do next, and whether the worker's report asks for something.
import type { SymccTask } from '../../types'
import { CHECKER_MARK, isCheckerOutput } from './checker'
import { cutLine } from './reports'
import { failBlocks, moreFailingLine } from './settings'

/** Every way a task can end as failed (see workers.ts, review.ts and checker.ts in hooks/plugin). */
export type FailedHow = 'tests' | 'checker' | 'scope' | 'no change' | 'no result' | 'timed out' | 'api error' | 'refused' | 'no start' | 'clash' | 'stopped' | 'hung' | 'ended early' | 'other'

type Failed = Pick<SymccTask, 'note' | 'history'> & Partial<Pick<SymccTask, 'test_output' | 'runs'>>

/** How task `t` failed, read from its note, its test output and how its last try ended. */
export function failedHow(t: Failed): FailedHow {
  const note = (t.note ?? '').trim()
  const last = t.runs?.[t.runs.length - 1]
  if (/^couldn't start/i.test(note)) return 'no start'
  if (/^the worker ended without a result/i.test(note)) return 'no result'
  if (/^the worker's turn ended on an error/i.test(note)) return 'api error'
  if (/^the model refused/i.test(note)) return 'refused'
  if (/^the worker was stopped/i.test(note)) return 'stopped'
  if (note.toLowerCase().startsWith(ENDED_EARLY_NOTE)) return 'ended early'
  if (/ran over .* twice in a row/i.test(note)) return 'hung'
  if (/^stopped: ran over/i.test(note) || last?.ended_by === 'timed out') return 'timed out'
  if (/^the checker found problems/i.test(note) || isCheckerOutput(t.test_output)) return 'checker'
  if (/^tests failed/i.test(note) || (t.test_output !== undefined && t.test_output !== null && t.test_output !== '')) return 'tests'
  if (/^changed files outside the task/i.test(note)) return 'scope'
  if (/^the worker made no change/i.test(note)) return 'no change'
  if (/^conflicts with the latest/i.test(note)) return 'clash'
  return 'other'
}

/** The note of a try whose worker ended its turn while the host saw a background command of it still running (TurnEnd.background). */
export const ENDED_EARLY_NOTE = 'the worker ended its turn before its work finished'

/** "something is still running / going / in progress" (or "running in the background"). */
const STILL = /\bstill (?:running|going|in progress)\b|\brunning in the background\b/i
/**
 * The writer going on once it finishes: "I'll / I will / I'm going to continue / resume / report back / come back /
 * check back / get back ... when / once / after / as soon as ... ", or the writer's own wait ("I'm waiting for").
 * Only with "I": a bare "will …" or "…, waiting for …" is often about a task or checker, not the writer.
 */
const GOES_ON = /(?:\bI['’]ll|\bI will|\bI['’]m going to|\bI am going to)\s+(?:then\s+)?(?:continue|resume|report|come back|check back|get back|pick (?:it|this|them) up|finish)\b.*?\b(?:when|once|after|as soon as|until)\b|\bI(?:['’]m| am)\s+(?:still\s+|now\s+)?waiting\b/i
/** A bullet or numbered list line ("- …", "* …", "• …", "1. …"). */
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/
/** Quoted text and code ("…", “…”, ‘…’, '…', `…`, ```…```): what a report quotes is not what the writer says. */
const QUOTED = /```[\s\S]*?```|`[^`\n]*`|"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|(?<=^|[\s(])'[^\n]*?'(?=[\s.,;:!?)]|$)/g

/**
 * The text check for whether a worker ended its turn while its work still runs ("The background runs are still
 * going; I'll continue when they finish."). It never fails a try (only the host's signal, TurnEnd.background in
 * plugin/workers.ts, does): it only adds a warning note (endedEarlyNote) to the lead's board update and the task's
 * history, so a false alarm costs little. Still kept narrow: only the answer's last paragraph is read (not when it is a
 * bullet list), with quotes and code taken out, sentence by sentence, and a sentence counts only when it says something
 * is still running AND the writer goes on when it finishes (or is waiting for it). Offers ("If you want, I'll continue
 * with …") and plain "I'll / let me continue" without anything still running never count.
 * Returns the sentence that counted, '' if none.
 */
export function endedEarlyLine(answer: string | null | undefined): string {
  // quotes and code go first, so a fenced code block with a blank line in it is not cut into paragraphs
  const paras = String(answer ?? '').replace(QUOTED, ' (quote) ').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const last = paras.at(-1) ?? ''
  if (!last || last.split('\n').some(l => BULLET.test(l))) return ''
  const sentences = last.split(/(?<=[.!?])\s+|\n+/)
  return sentences.find(s => !/^\s*if\b/i.test(s) && STILL.test(s) && GOES_ON.test(s))?.trim() ?? ''
}

/** Whether the answer reads as ended before its work finished (see endedEarlyLine). */
export function endedEarly(answer: string | null | undefined): boolean {
  return endedEarlyLine(answer) !== ''
}

/** The warning note for task `id` whose answer reads as ended early on `sentence` (see endedEarlyLine). */
export function endedEarlyNote(id: string, sentence: string): string {
  return `${id}'s answer may have ended before its work finished: "${cutLine(sentence, 200)}" (only a warning: its try goes on to the tests and merge as usual)`
}

/** What the worker said in its last try that ended with `detail` (from the history line "try N: <said> → <detail>"); '' if none. */
function saidBefore(t: Failed, detail: RegExp): string {
  for (const line of [...(t.history ?? [])].reverse()) {
    const at = line.lastIndexOf(' → ')
    if (at < 0 || !detail.test(line.slice(at + 3))) continue
    const said = line.slice(0, at).replace(/^try \S+(?: \(role [^)]*\))?:\s*/, '').trim()
    return said === '(no summary)' ? '' : said
  }
  return ''
}

const FILE_LINE = /^\S.*\.test\.[cm]?[jt]sx?:$/
/** Where the test file of the lines after it is no longer known: the cut end of kept output ("…"), or a runner's repeat list ("2 tests failed:"). */
const FILE_UNKNOWN = /^…|^\d+ tests? failed:$/

/**
 * Each different failing test in test output, as the index of its first "(fail)" line and its name. A test is
 * told apart by its test file too (the "tests/x.test.ts:" line above it), so two files' tests with the same
 * name both count. Kept output can show a failure twice (in the failed tests up front and again in its end,
 * where its file line may be cut off): a "(fail)" line whose file isn't known counts once with any earlier one of that name.
 */
function failures(output: string): { at: number; name: string }[] {
  const lines = output.split('\n').map(l => l.trim())
  const found: { at: number; name: string }[] = []
  const seen = new Set<string>()
  const names = new Set<string>()
  let file = ''
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    // the cut end's first line may be part of a file line ("…s/b.test.ts:"), so "…" comes first
    if (FILE_UNKNOWN.test(l)) file = ''
    else if (FILE_LINE.test(l)) file = l
    if (!/^\(fail\)\s/.test(l)) continue
    const name = l.replace(/\s*\[[\d.]+\s*m?s\]$/, '')
    const key = `${file}\n${name}`
    if (seen.has(key) || (!file && names.has(name))) continue
    seen.add(key)
    names.add(name)
    found.push({ at: i, name })
  }
  return found
}

/** How many different tests failed in test output (each once, even when the kept output shows it twice; see failures), or the total the
 *  kept output's heading or the runner's " N fail" line gives when that is more (kept output lists only some when many failed). */
export const failCount = (output: string): number => {
  // kept output (testTail) lists only some of them when many failed; its heading, and the runner's own " N fail" line, give the real total
  const said = output.split('\n').map(l => /^(\d+) failed tests?, each "\(fail\)" line/.exec(l)?.[1] ?? /^\s*(\d+) fail$/.exec(l)?.[1]).filter(Boolean).map(Number)
  return Math.max(failures(output).length, ...said)
}

/**
 * The failing tests in test output: each "(fail) <name>" line with the first error lines of the first one,
 * whether the runner prints them above it (plain bun: "error:", "TypeError:"-style and "Expected" lines) or indented right after it
 * (`claude plugin test`). Later failures show only their name, so up to `n` of them fit. "(pass)" lines are never
 * taken. '' when the saved output has no "(fail)" line (it was cut before it), so nothing is guessed.
 */
export function failingLines(output: string, n = 1): string {
  const raw = output.split('\n')
  const lines = raw.map(l => l.trim())
  const found = failures(output)
  const picks: string[] = []
  for (const { at: i, name } of found.slice(0, n)) {
    if (picks.length) {
      picks.push(name)
      continue
    }
    const why: string[] = []
    for (let j = i - 1; j >= 0 && !/^\((pass|fail|skip|todo)\)\s/.test(lines[j]!); j--) {
      if (/^(\w*error:|expected)/i.test(lines[j]!)) why.unshift(lines[j]!)
    }
    for (let j = i + 1; j < raw.length && /^\s/.test(raw[j]!) && !/^\s*\d+ (pass|fail)\b/.test(raw[j]!); j++) {
      if (lines[j]) why.push(lines[j]!)
    }
    picks.push([name, ...why.slice(0, 2)].join(' | '))
  }
  if (!picks.length) return ''
  const more = Math.max(found.length, failCount(output)) - picks.length
  return cutLine(picks.join('; ') + (more > 0 ? ` (and ${more} more)` : ''), 240)
}

/**
 * The short form of a task's kept test output for the lead's chat when it gives up (its retries are used up): how
 * many tests failed, the first few failing tests with their errors (at most 3, in about 1500 characters), how many
 * more there are, and where to read the rest. Output with no "(fail)" line (a typecheck) gives its first error lines.
 */
export function gaveUpTestsText(out: string): string {
  const where = "The whole kept test output is on the task's page (and in its test_output in board.json)."
  const blocks = failBlocks(out)
  if (!blocks.length) {
    const errors = errorLines(out, 3)
    return `${errors ? `First errors: ${errors}` : `The end of the test output:\n${out.length > 800 ? '…' + out.slice(-800) : out}`}\n${where}`
  }
  const total = Math.max(blocks.length, failCount(out))
  const picked: string[] = []
  let used = 0
  for (const b of blocks.slice(0, 3)) {
    const cut = b.length > 1500 ? b.slice(0, 1499) + '…' : b
    if (picked.length && used + cut.length > 1500) break
    picked.push(cut)
    used += cut.length
  }
  const more = total - picked.length
  return [`${total} failing ${total === 1 ? 'test' : 'tests'}${picked.length < total ? `, the first ${picked.length === 1 ? 'one' : picked.length}` : ''}:`, ...picked, ...(more > 0 ? [moreFailingLine(more)] : []), where].join('\n')
}

/**
 * The first lines that look like errors in test output from a command that isn't bun's test runner (a
 * typecheck, a shell script): lines with "error", "Error:", "TS1234" or "FAIL", up to `n` of them. Bun's
 * "(pass)" / "(skip)" / "(todo)" lines and the "$ command" line are never taken; '' when there is none.
 */
export function errorLines(output: string, n = 2): string {
  const picks = output.split('\n').map(l => l.trim())
    .filter(l => l && !/^\$ /.test(l) && !/^\((pass|skip|todo)\)\s/.test(l) && /\berror\b|Error:|\bTS\d+\b|\bFAIL\b/.test(l))
    .slice(0, n)
  return picks.length ? cutLine(picks.join(' | '), 240) : ''
}

/**
 * A line naming a file and line, the way checkers list their problems: "path:12 — …", "path:12-20 - …",
 * "path:12, what is wrong" (symcc's checker prompt), "1. path:12 …" or "- **path:12** — …".
 */
const PROBLEM_LINE = /^(?:[-*]|\d+[.)])?\s*(?:\*\*)?`?[^\s`*]*[./][^\s`*]*:\d+(?:-\d+)?`?(?:\*\*)?(?:[,:]|\s+[—–-])?\s+\S/
const NAMES_FILE = /(^|[\s(`/*])(hooks|tests)\/\S/
/** A short heading line such as "Problems:", "**What passed:**" or "## What works:". */
const heading = (l: string) => /^[\w '’/()-]{1,40}:$/.test(l.replace(/[*#]/g, '').trim())
const isProblemsHead = (l: string) => heading(l) && /^problems?\b/i.test(l.replace(/[*#\s]/g, ''))
const isPassHead = (l: string) => heading(l) && /^what\s+(passed|works|worked|is fine|went well|i checked)/i.test(l.replace(/[*#]/g, '').trim())

/**
 * The first problem in a checker's report. It looks only in the problems part: after a "Problems:" /
 * "Problem:" line when there is one, else the whole report; never in a "What passed" / "What works"
 * part. There it takes the first "path:line …" line, else the first line naming a file under hooks/ or
 * tests/ (without a "Problems:" line, only among the last 8 lines); when nothing matches, the report's first line.
 */
export function firstProblem(report: string): string {
  const lines = report.split('\n').map(l => l.trim()).filter(l => l && l !== CHECKER_MARK && l !== '…')
  const head = lines.findIndex(isProblemsHead)
  let part: string[]
  if (head >= 0) {
    const stop = lines.findIndex((l, i) => i > head && isPassHead(l))
    part = lines.slice(head + 1, stop < 0 ? undefined : stop)
  } else {
    // drop every "What passed" part (from its heading to the next heading); the rest is searched from the top for a
    // "path:line" line, but only its last lines for a line that merely names a file (an intro often mentions files)
    let inPass = false
    part = lines.filter(l => {
      if (heading(l)) inPass = isPassHead(l)
      return !inPass
    })
  }
  const named = head >= 0 ? part : part.slice(-8)
  const pick = part.find(l => PROBLEM_LINE.test(l)) ?? named.find(l => NAMES_FILE.test(l)) ?? (head >= 0 ? part[0] : undefined) ?? lines[0] ?? ''
  // a worktree's long absolute path says nothing the short one doesn't; list marks and bold add nothing either
  return cutLine(pick.replace(/^(?:[-*]|\d+[.)])\s+/, '').replace(/\*\*/g, '').replace(/\S*\/\.symcc\/worktrees\/[^/\s]+\//g, ''), 240)
}

const end = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`)
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Why failed task `t` failed, in one plain sentence (or two): the same text in the board row, the lead's text
 * board and the task page's "Why it failed" block. Built from the task alone (its note, test output, runs and
 * history), so it needs no file read.
 */
export function whyFailed(t: Failed): string {
  const note = (t.note ?? '').trim()
  const out = t.test_output ?? ''
  switch (failedHow(t)) {
    case 'tests': {
      const cmd = /^\$ (.+?) \(exit (\d+)\)/m.exec(out) ?? /^tests failed: `(.+?)` \(exit (\d+)\)/.exec(note)
      const fails = failCount(out)
      const lines = out ? failingLines(out, 3) : ''
      const errors = out && !lines && !/^\(fail\)\s/m.test(out) ? errorLines(out) : ''
      const which = lines ? `${fails === 1 ? 'Failing test' : `${fails} failing tests`}: ${end(lines)}` : errors ? `First error: ${end(errors)}` : out ? "The saved test output doesn't show which test failed." : ''
      return `The tests failed${cmd ? ` (\`${cmd[1]}\`, exit ${cmd[2]})` : ''}.${which ? ` ${which}` : ''}`
    }
    case 'checker': {
      const first = out ? firstProblem(out) : cutLine(note.replace(/^the checker found problems:?\s*/i, ''), 240)
      return `The checker found problems with the work${first ? `. First problem: ${end(first)}` : '.'}`
    }
    case 'scope': {
      const files = /^changed files outside the task \((.*?)\); allowed/i.exec(note)?.[1]
      return `The worker changed files outside the task's list${files ? `: ${files}` : ''}, so nothing was merged.`
    }
    case 'no change': {
      const said = saidBefore(t, /^the worker made no change/)
      return `The worker finished without changing any files.${said ? ` Its report says: ${end(cutLine(said, 240))}` : ''}`
    }
    case 'no result':
      return 'The worker ended without handing back a result, so there was nothing to check or merge.'
    case 'timed out': {
      const min = /ran over (\d+) min/.exec(note)?.[1] ?? /ran over (\d+) min/.exec(t.runs?.at(-1)?.ended_note ?? '')?.[1]
      return `It ran out of time${min ? ` (over ${min} min)` : ''} before it finished; its work so far is kept in its folder, branch and report.`
    }
    case 'api error':
      return "The worker's turn ended on an API error (retries used up or the context limit), so nothing was checked or merged."
    case 'refused':
      return `${end(upper(note))} Nothing was checked or merged.`
    case 'no start':
      return `The worker could not start: ${end(note.replace(/^couldn't start:?\s*/i, '') || 'no reason given')}`
    case 'clash':
      return `Its work clashes with the latest ${/^conflicts with the latest (\S+?),? /.exec(note)?.[1] ?? 'branch'}, and merging that in did not work.`
    case 'stopped':
      return 'The worker was stopped before it finished.'
    case 'ended early':
      return 'The worker ended its turn before its work finished (something it started was still running), so nothing was checked or merged.'
    case 'hung':
      return `Checking and merging its work hung twice in a row and was given up, so nothing was merged (${note}).`
    default:
      return note ? `It failed: ${end(note)}` : 'It failed, and no reason was saved.'
  }
}

/** What to do next about failed task `t`, in one line, matching its page's buttons (Retry, Drop); changing the task is
 *  the lead's job, so the text says to ask the lead in the chat. */
export function failNext(t: Failed): string {
  switch (failedHow(t)) {
    case 'tests':
      return 'Retry to let a new worker fix the failing tests, ask the lead in the chat to change the task if the tests show it asks for the wrong thing, or Drop it.'
    case 'checker':
      return "Read the checker's report in the Details below; Retry to let a new worker fix it, ask the lead in the chat to change the plan if it is off, or Drop it."
    case 'scope':
      return 'Ask the lead in the chat to add those files to the task (or split it), then Retry; or Drop it.'
    case 'no change':
      return 'Read the report below; Retry if it should try again, ask the lead in the chat for a clearer plan, or Drop it.'
    case 'timed out':
      return 'Retry to continue from the work so far, ask the lead in the chat to split it into smaller parts, or Drop it.'
    case 'no start':
      return 'Fix what stopped it from starting, then Retry; or Drop it.'
    case 'clash':
      return 'Retry to let a new worker merge the latest work in, ask the lead in the chat to change the task, or Drop it.'
    case 'hung':
      return 'Look at why the test commands are slow or hang, then Retry; or Drop it.'
    case 'no result':
    case 'ended early':
    case 'api error':
    case 'refused':
    case 'stopped':
      return 'Retry to start a fresh try (it goes on from the work so far), ask the lead in the chat to make it smaller, or Drop it.'
    default:
      return 'Read the history and report below; Retry, ask the lead in the chat to change the task, or Drop it.'
  }
}

/**
 * What the worker's report (`report`, or what it said in the history when the report can't be read) asks for:
 * a "NEED FILES:" line, or a question it ends on; '' when it asks nothing.
 */
export function failAsks(report: string | null | undefined): string {
  const lines = (report ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  // Workers write "NEED FILES:" at the start of a line, in capitals; a report that only mentions the phrase doesn't count.
  const need = lines.find(l => /^NEED FILES:/.test(l))
  if (need) {
    const files = cutLine(need.replace(/^NEED FILES:\s*/, ''), 200) || '(none named)'
    return `The worker asks for more files: ${end(files)} Ask the lead in the chat to add them to the task, then Retry.`
  }
  // A question counts only in the report's last lines (an earlier one is usually answered later on), and only a
  // real sentence ending on a word and "?" (not a status line like "changed ?" or a link or code).
  const q = [...lines.slice(-3)].reverse().find(l => /[\w)'"`]\?\s*\**$/.test(l) && /^[-*#>\s]*\**[A-Za-z]/.test(l) && !/^[-*]?\s*(https?:|`)/.test(l) && !/^\w+:\s{2,}/.test(l))
  if (q) return `The worker's report asks: ${cutLine(q.replace(/^[-*#>\s]+/, ''), 200)} Answer it in the chat so the lead adds it to the task, then Retry.`
  return ''
}
