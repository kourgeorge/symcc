// The board panel's Settings view.
import { SETTINGS, SCOUT_FINDINGS_CHOICES, type SettingsInput, type SettingName, settingValue, parseSettingValue, settingsKeys, boxHint, pickHint, type RoleDef, type RoleSource, DEFAULT_ROLE, mergeRoles, roleSource, roleSourceLabel, roleKeys, roleEditKeys, rolesKeys, type BrokenRole, brokenNamed, brokenRoleLabel, roleNamed, roleNameError } from '../../board'
import { type $, S } from '../state'
import { resetPane } from './open'
import { ownerSettings } from '../tools'
import { load } from '../store'
import { roleLists, roleView, roleDraftOf, saveRoleDraft, newRoleFile, changeRole } from '../roles'
import type { PaneParts } from './parts'

/** A role's file as the panel names it: .<name>/roles/<role>.md. */
const roleFileOf = (name: string) => `${S.N.dir}/roles/${name}.md`

/** A role's edit mode in Settings: the same header as its page, then Save and Cancel (x), then a box per part of its
 *  file, named and ordered as the page shows them: Description, Model, Skills, Tools, Checklist. Its boxes take every letter
 *  and Esc doesn't reach the panel from a text box, so Cancel is the way out. */
function roleEditPage($: $, pane: PaneParts, source: RoleSource | undefined) {
  const { Box, Text, Button, Input, act, C, heading, footer } = pane
  const d = roleView.draft!
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
        <Text color={C('subtle')}>save writes {roleFileOf(d.role)}{source === 'built-in' ? ' (a copy of the built-in role; Reset to built-in undoes it)' : ''}</Text>
        <Text color={C('subtle')}>the name is the file's name: to rename the role, rename {roleFileOf(d.role)}</Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="role-save" label="Save" onPress={act(async () => {
          const said = await saveRoleDraft($)
          if (said) $.ui.toast(S.N.toast(said))
        })} />
        <Button key="role-edit-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
      </Box>
      {d.error ? <Text color={C('error')}>{d.error}</Text> : null}
      {box('description', 'Description', 'what the role is for, in a few words', { autoFocus: true })}
      {box('model', 'Model', "empty: the session's model")}
      {box('skills', 'Skills', 'skill names joined with ", " (empty: none)')}
      {box('tools', 'Tools', 'extra tools: WebSearch, WebFetch (empty: none)')}
      {box('checklist', 'Checklist', 'what a worker with this role checks, one line each', { rows: 8 })}
      {footer(roleEditKeys(), 'role-edit-keys')}
    </Box>
  )
}

/** One role's page (opened from the Roles page; Back returns there): its front matter and checklist, with Back, Edit, Turn off / on (not for general),
 *  Reset to built-in (a replaced built-in only) and Remove (an added role only, after a confirm step). */
