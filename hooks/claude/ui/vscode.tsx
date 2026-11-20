// The board panel's own pieces for VS Code's side panel (see surface.ts): a header with the logo and the facts on
// readable, wrapped lines, a tab strip you click, a footer with no key hints, small section headings and fold rows. The Tasks page uses
// them, and so do the task page (vscode-task.tsx) and the Scouts and Settings pages (vscode-scouts.tsx, vscode-settings.tsx).
// VS Code draws every Button as a filled blue box (`plain` or not) and never wraps its label, so the things you click to
// go somewhere (task, question and scout rows, folds, tabs, the mode switch) are links in a Markdown block that the plugin
// answers (`onLinkPress`, see vsLink); real Buttons stay for the actions on a page (Approve, Retry, Save ...).
import type { SymccMode } from '../../../types'
import type { BoxProps, ButtonProps, ElementConstructor, InputProps, MarkdownProps, RenderChildren, RenderSurface, SelectProps, TextProps } from 'claude-code'
import { emptyBoard, bannerCounts, folderName, versionMark, modeLabel, MODE_MEANING, MODE_NAME, nextMode, offStatusParts, footerRule, testsShort } from '../../board'
import { ICON, namesFor } from '../../name'
import { type PaneView, S } from '../../app/state'
import type { PaneTab } from '../../app/open'
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

/** The tests line, short: the shared testsShort ("claude, typecheck", "5 commands"); '' when none is set. */
export const shortTests = (cmds: readonly string[]): string => (cmds.some(c => c.trim()) ? testsShort(cmds) : '')

/** The color a mode's word is drawn in (the same as the terminal footer's). */
export const modeColor = (m: SymccMode) => (m === 'paused' ? 'warning' : m === 'review' ? 'suggestion' : 'text')

/** The mode switch's label in VS Code: "Switch to review merge" in auto (and off), "Switch to auto" in review. */
export const switchLabel = (m: SymccMode) => `Switch to ${MODE_NAME[nextMode(m)]}`

/** The color of a status's dot in the counts badges (the same as the list's marks). */
const COUNT_COLOR: Record<string, string> = { backlog: 'inactive', review: 'suggestion', waiting: 'warning', failed: 'error', doing: 'success', paused: 'permission', todo: 'text', done: 'inactive', dropped: 'inactive' }

/** The mode pill's color: the same hue as the mode's word elsewhere, but auto in the success color (a pill in the plain
 *  text color would read as a black or white block). */
export const pillColor = (m: SymccMode) => (m === 'auto' ? 'success' : modeColor(m))

/** How a board panel of `width` columns tells the logo's width (see noteLogoWidth): 0 in VS Code, where the logo is the
 *  single still 𝄞 glyph (its font breaks the multi-row clef apart), so no move plays there; elsewhere the panel's own
 *  width (no logo below LOGO_MIN_WIDTH). */
export const logoWidthFor = (vscode: boolean, width: number) => (vscode ? 0 : width)

/** Where VS Code's links point: never opened (the plugin answers the press); `.invalid`, so no real site is named. */
export const VS_LINK_BASE = 'https://symcc.invalid/'
/** The link for a place on the board: vsHref('task', 'T-372') is "https://symcc.invalid/task/T-372". "(" and ")" are
 *  encoded too, since an unmatched one would end the markdown link early (a file named "src/a).ts"). */
export const vsHref = (kind: 'task' | 'question' | 'scout' | 'fold' | 'tab' | 'mode' | 'more' | 'file' | 'run' | 'role' | 'kind' | 'page' | 'do' | 'choice', id: string) =>
  `${VS_LINK_BASE}${kind}/${encodeURIComponent(id).replace(/[()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`

/** Text put into markdown as it is: on one line, every markdown mark escaped (a title with "*" or "[x]" stays plain). */
export const mdText = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>~|#!&]/g, '\\$&')
/** A markdown link, its text escaped (see mdText). */
export const mdLink = (text: string, href: string) => `[${mdText(text)}](${href})`

