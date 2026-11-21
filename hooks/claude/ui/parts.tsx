// What every page of the board panel shares: the view it shows, the banner, the tabs, key hints and text styles.
import { drawNow } from './now'
import type { MatchedHook } from 'claude-code'
import type { SymccMode } from '../../../types'
import { STATUS_WORD, sortScouts, modeOf, nextMode, emptyBoard, type BannerTone, bannerLines, modeLabel, modeButton, bannerRule, footerRule, type KeyHint, hintLines, packRows, showsHeader, type BoardPage } from '../../board'
import { setupGit } from '../../app/git'
import { logoNow, noteLogoWidth } from '../../app/logo'
import { type PaneView, S } from '../../app/state'
import { type $, panelValues } from '../panel'
import { noteForLead, brief } from '../../app/tell'
import { setBoardMode } from '../../app/board-mode'
import { arrows, saysArrowsMove } from './arrows'
import { type PaneTab, resetPane } from '../../app/open'
import { claudeHost } from '../host'
import { isVscode, vscodeButton } from './surface'
import { LIVE_TABS, tabRow } from '../../core/live'
import { type VsKit, logoWidthFor, vsBanner, vsFooter, vsTabs } from './vscode'

export type PaneHook = MatchedHook<'ui.render', { component: 'Pane' }>
export type PaneEvent = Parameters<PaneHook>[1]

/** The width VS Code's panel is drawn to when it tells none (T-644): wide, so a row's title is not cut by a column count
 *  there; the panel's own CSS clips what is really too wide. */
export const VS_WIDE = 200

/** The columns a board page is laid out in: the pane's `bodyColumns` (60 when it gives none). In VS Code the pane's own
 *  `bodyColumns` when given (the surface's `viewport.columns` is the whole surface, wider than a docked pane), else the
 *  surface's columns, and VS_WIDE when it gives neither: never a small made-up column count, which cut every row in a
 *  wide panel after about 30 characters (T-644). Never under 20. */
export const paneWidth = (vscode: boolean, bodyColumns: number | undefined, viewColumns: number | undefined): number => {
  const given = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined)
  const body = given(bodyColumns)
  const view = given(viewColumns)
  if (!vscode) return Math.max(20, body ?? 60)
  return Math.max(20, body ?? view ?? VS_WIDE)
}

