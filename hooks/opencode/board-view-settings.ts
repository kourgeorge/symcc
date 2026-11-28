// The board panel's Settings tab, as plain data (T-798: split out of board-view.ts): the settings list in its groups,
// the Roles and Task types lists, a role's or kind's page and its edit page (the edit mode, DefDraft), and the
// built-in prompt pages of a role.
import {
  SETTING_GROUPS, isSettingPage, settingInfo, settingDots, settingsRuleWidth, settingRowValue, settingWithProjects, settingsHelpOf, viewAsBoard, cantPlayNotify, groupSummaryParts, wrapSegs,
  type KeyHint, type SettingPage, type RoleDef, type DefEditField, roleEditKeys, defEditFields, roleTools, roleFileText, roleSkipReason, kindFileText, kindSkipReason,
  isCheckerRole, checkerOn, roleNameError, kindNameError, leadScoutNameError, ROLE_PROMPTS, ROLE_SLOT, promptsOfRole, type RolePromptKind,
} from '../board'
import { type DefSource, sourceLabel, defNamed } from '../core/def-files'
import { ROLE_PLACEHOLDERS } from '../core/prompts'
import { CHANGED_HEADING, changeLines, roleStateGroups } from '../core/role-changes'
import { type DefRow, ROLE_COLS, KIND_COLS, CURSOR_MARK, TABLE_INDENT, CODE_PICK_LABEL, roleTableRow, kindTableRow, defsCountText, defLayout, defCells, defCellTone, newDefText, roleWritesLine, codePickOf } from '../core/def-table'
import { roleButtons as headerRoleButtons, navRow, PILL_COLOR, placeIn } from '../core/page-header'
import { plural } from '../core/text'
import { DEFAULT_NAME, dataDir } from '../name'
import { type ViewFile, type ViewDef, type PanelChoice, type PanelHit, type PanelKey, type PanelButton, type HeadButton, type Body, bodyMaker, backButton, textLines, buttonText, buttonLines, headerLines, BACK_BUTTON, SAVE_BUTTON, CANCEL_EDIT_BUTTON } from './board-view'

/** The Settings pages that list roles or task types. */
type DefList = SettingPage

/** A role's or kind's edit mode (T-706, as Claude Code's Edit page): the page it is for ("role:tester"), each box's
 *  value as changed so far (core's ROLE_EDIT_FIELDS, KIND_EDIT_FIELDS), and what Save found wrong. */
export type DefDraft = { page: string; values: Record<string, string>; error?: string }

/** The edit mode of role or task type `d`, filled from it (as Claude Code's roleDraftOf, kindDraftOf). */
export function defDraftOf(list: DefList, d: ViewDef): DefDraft {
  const values: Record<string, string> = list === 'roles'
    ? { description: d.description, model: d.model ?? '', skills: (d.skills ?? []).join(', '), tools: (d.tools ?? []).join(', '), code: codePickOf(d) === 'prose' ? 'false' : 'true', checklist: d.text }
    : { description: d.description, body: d.text }
  return { page: defPageId(list, d.name), values }
}

/** The boxes of the edit page, in Claude Code's order with its names and placeholders. */
export const DEF_EDIT_BOXES: Record<DefEditField, { label: string; placeholder: (def: 'role' | 'kind') => string }> = {
  description: { label: 'Description', placeholder: def => (def === 'role' ? 'what the role is for, in a few words' : 'what this task type is, in a few words') },
  model: { label: 'Model', placeholder: () => "empty: the session's model" },
  skills: { label: 'Skills', placeholder: () => 'skill names joined with ", " (empty: none)' },
  tools: { label: 'Tools', placeholder: () => 'extra tools: web, to search and read the web (empty: none)' },
  code: { label: 'Writes', placeholder: () => 'Enter switches: code (its tests run before merging) or prose only (only .md files; only docs checks run)' },
  checklist: { label: 'Checklist', placeholder: () => 'what a worker with this role checks, one line each' },
  body: { label: 'Body', placeholder: () => 'free text about the task type' },
}

