// The Organizational memory page (T-619) on the terminal panel (and desktop and mobile; VS Code has its own,
// vscode-orgmem.tsx). T-687: it is opened from the "Organizational memory (n notes)" button at the bottom of the Live
// tab (live.tsx, key m), and its Back returns to the Live tab; it is no longer under Settings.
import { S } from '../../app/state'
import { type $ } from '../panel'
import type { PaneParts } from './parts'
import { arrows, row } from './arrows'
import { claudeHost } from '../host'
import { ORG_MEM_TITLE, ORG_MEM_EMPTY, orgMemAbout, orgMemDeleteAsk, orgMemKeys, orgMemNoteHead, type OrgMemNote } from '../../core/org-mem'
import { orgMemView, deleteOrgMem, resetOrgMemView } from '../../app/org-mem'
import { orgMemPageVs } from './vscode-orgmem'

/** The note a press of Delete (x) is about: the note row that holds the focus, else the first (newest) one. */
const focusedNote = (notes: readonly OrgMemNote[]) => {
  const m = /^orgmemRow:(\d+)$/.exec(arrows.focused ?? '')
  return (m ? notes.find(x => x.n === Number(m[1])) : undefined) ?? notes[0]
}

/** The Organizational memory page, opened from the button at the bottom of the Live tab: what org-mem is, then its notes newest first
 *  (number, date, text); Enter on a note or Delete (x) asks to delete it (y yes, x cancel); Back (b) to the Live tab. */
export function orgMemPage($: $, pane: PaneParts, notes: OrgMemNote[], file: string) {
  if (pane.vscode) return orgMemPageVs($, pane, notes, file)
  const { Box, Text, Button, act, C, header, footer, heading } = pane
  const redraw = () => $.ui.invalidate('ui.render')
  const ask = orgMemView.confirm === null ? undefined : notes.find(x => x.n === orgMemView.confirm)
  const askDelete = (x: OrgMemNote | undefined) => () => void (x && ((orgMemView.confirm = x.n), redraw()))
  const del = (x: OrgMemNote) => act(async () => {
    const r = await deleteOrgMem(claudeHost($), x.n, x.text)
    orgMemView.confirm = null
    $.ui.toast(S.N.toast(r.text))
    redraw()
  })
  const confirmBox = (x: OrgMemNote) => (
    <Box key="orgmem-delete-box" flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
      <Text color={C('warning')}>{orgMemDeleteAsk(x, file)}</Text>
      <Box flexDirection="row" gap={1}>
        <Button key="orgmem-delete-yes" label="Yes, delete (y)" hotkey="y" autoFocus onPress={del(x)} />
        <Button key="orgmem-delete-cancel" label="Cancel (x)" hotkey="x" onPress={() => ((orgMemView.confirm = null), redraw())} />
      </Box>
    </Box>
  )
  return (
    <Box flexDirection="column">
      {header()}
      {heading(ORG_MEM_TITLE)}
      <Text key="orgmem-about" wrap="wrap" color={C('inactive')}>{orgMemAbout(file)}</Text>
      <Text key="orgmem-about-blank"> </Text>
      {notes.length ? (
        notes.flatMap((x, i) => [
          <Button key={row(`orgmemRow:${x.n}`)} plain label={`${orgMemNoteHead(x)}: ${x.text}`} autoFocus={i === 0 && !ask ? true : undefined} onPress={askDelete(x)}>
            <Text wrap="wrap">
              <Text bold color={C('claude')}>{`  ${orgMemNoteHead(x)}`}</Text>
              <Text color={C('text')}>{`  ${x.text}`}</Text>
            </Text>
          </Button>,
          ...(ask?.n === x.n ? [confirmBox(x)] : []),
        ])
      ) : (
        <Text key="orgmem-empty" color={C('inactive')}>{`  ${ORG_MEM_EMPTY}`}</Text>
      )}
      <Text key="orgmem-blank"> </Text>
      {notes.length && !ask ? <Button key="orgmem-delete" label="Delete (x)" hotkey="x" onPress={() => askDelete(focusedNote(notes))()} /> : null}
      <Button key="orgmem-back" label="Back (b)" hotkey="b" onPress={() => (resetOrgMemView(), redraw())} />
      {footer(orgMemKeys(!!ask, notes.length > 0), 'orgmem-keys')}
    </Box>
  )
}
