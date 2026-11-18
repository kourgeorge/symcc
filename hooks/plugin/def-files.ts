// What the roles and the kinds share on the plugin side: reading their files, the lead's tool (list, add, edit, reset,
// remove, off, on) and the panel's "New ..." button. roles.ts and kinds.ts give the parts that differ as a DefKind.
import { type Def, type BrokenDef, brokenNamed, defNamed, defSource, type DefSource } from '../core/def-files'
import { S } from './state'
import type { Host } from '../host'
import { path } from './store'
import { tellLead } from './tell'
import { skippedRoleNote } from '../board'

/** What the tool gets: the action and name; the rest is the role's or kind's own fields. */
export type DefInput = { action?: unknown; name?: unknown; description?: unknown }

/** The parts where roles and kinds differ. */
export type DefKind<D extends Def, A extends DefInput> = {
  /** "role" or "kind" */
  noun: string
  /** "roles" or "kinds": also the folder name (.<name>/roles) */
  plural: string
  /** the files skipped so far, with why (so each is told once) */
  skipped: Map<string, string>
  parse(name: string, text: string): D | null
  skipReason(name: string, text: string): string | null
  nameError(name: string): string | null
  fileText(d: Omit<D, 'name'>): string
  /** what the lead is told after "That role can't be used until the file is fixed " */
  fixHint: string
  /** the built-in ones: a folder of files in the plugin ("roles"), or texts that come with it */
  builtIn: string | (() => D[])
  merge(builtIn: D[], project: D[]): D[]
  /** the loaded ones (S.roles, S.kinds), and setting them */
  get(): D[]
  set(all: D[]): void
  /** the name a new file gets from what was asked (kinds are lowercase) */
  newName(asked: string): string
  /** where a built-in one is, for the lead */
  builtInFile(name: string): string
  listText(builtIn: D[], project: D[], dir: string, broken: BrokenDef[]): string
  brokenLine(b: BrokenDef, builtIn: D[]): string
  oneText(d: D, source: DefSource, file: string): string
  /** "from the next worker on" */
  counts: string
  /** what add says without a description */
  noDescription: string
  /** a new one's fields from the tool's input, or why not */
  added(a: A, description: string): Omit<D, 'name'> | string
  /** the fields after an edit, or why not */
  edited(cur: D, a: A, description: string): Omit<D, 'name'> | string
  /** the fields with off set */
  turned(cur: D, off: boolean): Omit<D, 'name'>
  /** why `name` can't be turned off (`off`) or on, or '' */
  alwaysOn(name: string, off: boolean): string
  /** what "off" says after "turned x off (copied ...)" */
  offSaid: string
}

/** The files in folder `dir`, shown as `shown` (e.g. ".symcc/roles"); a file that can't be used is skipped with a note (see skippedDef)
 *  and, when `broken` is given, added to it with the reason. */
export async function defFiles<D extends Def, A extends DefInput>($: Host, k: DefKind<D, A>, dir: string, shown: string, broken?: BrokenDef[]): Promise<D[]> {
  if (!(await $.fs.exists(dir).catch(() => false))) return []
  const out: D[] = []
  for (const f of await $.fs.list(dir).catch(() => [])) {
    if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
    const text = await $.fs.read(`${dir}/${f.name}`).catch(() => '')
    const body = typeof text === 'string' ? text : ''
    const name = f.name.replace(/\.md$/, '')
    const d = k.parse(name, body)
    if (d) {
      out.push(d)
      k.skipped.delete(`${shown}/${f.name}`)
    } else {
      const reason = k.skipReason(name, body) ?? 'it can not be used'
      broken?.push({ name, file: `${shown}/${f.name}`, reason })
      skippedDef($, k, `${shown}/${f.name}`, reason)
    }
  }
  return out
}

/** Says once (a toast for the owner, a note for the lead) that a file was skipped and why; again only when the reason changes. */
function skippedDef<D extends Def, A extends DefInput>($: Host, k: DefKind<D, A>, file: string, reason: string) {
  const note = skippedRoleNote(file, reason, S.N.name)
  $.ui.log(note, { to: 'debug' })
  if (k.skipped.get(file) === reason) return
  k.skipped.set(file, reason)
  $.ui.toast(S.N.toast(`skipped ${file}: ${reason}`))
  tellLead($, `${note}. That ${k.noun} can't be used until the file is fixed ${k.fixHint}`)
}