/** An edit box's cursor id ("box:model"). */
export const editBoxId = (field: DefEditField) => `box:${field}`
/** The edit page's cursor ids for its Save and Cancel (x) buttons, before its boxes (T-706, as Claude Code's ↑↓). */
export const EDIT_SAVE_ID = 'edit:save'
export const EDIT_CANCEL_ID = 'edit:cancel'
/** Where the edit page's cursor starts: its first box (Description), as Claude Code's autoFocus; ↑ reaches Cancel and Save. */
export const EDIT_FIRST_BOX = 2

/** The fields of the edit mode's role or task type whose value differs from `d`'s (in the page's order): what Save sends. */
export function draftChanges(list: DefList, d: ViewDef, draft: DefDraft): DefEditField[] {
  const before = defDraftOf(list, d).values
  return defEditFields(list === 'roles' ? 'role' : 'kind').filter(k => (draft.values[k] ?? '') !== (before[k] ?? ''))
}

/** What Save says when the description is empty (Claude Code's words). */
export const noDescriptionText = (list: DefList) => `description is missing: say in a few words what ${list === 'roles' ? 'the role is for' : 'this task type is'}`

/** Why Save can't save the edit mode of `name` (Claude Code's error words), or '' when it can: an empty description,
 *  a tool word a role may not have (roleTools), or a file the role or task type could not be read from (roleSkipReason,
 *  kindSkipReason, on the file text the lead's tool would write). The panel shows it on the edit page and sends nothing,
 *  as Claude Code's saveRoleDraft keeps its edit page open with the tool's error. */
export function draftError(list: DefList, name: string, draft: DefDraft): string {
  const v = draft.values
  const description = (v.description ?? '').trim()
  if (!description) return noDescriptionText(list)
  const items = (s: string | undefined) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean)
  if (list === 'kinds') return kindSkipReason(name.toLowerCase(), kindFileText({ description, body: v.body ?? '' })) ?? ''
  const tools = roleTools(items(v.tools))
  if (typeof tools === 'string') return tools
  const model = (v.model ?? '').trim()
  return roleSkipReason(name, roleFileText({ description, ...(model ? { model } : {}), skills: items(v.skills), ...(tools.length ? { tools } : {}), ...(v.code === 'false' ? { code: false as const } : {}), prompt: v.checklist ?? '' })) ?? ''
}

/** The keys at the bottom of the edit page: Claude Code's (roleEditKeys), with Enter, which opens a box here. */
export const defEditKeys = (): KeyHint[] => {
  const [move, cancel] = roleEditKeys()
  return [move!, { key: 'Enter', word: 'change a box or press Save' }, cancel!]
}

/** A page under Settings: the Roles or Kinds list (`id` "roles" or "kinds"),
 *  or one role's or kind's page ("role:tester", "kind:bug"; its list is `list`), or (T-685) the built-in prompt a role
 *  goes in, view only ("prompt:tester:change", `prompt`); null when there is no such page (or the role or task type left the view). */
export function settingsPlace(f: ViewFile | null, id: string): { list: SettingPage; def?: ViewDef; prompt?: RolePromptKind } | null {
  if (id === 'roles' || id === 'kinds') return { list: id }
  const p = /^prompt:(.+):([^:]+)$/.exec(id)
  if (p) {
    const def = defsIn(f, 'roles').find(x => x.name === p[1])
    const kind = promptsOfRole(p[1]!).find(k => k === p[2])
    return def && !def.broken && kind ? { list: 'roles', def, prompt: kind } : null
  }
  const m = /^(role|kind):(.+)$/.exec(id)
  if (!m) return null
  const list = m[1] === 'role' ? 'roles' : 'kinds'
  const def = defsIn(f, list).find(x => x.name === m[2])
  return def ? { list, def } : null
}

/** The roles or task types in the view file. */
export const defsIn = (f: ViewFile | null, list: DefList): ViewDef[] => (Array.isArray(f?.view[list]) ? f!.view[list]! : [])

/** A role's or kind's page id: "role:tester", "kind:bug". */
export const defPageId = (list: DefList, name: string) => `${list === 'roles' ? 'role' : 'kind'}:${name}`

