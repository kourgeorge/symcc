import { type KindDef, builtInKinds, parseKind, kindSkipReason, mergeKinds, skippedRoleNote, findKind, kindSource, kindNameError, kindFileText, type BrokenKind, brokenKindNamed, leadBrokenKindLine, leadKindsText, leadKindText, ALWAYS_ON_KINDS, NEW_KIND_TEMPLATE } from '../board'
import { type $, skippedKinds, S } from './state'
import { path } from './store'
import { tellLead } from './tell'

// ---------------- task kinds ----------------
// The plugin's kinds are texts (kinds/<name>.ts); the project's .<name>/kinds/<name>.md files are read like the roles (see roles.ts), over them.

/** The kind files in folder `dir`, shown as `shown` (e.g. ".symcc/kinds"); a file that can't be used is skipped with a note (see skippedKind)
 *  and, when `broken` is given, added to it with the reason. */
export async function kindFiles($: $, dir: string, shown: string, broken?: BrokenKind[]): Promise<KindDef[]> {
  if (!(await $.fs.exists(dir).catch(() => false))) return []
  const out: KindDef[] = []
  for (const f of await $.fs.list(dir).catch(() => [])) {
    if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
    const text = await $.fs.read(`${dir}/${f.name}`).catch(() => '')
    const body = typeof text === 'string' ? text : ''
    const name = f.name.replace(/\.md$/, '')
    const k = parseKind(name, body)
    if (k) {
      out.push(k)
      skippedKinds.delete(`${shown}/${f.name}`)
    } else {
      const reason = kindSkipReason(name, body) ?? 'it can not be used'
      broken?.push({ name, file: `${shown}/${f.name}`, reason })
      skippedKind($, `${shown}/${f.name}`, reason)
    }
  }
  return out
}

/** Says once (a toast for the owner, a note for the lead) that a kind file was skipped and why; again only when the reason changes. */
export function skippedKind($: $, file: string, reason: string) {
  const note = skippedRoleNote(file, reason, S.N.name)
  $.ui.log(note, { to: 'debug' })
  if (skippedKinds.get(file) === reason) return
  skippedKinds.set(file, reason)
  $.ui.toast(S.N.toast(`skipped ${file}: ${reason}`))
  tellLead($, `${note}. That kind can't be used until the file is fixed (front matter with a description; a name of letters, digits, - and _; stages as in docs/research/task-kinds-and-workflows.md); if a built-in kind has that name, it is used meanwhile.`)
}

/** Reads the kinds again: the plugin's built-in ones, then the project's .<name>/kinds/ over them. */
export async function loadKinds($: $): Promise<KindDef[]> {
  S.kinds = mergeKinds(builtInKinds(), S.root ? await kindFiles($, path(`${S.N.dir}/kinds`), `${S.N.dir}/kinds`) : [])
  return S.kinds
}

/** The plugin's kinds and the project's own, read again (S.kinds too); `broken` is the project's files that can't be read, with why. */
export async function kindLists($: $): Promise<{ builtIn: KindDef[]; project: KindDef[]; broken: BrokenKind[]; dir: string }> {
  const dir = `${S.N.dir}/kinds`
  const builtIn = builtInKinds()
  const broken: BrokenKind[] = []
  const project = S.root ? await kindFiles($, path(dir), dir, broken) : []
  S.kinds = mergeKinds(builtIn, project)
  return { builtIn, project, broken, dir }
}

/** A kind's merges / merge_tests keys, kept when its file is written again. */
const runKeys = (k: KindDef): Pick<KindDef, 'merges' | 'mergeTests'> => ({ ...(k.merges === false ? { merges: false as const } : {}), ...(k.mergeTests === false ? { mergeTests: false as const } : {}) })

/** What the lead's kinds tool gets. */
export type LeadKindInput = { action?: unknown; name?: unknown; description?: unknown; body?: unknown }

/**
 * The lead's kinds tool, like the roles tool: list (all, or one in full), add, edit (a built-in is copied to the owner's folder first),
 * reset (back to the built-in), remove (an added kind), off / on (change and investigation can't be turned off). Every name is checked
 * before any path is made (letters, digits, - and _ only), so nothing outside <dir>/kinds is touched. The kinds are read again after a change.
 */
