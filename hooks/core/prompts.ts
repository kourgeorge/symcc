// Worker prompts: what a worker is started with, one per task kind (a change, an investigation), and the checker's. Each is put
// together from sections in a fixed order (prompt-sections.ts, T-851), the fixed words in prompts/*.ts in the plugin. They are
// built-in only; roles (roles/*.md, the Roles page) fill their role section and are how the owner shapes what a worker does.
// {{placeholders}} in the text are filled in for each task, and {{task.<path>}} gives any field of the task. Everything here is pure.
import type { SymccTask } from '../../types'
import type { Board } from './board-file'
import { ASK_TOOL, ASK_LINE } from './ask'
import { WEB_SAFETY_LINE } from './roles'
import { fillPlaceholders, placeholdersIn, TASK_PLACEHOLDER, TASK_PLACEHOLDER_ABOUT } from './prompt-fill'
import { PROMPT_SECTIONS, PROMPT_ORDER, buildPrompt, promptTemplate, type PromptSection } from './prompt-sections'

export { fillPlaceholders, placeholdersIn }

/** The prompts there are: one per task kind. */
export type PromptKind = 'change' | 'investigation'
export const PROMPT_KINDS: readonly PromptKind[] = ['change', 'investigation']

/**
 * A table whose values are made the first time each is read, then kept (T-853). The tables below are built from
 * prompt-sections.ts, which (through board-file.ts, history.ts and roles.ts) imports this file, so building them at load
 * would read PROMPT_SECTIONS before it exists when prompt-sections.ts is the first module loaded.
 */
const lazyTable = <K extends string, V>(keys: readonly K[], make: (k: K) => V): Record<K, V> => {
  const table = {} as Record<K, V>
  for (const k of keys) {
    Object.defineProperty(table, k, {
      enumerable: true,
      configurable: true,
      get: () => {
        const v = make(k)
        Object.defineProperty(table, k, { value: v, enumerable: true, writable: true, configurable: true })
        return v
      },
    })
  }
  return table
}

/** The built-in prompts as the Roles page shows them: the sections in order, with {{placeholders}} where a task's facts go. */
export const BUILT_IN_PROMPTS: Record<PromptKind, string> = lazyTable(PROMPT_KINDS, promptTemplate)

const SHARED_PLACEHOLDERS: Record<string, string> = {
  name: 'the plugin\'s name (symcc)',
  task_id: 'the task\'s id, e.g. T-12',
  title: 'the task\'s title',
  details: 'the task\'s details, without the lead\'s notes (they are in their own section)',
  branch: 'the worker\'s branch, e.g. symcc/T-12',
  folder: 'the worker\'s own folder (its copy of the project)',
  role: 'the role\'s checklist, skills and web rule (empty for general)',
  kind: 'the task\'s kind and what it is for, e.g. "Kind of task: bug (something that works wrongly)."',
  kind_name: 'the task\'s kind, e.g. bug',
  role_name: 'the task\'s role, e.g. tester',
  org_mem: 'only when organizational memory (.symcc/org-mem.md) has lines: "Organizational memory (org-mem): notes earlier agents left about this project", then its lines',
  learned: 'how to end the report with an optional "Learned:" section for organizational memory (org-mem); only on a host that can\'t send the debrief after the hand-back (T-656), else empty',
}

/** The placeholder each section of a prompt stands for, and what it becomes (the sections' own `about`, unless one is told above). */
const sectionPlaceholders = (kind: PromptKind, registry: readonly PromptSection[] = PROMPT_SECTIONS): Record<string, string> =>
  Object.fromEntries(
    PROMPT_ORDER[kind].flatMap(n => {
      const s = registry.find(x => x.name === n && x.kinds.includes(kind))
      return s && !(s.name in SHARED_PLACEHOLDERS) && !['title', 'what', 'where', 'tests', 'rules', 'done'].includes(s.name) ? [[s.name, s.about]] : []
    }),
  )

const FILES_ABOUT = 'the "Files you may change" lines (the task\'s files, or "whatever the task needs")'
const TEST_COMMAND_ABOUT = 'the "these must pass" line with the test commands (or "There is no test command")'

/** The placeholders of each prompt and what they become; any other {{word}} is left as written. {{task.<path>}} works everywhere. */
export const PROMPT_PLACEHOLDERS: Record<PromptKind, Record<string, string>> = lazyTable(PROMPT_KINDS, kind => kind === 'change'
  ? {
    ...SHARED_PLACEHOLDERS,
    ...sectionPlaceholders('change'),
    file_tools: 'what the worker uses on files, as the host names it (e.g. "Read, Edit and Write")',
    files: FILES_ABOUT,
    test_command: TEST_COMMAND_ABOUT,
    merge_main: 'only when the branch it merges into moved and conflicts: how to merge it first',
    earlier_work: 'only when earlier tries left commits on the branch: that their work is already in the folder, and the commits',
    ask: 'how to ask the owner and what a refused edit means',
    [TASK_PLACEHOLDER]: TASK_PLACEHOLDER_ABOUT,
  }
  : {
    ...SHARED_PLACEHOLDERS,
    ...sectionPlaceholders('investigation'),
    ask_more: 'only after the owner pressed Ask more: hand back the whole updated answer',
    ask: 'how to ask the owner and what a refused edit means',
    [TASK_PLACEHOLDER]: TASK_PLACEHOLDER_ABOUT,
  })