function rolePage($: $, pane: PaneParts, r: RoleDef, source: RoleSource) {
  const { Box, Text, Button, act, C, heading, footer, buttonRows, paragraphs } = pane
  const run = (input: Parameters<typeof changeRole>[1], after?: () => void) => act(async () => {
    const res = await changeRole($, input)
    if (res.ok && after) after()
    roleView.confirmRemove = false
    $.ui.toast(S.N.toast(res.text))
    $.ui.invalidate('ui.render')
  })
  const canOff = r.name.toLowerCase() !== DEFAULT_ROLE
  const canReset = source === 'replaced'
  const canRemove = source === 'added'
  // one section per part of the file, named as the edit page's boxes; the description is the subheader
  const section = (title: string, value: string | undefined, none: string) => (
    <Box flexDirection="column">
      {heading(title)}
      {value ? <Text color={C('text')}>{`  ${value}`}</Text> : <Text color={C('subtle')}>{`  ${none}`}</Text>}
    </Box>
  )
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C(r.off ? 'subtle' : 'claude')}>{r.name}</Text>
          <Text color={C(r.off ? 'warning' : 'subtle')}> · {roleSourceLabel(source, r.off)}</Text>
        </Text>
        <Text bold color={C('text')}>{r.description}</Text>
        {r.warning ? <Text color={C('warning')}>{r.warning}</Text> : null}
      </Box>
      {buttonRows([
        <Button key="role-back" label="Back" hotkey="b" autoFocus={roleView.confirmRemove ? undefined : true} onPress={() => ((roleView.open = ''), (roleView.confirmRemove = false), $.ui.invalidate('ui.render'))} />,
        <Button key="role-edit" label="Edit" hotkey="e" onPress={() => ((roleView.draft = roleDraftOf(r)), (roleView.confirmRemove = false), $.ui.invalidate('ui.render'))} />,
        canOff && <Button key="role-off" label={r.off ? 'Turn on' : 'Turn off'} hotkey="o" onPress={run({ action: r.off ? 'on' : 'off', name: r.name })} />,
        canReset && <Button key="role-reset" label="Reset to built-in" hotkey="r" onPress={run({ action: 'reset', name: r.name })} />,
        canRemove && <Button key="role-remove" label="Remove" hotkey="d" onPress={() => ((roleView.confirmRemove = true), $.ui.invalidate('ui.render'))} />,
      ], 'role-buttons')}
      {roleView.confirmRemove && canRemove ? (
        <Box key="role-remove-box" flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
          <Text color={C('warning')}>Remove role {r.name} and delete {roleFileOf(r.name)}?</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="role-remove-yes" label="Yes, remove (y)" hotkey="y" autoFocus onPress={run({ action: 'remove', name: r.name }, () => (roleView.open = ''))} />
            <Button key="role-remove-cancel" label="Cancel (x)" hotkey="x" onPress={() => ((roleView.confirmRemove = false), $.ui.invalidate('ui.render'))} />
          </Box>
        </Box>
      ) : null}
      {section('Model', r.model, "(none: the session's model)")}
      {section('Skills', r.skills.join(', '), '(none)')}
      {section('Tools', (r.tools ?? []).join(', '), '(none: the base tools only)')}
      <Box flexDirection="column">
        {heading('Checklist')}
        {r.prompt.trim() ? paragraphs(r.prompt.trim()) : <Text color={C('subtle')}>(none: a plain worker)</Text>}
      </Box>
      <Box flexDirection="column">
        {heading('File')}
        <Text>
          {'  '}
          <Text color={C('autoAccept')}>{source === 'built-in' ? `roles/${r.name}.md (in the plugin; Edit copies it to ${roleFileOf(r.name)})` : roleFileOf(r.name)}</Text>
        </Text>
      </Box>
      {footer(roleKeys({ canEdit: true, canOff, off: !!r.off, canReset, canRemove }), 'role-keys')}
    </Box>
  )
}

/** The page of a role whose file can't be read: why, then only what works: Reset to built-in (a built-in's name) or Remove
 *  (an added role, after a confirm step). The edit page can't load a broken file, so it is fixed by hand. */
function brokenRolePage($: $, pane: PaneParts, b: BrokenRole, builtIn: RoleDef[]) {
  const { Box, Text, Button, act, C, heading, footer, buttonRows } = pane
  const run = (input: Parameters<typeof changeRole>[1]) => act(async () => {
    const res = await changeRole($, input)
    if (res.ok) roleView.open = ''
    roleView.confirmRemove = false
    $.ui.toast(S.N.toast(res.text))
    $.ui.invalidate('ui.render')
  })
  const okName = !roleNameError(b.name)
  const canReset = okName && !!roleNamed(builtIn, b.name)
  const canRemove = okName && !canReset
  const out = canReset ? 'Reset to built-in deletes it (the built-in role is used meanwhile)' : canRemove ? 'Remove deletes it' : ''
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('subtle')}>{b.name}</Text>
          <Text color={C('error')}> · {brokenRoleLabel(b)}</Text>
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

/** The Roles page, opened from Settings' Roles row: one row per role (Enter opens it), + New role (n) and Back (b)
 *  to Settings. The New role box has a Cancel button (x), and Enter on it empty cancels it too. */
