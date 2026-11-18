// The Roles and Kinds pages in VS Code's side panel (see surface.ts and vscode.tsx), opened from Settings. The terminal's
// pages (settings.tsx) line the names up in columns of fixed width inside Buttons and put the actions in a row of
// Buttons; VS Code draws every Button as a filled box that never wraps its label, so those ran into each other. Here:
//   tester   replaced                       (the name a link that opens it, where it comes from as small badges)
//   writes tests that try hard to break …  (its description, dim, wrapped)
// One role's or kind's page: a "← Roles" link back, the name and its badges, the description, the actions as one line of
// links that wraps (Edit · See the prompt · Turn off · Reset to built-in · Remove), then its parts under headings.
// Removing asks first in a box with one "Yes, remove" Button and a Cancel link. The edit pages have one Save Button and a
// Cancel link. No key hints.
import { DEFAULT_ROLE, ROLE_PLACEHOLDERS, ROLE_SLOT, ROLE_PROMPTS, promptsOfRole, roleNameError, kindNameError, isCheckerRole, findKind, ALWAYS_ON_KINDS, type RoleDef, type KindDef, type RolePromptKind } from '../../board'
import { type DefSource, type BrokenDef, defSource, brokenNamed, brokenLabel, defNamed } from '../../core/def-files'
import { S } from '../../app/state'
import { type $ } from '../panel'
import { roleView, roleDraftOf, saveRoleDraft, newRoleFile, changeRole } from '../../app/roles'
import { kindView, kindDraftOf, saveKindDraft, newKindFile, changeKind } from '../../app/kinds'
import type { PaneParts } from './parts'
import { row } from './arrows'
import { claudeHost } from '../host'
import { vsBadge, vsCallout, vsFooter, vsHref, vsLink, mdLink, vsSection } from './vscode'

/** The color of a "where it comes from" badge. */
const SOURCE_TONE: Record<DefSource, string> = { 'built-in': 'inactive', replaced: 'suggestion', added: 'success' }

/** A link that does something on the page (vsHref('do', ...)): its words, its id in the href, what a press does. */
type Action = [label: string, id: string, onPress: () => void]