/** What every page of the board panel draws with: the elements, the view, and the shared pieces (banner, tabs, key hints, text). */
export async function paneParts($: $, e: PaneEvent) {
  const els = $.ui.resolve(e)
  const { Box, Text, Input } = els
  /** True in VS Code's side panel, where the board has its own layout (see surface.ts and vscode.tsx). */
  const vscode = isVscode(e.surface)
  // in VS Code a Button shows its label only, and letter keys do nothing: take the key marks off the labels
  const Button = vscode ? vscodeButton(els.Button) : els.Button
  const v: PaneView = await panelValues($).readView()
  /** The time the page is drawn at (the host's clock: see now.ts). */
  const nowMs = await drawNow($)
  const open = await panelValues($).readOpened()
  const width = paneWidth(vscode, e.props.bodyColumns, e.viewport?.columns)
  noteLogoWidth(logoWidthFor(vscode, width))
  // Theme colors, so the board reads well in both light and dark themes.
  const color: Record<string, string> = { backlog: 'inactive', review: 'suggestion', waiting: 'warning', failed: 'error', doing: 'success', paused: 'permission', todo: 'text', done: 'inactive', dropped: 'inactive' }
  const word: Record<string, string> = STATUS_WORD
  const mark: Record<string, string> = { backlog: '◇', review: '◆', waiting: '?', failed: '✗', doing: '▶', paused: '‖', todo: '○', done: '✓', dropped: '–' }
  const act = (fn: () => Promise<unknown>) => () => void fn().catch((err: Error) => $.ui.toast(S.N.toast(err.message)))
  const tabNow = await panelValues($).readTab()
  const onScouts = tabNow === 'scouts'
  const onSettings = tabNow === 'settings'
  /** The Live tab (T-690; VS Code's since T-691): its lanes open a task's page over it, and Back comes back to it. */
  const onLive = tabNow === 'live'
  const t = open && !onScouts && !onSettings ? v.tasks.find(x => x.id === open) : undefined
  // a question for the owner opened from the "Questions for you" list (see question-page.tsx); gone once it is answered
  const q = open && !t && !onScouts && !onSettings ? (v.questions ?? []).find(x => x.id === open) : undefined
  const C = (c: string) => c as never
  const scouts = sortScouts(Array.isArray(v.scouts) ? v.scouts : [])
  const mode = modeOf(v)
  /** What the m key switches to: review and auto swap; from paused it goes to review (m never pauses the board). */
  const switchTo: SymccMode = nextMode(mode)
  /** Switches the board mode between review and auto, the same as /<name>-mode with no word. */
  const switchMode = act(async () => {
    const r = await setBoardMode(claudeHost($), switchTo, 'you')
    $.ui.toast(S.N.toast(r))
    noteForLead(`The owner set the board mode to ${switchTo}: ${brief(r)}`)
  })
  /** What the VS Code pieces (vscode.tsx) draw with. */
  const vs: VsKit = { Box: Box as never, Text: Text as never, Button: Button as never, Input: Input as never, Markdown: els.Markdown as never, Select: (els as { Select?: unknown }).Select as never, Svg: (els as { Svg?: unknown }).Svg as never, C, width, nowMs, surface: e.surface }
  /** The banner at the top: the drawing and the board's facts (the board mode is in the Tasks page's footer). */
  const banner = () => {
    if (vscode) return vsBanner(vs, v, mode, gitRow())
    const d = emptyBoard()
    const facts = { ...v, max_parallel: v.max_parallel ?? d.max_parallel, max_minutes: v.max_minutes ?? d.max_minutes, auto_retries: v.auto_retries ?? d.auto_retries }
    // the text is in the same color as the tabs that aren't selected (a bit less bright, still readable in dark mode); warnings stand out
    const tone: Record<BannerTone, string> = { accent: 'ide', plain: 'inactive', dim: 'subtle', warning: 'warning' }
    return [
      ...bannerLines({ ...facts, mode }, S.root, S.home, v.driving ?? S.driving, width, nowMs, S.N.name, logoNow(), S.version).map((l, i) => (
        <Text key={`banner-${i}`} wrap="truncate">
          {l.art ? <Text bold color={C(l.art.trim() ? 'ide' : 'subtle')}>{l.art}</Text> : null}
          {l.parts.map(p => (
            <Text bold={p.bold} color={C(tone[p.tone])}>{p.text}</Text>
          ))}
        </Text>
      )),
      ...gitRow(),
    ]
  }
  /** The warning row under the banner when there is no git repo or no commit yet, with its "Set up git" button. */
  const gitRow = () =>
    v.git_state === 'no-repo' || v.git_state === 'no-commits'
      ? [
          <Box key="banner-git" flexDirection="row" {...(vscode ? { flexWrap: 'wrap' as const } : {})}>
            <Text wrap={vscode ? 'wrap' : 'truncate'} color={C('warning')}>{v.git_state === 'no-repo' ? 'No git repo here; nothing starts. ' : 'No commits yet; nothing starts. '}</Text>
            <Button key="setup-git" label="Set up git (g)" hotkey="g" onPress={act(async () => $.ui.toast(S.N.toast(await setupGit(claudeHost($), 'you'))))} />
          </Box>,
        ]
      : []
  /** The tab row under the banner: "[l]: Live │ [t]: Tasks (12) │ [s]: Scouts (3) │ [c]: Settings" (shorter words when narrow, see tabRow), the active one bold, underlined and blue
   *  (the accent color), the whole tab underlined, "[t]: " included. Each tab is a `plain` Button with NO hotkey (a plain Button
   *  with a hotkey draws its own "t: " outside the Text, where the underline can't reach; a framed one draws "[ … ]" around it),
   *  so the one Text inside is all the terminal draws, and a click on it switches. The "t", "l", "s" and "c" keys belong to four
   *  hidden Buttons in a Box drawn `display="none"`: they take no room and draw nothing, but still carry the hotkeys. */
  /** Switches to tab `which`, as a click on it in the tab row (T-770: the Live tab's scout mark opens the Scouts tab). */
  const go = (which: PaneTab) => act(async () => ((S.draft = null), (S.naming = null), (S.diffOpen = null), (S.rejecting = null), (S.settingEdit = null), (S.settingPick = null), await resetPane(claudeHost($), which)))
  const tabs = () => {
    if (vscode)
      return vsTabs(vs, [
        { which: 'live', label: 'Live', active: onLive, onPress: go('live') },
        { which: 'tasks', label: 'Tasks', count: v.tasks.length, active: !onScouts && !onSettings && !onLive, onPress: go('tasks') },
        { which: 'scouts', label: 'Scouts', count: scouts.length, active: onScouts, onPress: go('scouts') },
        { which: 'settings', label: 'Settings', active: onSettings, onPress: go('settings') },
      ])
    // the four tabs (LIVE_TABS): their words get shorter when the panel is narrow (tabRow), never cut
    const count = (which: PaneTab) => (which === 'tasks' ? v.tasks.length : which === 'scouts' ? scouts.length : undefined)
    const row = tabRow(LIVE_TABS.map(x => ({ key: x.key, label: x.label, count: count(x.tab) })), width)
    const isActive = (which: PaneTab) => (which === 'scouts' ? onScouts : which === 'settings' ? onSettings : which === 'live' ? onLive : !onScouts && !onSettings && !onLive)
    const one = (which: PaneTab, label: string) => {
      const active = isActive(which)
      return (
        <Button key={`tab-${which}`} plain label={label} onPress={go(which)}>
          <Text bold={active} underline={active} color={C(active ? 'ide' : 'inactive')}>{label}</Text>
        </Button>
      )
    }
    return (
      <Box key="tabs" flexDirection="row">
        {LIVE_TABS.flatMap((x, i) => [...(i ? [<Text color={C('subtle')}>{row.gap}</Text>] : []), one(x.tab, row.labels[i]!)])}
        <Box key="tab-keys" display="none">
          {LIVE_TABS.map(x => (
            <Button key={`tab-key-${x.tab}`} label={x.key} hotkey={x.key} onPress={go(x.tab)} />
          ))}
        </Box>
      </Box>
    )
  }
  /** The board header for page `p`, only where core's showsHeader says (the list pages; T-704): banner, then the tab
   *  row, then the rule under them; in VS Code the banner and tabs in one "vs-header" box (no rule). Nothing on an
   *  opened page (a task, a question, a scout, a role, a kind, org-mem...), which starts with its own title. */
  const header = (p: BoardPage) =>
    !showsHeader(p) ? [] :
    vscode ? [<Box key="vs-header" flexDirection="column">{[...banner(), tabs()]}</Box>] :
    [...banner(), tabs(), <Text key="header-rule" wrap="truncate" color={C('ide')}>{bannerRule(width)}</Text>]
  /** Key hints over as many lines as the width needs, broken only between hints: keys bold, words in the inactive color (readable on dark themes too). */
  const keyLines = (hints: KeyHint[], name: string) =>
    vscode ? [vsFooter(vs, name)] :
    hintLines(hints, width).map((line, i) => (
      <Text key={`${name}-${i}`} color={C('subtle')}>
        {line.map((kh, j) => (
          <Text key={`${name}-${i}-${j}`}>
            {j ? ' · ' : ''}
            <Text bold color={C('text')}>{kh.key}</Text>
            <Text color={C('inactive')}>{` ${kh.word}`}</Text>
          </Text>
        ))}
      </Text>
    ))
  /** The footer at the bottom of a page: a light rule, then (Tasks page only, `withMode`) the board-mode line with
   *  its [m] button (and `extra`, the Tasks page's [f] search button), then the page's key hints. It comes right after the page's content. Off the Tasks page there is
   *  no [m] button, so m does nothing there. */
  const footer = (hints: KeyHint[], name: string, withMode = false, extra: unknown = null) => (
    (arrows.move = !vscode && saysArrowsMove(hints)),
    vscode ? vsFooter(vs, name, withMode ? { mode, onSwitch: switchMode, extra: extra as never } : {}) :
    <Box key={`${name}-footer`} flexDirection="column">
      <Text key={`${name}-footer-rule`} wrap="truncate" color={C('subtle')}>{footerRule(width)}</Text>
      {withMode ? (
        <Box key="footer-mode" flexDirection="row">
          <Text wrap="truncate">
            <Text bold color={C(mode === 'paused' ? 'warning' : mode === 'review' ? 'suggestion' : 'text')}>{modeLabel(mode)}</Text>{' '}
          </Text>
          <Button key="mode" label={modeButton(mode)} hotkey="m" dimColor onPress={switchMode} />
          {extra as never}
        </Box>
      ) : null}
      {keyLines(hints, name)}
    </Box>
  )
  /** A row of buttons that goes on to more rows when it does not fit, never cutting a button. */
  const buttonRows = (buttons: unknown[], name: string) => {
    const shown = buttons.filter(b => b && typeof b === 'object') as { props: { label?: string } }[]
    return (
      <Box key={name} flexDirection="column">
        {packRows(shown.map(b => String(b.props.label ?? '').length + 2), width, 1).map((row, i) => (
          <Box key={`${name}-${i}`} flexDirection="row" gap={1}>
            {row.map(k => shown[k] as never)}
          </Box>
        ))}
      </Box>
    )
  }

  /** Text with task IDs, `code` and file paths picked out in color. */
  const rich = (text: string, base = 'text') => {
    const parts = text.split(/(\bT-\d+\b|`[^`\n]+`|(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.(?:md|ts|tsx|js|json|py|txt|csv|yml|yaml)\b)/g)
    return parts.map((p, i) =>
      i % 2 === 0 ? (
        p
      ) : /^T-\d+$/.test(p) ? (
        <Text bold color={C('claude')}>{p}</Text>
      ) : p.startsWith('`') ? (
        <Text color={C('ide')}>{p.slice(1, -1)}</Text>
      ) : (
        <Text color={C('autoAccept')}>{p}</Text>
      ),
    ).map(x => (typeof x === 'string' ? (x ? <Text color={C(base)}>{x}</Text> : null) : x))
  }

  // Shared by the task page and the scout page.
  const heading = (label: string) => (
    <Text bold color={C('suggestion')}>
      ▍{label}
    </Text>
  )
  // The details, line by line: headings, bullets and numbered steps stand out.
  const paragraphs = (text: string) =>
    text.split(/\n/).map((line, i) => {
      if (!line.trim()) return <Text key={`gap-${i}`}> </Text>
      const head = /^\s*#{1,6}\s+(.*)$/.exec(line)
      if (head) return <Text bold color={C('claude')}>{head[1]}</Text>
      const li = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(line)
      if (li)
        return (
          <Text>
            {li[1]}
            <Text color={C('claude')}>{/\d/.test(li[2]!) ? li[2] : '•'}</Text> {rich(li[3]!)}
          </Text>
        )
      const kv = /^(\s*)([A-Z][\w ]{1,30}):\s+(.*)$/.exec(line)
      if (kv)
        return (
          <Text>
            {kv[1]}
            <Text bold color={C('text')}>{kv[2]}:</Text> {rich(kv[3]!)}
          </Text>
        )
      return <Text>{rich(line)}</Text>
    })
  return { Box, Text, Button, Input, v, nowMs, width, color, word, mark, act, onScouts, onSettings, onLive, t, q, C, scouts, mode, vscode, vs, switchMode, goTab: go, banner, tabs, header, keyLines, footer, buttonRows, rich, heading, paragraphs }
}
export type PaneParts = Awaited<ReturnType<typeof paneParts>>