/**
 * A question's answer choices in VS Code (T-651): one numbered line each, "1. Only the first part", like Claude Code's
 * question pop-up; each line is a link (key `choice-1`) that wraps as text does and picks the choice wherever it is
 * clicked. VS Code's Buttons never wrap their label, so a long choice drawn as one ran past the panel.
 * The keyboard: keys 1-9 pick a choice while the panel has the focus, through hidden Buttons (`choice-key-1`, in a Box
 * drawn `display="none"`, as the terminal's answer box does). A Markdown link can't take `autoFocus`, so Enter no
 * longer picks the first choice at once; the "Your answer" box keeps no focus either, so the number keys still reach it.
 */
export function vsChoices(k: VsKit, choices: readonly string[], onChoice: (i: number) => () => void): RenderChildren {
  const { Box, Button } = k
  return (
    <Box key="vs-answers" flexDirection="column">
      {choices.map((c, i) => {
        const href = vsHref('choice', String(i + 1))
        return vsLink(k, `choice-${i + 1}`, mdLink(`${i + 1}. ${c}`, href), [[href, onChoice(i)]])
      })}
      <Box key="vs-choice-keys" display="none">
        {choices.slice(0, 9).map((c, i) => (
          <Button key={`choice-key-${i + 1}`} label={c} hotkey={String(i + 1)} onPress={onChoice(i)} />
        ))}
      </Box>
    </Box>
  )
}

/**
 * Clickable text in VS Code: a Markdown block with links the plugin answers. `links` pairs each href written in `text`
 * with what a press on it does; any other link in the text is left to VS Code. It wraps as text does.
 */
export function vsLink(k: VsKit, key: string, text: string, links: [href: string, onPress: () => void][], dim?: boolean): RenderChildren {
  const { Markdown } = k
  const on = new Map(links)
  return <Markdown key={key} text={text} dimColor={dim || undefined} pressableLinks={[...on.keys()]} onLinkPress={l => on.get(l.href)?.()} />
}

/**
 * The header in VS Code, each line wrapped to the panel (never cut):
 *  - on the left the logo (the single 𝄞 glyph, large and bold in the accent color: VS Code's font breaks the terminal's
 *    multi-row clef apart, so it is one still glyph here), and beside it
 *    the name, version and folder; the mode as a pill with its meaning dim beside it; the branch and who drives on one dim line;
 *    the tests and the limits on one dim line;
 *  - under it the counts as small badges ("● 2 doing · 6 to do · 1 waiting for you"), and the "no git" row (`gitRow`).
 * A warning line when symcc is disabled sits under the name.
 */
