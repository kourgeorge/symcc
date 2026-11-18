// Why a failed task failed, in plain words: one sentence for the board row, the lead's text board and the
// task page (so all three agree), what to do next, and whether the worker's report asks for something.
import type { SymccTask } from '../../types'
import { CHECKER_MARK, isCheckerOutput } from './checker'
import { cutLine } from './reports'

/** Every way a task can end as failed (see workers.ts, review.ts and checker.ts in hooks/plugin). */
export type FailedHow = 'tests' | 'checker' | 'scope' | 'no change' | 'no result' | 'timed out' | 'api error' | 'refused' | 'no start' | 'clash' | 'stopped' | 'hung' | 'other'

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
  if (/ran over .* twice in a row/i.test(note)) return 'hung'
  if (/^stopped: ran over/i.test(note) || last?.ended_by === 'timed out') return 'timed out'
  if (/^the checker found problems/i.test(note) || isCheckerOutput(t.test_output)) return 'checker'
  if (/^tests failed/i.test(note) || (t.test_output !== undefined && t.test_output !== null && t.test_output !== '')) return 'tests'
  if (/^changed files outside the task/i.test(note)) return 'scope'
  if (/^the worker made no change/i.test(note)) return 'no change'
  if (/^conflicts with the latest/i.test(note)) return 'clash'
  return 'other'
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

/**
 * The failing tests in test output, as bun prints them: each "(fail) <name>" line, after the one or two
 * "error:" / "Expected" lines bun prints above it. "(pass)" lines are never taken. '' when the saved output
 * has no "(fail)" line (it was cut before it), so nothing is guessed. `n` is how many failing tests to show.
 */
export function failingLines(output: string, n = 1): string {
  const lines = output.split('\n').map(l => l.trim())
  const picks: string[] = []
  let fails = 0
  for (let i = 0; i < lines.length; i++) {
    if (!/^\(fail\)\s/.test(lines[i]!)) continue
    fails++
    if (picks.length >= n) continue
    const why: string[] = []
    for (let j = i - 1; j >= 0 && !/^\((pass|fail|skip|todo)\)\s/.test(lines[j]!); j--) {
      if (/^(error:|expected)/i.test(lines[j]!)) why.unshift(lines[j]!)
    }
    picks.push([lines[i]!.replace(/\s*\[[\d.]+\s*m?s\]$/, ''), ...why.slice(0, 2)].join(' | '))
  }
  if (!picks.length) return ''
  const more = fails - picks.length
  return cutLine(picks.join(' | ') + (more > 0 ? ` (and ${more} more)` : ''), 240)
}

/** A line naming a file and line, the way checkers list their problems: "path:12 - …" or "path:12-20 — …". */
const PROBLEM_LINE = /^[-*\s]*`?\S+:\d+(?:-\d+)?`?\s+[—–-]\s/
const NAMES_FILE = /(^|[\s(`/])(hooks|tests)\/\S/

/**
 * The first problem in a checker's report: the first "path:line — …" line (after a "Problems:" line when there
 * is one), else the first line naming a file under hooks/ or tests/, else its first line.
 */
export function firstProblem(report: string): string {
  const lines = report.split('\n').map(l => l.trim()).filter(l => l && l !== CHECKER_MARK && l !== '…')
  const head = lines.findIndex(l => /^\**problems?:?\**:?$/i.test(l))
  const pick = (head >= 0 ? lines.slice(head + 1).find(l => PROBLEM_LINE.test(l)) : undefined)
    ?? lines.find(l => PROBLEM_LINE.test(l)) ?? lines.find(l => NAMES_FILE.test(l)) ?? lines[0] ?? ''
  // a worktree's long absolute path says nothing the short one doesn't
  return cutLine(pick.replace(/^[-*]\s+/, '').replace(/\S*\/\.symcc\/worktrees\/[^/\s]+\//g, ''), 240)
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
      const lines = out ? failingLines(out) : ''
      const which = lines ? `First failing test: ${end(lines)}` : out ? "The saved test output doesn't show which test failed." : ''
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
    case 'hung':
      return `Checking and merging its work hung twice in a row and was given up, so nothing was merged (${note}).`
    default:
      return note ? `It failed: ${end(note)}` : 'It failed, and no reason was saved.'
  }
}

/** What to do next about failed task `t`, in one line, matching its page's buttons (Retry, change the task, Drop). */
export function failNext(t: Failed): string {
  switch (failedHow(t)) {
    case 'tests':
      return 'Retry to let a new worker fix the failing tests, change the task if the tests show it asks for the wrong thing, or Drop it.'
    case 'checker':
      return "Read the checker's report in the Details below; Retry to let a new worker fix it, change the task if the plan is off, or Drop it."
    case 'scope':
      return 'Change the task to add those files (or split it), then Retry; or Drop it.'
    case 'no change':
      return 'Read the report below; Retry if it should try again, change the task if it needs a clearer plan, or Drop it.'
    case 'timed out':
      return 'Retry to continue from the work so far, change the task to split it into smaller parts, or Drop it.'
    case 'no start':
      return 'Fix what stopped it from starting, then Retry; or Drop it.'
    case 'clash':
      return 'Retry to let a new worker merge the latest work in, change the task, or Drop it.'
    case 'hung':
      return 'Look at why the test commands are slow or hang, then Retry; or Drop it.'
    case 'no result':
    case 'api error':
    case 'refused':
    case 'stopped':
      return 'Retry to start a fresh try (it goes on from the work so far), change the task to make it smaller, or Drop it.'
    default:
      return 'Read the history and report below; Retry, change the task, or Drop it.'
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
    return `The worker asks for more files: ${end(files)} Add them to the task with change, then Retry.`
  }
  // A question counts only in the report's last lines (an earlier one is usually answered later on), and only a
  // real sentence ending on a word and "?" (not a status line like "changed ?" or a link or code).
  const q = [...lines.slice(-3)].reverse().find(l => /[\w)'"`]\?\s*\**$/.test(l) && /^[-*#>\s]*\**[A-Za-z]/.test(l) && !/^[-*]?\s*(https?:|`)/.test(l) && !/^\w+:\s{2,}/.test(l))
  if (q) return `The worker's report asks: ${cutLine(q.replace(/^[-*#>\s]+/, ''), 200)} Answer it by changing the task, then Retry.`
  return ''
}