/** Why a new role's, kind's or scout's name (typed in "+ New ...") can't be used, as the engine would refuse it ('' when
 *  it can): the lead's tool's name check, then a name already in the view (any case), as Claude Code's newDefFile and
 *  New scout keep the name box open with the reason. A file there that can't be read says what its page offers. */
export function newNameError(f: ViewFile | null, what: 'role' | 'kind' | 'scout', name: string): string {
  const n = name.trim()
  if (what === 'scout') {
    const bad = leadScoutNameError(n)
    if (bad) return bad
    const there = (f?.view.scouts ?? []).find(x => x.name.toLowerCase() === n.toLowerCase())
    return there ? `a scout named ${there.name} already exists` : ''
  }
  const bad = (what === 'role' ? roleNameError : kindNameError)(n)
  if (bad) return bad
  const there = defNamed(defsIn(f, what === 'role' ? 'roles' : 'kinds'), n)
  if (!there) return ''
  if (there.broken) return `${there.file} is already there but ${there.broken}: ${there.canReset ? 'open it in the list to Reset to built-in' : 'open it in the list to Remove it'}, or fix the file by hand`
  return `a ${what === 'role' ? 'role' : 'task type'} named ${there.name} already exists; open it in the list to change it`
}

/** How long a "+ New ..." waits for its role, kind or scout to show in the view file before it stops waiting (ms). */
export const NEW_OPEN_MS = 15_000

/** The page id of the built-in prompt role `role` goes in: "prompt:tester:change". */
export const rolePromptId = (role: string, kind: RolePromptKind) => `prompt:${role}:${kind}`

/** The buttons of a role's or kind's page, in Claude Code's order (T-685, T-706): Back, Edit (e; not a file that can't
 *  be read), See the prompt (a role, p), Turn off or Turn on (o), Reset to built-in (r), Remove (d; it asks first). */
export const defButtons = (list: DefList, d: ViewDef): PanelButton[] => [
  BACK_BUTTON,
  ...(!d.broken ? [{ label: 'Edit', hit: { key: 'e' as const } }] : []),
  ...(list === 'roles' && !d.broken ? [{ label: 'See the prompt', hit: { key: 'p' as const } }] : []),
  ...(d.canOff ? [{ label: d.off ? 'Turn on' : 'Turn off', hit: { key: 'o' as const } }] : []),
  ...(d.canReset ? [{ label: 'Reset to built-in', hit: { key: 'r' as const } }] : []),
  ...(d.canRemove ? [{ label: 'Remove', hit: { key: 'd' as const } }] : []),
]

/** What a role's or kind's Remove asks before it sends the command (Claude Code's words). */
export const removeAsk = (list: DefList, d: ViewDef) => `Remove ${list === 'roles' ? 'role' : 'task type'} ${d.name} and delete ${d.file}?`

/** The buttons of the built-in prompt page: Back (to the role), then the role's other prompts ("The checker prompt"). */
export const rolePromptButtons = (role: string, kind: RolePromptKind): PanelButton[] => [
  BACK_BUTTON,
  ...promptsOfRole(role).filter(k => k !== kind).map(k => ({ label: `The ${k} prompt`, hit: { page: rolePromptId(role, k) } })),
]

/** Which Settings groups are open at first: none, as on the Claude Code board's Settings page (S.settingsOpen). */
export const SETTINGS_OPEN: readonly string[] = []

/** A Settings group's heading as a cursor id ("settings-group:Work"), and back (null for a setting's or page's id). */
export const settingGroupId = (title: string) => `settings-group:${title}`
export const settingGroupOf = (id: string): string | null => (id.startsWith('settings-group:') ? id.slice(15) : null)

/** The rows the cursor goes over on the Settings tab, in the Claude Code board's groups and order: each group's
 *  heading, then (when it is open) its settings and the Roles and Task types rows that open their pages. */
export const settingRows = (open: readonly string[]): string[] => SETTING_GROUPS.flatMap(g => [settingGroupId(g.title), ...(open.includes(g.title) ? g.items : [])])