/** The pieces the Roles and Kinds pages draw with. */
function kit($: $, pane: PaneParts) {
  const { Box, Text, C, vs } = pane
  const redraw = () => $.ui.invalidate('ui.render')
  const plain = (key: string, text: string, color = 'inactive', bold?: true) => (
    <Text key={key} wrap="wrap" bold={bold} color={C(color)}>
      {text}
    </Text>
  )
  /** One line of links that wraps: "Edit · Turn off · Remove". */
  const links = (key: string, actions: (Action | false)[]) => {
    const shown = actions.filter(Boolean) as Action[]
    const href = (id: string) => vsHref('do', `${key}/${id}`)
    return shown.length ? vsLink(vs, key, shown.map(([label, id]) => mdLink(label, href(id))).join('  ·  '), shown.map(([, id, on]) => [href(id), on])) : null
  }
  /** "← Roles": a link back. */
  const back = (key: string, to: string, onPress: () => void) => {
    const href = vsHref('page', `back/${key}`)
    return vsLink(vs, key, mdLink(`← ${to}`, href), [[href, onPress]])
  }
  /** Where it comes from as small badges: " replaced " " off ", or " can't be read " for a broken file. */
  const badges = (key: string, source: DefSource | undefined, off: boolean, broken = false) => (
    <Text key={key} wrap="wrap">
      {broken ? vsBadge(vs, `${key}-broken`, "can't be read", 'error') : source ? vsBadge(vs, `${key}-source`, source, SOURCE_TONE[source]) : null}
      {off ? <Text key={`${key}-gap`}> </Text> : null}
      {off ? vsBadge(vs, `${key}-off`, 'off', 'warning') : null}
    </Text>
  )
  /** One row of a list: the name a link (dim when off), its badges, then dim wrapped lines. */
  const listRow = (noun: 'role' | 'kind', name: string, source: DefSource | undefined, off: boolean, lines: RenderLine[], onPress: () => void, broken = false) => {
    const href = vsHref(noun, name)
    return (
      <Box key={`vs-${noun}-${name}`} flexDirection="column">
        <Box key={`vs-${noun}-${name}-top`} flexDirection="row" flexWrap="wrap" columnGap={2}>
          {vsLink(vs, row(`${noun}Row:${name}`), off || broken ? mdLink(name, href) : `**${mdLink(name, href)}**`, [[href, onPress]], off || broken)}
          {badges(`vs-${noun}-${name}-badges`, source, off, broken)}
        </Box>
        {(lines.filter(l => l && l[1]) as Exclude<RenderLine, false>[]).map(([k, text, color]) => plain(k, text, color))}
      </Box>
    )
  }
  /** The confirm step of Remove: a box in the warning color, the one "Yes, remove" Button, and a Cancel link. */
  const confirm = (key: string, what: string, yes: () => void, no: () => void) =>
    vsCallout(vs, key, '⚠', what, 'warning', [
      <Box key={`${key}-yes-row`} flexDirection="row">
        <pane.Button key={`${key.replace(/-box$/, '')}-yes`} label="Yes, remove" variant="primary" autoFocus onPress={yes} />
      </Box>,
      links(`${key.replace(/-box$/, '')}-cancel`, [['Cancel', 'cancel', no]]),
    ])
  /** A part of a page under its heading. */
  const section = (key: string, label: string, body: unknown[]) => (
    <Box key={`vs-sec-${key}`} flexDirection="column">
      {vsSection(vs, `vs-sec-${key}-head`, label)}
      {body.filter(Boolean) as never}
    </Box>
  )
  /** The "New role" / "New kind" Button, or (once pressed) the box for its name with a Cancel link. */
  const newBox = (noun: 'role' | 'kind', naming: { name: string; error: string } | null, start: () => void, make: (name: string) => () => void, cancel: () => void) =>
    naming ? (
      <Box key={`${noun}-new-box`} flexDirection="column">
        <pane.Input
          key={`${noun}-new-name`}
          label={`New ${noun}'s name`}
          placeholder="letters, digits, - and _"
          value={naming.name}
          autoFocus
          submitLabel="Make it"
          onInput={value => void (naming.name = value)}
          onSubmit={value => (value.trim() ? make(value)() : cancel())}
        />
        {naming.error ? plain(`${noun}-new-error`, naming.error, 'error') : null}
        {plain(`${noun}-new-about`, `Make it writes ${S.N.dir}/${noun}s/<name>.md and opens it.`)}
        {links(`${noun}-new-cancel`, [['Cancel', 'cancel', cancel]])}
      </Box>
    ) : (
      <Box key={`vs-${noun}-new-row`} flexDirection="row">
        <pane.Button key={`${noun}-new`} label={`+ New ${noun}`} variant="secondary" onPress={start} />
      </Box>
    )
  /** The file a page shows at its bottom. */
  const fileSection = (file: string) => section('file', 'File', [plain('vs-file', file, 'autoAccept')])
  return { Box, Text, C, vs, redraw, plain, links, back, badges, listRow, confirm, section, newBox, fileSection }
}
/** A dim line under a list row: its key, its words, its color. */
type RenderLine = [key: string, text: string, color?: string] | false

/** The header of a list page: the banner and tabs, a link back to Settings, the heading and what the page is for. */
function listTop(pane: PaneParts, k: ReturnType<typeof kit>, noun: 'Roles' | 'Kinds', about: string, onBack: () => void) {
  const { Box, banner, tabs } = pane
  return [
    <Box key="vs-header" flexDirection="column">
      {[...banner(), tabs()]}
    </Box>,
    <Box key={`vs-${noun.toLowerCase()}-top`} flexDirection="column">
      {k.back(`${noun.toLowerCase()}-back`, 'Settings', onBack)}
      {vsSection(k.vs, `vs-${noun.toLowerCase()}-head`, noun)}
      {k.plain(`vs-${noun.toLowerCase()}-about`, about)}
    </Box>,
  ]
}

