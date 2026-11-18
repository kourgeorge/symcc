// The board panel's own pieces for VS Code's side panel (see surface.ts): a header with the logo and the facts on
// readable, wrapped lines, a tab strip you click, a footer with real buttons and no key hints, small section headings and fold rows. The Tasks page uses
// them, and so do the task page (vscode-task.tsx) and the Scouts and Settings pages (vscode-scouts.tsx, vscode-settings.tsx).
import type { SymccMode } from '../../../types'
import type { BoxProps, ButtonProps, ElementConstructor, InputProps, MarkdownProps, RenderChildren, RenderSurface, SelectProps, TextProps } from 'claude-code'
import { emptyBoard, bannerCounts, folderName, versionMark, modeLabel, MODE_MEANING, MODE_NAME, nextMode, offStatusLine, footerRule } from '../../board'
import { namesFor } from '../../name'
import { type PaneView, S } from '../state'
import { logoNow } from '../logo'
import { LOGO_AREA, LOGO_MIN_WIDTH } from '../../core/logo'
import type { PaneTab } from './open'
import { CLICK_HINT } from './surface'

/** What the VS Code pieces draw with: the surface's elements, the color cast and the panel's width. */
export type VsKit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Input: ElementConstructor<InputProps>
  Markdown: ElementConstructor<MarkdownProps>
  /** VS Code's own drop-down picker (the Settings page's choices). */
  Select: ElementConstructor<SelectProps>
  C: (c: string) => never
  width: number
  /** The time the page is drawn at (see now.ts). */
  nowMs: number
  surface: RenderSurface
}

/** The tests line, short: the first command whole, then how many more ("claude plugin test . (+1 more)"). */
export const shortTests = (cmds: readonly string[]): string => {
  const list = cmds.map(c => c.trim()).filter(Boolean)
  if (!list.length) return ''
  return list.length === 1 ? list[0]! : `${list[0]} (+${list.length - 1} more)`
}

/** The color a mode's word is drawn in (the same as the terminal footer's). */
export const modeColor = (m: SymccMode) => (m === 'off' ? 'warning' : m === 'review' ? 'suggestion' : 'text')

/** The mode switch's label in VS Code: "Switch to review merge" in auto (and off), "Switch to auto" in review. */
export const switchLabel = (m: SymccMode) => `Switch to ${MODE_NAME[nextMode(m)]}`

/** The color of a status's dot in the counts badges (the same as the list's marks). */
const COUNT_COLOR: Record<string, string> = { backlog: 'inactive', review: 'suggestion', waiting: 'warning', failed: 'error', doing: 'success', paused: 'permission', todo: 'text', done: 'inactive', dropped: 'inactive' }

/** The mode pill's color: the same hue as the mode's word elsewhere, but auto in the success color (a pill in the plain
 *  text color would read as a black or white block). */
export const pillColor = (m: SymccMode) => (m === 'auto' ? 'success' : modeColor(m))

/** How wide the logo's column is in VS Code: the frame's width (LOGO_AREA, room for the sway) and nothing else. */
export const VS_LOGO_COLUMNS = LOGO_AREA

/** A logo row for VS Code: its spaces as no-break spaces, so the web panel keeps them (the clef's lines stay lined up);
 *  drawn in the monospace font, so each character takes one column. */
export const vsLogoRow = (row: string) => row.replace(/ /g, ' ')

/** How a board panel of `width` columns tells the logo's width (see noteLogoWidth): VS Code always shows the logo,
 *  so its moves may play at any width there; elsewhere the panel's own width (no logo below LOGO_MIN_WIDTH). */
export const logoWidthFor = (vscode: boolean, width: number) => (vscode ? Math.max(width, LOGO_MIN_WIDTH) : width)