/**
 * The text a worker is started with: the sections of `kind`'s prompt (see buildPrompt) made from `values` and, for the task's own
 * facts (why, the tries, the files, the last failure), from `task` and `board`. `commits`: the earlier tries' commits, one line each.
 */
export function fillPrompt(kind: PromptKind, values: Record<string, string>, task?: SymccTask, board?: Board, commits?: readonly string[]): string {
  return buildPrompt({ kind, values, ...(task ? { task } : {}), ...(board ? { board } : {}), ...(commits ? { commits } : {}) })
}

/** The placeholders a role's checklist may use and what they become: the task's own facts from the prompt, not its
 *  bigger parts (not {{role}} itself, {{details}}, {{ask}} and the like). {{files}} and {{test_command}} are only filled for
 *  a change task and its checker (an investigation has neither, so they are left as written there). {{task.<path>}} gives any
 *  field of the task. */
export const ROLE_PLACEHOLDERS: Record<string, string> = {
  task_id: SHARED_PLACEHOLDERS.task_id!,
  title: SHARED_PLACEHOLDERS.title!,
  files: FILES_ABOUT,
  test_command: TEST_COMMAND_ABOUT,
  folder: SHARED_PLACEHOLDERS.folder!,
  branch: SHARED_PLACEHOLDERS.branch!,
  kind: SHARED_PLACEHOLDERS.kind!,
  name: SHARED_PLACEHOLDERS.name!,
  [TASK_PLACEHOLDER]: TASK_PLACEHOLDER_ABOUT,
}

/** A role's checklist with its placeholders filled in for the task (see ROLE_PLACEHOLDERS); `task` fills {{task.<path>}}. */
export const fillRole = (checklist: string, values: Record<string, string>, task?: unknown): string => fillPlaceholders(checklist, ROLE_PLACEHOLDERS, values, task)

/** The built-in prompts a role can be put into, to look at from its page: a worker's two, and the checker's. */
export type RolePromptKind = PromptKind | 'checker'
export const ROLE_PROMPTS: Record<RolePromptKind, string> = lazyTable([...PROMPT_KINDS, 'checker'], k => (k === 'checker' ? promptTemplate('checker') : BUILT_IN_PROMPTS[k]))

/** The sections a prompt has, in order: "name: what it holds" for each, as the Roles page lists them. */
export const promptSectionLines = (kind: RolePromptKind): string[] =>
  PROMPT_ORDER[kind].flatMap(n => {
    const s = PROMPT_SECTIONS.find(x => x.name === n && x.kinds.includes(kind))
    return s ? [`${s.heading ?? 'Your role'}: ${s.about}`] : []
  })

/** The built-in prompts role `name` goes into: the checker role (see CHECKER_ROLE) only into the checker's prompt, any other
 *  role into a worker's prompt, one per task kind. */
export const promptsOfRole = (name: string): RolePromptKind[] => (name.toLowerCase() === 'checker' ? ['checker'] : [...PROMPT_KINDS])

/** Where the role goes in a prompt. */
export const ROLE_SLOT = '{{role}}'


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
 * T-895: `kind` 'scout' also names the scouts tool (action list: a scout sees the other scouts). 'checker' or none
 * given (Claude Code's one scout agent type, which checkers run as too) does not, as a checker may not call it; a
 * scout there learns it from its run prompt (scoutToolLines in core/scouts.ts). `o.symccTools` false: no board, stats or scouts tools are named, and the web only when `o.web` (the
 * agent's permissions are all it has).
 */
export const SCOUT_BASE = (name: string, tool: (t: string) => string, o: BaseOptions = {}, kind?: 'scout' | 'checker'): string => {
  if (o.symccTools === false)
    return `You are a ${name} scout. You do the job your scout file gives you, using the project and the shell${o.web ? ' and the web' : ''}, and end with a short plain report (or exactly NOTHING). You never change, create or delete files in the project.`
  const list = kind === 'scout' ? ` To see the other scouts, use the ${tool('scouts')} tool with action list (it only reads too).` : ''
  return `You are a ${name} scout. You do the job your scout file gives you, using the project, the shell and the web, and end with a short plain report (or exactly NOTHING). You never change, create or delete files in the project. To look at the board, use the ${tool('board')} and ${tool('stats')} tools (they only read), not the board file.${list}`
}

/**
 * The base prompt for an agent of `kind`: WORKER_BASE for a worker, SCOUT_BASE for a scout or a checker (only a
 * scout's names the scouts tool, T-895). A host whose agents can't call symcc's tools (a `claude -p` process,
 * hooks/process/) passes `symccTools: false`.
 */
export const basePromptFor = (kind: 'worker' | 'scout' | 'checker', name: string, tool: (t: string) => string, o: BaseOptions = {}): string =>
  kind === 'worker' ? WORKER_BASE(name, tool, o.web === true, o.symccTools !== false) : SCOUT_BASE(name, tool, o, kind)

/**
 * A task prompt for an agent with no symcc tools: its "call the ask_owner tool" line (ASK_LINE, as the prompt was
 * filled in with `tool`'s name for it) says to write the question in the report instead (NO_TOOLS_ASK).
 */
export const withoutSymccTools = (prompt: string, tool: (t: string) => string): string =>
  prompt.split(ASK_LINE(tool(ASK_TOOL))).join(`${NO_TOOLS_ASK}. If an edit is refused as outside your files, stop and hand back.`)