// ---------------- roles ----------------

const roleFileOf = (name: string) => `${S.N.dir}/roles/${name}.md`

/** The Roles page in VS Code. */
export function rolesPageVs($: $, pane: PaneParts, roles: RoleDef[], builtIn: RoleDef[], project: RoleDef[], broken: BrokenDef[]) {
  const k = kit($, pane)
  const { Box } = k
  const open = (name: string) => () => ((roleView.open = name), (roleView.confirmRemove = false), (roleView.naming = null), k.redraw())
  const cancel = () => ((roleView.naming = null), k.redraw())
  const brokenRow = (b: BrokenDef) => k.listRow('role', b.name, undefined, false, [['why', brokenLabel(b), 'error']], open(b.name), true)
  return (
    <Box flexDirection="column" gap={1}>
      {listTop(pane, k, 'Roles', 'The roles a worker can take. Click one to open it, edit it, turn it off or remove it; or tell the lead.', () => ((roleView.list = false), (roleView.naming = null), k.redraw()))}
      <Box key="vs-roles-list" flexDirection="column" gap={1}>
        {roles.map(r => {
          const bad = brokenNamed(broken, r.name)
          if (bad) return brokenRow(bad)
          const off = !!r.off && !isCheckerRole(r.name)
          return k.listRow('role', r.name, defSource(r.name, builtIn, project), off, [['about', r.description], !!r.warning && ['warning', r.warning!, 'warning'], isCheckerRole(r.name) && ['checker', 'run by the checker setting, never a task\'s role']], open(r.name))
        })}
        {broken.filter(b => !defNamed(roles, b.name)).map(brokenRow)}
      </Box>
      {k.newBox('role', roleView.naming, () => ((roleView.naming = { name: '', error: '' }), k.redraw()), name => pane.act(async () => {
        const said = await newRoleFile(claudeHost($), name)
        if (said) $.ui.toast(S.N.toast(said))
      }), cancel)}
      {vsFooter(k.vs, 'roles-keys')}
    </Box>
  )
}