/** "6 roles · 1 off" (the Settings row of the Roles or Kinds page). */
function defsCount(f: ViewFile, list: DefList): string {
  const all = defsIn(f, list)
  const off = all.filter(x => x.off).length
  const noun = list === 'roles' ? 'role' : 'task type'
  return `${plural(all.length, noun)}${off ? ` · ${off} off` : ''}`
}

/** A role or task type of the view file as a line of the Roles or Kinds table (core's def-table.ts). */
export function viewDefRow(list: DefList, x: ViewDef): DefRow & { warning?: string } {
  if (x.broken) return { name: x.name, off: false, cells: {}, broken: x.broken }
  const source = (x.source || undefined) as DefSource | undefined
  if (list === 'kinds') return kindTableRow({ name: x.name, description: x.description, body: x.text, ...(x.off ? { off: true } : {}) }, source)
  const r: RoleDef = { name: x.name, description: x.description, ...(x.model ? { model: x.model } : {}), skills: x.skills ?? [], ...(x.tools?.length ? { tools: x.tools } : {}), ...(x.off ? { off: true } : {}), ...(x.code === false ? { code: false as const } : {}), prompt: x.text }
  return { ...roleTableRow(r, source), ...(x.warning ? { warning: x.warning } : {}) }
}

/** The Roles or Kinds page (T-918, as Claude Code's): "▍Roles  8 roles · 2 changed by you", the column heads, one line
 *  per role or task type (core's defLayout: lined up, the description cut with "…", columns dropped when narrow; the
 *  cursor's line marked ❯), then "+ New role (n)". Enter opens one; the footer's keys say n and b. */
export function defsList(f: ViewFile, list: DefList, cursor: number, w: number): Body {
  const b = bodyMaker()
  const all = defsIn(f, list)
  const noun = list === 'roles' ? 'role' : 'kind'
  const rows = all.map(x => viewDefRow(list, x))
  const nav = navRow('settings', '', w)
  b.add([...nav.left, { text: ' '.repeat(nav.pad) }].map(p => ({ text: p.text, color: 'go' in p && p.go ? PILL_COLOR : 'inactive', ...('go' in p && p.go ? { hit: { key: 'back' } as PanelHit } : {}) })))
  b.add([{ text: `▍${list === 'roles' ? 'Roles' : 'Task types'}`, color: 'suggestion', bold: true }, { text: `  ${defsCountText(noun, rows)}`, color: 'inactive' }])
  const layout = defLayout(rows, list === 'roles' ? ROLE_COLS : KIND_COLS, w)
  if (!all.length) b.add([{ text: `  (none in the board's view yet)`, color: 'inactive' }])
  else b.add([{ text: ' '.repeat(TABLE_INDENT), color: 'inactive' }, ...defCells(layout, 'head').map(c => ({ text: c.text, color: 'inactive' }))])
  const ids = all.map(x => defPageId(list, x.name))
  const selected = ids.length ? ids[Math.min(Math.max(0, cursor), ids.length - 1)]! : ''
  rows.forEach((r, i) => {
    const id = ids[i]!
    b.add(
      [
        { text: id === selected ? CURSOR_MARK : ' '.repeat(TABLE_INDENT), color: 'ide', bold: true },
        ...defCells(layout, r).map(c => {
          const tone = defCellTone(r, c.col)
          return { text: c.text, color: tone.color, ...(tone.bold ? { bold: true } : {}) }
        }),
        ...(r.warning ? [{ text: ' ⚠', color: 'warning' }] : []),
      ],
      { page: id },
    )
  })
  b.blank()
  // T-706: Claude Code's "+ New role" / "+ New kind" (n), one plain line
  b.add([{ text: `  ${newDefText(noun)}`, color: 'text' }], { key: 'n' })
  return { ...b, ids, selected, head: 3 }
}

/** One role's or kind's page: its name, where it comes from and whether it is off, what it is for; a role's model,
 *  skills and tools; its checklist (a role) or body (a kind); its file. A file that can't be read says why. */
