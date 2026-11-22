// What a worker or checker is told, as sections in a fixed order (T-851). Each section is one entry in PROMPT_SECTIONS: its name,
// the prompt kinds it belongs to, its heading, and a pure function from the task and board (PromptCtx) to its text, or null to leave
// the section out (an empty section is never written). PROMPT_ORDER says which sections each prompt has and where. Adding a task
// fact to the prompts later is one entry here plus its place in the order. The fixed texts live in prompts/*.ts.
// Placeholders ({{name}}, {{task.<path>}}) are filled in one pass (hooks/core/prompt-fill.ts), so text a task carries is never filled.
import type { SymccTask } from '../../types'
import { TEXT as CHANGE } from '../../prompts/change'
import { TEXT as INVESTIGATION } from '../../prompts/investigation'
import { TEXT as CHECKER } from '../../prompts/checker'
import type { Board } from './board-file'
import { intoOf } from './board-file'
import { CHECKER_MARK, isCheckerOutput } from './checker-mark'
import { fillPlaceholders } from './prompt-fill'
import { leadNotesText, splitLeadNotes } from './lead-notes'
import { testOutputHeading } from './test-output-heading'
import { triesTable } from './tries-table'

/** The prompts there are: a worker's on a change, a worker's on an investigation, and a checker's. */
export type SectionPromptKind = 'change' | 'investigation' | 'checker'

/** What a section is made from: the values the prompt is filled in with, and the task and board when the caller has them. */
export type PromptCtx = {
  kind: SectionPromptKind
  /** the {{placeholders}} (see PROMPT_PLACEHOLDERS) and their values */
  values: Record<string, string>
  task?: SymccTask
  board?: Board
  /** the commits of the earlier tries on the task's branch, one line each ("abc1234 subject"); left out when not known */
  commits?: readonly string[]
}

/** One section of a prompt. */
export type PromptSection = {
  name: string
  kinds: readonly SectionPromptKind[]
  /** its markdown heading ("## <heading>"); null: the text brings its own */
  heading: string | null
  /** what it holds, for the lists of placeholders and sections (the Roles page) */
  about: string
  /** the text as the Roles page shows it for `kind`: fixed words, with {{placeholders}} where task facts go */
  template: (kind: SectionPromptKind) => string
  /** the text for this task, or null to leave the section out */
  text: (c: PromptCtx) => string | null
}

const TEXTS: Record<SectionPromptKind, Record<string, string>> = { change: CHANGE, investigation: INVESTIGATION, checker: CHECKER }
const fixed = (c: PromptCtx, key: string): string => fillPlaceholders(TEXTS[c.kind][key] ?? '', c.values, c.values, c.task)
const ownText = (key: string) => (kind: SectionPromptKind) => TEXTS[kind][key] ?? ''

/** A section that says the same for every task (its words in prompts/*.ts under `key`). */
const fixedSection = (name: string, kinds: readonly SectionPromptKind[], heading: string | null, about: string, key: string): PromptSection => ({ name, kinds, heading, about, template: ownText(key), text: c => fixed(c, key) })

const WORKERS: readonly SectionPromptKind[] = ['change', 'investigation']
const ALL: readonly SectionPromptKind[] = ['change', 'investigation', 'checker']

const quote = (s: string) => s.split('\n').map(l => `> ${l}`.trimEnd()).join('\n')

