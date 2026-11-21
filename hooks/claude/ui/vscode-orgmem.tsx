// The Organizational memory page (T-619) in VS Code's side panel, opened from the Organizational memory link at the
// bottom of the Live tab (vscode-live.tsx, T-687); "← Live" goes back there. The terminal's page (orgmem.tsx) has a row Button per note and a Delete (x) key; VS Code draws every Button as a
// filled box, so here each note is its header line ("#3 · T-12 · 2026-11-20") with a "Delete" link beside it, then
// its text, dim and wrapped. Delete asks first in a box with one "Yes, delete" Button and a Cancel link. No key hints.
import { ORG_MEM_TITLE, ORG_MEM_EMPTY, orgMemAbout, orgMemDeleteAsk, orgMemNoteHead, type OrgMemNote } from '../../core/org-mem'
import { orgMemView, deleteOrgMem, resetOrgMemView } from '../../app/org-mem'
import { S } from '../../app/state'
import { type $ } from '../panel'
import type { PaneParts } from './parts'
import { claudeHost } from '../host'
import { vsCallout, vsFooter, vsHref, vsLink, mdLink, mdText, vsSection } from './vscode'

/** The Organizational memory page in VS Code. */
export function orgMemPageVs($: $, pane: PaneParts, notes: OrgMemNote[], file: string) {
  const { Box, Text, C, vs, header } = pane
  const redraw = () => $.ui.invalidate('ui.render')
  const plain = (key: string, text: string, color = 'inactive') => (
    <Text key={key} wrap="wrap" color={C(color)}>
      {text}
    </Text>
  )
  const back = vsHref('page', 'back/orgmem-back')
  const ask = orgMemView.confirm === null ? undefined : notes.find(x => x.n === orgMemView.confirm)
  const del = (x: OrgMemNote) => pane.act(async () => {
    const r = await deleteOrgMem(claudeHost($), x.n, x.text)
    orgMemView.confirm = null
    $.ui.toast(S.N.toast(r.text))
    redraw()
  })
  const noteRow = (x: OrgMemNote) => {
    const href = vsHref('do', `orgmem-delete/${x.n}`)
    return (
      <Box key={`vs-orgmem-${x.n}`} flexDirection="column">
        {vsLink(vs, `orgmemRow:${x.n}`, `**${mdText(orgMemNoteHead(x))}**  ${mdLink('Delete', href)}`, [[href, () => ((orgMemView.confirm = x.n), redraw())]])}
        {plain(`vs-orgmem-${x.n}-text`, x.text, 'text')}
        {ask?.n === x.n
          ? vsCallout(vs, 'orgmem-delete-box', '⚠', orgMemDeleteAsk(x, file), 'warning', [
              <Box key="orgmem-delete-yes-row" flexDirection="row">
                <pane.Button key="orgmem-delete-yes" label="Yes, delete" variant="primary" autoFocus onPress={del(x)} />
              </Box>,
              vsLink(vs, 'orgmem-delete-cancel', mdLink('Cancel', vsHref('do', 'orgmem-delete/cancel')), [[vsHref('do', 'orgmem-delete/cancel'), () => ((orgMemView.confirm = null), redraw())]]),
            ])
          : null}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap={1}>
      {header('orgmem')}
      <Box key="vs-orgmem-top" flexDirection="column">
        {vsLink(vs, 'orgmem-back', mdLink('← Live', back), [[back, () => (resetOrgMemView(), redraw())]])}
        {vsSection(vs, 'vs-orgmem-head', ORG_MEM_TITLE)}
        {plain('vs-orgmem-about', orgMemAbout(file))}
      </Box>
      <Box key="vs-orgmem-list" flexDirection="column" gap={1}>
        {notes.length ? notes.map(noteRow) : plain('orgmem-empty', ORG_MEM_EMPTY)}
      </Box>
      {vsFooter(vs, 'orgmem-keys')}
    </Box>
  )
}