/** One role's page in VS Code (`checker`: whether the checker setting is on, for the checker role's note). */
export function rolePageVs($: $, pane: PaneParts, r: RoleDef, source: DefSource, checker: boolean) {
  const k = kit($, pane)
  const { Box, Text, C, vs } = k
  const { Markdown } = vs
  const run = (input: Parameters<typeof changeRole>[1], after?: () => void) => pane.act(async () => {
    const res = await changeRole(claudeHost($), input)
    if (res.ok && after) after()
    roleView.confirmRemove = false
    $.ui.toast(S.N.toast(res.text))
    k.redraw()
  })
  const isChecker = isCheckerRole(r.name)
  const off = !!r.off && !isChecker
  const canOff = r.name.toLowerCase() !== DEFAULT_ROLE && !isChecker
  const canReset = source === 'replaced'
  const canRemove = source === 'added'
  const set = (f: () => void) => () => (f(), k.redraw())
  return (
    <Box key="vs-role-page" flexDirection="column" gap={1}>
      <Box key="vs-role-top" flexDirection="column">
        {k.back('role-back', 'Roles', set(() => ((roleView.open = ''), (roleView.confirmRemove = false))))}
        <Box key="vs-role-title" flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text key="name" wrap="wrap" bold color={C(off ? 'inactive' : 'claude')}>{r.name}</Text>
          {k.badges('vs-role-badges', source, off)}
        </Box>
        {k.plain('vs-role-about', r.description, 'text', true)}
        {r.warning ? k.plain('vs-role-warning', r.warning, 'warning') : null}
        {isChecker ? k.plain('role-checker-setting', `Never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now ${checker ? 'on' : 'off'}).`) : null}
      </Box>
      {k.links('role-actions', [
        ['Edit', 'edit', set(() => ((roleView.draft = roleDraftOf(r)), (roleView.confirmRemove = false)))],
        ['See the prompt', 'prompt', set(() => ((roleView.prompt = promptsOfRole(r.name)[0]!), (roleView.confirmRemove = false)))],
        canOff && [r.off ? 'Turn on' : 'Turn off', 'off', run({ action: r.off ? 'on' : 'off', name: r.name })],
        canReset && ['Reset to built-in', 'reset', run({ action: 'reset', name: r.name })],
        canRemove && ['Remove', 'remove', set(() => (roleView.confirmRemove = true))],
      ])}
      {roleView.confirmRemove && canRemove ? k.confirm('role-remove-box', `Remove role ${r.name} and delete ${roleFileOf(r.name)}?`, run({ action: 'remove', name: r.name }, () => (roleView.open = '')), set(() => (roleView.confirmRemove = false))) : null}
      {k.section('model', 'Model', [k.plain('vs-model', r.model || "(none: the session's model)", r.model ? 'text' : 'inactive')])}
      {k.section('skills', 'Skills', [k.plain('vs-skills', r.skills.join(', ') || '(none)', r.skills.length ? 'text' : 'inactive')])}
      {k.section('tools', 'Tools', [k.plain('vs-tools', (r.tools ?? []).join(', ') || '(none: the base tools only)', r.tools?.length ? 'text' : 'inactive')])}
      {k.section('checklist', 'Checklist', [r.prompt.trim() ? <Markdown key="vs-checklist" text={r.prompt.trim()} /> : k.plain('vs-checklist-none', '(none: a plain worker)')])}
      {k.section('placeholders', 'Placeholders', [
        k.plain('vs-holders-about', 'The checklist may use these; each is filled in for the task (any other {{word}} is left as written).'),
        ...Object.entries(ROLE_PLACEHOLDERS).map(([p, m]) => (
          <Text key={`role-holder-${p}`} wrap="wrap">
            <Text bold color={C('ide')}>{`{{${p}}}`}</Text>
            <Text color={C('inactive')}>{` ${m}`}</Text>
          </Text>
        )),
      ])}
      {k.fileSection(source === 'built-in' ? `roles/${r.name}.md (in the plugin; Edit copies it to ${roleFileOf(r.name)})` : roleFileOf(r.name))}
      {vsFooter(vs, 'role-keys')}
    </Box>
  )
}

/** The page of a role whose file can't be read, in VS Code: why, then only Reset to built-in or Remove. */
export function brokenRolePageVs($: $, pane: PaneParts, b: BrokenDef, builtIn: RoleDef[]) {
  const k = kit($, pane)
  const { Box, Text, C } = k
  const run = (input: Parameters<typeof changeRole>[1]) => pane.act(async () => {
    const res = await changeRole(claudeHost($), input)
    if (res.ok) roleView.open = ''
    roleView.confirmRemove = false
    $.ui.toast(S.N.toast(res.text))
    k.redraw()
  })
  const okName = !roleNameError(b.name)
  const canReset = okName && !!defNamed(builtIn, b.name)
  const canRemove = okName && !canReset
  const out = canReset ? 'Reset to built-in deletes it (the built-in role is used meanwhile)' : canRemove ? 'Remove deletes it' : ''
  const set = (f: () => void) => () => (f(), k.redraw())
  return (
    <Box key="vs-role-page" flexDirection="column" gap={1}>
      <Box key="vs-role-top" flexDirection="column">
        {k.back('role-back', 'Roles', set(() => ((roleView.open = ''), (roleView.confirmRemove = false))))}
        <Box key="vs-role-title" flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text key="name" wrap="wrap" bold color={C('inactive')}>{b.name}</Text>
          {k.badges('vs-role-badges', undefined, false, true)}
        </Box>
        {k.plain('vs-role-why', brokenLabel(b), 'error')}
        {k.plain('vs-role-fix', `Fix the file by hand: ${b.file}${out ? `; or ${out}` : ''}.`, 'text')}
      </Box>
      {k.links('role-actions', [canReset && ['Reset to built-in', 'reset', run({ action: 'reset', name: b.name })], canRemove && ['Remove', 'remove', set(() => (roleView.confirmRemove = true))]])}
      {roleView.confirmRemove && canRemove ? k.confirm('role-remove-box', `Remove role ${b.name} and delete ${b.file}?`, run({ action: 'remove', name: b.name }), set(() => (roleView.confirmRemove = false))) : null}
      {k.fileSection(b.file)}
      {vsFooter(k.vs, 'role-keys')}
    </Box>
  )
}

