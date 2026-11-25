// The board panel's Settings view.
import { SETTINGS, SETTING_GROUPS, groupSummaryParts, isSettingPage, settingChoices, settingShown, settingRowValue, groupHint, cantPlayNotify, type SettingsInput, type SettingName, type SettingPage, settingValue, viewAsBoard, parseSettingValue, settingsKeys, boxHint, pickHint, type RoleDef, mergeRoles, roleKeys, roleEditKeys, rolesKeys, rolePromptKeys, ROLE_PLACEHOLDERS, ROLE_SLOT, ROLE_PROMPTS, promptsOfRole, type RolePromptKind, type KindDef, mergeKinds, kindsKeys, findKind, isCheckerRole, checkerOn } from '../../board'
import { type DefSource, type BrokenDef, defSource, sourceLabel, brokenNamed, brokenLabel } from '../../core/def-files'
import { S } from '../../app/state'
import { type $ } from '../panel'
import { resetPane } from '../../app/open'
import { ownerSettings } from '../../app/tools'
import { roleLists, roleView, roleDraftOf, newRoleFile, changeRole, roleFileDay } from '../../app/roles'
import { type RolePageFacts, CHANGED_HEADING, changeLines, changesOfRole, roleStateGroups } from '../../core/role-changes'
import { NAV_KEYS, defActions, placeIn, roleButtons } from '../../core/page-header'
import { type PageHeader, pageHeader } from './page-header'
import { kindLists, kindView, kindDraftOf, saveKindDraft, newKindFile, changeKind } from '../../app/kinds'
import type { PaneParts } from './parts'
import { arrows, headingFocused, row } from './arrows'
import { settingsPageVs } from './vscode-settings'
import { rolesPageVs, rolePageVs, brokenRolePageVs, rolePromptPageVs, roleEditPageVs, kindsPageVs, kindPageVs, kindEditPageVs } from './vscode-roles'
import { claudeHost } from '../host'
import { type DefRow, type DefCol, type CodePick, ROLE_COLS, KIND_COLS, CURSOR_MARK, TABLE_INDENT, CODE_PICKS, CODE_PICK_LABEL, CODE_PICK_HINT, defsCountText, defWord, defLayout, defCells, defCellTone, defLineText, newDefText, roleWritesLine, codePickOf } from '../../core/def-table'
import { type CodeDraft, roleRows, kindRows, saveRoleEdit } from './role-table'

/** A role's file as the panel names it: .<name>/roles/<role>.md. */
const roleFileOf = (name: string) => `${S.N.dir}/roles/${name}.md`

/** A role's edit mode in Settings: the same header as its page, then Save and Cancel (x), then a box per part of its
 *  file, named and ordered as the page shows them: Description, Model, Skills, Tools, Checklist. Its boxes take every letter
 *  and Esc doesn't reach the panel from a text box, so Cancel is the way out. */
function roleEditPage($: $, pane: PaneParts, r: RoleDef, source: DefSource | undefined) {
  // VS Code's side panel draws its own page (vscode-roles.tsx)
  if (pane.vscode) return roleEditPageVs($, pane, r, source)
  const { Box, Text, Button, Input, act, C, heading, footer } = pane
  const d = roleView.draft! as CodeDraft
  const now = d.code ?? codePickOf(r)
  const pickCode = (p: CodePick) => () => ((d.code = p), $.ui.invalidate('ui.render'))
  const cancel = () => ((roleView.draft = null), $.ui.invalidate('ui.render'))
  const box = (key: keyof typeof d, label: string, placeholder: string, more: Record<string, unknown> = {}) => (
    <Box flexDirection="column">
      {heading(label)}
      <Input key={`role-${key}`} value={String(d[key])} placeholder={placeholder} submitLabel="keep" {...more} onInput={value => void ((d as Record<string, string>)[key] = value)} onSubmit={value => void ((d as Record<string, string>)[key] = value)} />
    </Box>
  )
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('claude')}>{d.role}</Text> <Text bold color={C('warning')}>editing</Text>
        </Text>
        <Text color={C('inactive')}>save writes {roleFileOf(d.role)}{source === 'built-in' ? ' (a copy of the built-in role; Reset to built-in undoes it)' : ''}</Text>
        <Text color={C('inactive')}>the name is the file's name: to rename the role, rename {roleFileOf(d.role)}</Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="role-save" label="Save" onPress={act(async () => {
          const said = await saveRoleEdit(claudeHost($), r)
          if (said) $.ui.toast(S.N.toast(said))
        })} />
        <Button key="role-edit-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
      </Box>
      {d.error ? <Text color={C('error')}>{d.error}</Text> : null}
      {box('description', 'Description', 'what the role is for, in a few words', { autoFocus: true })}
      {box('model', 'Model', "empty: the session's model")}
      {box('skills', 'Skills', 'skill names joined with ", " (empty: none)')}
      {box('tools', 'Tools', 'extra tools: web, to search and read the web (empty: none)')}
      {/* T-918: what the role writes, a pick of two (code: false is prose only) */}
      <Box key="role-code-pick" flexDirection="column">
        {heading('Writes')}
        <Box flexDirection="row" gap={2}>
          {CODE_PICKS.map(p => (
            <Button key={`role-code-${p}`} plain label={CODE_PICK_LABEL[p]} onPress={pickCode(p)}>
              <Text bold={p === now} color={C(p === now ? 'ide' : 'text')}>{`${p === now ? '●' : '○'} ${CODE_PICK_LABEL[p]}`}</Text>
            </Button>
          ))}
        </Box>
        <Text color={C('inactive')}>{CODE_PICK_HINT}</Text>
      </Box>
      {box('checklist', 'Checklist', 'what a worker with this role checks, one line each', { rows: 8 })}
      {footer(roleEditKeys(), 'role-edit-keys')}
    </Box>
  )
}