export function defPage(f: ViewFile, list: DefList, x: ViewDef, w: number): Body {
  if (list === 'roles' && !x.broken) return rolePage(f, x, w)
  const b = bodyMaker()
  const role = list === 'roles'
  // T-685: its title and what it is, then its buttons (as Claude Code's page), all staying at the top
  let head = 0
  const buttons = () => {
    for (const l of buttonLines(defButtons(list, x), w)) b.add(l)
    head = b.lines.length
  }
  if (x.broken) {
    b.add([{ text: x.name, color: 'inactive', bold: true }, { text: ` · ${x.broken}`, color: 'error' }])
    for (const l of wrapSegs([{ text: `Fix the file by hand: ${x.file}${x.canReset ? '; or Reset to built-in deletes it (the built-in one is used meanwhile)' : ''}.`, color: 'text' }], w)) b.add(l)
    buttons()
  } else {
    b.add([{ text: x.name, color: x.off ? 'inactive' : 'claude', bold: true }, { text: ` · ${sourceLabel(x.source as DefSource, x.off)}`, color: x.off ? 'warning' : 'inactive' }])
    if (x.description) for (const l of wrapSegs([{ text: x.description, color: 'text', bold: true }], w)) b.add(l)
    if (x.warning) b.add([{ text: x.warning, color: 'warning' }])
    if (role && isCheckerRole(x.name)) for (const l of wrapSegs([{ text: `never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now ${checkerOn(f.view) ? 'on' : 'off'})`, color: 'inactive' }], w)) b.add(l)
    buttons()
    const section = (title: string, value: string, none: string) => {
      b.blank()
      b.heading(title)
      b.add([{ text: `  ${value || none}`, color: value ? 'text' : 'inactive' }])
    }
    if (role) {
      section('Model', x.model ?? '', "(none: the session's model)")
      section('Skills', (x.skills ?? []).join(', '), '(none)')
      section('Tools', (x.tools ?? []).join(', '), '(none: the base tools only)')
    }
    b.blank()
    b.heading(role ? 'Checklist' : 'Body')
    if (x.text.trim()) for (const l of textLines(x.text.trim(), 'text', w)) b.add(l)
    else b.add([{ text: role ? '  (none: a plain worker)' : '  (none)', color: 'inactive' }])
  }
  b.blank()
  b.heading('File')
  b.add([{ text: `  ${x.file}`, color: 'autoAccept' }])
  b.blank()
  b.add([{ text: 'To change what it says: ask the lead, or edit its file (your own edit shows here at the next board change)', color: 'inactive' }])
  return { ...b, ids: [], selected: '', head }
}

/** The roles a role's page goes through with prev/next: the Roles list's, but the files that can't be read. */
export const roleListIds = (f: ViewFile): string[] => defsIn(f, 'roles').filter(x => !x.broken).map(x => defPageId('roles', x.name))

/** The buttons of role `x`'s page header, as Claude Code's (core's roleButtons): Edit, Prompt, Turn off or on, Reset to
 *  built-in (asks first), Remove (asks first); each presses its key. */
export const roleButtons = (x: ViewDef): HeadButton[] =>
  headerRoleButtons({ canOff: x.canOff, off: x.off, canReset: x.canReset, canRemove: x.canRemove, canSeePrompt: true }).map(b => ({ label: b.label, group: b.group, hit: { key: b.key as PanelKey } }))

/** "Reset role tester to the built-in one and delete .symcc/roles/tester.md?" (the confirm step of Reset to built-in). */
export const resetAsk = (d: ViewDef) => `Reset role ${d.name} to the built-in one and delete ${d.file}?`

/** One role's page (T-871, as Claude Code's): the shared page header (‹ [Roles] and its place, its name and description,
 *  its state "replaced · 1 change", its buttons, a thin rule), then what its file changed from the built-in role (each
 *  difference as before → after, a checklist's changed lines only, the file's date), its model, skills, tools,
 *  checklist and file. No key line at the bottom (panelKeys): the keys are the header's. */
