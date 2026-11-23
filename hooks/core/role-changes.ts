// What the owner's version of a built-in role changed (T-871): each difference as before -> after, for the role's
// page ("Changed from built-in") and the Roles list ("replaced · model"). Plain data; every board draws it.
import { type RoleDef, isCheckerRole } from './roles'
import type { DefSource } from './def-files'
import type { Seg } from './details'

/** One changed line of a checklist: removed (`-`) or added (`+`). */
export type LineChange = { sign: '-' | '+'; text: string }

/** One difference: the part of the file (description, model, skills, tools, code, checklist, off), its value in the built-in
 *  role and in the owner's. A checklist has `lines` (only the changed ones) instead of the whole text. */
export type RoleChange = { field: string; before: string; after: string; lines?: LineChange[] }

/** What a role's page shows besides the role itself: the roles in the list's order (for its place, ‹ n of m ›), how the
 *  owner's file differs from the built-in role (null: not replaced), the day its file was last changed ('' unknown) and
 *  whether the checker setting is on (for the checker role's note). */
export type RolePageFacts = { names: string[]; changes: RoleChange[] | null; at: string; checker: boolean }

/** The heading of the section that lists the differences, on every board. */
export const CHANGED_HEADING = 'Changed from built-in'

const NONE = '(none)'
const SESSION_MODEL = "(session's model)"

/** A text's lines, without Windows line ends ("\r\n" says the same as "\n") or blank lines at its ends. */
function lines(text: string): string[] {
  const t = text.replace(/\r\n?/g, '\n').trim()
  return t ? t.split('\n') : []
}

/** The lines of `after` that are not in `before` (`+`) and of `before` not in `after` (`-`), in order, by the longest
 *  common run of lines (blank lines at the ends don't count). */
export function lineChanges(before: string, after: string): LineChange[] {
  const a = lines(before)
  const b = lines(after)
  // lcs[i][j]: the common length of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: LineChange[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) (i++, j++)
    // a removed line before the added one that takes its place
    else if (i < a.length && (j === b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) out.push({ sign: '-', text: a[i++]! })
    else out.push({ sign: '+', text: b[j++]! })
  }
  return out
}

const list = (xs: readonly string[] | undefined) => (xs && xs.length ? xs.join(', ') : NONE)

/** How the owner's role `mine` differs from the built-in `builtIn`, in file order; empty when it says the same. */
export function roleChanges(builtIn: RoleDef, mine: RoleDef): RoleChange[] {
  const out: RoleChange[] = []
  if (builtIn.description !== mine.description) out.push({ field: 'description', before: builtIn.description, after: mine.description })
  if ((builtIn.model ?? '') !== (mine.model ?? '')) out.push({ field: 'model', before: builtIn.model || SESSION_MODEL, after: mine.model || SESSION_MODEL })
  if (list(builtIn.skills) !== list(mine.skills)) out.push({ field: 'skills', before: list(builtIn.skills), after: list(mine.skills) })
  if (list(builtIn.tools) !== list(mine.tools)) out.push({ field: 'tools', before: list(builtIn.tools), after: list(mine.tools) })
  if ((builtIn.code === false) !== (mine.code === false)) out.push({ field: 'code', before: builtIn.code === false ? 'false' : 'true', after: mine.code === false ? 'false' : 'true' })
  if (lines(builtIn.prompt).join('\n') !== lines(mine.prompt).join('\n')) out.push({ field: 'checklist', before: '', after: '', lines: lineChanges(builtIn.prompt, mine.prompt) })
  // the checker role can't be turned on or off (the checker setting decides), so its off: line is no change
  if (!isCheckerRole(builtIn.name) && !!builtIn.off !== !!mine.off) out.push({ field: 'off', before: builtIn.off ? 'off' : 'on', after: mine.off ? 'off' : 'on' })
  return out
}

/** The changes of role `name` when it is replaced (the owner's file over a built-in); null for a built-in or an added one. */
export function changesOfRole(name: string, builtIn: readonly RoleDef[], project: readonly RoleDef[]): RoleChange[] | null {
  const find = (xs: readonly RoleDef[]) => xs.find(x => x.name.toLowerCase() === name.toLowerCase())
  const b = find(builtIn)
  const p = find(project)
  return b && p ? roleChanges(b, p) : null
}

/** "1 change", "3 changes", "no change". */
export const changeCount = (n: number): string => (n === 0 ? 'no change' : `${n} change${n === 1 ? '' : 's'}`)

/** A change as one line of the page: "model: (session's model) → sonnet"; a checklist says "checklist: 2 lines changed". */
export function changeText(c: RoleChange): string {
  if (c.lines) return `${c.field}: ${c.lines.length} line${c.lines.length === 1 ? '' : 's'} changed`
  return `${c.field}: ${c.before} → ${c.after}`
}

/** The role's source as the Roles list says it: "replaced · model, checklist" (what changed), else core's label. */
export function roleListLabel(source: DefSource, off: boolean | undefined, changes: readonly RoleChange[] | null | undefined): string {
  const fields = (changes ?? []).map(c => c.field).filter(f => f !== 'off')
  return `${source}${off ? ', off' : ''}${source === 'replaced' && fields.length ? ` · ${fields.join(', ')}` : ''}`
}

const SOURCE_COLOR: Record<DefSource, string> = { 'built-in': 'inactive', replaced: 'suggestion', added: 'success' }

/** The header's state on a role's page: "replaced · 1 change" ("added", "built-in"), then "off" as a group of its own. */
export function roleStateGroups(source: DefSource, off: boolean, changes: readonly RoleChange[] | null): Seg[][] {
  const first = source === 'replaced' ? `replaced · ${changeCount(changes?.length ?? 0)}` : source
  return [[{ text: first, color: SOURCE_COLOR[source], bold: true }], ...(off ? [[{ text: 'off', color: 'warning', bold: true }]] : [])]
}

/** The date a role's file was last changed: "2026-11-22" (the owner's own time zone), from its file's time (ms). */
export function changedDay(ms: number, offsetMin: number): string {
  return new Date(ms + offsetMin * 60000).toISOString().slice(0, 10)
}

/** The "Changed from built-in" section as lines of (text, tone): each difference, a checklist's changed lines under it
 *  (`−` removed, dim; `+` added), the date, or why there is nothing to compare. `at`: "2026-11-22" or ''. */
export type ChangeLine = { text: string; tone: 'text' | 'inactive' | 'success' }
export function changeLines(source: DefSource, changes: readonly RoleChange[] | null, at: string): ChangeLine[] {
  if (source === 'built-in') return [{ text: '  the built-in role, as it comes with the plugin', tone: 'inactive' }]
  if (source === 'added' || !changes) return [{ text: '  added: no built-in to compare', tone: 'inactive' }, ...(at ? [{ text: `  file last changed ${at}`, tone: 'inactive' as const }] : [])]
  const out: ChangeLine[] = []
  if (!changes.length) out.push({ text: '  no change: it says the same as the built-in role', tone: 'inactive' })
  for (const c of changes) {
    out.push({ text: `  ${changeText(c)}`, tone: 'text' })
    for (const l of c.lines ?? []) out.push(l.sign === '-' ? { text: `    − ${l.text}`, tone: 'inactive' } : { text: `    + ${l.text}`, tone: 'success' })
  }
  if (at) out.push({ text: `  file last changed ${at}`, tone: 'inactive' })
  return out
}