function rolesPage($: $, pane: PaneParts, roles: RoleDef[], builtIn: RoleDef[], project: RoleDef[], broken: BrokenRole[]) {
  const { Box, Text, Button, Input, act, C, header, footer, heading } = pane
  const cancel = () => ((roleView.naming = null), $.ui.invalidate('ui.render'))
  const nameW = Math.max(0, ...roles.map(r => r.name.length), ...broken.map(b => b.name.length))
  const openRow = (name: string) => () => ((roleView.open = name), (roleView.confirmRemove = false), (roleView.naming = null), $.ui.invalidate('ui.render'))
  /** A role whose file can't be read: "tester — your file can't be read: no description". */
  const brokenRow = (b: BrokenRole, first: boolean) => (
    <Button key={`roleRow:${b.name}`} label={`${b.name} — ${brokenRoleLabel(b)}`} autoFocus={first && !roleView.naming ? true : undefined} onPress={openRow(b.name)}>
      <Text bold color={C('subtle')}>{`  ${b.name.padEnd(nameW)}`}</Text>
      <Text color={C('error')}>{` — ${brokenRoleLabel(b)}`}</Text>
    </Button>
  )
  /** "New role": a button, or (once pressed) the box that asks for its name; Enter on it empty, or its Cancel button (x), leaves it. */
  const newRoleBox = () =>
    roleView.naming ? (
      <Box key="role-new-box" flexDirection="column">
        <Input
          key="role-new-name"
          label="New role's name"
          placeholder="letters, digits, - and _"
          value={roleView.naming.name}
          autoFocus
          submitLabel="make it"
          onInput={value => void (roleView.naming && (roleView.naming.name = value))}
          onSubmit={value => (value.trim() ? act(async () => {
            const said = await newRoleFile($, value)
            if (said) $.ui.toast(S.N.toast(said))
          })() : cancel())}
        />
        {roleView.naming.error ? <Text color={C('error')}>{roleView.naming.error}</Text> : null}
        <Button key="role-new-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
        <Text color={C('subtle')}>{boxHint(`Enter makes ${S.N.dir}/roles/<name>.md and opens it`)}</Text>
      </Box>
    ) : (
      <Button key="role-new" label="+ New role" hotkey="n" onPress={() => ((roleView.naming = { name: '', error: '' }), $.ui.invalidate('ui.render'))}>
        <Text color={C('text')}>{'  + New role'}</Text>
      </Button>
    )
  return (
    <Box flexDirection="column">
      {header()}
      {heading('Roles')}
      {roles.map((r, i) => {
        const bad = brokenNamed(broken, r.name)
        if (bad) return brokenRow(bad, i === 0)
        const source = roleSource(r.name, builtIn, project)!
        return (
          <Button key={`roleRow:${r.name}`} label={`${r.name}: ${roleSourceLabel(source, r.off)}${r.warning ? ' ⚠' : ''}`} autoFocus={i === 0 && !roleView.naming ? true : undefined} onPress={openRow(r.name)}>
            <Text bold={!r.off} color={C(r.off ? 'subtle' : 'claude')}>{`  ${r.name.padEnd(nameW)}`}</Text>
            <Text color={C(r.off ? 'warning' : 'subtle')}>{` ${roleSourceLabel(source, r.off)}`}</Text>
            <Text color={C(r.off ? 'subtle' : 'text')}>{` · ${r.description}`}</Text>
            {r.warning ? <Text color={C('warning')}>{' ⚠'}</Text> : null}
          </Button>
        )
      })}
      {broken.filter(b => !roleNamed(roles, b.name)).map((b, i) => brokenRow(b, !roles.length && i === 0))}
      {newRoleBox()}
      <Text color={C('subtle')}>Enter opens a role · n makes a new one · or tell the lead</Text>
      <Text key="roles-page-blank"> </Text>
      <Button key="roles-back" label="Back (b)" hotkey="b" onPress={() => ((roleView.list = false), (roleView.naming = null), $.ui.invalidate('ui.render'))} />
      {footer(rolesKeys(), 'roles-keys')}
    </Box>
  )
}

/** The Settings view: one row per setting; Enter changes it. Every box and pick list has a Cancel button (x), and
 *  Enter on an empty edit box cancels it too; Back (b) goes to the board list. None of it needs Esc, which
 *  doesn't reach the panel from a text box. */
