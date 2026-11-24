// Task types: what a task is for (change, bug, feature, refactor, docs, investigation, or the owner's own).
// The built-in ones are texts in the plugin's kinds/<name>.ts (like the worker prompts); the owner's own are files
// `.<plugin name>/kinds/<name>.md` in the project, which win over a built-in one with the same name. Front matter: description (needed; the lead reads it
// to choose) and off: true (optional: the kind is never picked for a new task). The body is free text for now.
// Every task type runs like a change, except investigation.
import { DEFAULT_NAME } from '../name'
import { BUILT_IN_KIND_TEXTS } from '../../kinds'
import { DEFAULT_KIND, INVESTIGATION, KIND_NAME, kindOf } from './board-file'
import { frontMatterLine, splitFrontMatter } from './text'
import { type DefSource, type BrokenDef, brokenNamed, defSource, defNameError, leadBrokenDefLine, sourceLabel } from './def-files'

/** A task type, read from its file. Its name is always its file name (lowercase). */
export type KindDef = { name: string; description: string; body: string; off?: boolean }

/** The kinds that come with the plugin (one text each in its kinds/ folder), in the order they are listed. */
export const BUILT_IN_KINDS: readonly string[] = [DEFAULT_KIND, 'bug', 'feature', 'refactor', 'docs', INVESTIGATION]

/** A kind file as a KindDef, or the reason it can't be used ("no front matter", "no description", "bad name ..."). */
export function readKind(name: string, text: string): KindDef | string {
  const n = name.trim().toLowerCase()
  if (!KIND_NAME.test(n)) return `bad name "${name}" (use letters, digits, - and _ only)`
  const fm = splitFrontMatter(text)
  if (!fm.lines) return 'no front matter (it starts with a --- line, then description: ..., then ---)'
  let description = ''
  let off = false
  for (const line of fm.lines) {
    const kv = frontMatterLine(line)
    const value = kv ? kv.value.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').trim() : ''
    if (kv?.key === 'description') description = value
    if (kv?.key === 'off') off = /^(true|yes)$/i.test(value)
  }
  if (!description) return 'no description'
  return { name: n, description: description.slice(0, 200), body: fm.body.trim(), ...(off && !ALWAYS_ON_KINDS.includes(n) ? { off: true } : {}) }
}

/** A kind file as a KindDef, or null when it can't be used (see kindSkipReason). */
export function parseKind(name: string, text: string): KindDef | null {
  const k = readKind(name, text)
  return typeof k === 'string' ? null : k
}

/** Why a kind file can't be used, or null when it can. */
export function kindSkipReason(name: string, text: string): string | null {
  const k = readKind(name, text)
  return typeof k === 'string' ? k : null
}

/** The plugin's kinds, read from their texts (kinds/index.ts), in BUILT_IN_KINDS order; one that can't be read is left out. */
export function builtInKinds(): KindDef[] {
  return BUILT_IN_KINDS.flatMap(n => {
    const k = parseKind(n, BUILT_IN_KIND_TEXTS[n] ?? '')
    return k ? [k] : []
  })
}

/** The built-in task types with the project's added: a project kind replaces a built-in one with the same name.
 *  Built-in ones first in their own order (change first), then the owner's own by name. */
