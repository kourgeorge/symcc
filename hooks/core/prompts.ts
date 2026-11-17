// Worker prompts: the fixed text a worker is started with, one per task kind: prompts/change.ts and
// prompts/investigation.ts in the plugin. They are built-in only; roles (roles/*.md, the Roles page) fill
// their {{role}} slot and are how the owner shapes what a worker does. {{placeholders}} in the text are
// filled in for each task. Everything here is pure.
import CHANGE from '../../prompts/change'
import INVESTIGATION from '../../prompts/investigation'

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
}

/** The placeholders of each prompt and what they become; any other {{word}} is left as written. */
export const PROMPT_PLACEHOLDERS: Record<PromptKind, Record<string, string>> = {
  change: {
    ...SHARED_PLACEHOLDERS,
    files: 'the "Files you may change" lines (the task\'s files, or "whatever the task needs")',
    test_command: 'the "these must pass" line with the test commands (or "There is no test command")',
    merge_main: 'only when the branch it merges into moved and conflicts: how to merge it first',
    test_output: 'only after a try failed its tests: the end of the test output',
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
  return text.replace(PLACEHOLDER, (all, p: string) => (p in known && p in values ? values[p]! : all))
}

/** The text a worker is started with: the built-in prompt of `kind` with its placeholders filled in (see fillPlaceholders). */
export function fillPrompt(kind: PromptKind, values: Record<string, string>): string {
  return fillPlaceholders(BUILT_IN_PROMPTS[kind], PROMPT_PLACEHOLDERS[kind], values).trimEnd()
}

/** The placeholders a role's checklist may use and what they become: the task's own facts from the prompt, not its
 *  bigger parts (not {{role}} itself, {{details}}, {{ask}} and the like). {{files}} and {{test_command}} are only filled for
 *  a change task (an investigation has neither, so they are left as written there). */
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

/** Where the role goes in a prompt. */
export const ROLE_SLOT = '{{role}}'

/** The placeholder names written in `text`, in order, each once. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map(m => m[1]!))]
}