/** The shared page header of role `r`'s page (T-751's, as on task and scout pages; T-871): ‹ [Roles] and its place in
 *  the list, its name and description, its state ("replaced · 1 change", "off"), its buttons (Edit, Prompt, Turn off or on,
 *  Reset to built-in, Remove). Used by the terminal, desktop, mobile and VS Code pages. */
export function roleHeader($: $, r: RoleDef, source: DefSource, facts: RolePageFacts, run: (input: Parameters<typeof changeRole>[1]) => () => void): PageHeader {
  const redraw = () => $.ui.invalidate('ui.render')
  const isChecker = isCheckerRole(r.name)
  // the checker role's off: true only keeps it out of the task roles, so it is not shown as off
  const off = !!r.off && !isChecker
  const { canOff, canReset, canRemove } = defActions('role', r.name, source, false, [])
  const at = placeIn(facts.names, r.name)
  const go = (name: string) => () => ((roleView.open = name), (roleView.confirmRemove = false), (roleView.confirmReset = false), redraw())
  const onPress: Record<string, () => void> = {
    'role-edit': () => ((roleView.draft = roleDraftOf(r)), (roleView.confirmRemove = false), (roleView.confirmReset = false), redraw()),
    'role-prompt': () => ((roleView.prompt = promptsOfRole(r.name)[0]!), (roleView.confirmRemove = false), (roleView.confirmReset = false), redraw()),
    'role-off': run({ action: r.off ? 'on' : 'off', name: r.name }),
    'role-reset': () => ((roleView.confirmReset = true), (roleView.confirmRemove = false), redraw()),
    'role-remove': () => ((roleView.confirmRemove = true), (roleView.confirmReset = false), redraw()),
  }
  const buttons = roleButtons({ canOff, off: !!r.off, canReset, canRemove, canSeePrompt: true })
  return {
    from: 'roles', label: r.name, place: at, title: r.description, color: off ? 'inactive' : 'claude',
    state: roleStateGroups(source, off, facts.changes),
    buttons: buttons.map(b => ({ ...b, onPress: onPress[b.id] ?? (() => undefined) })),
    onBack: go(''), onPrev: at ? go(at.prev) : () => undefined, onNext: at ? go(at.next) : () => undefined,
    backFocus: !roleView.confirmRemove && !roleView.confirmReset, nav: NAV_KEYS.claude, backKey: 'role-back',
  }
}

/** One role's page (opened from the Roles page; Back returns there): the shared page header (roleHeader), then what its file
 *  changed from the built-in role (T-871: each difference as before → after, a checklist's changed lines only, the file's
 *  date; Reset to built-in asks first), then its front matter and checklist. No key line at the bottom: the keys are the
 *  header's (e, p, o, r, d, b, k j). The checker role's page says the checker setting runs it and whether that is on. */
