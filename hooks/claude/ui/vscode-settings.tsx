// The board panel's Settings view in VS Code's side panel (see surface.ts and vscode.tsx). The terminal's page
// (settings.tsx) folds its groups and opens a pick list or an edit box on Enter; here (T-1008) every group is a plain bold
// heading with its settings under it, the names in one shared label column:
//   Work                                      (the group's heading)
//   mode           [auto ▾]                   (VS Code's Select: a pick saves it)
//                  paused: nothing runs; …    (what it means, dim, wrapped; no default or range)
//   max_parallel   [2      ] Save             (an Input for numbers and the test commands: Save saves it)
//   Roles          7 roles · 1 off            (a link row that opens the Roles page; Task types the same)
// Only real actions are Buttons (an Input's Save). No pills, borders, help sentence or key hints.
import { SETTINGS, SETTING_GROUPS, settingInfo, isSettingPage, settingChoices, settingShown, settingValue, viewAsBoard, parseSettingValue, type SettingName, type SettingPage, type SettingsInput } from '../../board'
import { S } from '../../app/state'
import { choiceNote, settingAbout } from '../../core/setting-notes'
import { type $ } from '../panel'
import type { PaneParts } from './parts'
import { vsFooter, vsHref, vsLink, mdLink, vsSection } from './vscode'

/** The one label column's width in cells: the longest setting name and two spaces. */
export const SETTINGS_LABEL_W = Math.max(...SETTINGS.map(s => s.label.length), 'Task types'.length) + 2

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
  /** One row: the label column, then what sits beside it. */
  const line = (key: string, label: unknown, rest: unknown) => (
    <Box key={key} flexDirection="row">
      <Box key={`${key}-label`} flexDirection="row" flexShrink={0} width={SETTINGS_LABEL_W}>{label as never}</Box>
      <Box key={`${key}-value`} flexDirection="column" flexGrow={1} flexShrink={1}>{rest as never}</Box>
    </Box>
  )
  const name$ = (key: string, name: string) => <Text key={key} color={C('inactive')}>{name}</Text>

  const settingRow = (name: SettingName) => {
    const x = settingInfo(name)!
    const now = settingValue(viewAsBoard(v), name)
    // a Select for on/off and for a setting with a fixed set of choices, a box for the typed ones (numbers, test commands)
    const picks = x.kind === 'onoff' ? ['on', 'off'] : settingChoices(name, v.notify_choices)
    const choices = picks.length ? picks : null
    const key = `vs-setting-${name}`
    // T-1105: the setting's one sentence above the choices, a dim note per choice under them (core's setting-notes)
    const about = line(`${key}-about`, null, plain('about', settingAbout(name)))
    if (choices) {
      // a value this machine can't play (notify) stays in the list, marked, so the Select shows what is set
      const cantPlay = !choices.includes(now)
      const options = [...choices.map(value => (settingShown(name, value) === value ? { value } : { value, label: settingShown(name, value) })), ...(cantPlay ? [{ value: now, label: `${now} (can't play here)` }] : [])]
      return (
        <Box key={key} flexDirection="column">
          {about}
          {line(`${key}-row`, name$('name', x.label), <Select key={`setting:${name}`} options={options} value={now} onSelect={value => {
            const r = parseSettingValue(name, value)
            if (value !== now && r.ok) ctx.save(r.input)()
          }} />)}
          {cantPlay ? line(`${key}-cant`, null, plain('cant-play', "can't play here: nothing plays", 'warning')) : null}
          {choices.filter(value => choiceNote(name, value)).map(value => line(`${key}-note-${value}`, null, plain(`note-${value}`, `${settingShown(name, value)}  ${choiceNote(name, value)}`)))}
        </Box>
      )
    }
    // a box: what was typed stays while the page redraws (S.settingEdit), the saved value otherwise
    const ed = S.settingEdit?.name === name ? S.settingEdit : null
    const shown = now === 'none' && x.kind === 'commands' ? '' : now
    const submit = (value: string) => {
      const typed = value.trim() ? value : x.kind === 'commands' ? 'none' : ''
      if (!typed) return void ((S.settingEdit = { name, value, error: `${x.label} must be a whole number, ${x.range}` }), redraw())
      const r = parseSettingValue(name, typed)
      if (r.ok === false) return void ((S.settingEdit = { name, value, error: r.message.replace(name, x.label) }), redraw())
      S.settingEdit = null
      ctx.save(r.input)()
    }
    return (
      <Box key={key} flexDirection="column">
        {about}
        {line(`${key}-row`, name$('name', x.label), (
          <Input
            key={`setting:${name}`}
            value={ed ? ed.value : shown}
            placeholder={x.kind === 'commands' ? 'e.g. cd web && npm test, or empty for none' : `a whole number, ${x.range}`}
            submitLabel="Save"
            onInput={value => void (S.settingEdit = { name, value, error: '' })}
            onSubmit={submit}
          />
        ))}
        {ed?.error ? line(`${key}-error`, null, plain(`setting-error-${name}`, ed.error, 'error')) : null}
      </Box>
    )
  }

  // Roles and Task types open their pages: a link row, the name a link in the label column, the count dim beside it
  const pageRow = (page: SettingPage) => {
    const roles = page === 'roles'
    const href = vsHref('page', page)
    const count = roles ? ctx.rolesCount : ctx.kindsCount
    return line(`vs-setting-${page}`, vsLink(vs, roles ? 'settings-roles' : 'settings-kinds', `**${mdLink(roles ? 'Roles' : 'Task types', href)}**`, [[href, roles ? ctx.openRoles : ctx.openKinds]]), plain(`${page}-count`, count))
  }

  return (
    <Box flexDirection="column" gap={1}>
      {header('settings')}
      {SETTING_GROUPS.map(g => (
        <Box key={`vs-group-${g.title}`} flexDirection="column">
          {vsSection(vs, `vs-group-${g.title}-head`, g.title)}
          {g.items.map(item => (isSettingPage(item) ? pageRow(item) : settingRow(item)))}
        </Box>
      ))}
      {vsFooter(vs, 'settings-keys')}
    </Box>
  )
}
