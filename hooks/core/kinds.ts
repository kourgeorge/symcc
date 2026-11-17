// Task kinds: what a task is for (change, bug, feature, refactor, docs, investigation, or the owner's own).
// Like roles: a file `kinds/<name>.md` in the plugin, or `.<plugin name>/kinds/<name>.md` in the project,
// which wins over a built-in one with the same name. Front matter: description (needed; the lead reads it
// to choose). The body is free text for now. Every kind runs like a change, except investigation.
import { DEFAULT_NAME } from '../name'
import { DEFAULT_KIND, INVESTIGATION, KIND_NAME, kindOf } from './board-file'
import { frontMatterLine, splitFrontMatter } from './text'

/** A task kind, read from its file. Its name is always its file name (lowercase). */
export type KindDef = { name: string; description: string; body: string }

/** The kinds that come with the plugin (one file each in its kinds/ folder), in the order they are listed. */
export const BUILT_IN_KINDS: readonly string[] = [DEFAULT_KIND, 'bug', 'feature', 'refactor', 'docs', INVESTIGATION]

/** A kind file as a KindDef, or the reason it can't be used ("no front matter", "no description", "bad name ..."). */
export function readKind(name: string, text: string): KindDef | string {
  const n = name.trim().toLowerCase()
  if (!KIND_NAME.test(n)) return `bad name "${name}" (use letters, digits, - and _ only)`
  const fm = splitFrontMatter(text)
  if (!fm.lines) return 'no front matter (it starts with a --- line, then description: ..., then ---)'
  let description = ''
  for (const line of fm.lines) {
    const kv = frontMatterLine(line)
    if (kv?.key === 'description') description = kv.value.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').trim()
  }
  if (!description) return 'no description'
  return { name: n, description: description.slice(0, 200), body: fm.body.trim() }
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

/** The names of the known kinds: the loaded ones, plus change and investigation, which are always known (the two ways a task runs). */
export function kindNames(kinds: readonly KindDef[]): string[] {
  const names = kinds.map(k => k.name)
  if (!names.includes(DEFAULT_KIND)) names.unshift(DEFAULT_KIND)
  if (!names.includes(INVESTIGATION)) names.push(INVESTIGATION)
  return names
}

/** The known kind name for `name`, or throws an error that lists the known kinds. */
export function checkKind(kinds: readonly KindDef[], name: unknown): string {
  const n = typeof name === 'string' ? name.trim().toLowerCase() : ''
  const names = kindNames(kinds)
  if (names.includes(n)) return n
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
