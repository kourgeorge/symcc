import { type KindDef, parseKind, kindSkipReason, mergeKinds, skippedRoleNote } from '../board'
import { type $, skippedKinds, S } from './state'
import { path } from './store'
import { tellLead } from './tell'

// ---------------- task kinds ----------------
// Read like the roles (see roles.ts): the plugin's kinds/ folder, then the project's .<name>/kinds/ over it.

/** The kind files in folder `dir`, shown as `shown` (e.g. ".symcc/kinds"); a file that can't be used is skipped with a note (see skippedKind). */
export async function kindFiles($: $, dir: string, shown: string): Promise<KindDef[]> {
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
    } else skippedKind($, `${shown}/${f.name}`, kindSkipReason(name, body) ?? 'it can not be used')
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
  tellLead($, `${note}. That kind can't be used until the file is fixed (front matter with a description; a name of letters, digits, - and _).`)
}

/** Reads the kinds again: the plugin's kinds/, then the project's .<name>/kinds/ over them. */
export async function loadKinds($: $): Promise<KindDef[]> {
  S.kinds = mergeKinds(await kindFiles($, `${$.plugin.root}/kinds`, 'kinds'), S.root ? await kindFiles($, path(`${S.N.dir}/kinds`), `${S.N.dir}/kinds`) : [])
  return S.kinds
}
