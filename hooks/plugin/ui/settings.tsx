// The board panel's Settings view.
import { SETTINGS, SCOUT_FINDINGS_CHOICES, TESTS_WITH_CHANGES_CHOICES, type SettingsInput, type SettingName, settingValue, parseSettingValue, settingsKeys, boxHint, pickHint, type RoleDef, type RoleSource, DEFAULT_ROLE, mergeRoles, roleSource, roleSourceLabel, roleKeys, roleEditKeys, rolesKeys, type BrokenRole, brokenNamed, brokenRoleLabel, roleNamed, roleNameError, type PromptKind, PROMPT_KINDS, PROMPT_ABOUT, PROMPT_PLACEHOLDERS, BUILT_IN_PROMPTS, promptProblems, promptSource, promptFileOf, builtInPromptFile, promptsKeys, promptKeys, promptEditKeys } from '../../board'
import { type $, S } from '../state'
import { resetPane } from './open'
import { ownerSettings } from '../tools'
import { load } from '../store'
import { roleLists, roleView, roleDraftOf, saveRoleDraft, newRoleFile, changeRole } from '../roles'
import { loadPrompts, promptView, savePromptDraft, changePrompt } from '../prompts'
import type { PaneParts } from './parts'
import { row } from './arrows'

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
        <Text color={C('inactive')}>save writes {roleFileOf(d.role)}{source === 'built-in' ? ' (a copy of the built-in role; Reset to built-in undoes it)' : ''}</Text>
        <Text color={C('inactive')}>the name is the file's name: to rename the role, rename {roleFileOf(d.role)}</Text>
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
      {value ? <Text color={C('text')}>{`  ${value}`}</Text> : <Text color={C('inactive')}>{`  ${none}`}</Text>}
    </Box>
  )
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C(r.off ? 'inactive' : 'claude')}>{r.name}</Text>
          <Text color={C(r.off ? 'warning' : 'inactive')}> · {roleSourceLabel(source, r.off)}</Text>
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
        {r.prompt.trim() ? paragraphs(r.prompt.trim()) : <Text color={C('inactive')}>(none: a plain worker)</Text>}
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
          <Text bold color={C('inactive')}>{b.name}</Text>
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
    <Button key={row(`roleRow:${b.name}`)} plain label={`${b.name} — ${brokenRoleLabel(b)}`} autoFocus={first && !roleView.naming ? true : undefined} onPress={openRow(b.name)}>
      <Text bold color={C('inactive')}>{`  ${b.name.padEnd(nameW)}`}</Text>
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
        <Text color={C('inactive')}>{boxHint(`Enter makes ${S.N.dir}/roles/<name>.md and opens it`)}</Text>
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
          <Button key={row(`roleRow:${r.name}`)} plain label={`${r.name}: ${roleSourceLabel(source, r.off)}${r.warning ? ' ⚠' : ''}`} autoFocus={i === 0 && !roleView.naming ? true : undefined} onPress={openRow(r.name)}>
            <Text bold={!r.off} color={C(r.off ? 'inactive' : 'claude')}>{`  ${r.name.padEnd(nameW)}`}</Text>
            <Text color={C(r.off ? 'warning' : 'inactive')}>{` ${roleSourceLabel(source, r.off)}`}</Text>
            <Text color={C(r.off ? 'inactive' : 'text')}>{` · ${r.description}`}</Text>
            {r.warning ? <Text color={C('warning')}>{' ⚠'}</Text> : null}
          </Button>
        )
      })}
      {broken.filter(b => !roleNamed(roles, b.name)).map((b, i) => brokenRow(b, !roles.length && i === 0))}
      {newRoleBox()}
      <Text color={C('inactive')}>Enter opens a role · n makes a new one · or tell the lead</Text>
      <Text key="roles-page-blank"> </Text>
      <Button key="roles-back" label="Back (b)" hotkey="b" onPress={() => ((roleView.list = false), (roleView.naming = null), $.ui.invalidate('ui.render'))} />
      {footer(rolesKeys(), 'roles-keys')}
    </Box>
  )
}

// ---------------- the Prompts page ----------------

/** One prompt's edit mode: one big box with the whole text, Save and Cancel (x). The box takes every letter, so Cancel is the way out. */
function promptEditPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, act, C, heading, footer } = pane
  const d = promptView.draft!
  const cancel = () => ((promptView.draft = null), $.ui.invalidate('ui.render'))
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('claude')}>{d.kind} prompt</Text> <Text bold color={C('warning')}>editing</Text>
        </Text>
        <Text color={C('inactive')}>save writes {promptFileOf(S.N.dir, d.kind)} · keep the {'{{placeholders}}'}; {'{{details}}'} and {'{{ask}}'} are needed</Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="prompt-save" label="Save" onPress={act(async () => {
          const said = await savePromptDraft($)
          if (said) $.ui.toast(S.N.toast(said))
        })} />
        <Button key="prompt-edit-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
      </Box>
      {d.error ? <Text color={C('error')}>{d.error}</Text> : null}
      <Box flexDirection="column">
        {heading('Text')}
        <Input key="prompt-text" value={d.text} placeholder="the whole prompt" submitLabel="keep" rows={20} autoFocus onInput={value => void (d.text = value)} onSubmit={value => void (d.text = value)} />
      </Box>
      {footer(promptEditKeys(), 'prompt-edit-keys')}
    </Box>
  )
}

