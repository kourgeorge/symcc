// The board panel's Settings view in VS Code's side panel (see surface.ts and vscode.tsx). The terminal's page
// (settings.tsx) folds its groups and opens a pick list or an edit box on Enter; here every group is a heading with
// its settings under it, each on its own row:
//   Work                                      (the group's heading)
//   mode  [auto ▾]                            (VS Code's Select: a pick saves it)
//   default auto · paused: nothing runs; …    (what it means, dim, wrapped)
//   max_parallel  [2      ] Save              (an Input for numbers and the test commands: Save saves it)
//   Roles  7 roles · 1 off                  (a link that opens the Roles page; Kinds the same)
// Only real actions are Buttons (an Input's Save). No key hints.
import { SETTINGS, SETTING_GROUPS, isSettingPage, settingChoices, settingShown, settingValue, viewAsBoard, parseSettingValue, type SettingName, type SettingPage, type SettingsInput } from '../../board'
import { S } from '../../app/state'
import { type $ } from '../panel'
import type { PaneParts } from './parts'
import { vsFooter, vsHref, vsLink, mdLink, mdText, vsSection } from './vscode'

/** What settings.tsx hands the VS Code page: the Roles and Task types counts, how to save, how to open those pages. */
export type VsSettingsCtx = {
  rolesCount: string
  kindsCount: string
  save: (input: SettingsInput) => () => void
  openRoles: () => void
  openKinds: () => void
}

/** The Settings page in VS Code. */
export function settingsPageVs($: $, pane: PaneParts, ctx: VsSettingsCtx) {
  const { Box, Text, Input, C, header, vs, v } = pane
  const { Select } = vs
  const plain = (key: string, text: string, color = 'inactive') => (
    <Text key={key} wrap="wrap" color={C(color)}>
      {text}
    </Text>
  )
  const redraw = () => $.ui.invalidate('ui.render')

  const settingRow = (name: SettingName) => {
    const x = SETTINGS.find(s => s.name === name)!
    const now = settingValue(viewAsBoard(v), name)
    // a Select for on/off and for a setting with a fixed set of choices, a box for the typed ones (numbers, test commands)
    const picks = x.kind === 'onoff' ? ['on', 'off'] : settingChoices(name, v.notify_choices)
    const choices = picks.length ? picks : null
    const about = `default ${x.default} · ${x.range} · ${x.meaning}`
    if (choices) {
      // a value this machine can't play (notify) stays in the list, marked, so the Select shows what is set
      const cantPlay = !choices.includes(now)
      const options = [...choices.map(value => (settingShown(name, value) === value ? { value } : { value, label: settingShown(name, value) })), ...(cantPlay ? [{ value: now, label: `${now} (can't play here)` }] : [])]
      return (
        <Box key={`vs-setting-${name}`} flexDirection="column">
          <Select key={`setting:${name}`} label={name} options={options} value={now} onSelect={value => {
            const r = parseSettingValue(name, value)
            if (value !== now && r.ok) ctx.save(r.input)()
          }} />
          {cantPlay ? plain('cant-play', "can't play here: nothing plays", 'warning') : null}
          {plain('about', about)}
        </Box>
      )
    }
    // a box: what was typed stays while the page redraws (S.settingEdit), the saved value otherwise
    const ed = S.settingEdit?.name === name ? S.settingEdit : null
    const shown = now === 'none' && x.kind === 'commands' ? '' : now
    const submit = (value: string) => {
      const typed = value.trim() ? value : x.kind === 'commands' ? 'none' : ''
      if (!typed) return void ((S.settingEdit = { name, value, error: `${name} must be a whole number, ${x.range}` }), redraw())
      const r = parseSettingValue(name, typed)
      if (r.ok === false) return void ((S.settingEdit = { name, value, error: r.message }), redraw())
      S.settingEdit = null
      ctx.save(r.input)()
    }
    return (
      <Box key={`vs-setting-${name}`} flexDirection="column">
        <Input
          key={`setting:${name}`}
          label={name}
          value={ed ? ed.value : shown}
          placeholder={x.kind === 'commands' ? 'e.g. cd web && npm test, or empty for none' : `a whole number, ${x.range}`}
          submitLabel="Save"
          onInput={value => void (S.settingEdit = { name, value, error: '' })}
          onSubmit={submit}
        />
        {ed?.error ? plain(`setting-error-${name}`, ed.error, 'error') : null}
        {x.kind === 'commands' ? plain('commands-note', 'the line runs as one shell command · several: ["npm test", "npm run lint"] · empty clears them') : null}
        {plain('about', about)}
      </Box>
    )
  }

  // Roles and Task types open their pages: a link (VS Code draws a Button as a filled box), the count beside it
  const pageRow = (page: SettingPage) => {
    const roles = page === 'roles'
    const href = vsHref('page', page)
    const count = roles ? ctx.rolesCount : ctx.kindsCount
    return (
      <Box key={`vs-setting-${page}`} flexDirection="column">
        {vsLink(vs, roles ? 'settings-roles' : 'settings-kinds', `**${mdLink(roles ? 'Roles' : 'Task types', href)}** \u00a0${mdText(count)}`, [[href, roles ? ctx.openRoles : ctx.openKinds]])}
        {plain('about', roles ? 'the worker roles, to open, edit, turn off or add' : 'the task types, to open, edit, turn off or add')}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {header('settings')}
      {SETTING_GROUPS.map(g => (
        <Box key={`vs-group-${g.title}`} flexDirection="column" gap={1}>
          {vsSection(vs, `vs-group-${g.title}-head`, g.title)}
          {g.items.map(item => (isSettingPage(item) ? pageRow(item) : settingRow(item)))}
        </Box>
      ))}
      {plain('vs-settings-how', `A pick or Save changes a setting at once. You can also type /${S.N.name}-settings NAME VALUE, or tell the lead.`)}
      {vsFooter(vs, 'settings-keys')}
    </Box>
  )
}