/** A built-in prompt a role is put into, view only, in VS Code: links to the role and its other prompts, then the text. */
export function rolePromptPageVs($: $, pane: PaneParts, r: RoleDef, kind: RolePromptKind) {
  const k = kit($, pane)
  const { Box, Text, C } = k
  const show = (p: RolePromptKind | '') => () => ((roleView.prompt = p), k.redraw())
  return (
    <Box key="vs-role-prompt-page" flexDirection="column" gap={1}>
      <Box key="vs-role-prompt-top" flexDirection="column">
        {k.back('role-prompt-back', r.name, show(''))}
        <Box key="vs-prompt-title" flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text key="name" wrap="wrap" bold color={C('claude')}>{`${kind} prompt`}</Text>
          <Text key="badge" wrap="wrap">{vsBadge(k.vs, 'vs-prompt-badge', 'built-in, view only', 'inactive')}</Text>
        </Box>
        {k.plain('vs-prompt-about', `${kind === 'checker' ? 'What a checker is told' : `What a worker on a ${kind} task is told`}; role ${r.name}'s checklist goes where ${ROLE_SLOT} is.`)}
      </Box>
      {k.links('role-prompts', promptsOfRole(r.name).filter(p => p !== kind).map(p => [`The ${p} prompt`, p, show(p)] as Action))}
      {k.section('prompt-text', 'Text', ROLE_PROMPTS[kind].trimEnd().split('\n').map((line, i) => {
        if (!line.includes(ROLE_SLOT)) return <Text key={`role-prompt-line-${i}`} wrap="wrap">{line || ' '}</Text>
        const [before, ...after] = line.split(ROLE_SLOT)
        return (
          <Text key={`role-prompt-line-${i}`} wrap="wrap">
            {before}
            <Text bold color={C('warning')}>{ROLE_SLOT}</Text>
            {after.join(ROLE_SLOT)}
            <Text color={C('warning')}>{`  ◀ role ${r.name}'s checklist goes here`}</Text>
          </Text>
        )
      }))}
      {vsFooter(k.vs, 'role-prompt-keys')}
    </Box>
  )
}

/** The edit page's top in VS Code: the name with an "editing" badge, notes, then the one Save Button and a Cancel link. */
function editTop(pane: PaneParts, k: ReturnType<typeof kit>, noun: 'role' | 'kind', name: string, notes: string[], save: () => void, cancel: () => void, error: string) {
  const { Box, Text, C } = k
  return [
    <Box key={`vs-${noun}-edit-top`} flexDirection="column">
      <Box key="vs-edit-title" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Text key="name" wrap="wrap" bold color={C('claude')}>{name}</Text>
        <Text key="badge" wrap="wrap">{vsBadge(k.vs, 'vs-edit-badge', 'editing', 'warning')}</Text>
      </Box>
      {notes.map((n, i) => k.plain(`vs-edit-note-${i}`, n))}
    </Box>,
    <Box key={`vs-${noun}-edit-actions`} flexDirection="row" flexWrap="wrap" columnGap={2} alignItems="center">
      <pane.Button key={`${noun}-save`} label="Save" variant="primary" onPress={save} />
      {k.links(`${noun}-edit-cancel`, [['Cancel', 'cancel', cancel]])}
    </Box>,
    error ? k.plain(`vs-${noun}-edit-error`, error, 'error') : null,
  ]
}