function rolePage(f: ViewFile, x: ViewDef, w: number): Body {
  const b = bodyMaker()
  const source = x.source as DefSource
  const place = placeIn(roleListIds(f), defPageId('roles', x.name))
  for (const l of headerLines({ from: 'roles', label: x.name, place, title: x.description, color: x.off ? 'inactive' : 'claude', state: roleStateGroups(source, x.off, x.changes ?? (source === 'replaced' ? [] : null)), buttons: roleButtons(x) }, w)) b.add(l)
  const head = b.lines.length
  // T-918: always says what the role writes
  b.add([{ text: 'Writes: ', color: 'text', bold: true }, { text: roleWritesLine({ name: x.name, ...(x.code === false ? { code: false as const } : {}) }).slice('Writes: '.length), color: 'text' }])
  if (x.warning) b.add([{ text: x.warning, color: 'warning' }])
  if (isCheckerRole(x.name)) for (const l of wrapSegs([{ text: `never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now ${checkerOn(f.view) ? 'on' : 'off'})`, color: 'inactive' }], w)) b.add(l)
  if (source !== 'built-in') {
    b.blank()
    b.heading(CHANGED_HEADING)
    for (const l of changeLines(source, x.changes ?? (source === 'replaced' ? [] : null), x.changed_at ?? '')) b.add([{ text: l.text, color: l.tone }])
  }
  const section = (title: string, value: string, none: string) => {
    b.blank()
    b.heading(title)
    b.add([{ text: `  ${value || none}`, color: value ? 'text' : 'inactive' }])
  }
  section('Model', x.model ?? '', "(none: the session's model)")
  section('Skills', (x.skills ?? []).join(', '), '(none)')
  section('Tools', (x.tools ?? []).join(', '), '(none: the base tools only)')
  b.blank()
  b.heading('Checklist')
  if (x.text.trim()) for (const l of textLines(x.text.trim(), 'text', w)) b.add(l)
  else b.add([{ text: '  (none: a plain worker)', color: 'inactive' }])
  b.blank()
  b.heading('Placeholders')
  const indented = (segs: Parameters<typeof wrapSegs>[0]) => { for (const l of wrapSegs(segs, w - 2)) b.add([{ text: '  ', color: 'text' }, ...l]) }
  indented([{ text: 'the checklist may use these; each is filled in for the task (any other {{word}} is left as written)', color: 'inactive' }])
  for (const [p, m] of Object.entries(ROLE_PLACEHOLDERS)) indented([{ text: `{{${p}}}`, color: 'text', bold: true }, { text: ` ${m}`, color: 'inactive' }])
  b.blank()
  b.heading('File')
  b.add([{ text: `  ${x.file}`, color: 'autoAccept' }])
  b.blank()
  b.add([{ text: 'To change what it says: ask the lead, or edit its file (your own edit shows here at the next board change)', color: 'inactive' }])
  return { ...b, ids: [], selected: '', head }
}

/** The edit mode in `choice` when it is for the open role's or kind's page (not a file that can't be read). */
export function editOf(f: ViewFile | null, choice: Pick<PanelChoice, 'tab' | 'opened' | 'edit'>): DefDraft | undefined {
  const e = choice.edit
  if (!e || (choice.tab ?? 'tasks') !== 'settings' || e.page !== choice.opened) return undefined
  const place = settingsPlace(f, choice.opened)
  return place?.def && !place.prompt && !place.def.broken ? e : undefined
}

/** A role's or kind's edit page (T-706, Claude Code's Edit): "tester editing", where Save writes, then Save and
 *  Cancel (x), what Save found wrong, then a box per part of its file with Claude Code's names (Description, Model,
 *  Skills, Tools, Checklist; a kind's Description and Body), each showing its value (or its placeholder); Enter or a
 *  click on a box asks for its new value. The cursor goes over Save, Cancel and the boxes. */