function rolePage($: $, pane: PaneParts, r: RoleDef, source: DefSource, facts: RolePageFacts) {
  const run = (input: Parameters<typeof changeRole>[1], after?: () => void) => pane.act(async () => {
    const res = await changeRole(claudeHost($), input)
    if (res.ok && after) after()
    roleView.confirmRemove = false
    roleView.confirmReset = false
    $.ui.toast(S.N.toast(res.text))
    $.ui.invalidate('ui.render')
  })
  const header = roleHeader($, r, source, facts, input => run(input))
  // VS Code's side panel draws its own page (vscode-roles.tsx), with the same header
  if (pane.vscode) return rolePageVs($, pane, r, source, facts, header, run)
  const { Box, Text, Button, C, heading, paragraphs } = pane
  const isChecker = isCheckerRole(r.name)
  const { canReset, canRemove } = defActions('role', r.name, source, false, [])
  // one section per part of the file, named as the edit page's boxes; the description is the header's title
  const section = (title: string, value: string | undefined, none: string) => (
    <Box flexDirection="column">
      {heading(title)}
      {value ? <Text color={C('text')}>{`  ${value}`}</Text> : <Text color={C('inactive')}>{`  ${none}`}</Text>}
    </Box>
  )
  const confirm = (key: string, what: string, yes: string, onYes: () => void, onNo: () => void) => (
    <Box key={`${key}-box`} flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
      <Text color={C('warning')}>{what}</Text>
      <Box flexDirection="row" gap={1}>
        <Button key={`${key}-yes`} label={`${yes} (y)`} hotkey="y" autoFocus onPress={onYes} />
        <Button key={`${key}-cancel`} label="Cancel (x)" hotkey="x" onPress={onNo} />
      </Box>
    </Box>
  )
  const cancel = () => ((roleView.confirmRemove = false), (roleView.confirmReset = false), $.ui.invalidate('ui.render'))
  return (
    <Box flexDirection="column" gap={1}>
      {pageHeader(pane, header)}
      <Box flexDirection="column">
        {/* T-918: always says what the role writes */}
        <Text key="role-writes" color={C('text')}>{roleWritesLine(r)}</Text>
        {r.warning ? <Text color={C('warning')}>{r.warning}</Text> : null}
        {isChecker ? <Text key="role-checker-setting" color={C('inactive')}>{`never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now ${facts.checker ? 'on' : 'off'})`}</Text> : null}
      </Box>
      {roleView.confirmRemove && canRemove ? confirm('role-remove', `Remove role ${r.name} and delete ${roleFileOf(r.name)}?`, 'Yes, remove', run({ action: 'remove', name: r.name }, () => (roleView.open = '')), cancel) : null}
      {source !== 'built-in' ? (
        <Box key="role-changes" flexDirection="column">
          {heading(CHANGED_HEADING)}
          {changeLines(source, facts.changes, facts.at).map((l, i) => (
            <Text key={`role-change-${i}`} color={C(l.tone)}>{l.text}</Text>
          ))}
          {roleView.confirmReset && canReset ? confirm('role-reset', `Reset role ${r.name} to the built-in one and delete ${roleFileOf(r.name)}?`, 'Yes, reset', run({ action: 'reset', name: r.name }), cancel) : null}
        </Box>
      ) : null}
      {section('Model', r.model, "(none: the session's model)")}
      {section('Skills', r.skills.join(', '), '(none)')}
      {section('Tools', (r.tools ?? []).join(', '), '(none: the base tools only)')}
      <Box flexDirection="column">
        {heading('Checklist')}
        {r.prompt.trim() ? paragraphs(r.prompt.trim()) : <Text color={C('inactive')}>(none: a plain worker)</Text>}
      </Box>
      <Box flexDirection="column">
        {heading('Placeholders')}
        <Text color={C('inactive')}>  the checklist may use these; each is filled in for the task (any other {'{{word}}'} is left as written)</Text>
        {Object.entries(ROLE_PLACEHOLDERS).map(([p, m]) => (
          <Text key={`role-holder-${p}`}>
            {'  '}
            <Text bold color={C('ide')}>{`{{${p}}}`}</Text>
            <Text color={C('inactive')}> {m}</Text>
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        {heading('File')}
        <Text>
          {'  '}
          <Text color={C('autoAccept')}>{source === 'built-in' ? `roles/${r.name}.md (in the plugin; Edit copies it to ${roleFileOf(r.name)})` : roleFileOf(r.name)}</Text>
        </Text>
      </Box>
    </Box>
  )
}

/** The built-in prompt role `r` is put into, view only (opened from its page with See the prompt; Back returns there): its text with
 *  the {{role}} slot marked, so it is clear where the checklist goes. The prompts are built-in: roles are how a worker is shaped. */
function rolePromptPage($: $, pane: PaneParts, r: RoleDef, kind: RolePromptKind) {
  // VS Code's side panel draws its own page (vscode-roles.tsx)
  if (pane.vscode) return rolePromptPageVs($, pane, r, kind)
  const { Box, Text, Button, C, heading, footer, buttonRows } = pane
  const show = (k: RolePromptKind | '') => () => ((roleView.prompt = k), $.ui.invalidate('ui.render'))
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('claude')}>{kind} prompt</Text>
          <Text color={C('inactive')}> · built-in, view only</Text>
        </Text>
        <Text color={C('inactive')}>{kind === 'checker' ? 'what a checker is told' : `what a worker on a ${kind} task is told`}; role {r.name}'s checklist goes where {ROLE_SLOT} is</Text>
      </Box>
      {buttonRows([
        <Button key="role-prompt-back" label="Back" hotkey="b" autoFocus onPress={show('')} />,
        ...promptsOfRole(r.name).filter(k => k !== kind).map(k => <Button key={`role-prompt-${k}`} label={`The ${k} prompt`} onPress={show(k)} />),
      ], 'role-prompt-buttons')}
      <Box flexDirection="column">
        {heading('Text')}
        {ROLE_PROMPTS[kind].trimEnd().split('\n').map((line, i) => {
          if (!line.includes(ROLE_SLOT)) return <Text key={`role-prompt-line-${i}`}>{line || ' '}</Text>
          const [before, ...after] = line.split(ROLE_SLOT)
          return (
            <Text key={`role-prompt-line-${i}`}>
              {before}
              <Text bold color={C('warning')}>{ROLE_SLOT}</Text>
              {after.join(ROLE_SLOT)}
              <Text color={C('warning')}>{`  ◀ role ${r.name}'s checklist goes here`}</Text>
            </Text>
          )
        })}
      </Box>
      {footer(rolePromptKeys(), 'role-prompt-keys')}
    </Box>
  )
}

/** The page of a role whose file can't be read: why, then only what works: Reset to built-in (a built-in's name) or Remove
 *  (an added role, after a confirm step). The edit page can't load a broken file, so it is fixed by hand. */
function brokenRolePage($: $, pane: PaneParts, b: BrokenDef, builtIn: RoleDef[]) {
  // VS Code's side panel draws its own page (vscode-roles.tsx)
  if (pane.vscode) return brokenRolePageVs($, pane, b, builtIn)
  const { Box, Text, Button, act, C, heading, footer, buttonRows } = pane
  const run = (input: Parameters<typeof changeRole>[1]) => act(async () => {
    const res = await changeRole(claudeHost($), input)
    if (res.ok) roleView.open = ''
    roleView.confirmRemove = false
    $.ui.toast(S.N.toast(res.text))
    $.ui.invalidate('ui.render')
  })
  const { canReset, canRemove } = defActions('role', b.name, undefined, true, builtIn)
  const out = canReset ? 'Reset to built-in deletes it (the built-in role is used meanwhile)' : canRemove ? 'Remove deletes it' : ''
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('inactive')}>{b.name}</Text>
          <Text color={C('error')}> · {brokenLabel(b)}</Text>
        </Text>
        <Text color={C('text')}>Fix the file by hand: {b.file}{out ? `; or ${out}` : ''}.</Text>
      </Box>
      {buttonRows([
        <Button key="role-back" label="Back" hotkey="b" autoFocus={roleView.confirmRemove ? undefined : true} onPress={() => ((roleView.open = ''), (roleView.confirmRemove = false), $.ui.invalidate('ui.render'))} />,
        canReset && <Button key="role-reset" label="Reset to built-in" hotkey="r" onPress={run({ action: 'reset', name: b.name })} />,
        canRemove && <Button key="role-remove" label="Remove" hotkey="d" onPress={() => ((roleView.confirmRemove = true), $.ui.invalidate('ui.render'))} />,
      ], 'role-buttons')}
      {roleView.confirmRemove && canRemove ? (
        <Box key="role-remove-box" flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
          <Text color={C('warning')}>Remove role {b.name} and delete {b.file}?</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="role-remove-yes" label="Yes, remove (y)" hotkey="y" autoFocus onPress={run({ action: 'remove', name: b.name })} />
            <Button key="role-remove-cancel" label="Cancel (x)" hotkey="x" onPress={() => ((roleView.confirmRemove = false), $.ui.invalidate('ui.render'))} />
          </Box>
        </Box>
      ) : null}
      <Box flexDirection="column">
        {heading('File')}
        <Text>
          {'  '}
          <Text color={C('autoAccept')}>{b.file}</Text>
        </Text>
      </Box>
      {footer(roleKeys({ canEdit: false, canOff: false, off: false, canReset, canRemove }), 'role-keys')}
    </Box>
  )
}

