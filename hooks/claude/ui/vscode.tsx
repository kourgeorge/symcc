// The board panel's own pieces for VS Code's side panel (see surface.ts): a header with the logo and the facts on
// readable, wrapped lines, a tab bar, a footer with no key hints, small section headings and fold rows. The Tasks page uses
// them, and so do the task page (vscode-task.tsx) and the Scouts and Settings pages (vscode-scouts.tsx, vscode-settings.tsx).
// A Button never wraps its label, so the rows you click to go somewhere (task, question and scout rows, folds, the mode
// switch) are links in a Markdown block that the plugin answers (`onLinkPress`, see vsLink). T-973: the tabs, the Live
// tab's section headings and its small link-like actions are `plain` Buttons (dim ones brighten under the pointer); the
// actions on a page are Buttons, the one main action `primary`, the rest `secondary`.
import type { SymccMode } from '../../../types'
import type { BoxProps, ButtonProps, ElementConstructor, InputProps, MarkdownProps, RenderChildren, RenderSurface, SelectProps, SvgProps, TextProps } from 'claude-code'
import { emptyBoard, bannerCounts, folderName, versionMark, modeLabel, MODE_NAME, nextMode, offStatusParts, testsShort, driveNoticeParts } from '../../board'
import { ICON, namesFor } from '../../name'
import { type PaneView, S } from '../../app/state'
import type { PaneTab } from '../../app/open'

/** What the VS Code pieces draw with: the surface's elements, the color cast and the panel's width. */
export type VsKit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Input: ElementConstructor<InputProps>
  Markdown: ElementConstructor<MarkdownProps>
  /** VS Code's own drop-down picker (the Settings page's choices). */
  Select: ElementConstructor<SelectProps>
  /** VS Code's vector drawing (the Live tab's tracks and token bars). */
  Svg: ElementConstructor<SvgProps>
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

/** The mode switch's label in VS Code: "Switch to approve merge" in auto (and off), "Switch to auto merge" in review. */
export const switchLabel = (m: SymccMode) => `Switch to ${MODE_NAME[nextMode(m)]}`

/** The color of a status's dot in the counts badges (the same as the list's marks). */
const COUNT_COLOR: Record<string, string> = { backlog: 'inactive', review: 'suggestion', waiting: 'warning', failed: 'error', doing: 'success', paused: 'permission', todo: 'text', done: 'inactive', dropped: 'inactive' }

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

/** T-973: the tests line of the Live tab's Status section: "claude, typecheck · 45 min · 2 retries" (the tests, the
 *  time limit, the retries; how many run at once is in the Mode row's "agents 0/3 busy"). */
export function testsValue(v: Pick<PaneView, 'test_commands' | 'max_minutes' | 'auto_retries'>): { tests: string; limits: string } {
  const d = emptyBoard()
  const retries = v.auto_retries ?? d.auto_retries
  return { tests: shortTests(v.test_commands ?? []), limits: `${v.max_minutes ?? d.max_minutes} min · ${retries} ${retries === 1 ? 'retry' : 'retries'}` }
}

/**
 * The header in VS Code, each line wrapped to the panel (never cut) (T-973: the setup facts moved to the Live tab's Status):
 *  - on the left the logo (the single 𝄞 glyph, large and bold in the accent color: VS Code's font breaks the terminal's
 *    multi-row clef apart, so it is one still glyph here), and beside it the name, version and folder, then the mode as
 *    plain bold words ( its meaning is in the Live tab's Status section);
 *  - a notice row when another window drives the board (vsNotice: "⚠ this window follows; /symcc-drive to drive from
 *    here", the command a quiet Button that drives from here, `onDrive`);
 *  - the counts ("● 2 doing · 6 to do · 1 waiting for you"), and the "no git" row (`gitRow`).
 * A warning line when symcc is disabled sits under the name.
 */