/** One prompt's page (opened from the Prompts page; Back returns there): where it comes from, what is wrong with it, its placeholders
 *  and its text, with Back, Edit and Reset to built-in (only when it is the owner's). */
function promptPage($: $, pane: PaneParts, kind: PromptKind, own: Partial<Record<PromptKind, string>>) {
  const { Box, Text, Button, act, C, heading, footer, buttonRows } = pane
  const source = promptSource(own, kind)
  const hasFile = own[kind] !== undefined
  const text = source === 'yours' ? own[kind]! : BUILT_IN_PROMPTS[kind]
  const problems = hasFile ? promptProblems(kind, own[kind]!) : []
  const reset = act(async () => {
    const r = await changePrompt($, { action: 'reset', name: kind })
    $.ui.toast(S.N.toast(r.text))
    $.ui.invalidate('ui.render')
  })
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold color={C('claude')}>{kind} prompt</Text>
          <Text color={C('inactive')}> · {source}</Text>
        </Text>
        <Text color={C('inactive')}>{PROMPT_ABOUT[kind]}</Text>
      </Box>
      {buttonRows([
        <Button key="prompt-back" label="Back" hotkey="b" autoFocus onPress={() => ((promptView.open = ''), $.ui.invalidate('ui.render'))} />,
        <Button key="prompt-edit" label="Edit" hotkey="e" onPress={() => ((promptView.draft = { kind, text, error: '' }), $.ui.invalidate('ui.render'))} />,
        hasFile && <Button key="prompt-reset" label="Reset to built-in" hotkey="r" onPress={reset} />,
      ], 'prompt-buttons')}
      {problems.map((p, i) => <Text key={`prompt-problem-${i}`} color={C('warning')}>⚠ {p}</Text>)}
      <Box flexDirection="column">
        {heading('File')}
        <Text color={C('autoAccept')}>{source === 'yours' ? promptFileOf(S.N.dir, kind) : `${builtInPromptFile(kind)}; Edit copies it to ${promptFileOf(S.N.dir, kind)}`}</Text>
      </Box>
      <Box flexDirection="column">
        {heading('Placeholders')}
        {Object.entries(PROMPT_PLACEHOLDERS[kind]).map(([p, m]) => (
          <Text key={`prompt-holder-${p}`}>
            <Text bold color={C('ide')}>{`{{${p}}}`}</Text>
            <Text color={C('inactive')}> {m}</Text>
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        {heading('Text')}
        {text.trimEnd().split('\n').map((line, i) => <Text key={`prompt-line-${i}`}>{line || ' '}</Text>)}
      </Box>
      {footer(promptKeys(hasFile), 'prompt-keys')}
    </Box>
  )
}

/** The Prompts page, opened from Settings' Prompts row: one row per prompt (Enter opens it) and Back (b) to Settings. */
function promptsPage($: $, pane: PaneParts, own: Partial<Record<PromptKind, string>>) {
  const { Box, Text, Button, C, header, footer } = pane
  const nameW = Math.max(...PROMPT_KINDS.map(k => k.length))
  return (
    <Box flexDirection="column">
      {header()}
      <Text bold color={C('suggestion')}>▍Prompts</Text>
      {PROMPT_KINDS.map((k, i) => {
        const source = promptSource(own, k)
        const warn = own[k] !== undefined && promptProblems(k, own[k]!).length > 0
        return (
          <Button key={row(`promptRow:${k}`)} plain label={`${k}: ${source}${warn ? ' ⚠' : ''}`} autoFocus={i === 0 ? true : undefined} onPress={() => ((promptView.open = k), $.ui.invalidate('ui.render'))}>
            <Text bold color={C('claude')}>{k.padEnd(nameW)}</Text>
            <Text color={C(source === 'yours' ? 'warning' : 'inactive')}>{` ${source}`}</Text>
            {warn ? <Text color={C('warning')}> ⚠</Text> : null}
            <Text color={C('inactive')}>{` · ${PROMPT_ABOUT[k]}`}</Text>
          </Button>
        )
      })}
      <Text color={C('inactive')}>Enter opens a prompt to see, edit or reset it · or tell the lead</Text>
      <Text key="prompts-page-blank"> </Text>
      <Button key="prompts-back" label="Back (b)" hotkey="b" onPress={() => ((promptView.list = false), $.ui.invalidate('ui.render'))} />
      {footer(promptsKeys(), 'prompts-keys')}
    </Box>
  )
}

/** The Settings view: one row per setting; Enter changes it. Every box and pick list has a Cancel button (x), and
 *  Enter on an empty edit box cancels it too; Back (b) goes to the board list. None of it needs Esc, which
 *  doesn't reach the panel from a text box. */
export async function settingsPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, act, C, header, footer } = pane
  // scout_findings and tests_with_changes are not in the panel's view of the board: read them from the board file
  const file = await load($).catch(() => null)
  const v = { ...pane.v, scout_findings: file?.scout_findings, tests_with_changes: file?.tests_with_changes }
  const { builtIn, project, broken } = await roleLists($)
  const roles = mergeRoles(builtIn, project)
  const openedBroken = roleView.open ? broken.find(b => b.name === roleView.open) : undefined
  if (openedBroken) return brokenRolePage($, pane, openedBroken, builtIn)
  const opened = roleView.open ? roles.find(r => r.name === roleView.open) : undefined
  if (roleView.open && !opened) resetRoleOpen()
  if (opened && roleView.draft) return roleEditPage($, pane, roleSource(opened.name, builtIn, project))
  if (opened) return rolePage($, pane, opened, roleSource(opened.name, builtIn, project)!)
  if (roleView.list) return rolesPage($, pane, roles, builtIn, project, broken)
  const own = await loadPrompts($)
  const openedPrompt = promptView.open || undefined
  if (openedPrompt && promptView.draft) return promptEditPage($, pane)
  if (openedPrompt) return promptPage($, pane, openedPrompt, own)
  if (promptView.list) return promptsPage($, pane, own)
  const nameWidth = Math.max(...SETTINGS.map(x => x.name.length))
  const offCount = roles.filter(r => r.off).length
  const rolesCount = `${roles.length} role${roles.length === 1 ? '' : 's'}${offCount ? ` · ${offCount} off` : ''}`
  const yours = PROMPT_KINDS.filter(k => promptSource(own, k) === 'yours')
  const promptsCount = yours.length ? `${yours.join(', ')} yours` : 'built-in'
  const cancel = () => ((S.settingEdit = null), (S.settingPick = null), $.ui.invalidate('ui.render'))
  const cancelButton = <Button key="setting-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
  const saveIt = (input: SettingsInput) => act(async () => {
    const r = await ownerSettings($, input, 'from the board')
    S.settingEdit = null
    S.settingPick = null
    $.ui.toast(S.N.toast(r))
    $.ui.invalidate('ui.render')
  })
  /** Enter on a row: on/off flips, mode, notify, scout_findings and tests_with_changes open a pick list, the rest an edit box. */
  const pressRow = (name: SettingName) => act(async () => {
    const info = SETTINGS.find(x => x.name === name)!
    const now = settingValue(v, name)
    if (info.kind === 'onoff') return saveIt({ [name]: now !== 'on' })()
    S.settingEdit = null
    S.settingPick = null
    if (info.kind === 'mode') S.settingPick = { name, options: ['off', 'review', 'auto'] }
    else if (info.kind === 'findings') S.settingPick = { name, options: [...SCOUT_FINDINGS_CHOICES] }
    else if (info.kind === 'untested') S.settingPick = { name, options: [...TESTS_WITH_CHANGES_CHOICES] }
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
        {info.kind === 'commands' ? <Text color={C('inactive')}>join commands with " && " · none clears them</Text> : null}
        <Text color={C('inactive')}>{boxHint('Enter saves')}</Text>
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
        <Text color={C('inactive')}>{pickHint('x')}</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      {header()}
      {SETTINGS.flatMap((x, i) => [
        <Button key={row(`setting:${x.name}`)} plain autoFocus={i === 0 && !S.settingEdit && !S.settingPick ? true : undefined} onPress={pressRow(x.name)}>
          <Text bold color={C('claude')}>{x.name.padEnd(nameWidth)}</Text>
          <Text bold color={C('text')}> {settingValue(v, x.name)}</Text>
          {x.name === 'notify' && v.notify_choices && v.notify && !v.notify_choices.includes(v.notify) ? <Text color={C('warning')}> (can't play here: nothing plays)</Text> : null}
          <Text color={C('inactive')}> · default {x.default} · {x.range} · {x.meaning}</Text>
        </Button>,
        ...[editBox(x.name), pickBox(x.name)].filter(Boolean),
      ])}
      <Text color={C('inactive')}>Enter changes a setting (on/off flips) · /{S.N.name}-settings NAME VALUE · or tell the lead</Text>
      <Text key="roles-blank"> </Text>
      <Button key={row('settings-roles')} plain label={`Roles: ${rolesCount}`} onPress={() => ((S.settingEdit = null), (S.settingPick = null), (roleView.list = true), $.ui.invalidate('ui.render'))}>
        <Text bold color={C('claude')}>{'Roles'.padEnd(nameWidth)}</Text>
        <Text bold color={C('text')}> {rolesCount}</Text>
        <Text color={C('inactive')}> · Enter opens the Roles page: the worker roles, to open, edit, turn off or add</Text>
      </Button>
      <Button key={row('settings-prompts')} plain label={`Prompts: ${promptsCount}`} onPress={() => ((S.settingEdit = null), (S.settingPick = null), (promptView.list = true), $.ui.invalidate('ui.render'))}>
        <Text bold color={C('claude')}>{'Prompts'.padEnd(nameWidth)}</Text>
        <Text bold color={C('text')}> {promptsCount}</Text>
        <Text color={C('inactive')}> · Enter opens the Prompts page: what every worker is told, to see, edit or reset</Text>
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