/**
 * The header in VS Code, each line wrapped to the panel (never cut):
 *  - on the left the logo (the clef, bold in the accent color; it sways and turns into shapes as on the terminal), and beside it
 *    the name, version and folder; the mode as a pill with its meaning dim beside it; the branch and who drives on one dim line;
 *    the tests and the limits on one dim line;
 *  - under it the counts as small badges ("● 2 doing · 6 to do · 1 waiting for you"), and the "no git" row (`gitRow`).
 * A warning line when symcc is turned off sits under the name.
 */
export function vsBanner(k: VsKit, v: PaneView, mode: SymccMode, gitRow: RenderChildren[]): RenderChildren[] {
  const { Box, Text, C } = k
  const d = emptyBoard()
  const name = namesFor(S.N.name)
  const folder = folderName(S.root)
  const off = v.enabled === false ? offStatusLine(S.N.name) : ''
  const driving = v.driving ?? S.driving
  const cmds = v.test_commands ?? []
  const retries = v.auto_retries ?? d.auto_retries
  const limits = `${v.max_parallel ?? d.max_parallel} at once · ${v.max_minutes ?? d.max_minutes} min · ${retries} ${retries === 1 ? 'retry' : 'retries'}`
  const counts = bannerCounts({ ...v, max_parallel: v.max_parallel ?? d.max_parallel, max_minutes: v.max_minutes ?? d.max_minutes, auto_retries: retries, mode }, k.nowMs)
  const dot = (key: string) => <Text key={key} color={C('subtle')}> · </Text>
  const frame = logoNow()
  return [
    <Box key="vs-top" flexDirection="row" gap={1}>
      <Box key="vs-logo" flexDirection="column" width={VS_LOGO_COLUMNS} flexShrink={0}>
        {frame.map((row, i) => (
          <Text key={`vs-logo-${i}`} mono bold color={C('ide')}>{vsLogoRow(row)}</Text>
        ))}
      </Box>
      <Box key="vs-facts" flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text key="vs-title" wrap="wrap">
          <Text bold color={C('ide')}>{name.name}</Text>
          {S.version ? <Text color={C('inactive')}>{versionMark(S.version)}</Text> : null}
          {folder ? <Text color={C('inactive')}>{` · ${folder}`}</Text> : null}
        </Text>
        {off ? <Text key="vs-off" wrap="wrap" color={C('warning')}>{off}</Text> : null}
        <Text key="vs-mode" wrap="wrap">
          <Text bold backgroundColor={C(pillColor(mode))} color={C('inverseText')}>{` ${modeLabel(mode)} `}</Text>
          <Text color={C('inactive')}>{` ${MODE_MEANING[mode]}`}</Text>
        </Text>
        <Text key="vs-branch" wrap="wrap">
          {v.branch_note ? <Text color={C('warning')}>{v.branch_note}</Text> : <Text color={C('inactive')}>{v.branch ? `branch ${v.branch}` : 'no branch'}</Text>}
          {dot('vs-branch-dot')}
          <Text color={C('inactive')}>{driving ? 'this session drives' : 'driven by another session'}</Text>
        </Text>
        <Text key="vs-settings" wrap="wrap">
          {cmds.length ? <Text color={C('inactive')}>{`tests: ${shortTests(cmds)}`}</Text> : <Text color={C('warning')}>no test command</Text>}
          {dot('vs-settings-dot')}
          <Text color={C('inactive')}>{limits}</Text>
        </Text>
      </Box>
    </Box>,
    ...(counts.length
      ? [
          <Box key="vs-counts" flexDirection="row" flexWrap="wrap">
            {counts.map((c, i) => (
              <Text key={`vs-count-${i}`}>
                {c.status ? <Text color={C(COUNT_COLOR[c.status] ?? 'text')}>● </Text> : null}
                <Text bold={!!c.status} color={C(c.status ? 'text' : 'inactive')}>{c.text}</Text>
                {i < counts.length - 1 ? <Text color={C('subtle')}> · </Text> : null}
              </Text>
            ))}
          </Box>,
        ]
      : []),
    ...gitRow,
  ]
}

