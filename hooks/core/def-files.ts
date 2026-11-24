// What roles and task types share: both are files <name>.md (the plugin's built-in ones, and the owner's own over them),
// so both have a source (built-in, replaced, added), files that can't be read, and the same name rule.
// Not re-exported by board.ts: core/roles.ts and core/kinds.ts give these out under their own names.

/** A role or task type definition, as far as the shared code needs it. */
export type Def = { name: string; description: string; off?: boolean }

/** Where a role or task type comes from: the plugin (built-in), the owner's file with a built-in's name (replaced), or the owner's own (added). */
export type DefSource = 'built-in' | 'replaced' | 'added'

/** One of the owner's files that can't be read (so it is left out): its name, its file and why. */
export type BrokenDef = { name: string; file: string; reason: string }

/** A role's or kind's name: letters, digits, - and _ only. */
export const DEF_NAME = /^[A-Za-z0-9_-]{1,64}$/

/** Definition `name` (any case) in `defs`, exactly (no fallback). */
export const defNamed = <D extends { name: string }>(defs: readonly D[], name: string): D | undefined => defs.find(d => d.name.toLowerCase() === name.trim().toLowerCase())

/** Broken file `name` (any case) in `broken`. */
export const brokenNamed = (broken: readonly BrokenDef[], name: string): BrokenDef | undefined => defNamed(broken, name)

/** What a broken file shows as: "your file can't be read: no description". */
export const brokenLabel = (b: BrokenDef): string => `your file can't be read: ${b.reason}`

/** Where `name` comes from, or undefined when there is no such role or task type. */
export function defSource(name: string, builtIn: readonly { name: string }[], project: readonly { name: string }[]): DefSource | undefined {
  const b = !!defNamed(builtIn, name)
  const p = !!defNamed(project, name)
  return b && p ? 'replaced' : b ? 'built-in' : p ? 'added' : undefined
}

/** Where it comes from as the lists show it: "built-in", "replaced" or "added", then ", off" when it is turned off. */
export const sourceLabel = (source: DefSource, off: boolean | undefined): string => `${source}${off ? ', off' : ''}`

/** Why `name` can't be a role or task type name (`noun`; it goes into a file path), or null when it can. */
export function defNameError(noun: string, name: string): string | null {
  if (!name.trim()) return `give the ${noun} a name`
  return DEF_NAME.test(name) ? null : `"${name}" is not a valid ${noun} name: use letters, digits, - and _ only (no "/" or "..")`
}

/** The lead's line for a broken file: what it is, why, and the way out (reset for a built-in's name, remove for an added one). */
export function leadBrokenDefLine(noun: string, b: BrokenDef, builtIn: readonly { name: string }[]): string {
  const out = defNameError(noun, b.name)
    ? 'fix the file by hand'
    : defNamed(builtIn, b.name) ? `the built-in ${noun} is used meanwhile; fix the file, or action "reset" deletes it` : `fix the file, or action "remove" deletes it (ask the owner first)`
  return `- ${b.name} (${brokenLabel(b)}; ${b.file}): ${out}`
}