/** The built-in ones: read from the plugin's folder, or from their texts. */
async function builtInDefs<D extends Def, A extends DefInput>($: Host, k: DefKind<D, A>): Promise<D[]> {
  return typeof k.builtIn === 'string' ? defFiles($, k, `${$.plugin.root}/${k.builtIn}`, k.builtIn) : k.builtIn()
}

/** Reads them again: the built-in ones, then the project's .<name>/<plural>/ over them. */
export async function loadDefs<D extends Def, A extends DefInput>($: Host, k: DefKind<D, A>): Promise<D[]> {
  const builtIn = await builtInDefs($, k)
  k.set(k.merge(builtIn, S.root ? await defFiles($, k, path(`${S.N.dir}/${k.plural}`), `${S.N.dir}/${k.plural}`) : []))
  return k.get()
}

/** The built-in ones and the project's own, read again (the loaded ones too); `broken` is the project's files that can't be read, with why. */
export async function defLists<D extends Def, A extends DefInput>($: Host, k: DefKind<D, A>): Promise<{ builtIn: D[]; project: D[]; broken: BrokenDef[]; dir: string }> {
  const dir = `${S.N.dir}/${k.plural}`
  const builtIn = await builtInDefs($, k)
  const broken: BrokenDef[] = []
  const project = S.root ? await defFiles($, k, path(dir), dir, broken) : []
  k.set(k.merge(builtIn, project))
  return { builtIn, project, broken, dir }
}

/**
 * The lead's tool: list (all, or one in full), add, edit (a built-in is copied to the owner's folder first),
 * reset (back to the built-in), remove (an added one), off / on. Every name is checked before any path is made
 * (letters, digits, - and _ only), so nothing outside <dir>/<plural> is touched. They are read again after a change.
 * `ok` says a file was written or removed.
 */
export async function manageDefs<D extends Def, A extends DefInput>($: Host, k: DefKind<D, A>, a: A): Promise<{ ok: boolean; text: string }> {
  const r = await manageText($, k, a)
  return typeof r === 'string' ? { ok: false, text: r } : r
}

