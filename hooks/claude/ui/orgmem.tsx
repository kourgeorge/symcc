// The Organizational memory page (T-619) on the terminal panel (and desktop and mobile; VS Code has its own,
// vscode-orgmem.tsx). T-687, T-718: it is opened from the Organizational memory section (newest notes and topics) at the
// bottom of the Live tab (live.tsx, key m), and its Back returns to the Live tab; it is no longer under Settings. T-718: opened from a
// topic in the Live tab's org-mem section it shows only that topic's notes ("Organizational memory · tests"); from a
// newest note there, all notes with the focus on that one (live.tsx's orgMemPick says which).
import { S } from '../../app/state'
import { type $ } from '../panel'
import type { PaneParts } from './parts'
import { arrows, row } from './arrows'
import { claudeHost } from '../host'
import { ORG_MEM_EMPTY, orgMemAbout, orgMemOfTopic, orgMemPageTitle, orgMemTopicEmpty, orgMemDeleteAsk, orgMemKeys, orgMemNoteHead, orgMemFind, type OrgMemNote } from '../../core/org-mem'
import { orgMemView, deleteOrgMem, resetOrgMemView } from '../../app/org-mem'
import { orgMemPageVs } from './vscode-orgmem'
import { orgMemPick } from './live'

/** The note a press of Delete (x) is about: the note row that holds the focus, else the first (newest) one. */
const focusedNote = (notes: readonly OrgMemNote[]) => {
  const m = /^orgmemRow:(\d+)$/.exec(arrows.focused ?? '')
  return (m ? notes.find(x => x.n === Number(m[1])) : undefined) ?? orgMemFind(notes, orgMemPick.note) ?? notes[0]
}

/** The Organizational memory page, opened from the Organizational memory section at the bottom of the Live tab: what org-mem is, then its notes newest first
 *  (number, date, text); Enter on a note or Delete (x) asks to delete it (y yes, x cancel); Back (b) to the Live tab. */
export function orgMemPage($: $, pane: PaneParts, all: OrgMemNote[], file: string) {
  if (pane.vscode) return orgMemPageVs($, pane, all, file)
  const topic = orgMemPick.topic
  const notes = orgMemOfTopic(all, topic)
  const focus = (orgMemFind(notes, orgMemPick.note) ?? notes[0])?.n
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
      {header('orgmem')}
      {heading(orgMemPageTitle(topic))}
      <Box key="orgmem-buttons" flexDirection="row" gap={1}>
        {notes.length && !ask ? <Button key="orgmem-delete" label="Delete (x)" hotkey="x" onPress={() => askDelete(focusedNote(notes))()} /> : null}
        <Button key="orgmem-back" label="Back (b)" hotkey="b" onPress={() => (resetOrgMemView(), redraw())} />
      </Box>
      <Text key="orgmem-about" wrap="wrap" color={C('inactive')}>{orgMemAbout(file)}</Text>
      <Text key="orgmem-about-blank"> </Text>
      {notes.length ? (
        notes.flatMap(x => [
          <Button key={row(`orgmemRow:${x.n}`)} plain label={`${orgMemNoteHead(x)}: ${x.text}`} autoFocus={x.n === focus && !ask ? true : undefined} onPress={askDelete(x)}>
            <Text wrap="wrap">
              <Text bold color={C('claude')}>{`  ${orgMemNoteHead(x)}`}</Text>
              <Text color={C('text')}>{`  ${x.text}`}</Text>
            </Text>
          </Button>,
          ...(ask?.n === x.n ? [confirmBox(x)] : []),
        ])
      ) : (
        <Text key="orgmem-empty" color={C('inactive')}>{`  ${topic ? orgMemTopicEmpty(topic) : ORG_MEM_EMPTY}`}</Text>
      )}
      {footer(orgMemKeys(!!ask, notes.length > 0), 'orgmem-keys')}
    </Box>
  )
}
