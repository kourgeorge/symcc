// The checker setting: when it is on, a change whose worker finished and whose tests passed does not merge yet.
// A fresh agent with the built-in role "checker" gets the task and the diff and tries to break it; its answer
// is either OK (the task goes on to merge, or to review) or a list of problems (the task goes back to its worker
// with that report, like a failed test run). Investigations and docs-only changes skip it. Everything here is pure.
import CHECKER_PROMPT from '../../prompts/checker'
import type { Board } from './board-file'
import type { HistoryAdd } from './history'
import { DOC_NAMES, MEDIA_EXTS } from './review'
import { CHECKER_ROLE } from './roles'
import { DEFAULT_NAME, namesFor } from '../name'
import { TEST_OUTPUT_CHARS } from './settings'
import { fillPlaceholders } from './prompts'

export { CHECKER_ROLE }

/** Whether the checker setting is on (off unless the board says on). */
export const checkerOn = (b: Partial<Pick<Board, 'checker'>> | null | undefined): boolean => b?.checker === true

/**
 * The one list of what counts as instructions for agents (so a change to it is checked, not skipped as prose).
 * AGENT_DIRS: folder names; any file under one of them counts (symcc roles and kinds, plugin agents and commands,
 * skills, and other tools' rule folders). AGENT_SUBDIRS: folder paths that count only as a whole (examples/scouts:
 * seedExampleScouts copies them into every new project and scouts run from them). AGENT_FILES: file names, wherever
 * they are. AGENT_SUFFIXES: file name endings (GitHub Copilot's *.instructions.md).
 */
const AGENT_DIRS = new Set(['roles', 'kinds', 'agents', 'commands', 'skills', '.claude', '.symcc', namesFor(DEFAULT_NAME).dir,
  '.cursor', '.windsurf', '.clinerules', '.opencode', '.gemini', '.codex', '.roo'])
const AGENT_SUBDIRS: readonly (readonly string[])[] = [['examples', 'scouts'], ['.github', 'instructions']]
const AGENT_FILES = new Set(['claude.md', 'agents.md', 'skill.md', 'gemini.md', 'conventions.md', 'copilot-instructions.md',
  '.cursorrules', '.windsurfrules', '.clinerules'])
const AGENT_SUFFIXES = ['.instructions.md']

/** Whether `parts` (a lower-case path split on /, file name last) is instructions for agents (see AGENT_DIRS). */
function isAgentFile(parts: readonly string[]): boolean {
  const name = parts.at(-1) ?? ''
  const dirs = parts.slice(0, -1)
  if (AGENT_FILES.has(name) || AGENT_SUFFIXES.some(s => name.endsWith(s)) || dirs.some(d => AGENT_DIRS.has(d))) return true
  return AGENT_SUBDIRS.some(sub => dirs.some((_, i) => sub.every((d, j) => dirs[i + j] === d)))
}

/**
 * Whether `path` is only prose or media, so a change to it alone may skip the checker. Stricter than isDocFile
 * (which tests_with_changes uses): only README / CHANGELOG / LICENSE-style names (not code), .md files that are not
 * instructions for agents (see AGENT_DIRS), and images, video, audio, subtitles and fonts. Everything else is checked, even under docs/:
 * .mdx (it holds code), json, yaml, toml, Makefile, CI workflows.
 */
export function isCheckerDocFile(path: string): boolean {
  const parts = String(path ?? '').toLowerCase().split('/').filter(Boolean)
  const name = parts.at(-1) ?? ''
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (MEDIA_EXTS.has(ext)) return true
  if (isAgentFile(parts)) return false
  if (ext === 'md') return true
  return DOC_NAMES.has(name.split('.')[0] ?? '') && (ext === '' || ext === 'txt' || ext === 'rst')
}

/** Whether changed files `changed` are only prose or media (see isCheckerDocFile): such a change skips the checker. */
export const docsOnly = (changed: readonly string[]): boolean => changed.length > 0 && changed.every(isCheckerDocFile)

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

/**
 * The checker's report as the task keeps it in test_output: its last TEST_OUTPUT_CHARS characters, so it fits in
 * the next prompt. A plain cut, not testTail: a report that quotes "(fail)" lines is not test output, and a
 * failed-tests heading in front of it would become its "first problem".
 */
export const checkerOutput = (report: string): string => {
  const s = String(report ?? '').trim()
  return `${CHECKER_MARK}\n${s.length <= TEST_OUTPUT_CHARS ? s : '…' + s.slice(-TEST_OUTPUT_CHARS)}`
}

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
export type CheckerValues = { name: string; task_id: string; title: string; details: string; branch: string; folder: string; into: string; role: string; diff: string; changed_files: string; tests: string }

/** The most changed files a checker's prompt lists; the rest it reads with git diff --name-only. */
export const CHECKER_FILES_MAX = 200

/** {{changed_files}} of a checker's prompt: the changed files, one per line. */
export const checkerChangedFiles = (changed: readonly string[]): string => {
  if (!changed.length) return '  (none found: run git diff --name-only for them)'
  const shown = changed.slice(0, CHECKER_FILES_MAX).map(f => `  ${f}`)
  return [...shown, ...(changed.length > CHECKER_FILES_MAX ? [`  … and ${changed.length - CHECKER_FILES_MAX} more (run git diff --name-only for all)`] : [])].join('\n')
}

/** The pre-merge test run of the code a checker checks: its commit and tree id, when the passed-trees record (T-527) has that tree passed with the board's test commands. */
export type CheckerTestRun = { sha: string; tree: string }

/**
 * T-526: {{tests}} of a checker's prompt. The full test commands run once per try, by the pre-merge run: when that
 * run passed on this exact code (`run`), the checker is told so and runs only the tests for the changed files and its
 * own probes. With no test commands set, or no passed run on record for this tree, it runs the tests itself, as before.
 */
export function checkerTestsText(name: string, commands: readonly string[], run: CheckerTestRun | null): string {
  const list = commands.map(c => `  ${c}`).join('\n')
  if (!commands.length) return "No test commands are set for this project, so nothing has run its tests yet: find how the project runs its tests (in this folder) and run them."
  if (!run) return `${name}'s test run on this exact code is not on record, so run these test commands yourself, each one on its own, from the folder:\n${list}`
  return `${name} already ran these exact test commands on commit ${run.sha}, tree ${run.tree} (the code you are checking), and all passed:
${list}
Don't run them in full again. Run only the tests for the changed files and your own new probe cases; run a full command only if your probe needs it, and say why in your answer.`
}

/** A checker's prompt (prompts/checker.ts) with `v` filled in. */
export const checkerPrompt = (v: CheckerValues): string => fillPlaceholders(CHECKER_PROMPT, v, v).trimEnd()

/** The history line of a checker's verdict. */
export const checkerLine = (tryLabel: string, v: CheckerVerdict | null, why = ''): string =>
  !v ? `${tryLabel}: checker gave no verdict${why ? ` (${why})` : ''}` : 'report' in v ? `${tryLabel}: checker found problems: ${oneLine(v.report, 300)}` : `${tryLabel}: checker: OK`

/** checkerLine as a history entry to add: "checker-ok", "checker-problems", or "checker" with no verdict. */
export const checkerEntry = (tryLabel: string, v: CheckerVerdict | null, why = ''): HistoryAdd => [!v ? 'checker' : 'report' in v ? 'checker-problems' : 'checker-ok', checkerLine(tryLabel, v, why)]

const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
