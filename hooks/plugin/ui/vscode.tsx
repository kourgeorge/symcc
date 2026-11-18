// The board panel's own pieces for VS Code's side panel (see surface.ts): a header on readable, wrapped lines, tabs
// you click, a footer with real buttons and no key hints, small section headings and fold rows. The Tasks page uses
// them, and so do the task page (vscode-task.tsx) and the Scouts and Settings pages (vscode-scouts.tsx, vscode-settings.tsx).
import type { SymccMode } from '../../../types'
import type { BoxProps, ButtonProps, ElementConstructor, InputProps, MarkdownProps, RenderChildren, RenderSurface, SelectProps, TextProps } from 'claude-code'
import { emptyBoard, bannerLines, folderName, shortHome, versionMark, modeLabel, MODE_MEANING, MODE_NAME, nextMode, offStatusLine, footerRule } from '../../board'
import { namesFor } from '../../name'
import { type PaneView, S } from '../state'
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

/** The header's lines in VS Code, each wrapped to the panel (never cut): name and folder, the folder's path, branch and
 *  who drives, the mode and what it means, the tests and limits, and the counts. `gitRow` is the "no git" warning row. */
export function vsBanner(k: VsKit, v: PaneView, mode: SymccMode, gitRow: RenderChildren[]): RenderChildren[] {
  const { Text, C } = k
  const d = emptyBoard()
  const name = namesFor(S.N.name)
  const folder = folderName(S.root)
  const off = v.enabled === false ? offStatusLine(S.N.name) : ''
  const driving = v.driving ?? S.driving
  const cmds = v.test_commands ?? []
  const limits = `${v.max_parallel ?? d.max_parallel} at once · ${v.max_minutes ?? d.max_minutes} min · ${v.auto_retries ?? d.auto_retries} ${(v.auto_retries ?? d.auto_retries) === 1 ? 'retry' : 'retries'}`
  // the counts line is the banner's own (the last line when there are tasks), drawn whole here
  const lines = bannerLines({ ...v, max_parallel: v.max_parallel ?? d.max_parallel, max_minutes: v.max_minutes ?? d.max_minutes, auto_retries: v.auto_retries ?? d.auto_retries, mode }, S.root, S.home, driving, 1_000_000, k.nowMs, S.N.name, [], S.version)
  const counts = (v.tasks.length || (v.archived?.done ?? 0)) && lines.length > 3 ? lines[lines.length - 1]!.parts.map(p => p.text).join('') : ''
  return [
    <Text key="vs-title" wrap="wrap">
      <Text bold color={C('ide')}>{name.name}</Text>
      {S.version ? <Text color={C('inactive')}>{versionMark(S.version)}</Text> : null}
      <Text bold color={C('ide')}> board</Text>
      {folder ? <Text color={C('inactive')}>{` · ${folder}`}</Text> : null}
    </Text>,
    ...(off ? [<Text key="vs-off" wrap="wrap" color={C('warning')}>{off}</Text>] : []),
    ...(S.root ? [<Text key="vs-path" wrap="wrap" color={C('inactive')}>{shortHome(S.root, S.home)}</Text>] : []),
    <Text key="vs-branch" wrap="wrap">
      {v.branch_note ? <Text color={C('warning')}>{v.branch_note}</Text> : <Text color={C('inactive')}>{v.branch ? `branch ${v.branch}` : 'no branch'}</Text>}
      <Text color={C('subtle')}> · </Text>
      <Text color={C('inactive')}>{driving ? 'this session drives' : 'driven by another session'}</Text>
    </Text>,
    <Text key="vs-mode" wrap="wrap">
      <Text color={C('inactive')}>mode </Text>
      <Text bold color={C(modeColor(mode))}>{modeLabel(mode)}</Text>
      <Text color={C('inactive')}>{`: ${MODE_MEANING[mode]}`}</Text>
    </Text>,
    cmds.length ? (
      <Text key="vs-tests" wrap="wrap" color={C('inactive')}>{`tests: ${shortTests(cmds)}`}</Text>
    ) : (
      <Text key="vs-tests" wrap="wrap" color={C('warning')}>no test command</Text>
    ),
    <Text key="vs-limits" wrap="wrap" color={C('inactive')}>{limits}</Text>,
    ...(counts ? [<Text key="vs-counts" wrap="wrap" bold color={C('text')}>{counts}</Text>] : []),
    ...gitRow,
  ]
}

/** The tabs in VS Code: three plain buttons, "● Tasks (20)" bold in the accent color for the one shown, the others
 *  without the dot in the secondary color; no key labels. */
export function vsTabs(k: VsKit, tabs: { which: PaneTab; label: string; active: boolean; onPress: () => void }[]): RenderChildren {
  const { Box, Text, Button, C } = k
  return (
    <Box key="tabs" flexDirection="row" flexWrap="wrap" gap={1}>
      {tabs.map(t => {
        const label = t.active ? `● ${t.label}` : t.label
        return (
          <Button key={`tab-${t.which}`} plain label={label} onPress={t.onPress}>
            <Text bold={t.active} underline={t.active} color={C(t.active ? 'ide' : 'inactive')}>{label}</Text>
          </Button>
        )
      })}
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

/** A small section heading in VS Code: the status mark in its color, then the name and count ("▶ Doing (2)"). */
export function vsHeading(k: VsKit, key: string, mark: string, tone: string, label: string, n: number): RenderChildren {
  const { Text, C } = k
  return (
    <Text key={key} bold>
      <Text color={C(tone)}>{`${mark} `}</Text>
      <Text color={C('text')}>{`${label} (${n})`}</Text>
    </Text>
  )
}

/** A fold row in VS Code: a plain button that reads as a heading ("▸ Backlog (6)", "▾ Done (3)"). */
export function vsFold(k: VsKit, key: string, label: string, n: number | string, open: boolean, onPress: () => void, top = true, autoFocus?: true): RenderChildren {
  const { Button, Text, C } = k
  const text = `${open ? '▾' : '▸'} ${label} (${n})`
  return (
    <Button key={key} plain label={text} autoFocus={autoFocus} onPress={onPress}>
      <Text bold={top} color={C(top ? 'text' : 'inactive')}>{text}</Text>
    </Button>
  )
}

/** A section heading on VS Code's task page: plain words, bold, in the heading color ("What to do"). */
export function vsSection(k: VsKit, key: string, label: string): RenderChildren {
  const { Text, C } = k
  return (
    <Text key={key} wrap="wrap" bold color={C('suggestion')}>
      {label}
    </Text>
  )
}