export function defEditPage(f: ViewFile, list: DefList, x: ViewDef, draft: DefDraft, cursor: number, w: number): Body {
  const b = bodyMaker()
  const def = list === 'roles' ? 'role' : 'kind'
  const file = `${dataDir(f.name || DEFAULT_NAME)}/${list}/${x.name}.md`
  b.add([{ text: x.name, color: 'claude', bold: true }, { text: ' editing', color: 'warning', bold: true }])
  for (const l of wrapSegs([{ text: `save writes ${file}${x.source === 'built-in' ? ` (a copy of the built-in ${def}; Reset to built-in undoes it)` : ''}`, color: 'inactive' }], w)) b.add(l)
  if (def === 'role') for (const l of wrapSegs([{ text: `the name is the file's name: to rename the role, rename ${file}`, color: 'inactive' }], w)) b.add(l)
  const fields = defEditFields(def)
  // the cursor goes over Save, Cancel and the boxes, as Claude Code's ↑↓ (it starts on the first box: EDIT_FIRST_BOX)
  const ids = [EDIT_SAVE_ID, EDIT_CANCEL_ID, ...fields.map(editBoxId)]
  const selected = ids[Math.min(Math.max(0, cursor), ids.length - 1)]!
  const onButton = selected === EDIT_SAVE_ID ? SAVE_BUTTON : selected === EDIT_CANCEL_ID ? CANCEL_EDIT_BUTTON : undefined
  for (const l of buttonLines([SAVE_BUTTON, CANCEL_EDIT_BUTTON], w - (onButton ? 2 : 0))) {
    if (!onButton) b.add(l)
    else b.add([{ text: '› ', color: 'ide', bold: true }, ...l.map(s => (s.text === buttonText(onButton) ? { ...s, color: 'claude', bold: true } : s))])
  }
  if (draft.error) for (const l of wrapSegs([{ text: draft.error, color: 'error' }], w)) b.add(l)
  const head = b.lines.length
  for (const k of fields) {
    const hit = { editField: k }
    const box = DEF_EDIT_BOXES[k]
    // T-918: the Writes pick shows its words ("code", "prose only"), not the true or false it sends
    const value = k === 'code' ? CODE_PICK_LABEL[draft.values.code === 'false' ? 'prose' : 'code'] : draft.values[k] ?? ''
    b.blank()
    b.add([{ text: editBoxId(k) === selected ? '› ' : '  ', color: 'ide', bold: true }, { text: box.label, color: 'text', bold: true }], hit)
    if (value.trim()) for (const l of textLines(value, 'text', w, 4)) b.add(l, hit)
    else b.add([{ text: `    ${box.placeholder(def)}`, color: 'inactive' }], hit)
  }
  return { ...b, ids, selected, head }
}

/** The built-in prompt role `x` goes in, view only (T-685, Claude Code's See the prompt page): its name, what it is,
 *  the buttons (Back, the role's other prompts), then its text with the {{role}} slot marked. */
export function rolePromptPage(x: ViewDef, kind: RolePromptKind, w: number): Body {
  const b = bodyMaker()
  b.add([{ text: `${kind} prompt`, color: 'claude', bold: true }, { text: ' · built-in, view only', color: 'inactive' }])
  for (const l of wrapSegs([{ text: `${kind === 'checker' ? 'what a checker is told' : `what a worker on a ${kind} task is told`}; role ${x.name}'s checklist goes where ${ROLE_SLOT} is`, color: 'inactive' }], w)) b.add(l)
  for (const l of buttonLines(rolePromptButtons(x.name, kind), w)) b.add(l)
  const head = b.lines.length
  b.blank()
  b.add([{ text: '▍Text', color: 'suggestion', bold: true }])
  for (const line of ROLE_PROMPTS[kind].trimEnd().split('\n')) {
    if (!line.includes(ROLE_SLOT)) {
      b.add([{ text: line || ' ', color: 'text' }])
      continue
    }
    const [before, ...after] = line.split(ROLE_SLOT)
    b.add([
      ...(before ? [{ text: before, color: 'text' }] : []),
      { text: ROLE_SLOT, color: 'warning', bold: true },
      ...(after.join(ROLE_SLOT) ? [{ text: after.join(ROLE_SLOT), color: 'text' }] : []),
      { text: `  ◀ role ${x.name}'s checklist goes here`, color: 'warning' },
    ])
  }
  return { ...b, ids: [], selected: '', head }
}