/** T-918: the Roles or Kinds page on the terminal: "▍Roles  8 roles · 2 changed by you", the column heads, one line per
 *  role or task type (core's defLayout: the columns lined up, the description cut with "…", columns dropped when narrow; the
 *  cursor's line marked ❯), then "+ New role (n)" (or its name box) and the footer's keys. Enter opens a line; n and b
 *  are hidden Buttons (the key line says them). */
function defTable($: $, pane: PaneParts, o: { noun: 'role' | 'kind'; rows: (DefRow & { warning?: string })[]; cols: readonly DefCol[]; naming: { name: string; error: string } | null; open: (name: string) => () => void; startNew: () => void; back: () => void; newBox: unknown; keys: ReturnType<typeof rolesKeys> }) {
  const { Box, Text, Button, C, header, footer } = pane
  const { noun, rows } = o
  const page = noun === 'role' ? 'roles' : 'kinds'
  const layout = defLayout(rows, o.cols, pane.width)
  const keys = rows.map(r => `${noun}Row:${r.name}`)
  const at = keys.indexOf(arrows.focused ?? '')
  const cursor = o.naming ? -1 : at >= 0 ? at : 0
  return (
    <Box flexDirection="column">
      {header(page)}
      <Text key={`${page}-heading`} wrap="truncate">
        <Text bold color={C('suggestion')}>{`▍${noun === 'role' ? 'Roles' : 'Task types'}`}</Text>
        <Text color={C('inactive')}>{`  ${defsCountText(noun, rows)}`}</Text>
      </Text>
      <Text key={`${page}-cols`} wrap="truncate" color={C('inactive')}>{defLineText(layout, 'head')}</Text>
      {rows.map((r, i) => (
        <Button key={row(keys[i]!)} plain label={r.broken ? `${r.name} — ${r.broken}` : `${r.name}: ${r.cells.from ?? ''}${r.warning ? ' ⚠' : ''}`} autoFocus={i === 0 && !o.naming ? true : undefined} onPress={o.open(r.name)}>
          <Text bold color={C('ide')}>{i === cursor ? CURSOR_MARK : ' '.repeat(TABLE_INDENT)}</Text>
          {defCells(layout, r).map(c => {
            const tone = defCellTone(r, c.col)
            return <Text key={`${keys[i]}-${c.col}`} bold={tone.bold} color={C(tone.color)}>{c.text}</Text>
          })}
          {r.warning ? <Text color={C('warning')}>{' ⚠'}</Text> : null}
        </Button>
      ))}
      <Text key={`${page}-page-blank`}> </Text>
      {o.newBox as never}
      <Box key={`${page}-hidden-keys`} display="none">
        {o.naming ? null : <Button key={`${noun}-new-key`} label="n" hotkey="n" onPress={o.startNew} />}
        <Button key={`${page}-back`} label="Back" hotkey="b" onPress={o.back} />
      </Box>
      {footer(o.keys, `${page}-keys`)}
    </Box>
  )
}

/** The part of roleView / kindView the Roles or Kinds page reads and changes. */
type DefPageView = { list: boolean; open: string; confirmRemove: boolean; naming: { name: string; error: string } | null }

/** T-923: the Roles or Kinds page on the terminal (both call it): the table (defTable), + New role / kind (n); b goes
 *  back to Settings. The New … box asks for the name; its Cancel button (x), or Enter on it empty, leaves it. */