/** A role's edit page in VS Code: a labelled box per part of its file. */
export function roleEditPageVs($: $, pane: PaneParts, source: DefSource | undefined) {
  const k = kit($, pane)
  const d = roleView.draft!
  const box = (key: keyof typeof d, label: string, placeholder: string, more: Record<string, unknown> = {}) => (
    <pane.Input key={`role-${key}`} label={label} value={String(d[key])} placeholder={placeholder} submitLabel="Keep" {...more} onInput={value => void ((d as Record<string, string>)[key] = value)} onSubmit={value => void ((d as Record<string, string>)[key] = value)} />
  )
  return (
    <k.Box key="vs-role-edit-page" flexDirection="column" gap={1}>
      {editTop(pane, k, 'role', d.role, [
        `Save writes ${roleFileOf(d.role)}${source === 'built-in' ? ' (a copy of the built-in role; Reset to built-in undoes it).' : '.'}`,
        `The name is the file's name: to rename the role, rename ${roleFileOf(d.role)}.`,
      ], pane.act(async () => {
        const said = await saveRoleDraft(claudeHost($))
        if (said) $.ui.toast(S.N.toast(said))
      }), () => ((roleView.draft = null), k.redraw()), d.error)}
      {box('description', 'Description', 'what the role is for, in a few words', { autoFocus: true })}
      {box('model', 'Model', "empty: the session's model")}
      {box('skills', 'Skills', 'skill names joined with ", " (empty: none)')}
      {box('tools', 'Tools', 'extra tools: web, to search and read the web (empty: none)')}
      {box('checklist', 'Checklist', 'what a worker with this role checks, one line each', { rows: 8 })}
      {vsFooter(k.vs, 'role-edit-keys')}
    </k.Box>
  )
}

// ---------------- kinds ----------------

const kindFileOf = (name: string) => `${S.N.dir}/kinds/${name}.md`

/** The Kinds page in VS Code. */
export function kindsPageVs($: $, pane: PaneParts, kinds: KindDef[], builtIn: KindDef[], project: KindDef[], broken: BrokenDef[]) {
  const k = kit($, pane)
  const { Box } = k
  const open = (name: string) => () => ((kindView.open = name), (kindView.confirmRemove = false), (kindView.naming = null), k.redraw())
  const cancel = () => ((kindView.naming = null), k.redraw())
  const brokenRow = (b: BrokenDef) => k.listRow('kind', b.name, undefined, false, [['why', brokenLabel(b), 'error']], open(b.name), true)
  return (
    <Box flexDirection="column" gap={1}>
      {listTop(pane, k, 'Kinds', 'The kinds a task can be. Click one to open it, edit it, turn it off or remove it; or tell the lead.', () => ((kindView.list = false), (kindView.naming = null), k.redraw()))}
      <Box key="vs-kinds-list" flexDirection="column" gap={1}>
        {kinds.map(x => {
          const bad = brokenNamed(broken, x.name)
          if (bad) return brokenRow(bad)
          return k.listRow('kind', x.name, defSource(x.name, builtIn, project), !!x.off, [['about', x.description]], open(x.name))
        })}
        {broken.filter(b => !findKind(kinds, b.name)).map(brokenRow)}
      </Box>
      {k.newBox('kind', kindView.naming, () => ((kindView.naming = { name: '', error: '' }), k.redraw()), name => pane.act(async () => {
        const said = await newKindFile(claudeHost($), name)
        if (said) $.ui.toast(S.N.toast(said))
      }), cancel)}
      {vsFooter(k.vs, 'kinds-keys')}
    </Box>
  )
}