export function vsBanner(k: VsKit, v: PaneView, mode: SymccMode, gitRow: RenderChildren[]): RenderChildren[] {
  const { Box, Text, C } = k
  const d = emptyBoard()
  const name = namesFor(S.N.name)
  const folder = folderName(S.root)
  const off = v.enabled === false ? offStatusParts(S.N.name) : []
  const driving = v.driving ?? S.driving
  const cmds = v.test_commands ?? []
  const retries = v.auto_retries ?? d.auto_retries
  const limits = `${v.max_parallel ?? d.max_parallel} at once · ${v.max_minutes ?? d.max_minutes} min · ${retries} ${retries === 1 ? 'retry' : 'retries'}`
  const counts = bannerCounts({ ...v, max_parallel: v.max_parallel ?? d.max_parallel, max_minutes: v.max_minutes ?? d.max_minutes, auto_retries: retries, mode }, k.nowMs)
  const dot = (key: string) => <Text key={key} color={C('subtle')}> · </Text>
  return [
    <Box key="vs-top" flexDirection="row" gap={1}>
      <Box key="vs-logo" flexDirection="column" flexShrink={0}>
        <Text key="vs-logo-glyph" bold size="title" color={C('ide')}>{ICON}</Text>
      </Box>
      <Box key="vs-facts" flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text key="vs-title" wrap="wrap">
          <Text bold color={C('ide')}>{name.name}</Text>
          {S.version ? <Text color={C('inactive')}>{versionMark(S.version)}</Text> : null}
          {folder ? <Text color={C('inactive')}>{` · ${folder}`}</Text> : null}
        </Text>
        {off.length ? (
          <Text key="vs-off" wrap="wrap" color={C('warning')}>
            {off.map(p => (p.command ? <Text bold color={C('ide')}>{p.text}</Text> : p.text))}
          </Text>
        ) : null}
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

/** A tab's text as one string: "Tasks 20", "Settings". */
export const tabLabel = (t: Pick<VsTab, 'label' | 'count'>) => (t.count === undefined ? t.label : `${t.label} ${t.count}`)

/**
 * The tabs in VS Code: one line of text that wraps, "**Tasks 20** · Scouts 1 · Settings": the one shown bold and not
 * a link, the others links (a press switches the page). No Buttons: VS Code draws those as filled blue boxes.
 */
export function vsTabs(k: VsKit, tabs: VsTab[]): RenderChildren {
  const { Box } = k
  const text = tabs.map(t => (t.active ? `**${mdText(tabLabel(t))}**` : mdLink(tabLabel(t), vsHref('tab', t.which)))).join(' \u00a0·\u00a0 ')
  return (
    <Box key="tabs-row" flexDirection="column" marginTop={1}>
      {vsLink(k, 'tabs', text, tabs.filter(t => !t.active).map(t => [vsHref('tab', t.which), t.onPress]))}
    </Box>
  )
}

/** The footer in VS Code: a light rule, then (Tasks page) the mode switch as a quiet link and the search box, else one
 *  line that says how to act in the panel. No key hints. `extra`: more beside the switch (a "Clear search" button). */
export function vsFooter(k: VsKit, name: string, opts: { mode?: SymccMode; onSwitch?: () => void; search?: RenderChildren; extra?: RenderChildren } = {}): RenderChildren {
  const { Box, Text, C, width } = k
  const to = opts.mode ? vsHref('mode', nextMode(opts.mode)) : ''
  return (
    <Box key={`${name}-footer`} flexDirection="column">
      <Text key={`${name}-footer-rule`} wrap="truncate" color={C('subtle')}>{footerRule(width)}</Text>
      {opts.mode && opts.onSwitch ? (
        <Box key="footer-mode" flexDirection="row" flexWrap="wrap" gap={1}>
          {vsLink(k, 'mode', mdLink(switchLabel(opts.mode), to), [[to, opts.onSwitch]])}
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

/** A fold's words, as a screen reader would say them: "▸ Backlog (6)", "▾ Done (3 (+12 archived))". */
export const foldLabel = (label: string, n: number | string, open: boolean, note = '') => `${open ? '▾' : '▸'} ${label} (${n}${note ? ` ${note}` : ''})`

/** A fold row in VS Code: a link that reads as a heading, "**▸ Backlog 6**" bold, then a note ("(+12 archived)");
 *  a press opens or closes it. `top` false: a smaller, dim fold (a day under Done). Not a Button (see the top). */
export function vsFold(k: VsKit, key: string, label: string, n: number | string, open: boolean, onPress: () => void, top = true, note = ''): RenderChildren {
  const href = vsHref('fold', key)
  const link = mdLink(`${open ? '▾' : '▸'} ${label} ${n}`, href)
  return vsLink(k, key, `${top ? `**${link}**` : link}${note ? ` ${mdText(note)}` : ''}`, [[href, onPress]], !top)
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
/** `text` on one line of at most `max` characters: a longer one is cut (at a word when one ends near the cut) and ends
 *  with "…". The VS Code list's open rows cut their title this way so the row stays one line. */
export function cutEnd(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  if (max <= 1) return max === 1 ? '…' : ''
  const head = t.slice(0, max - 1)
  const space = head.lastIndexOf(' ')
  return `${(space > (max - 1) * 0.6 ? head.slice(0, space) : head).trimEnd()}…`
}
/** The fewest title characters an open row keeps before its state part is cut too (see vscode-list.tsx). */
export const MIN_TITLE = 12
/** What a cut title ends with (see twoLines). */
export const MORE = ' (more)'
/** What a row with an empty title (or question text) shows, dim, beside its id: never "****" from empty bold marks. */
export const NO_TITLE = '(no title)'

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