export function vsBanner(k: VsKit, v: PaneView, mode: SymccMode, gitRow: RenderChildren[], onDrive: () => void = () => {}): RenderChildren[] {
  const { Box, Text, C } = k
  const d = emptyBoard()
  const name = namesFor(S.N.name)
  const folder = folderName(S.root)
  const off = v.on_here === false ? offStatusParts(S.N.name, true, v.off_here, v.driver, k.nowMs) : []
  const driving = v.driving ?? S.driving
  const retries = v.auto_retries ?? d.auto_retries
  const counts = bannerCounts({ ...v, max_parallel: v.max_parallel ?? d.max_parallel, max_minutes: v.max_minutes ?? d.max_minutes, auto_retries: retries, mode }, k.nowMs)
  return [
    <Box key="vs-top" flexDirection="row" gap={1} alignItems="center">
      <Box key="vs-logo" flexDirection="column" flexShrink={0}>
        <Text key="vs-logo-glyph" bold size="title" color={C('ide')}>{ICON}</Text>
      </Box>
      <Box key="vs-facts" flexDirection="column" flexGrow={1} flexShrink={1}>
        <Box key="vs-title-row" flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
          <Text key="vs-title" wrap="wrap">
            <Text bold color={C('ide')}>{name.name}</Text>
            {S.version ? <Text color={C('inactive')}>{versionMark(S.version)}</Text> : null}
            {folder ? <Text color={C('inactive')}>{` · ${folder}`}</Text> : null}
          </Text>
          <Box key="vs-mode" flexDirection="row" flexShrink={0}>
            <Text bold color={C(modeColor(mode))}>{modeLabel(mode)}</Text>
          </Box>
        </Box>
        {off.length ? (
          <Text key="vs-off" wrap="wrap" color={C('warning')}>
            {off.map(p => (p.command ? <Text bold color={C('ide')}>{p.text}</Text> : p.text))}
          </Text>
        ) : null}
      </Box>
    </Box>,
    // T-643/T-694/T-973: a session that doesn't drive says so in one notice row, with how to take over
    ...(driving ? [] : [vsNotice(k, 'vs-drive', driveNoticeParts(v.tasks ?? [], k.nowMs, S.N.name, Infinity, v.driver), onDrive)]),
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

/** T-973: a row's background while the pointer is over it: a grey that is faint on light and dark themes alike. */
export const ROW_HOVER = '#80808024'
/** T-1002: what sits between two tabs: two em spaces (a Markdown block keeps them, it folds plain spaces). */
const TAB_GAP = '\u2003\u2003'

/**
 * T-1002: the tab bar in VS Code, one Markdown line (`tabs-row`): the shown tab bold, the others links ("Tasks 20" with its
 * count as plain words). No bar, no pill, no rule. Hidden Buttons `tab-<which>` (in a Box drawn `display="none"`, no
 * hotkey) answer a press on a tab by its key, as a link press does.
 */
export function vsTabs(k: VsKit, tabs: VsTab[]): RenderChildren {
  const { Box, Button } = k
  const text = tabs.map(t => (t.active ? `**${mdText(tabLabel(t))}**` : mdLink(tabLabel(t), vsHref('tab', t.which)))).join(TAB_GAP)
  return (
    <Box key="vs-tabs" flexDirection="column">
      {vsLink(k, 'tabs-row', text, tabs.map(t => [vsHref('tab', t.which), t.onPress]))}
      <Box key="tab-keys" display="none">
        {tabs.map(t => (
          <Button key={`tab-${t.which}`} label={t.label} onPress={t.onPress} />
        ))}
      </Box>
    </Box>
  )
}

/** T-1002: a row of cells in VS Code. Every cell is a Box with a set width (`width`, kept at that size) or, with none,
 *  `flexGrow` and `flexShrink`; a link inside a cell stays on the row's one line instead of dropping onto its own. */
export type VsCell = { key: string; node: RenderChildren; width?: number }
export function vsRow(k: VsKit, key: string, cells: readonly VsCell[]): RenderChildren {
  const { Box } = k
  return (
    <Box key={key} flexDirection="row" columnGap={1}>
      {cells.map(c => (
        <Box key={`${key}-${c.key}`} flexDirection="row" {...(c.width === undefined ? { flexGrow: 1, flexShrink: 1 } : { width: c.width, flexShrink: 0 })}>
          {c.node as never}
        </Box>
      ))}
    </Box>
  )
}

/**
 * T-973: a notice row in VS Code ("⚠ this window follows; /symcc-drive to drive from here"): a Box with no
 * border (T-1002), the words in the text color, a slash command a quiet
 * plain Button (`<key>-cmd`) that does what the command does (`onCommand`).
 */
export function vsNotice(k: VsKit, key: string, parts: readonly { text: string; command?: boolean }[], onCommand: () => void): RenderChildren {
  const { Box, Text, Button, C } = k
  return (
    <Box key={key} flexDirection="row" flexWrap="wrap" alignItems="center" >
      <Text key={`${key}-mark`} bold color={C('warning')}>{'⚠ '}</Text>
      {parts.map((p, i) =>
        p.command ? (
          <Box key={`${key}-cmd-box`} flexDirection="row">
            <Button key={`${key}-cmd`} plain label={p.text} hover={{ underline: true }} onPress={onCommand}>
              <Text bold color={C('ide')}>{p.text}</Text>
            </Button>
          </Box>
        ) : (
          <Text key={`${key}-${i}`} wrap="wrap" color={C('text')}>{p.text}</Text>
        ),
      )}
    </Box>
  )
}

/**
 * T-973: a section heading in VS Code, like VS Code's side bar: a plain Button (`<key>`) with the chevron (▾ open,
 * ▸ folded) and the name in small bold UPPERCASE (a press folds or opens it), then `count` as a badge on the right
 * when it has one; `extra`: more at its right end (a quiet "All notes" button). The row lightens under the pointer.
 */
export function vsSectionHead(k: VsKit, key: string, name: string, open: boolean, onToggle: () => void, count?: number | string, extra?: RenderChildren): RenderChildren {
  const { Box, Text, Button, C } = k
  return (
    <Box key={`${key}-row`} flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={1} hover={{ backgroundColor: ROW_HOVER }}>
      <Button key={key} plain label={`${open ? '▾' : '▸'} ${name.toUpperCase()}`} onPress={onToggle}>
        <Text size="footnote" color={C('inactive')}>{open ? '▾ ' : '▸ '}</Text>
        <Text bold size="footnote" color={C('text')}>{name.toUpperCase()}</Text>
      </Button>
      <Box key={`${key}-end`} flexDirection="row" columnGap={1} alignItems="center">
        {extra ?? null}
        {count === undefined ? null : vsBadge(k, `${key}-count`, count, 'inactive')}
      </Box>
    </Box>
  )
}

/** T-1002: the one label column's width in VS Code: "Agent time" (10) and a space. */
export const VS_LABEL_W = 11

/**
 * T-973: a label/value block in VS Code (the Live tab's Status and Today): one row each (`<key>-<row key>`), the labels
 * dim in one column as wide as the longest, the values beside them wrapping in their own column; a row's background
 * lightens under the pointer.
 */
export function vsFacts(k: VsKit, key: string, rows: readonly { key: string; label: string; value: RenderChildren }[]): RenderChildren {
  const { Box, Text, C } = k
    return (
    <Box key={key} flexDirection="column">
      {rows.map(r => (
        <Box key={`${key}-${r.key}`} flexDirection="row" hover={{ backgroundColor: ROW_HOVER }}>
          <Box key={`${key}-${r.key}-label`} flexDirection="row" flexShrink={0} width={VS_LABEL_W}>
            <Text color={C('inactive')}>{r.label}</Text>
          </Box>
          <Box key={`${key}-${r.key}-value`} flexDirection="row" flexWrap="wrap" flexGrow={1} flexShrink={1} columnGap={1} alignItems="center">
            {r.value as never}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

/** The footer in VS Code (T-1002: no rule and no hint): on the Tasks page the mode switch as a link and the search box;
 *  nothing else. `rule` is ignored (the Live tab still passes it). `extra`: more beside the switch ("Clear search"). */
export function vsFooter(k: VsKit, name: string, opts: { mode?: SymccMode; onSwitch?: () => void; search?: RenderChildren; extra?: RenderChildren; rule?: boolean } = {}): RenderChildren {
  const { Box } = k
  const to = opts.mode ? vsHref('mode', nextMode(opts.mode)) : ''
  return (
    <Box key={`${name}-footer`} flexDirection="column">
      {opts.mode && opts.onSwitch ? (
        vsRow(k, 'footer-mode', [
          { key: 'switch', node: vsLink(k, 'mode', mdLink(switchLabel(opts.mode), to), [[to, opts.onSwitch]]) },
          ...(opts.extra ? [{ key: 'extra', node: opts.extra }] : []),
        ])
      ) : null}
      {opts.search ?? null}
    </Box>
  )
}

/** A small label in VS Code ("editing", "replaced"): T-1002, plain words in `tone`'s color, no box. Put it in a row Box. */
export const vsBadge = (k: VsKit, key: string, text: string | number, tone: string): RenderChildren => (
  <k.Box key={key} flexDirection="row" flexShrink={0}>
    <k.Text color={k.C(tone)}>{String(text)}</k.Text>
  </k.Box>
)

/** A section heading in VS Code: the status mark in its color, the name bold, then the count in plain dim words
 *  ("▶ Doing 2"). */
export function vsHeading(k: VsKit, key: string, mark: string, tone: string, label: string, n: number): RenderChildren {
  const { Box, Text, C } = k
  return (
    <Box key={key} flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
      <Text key={`${key}-name`} bold wrap="wrap">
        <Text color={C(tone)}>{`${mark} `}</Text>
        <Text color={C('text')}>{label}</Text>
      </Text>
      {vsBadge(k, `${key}-count`, n, 'inactive')}
    </Box>
  )
}

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
/** What a cut title ends with (see twoLines). */
export const MORE = ' (more)'
/** What a row with an empty title (or question text) shows, dim, beside its id: never "****" from empty bold marks. */
export const NO_TITLE = '(no title)'

/** A section heading in VS Code: plain bold words in the text color, no fold ("What to do"). */
export function vsSection(k: VsKit, key: string, label: string): RenderChildren {
  const { Text, C } = k
  return (
    <Text key={key} wrap="wrap" bold color={C('text')}>
      {label}
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