/** The Settings tab: each group (Work, Checks before merging, ...) as a heading that opens or closes, as the Claude Code
 *  board's (T-585, T-1047): closed, "▸ Work   auto · 3 at once" (the title padded, its values in short, core's
 *  groupSummaryParts; on a narrow panel "▸ Work · auto · 3 at once"); open, "▾ Work" with a row per setting, "Label ..... value"
 *  (units and the mode as core's settingRowValue). Under a thin rule the selected row's help (core's settingsHelpOf): its label,
 *  what it does, then "name · default X · range"; a heading shows its hint. The Roles and Task types rows open their pages. */
export function settingsBody(f: ViewFile, cursor: number, open: readonly string[], w: number): Body {
  const b = bodyMaker()
  const v = f.view
  const ids = settingRows(open)
  const selected = ids[Math.min(Math.max(0, cursor), ids.length - 1)]!
  const pages = { roles: defsCount(f, 'roles'), kinds: defsCount(f, 'kinds') }
  const padWidth = Math.max(...SETTING_GROUPS.map(g => g.title.length)) + 3
  const stacked = w - 4 - padWidth < 12
  for (const g of SETTING_GROUPS) {
    b.blank()
    const isOpen = open.includes(g.title)
    const front = { text: settingGroupId(g.title) === selected ? '› ' : '  ', color: 'ide', bold: true }
    const hit = { settingGroup: g.title }
    if (!isOpen) {
      const sum = groupSummaryParts(g, viewAsBoard(v), stacked ? w - 4 : w - 4 - padWidth + g.title.length + 3, pages)
      const short = stacked ? '' : sum.values.replace(/^ · /, '')
      b.add([front, { text: `▸ ${stacked ? sum.title + sum.values : sum.title.padEnd(padWidth)}`, color: 'text', bold: true }, ...(short ? [{ text: short, color: 'inactive' }] : [])], hit)
      continue
    }
    b.add([front, { text: `▾ ${g.title}`, color: 'text', bold: true }], hit)
    for (const item of g.items) {
      if (isSettingPage(item)) {
        const label = item === 'roles' ? 'Roles' : 'Task types'
        b.add(
          [
            { text: item === selected ? '› ' : '  ', color: 'ide', bold: true },
            { text: label, color: 'text' },
            { text: settingDots(label), color: 'inactive' },
            { text: `${defsCount(f, item)}`, color: 'claude', bold: true },
          ],
          { page: item },
        )
        continue
      }
      const x = settingInfo(item)!
      const unplayable = x.name === 'notify' && cantPlayNotify(v)
      b.add(
        [
          { text: x.name === selected ? '› ' : '  ', color: 'ide', bold: true },
          { text: x.label, color: 'text' },
          { text: settingDots(x.label), color: 'inactive' },
          { text: settingRowValue(x.name, settingWithProjects(viewAsBoard(v), x.name)), color: 'claude', bold: true },
          ...(unplayable ? [{ text: " (can't play here: nothing plays)", color: 'warning' }] : []),
        ],
        { setting: x.name },
      )
    }
  }
  const sel = isSettingPage(selected) ? { page: selected } : settingInfo(selected) ? { setting: selected } : { group: SETTING_GROUPS.find(g => settingGroupId(g.title) === selected)?.title ?? SETTING_GROUPS[0]!.title }
  const help = settingsHelpOf(sel)
  b.blank()
  b.add([{ text: '─'.repeat(settingsRuleWidth(w)), color: 'inactive' }])
  if (help.name) b.add([{ text: help.name, color: 'text', bold: true }])
  for (const l of help.lines) for (const wl of wrapSegs([{ text: l, color: 'inactive' }], w)) b.add(wl)
  b.blank()
  b.add([{ text: `Enter on a heading opens or closes its group · Enter changes a setting (on/off flips) or opens a page · /${f.name}-settings NAME VALUE · or tell the lead`, color: 'inactive' }])
  b.blank()
  backButton(b, w)
  return { ...b, ids, selected }
}