function defPage($: $, pane: PaneParts, o: { noun: 'role' | 'kind'; view: DefPageView; newFile: (host: ReturnType<typeof claudeHost>, name: string) => Promise<string>; rows: (DefRow & { warning?: string })[]; cols: readonly DefCol[]; keys: ReturnType<typeof rolesKeys> }) {
  const { Box, Text, Button, Input, act, C } = pane
  const { noun, view } = o
  const cancel = () => ((view.naming = null), $.ui.invalidate('ui.render'))
  const openRow = (name: string) => () => ((view.open = name), (view.confirmRemove = false), (view.naming = null), $.ui.invalidate('ui.render'))
  const startNew = () => ((view.naming = { name: '', error: '' }), $.ui.invalidate('ui.render'))
  const newBox = view.naming ? (
    <Box key={`${noun}-new-box`} flexDirection="column">
      <Input
        key={`${noun}-new-name`}
        label={`New ${defWord(noun)}'s name`}
        placeholder="letters, digits, - and _"
        value={view.naming.name}
        autoFocus
        submitLabel="make it"
        onInput={value => void (view.naming && (view.naming.name = value))}
        onSubmit={value => (value.trim() ? act(async () => {
          const said = await o.newFile(claudeHost($), value)
          if (said) $.ui.toast(S.N.toast(said))
        })() : cancel())}
      />
      {view.naming.error ? <Text color={C('error')}>{view.naming.error}</Text> : null}
      <Button key={`${noun}-new-cancel`} label="Cancel (x)" hotkey="x" onPress={cancel} />
      <Text color={C('inactive')}>{boxHint(`Enter makes ${S.N.dir}/${noun}s/<name>.md and opens it`)}</Text>
    </Box>
  ) : (
    <Button key={`${noun}-new`} plain label={newDefText(noun)} onPress={startNew}>
      <Text color={C('text')}>{`  ${newDefText(noun)}`}</Text>
    </Button>
  )
  return defTable($, pane, {
    noun,
    rows: o.rows,
    cols: o.cols,
    naming: view.naming,
    open: openRow,
    startNew,
    back: () => ((view.list = false), (view.naming = null), $.ui.invalidate('ui.render')),
    newBox,
    keys: o.keys,
  })
}

/** The Roles page, opened from Settings' Roles row (defPage). */
function rolesPage($: $, pane: PaneParts, roles: RoleDef[], builtIn: RoleDef[], project: RoleDef[], broken: BrokenDef[]) {
  // VS Code's side panel draws its own page (vscode-roles.tsx)
  if (pane.vscode) return rolesPageVs($, pane, roles, builtIn, project, broken)
  return defPage($, pane, { noun: 'role', view: roleView, newFile: newRoleFile, rows: roleRows(roles, builtIn, project, broken), cols: ROLE_COLS, keys: rolesKeys() })
}

// ---------------- the Kinds page (like the Roles page, with the same keys) ----------------

/** A kind's file as the panel names it: .<name>/kinds/<kind>.md. */
const kindFileOf = (name: string) => `${S.N.dir}/kinds/${name}.md`

/** A kind's edit mode: Save and Cancel (x), then a box per part of its file: Description and Body. */
function kindEditPage($: $, pane: PaneParts, source: DefSource | undefined) {
  // VS Code's side panel draws its own page (vscode-roles.tsx)
  if (pane.vscode) return kindEditPageVs($, pane, source)
  const { Box, Text, Button, Input, act, C, heading, footer } = pane
  const d = kindView.draft!
  const cancel = () => ((kindView.draft = null), $.ui.invalidate('ui.render'))
  const box = (key: 'description' | 'body', label: string, placeholder: string, more: Record<string, unknown> = {}) => (
    <Box flexDirection="column">
      {heading(label)}
      <Input key={`kind-${key}`} value={d[key]} placeholder={placeholder} submitLabel="keep" {...more} onInput={value => void (d[key] = value)} onSubmit={value => void (d[key] = value)} />
    </Box>
  )
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('claude')}>{d.kind}</Text> <Text bold color={C('warning')}>editing</Text>
        </Text>
        <Text color={C('inactive')}>save writes {kindFileOf(d.kind)}{source === 'built-in' ? ' (a copy of the built-in task type; Reset to built-in undoes it)' : ''}</Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="kind-save" label="Save" onPress={act(async () => {
          const said = await saveKindDraft(claudeHost($))
          if (said) $.ui.toast(S.N.toast(said))
        })} />
        <Button key="kind-edit-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
      </Box>
      {d.error ? <Text color={C('error')}>{d.error}</Text> : null}
      {box('description', 'Description', 'what this task type is, in a few words', { autoFocus: true })}
      {box('body', 'Body', 'free text about the task type', { rows: 6 })}
      {footer(roleEditKeys(), 'kind-edit-keys')}
    </Box>
  )
}

/** One kind's page (Back returns to the Kinds page): its description and body, with Back, Edit, Turn off / on (not for change
 *  or investigation), Reset to built-in (a replaced built-in only) and Remove (an added kind only, after a confirm step).
 *  A kind whose file can't be read (`broken`) shows why, and only Reset or Remove. */