export async function settingsPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, act, C, header, footer } = pane
  // scout_findings is not in the panel's view of the board: read it from the board file
  const v = { ...pane.v, scout_findings: (await load($).catch(() => null))?.scout_findings }
  const { builtIn, project, broken } = await roleLists($)
  const roles = mergeRoles(builtIn, project)
  const openedBroken = roleView.open ? broken.find(b => b.name === roleView.open) : undefined
  if (openedBroken) return brokenRolePage($, pane, openedBroken, builtIn)
  const opened = roleView.open ? roles.find(r => r.name === roleView.open) : undefined
  if (roleView.open && !opened) resetRoleOpen()
  if (opened && roleView.draft) return roleEditPage($, pane, roleSource(opened.name, builtIn, project))
  if (opened) return rolePage($, pane, opened, roleSource(opened.name, builtIn, project)!)
  if (roleView.list) return rolesPage($, pane, roles, builtIn, project, broken)
  const nameWidth = Math.max(...SETTINGS.map(x => x.name.length))
  const offCount = roles.filter(r => r.off).length
  const rolesCount = `${roles.length} role${roles.length === 1 ? '' : 's'}${offCount ? ` · ${offCount} off` : ''}`
  const cancel = () => ((S.settingEdit = null), (S.settingPick = null), $.ui.invalidate('ui.render'))
  const cancelButton = <Button key="setting-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
  const saveIt = (input: SettingsInput) => act(async () => {
    const r = await ownerSettings($, input, 'from the board')
    S.settingEdit = null
    S.settingPick = null
    $.ui.toast(S.N.toast(r))
    $.ui.invalidate('ui.render')
  })
  /** Enter on a row: on/off flips, mode, notify and scout_findings open a pick list, the rest an edit box. */
  const pressRow = (name: SettingName) => act(async () => {
    const info = SETTINGS.find(x => x.name === name)!
    const now = settingValue(v, name)
    if (info.kind === 'onoff') return saveIt({ [name]: now !== 'on' })()
    S.settingEdit = null
    S.settingPick = null
    if (info.kind === 'mode') S.settingPick = { name, options: ['off', 'review', 'auto'] }
    else if (info.kind === 'findings') S.settingPick = { name, options: [...SCOUT_FINDINGS_CHOICES] }
    // only what this machine can play (off always)
    else if (info.kind === 'notify') S.settingPick = { name, options: v.notify_choices?.length ? v.notify_choices : ['off'] }
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
          placeholder={info.kind === 'commands' ? 'e.g. npm test && npm run lint, or none' : `a whole number, ${info.range}`}
          autoFocus
          onInput={value => void (ed.value = value)}
          onSubmit={value => {
            if (!value.trim()) return cancel()
            const r = parseSettingValue(name, value)
            if (!r.ok) return void ((ed.error = r.message), $.ui.invalidate('ui.render'))
            saveIt(r.input)()
          }}
        />
        {ed.error ? <Text color={C('error')}>{ed.error}</Text> : null}
        {cancelButton}
        {info.kind === 'commands' ? <Text color={C('subtle')}>join commands with " && " · none clears them</Text> : null}
        <Text color={C('subtle')}>{boxHint('Enter saves')}</Text>
      </Box>
    )
  }
  const pickBox = (name: SettingName) => {
    if (S.settingPick?.name !== name) return null
    const now = settingValue(v, name)
    return (
      <Box key={`setting-pick-${name}`} flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
        {S.settingPick.options.map(o => (
          <Button key={`pick:${o}`} autoFocus={o === now ? true : undefined} onPress={saveIt({ [name]: o })}>
            <Text bold={o === now} color={C(o === now ? 'ide' : 'text')}>{o === now ? `● ${o}` : `○ ${o}`}</Text>
          </Button>
        ))}
        {cancelButton}
        <Text color={C('subtle')}>{pickHint('x')}</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      {header()}
      {SETTINGS.flatMap((x, i) => [
        <Button key={`setting:${x.name}`} autoFocus={i === 0 && !S.settingEdit && !S.settingPick ? true : undefined} onPress={pressRow(x.name)}>
          <Text bold color={C('claude')}>{x.name.padEnd(nameWidth)}</Text>
          <Text bold color={C('text')}> {settingValue(v, x.name)}</Text>
          {x.name === 'notify' && v.notify_choices && v.notify && !v.notify_choices.includes(v.notify) ? <Text color={C('warning')}> (can't play here: nothing plays)</Text> : null}
          <Text color={C('subtle')}> · default {x.default} · {x.range} · {x.meaning}</Text>
        </Button>,
        ...[editBox(x.name), pickBox(x.name)].filter(Boolean),
      ])}
      <Text color={C('subtle')}>Enter changes a setting (on/off flips) · /{S.N.name}-settings NAME VALUE · or tell the lead</Text>
      <Text key="roles-blank"> </Text>
      <Button key="settings-roles" label={`Roles: ${rolesCount}`} onPress={() => ((S.settingEdit = null), (S.settingPick = null), (roleView.list = true), $.ui.invalidate('ui.render'))}>
        <Text bold color={C('claude')}>{'Roles'.padEnd(nameWidth)}</Text>
        <Text bold color={C('text')}> {rolesCount}</Text>
        <Text color={C('subtle')}> · Enter opens the Roles page: the worker roles, to open, edit, turn off or add</Text>
      </Button>
      <Text key="settings-blank"> </Text>
      <Button key="settings-back" label="Back (b)" hotkey="b" onPress={act(() => resetPane($, 'tasks'))} />
      {footer(settingsKeys(), 'settings-keys')}
    </Box>
  )
}

/** Forgets the opened role (it is gone, e.g. its file was removed by hand). */
function resetRoleOpen() {
  roleView.open = ''
  roleView.draft = null
  roleView.confirmRemove = false
}