export async function leadKinds($: $, a: LeadKindInput): Promise<string> {
  return (await changeKind($, a)).text
}

/** The kinds tool's work (see leadKinds); `ok` says a kind file was written or removed. */
export async function changeKind($: $, a: LeadKindInput): Promise<{ ok: boolean; text: string }> {
  const r = await changeKindText($, a)
  return typeof r === 'string' ? { ok: false, text: r } : r
}

async function changeKindText($: $, a: LeadKindInput): Promise<string | { ok: true; text: string }> {
  const action = typeof a.action === 'string' && a.action.trim() ? a.action.trim().toLowerCase() : 'list'
  const asked = typeof a.name === 'string' ? a.name.trim() : ''
  const actions = ['list', 'add', 'edit', 'reset', 'remove', 'off', 'on']
  if (!actions.includes(action)) return `unknown action "${action}": use ${actions.join(', ')}`
  if (asked || action !== 'list') {
    const bad = kindNameError(asked)
    if (bad) return action === 'list' || asked ? bad : `say which kind to ${action} (name)`
  }
  if (action !== 'list' && !S.root) return 'no project folder yet, so kinds can not be changed'
  const { builtIn, project, broken, dir } = await kindLists($)
  const have = () => `have: ${S.kinds.map(k => k.name).join(', ') || 'none'}`
  if (action === 'list' && !asked) return leadKindsText(builtIn, project, dir, broken)
  const broke = brokenKindNamed(broken, asked)
  if (action === 'list' && broke) return leadBrokenKindLine(broke, builtIn).slice(2)
  const name = asked.toLowerCase()
  const b = findKind(builtIn, name)
  const p = findKind(project, name)
  const file = `${dir}/${name}.md`
  const hasFile = await $.fs.exists(path(file)).catch(() => false)
  const source = kindSource(name, builtIn, project)
  const cur = p ?? b
  if (action === 'list') return cur && source ? leadKindText(cur, source, source === 'built-in' ? `kinds/${name}.ts (in the plugin)` : file) : `no kind named ${asked} (${have()})`
  const rm = async () => {
    // An argument list (no shell), with "--" so the path can never be read as an option.
    const r = await $.process.run(['rm', '-f', '--', path(file)])
    return r.exitCode === 0 ? '' : `could not remove ${file}: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`
  }
  const save = async (k: Pick<KindDef, 'description' | 'body' | 'off' | 'merges' | 'mergeTests'>) => {
    const text = kindFileText(k)
    const why = kindSkipReason(name, text)
    if (why) return why
    await $.process.run(['mkdir', '-p', '--', path(dir)])
    await $.fs.write(path(file), text)
    return ''
  }
  const done = async (said: string) => {
    await loadKinds($)
    $.ui.invalidate('ui.render')
    return { ok: true as const, text: `${said}; it counts for the next task on` }
  }
  if (action === 'reset') {
    if (!b) return p || hasFile ? `${name} is your own kind, not a built-in one: use action "remove" to delete it (ask the owner first)` : `no kind named ${asked} (${have()})`
    if (!hasFile) return `${name} is already the built-in kind`
    const err = await rm()
    return err || await done(`${name} is the built-in kind again (your version ${file} is deleted)`)
  }
  if (action === 'remove') {
    if (b) return `${name} is a built-in kind and can't be removed: use action "reset" to undo your changes, or "off" to turn it off`
    if (!hasFile) return `no kind named ${asked} (${have()})`
    const err = await rm()
    return err || await done(`removed kind ${name} (your file ${file} is deleted)`)
  }
  if (action === 'add') {
    if (broke) return `${broke.file} is already there but can't be read: ${broke.reason}. Fix the file, or use ${b ? 'reset to go back to the built-in' : 'remove to delete it'} first.`
    if (cur || hasFile) return `a kind named ${name} already exists; use action "edit" to change it`
    const description = typeof a.description === 'string' ? a.description.trim() : ''
    if (!description) return 'description is missing: say in a few words what this kind of task is (the lead reads it to choose)'
    const err = await save({ description, body: typeof a.body === 'string' ? a.body : '' })
    return err || await done(`added kind ${name} (${file})`)
  }
  // edit, off, on. The owner's file is there but can't be read: never write over it (not even with the built-in kind).
  if (hasFile && !p) {
    const text = await $.fs.read(path(file)).catch(() => '')
    const why = kindSkipReason(name, typeof text === 'string' ? text : '') ?? 'it can not be used'
    return `${file} can't be read as a kind: ${why}. Fix the file, or use ${b ? 'reset to go back to the built-in' : 'remove to delete it'}.`
  }
  if (!cur) return `no kind named ${asked} (${have()})`
  const copied = !p && !!b ? ` (copied the built-in kind to ${file} first)` : ''
  if (action === 'off' || action === 'on') {
    const off = action === 'off'
    if (off && ALWAYS_ON_KINDS.includes(name)) return `${name} can't be turned off: it is one of the two ways a task runs (${ALWAYS_ON_KINDS.join(' and ')})`
    if (!!cur.off === off) return `${name} is already ${action}`
    const err = await save({ ...runKeys(cur), description: cur.description, body: cur.body, off })
    return err || await done(off ? `turned ${name} off${copied}: the lead won't pick it for a new task and add refuses it; tasks that already have it keep it` : `turned ${name} on again`)
  }
  const description = typeof a.description === 'string' && a.description.trim() ? a.description.trim() : cur.description
  const body = typeof a.body === 'string' ? a.body : cur.body
  const err = await save({ ...runKeys(cur), description, body, ...(cur.off ? { off: true } : {}) })
  return err || await done(`saved kind ${name} (${file})${copied}`)
}