function kindPage($: $, pane: PaneParts, k: KindDef | undefined, source: DefSource | undefined, broken: BrokenDef | undefined, builtIn: KindDef[]) {
  // VS Code's side panel draws its own page (vscode-roles.tsx)
  if (pane.vscode) return kindPageVs($, pane, k, source, broken, builtIn)
  const { Box, Text, Button, act, C, heading, footer, buttonRows, paragraphs } = pane
  const name = k?.name ?? broken!.name
  const run = (input: Parameters<typeof changeKind>[1], after?: () => void) => act(async () => {
    const res = await changeKind(claudeHost($), input)
    if (res.ok && after) after()
    kindView.confirmRemove = false
    $.ui.toast(S.N.toast(res.text))
    $.ui.invalidate('ui.render')
  })
  const { canEdit, canOff, canReset, canRemove } = defActions('kind', name, source, !!broken, builtIn)
  const file = broken ? broken.file : source === 'built-in' ? `kinds/${name}.ts (in the plugin; Edit copies it to ${kindFileOf(name)})` : kindFileOf(name)
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C(broken || k?.off ? 'inactive' : 'claude')}>{name}</Text>
          {broken ? <Text color={C('error')}> · {brokenLabel(broken)}</Text> : <Text color={C(k!.off ? 'warning' : 'inactive')}> · {sourceLabel(source!, k!.off)}</Text>}
        </Text>
        {broken ? <Text color={C('text')}>Fix the file by hand: {broken.file}.</Text> : <Text bold color={C('text')}>{k!.description}</Text>}
      </Box>
      {buttonRows([
        <Button key="kind-back" label="Back" hotkey="b" autoFocus={kindView.confirmRemove ? undefined : true} onPress={() => ((kindView.open = ''), (kindView.confirmRemove = false), $.ui.invalidate('ui.render'))} />,
        canEdit && <Button key="kind-edit" label="Edit" hotkey="e" onPress={() => ((kindView.draft = kindDraftOf(k!)), (kindView.confirmRemove = false), $.ui.invalidate('ui.render'))} />,
        canOff && <Button key="kind-off" label={k!.off ? 'Turn on' : 'Turn off'} hotkey="o" onPress={run({ action: k!.off ? 'on' : 'off', name })} />,
        canReset && <Button key="kind-reset" label="Reset to built-in" hotkey="r" onPress={run({ action: 'reset', name }, broken ? () => (kindView.open = '') : undefined)} />,
        canRemove && <Button key="kind-remove" label="Remove" hotkey="d" onPress={() => ((kindView.confirmRemove = true), $.ui.invalidate('ui.render'))} />,
      ], 'kind-buttons')}
      {kindView.confirmRemove && canRemove ? (
        <Box key="kind-remove-box" flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
          <Text color={C('warning')}>Remove task type {name} and delete {broken ? broken.file : kindFileOf(name)}?</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="kind-remove-yes" label="Yes, remove (y)" hotkey="y" autoFocus onPress={run({ action: 'remove', name }, () => (kindView.open = ''))} />
            <Button key="kind-remove-cancel" label="Cancel (x)" hotkey="x" onPress={() => ((kindView.confirmRemove = false), $.ui.invalidate('ui.render'))} />
          </Box>
        </Box>
      ) : null}
      {k ? (
        <Box flexDirection="column">
          {heading('Body')}
          {k.body.trim() ? paragraphs(k.body.trim()) : <Text color={C('inactive')}>(none)</Text>}
        </Box>
      ) : null}
      <Box flexDirection="column">
        {heading('File')}
        <Text>
          {'  '}
          <Text color={C('autoAccept')}>{file}</Text>
        </Text>
      </Box>
      {footer(roleKeys({ canEdit, canOff, off: !!k?.off, canReset, canRemove }), 'kind-keys')}
    </Box>
  )
}

/** The Kinds page, opened from Settings' Kinds row: the table (defTable: NAME, FROM, WHAT IT'S FOR), + New kind (n);
 *  b goes back to Settings. */
function kindsPage($: $, pane: PaneParts, kinds: KindDef[], builtIn: KindDef[], project: KindDef[], broken: BrokenDef[]) {
  // VS Code's side panel draws its own page (vscode-roles.tsx)
  if (pane.vscode) return kindsPageVs($, pane, kinds, builtIn, project, broken)
  return defPage($, pane, { noun: 'kind', view: kindView, newFile: newKindFile, rows: kindRows(kinds, builtIn, project, broken), cols: KIND_COLS, keys: kindsKeys() })
}

/** The Settings view: the settings under their category headings (SETTING_GROUPS), one row each; Enter changes it.
 *  Each heading is a row too: Enter opens or closes its group (S.settingsOpen, all closed at first, the first heading
 *  focused); a closed one shows its values in short on its line, and ↑↓ skip its rows (they aren't drawn). Every box and pick list has a Cancel button (x), and
 *  Enter on an empty edit box cancels it too; Back (b) goes to the board list. None of it needs Esc, which
 *  doesn't reach the panel from a text box. */
