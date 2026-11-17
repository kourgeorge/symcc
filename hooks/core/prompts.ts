// Worker prompts: the fixed text a worker is started with, one per task kind. The built-in ones are
// prompts/change.ts and prompts/investigation.ts in the plugin; the owner's own copy in
// .<name>/prompts/<kind>.md is used instead (like roles/ and .<name>/roles/). {{placeholders}} in
// the text are filled in for each task. Everything here is pure.
import CHANGE from '../../prompts/change'
import INVESTIGATION from '../../prompts/investigation'
import type { KeyHint } from './panel'

/** The prompts there are: one per task kind. */
export type PromptKind = 'change' | 'investigation'
export const PROMPT_KINDS: readonly PromptKind[] = ['change', 'investigation']

/** Whether `x` names a prompt. */
export const isPromptKind = (x: unknown): x is PromptKind => typeof x === 'string' && (PROMPT_KINDS as readonly string[]).includes(x)

/** The built-in prompts, as the plugin ships them. */
export const BUILT_IN_PROMPTS: Record<PromptKind, string> = { change: CHANGE, investigation: INVESTIGATION }

/** What one line of a prompt is for, shown on the Prompts page and in the lead's prompts tool. */
export const PROMPT_ABOUT: Record<PromptKind, string> = {
  change: 'what a worker on a change task is told (it changes files, which are committed, tested and merged)',
  investigation: 'what a worker on an investigation is told (it finds an answer and hands it back; nothing is kept)',
}

const SHARED_PLACEHOLDERS: Record<string, string> = {
  name: 'the plugin\'s name (symcc)',
  task_id: 'the task\'s id, e.g. T-12',
  title: 'the task\'s title',
  details: 'the task\'s details (needed: added at the end when missing)',
  branch: 'the worker\'s branch, e.g. symcc/T-12',
  folder: 'the worker\'s own folder (its copy of the project)',
  role: 'the role\'s checklist, skills and web rule (empty for general)',
  kind: 'the task\'s kind and what it is for, e.g. "Kind of task: bug (something that works wrongly)."',
  stage: 'only for a kind with more than one worker stage: the stage this worker runs and its instructions, e.g. "Stage fix (3 of 4) of a bug task."',
  earlier_stages: 'only after earlier stages finished: one line each, with its report file (copied into the worker\'s folder)',
}

/** The placeholders of each prompt and what they become. {{details}} and {{ask}} are needed in both, {{merge_main}} and {{test_output}} in the change prompt (see REQUIRED_PLACEHOLDERS). */
export const PROMPT_PLACEHOLDERS: Record<PromptKind, Record<string, string>> = {
  change: {
    ...SHARED_PLACEHOLDERS,
    files: 'the "Files you may change" lines (the task\'s files, or "whatever the task needs")',
    test_command: 'the "these must pass" line with the test commands (or "There is no test command")',
    merge_main: 'only when the branch it merges into moved and conflicts: how to merge it first (needed: added at the end when missing)',
    test_output: 'only after a try failed its tests: the end of the test output (needed: added at the end when missing)',
    earlier_tries: 'only when there were earlier tries: the last ones, and "Don\'t repeat those mistakes."',
    ask: 'how to ask the owner and what a refused edit means (needed: added at the end when missing)',
  },
  investigation: {
    ...SHARED_PLACEHOLDERS,
    earlier_tries: 'only when there were earlier tries: the last ones',
    ask_more: 'only after the owner pressed Ask more: hand back the whole updated answer',
    ask: 'how to ask the owner and what a refused edit means (needed: added at the end when missing)',
  },
}

/** The placeholders symcc depends on in each prompt, in the order they are added at the end of a prompt that misses one, and what is added.
 *  The change prompt also needs {{merge_main}} (the only place a worker is told to merge the moved branch after a conflict) and
 *  {{test_output}} (why the last try failed its tests); both are empty when not needed. */
export const REQUIRED_PLACEHOLDERS: Record<PromptKind, Record<string, string>> = {
  change: {
    details: '\n\nTask {{task_id}}: {{title}}\n{{details}}',
    merge_main: '{{merge_main}}', // its value starts with its own new line, like test_output's
    test_output: '{{test_output}}',
    ask: '\n{{ask}}',
  },
  investigation: {
    details: '\n\nTask {{task_id}}: {{title}}\n{{details}}',
    ask: '\n{{ask}}',
  },
}

/** Why each needed placeholder matters, as said in a warning. */
const NEEDED_FOR: Record<string, string> = {
  details: 'the task itself',
  ask: 'how the worker asks the owner and hands back',
  merge_main: 'how the worker merges the moved branch after a conflict',
  test_output: 'why the last try failed its tests',
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_]+)\s*\}\}/g

