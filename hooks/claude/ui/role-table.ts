// What the terminal's and VS Code's Roles and Kinds pages share (T-918): the rows of their tables (core's def-table.ts),
// and the role Edit page's Save with its "Writes" pick (code or prose only).
import type { RoleDef, KindDef } from '../../board'
import { findKind } from '../../board'
import { type BrokenDef, defSource, brokenNamed, defNamed } from '../../core/def-files'
import { type DefRow, type CodePick, roleTableRow, kindTableRow, brokenTableRow, codePickOf } from '../../core/def-table'
import { type RoleDraft, roleView, saveRoleDraft, changeRole } from '../../app/roles'
import type { Host } from '../../host'

/** The rows of the Roles table: each role (a file that can't be read by its name), then the other files that can't be read. */
export function roleRows(roles: RoleDef[], builtIn: RoleDef[], project: RoleDef[], broken: BrokenDef[]): (DefRow & { warning?: string })[] {
  return [
    ...roles.map(r => {
      const bad = brokenNamed(broken, r.name)
      return bad ? brokenTableRow(bad) : { ...roleTableRow(r, defSource(r.name, builtIn, project)), ...(r.warning ? { warning: r.warning } : {}) }
    }),
    ...broken.filter(b => !defNamed(roles, b.name)).map(brokenTableRow),
  ]
}

/** The rows of the Kinds table, as roleRows. */
export function kindRows(kinds: KindDef[], builtIn: KindDef[], project: KindDef[], broken: BrokenDef[]): DefRow[] {
  return [
    ...kinds.map(k => {
      const bad = brokenNamed(broken, k.name)
      return bad ? brokenTableRow(bad) : kindTableRow(k, defSource(k.name, builtIn, project))
    }),
    ...broken.filter(b => !findKind(kinds, b.name)).map(brokenTableRow),
  ]
}

/** The edit mode with the Edit page's "Writes" pick (code or prose only); left out: what the role says now. */
export type CodeDraft = RoleDraft & { code?: CodePick }

/** The Edit page's Save, with its Writes pick: when the pick is what role `r` says now, the app's saveRoleDraft;
 *  else the same edit with code sent (true or false) in one write. Says what happened, or keeps the page with the error. */
export async function saveRoleEdit(host: Host, r: RoleDef | undefined): Promise<string> {
  const d = roleView.draft as CodeDraft | null
  if (!d || !d.code || d.code === codePickOf(r) || !d.description.trim()) return saveRoleDraft(host)
  const res = await changeRole(host, { action: 'edit', name: d.role, description: d.description, model: d.model, skills: d.skills, tools: d.tools, checklist: d.checklist, code: d.code === 'prose' ? 'false' : 'true' })
  if (!res.ok) {
    d.error = res.text
    host.ui.refresh()
    return ''
  }
  roleView.draft = null
  host.ui.refresh()
  return res.text
}