/** One kind's page in VS Code; a kind whose file can't be read (`broken`) shows why, and only Reset or Remove. */
export function kindPageVs($: $, pane: PaneParts, x: KindDef | undefined, source: DefSource | undefined, broken: BrokenDef | undefined, builtIn: KindDef[]) {
  const k = kit($, pane)
  const { Box, Text, C, vs } = k
  const { Markdown } = vs
  const name = x?.name ?? broken!.name
  const run = (input: Parameters<typeof changeKind>[1], after?: () => void) => pane.act(async () => {
    const res = await changeKind(claudeHost($), input)
    if (res.ok && after) after()
    kindView.confirmRemove = false
    $.ui.toast(S.N.toast(res.text))
    k.redraw()
  })
  const okName = !kindNameError(name)
  const canEdit = !broken
  const canOff = !broken && !ALWAYS_ON_KINDS.includes(name)
  const canReset = broken ? okName && !!findKind(builtIn, name) : source === 'replaced'
  const canRemove = broken ? okName && !canReset : source === 'added'
  const file = broken ? broken.file : source === 'built-in' ? `kinds/${name}.ts (in the plugin; Edit copies it to ${kindFileOf(name)})` : kindFileOf(name)
  const off = !!x?.off
  const set = (f: () => void) => () => (f(), k.redraw())
  return (
    <Box key="vs-kind-page" flexDirection="column" gap={1}>
      <Box key="vs-kind-top" flexDirection="column">
        {k.back('kind-back', 'Kinds', set(() => ((kindView.open = ''), (kindView.confirmRemove = false))))}
        <Box key="vs-kind-title" flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text key="name" wrap="wrap" bold color={C(broken || off ? 'inactive' : 'claude')}>{name}</Text>
          {k.badges('vs-kind-badges', source, off, !!broken)}
        </Box>
        {broken ? k.plain('vs-kind-why', brokenLabel(broken), 'error') : null}
        {broken ? k.plain('vs-kind-fix', `Fix the file by hand: ${broken.file}.`, 'text') : k.plain('vs-kind-about', x!.description, 'text', true)}
        {!broken && !canOff ? k.plain('vs-kind-always', 'Always on: a task needs this kind.') : null}
      </Box>
      {k.links('kind-actions', [
        canEdit && ['Edit', 'edit', set(() => ((kindView.draft = kindDraftOf(x!)), (kindView.confirmRemove = false)))],
        canOff && [x!.off ? 'Turn on' : 'Turn off', 'off', run({ action: x!.off ? 'on' : 'off', name })],
        canReset && ['Reset to built-in', 'reset', run({ action: 'reset', name }, broken ? () => (kindView.open = '') : undefined)],
        canRemove && ['Remove', 'remove', set(() => (kindView.confirmRemove = true))],
      ])}
      {kindView.confirmRemove && canRemove ? k.confirm('kind-remove-box', `Remove kind ${name} and delete ${broken ? broken.file : kindFileOf(name)}?`, run({ action: 'remove', name }, () => (kindView.open = '')), set(() => (kindView.confirmRemove = false))) : null}
      {x ? k.section('body', 'Body', [x.body.trim() ? <Markdown key="vs-kind-body" text={x.body.trim()} /> : k.plain('vs-kind-body-none', '(none)')]) : null}
      {k.fileSection(file)}
      {vsFooter(vs, 'kind-keys')}
    </Box>
  )
}

/** A kind's edit page in VS Code: a labelled box for its description and its body. */
export function kindEditPageVs($: $, pane: PaneParts, source: DefSource | undefined) {
  const k = kit($, pane)
  const d = kindView.draft!
  const box = (key: 'description' | 'body', label: string, placeholder: string, more: Record<string, unknown> = {}) => (
    <pane.Input key={`kind-${key}`} label={label} value={d[key]} placeholder={placeholder} submitLabel="Keep" {...more} onInput={value => void (d[key] = value)} onSubmit={value => void (d[key] = value)} />
  )
  return (
    <k.Box key="vs-kind-edit-page" flexDirection="column" gap={1}>
      {editTop(pane, k, 'kind', d.kind, [`Save writes ${kindFileOf(d.kind)}${source === 'built-in' ? ' (a copy of the built-in kind; Reset to built-in undoes it).' : '.'}`], pane.act(async () => {
        const said = await saveKindDraft(claudeHost($))
        if (said) $.ui.toast(S.N.toast(said))
      }), () => ((kindView.draft = null), k.redraw()), d.error)}
      {box('description', 'Description', 'what this kind of task is, in a few words', { autoFocus: true })}
      {box('body', 'Body', 'free text about the kind', { rows: 6 })}
      {vsFooter(k.vs, 'kind-edit-keys')}
    </k.Box>
  )
}
