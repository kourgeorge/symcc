// The board panel's Settings view.
import { SETTINGS, type SettingsInput, type SettingName, settingValue, parseSettingValue, settingsKeys, boxHint, pickHint } from '../../board'
import { type $, S } from '../state'
import { resetPane } from './open'
import { ownerSettings } from '../tools'
import type { PaneParts } from './parts'

/** The Settings view: one row per setting; Enter changes it. Every box and pick list has a Cancel button (x), and
 *  Enter on an empty edit box cancels it too; Back (b) goes to the board list. None of it needs Esc, which
 *  doesn't reach the panel from a text box. */
export async function settingsPage($: $, pane: PaneParts) {
  const { Box, Text, Button, Input, v, act, C, header, footer } = pane
  const nameWidth = Math.max(...SETTINGS.map(x => x.name.length))
  const cancel = () => ((S.settingEdit = null), (S.settingPick = null), $.ui.invalidate('ui.render'))
  const cancelButton = <Button key="setting-cancel" label="Cancel (x)" hotkey="x" onPress={cancel} />
  const saveIt = (input: SettingsInput) => act(async () => {
    const r = await ownerSettings($, input, 'from the board')
    S.settingEdit = null
    S.settingPick = null
    $.ui.toast(S.N.toast(r))
    $.ui.invalidate('ui.render')
  })
  /** Enter on a row: on/off flips, mode and notify open a pick list, the rest an edit box. */
  const pressRow = (name: SettingName) => act(async () => {
    const info = SETTINGS.find(x => x.name === name)!
    const now = settingValue(v, name)
    if (info.kind === 'onoff') return saveIt({ [name]: now !== 'on' })()
    S.settingEdit = null
    S.settingPick = null
    if (info.kind === 'mode') S.settingPick = { name, options: ['off', 'review', 'auto'] }
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
      <Button key="settings-back" label="Back (b)" hotkey="b" onPress={act(() => resetPane($, 'tasks'))} />
      {footer(settingsKeys(), 'settings-keys')}
    </Box>
  )
}
