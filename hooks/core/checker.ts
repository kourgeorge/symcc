// The checker setting: when it is on, a change whose worker finished and whose tests passed does not merge yet.
// A fresh agent with the built-in role "checker" gets the task and the diff and tries to break it; its answer
// is either OK (the task goes on to merge, or to review) or a list of problems (the task goes back to its worker
// with that report, like a failed test run). Investigations and docs-only changes skip it. Everything here is pure.
import CHECKER_PROMPT from '../../prompts/checker'
import type { Board } from './board-file'
import { isDocFile } from './review'
import { testTail } from './settings'
import { fillPlaceholders } from './prompts'

/** The role a checker runs as (roles/checker.md; the owner's .<name>/roles/checker.md is used instead). */
export const CHECKER_ROLE = 'checker'

/** Whether the checker setting is on (off unless the board says on). */
export const checkerOn = (b: Partial<Pick<Board, 'checker'>> | null | undefined): boolean => b?.checker === true

/** Whether changed files `changed` are only docs (see isDocFile): such a change skips the checker. */
export const docsOnly = (changed: readonly string[]): boolean => changed.length > 0 && changed.every(isDocFile)

/** The most of the diff a checker's prompt holds; the rest it reads with git diff itself. */
export const CHECKER_DIFF_CHARS = 40_000

/** What a checker's answer says: `ok`, or `problems` with its report; null when it said nothing. */
export type CheckerVerdict = { ok: true } | { ok: false; report: string }

/** A line that says OK: "OK", "ok.", "**OK**", "`OK`". */
const OK_LINE = /^[*_`"'\s]*ok[.!]?[*_`"'\s]*$/i

/** A checker's answer as its verdict: OK when its last line is OK on its own (see OK_LINE), else its whole text is the problems report; null for an empty answer. */
export function checkerVerdict(answer: string): CheckerVerdict | null {
  const text = String(answer ?? '').trim()
  if (!text) return null
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return OK_LINE.test(lines.at(-1) ?? '') ? { ok: true } : { ok: false, report: text }
}

/** The first line of a task's test_output when it holds a checker's report rather than test output. */
export const CHECKER_MARK = 'The checker found these problems:'

/** The checker's report as the task keeps it in test_output (cut like test output, so it fits in the next prompt). */
export const checkerOutput = (report: string): string => `${CHECKER_MARK}\n${testTail(report)}`

/** Whether test_output `s` holds a checker's report (see checkerOutput). */
export const isCheckerOutput = (s: string | undefined): boolean => typeof s === 'string' && s.startsWith(CHECKER_MARK)

/** {{test_output}} of a change prompt after the checker sent the last try back: its report, to fix. */
export const checkerRetryText = (output: string): string =>
  `\nA checker reviewed your last try and found problems; fix them (if one is wrong, say why in your report). Its report:\n\`\`\`\n${output.slice(CHECKER_MARK.length).trim()}\n\`\`\`\n`

/** The diff as a checker's prompt shows it: cut at CHECKER_DIFF_CHARS, with a line saying so. */
export const checkerDiff = (diff: string): string => {
  const d = String(diff ?? '').trimEnd()
  return d.length > CHECKER_DIFF_CHARS ? `${d.slice(0, CHECKER_DIFF_CHARS)}\n… (cut here: run git diff for the rest)` : d || '(no diff)'
}

/** The values of a checker's prompt. */
export type CheckerValues = { name: string; task_id: string; title: string; details: string; branch: string; folder: string; into: string; role: string; diff: string }

/** A checker's prompt (prompts/checker.ts) with `v` filled in. */
export const checkerPrompt = (v: CheckerValues): string => fillPlaceholders(CHECKER_PROMPT, v, v).trimEnd()

/** The history line of a checker's verdict. */
export const checkerLine = (tryLabel: string, v: CheckerVerdict | null, why = ''): string =>
  !v ? `${tryLabel}: checker gave no verdict${why ? ` (${why})` : ''}` : 'report' in v ? `${tryLabel}: checker found problems: ${oneLine(v.report, 300)}` : `${tryLabel}: checker: OK`

const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
