import { type RoleDef, parseRole, roleSkipReason, skippedRoleNote, mergeRoles } from '../board'
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
  tellLead($, `${note}. That role can't be used until the file is fixed (front matter with a description; a name of letters, digits, - and _).`)
}

/** Reads the roles again: the plugin's roles/, then the project's .<name>/roles/ over them. */
export async function loadRoles($: $): Promise<RoleDef[]> {
  S.roles = mergeRoles(await roleFiles($, `${$.plugin.root}/roles`, 'roles'), S.root ? await roleFiles($, path(`${S.N.dir}/roles`), `${S.N.dir}/roles`) : [])
  return S.roles
}
