// Task kinds: what a task is for (change, bug, feature, refactor, docs, investigation, or the owner's own).
// The built-in ones are texts in the plugin's kinds/<name>.ts (like the worker prompts); the owner's own are files
// `.<plugin name>/kinds/<name>.md` in the project, which win over a built-in one with the same name. Front matter: description (needed; the lead reads it
// to choose) and off: true (optional: the kind is never picked for a new task). The body is free text for now.
// Every kind runs like a change, except investigation.
import { DEFAULT_NAME } from '../name'
import { BUILT_IN_KIND_TEXTS } from '../../kinds'
import { DEFAULT_KIND, INVESTIGATION, KIND_NAME, kindOf } from './board-file'
import { frontMatterLine, splitFrontMatter } from './text'

/** A task kind, read from its file. Its name is always its file name (lowercase). */
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

/** The built-in kinds with the project's added: a project kind replaces a built-in one with the same name.
 *  Built-in ones first in their own order (change first), then the owner's own by name. */
export function mergeKinds(builtIn: KindDef[], project: KindDef[]): KindDef[] {
  const out = new Map<string, KindDef>()
  for (const k of [...builtIn, ...project]) out.set(k.name, k)
  const rank = (n: string) => (BUILT_IN_KINDS.includes(n) ? BUILT_IN_KINDS.indexOf(n) : BUILT_IN_KINDS.length)
  return [...out.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}

/** Kind `name` (any case) from `kinds`, or undefined. */
export const findKind = (kinds: readonly KindDef[], name: string | undefined): KindDef | undefined => {
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
  if (findKind(kinds, n)?.off) throw new Error(`Nothing changed: kind "${n}" is turned off (the owner can turn it on again: kinds action "on"); the kinds are: ${names.join(', ')}`)
  throw new Error(`Nothing changed: unknown kind "${String(name)}"; the kinds are: ${names.join(', ')}`)
}

/** The short kind mark for lists: the kind name, or '' for change (which shows nothing, to keep lines short). */
export const kindMark = (t: { kind?: unknown }): string => {
  const k = kindOf(t)
  return k === DEFAULT_KIND ? '' : k
}

/** What the worker prompt's {{kind}} becomes: "Kind of task: bug (something that works wrongly)." on its own line. */
export function kindSection(name: string, kinds: readonly KindDef[]): string {
  const k = findKind(kinds, name)
  return `\nKind of task: ${name}${k ? ` (${k.description})` : ''}.\n`
}

/** The lead's paragraph about kinds: each one with its description, and how to pick. */
export function kindsLeadText(kinds: readonly KindDef[], name: string = DEFAULT_NAME): string {
  const list = kindNames(kinds).map(n => {
    const k = findKind(kinds, n)
    return k ? `${n} (${k.description})` : n
  })
  return `- Task kinds (kind in ${name} add / change): ${list.join('; ')}. Pick the kind that fits each task; ${DEFAULT_KIND} when unsure. Every kind is worked, tested and merged like a change, except ${INVESTIGATION} (see below).`
}

// ---------------- managing kinds (the lead's kinds tool and the panel's Kinds page; like the roles) ----------------

/** Where a kind comes from: the plugin (built-in), the owner's file with a built-in's name (replaced), or the owner's own (added). */
export type KindSource = 'built-in' | 'replaced' | 'added'

/** Where kind `name` comes from, or undefined when there is no such kind. */
export function kindSource(name: string, builtIn: readonly KindDef[], project: readonly KindDef[]): KindSource | undefined {
  const b = !!findKind(builtIn, name)
  const p = !!findKind(project, name)
  return b && p ? 'replaced' : b ? 'built-in' : p ? 'added' : undefined
}

/** Why `name` can't be a kind name (it goes into a file path), or null when it can. */
export function kindNameError(name: string): string | null {
  if (!name.trim()) return 'give the kind a name'
  return /^[A-Za-z0-9_-]{1,64}$/.test(name) ? null : `"${name}" is not a valid kind name: use letters, digits, - and _ only (no "/" or "..")`
}

/** A kind's file text: the front matter (description, then off when set), then the body. */
export function kindFileText(k: Omit<KindDef, 'name'>): string {
  const lines = [`description: ${k.description.replace(/\s+/g, ' ').trim()}`]
  if (k.off) lines.push('off: true')
  return `---\n${lines.join('\n')}\n---\n${k.body.trim() ? `${k.body.trim()}\n` : ''}`
}

/** One of the owner's kind files that can't be read (so it is left out of the kinds): its kind name, its file and why. */
export type BrokenKind = { name: string; file: string; reason: string }

/** Broken file `name` (any case) in `broken`. */
export const brokenKindNamed = (broken: readonly BrokenKind[], name: string): BrokenKind | undefined => broken.find(b => b.name.toLowerCase() === name.trim().toLowerCase())

/** Where a kind comes from as the lists show it: "built-in", "replaced" or "added", then ", off" when it is turned off. */
export const kindSourceLabel = (source: KindSource, off: boolean | undefined): string => `${source}${off ? ', off' : ''}`

/** One kind's line for the lead's kinds list: "bug (built-in): something that works wrongly", with ", off" when it is off. */
const leadKindLine = (k: KindDef, source: KindSource): string => `- ${k.name} (${kindSourceLabel(source, k.off)}): ${k.description}`

/** The lead's line for a broken kind file: what it is, why, and the way out (reset for a built-in's name, remove for an added kind). */
export function leadBrokenKindLine(b: BrokenKind, builtIn: readonly KindDef[]): string {
  const out = kindNameError(b.name)
    ? 'fix the file by hand'
    : findKind(builtIn, b.name) ? 'the built-in kind is used meanwhile; fix the file, or action "reset" deletes it' : 'fix the file, or action "remove" deletes it (ask the owner first)'
  return `- ${b.name} (your file can't be read: ${b.reason}; ${b.file}): ${out}`
}

/** The lead's kinds list: every kind, where it comes from and whether it is off; a kind whose file can't be read shows why instead. */
export function leadKindsText(builtIn: readonly KindDef[], project: readonly KindDef[], dir: string, broken: readonly BrokenKind[] = []): string {
  const all = mergeKinds([...builtIn], [...project])
  if (!all.length && !broken.length) return 'no kinds found'
  const lines = all.map(k => {
    const b = brokenKindNamed(broken, k.name)
    return b ? leadBrokenKindLine(b, builtIn) : leadKindLine(k, kindSource(k.name, builtIn, project)!)
  })
  for (const b of broken) if (!findKind(all, b.name)) lines.push(leadBrokenKindLine(b, builtIn))
  return `Kinds (built-in = from the plugin, replaced = your ${dir}/<name>.md over a built-in, added = your own, off = never picked):\n${lines.join('\n')}`
}

/** One kind in full for the lead: its line, its file, its front matter and its body. */
export function leadKindText(k: KindDef, source: KindSource, file: string): string {
  return `${leadKindLine(k, source).slice(2)}\nfile: ${file}\n${kindFileText(k).trim()}`
}

/** What a new kind made in the panel starts with (the owner changes it in the edit mode). */
export const NEW_KIND_TEMPLATE = {
  description: 'what this kind of task is, in a few words (the lead reads it to choose)',
  body: 'What the worker does for this kind of task.',
} as const