/** The sections there are. A new one is an entry here plus its place in PROMPT_ORDER. */
export const PROMPT_SECTIONS: readonly PromptSection[] = [
  {
    name: 'title',
    kinds: ALL,
    heading: null,
    about: 'who the agent is, then the task\'s id, kind and role, its title and what its kind is for',
    template: k => `${TEXTS[k]!.intro}\n\n# Task {{task_id}} · {{kind_name}} · {{role_name}}${k === 'checker' ? '' : '\n\n{{kind}}'}`,
    text: c => {
      const v = c.values
      const kindName = v.kind_name || (c.kind === 'checker' ? 'change' : c.kind)
      const roleName = v.role_name || (c.kind === 'checker' ? 'checker' : 'general')
      return [fixed(c, 'intro'), `# Task ${v.task_id ?? ''} · ${kindName} · ${roleName}`, c.kind === 'checker' ? '' : (v.kind ?? '').trim()].filter(Boolean).join('\n\n')
    },
  },
  {
    name: 'why',
    kinds: ALL,
    heading: "Why, in the owner's words",
    about: 'why the task exists, and the owner\'s own request when there is one, quoted',
    template: () => '{{why}}',
    text: c => {
      const o = c.task?.origin
      if (!o) return null
      const why = o.why?.trim() && o.why.trim() !== 'made before origins were kept' ? o.why.trim() : ''
      const request = o.request?.trim() ?? ''
      if (!why && !request) return null
      return [why, request ? `The owner's request, in their words:\n${quote(request)}` : ''].filter(Boolean).join('\n\n')
    },
  },
  {
    name: 'what',
    kinds: ALL,
    heading: 'What to do',
    about: 'the task\'s details, without the lead\'s notes (those are in their own section)',
    template: () => '{{details}}',
    text: c => splitLeadNotes(c.values.details ?? '').text || null,
  },
  {
    name: 'lead_notes',
    kinds: ALL,
    heading: 'Notes from the lead',
    about: 'the lead\'s notes added to the details, oldest first, and the rule that the newest note wins',
    template: () => '{{lead_notes}}',
    text: c => leadNotesText(splitLeadNotes(c.values.details ?? '').notes),
  },
  {
    name: 'role',
    kinds: ALL,
    heading: null,
    about: 'the role\'s checklist, skills and web rule (left out for general)',
    template: () => '{{role}}',
    text: c => c.values.role?.trim() || null,
  },
  {
    name: 'files',
    kinds: ['change'],
    heading: 'Files you may change',
    about: 'the task\'s files (or "whatever the task needs") and what happens to a change anywhere else',
    template: () => '{{files}}',
    text: c => (c.task ? filesBody(c.task.files ?? []) : null),
  },
  {
    name: 'where',
    kinds: ALL,
    heading: 'Where you work',
    about: 'the folder and branch; after earlier tries, that their work is already there and its commits; when main moved, how to merge it in',
    template: k => `${TEXTS[k]!.where}${k === 'change' ? '\n{{merge_main}}\n{{earlier_work}}' : ''}`,
    text: c => {
      const t = c.task
      const merge = c.kind === 'change' && t?.merge_main ? `First, ${intoOf(t)} has moved and your branch now conflicts with it. In that folder, run \`git merge ${intoOf(t)}\` and resolve the conflicts (for this one step only you may run that git merge; still don't commit). Keep this task's intent, keep the changes inside the task's files, and make sure the tests pass.` : ''
      const work = c.kind === 'change' && c.commits?.length ? `Your earlier tries' work is already here: it is committed on your branch, and your folder shows it. Their commits:\n${c.commits.map(l => `- ${l}`).join('\n')}` : ''
      return [fixed(c, 'where'), merge, work].filter(Boolean).join('\n\n')
    },
  },
  {
    name: 'look_for',
    kinds: ['checker'],
    heading: 'What to look for',
    about: 'what a checker looks for',
    template: ownText('look_for'),
    text: c => fixed(c, 'look_for'),
  },
  {
    name: 'earlier_tries',
    kinds: WORKERS,
    heading: 'Earlier tries',
    about: 'a table with one row per earlier try (the last 5): how it ended, why, what its worker said, and the checker\'s first finding; then "Don\'t repeat those mistakes." on a change',
    template: () => '{{earlier_tries}}',
    text: c => {
      const table = c.task ? triesTable(c.task) : null
      return table ? `${table}${c.kind === 'change' ? "\n\nDon't repeat those mistakes." : ''}` : null
    },
  },
  {
    name: 'test_output',
    kinds: ['change'],
    heading: 'Last failure in full',
    about: 'only after a try failed: the failing tests with their errors and the end of the test output, or the checker\'s report',
    template: () => '{{test_output}}',
    text: c => {
      const out = c.task?.test_output
      if (!out) return null
      if (isCheckerOutput(out)) return `A checker reviewed your last try and found problems; fix them (if one is wrong, say why in your report). Its report:\n\`\`\`\n${out.slice(CHECKER_MARK.length).trim()}\n\`\`\``
      return `Your last try failed these tests; fix it. ${testOutputHeading(out)}\n\`\`\`\n${out}\n\`\`\``
    },
  },
  fixedSection('changed', ['checker'], 'Files it changed', 'the files the change touched, one per line', 'changed'),
  fixedSection('tests', ['change', 'checker'], 'Tests', 'the test commands and the test rule (a checker: that it never runs the project\'s tests)', 'tests'),
  fixedSection('diff', ['checker'], 'The change', 'the diff', 'diff'),
  fixedSection('rules', ALL, 'Rules', 'the git rule, the guard, background commands and where throwaway files go', 'rules'),
  {
    name: 'org_mem',
    kinds: ALL,
    heading: 'Notes from earlier agents',
    about: 'organizational memory (.symcc/org-mem.md): the notes earlier agents left (left out when there are none)',
    template: () => '{{org_mem}}',
    text: c => c.values.org_mem?.trim() || null,
  },
  fixedSection('done', ALL, "When you're done", 'how to end, and how to ask the owner', 'done'),
]

