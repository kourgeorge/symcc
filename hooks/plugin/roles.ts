import { type RoleDef, NEW_ROLE_TEMPLATE, parseRole, roleSkipReason, skippedRoleNote, mergeRoles, EXTRA_TOOLS, DEFAULT_ROLE, roleNamed, roleSource, roleNameError, roleTools, roleFileText, leadRolesText, leadRoleText } from '../board'
import { type $, skippedRoles, S } from './state'
import { path } from './store'
import { tellLead } from './tell'

// ---------------- worker roles ----------------

/** The role files in folder `dir`, shown as `shown` (e.g. ".symcc/roles"); a file that can't be used is skipped with a note (see skippedRole). */
export async function roleFiles($: $, dir: string, shown: string): Promise<RoleDef[]> {
  if (!(await $.fs.exists(dir).catch(() => false))) return []
  const out: RoleDef[] = []
  for (const f of await $.fs.list(dir).catch(() => [])) {
    if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
    const text = await $.fs.read(`${dir}/${f.name}`).catch(() => '')
    const body = typeof text === 'string' ? text : ''
    const name = f.name.replace(/\.md$/, '')
    const r = parseRole(name, body)
    if (r) {
      out.push(r)
      skippedRoles.delete(`${shown}/${f.name}`)
    } else skippedRole($, `${shown}/${f.name}`, roleSkipReason(name, body) ?? 'it can not be used')
  }
  return out
}

/** Says once (a toast for the owner, a note for the lead) that a role file was skipped and why; again only when the reason changes. */
export function skippedRole($: $, file: string, reason: string) {
  const note = skippedRoleNote(file, reason, S.N.name)
  $.ui.log(note, { to: 'debug' })
  if (skippedRoles.get(file) === reason) return
  skippedRoles.set(file, reason)
  $.ui.toast(S.N.toast(`skipped ${file}: ${reason}`))
  tellLead($, `${note}. That role can't be used until the file is fixed (front matter with a description; a name of letters, digits, - and _; tools only from ${EXTRA_TOOLS.join(', ')}).`)
}

/** Reads the roles again: the plugin's roles/, then the project's .<name>/roles/ over them. */
export async function loadRoles($: $): Promise<RoleDef[]> {
  S.roles = mergeRoles(await roleFiles($, `${$.plugin.root}/roles`, 'roles'), S.root ? await roleFiles($, path(`${S.N.dir}/roles`), `${S.N.dir}/roles`) : [])
  return S.roles
}

/** What the lead's roles tool gets. */
export type LeadRoleInput = { action?: unknown; name?: unknown; description?: unknown; model?: unknown; skills?: unknown; tools?: unknown; checklist?: unknown }

/** A list given as an array or as "a, b". */
const listOf = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : typeof v === 'string' ? v.split(',').map(x => x.trim()).filter(Boolean) : undefined

/**
 * The lead's roles tool: list (all, or one in full), add, edit (a built-in is copied to the owner's folder first),
 * reset (back to the built-in), remove (an added role), off / on. Every name is checked before any path is made
 * (letters, digits, - and _ only), so nothing outside <dir>/roles is touched. The roles are read again after a change.
 */
export async function leadRoles($: $, a: LeadRoleInput): Promise<string> {
  return (await changeRole($, a)).text
}

/** The plugin's roles and the project's own, read again (S.roles too). */
export async function roleLists($: $): Promise<{ builtIn: RoleDef[]; project: RoleDef[]; dir: string }> {
  const dir = `${S.N.dir}/roles`
  const builtIn = await roleFiles($, `${$.plugin.root}/roles`, 'roles')
  const project = S.root ? await roleFiles($, path(dir), dir) : []
  S.roles = mergeRoles(builtIn, project)
  return { builtIn, project, dir }
}

/** The roles tool's work (see leadRoles); `ok` says a role file was written or removed. */
export async function changeRole($: $, a: LeadRoleInput): Promise<{ ok: boolean; text: string }> {
  const r = await changeRoleText($, a)
  return typeof r === 'string' ? { ok: false, text: r } : r
}