// ---------------- the Kinds page of the panel's Settings view ----------------

/** A kind's edit mode in the panel: one box per part of its file. */
export type KindDraft = { kind: string; description: string; body: string; error: string }

/** What the Kinds page (opened from Settings) shows, like roleView: whether it is shown (`list`), the opened kind ('' = none),
 *  its edit mode, the Remove confirm step, the new kind's name box. */
export const kindView = {
  list: false,
  open: '',
  draft: null as KindDraft | null,
  confirmRemove: false,
  naming: null as { name: string; error: string } | null,
}

/** Closes the Kinds page and everything on it. */
export function resetKindView() {
  kindView.list = false
  kindView.open = ''
  kindView.draft = null
  kindView.confirmRemove = false
  kindView.naming = null
}

/** The edit mode for kind `k`, filled from it. */
export const kindDraftOf = (k: KindDef): KindDraft => ({ kind: k.name, description: k.description, body: k.body, error: '' })

/** Saves the edit mode through the kinds tool's edit; says what happened, or keeps the edit mode open with the error. */
export async function saveKindDraft($: $): Promise<string> {
  const d = kindView.draft
  if (!d) return ''
  if (!d.description.trim()) {
    d.error = 'description is missing: say in a few words what this kind of task is'
    $.ui.invalidate('ui.render')
    return ''
  }
  const r = await changeKind($, { action: 'edit', name: d.kind, description: d.description, body: d.body })
  if (!r.ok) {
    d.error = r.text
    $.ui.invalidate('ui.render')
    return ''
  }
  kindView.draft = null
  $.ui.invalidate('ui.render')
  return r.text
}

/** "New kind": makes .<name>/kinds/<kind>.md from the short template and opens it in the edit mode; a bad or taken name stays in the name box with the reason. */
export async function newKindFile($: $, name: string): Promise<string> {
  const n = name.trim()
  const r = await changeKind($, { action: 'add', name: n, ...NEW_KIND_TEMPLATE })
  if (!r.ok) {
    kindView.naming = { name: n, error: r.text }
    $.ui.invalidate('ui.render')
    return ''
  }
  kindView.naming = null
  const made = findKind(S.kinds, n)
  kindView.open = made?.name ?? n.toLowerCase()
  kindView.confirmRemove = false
  kindView.draft = made ? kindDraftOf(made) : null
  $.ui.invalidate('ui.render')
  return r.text
}
