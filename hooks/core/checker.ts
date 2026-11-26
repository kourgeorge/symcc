// The checker setting: when it is on, a change whose worker finished and whose prep step passed (commit, scope and
// secret check) does not join the merge line yet. A fresh agent with the built-in role "checker" gets the task and the
// diff and tries to break it, side by side with other tasks; its answer is either OK (the task joins the merge line:
// catch up, tests, merge or review) or a list of problems (the task goes back to its worker with that report, like a
// failed test run). Investigations and docs-only changes skip it. Everything here is pure.
import type { SymccTask } from '../../types'
import type { Board } from './board-file'
import type { HistoryAdd } from './history'
import { DOC_NAMES, MEDIA_EXTS } from './review'
import { CHECKER_ROLE } from './roles'
import { DEFAULT_NAME, namesFor } from '../name'
import { TEST_OUTPUT_CHARS } from './settings'
import { buildPrompt } from './prompt-sections'
import { CHECKER_MARK, isCheckerOutput } from './checker-mark'
import { splitLearned } from './org-mem'

export { CHECKER_ROLE, CHECKER_MARK, isCheckerOutput }

/** Whether the checker setting is on (off unless the board says on). */
export const checkerOn = (b: Partial<Pick<Board, 'checker'>> | null | undefined): boolean => b?.checker === true

/**
 * The one list of what counts as instructions for agents (so a change to it is checked, not skipped as prose).
 * AGENT_DIRS: folder names; any file under one of them counts (symcc roles and task types, plugin agents and commands,
 * skills, and other tools' rule folders). AGENT_SUBDIRS: folder paths that count only as a whole (examples/scouts:
 * seedExampleScouts copies them into every new project and scouts run from them). AGENT_FILES: file names, wherever
 * they are. AGENT_SUFFIXES: file name endings (GitHub Copilot's *.instructions.md).
 */
const AGENT_DIRS = new Set(['roles', 'kinds', 'agents', 'commands', 'skills', '.claude', '.symcc', namesFor(DEFAULT_NAME).dir,
  '.cursor', '.windsurf', '.clinerules', '.opencode', '.gemini', '.codex', '.roo',
  // T-911: an app's own LLM prompts (prompts/system.md, src/prompts/agent.md, llm/instructions/support.md), at any depth
  'prompts', 'prompt', 'instructions', 'system-prompts'])
const AGENT_SUBDIRS: readonly (readonly string[])[] = [['examples', 'scouts']]
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

/** The changed files that are not prose (see isCheckerDocFile): a task whose role says code: false may not change them (T-900). */
export const notProse = (changed: readonly string[]): string[] => changed.filter(f => !isCheckerDocFile(f))

/** Why a prose-only role's try failed at the scope check: it changed files that are not prose. `undone`: they were undone on the task's branch. */
export function notProseText(role: string, bad: readonly string[], undone = false): string {
  const more = bad.length > 5 ? ` and ${bad.length - 5} more` : ''
  const head = `role ${role} is prose only (code: false), but the try changed files that are not prose (${bad.slice(0, 5).join(', ')}${more}); only .md files that are not agent instructions (and images or media) may change`
  return undone ? `${head}. Those changes were undone on the task's branch, so the next try starts without them; a task that needs code needs another role` : `${head}. To fix: give the task another role with change`
}

/** The history's words when a prose-only role's change skipped the tests (T-900). */
export const PROSE_TESTS_SKIPPED = 'tests skipped: only prose changed'
/** The history's words when a prose-only role's change ran the board's docs_test_commands instead of its test_commands (T-908). */
export const PROSE_DOCS_CHECKS = 'docs checks only: only prose changed'

/** The most of the diff a checker's prompt holds; the rest it reads with git diff itself. */
export const CHECKER_DIFF_CHARS = 40_000

/** What a checker's answer says: `ok`, or `problems` with its report; null when it said nothing. */
export type CheckerVerdict = { ok: true } | { ok: false; report: string }