async function changeRoleText($: $, a: LeadRoleInput): Promise<string | { ok: true; text: string }> {
  const action = typeof a.action === 'string' && a.action.trim() ? a.action.trim().toLowerCase() : 'list'
  const asked = typeof a.name === 'string' ? a.name.trim() : ''
  const actions = ['list', 'add', 'edit', 'reset', 'remove', 'off', 'on']
  if (!actions.includes(action)) return `unknown action "${action}": use ${actions.join(', ')}`
  if (asked || action !== 'list') {
    const bad = roleNameError(asked)
    if (bad) return action === 'list' || asked ? bad : `say which role to ${action} (name)`
  }
  if (action !== 'list' && !S.root) return 'no project folder yet, so roles can not be changed'
  const { builtIn, project, dir } = await roleLists($)
  const have = () => `have: ${S.roles.map(r => r.name).join(', ') || 'none'}`
  if (action === 'list' && !asked) return leadRolesText(builtIn, project, dir)
  const b = roleNamed(builtIn, asked)
  const p = roleNamed(project, asked)
  const name = b?.name ?? p?.name ?? asked
  const file = `${dir}/${name}.md`
  const hasFile = await $.fs.exists(path(file)).catch(() => false)
  const source = roleSource(name, builtIn, project)
  const cur = p ?? b
  if (action === 'list') return cur && source ? leadRoleText(cur, source, source === 'built-in' ? `roles/${name}.md (in the plugin)` : file) : `no role named ${asked} (${have()})`
  const rm = async () => {
    // An argument list (no shell), with "--" so the path can never be read as an option.
    const r = await $.process.run(['rm', '-f', '--', path(file)])
    return r.exitCode === 0 ? '' : `could not remove ${file}: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`
  }
  const save = async (r: Omit<RoleDef, 'name'>) => {
    const text = roleFileText(r)
    const why = roleSkipReason(name, text)
    if (why) return why
    await $.process.run(['mkdir', '-p', '--', path(dir)])
    await $.fs.write(path(file), text)
    return ''
  }
  const done = async (said: string) => {
    await loadRoles($)
    $.ui.invalidate('ui.render')
    return { ok: true as const, text: `${said}; it counts from the next worker on` }
  }
  if (action === 'reset') {
    if (!b) return p || hasFile ? `${name} is your own role, not a built-in one: use action "remove" to delete it (ask the owner first)` : `no role named ${asked} (${have()})`
    if (!hasFile) return `${name} is already the built-in role`
    const err = await rm()
    return err || await done(`${name} is the built-in role again (your version ${file} is deleted)`)
  }
  if (action === 'remove') {
    if (b) return `${name} is a built-in role and can't be removed: use action "reset" to undo your changes, or "off" to turn it off`
    if (!hasFile) return `no role named ${asked} (${have()})`
    const err = await rm()
    return err || await done(`removed role ${name} (your file ${file} is deleted)`)
  }
  if (action === 'add') {
    if (cur || hasFile) return `a role named ${name} already exists; use action "edit" to change it`
    const description = typeof a.description === 'string' ? a.description.trim() : ''
    if (!description) return 'description is missing: say in a few words what the role is for (the lead reads it to choose)'
    const tools = roleTools(listOf(a.tools) ?? [])
    if (typeof tools === 'string') return tools
    const model = typeof a.model === 'string' ? a.model.trim() : ''
    const err = await save({ description, ...(model ? { model } : {}), skills: listOf(a.skills) ?? [], ...(tools.length ? { tools } : {}), prompt: typeof a.checklist === 'string' ? a.checklist : '' })
    return err || await done(`added role ${name} (${file})`)
  }
  // edit, off, on. The owner's file is there but can't be read: never write over it (not even with the built-in role).
  if (hasFile && !p) {
    const text = await $.fs.read(path(file)).catch(() => '')
    const why = roleSkipReason(name, typeof text === 'string' ? text : '') ?? 'it can not be used'
    return `${file} can't be read as a role: ${why}. Fix the file, or use ${b ? 'reset to go back to the built-in' : 'remove to delete it'}.`
  }
  if (!cur) return `no role named ${asked} (${have()})`
  const copied = !p && !!b ? ` (copied the built-in role to ${file} first)` : ''
  if (action === 'off' || action === 'on') {
    const off = action === 'off'
    if (off && name.toLowerCase() === DEFAULT_ROLE) return `${DEFAULT_ROLE} can't be turned off: it is the default role`
    if (!!cur.off === off) return `${name} is already ${action}`
    const { name: _n, ...rest } = cur
    const err = await save({ ...rest, off })
    return err || await done(off ? `turned ${name} off${copied}: the lead won't pick it and it isn't offered on the task page; tasks that already have it keep it` : `turned ${name} on again`)
  }
  const tools = a.tools === undefined ? cur.tools ?? [] : roleTools(listOf(a.tools) ?? [])
  if (typeof tools === 'string') return tools
  const description = typeof a.description === 'string' && a.description.trim() ? a.description.trim() : cur.description
  const model = typeof a.model === 'string' ? a.model.trim() : cur.model ?? ''
  const skills = a.skills === undefined ? cur.skills : listOf(a.skills) ?? cur.skills
  const prompt = typeof a.checklist === 'string' ? a.checklist : cur.prompt
  const err = await save({ description, ...(model ? { model } : {}), skills, ...(tools.length ? { tools } : {}), ...(cur.off ? { off: true } : {}), prompt })
  return err || await done(`saved role ${name} (${file})${copied}`)
}

