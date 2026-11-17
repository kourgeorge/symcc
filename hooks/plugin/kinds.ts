import { type KindDef, builtInKinds, parseKind, kindSkipReason, mergeKinds, kindNameError, kindFileText, leadBrokenKindLine, leadKindsText, leadKindText, ALWAYS_ON_KINDS, NEW_KIND_TEMPLATE } from '../board'
import type { BrokenDef } from '../core/def-files'
import { type $, skippedKinds, S } from './state'
import { type DefKind, loadDefs, defLists, manageDefs, newDefFile } from './def-files'

// ---------------- task kinds ----------------
// The plugin's kinds are texts (kinds/<name>.ts); the project's .<name>/kinds/<name>.md files are read like the roles (see def-files.ts), over them.

/** What the lead's kinds tool gets. */
export type LeadKindInput = { action?: unknown; name?: unknown; description?: unknown; body?: unknown }

/** What makes kinds kinds for the shared code (def-files.ts): built-in texts, lowercase names, a description and a body. */
const KINDS: DefKind<KindDef, LeadKindInput> = {
  noun: 'kind',
  plural: 'kinds',
  skipped: skippedKinds,
  parse: parseKind,
  skipReason: kindSkipReason,
  nameError: kindNameError,
  fileText: kindFileText,
  fixHint: '(front matter with a description; a name of letters, digits, - and _); if a built-in kind has that name, it is used meanwhile.',
  builtIn: builtInKinds,
  merge: mergeKinds,
  get: () => S.kinds,
  set: all => void (S.kinds = all),
  newName: asked => asked.toLowerCase(),
  builtInFile: name => `kinds/${name}.ts (in the plugin)`,
  listText: leadKindsText,
  brokenLine: leadBrokenKindLine,
  oneText: leadKindText,
  counts: 'for the next task on',
  noDescription: 'description is missing: say in a few words what this kind of task is (the lead reads it to choose)',
  added: (a, description) => ({ description, body: typeof a.body === 'string' ? a.body : '' }),
  edited: (cur, a, description) => ({ description, body: typeof a.body === 'string' ? a.body : cur.body, ...(cur.off ? { off: true } : {}) }),
  turned: (cur, off) => ({ description: cur.description, body: cur.body, off }),
  alwaysOn: name => (ALWAYS_ON_KINDS.includes(name) ? `${name} can't be turned off: it is one of the two ways a task runs (${ALWAYS_ON_KINDS.join(' and ')})` : ''),
  offSaid: "the lead won't pick it for a new task and add refuses it; tasks that already have it keep it",
}

/** Reads the kinds again: the plugin's built-in ones, then the project's .<name>/kinds/ over them. */
export function loadKinds($: $): Promise<KindDef[]> {
  return loadDefs($, KINDS)
}

/** The plugin's kinds and the project's own, read again (S.kinds too); `broken` is the project's files that can't be read, with why. */
export function kindLists($: $): Promise<{ builtIn: KindDef[]; project: KindDef[]; broken: BrokenDef[]; dir: string }> {
  return defLists($, KINDS)
}

/**
 * The lead's kinds tool, like the roles tool: list (all, or one in full), add, edit (a built-in is copied to the owner's folder first),
 * reset (back to the built-in), remove (an added kind), off / on (change and investigation can't be turned off). Every name is checked
 * before any path is made (letters, digits, - and _ only), so nothing outside <dir>/kinds is touched. The kinds are read again after a change.
 */
export async function leadKinds($: $, a: LeadKindInput): Promise<string> {
  return (await changeKind($, a)).text
}

/** The kinds tool's work (see leadKinds); `ok` says a kind file was written or removed. */
export function changeKind($: $, a: LeadKindInput): Promise<{ ok: boolean; text: string }> {
  return manageDefs($, KINDS, a)
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

/** "New kind": makes .<name>/kinds/<kind>.md from the short template and opens it in the edit mode; a bad, taken or broken name
 *  stays in the name box with the reason (like newRoleFile). */
export function newKindFile($: $, name: string): Promise<string> {
  return newDefFile($, KINDS, kindView, name, NEW_KIND_TEMPLATE, kindDraftOf)
}