export async function settingsPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, act, C, header, footer, heading } = pane
  // every setting comes from the panel's view of the board (publish in lead.ts puts them there)
  const v = pane.v
  const { builtIn, project, broken } = await roleLists(claudeHost($))
  const roles = mergeRoles(builtIn, project)
  const openedBroken = roleView.open ? broken.find(b => b.name === roleView.open) : undefined
  if (openedBroken) return brokenRolePage($, pane, openedBroken, builtIn)
  const opened = roleView.open ? roles.find(r => r.name === roleView.open) : undefined
  if (roleView.open && !opened) resetRoleOpen()
  if (opened && roleView.draft) return roleEditPage($, pane, opened, defSource(opened.name, builtIn, project))
  if (opened && roleView.prompt) return rolePromptPage($, pane, opened, roleView.prompt)
  if (opened) return rolePage($, pane, opened, defSource(opened.name, builtIn, project)!, { names: roles.map(r => r.name), changes: changesOfRole(opened.name, builtIn, project), at: await roleFileDay(claudeHost($), opened.name), checker: checkerOn(v) })
  if (roleView.list) return rolesPage($, pane, roles, builtIn, project, broken)
  const kl = await kindLists(claudeHost($))
  const kinds = mergeKinds(kl.builtIn, kl.project)
  const openedKind = kindView.open ? findKind(kinds, kindView.open) : undefined
  const openedBrokenKind = kindView.open ? brokenNamed(kl.broken, kindView.open) : undefined
  if (kindView.open && !openedKind && !openedBrokenKind) ((kindView.open = ''), (kindView.draft = null), (kindView.confirmRemove = false))
  if (openedKind && kindView.draft && !openedBrokenKind) return kindEditPage($, pane, defSource(openedKind.name, kl.builtIn, kl.project))
  if (openedKind || openedBrokenKind) return kindPage($, pane, openedBrokenKind ? undefined : openedKind, openedKind ? defSource(openedKind.name, kl.builtIn, kl.project) : undefined, openedBrokenKind, kl.builtIn)
  if (kindView.list) return kindsPage($, pane, kinds, kl.builtIn, kl.project, kl.broken)
  const offCount = roles.filter(r => r.off && !isCheckerRole(r.name)).length
  const rolesCount = `${roles.length} role${roles.length === 1 ? '' : 's'}${offCount ? ` · ${offCount} off` : ''}`
  const kindsOff = kinds.filter(k => k.off).length
  const kindsCount = `${kinds.length} task type${kinds.length === 1 ? '' : 's'}${kindsOff ? ` · ${kindsOff} off` : ''}`
  const cancel = () => ((S.settingEdit = null), (S.settingPick = null), $.ui.invalidate('ui.render'))
  const cancelButton = <Button key="setting-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
  const saveIt = (input: SettingsInput) => act(async () => {
    const r = await ownerSettings(claudeHost($), input, 'from the board')
    S.settingEdit = null
    S.settingPick = null
    $.ui.toast(S.N.toast(r))
    $.ui.invalidate('ui.render')
  })
  /** Enter on a row: on/off flips, mode, notify, scout_findings and tests_with_changes open a pick list, the rest an edit box. */
  const pressRow = (name: SettingName) => act(async () => {
    const info = SETTINGS.find(x => x.name === name)!
    const now = settingValue(viewAsBoard(v), name)
    if (info.kind === 'onoff') return saveIt({ [name]: now !== 'on' })()
    S.settingEdit = null
    S.settingPick = null
    const options = settingChoices(name, v.notify_choices)
    if (options.length) S.settingPick = { name, options }
    else S.settingEdit = { name, value: now === 'none' && info.kind === 'commands' ? '' : now, error: '' }
    $.ui.invalidate('ui.render')
  })
  const editBox = (name: SettingName) => {
    if (S.settingEdit?.name !== name) return null
    const ed = S.settingEdit
    const info = SETTINGS.find(x => x.name === name)!
    return (
      <Box key={`setting-box-${name}`} flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
        <Input
          key="setting-edit"
          label={name}
          value={ed.value}
          placeholder={info.kind === 'commands' ? 'e.g. cd web && npm test, or none' : `a whole number, ${info.range}`}
          autoFocus
          onInput={value => void (ed.value = value)}
          onSubmit={value => {
            if (!value.trim()) return cancel()
            const r = parseSettingValue(name, value)
            if (r.ok === false) return void ((ed.error = r.message), $.ui.invalidate('ui.render'))
            saveIt(r.input)()
          }}
        />
        {ed.error ? <Text color={C('error')}>{ed.error}</Text> : null}
        {cancelButton}
        {info.kind === 'commands' ? <Text color={C('inactive')}>the line runs as one shell command · several: ["npm test", "npm run lint"] · none clears them</Text> : null}
        <Text color={C('inactive')}>{boxHint('Enter saves')}</Text>
      </Box>
    )
  }
  const pickBox = (name: SettingName) => {
    if (S.settingPick?.name !== name) return null
    const now = settingValue(viewAsBoard(v), name)
    return (
      <Box key={`setting-pick-${name}`} flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
        {S.settingPick.options.map(o => (
          <Button key={`pick:${o}`} autoFocus={o === now ? true : undefined} onPress={saveIt({ [name]: o })}>
            <Text bold={o === now} color={C(o === now ? 'ide' : 'text')}>{o === now ? `● ${settingShown(name, o)}` : `○ ${settingShown(name, o)}`}</Text>
          </Button>
        ))}
        {cancelButton}
        <Text color={C('inactive')}>{pickHint('x')}</Text>
      </Box>
    )
  }
  /** Enter on a heading: opens or closes its group (and closes a box or pick list left open in it). */
  const toggleGroup = (title: string) => () => {
    const open = S.settingsOpen.includes(title)
    S.settingsOpen = open ? S.settingsOpen.filter(t => t !== title) : [...S.settingsOpen, title]
    const g = SETTING_GROUPS.find(x => x.title === title)
    const inIt = (n?: string) => !!n && !!g?.items.includes(n as SettingName)
    if (open && (inIt(S.settingEdit?.name) || inIt(S.settingPick?.name))) ((S.settingEdit = null), (S.settingPick = null))
    $.ui.invalidate('ui.render')
  }
  // T-1042: the row's label, dot leaders, then the value in one column; the focused row's help is under the list
  const labelWidth = Math.max(...SETTINGS.map(x => x.label.length), 'Task types'.length)
  const focusedKey = arrows.focused
  const dots = (label: string) => ` ${'.'.repeat(Math.max(2, labelWidth - label.length + 2))} `
  const mark = (key: string) => (focusedKey === key ? '› ' : '  ')
  const settingRow = (name: SettingName) => {
    const x = SETTINGS.find(s => s.name === name)!
    const key = row(`setting:${x.name}`)
    return [
      <Button key={key} plain label={`${x.label}: ${settingRowValue(x.name, settingValue(viewAsBoard(v), x.name))}`} onPress={pressRow(x.name)}>
        <Text color={C('text')}>{`${mark(key)}${x.label}`}</Text>
        <Text color={C('inactive')}>{dots(x.label)}</Text>
        <Text bold color={C('claude')}>{settingRowValue(x.name, settingValue(viewAsBoard(v), x.name))}</Text>
        {x.name === 'notify' && cantPlayNotify(v) ? <Text color={C('warning')}> (can't play here: nothing plays)</Text> : null}
      </Button>,
      ...[editBox(x.name), pickBox(x.name)].filter(Boolean),
    ]
  }
  const openRoles = () => ((S.settingEdit = null), (S.settingPick = null), (roleView.list = true), $.ui.invalidate('ui.render'))
  const openKinds = () => ((S.settingEdit = null), (S.settingPick = null), (kindView.list = true), $.ui.invalidate('ui.render'))
  // VS Code's side panel: groups as headings, a Select or a box per setting, no key hints (see vscode-settings.tsx)
  if (pane.vscode) return settingsPageVs($, pane, { rolesCount, kindsCount, save: saveIt, openRoles, openKinds })
  const pageRow = (page: SettingPage) => {
    const isRoles = page === 'roles'
    const label = isRoles ? 'Roles' : 'Task types'
    const count = isRoles ? rolesCount : kindsCount
    const key = row(isRoles ? 'settings-roles' : 'settings-kinds')
    return (
      <Button key={key} plain label={`${label}: ${count}`} onPress={isRoles ? openRoles : openKinds}>
        <Text color={C('text')}>{`${mark(key)}${label}`}</Text>
        <Text color={C('inactive')}>{dots(label)}</Text>
        <Text bold color={C('claude')}>{count}</Text>
      </Button>
    )
  }
  const groupWidth = Math.max(...SETTING_GROUPS.map(g => g.title.length)) + 3
  // the help for the focused row: a setting's meaning, then its name, default and range; a heading's hint; the first heading before any focus
  const helpOf = (): { lines: string[]; name: string } => {
    const k = focusedKey ?? row(`group:${SETTING_GROUPS[0]!.title}`)
    if (k.startsWith('setting:')) {
      const x = SETTINGS.find(s => s.name === k.slice(8))
      if (x) return { name: x.label, lines: [x.meaning, `${x.name} · default ${x.default} · ${x.range}`] }
    }
    if (k === 'settings-roles') return { name: 'Roles', lines: ['The worker roles: open, edit, turn off or add one.'] }
    if (k === 'settings-kinds') return { name: 'Task types', lines: ['The kinds of task: open, edit, turn off or add one.'] }
    const g = SETTING_GROUPS.find(x => `group:${x.title}` === k)
    return { name: g?.title ?? '', lines: g ? [groupHint(g.title)] : [] }
  }
  const help = helpOf()
  return (
    <Box flexDirection="column">
      {header('settings')}
      {SETTING_GROUPS.flatMap((g, gi) => {
        const open = S.settingsOpen.includes(g.title)
        const sum = groupSummaryParts(g, viewAsBoard(v), Math.max(20, pane.width - 4), { roles: rolesCount, kinds: kindsCount })
        const gKey = `group:${g.title}`
        const shortSum = sum.values.replace(/^ · /, '')
        const label = open ? `▾ ${g.title}` : `▸ ${sum.title}${sum.values}`
        return [
          ...(gi ? [<Text key={`group-blank:${g.title}`}> </Text>] : []),
          <Button key={row(`group:${g.title}`)} plain label={label} autoFocus={gi === 0 && !S.settingEdit && !S.settingPick ? true : undefined} onPress={toggleGroup(g.title)}>
            <Text bold color={C('text')}>{open ? `▾ ${g.title}` : `▸ ${sum.title.padEnd(groupWidth)}`}</Text>
            {open || !shortSum ? null : <Text color={C('inactive')}>{shortSum}</Text>}
          </Button>,
          ...(open ? g.items.flatMap(item => (isSettingPage(item) ? [pageRow(item)] : settingRow(item))) : []),
        ]
      })}
      <Text key="settings-blank"> </Text>
      <Text key="settings-rule" color={C('inactive')}>{'─'.repeat(Math.max(10, Math.min(60, pane.width - 2)))}</Text>
      {help.name ? <Text key="settings-help-name" bold color={C('text')}>{help.name}</Text> : null}
      {help.lines.map((l, i) => (
        <Text key={`settings-help-${i}`} wrap="wrap" color={C('inactive')}>{l}</Text>
      ))}
      <Text key="settings-back-blank"> </Text>
      <Button key="settings-back" label="Back (b)" hotkey="b" onPress={act(() => resetPane(claudeHost($), 'tasks'))} />
      {footer(settingsKeys(headingFocused(arrows.focused)), 'settings-keys')}
    </Box>
  )
}

/** Forgets the opened role (it is gone, e.g. its file was removed by hand). */
function resetRoleOpen() {
  roleView.open = ''
  roleView.draft = null
  roleView.confirmRemove = false
  roleView.prompt = ''
}