/** Which sections each prompt has and in what order: the task first, the rules last. */
export const PROMPT_ORDER: Record<SectionPromptKind, readonly string[]> = {
  change: ['title', 'why', 'what', 'lead_notes', 'role', 'files', 'where', 'earlier_tries', 'test_output', 'tests', 'rules', 'org_mem', 'done'],
  investigation: ['title', 'why', 'what', 'lead_notes', 'role', 'where', 'earlier_tries', 'rules', 'org_mem', 'done'],
  checker: ['title', 'why', 'what', 'lead_notes', 'role', 'look_for', 'where', 'changed', 'tests', 'diff', 'rules', 'org_mem', 'done'],
}

/** The "Files you may change" text: the files, and what a change anywhere else does. */
export function filesBody(files: readonly string[]): string {
  return files.length
    ? `${files.join(', ')}. This is the full list; if you change files anywhere else, those changes are undone and the try fails.\nAn edit outside this list is refused and asks the owner for that file; then stop and hand back (what you already changed in your folder is kept for the next try).`
    : 'whatever the task needs.'
}

const clean = (s: string) => s.replace(/^\n+/, '').replace(/\s+$/, '')

/** The prompt for `ctx.kind`: the sections of `order` that `registry` has for it, each under its heading, the empty ones left out. */
export function buildPrompt(ctx: PromptCtx, registry: readonly PromptSection[] = PROMPT_SECTIONS, order: Record<SectionPromptKind, readonly string[]> = PROMPT_ORDER): string {
  const parts: string[] = []
  for (const name of order[ctx.kind]) {
    const s = registry.find(x => x.name === name && x.kinds.includes(ctx.kind))
    if (!s) continue
    const body = clean(s.text(ctx) ?? '')
    if (!body.trim()) continue
    parts.push(s.heading ? `## ${s.heading}\n\n${body}` : body)
  }
  return parts.join('\n\n')
}

/** The prompt of `kind` as the Roles page shows it: every section's heading and fixed words, with {{placeholders}} where task facts go. */
export function promptTemplate(kind: SectionPromptKind, registry: readonly PromptSection[] = PROMPT_SECTIONS, order: Record<SectionPromptKind, readonly string[]> = PROMPT_ORDER): string {
  const parts: string[] = []
  for (const name of order[kind]) {
    const s = registry.find(x => x.name === name && x.kinds.includes(kind))
    if (s) parts.push(s.heading ? `## ${s.heading}\n\n${clean(s.template(kind))}` : clean(s.template(kind)))
  }
  return parts.join('\n\n')
}