async function manageText<D extends Def, A extends DefInput>($: Host, k: DefKind<D, A>, a: A): Promise<string | { ok: true; text: string }> {
  const { noun } = k
  const action = typeof a.action === 'string' && a.action.trim() ? a.action.trim().toLowerCase() : 'list'
  const asked = typeof a.name === 'string' ? a.name.trim() : ''
  const actions = ['list', 'add', 'edit', 'reset', 'remove', 'off', 'on']
  if (!actions.includes(action)) return `unknown action "${action}": use ${actions.join(', ')}`
  if (asked || action !== 'list') {
    const bad = k.nameError(asked)
    if (bad) return action === 'list' || asked ? bad : `say which ${noun} to ${action} (name)`
  }
  if (action !== 'list' && !S.root) return `no project folder yet, so ${k.plural} can not be changed`
  const { builtIn, project, broken, dir } = await defLists($, k)
  const have = () => `have: ${k.get().map(d => d.name).join(', ') || 'none'}`
  if (action === 'list' && !asked) return k.listText(builtIn, project, dir, broken)
  const broke = brokenNamed(broken, asked)
  if (action === 'list' && broke) return k.brokenLine(broke, builtIn).slice(2)
  const b = defNamed(builtIn, asked)
  const p = defNamed(project, asked)
  const name = b?.name ?? p?.name ?? k.newName(asked)
  const file = `${dir}/${name}.md`
  const hasFile = await $.fs.exists(path(file)).catch(() => false)
  const source = defSource(name, builtIn, project)
  const cur = p ?? b
  if (action === 'list') return cur && source ? k.oneText(cur, source, source === 'built-in' ? k.builtInFile(name) : file) : `no ${noun} named ${asked} (${have()})`
  const rm = async () => {
    // An argument list (no shell), with "--" so the path can never be read as an option.
    const r = await $.process.run(['rm', '-f', '--', path(file)])
    return r.exitCode === 0 ? '' : `could not remove ${file}: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`
  }
  const save = async (fields: Omit<D, 'name'> | string) => {
    if (typeof fields === 'string') return fields
    const text = k.fileText(fields)
    const why = k.skipReason(name, text)
    if (why) return why
    await $.process.run(['mkdir', '-p', '--', path(dir)])
    await $.fs.write(path(file), text)
    return ''
  }
  const done = async (said: string) => {
    await loadDefs($, k)
    $.ui.invalidate('ui.render')
    return { ok: true as const, text: `${said}; it counts ${k.counts}` }
  }
  if (action === 'reset') {
    if (!b) return p || hasFile ? `${name} is your own ${noun}, not a built-in one: use action "remove" to delete it (ask the owner first)` : `no ${noun} named ${asked} (${have()})`
    if (!hasFile) return `${name} is already the built-in ${noun}`
    const err = await rm()
    return err || await done(`${name} is the built-in ${noun} again (your version ${file} is deleted)`)
  }
  if (action === 'remove') {
    if (b) return `${name} is a built-in ${noun} and can't be removed: use action "reset" to undo your changes, or "off" to turn it off`
    if (!hasFile) return `no ${noun} named ${asked} (${have()})`
    const err = await rm()
    return err || await done(`removed ${noun} ${name} (your file ${file} is deleted)`)
  }
  if (action === 'add') {
    if (broke) return `${broke.file} is already there but can't be read: ${broke.reason}. Fix the file, or use ${b ? 'reset to go back to the built-in' : 'remove to delete it'} first.`
    if (cur || hasFile) return `a ${noun} named ${name} already exists; use action "edit" to change it`
    const description = typeof a.description === 'string' ? a.description.trim() : ''
    if (!description) return k.noDescription
    const err = await save(k.added(a, description))
    return err || await done(`added ${noun} ${name} (${file})`)
  }
  // edit, off, on. The owner's file is there but can't be read: never write over it (not even with the built-in one).
  if (hasFile && !p) {
    const text = await $.fs.read(path(file)).catch(() => '')
    const why = k.skipReason(name, typeof text === 'string' ? text : '') ?? 'it can not be used'
    return `${file} can't be read as a ${noun}: ${why}. Fix the file, or use ${b ? 'reset to go back to the built-in' : 'remove to delete it'}.`
  }
  if (!cur) return `no ${noun} named ${asked} (${have()})`
  const copied = !p && !!b ? ` (copied the built-in ${noun} to ${file} first)` : ''
  if (action === 'off' || action === 'on') {
    const off = action === 'off'
    const stays = k.alwaysOn(name, off)
    if (stays) return stays
    if (!!cur.off === off) return `${name} is already ${action}`
    const err = await save(k.turned(cur, off))
    return err || await done(off ? `turned ${name} off${copied}: ${k.offSaid}` : `turned ${name} on again`)
  }
  const description = typeof a.description === 'string' && a.description.trim() ? a.description.trim() : cur.description
  const err = await save(k.edited(cur, a, description))
  return err || await done(`saved ${noun} ${name} (${file})${copied}`)
}

/** The panel's Roles or Kinds page state (roleView, kindView). */
export type DefView<Draft> = { list: boolean; open: string; draft: Draft | null; confirmRemove: boolean; naming: { name: string; error: string } | null }

/** "New role" / "New kind": makes the file from `template` through the tool's add and opens it in the edit mode; a bad, taken
 *  or broken name stays in the name box with the reason. */
export async function newDefFile<D extends Def, A extends DefInput, Draft>($: Host, k: DefKind<D, A>, view: DefView<Draft>, name: string, template: Omit<A, 'action' | 'name'>, draftOf: (d: D) => Draft): Promise<string> {
  const n = name.trim()
  // A file with that name is there but can't be read: say what the page offers for it (the tool's own words name its actions).
  const lists = k.nameError(n) ? undefined : await defLists($, k)
  const broke = lists && brokenNamed(lists.broken, n)
  if (lists && broke) {
    const out = defNamed(lists.builtIn, n) ? 'open it in the list to Reset to built-in' : 'open it in the list to Remove it'
    view.naming = { name: n, error: `${broke.file} is already there but can't be read (${broke.reason}): ${out}, or fix the file by hand` }
    $.ui.invalidate('ui.render')
    return ''
  }
  const r = await manageDefs($, k, { action: 'add', name: n, ...template } as A)
  if (!r.ok) {
    view.naming = { name: n, error: r.text }
    $.ui.invalidate('ui.render')
    return ''
  }
  view.naming = null
  const made = defNamed(k.get(), n)
  view.open = made?.name ?? k.newName(n)
  view.confirmRemove = false
  view.draft = made ? draftOf(made) : null
  $.ui.invalidate('ui.render')
  return r.text
}