export function mergeKinds(builtIn: KindDef[], project: KindDef[]): KindDef[] {
  const out = new Map<string, KindDef>()
  for (const k of [...builtIn, ...project]) out.set(k.name, k)
  const rank = (n: string) => (BUILT_IN_KINDS.includes(n) ? BUILT_IN_KINDS.indexOf(n) : BUILT_IN_KINDS.length)
  return [...out.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}

/** Kind `name` (any case) from `kinds`, or undefined. */
export const findKind = <K extends { name: string }>(kinds: readonly K[], name: string | undefined): K | undefined => {
  const n = (name ?? '').trim().toLowerCase()
  return kinds.find(k => k.name === n)
}

/** The kinds that can't be turned off: the two ways a task runs. */
export const ALWAYS_ON_KINDS: readonly string[] = [DEFAULT_KIND, INVESTIGATION]

/** The names of the kinds a new task can get: the loaded ones that are not off, plus change and investigation, which are always known (the two ways a task runs). */
export function kindNames(kinds: readonly KindDef[]): string[] {
  const names = kinds.filter(k => !k.off).map(k => k.name)
  if (!names.includes(DEFAULT_KIND)) names.unshift(DEFAULT_KIND)
  if (!names.includes(INVESTIGATION)) names.push(INVESTIGATION)
  return names
}

/** The known kind name for `name`, or throws an error that lists the known kinds. */
export function checkKind(kinds: readonly KindDef[], name: unknown): string {
  const n = typeof name === 'string' ? name.trim().toLowerCase() : ''
  const names = kindNames(kinds)
  if (names.includes(n)) return n
  if (findKind(kinds, n)?.off) throw new Error(`Nothing changed: task type "${n}" is turned off (the owner can turn it on again: kinds action "on"); the task types are: ${names.join(', ')}`)
  throw new Error(`Nothing changed: unknown task type "${String(name)}"; the task types are: ${names.join(', ')}`)
}

/** The short kind mark for lists: the kind name, or '' for change (which shows nothing, to keep lines short). */
export const kindMark = (t: { kind?: unknown }): string => {
  const k = kindOf(t)
  return k === DEFAULT_KIND ? '' : k
}

/** What the worker prompt's {{kind}} becomes: "The task type is bug (something that works wrongly)." on its own line. */
export function kindSection(name: string, kinds: readonly KindDef[]): string {
  const k = findKind(kinds, name)
  return `\nThe task type is ${name}${k ? ` (${k.description})` : ''}.\n`
}

/** The lead's paragraph about kinds: each one with its description, and how to pick. */
export function kindsLeadText(kinds: readonly KindDef[], name: string = DEFAULT_NAME): string {
  const list = kindNames(kinds).map(n => {
    const k = findKind(kinds, n)
    return k ? `${n} (${k.description})` : n
  })
  return `- Task types (the kind parameter of ${name} add / change): ${list.join('; ')}. Pick the task type that fits each task; ${DEFAULT_KIND} when unsure. Every task type is worked, tested and merged like a change, except ${INVESTIGATION} (see below).`
}

// ---------------- managing kinds (the lead's kinds tool and the panel's Kinds page; like the roles) ----------------

/** Why `name` can't be a kind name (it goes into a file path), or null when it can. */
export const kindNameError = (name: string): string | null => defNameError('task type', name)

/** A kind's file text: the front matter (description, then off when set), then the body. */
export function kindFileText(k: Omit<KindDef, 'name'>): string {
  const lines = [`description: ${k.description.replace(/\s+/g, ' ').trim()}`]
  if (k.off) lines.push('off: true')
  return `---\n${lines.join('\n')}\n---\n${k.body.trim() ? `${k.body.trim()}\n` : ''}`
}

/** One kind's line for the lead's kinds list: "bug (built-in): something that works wrongly", with ", off" when it is off. */
const leadKindLine = (k: KindDef, source: DefSource): string => `- ${k.name} (${sourceLabel(source, k.off)}): ${k.description}`

/** The lead's line for a broken kind file: what it is, why, and the way out (reset for a built-in's name, remove for an added kind). */
export const leadBrokenKindLine = (b: BrokenDef, builtIn: readonly KindDef[]): string => leadBrokenDefLine('task type', b, builtIn)

/** The lead's kinds list: every task type, where it comes from and whether it is off; a kind whose file can't be read shows why instead. */
export function leadKindsText(builtIn: readonly KindDef[], project: readonly KindDef[], dir: string, broken: readonly BrokenDef[] = []): string {
  const all = mergeKinds([...builtIn], [...project])
  if (!all.length && !broken.length) return 'no task types found'
  const lines = all.map(k => {
    const b = brokenNamed(broken, k.name)
    return b ? leadBrokenKindLine(b, builtIn) : leadKindLine(k, defSource(k.name, builtIn, project)!)
  })
  for (const b of broken) if (!findKind(all, b.name)) lines.push(leadBrokenKindLine(b, builtIn))
  return `Task types (built-in = from the plugin, replaced = your ${dir}/<name>.md over a built-in, added = your own, off = never picked):\n${lines.join('\n')}`
}

/** One kind in full for the lead: its line, its file, its front matter and its body. */
export function leadKindText(k: KindDef, source: DefSource, file: string): string {
  return `${leadKindLine(k, source).slice(2)}\nfile: ${file}\n${kindFileText(k).trim()}`
}

/** What a new kind made in the panel starts with (the owner changes it in the edit mode). */
export const NEW_KIND_TEMPLATE = {
  description: 'what this task type is, in a few words (the lead reads it to choose)',
  body: 'What the worker does for this task type.',
} as const