// ---------------- the Roles page of the panel's Settings view ----------------

/** A role's edit mode in the panel: one box per part of its file. */
export type RoleDraft = { role: string; description: string; model: string; skills: string; tools: string; checklist: string; error: string }

/** What the Roles page (opened from Settings) shows: whether it is shown at all (`list`), the opened role ('' = none),
 *  its edit mode, the Remove confirm step, the new role's name box. */
export const roleView = {
  list: false,
  open: '',
  draft: null as RoleDraft | null,
  confirmRemove: false,
  naming: null as { name: string; error: string } | null,
}

/** Closes the Roles page and everything on it. */
export function resetRoleView() {
  roleView.list = false
  roleView.open = ''
  roleView.draft = null
  roleView.confirmRemove = false
  roleView.naming = null
}

/** The edit mode for role `r`, filled from it. */
export function roleDraftOf(r: RoleDef): RoleDraft {
  return { role: r.name, description: r.description, model: r.model ?? '', skills: r.skills.join(', '), tools: (r.tools ?? []).join(', '), checklist: r.prompt, error: '' }
}

/** Saves the edit mode through the roles tool's edit (a built-in is copied to the project's folder first); says what happened, or keeps the edit mode open with the error. */
export async function saveRoleDraft($: $): Promise<string> {
  const d = roleView.draft
  if (!d) return ''
  if (!d.description.trim()) {
    d.error = 'description is missing: say in a few words what the role is for'
    $.ui.invalidate('ui.render')
    return ''
  }
  const r = await changeRole($, { action: 'edit', name: d.role, description: d.description, model: d.model, skills: d.skills, tools: d.tools, checklist: d.checklist })
  if (!r.ok) {
    d.error = r.text
    $.ui.invalidate('ui.render')
    return ''
  }
  roleView.draft = null
  $.ui.invalidate('ui.render')
  return r.text
}

/** "New role": makes .<name>/roles/<role>.md from the short template and opens it in the edit mode; a bad or taken name stays in the name box with the reason. */
export async function newRoleFile($: $, name: string): Promise<string> {
  const n = name.trim()
  const r = await changeRole($, { action: 'add', name: n, ...NEW_ROLE_TEMPLATE })
  if (!r.ok) {
    roleView.naming = { name: n, error: r.text }
    $.ui.invalidate('ui.render')
    return ''
  }
  roleView.naming = null
  const made = roleNamed(S.roles, n)
  roleView.open = made?.name ?? n
  roleView.confirmRemove = false
  roleView.draft = made ? roleDraftOf(made) : null
  $.ui.invalidate('ui.render')
  return r.text
}
