import { type RoleDef, type RolePromptKind, parseRole, roleSkipReason, roleTools, NEW_ROLE_TEMPLATE, mergeRoles, DEFAULT_ROLE, CHECKER_ROLE_TEXT, isCheckerRole, roleNameError, roleFileText, leadRolesText, leadRoleText, leadBrokenLine } from '../board'
import type { BrokenDef } from '../core/def-files'
import { skippedRoles, S } from './state'
import type { Host } from '../host'
import { type DefKind, loadDefs, defLists, manageDefs, newDefFile } from './def-files'

// ---------------- worker roles ----------------

/** What the lead's roles tool gets. */
export type LeadRoleInput = { action?: unknown; name?: unknown; description?: unknown; model?: unknown; skills?: unknown; tools?: unknown; checklist?: unknown }

/** A list given as an array or as "a, b". */
const listOf = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : typeof v === 'string' ? v.split(',').map(x => x.trim()).filter(Boolean) : undefined

/** What makes roles roles for the shared code (def-files.ts): their files in the plugin's roles/ and .<name>/roles/, and their fields. */
const ROLES: DefKind<RoleDef, LeadRoleInput> = {
  noun: 'role',
  plural: 'roles',
  skipped: skippedRoles,
  parse: (name, text) => parseRole(name, text, S.W.roleTools),
  skipReason: (name, text) => roleSkipReason(name, text, S.W.roleTools),
  nameError: roleNameError,
  fileText: roleFileText,
  get fixHint() {
    return `(front matter with a description; a name of letters, digits, - and _; tools only from ${S.W.roleTools.extra.join(', ')}).`
  },
  builtIn: 'roles',
  merge: mergeRoles,
  get: () => S.roles,
  set: all => void (S.roles = all),
  newName: asked => asked,
  builtInFile: name => `roles/${name}.md (in the plugin)`,
  listText: leadRolesText,
  brokenLine: leadBrokenLine,
  oneText: leadRoleText,
  counts: 'from the next worker on',
  noDescription: 'description is missing: say in a few words what the role is for (the lead reads it to choose)',
  added(a, description) {
    const tools = roleTools(listOf(a.tools) ?? [], S.W.roleTools)
    if (typeof tools === 'string') return tools
    const model = typeof a.model === 'string' ? a.model.trim() : ''
    return { description, ...(model ? { model } : {}), skills: listOf(a.skills) ?? [], ...(tools.length ? { tools } : {}), prompt: typeof a.checklist === 'string' ? a.checklist : '' }
  },
  edited(cur, a, description) {
    const tools = a.tools === undefined ? cur.tools ?? [] : roleTools(listOf(a.tools) ?? [], S.W.roleTools)
    if (typeof tools === 'string') return tools
    const model = typeof a.model === 'string' ? a.model.trim() : cur.model ?? ''
    const skills = a.skills === undefined ? cur.skills : listOf(a.skills) ?? cur.skills
    const prompt = typeof a.checklist === 'string' ? a.checklist : cur.prompt
    return { description, ...(model ? { model } : {}), skills, ...(tools.length ? { tools } : {}), ...(cur.off ? { off: true } : {}), prompt }
  },
  turned(cur, off) {
    const { name: _n, warning: _w, ...rest } = cur
    return { ...rest, off }
  },
  alwaysOn: (name, off) => (isCheckerRole(name) ? `Nothing changed: ${CHECKER_ROLE_TEXT}` : off && name.toLowerCase() === DEFAULT_ROLE ? `${DEFAULT_ROLE} can't be turned off: it is the default role` : ''),
  offSaid: "the lead won't pick it and it isn't offered on the task page; tasks that already have it keep it",
}

/** Reads the roles again: the plugin's roles/, then the project's .<name>/roles/ over them. */
export function loadRoles(host: Host): Promise<RoleDef[]> {
  return loadDefs(host, ROLES)
}

/** The plugin's roles and the project's own, read again (S.roles too); `broken` is the project's files that can't be read, with why. */
export function roleLists(host: Host): Promise<{ builtIn: RoleDef[]; project: RoleDef[]; broken: BrokenDef[]; dir: string }> {
  return defLists(host, ROLES)
}

/**
 * The lead's roles tool: list (all, or one in full), add, edit (a built-in is copied to the owner's folder first),
 * reset (back to the built-in), remove (an added role), off / on. Every name is checked before any path is made
 * (letters, digits, - and _ only), so nothing outside <dir>/roles is touched. The roles are read again after a change.
 */
export async function leadRoles(host: Host, a: LeadRoleInput): Promise<string> {
  return (await changeRole(host, a)).text
}

/** The roles tool's work (see leadRoles); `ok` says a role file was written or removed. */
export function changeRole(host: Host, a: LeadRoleInput): Promise<{ ok: boolean; text: string }> {
  return manageDefs(host, ROLES, a)
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
  /** the built-in prompt shown on the opened role's page, view only ('' = none) */
  prompt: '' as RolePromptKind | '',
}

/** Closes the Roles page and everything on it. */
export function resetRoleView() {
  roleView.list = false
  roleView.open = ''
  roleView.draft = null
  roleView.confirmRemove = false
  roleView.naming = null
  roleView.prompt = ''
}

/** The edit mode for role `r`, filled from it. */
export function roleDraftOf(r: RoleDef): RoleDraft {
  return { role: r.name, description: r.description, model: r.model ?? '', skills: r.skills.join(', '), tools: (r.tools ?? []).join(', '), checklist: r.prompt, error: '' }
}

/** Saves the edit mode through the roles tool's edit (a built-in is copied to the project's folder first); says what happened, or keeps the edit mode open with the error. */
export async function saveRoleDraft(host: Host): Promise<string> {
  const d = roleView.draft
  if (!d) return ''
  if (!d.description.trim()) {
    d.error = 'description is missing: say in a few words what the role is for'
    host.ui.refresh()
    return ''
  }
  const r = await changeRole(host, { action: 'edit', name: d.role, description: d.description, model: d.model, skills: d.skills, tools: d.tools, checklist: d.checklist })
  if (!r.ok) {
    d.error = r.text
    host.ui.refresh()
    return ''
  }
  roleView.draft = null
  host.ui.refresh()
  return r.text
}

/** "New role": makes .<name>/roles/<role>.md from the short template and opens it in the edit mode; a bad, taken or broken name stays in the name box with the reason. */
export function newRoleFile(host: Host, name: string): Promise<string> {
  return newDefFile(host, ROLES, roleView, name, NEW_ROLE_TEMPLATE, roleDraftOf)
}