/** A tab in VS Code: its name, the count beside it as a small badge (none for Settings), and whether it is shown. */
export type VsTab = { which: PaneTab; label: string; count?: number; active: boolean; onPress: () => void }

/** A tab's text as one string: "Tasks 20", "Settings" (the Button's label, what a screen reader says). */
export const tabLabel = (t: Pick<VsTab, 'label' | 'count'>) => (t.count === undefined ? t.label : `${t.label} ${t.count}`)

/**
 * The tabs in VS Code: a segmented row, each tab a small bordered box around a plain button ("Tasks 20", no key labels).
 * The one shown has a bold border in the accent color, its name bold in the accent color and its count a filled badge;
 * the others a dim border in the subtle color, their name and count in the secondary color. The row wraps when the panel
 * is too narrow for the three, never cutting a tab.
 */
export function vsTabs(k: VsKit, tabs: VsTab[]): RenderChildren {
  const { Box, Text, Button, C } = k
  return (
    <Box key="tabs" flexDirection="row" flexWrap="wrap" marginTop={1}>
      {tabs.map(t => (
        <Box key={`tab-box-${t.which}`} borderStyle={t.active ? 'bold' : 'round'} borderColor={C(t.active ? 'ide' : 'subtle')} borderDimColor={!t.active} paddingX={1} flexShrink={0}>
          <Button key={`tab-${t.which}`} plain label={tabLabel(t)} onPress={t.onPress}>
            <Text bold={t.active} color={C(t.active ? 'ide' : 'inactive')}>{t.label}</Text>
            {t.count === undefined ? null : <Text color={C('inactive')}> </Text>}
            {t.count === undefined ? null : t.active ? (
              <Text bold backgroundColor={C('ide')} color={C('inverseText')}>{` ${t.count} `}</Text>
            ) : (
              <Text color={C('inactive')}>{String(t.count)}</Text>
            )}
          </Button>
        </Box>
      ))}
    </Box>
  )
}

/** The footer in VS Code: a light rule, then (Tasks page) the mode switch button and the search box, else one line
 *  that says how to act in the panel. No key hints. `extra`: more buttons beside the switch (a "Clear search"). */
export function vsFooter(k: VsKit, name: string, opts: { mode?: SymccMode; onSwitch?: () => void; search?: RenderChildren; extra?: RenderChildren } = {}): RenderChildren {
  const { Box, Text, Button, C, width } = k
  return (
    <Box key={`${name}-footer`} flexDirection="column">
      <Text key={`${name}-footer-rule`} wrap="truncate" color={C('subtle')}>{footerRule(width)}</Text>
      {opts.mode && opts.onSwitch ? (
        <Box key="footer-mode" flexDirection="row" flexWrap="wrap" gap={1}>
          <Button key="mode" label={switchLabel(opts.mode)} variant="secondary" onPress={opts.onSwitch} />
          {opts.extra}
        </Box>
      ) : null}
      {opts.search ?? null}
      {opts.mode ? null : <Text key={`${name}-0`} wrap="wrap" color={C('inactive')}>{CLICK_HINT}</Text>}
    </Box>
  )
}

/** The background of a count badge for a status tone: the tone itself, but a neutral grey for the plain text color
 *  (a badge in the text color would read as a black or white block). */
export const badgeTone = (tone: string) => (tone === 'text' ? 'inactive' : tone)

/** A small filled badge in VS Code (" 3 ", " ▶ doing "), the mode pill's look: bold, in the inverse text color on `tone`. */
export function vsBadge(k: VsKit, key: string, text: string | number, tone: string): RenderChildren {
  const { Text, C } = k
  return (
    <Text key={key} bold backgroundColor={C(badgeTone(tone))} color={C('inverseText')}>
      {` ${text} `}
    </Text>
  )
}

