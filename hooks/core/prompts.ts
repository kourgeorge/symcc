// Worker prompts: the fixed text a worker is started with, one per task kind: prompts/change.ts and
// prompts/investigation.ts in the plugin. They are built-in only; roles (roles/*.md, the Roles page) fill
// their {{role}} slot and are how the owner shapes what a worker does. {{placeholders}} in the text are
// filled in for each task. Everything here is pure.
import CHANGE from '../../prompts/change'
import INVESTIGATION from '../../prompts/investigation'
import CHECKER from '../../prompts/checker'
import { ASK_TOOL, ASK_LINE } from './ask'
import { WEB_SAFETY_LINE } from './roles'

/** The prompts there are: one per task kind. */
export type PromptKind = 'change' | 'investigation'
export const PROMPT_KINDS: readonly PromptKind[] = ['change', 'investigation']

/** The built-in prompts, as the plugin ships them. */
export const BUILT_IN_PROMPTS: Record<PromptKind, string> = { change: CHANGE, investigation: INVESTIGATION }

const SHARED_PLACEHOLDERS: Record<string, string> = {
  name: 'the plugin\'s name (symcc)',
  task_id: 'the task\'s id, e.g. T-12',
  title: 'the task\'s title',
  details: 'the task\'s details',
  branch: 'the worker\'s branch, e.g. symcc/T-12',
  folder: 'the worker\'s own folder (its copy of the project)',
  role: 'the role\'s checklist, skills and web rule (empty for general)',
  kind: 'the task\'s kind and what it is for, e.g. "Kind of task: bug (something that works wrongly)."',
  org_mem: 'only when organizational memory (.symcc/org-mem.md) has lines: "Organizational memory (org-mem): notes earlier agents left about this project", then its lines',
  learned: 'how to end the report with an optional "Learned:" section for organizational memory (org-mem); only on a host that can\'t send the debrief after the hand-back (T-656), else empty',
}

/** The placeholders of each prompt and what they become; any other {{word}} is left as written. */
export const PROMPT_PLACEHOLDERS: Record<PromptKind, Record<string, string>> = {
  change: {
    ...SHARED_PLACEHOLDERS,
    file_tools: 'what the worker uses on files, as the host names it (e.g. "Read, Edit and Write")',
    files: 'the "Files you may change" lines (the task\'s files, or "whatever the task needs")',
    test_command: 'the "these must pass" line with the test commands (or "There is no test command")',
    merge_main: 'only when the branch it merges into moved and conflicts: how to merge it first',
    test_output: 'only after a try failed its tests: its failing tests with their errors (when the output was long), then the end of the test output',
    earlier_tries: 'only when there were earlier tries: the last ones, and "Don\'t repeat those mistakes."',
    ask: 'how to ask the owner and what a refused edit means',
  },
  investigation: {
    ...SHARED_PLACEHOLDERS,
    earlier_tries: 'only when there were earlier tries: the last ones',
    ask_more: 'only after the owner pressed Ask more: hand back the whole updated answer',
    ask: 'how to ask the owner and what a refused edit means',
  },
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_]+)\s*\}\}/g

/** `text` with every placeholder named in `known` replaced by its value from `values`, in one pass (so a value that holds "{{...}}",
 *  e.g. in the task's details, is never filled again). Any other {{word}}, or one without a value, is left as written. */
export function fillPlaceholders(text: string, known: Record<string, unknown>, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (all, p: string) => (Object.hasOwn(known, p) && Object.hasOwn(values, p) ? values[p]! : all))
}

/** The text a worker is started with: the built-in prompt of `kind` with its placeholders filled in (see fillPlaceholders). */
export function fillPrompt(kind: PromptKind, values: Record<string, string>): string {
  return fillPlaceholders(BUILT_IN_PROMPTS[kind], PROMPT_PLACEHOLDERS[kind], values).trimEnd()
}

/** The placeholders a role's checklist may use and what they become: the task's own facts from the prompt, not its
 *  bigger parts (not {{role}} itself, {{details}}, {{ask}} and the like). {{files}} and {{test_command}} are only filled for
 *  a change task and its checker (an investigation has neither, so they are left as written there). */
export const ROLE_PLACEHOLDERS: Record<string, string> = {
  task_id: SHARED_PLACEHOLDERS.task_id!,
  title: SHARED_PLACEHOLDERS.title!,
  files: PROMPT_PLACEHOLDERS.change.files!,
  test_command: PROMPT_PLACEHOLDERS.change.test_command!,
  folder: SHARED_PLACEHOLDERS.folder!,
  branch: SHARED_PLACEHOLDERS.branch!,
  kind: SHARED_PLACEHOLDERS.kind!,
  name: SHARED_PLACEHOLDERS.name!,
}