/** A line that says OK: "OK", "ok.", "**OK**", "`OK`". */
const OK_LINE = /^[*_`"'\s]*ok[.!]?[*_`"'\s]*$/i

/** A checker's answer as its verdict: OK when its last line is OK on its own (see OK_LINE), else its whole text is the problems report; null for an empty answer. */
export function checkerVerdict(answer: string): CheckerVerdict | null {
  // T-600: the optional "Learned:" section at its end is for organizational memory (org-mem), not part of the verdict
  const text = splitLearned(String(answer ?? '')).body.trim()
  if (!text) return null
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (OK_LINE.test(lines.at(-1) ?? '')) return { ok: true }
  // T-996: a Problems block whose only items say "worse than main: none" is no problem (gaps main already has are follow-ups)
  const items = checkerProblems(text, Infinity)
  if (items.length && items.every(i => /^[-*_`\s]*worse than main:\s*none[.*_`\s]*$/i.test(i.trim()))) return { ok: true }
  return { ok: false, report: text }
}


/**
 * The checker's report as the task keeps it in test_output: its last TEST_OUTPUT_CHARS characters, so it fits in
 * the next prompt. A plain cut, not testTail: a report that quotes "(fail)" lines is not test output, and a
 * failed-tests heading in front of it would become its "first problem".
 */
export const checkerOutput = (report: string): string => {
  const s = String(report ?? '').trim()
  return `${CHECKER_MARK}\n${s.length <= TEST_OUTPUT_CHARS ? s : '…' + s.slice(-TEST_OUTPUT_CHARS)}`
}


/** {{test_output}} of a change prompt after the checker sent the last try back: its report, to fix. */
export const checkerRetryText = (output: string): string =>
  `\nA checker reviewed your last try and found problems; fix them (if one is wrong, say why in your report). Its report:\n\`\`\`\n${output.slice(CHECKER_MARK.length).trim()}\n\`\`\`\n`

/** The diff as a checker's prompt shows it: cut at CHECKER_DIFF_CHARS, with a line saying so. */
export const checkerDiff = (diff: string): string => {
  const d = String(diff ?? '').trimEnd()
  return d.length > CHECKER_DIFF_CHARS ? `${d.slice(0, CHECKER_DIFF_CHARS)}\n… (cut here: run git diff for the rest)` : d || '(no diff)'
}

/** The values of a checker's prompt. */
export type CheckerValues = { name: string; task_id: string; title: string; details: string; branch: string; folder: string; into: string; role: string; kind_name?: string; diff: string; changed_files: string; tests: string; org_mem?: string; learned?: string }

/** The most changed files a checker's prompt lists; the rest it reads with git diff --name-only. */
export const CHECKER_FILES_MAX = 200

/** {{changed_files}} of a checker's prompt: the changed files, one per line. */
export const checkerChangedFiles = (changed: readonly string[]): string => {
  if (!changed.length) return '  (none found: run git diff --name-only for them)'
  const shown = changed.slice(0, CHECKER_FILES_MAX).map(f => `  ${f}`)
  return [...shown, ...(changed.length > CHECKER_FILES_MAX ? [`  … and ${changed.length - CHECKER_FILES_MAX} more (run git diff --name-only for all)`] : [])].join('\n')
}

/**
 * {{tests}} of a checker's prompt (T-551). The checker runs before the task joins the merge line, and the project's
 * own tests (its test files and test commands) run once, in that line, after it: so it never runs them, and no
 * command is named for it to run. It checks the change with its own throwaway probes instead.
 */
export function checkerTestsText(name: string, commands: readonly string[]): string {
  const where = commands.length
    ? `${name} runs the project's test commands once, in the merge queue, after you`
    : `no test commands are set for this project, so nothing runs its tests in the merge queue after you; still, don't look for them`
  return `Don't run the project's own tests (its test files or test commands): ${where}. Check the change with your own throwaway probe tests and scripts (in .scratch/ or /tmp) instead, and say a new test would pass without the change only where your own probe shows it.`
}

/** A checker's prompt (prompts/checker.ts) with `v` filled in; {{learned}} and {{org_mem}} '' unless given (T-656: LEARNED_ASK only on a host with no debrief; see orgMemSection). */
export const checkerPrompt = (v: CheckerValues, task?: SymccTask): string => {
  const all: Record<string, string> = { ...v, org_mem: v.org_mem ?? '', learned: v.learned ?? '' }
  return buildPrompt({ kind: 'checker', values: all, ...(task ? { task } : {}) })
}

/** The history line of a checker's verdict: with problems, only the first problem (see firstProblemOf). */
export const checkerLine = (tryLabel: string, v: CheckerVerdict | null, why = ''): string =>
  !v ? `${tryLabel}: checker gave no verdict${why ? ` (${why})` : ''}` : 'report' in v ? `${tryLabel}: checker found problems: ${firstProblemOf(v.report)}` : `${tryLabel}: checker: OK`

/**
 * T-1079: the first problem of a checker's report, on one line: the first "- " item under its "Problems:" line, else the
 * text after "Problems:" on that line, else the report's first line.
 */
export function firstProblemOf(report: string): string {
  const first = checkerProblems(report)[0]
  if (first) return first
  const raw = String(report ?? '').split('\n').map(l => l.trim())
  const h = raw.findLastIndex(l => /^(#{1,6}\s*)?(\*\*|__|\*|_)?Problems:?(\*\*|__|\*|_)?:?$/.test(l))
  if (h >= 0) {
    const item = raw.slice(h + 1).find(Boolean)
    if (item?.startsWith('- ') && item.slice(2).trim()) return oneLine(item.slice(2).trim(), 300)
  }
  const lines = raw.filter(Boolean)
  const inline = lines.findLast(l => /^(\*\*|__|\*|_)?Problems:(\*\*|__|\*|_)?\s*\S/.test(l))
  const after = inline?.replace(/^(\*\*|__|\*|_)?Problems:(\*\*|__|\*|_)?\s*/, '').replace(/^[-*]\s+/, '')
  return oneLine(after || lines.find(l => l !== CHECKER_MARK) || '', 300)
}

/** The most problem lines saved on a checker's history entry. */
export const CHECKER_PROBLEMS_MAX = 5

/**
 * The problem lines of a checker's report (T-859): the report ends with one fixed block, a line that is exactly
 * "Problems:" and then one "- " line per problem (the checker prompt asks for it). Reads only the last such block: the
 * "- " lines right under the last "Problems:" line, up to CHECKER_PROBLEMS_MAX, with the "- " removed. [] when there is no block.
 */
export function checkerProblems(report: string, max = CHECKER_PROBLEMS_MAX): string[] {
  const lines = String(report ?? '').split('\n').map(l => l.trimEnd())
  const h = lines.findLastIndex(l => /^(\*\*|__|\*|_)?Problems:(\*\*|__|\*|_)?$/.test(l))
  if (h < 0) return []
  const out: string[] = []
  let cur: string | null = null
  const flush = () => { if (cur !== null && cur.trim()) out.push(oneLine(cur, 300)); cur = null }
  for (const l of lines.slice(h + 1)) {
    if (/^[-*] ?$/.test(l) || /^[-*] /.test(l)) {
      flush()
      cur = l.slice(2)
    } else if (!l.trim()) continue // blank lines under the heading or between items
    else if (cur !== null && /^\s+\S/.test(l)) cur += ` ${l.trim()}` // an item running onto an indented line
    else break
  }
  flush()
  return out.slice(0, max)
}

/**
 * T-1085: the lines of the Problems block itself (after the last "Problems:" heading, up to a markdown heading), one line each,
 * "- "/"* " bullets removed. For a block with no "- " items, so the update never quotes the report's prose. [] when there is none.
 */
export function problemsBlockLines(report: string, max = CHECKER_PROBLEMS_MAX): string[] {
  const lines = String(report ?? '').split('\n').map(l => l.trim())
  const h = lines.findLastIndex(l => /^(#{1,6}\s*)?(\*\*|__|\*|_)?Problems:?(\*\*|__|\*|_)?:?$/.test(l))
  if (h < 0) return []
  const out: string[] = []
  for (const l of lines.slice(h + 1)) {
    if (/^#{1,6}\s/.test(l)) break
    if (l) out.push(oneLine(l.replace(/^[-*+]\s+/, ''), 300))
  }
  return out.filter(Boolean).slice(0, max)
}

/** checkerLine as a history entry to add: "checker-ok", "checker-problems" (with its `problems` fact), or "checker" with no verdict. */
export const checkerEntry = (tryLabel: string, v: CheckerVerdict | null, why = '', tryNo = 0, who: { agent?: string; report?: string } = {}): HistoryAdd => {
  const problems = v && 'report' in v ? checkerProblems(v.report) : []
  return [!v ? 'checker' : 'report' in v ? 'checker-problems' : 'checker-ok', checkerLine(tryLabel, v, why), { try: tryNo, ...(problems.length ? { problems } : {}), ...(who.agent ? { agent: who.agent } : {}), ...(who.report ? { report: who.report } : {}) }]
}

const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** T-996: the checker sends a task back this many times; the next send-back stops and asks the owner. */
export const CHECKER_SEND_BACKS = 2

/** How many times the checker sent task `t` back (its "checker found problems" history lines, all tries). */
export const checkerSendBacks = (t: Pick<SymccTask, 'history'>): number => (t.history ?? []).filter(h => h.kind === 'checker-problems').length

/** T-996: the choices of the question a task waits with after the checker sent it back twice. */
export const CHECKER_ASK_OPTIONS = ['Merge as is', 'Keep fixing', 'Drop'] as const

/** T-996: that question for task `id` sent back `n` times, with the last finding (one line). */
export const checkerAskText = (id: string, n: number, finding: string): string =>
  `${id} was sent back ${n === 2 ? 'twice' : `${n} times`} by the checker: ${oneLine(finding, 300).replace(/[.\s]+$/, '')}. Merge as is / Keep fixing / Drop`

/** Whether `q` is that question. */
export const isCheckerAsk = (q: string | null | undefined): boolean => /^T-\d+ was sent back (twice|\d+ times) by the checker: [\s\S]*\. Merge as is \/ Keep fixing \/ Drop$/.test(String(q ?? '').trim())

/** The owner's answer to that question: which choice it names (its words at the start, any case), or undefined. */
export function parseCheckerAnswer(answer: string): 'merge' | 'fix' | 'drop' | undefined {
  const a = String(answer ?? '').trim().toLowerCase()
  if (a.startsWith('merge')) return 'merge'
  if (a.startsWith('keep') || a.startsWith('fix')) return 'fix'
  if (a.startsWith('drop')) return 'drop'
  return undefined
}