/** A section heading in VS Code: the status mark in its color, the name bold, then the count as a filled badge in the
 *  same color ("▶ Doing  2 "). Its text for a screen reader stays "Doing (2)" in `label`'s place. */
export function vsHeading(k: VsKit, key: string, mark: string, tone: string, label: string, n: number): RenderChildren {
  const { Box, Text, C } = k
  return (
    <Box key={key} flexDirection="row">
      <Text bold wrap="wrap">
        <Text color={C(tone)}>{`${mark} `}</Text>
        <Text color={C('text')}>{label}</Text>
        <Text color={C('text')}> </Text>
        {vsBadge(k, `${key}-count`, n, tone)}
      </Text>
    </Box>
  )
}

/** A fold row in VS Code: a plain button that reads as a heading, the count as a badge ("▸ Backlog  6 ", "▾ Done  3 
 *  (+12 archived)"); its label says it in words ("▸ Backlog (6)"). `top` false: a smaller, dim fold (a day under Done). */
export function vsFold(k: VsKit, key: string, label: string, n: number | string, open: boolean, onPress: () => void, top = true, autoFocus?: true, note = ''): RenderChildren {
  const { Button, Text, C } = k
  const text = `${open ? '▾' : '▸'} ${label} (${n}${note ? ` ${note}` : ''})`
  return (
    <Button key={key} plain label={text} autoFocus={autoFocus} onPress={onPress}>
      <Text bold={top} color={C('inactive')}>{`${open ? '▾' : '▸'} `}</Text>
      <Text bold={top} color={C(top ? 'text' : 'inactive')}>{label}</Text>
      <Text color={C('inactive')}> </Text>
      {top ? vsBadge(k, `${key}-count`, n, 'inactive') : <Text color={C('inactive')}>{String(n)}</Text>}
      {note ? <Text color={C('inactive')}>{` ${note}`}</Text> : null}
    </Button>
  )
}

/** A title cut to about two lines of `columns` (whole words, `lead` columns taken by what comes before it on the first
 *  line): the title, and whether it was cut (the row then says "(more)": the whole title is on the task's page). */
export function twoLines(title: string, columns: number, lead = 0): { text: string; cut: boolean } {
  const room = Math.max(12, 2 * Math.max(1, columns) - lead)
  const t = title.trim()
  if (t.length <= room) return { text: t, cut: false }
  const head = t.slice(0, room - MORE.length)
  const space = head.lastIndexOf(' ')
  return { text: (space > room / 2 ? head.slice(0, space) : head).trimEnd(), cut: true }
}
/** What a cut title ends with (see twoLines). */
export const MORE = ' (more)'

/** A section heading on VS Code's task page: plain words, bold, in the heading color ("What to do"). */
export function vsSection(k: VsKit, key: string, label: string): RenderChildren {
  const { Text, C } = k
  return (
    <Text key={key} wrap="wrap" bold color={C('suggestion')}>
      {label}
    </Text>
  )
}

/** Small dim tags in VS Code, on one line that wraps between them ("feature · worker · try 2 · 40m"). */
export function vsTags(k: VsKit, key: string, tags: string[]): RenderChildren {
  const { Text, C } = k
  return (
    <Text key={key} wrap="wrap" size="caption" color={C('inactive')}>
      {tags.join(' · ')}
    </Text>
  )
}

/** A callout in VS Code: a box with a rounded border in its tone (warning, error) around a heading in that tone and
 *  what it holds (the words and their buttons), so it stands out at the top of a page. */
export function vsCallout(k: VsKit, key: string, mark: string, label: string, tone: string, body: RenderChildren[]): RenderChildren {
  const { Box, Text, C } = k
  return (
    <Box key={key} flexDirection="column" borderStyle="round" borderColor={C(tone)} paddingX={1} gap={1}>
      <Text key={`${key}-head`} wrap="wrap" bold size="heading" color={C(tone)}>
        {`${mark} ${label}`}
      </Text>
      {body as never}
    </Box>
  )
}