/** A role's checklist with its placeholders filled in for the task (see ROLE_PLACEHOLDERS). */
export const fillRole = (checklist: string, values: Record<string, string>): string => fillPlaceholders(checklist, ROLE_PLACEHOLDERS, values)

/** The built-in prompts a role can be put into, to look at from its page: a worker's two, and the checker's (prompts/checker.ts). */
export type RolePromptKind = PromptKind | 'checker'
export const ROLE_PROMPTS: Record<RolePromptKind, string> = { ...BUILT_IN_PROMPTS, checker: CHECKER }

/** The built-in prompts role `name` goes into: the checker role (see CHECKER_ROLE) only into the checker's prompt, any other
 *  role into a worker's prompt, one per task kind. */
export const promptsOfRole = (name: string): RolePromptKind[] => (name.toLowerCase() === 'checker' ? ['checker'] : [...PROMPT_KINDS])

/** Where the role goes in a prompt. */
export const ROLE_SLOT = '{{role}}'

/** The placeholder names written in `text`, in order, each once. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map(m => m[1]!))]
}

/**
 * What an agent started with no symcc tools does instead of calling ask_owner (T-474): e.g. a `claude -p` process,
 * whose permissions give it only the host's own tools.
 */
export const NO_TOOLS_ASK = 'To ask the owner something, write the question in your report and stop (you have no tool for it)'

/** What a base prompt says, beyond the agent's kind (see basePromptFor). */
export type BaseOptions = {
  /** the agent can call symcc's tools (ask_owner, board, stats); default true. False: the prompt names none of them */
  symccTools?: boolean
  /** the agent has web tools (its role's `tools: web`): a worker gets WEB_SAFETY_LINE, a scout is told it may use the web */
  web?: boolean
}

/**
 * The base prompt every worker gets, before its task's prompt: who it is and how it hands back. `name` is the plugin's
 * name, `tool` what the model calls symcc's tool `t` by (HostWords.tool with the name filled in), and `web` adds
 * WEB_SAFETY_LINE (a worker whose role has web tools). Claude Code's adapter gives it as the worker agent types' prompt
 * (claude/registration.ts); a host with no agent types puts it in front of the task prompt (see basePromptFor).
 * `symccTools` false: the worker has no ask_owner tool, so it writes its question in its report (NO_TOOLS_ASK).
 */
export const WORKER_BASE = (name: string, tool: (t: string) => string, web = false, symccTools = true): string =>
  `You are a ${name} worker. You get exactly one task and the folder (your own copy of the project) to do it in. Do it there, keep the change small and inside the task's files, run the tests you were given, and finish with a one or two sentence summary. ${symccTools ? `To ask the owner something, call the ${tool(ASK_TOOL)} tool` : NO_TOOLS_ASK}; if an edit is refused as outside your files, stop and hand back.${web ? ` ${WEB_SAFETY_LINE}` : ''}`

/**
 * The base prompt every scout and checker gets (checkers run as scouts), before its own prompt; see WORKER_BASE.
 * `o.symccTools` false: no board and stats tools are named, and the web only when `o.web` (the agent's permissions
 * are all it has).
 */
export const SCOUT_BASE = (name: string, tool: (t: string) => string, o: BaseOptions = {}): string =>
  o.symccTools === false
    ? `You are a ${name} scout. You do the job your scout file gives you, using the project and the shell${o.web ? ' and the web' : ''}, and end with a short plain report (or exactly NOTHING). You never change, create or delete files in the project.`
    : `You are a ${name} scout. You do the job your scout file gives you, using the project, the shell and the web, and end with a short plain report (or exactly NOTHING). You never change, create or delete files in the project. To look at the board, use the ${tool('board')} and ${tool('stats')} tools (they only read), not the board file.`

/**
 * The base prompt for an agent of `kind`: WORKER_BASE for a worker, SCOUT_BASE for a scout or a checker. A host whose
 * agents can't call symcc's tools (a `claude -p` process, hooks/process/) passes `symccTools: false`.
 */
export const basePromptFor = (kind: 'worker' | 'scout' | 'checker', name: string, tool: (t: string) => string, o: BaseOptions = {}): string =>
  kind === 'worker' ? WORKER_BASE(name, tool, o.web === true, o.symccTools !== false) : SCOUT_BASE(name, tool, o)

/**
 * A task prompt for an agent with no symcc tools: its "call the ask_owner tool" line (ASK_LINE, as the prompt was
 * filled in with `tool`'s name for it) says to write the question in the report instead (NO_TOOLS_ASK).
 */
export const withoutSymccTools = (prompt: string, tool: (t: string) => string): string =>
  prompt.split(ASK_LINE(tool(ASK_TOOL))).join(`${NO_TOOLS_ASK}. If an edit is refused as outside your files, stop and hand back.`)