/** The placeholder names written in `text`, in order, each once. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map(m => m[1]!))]
}

/** What is wrong with prompt text `text` of kind `kind`: an empty text, a needed placeholder missing (it is added at the end), a placeholder symcc doesn't know (left as written). */
export function promptProblems(kind: PromptKind, text: string): string[] {
  if (!text.trim()) return ['the file is empty, so the built-in prompt is used']
  const have = placeholdersIn(text)
  const known = PROMPT_PLACEHOLDERS[kind]
  return [
    ...Object.keys(REQUIRED_PLACEHOLDERS[kind]).filter(p => !have.includes(p)).map(p => `{{${p}}} is missing (${NEEDED_FOR[p]}): it is added at the end`),
    ...have.filter(p => !(p in known)).map(p => `{{${p}}} is not a placeholder of the ${kind} prompt: it is left as written`),
  ]
}

/** The text a worker is started with: `template` (an empty one: the built-in) with every known placeholder replaced by its value, in one pass
 *  (so a value that holds "{{...}}", e.g. in the task's details, is never filled again). A needed placeholder that is missing is added at the end. */
export function fillPrompt(kind: PromptKind, template: string, values: Record<string, string>): string {
  let text = template.trim() ? template : BUILT_IN_PROMPTS[kind]
  const have = placeholdersIn(text)
  for (const [p, add] of Object.entries(REQUIRED_PLACEHOLDERS[kind])) if (!have.includes(p)) text = `${text.trimEnd()}${add}`
  return text.replace(PLACEHOLDER, (all, p: string) => (p in PROMPT_PLACEHOLDERS[kind] && p in values ? values[p]! : all)).trimEnd()
}

/** The owner's file of prompt `kind`, under the project's folder `dir` (e.g. ".symcc"). */
export const promptFileOf = (dir: string, kind: PromptKind) => `${dir}/prompts/${kind}.md`

/** Where the built-in prompt is, as shown. */
export const builtInPromptFile = (kind: PromptKind) => `prompts/${kind}.ts (in the plugin)`

/** Where a prompt comes from: the plugin's, or the owner's file used instead. */
export type PromptSource = 'built-in' | 'yours'

/** The source of prompt `kind` given the owner's texts (an empty file doesn't count: the built-in is used). */
export const promptSource = (own: Partial<Record<PromptKind, string>>, kind: PromptKind): PromptSource => (own[kind]?.trim() ? 'yours' : 'built-in')

/** The lead's prompts list: each prompt, where it comes from, and what is wrong with the owner's copy. */
export function leadPromptsText(own: Partial<Record<PromptKind, string>>, dir: string, name: string): string {
  const lines = PROMPT_KINDS.map(k => {
    const source = promptSource(own, k)
    const problems = own[k] !== undefined ? promptProblems(k, own[k]!) : []
    return `- ${k} (${source === 'yours' ? `yours: ${promptFileOf(dir, k)}` : 'built-in'}): ${PROMPT_ABOUT[k]}${problems.length ? `\n  ⚠ ${problems.join('; ')}` : ''}`
  })
  return `Worker prompts (the owner's ${dir}/prompts/<kind>.md is used instead of the built-in one; a change counts from the next worker on):\n${lines.join('\n')}\nUse ${name} prompts with action list and name to see one in full, edit to change it, reset to bring the built-in back.`
}

/** One prompt in full for the lead: where it comes from, its file, what is wrong with it, its placeholders and its text. */
export function leadPromptText(kind: PromptKind, own: Partial<Record<PromptKind, string>>, dir: string): string {
  const source = promptSource(own, kind)
  const text = source === 'yours' ? own[kind]! : BUILT_IN_PROMPTS[kind]
  const problems = own[kind] !== undefined ? promptProblems(kind, own[kind]!) : []
  const holders = Object.entries(PROMPT_PLACEHOLDERS[kind]).map(([p, m]) => `  {{${p}}}: ${m}`)
  return [
    `${kind} prompt (${source}): ${PROMPT_ABOUT[kind]}`,
    `file: ${source === 'yours' ? promptFileOf(dir, kind) : `${builtInPromptFile(kind)}; edit copies it to ${promptFileOf(dir, kind)}`}`,
    ...(problems.length ? [`⚠ ${problems.join('; ')}`] : []),
    `placeholders:\n${holders.join('\n')}`,
    `text:\n${text.trimEnd()}`,
  ].join('\n')
}

/** The keys at the bottom of the Prompts page (opened from Settings). */
export const promptsKeys = (): KeyHint[] => [
  { key: 'Enter', word: 'open' },
  { key: '↑↓', word: 'move' },
  { key: 't s c', word: 'views' },
  { key: 'b', word: 'back' },
]

/** The keys at the bottom of one prompt's page. */
export const promptKeys = (canReset: boolean): KeyHint[] => [
  { key: 'e', word: 'edit' },
  ...(canReset ? [{ key: 'r', word: 'reset to built-in' }] : []),
  { key: 'b', word: 'back' },
]

/** The keys at the bottom of a prompt's edit page: its box takes every letter, so the way out is its Cancel button. */
export const promptEditKeys = (): KeyHint[] => [{ key: 'Cancel', word: 'leaves without saving' }]
