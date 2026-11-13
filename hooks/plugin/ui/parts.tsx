// What every page of the board panel shares: the view it shows, the banner, the tabs, key hints and text styles.
import type { MatchedHook } from 'claude-code'
import type { SymccMode } from '../../../types'
import { STATUS_WORD, sortScouts, modeOf, nextMode, emptyBoard, type BannerTone, bannerLines, modeLabel, modeButton, bannerRule, bannerStrip, type KeyHint, hintLines, packRows } from '../../board'
import { setupGit } from '../git'
import { type $, type PaneView, readView, readOpened, S, readTab } from '../state'
import { tellLead } from '../tell'
import { setBoardMode } from '../workers'
import { type PaneTab, resetPane } from './open'

export type PaneHook = MatchedHook<'ui.render', { component: 'Pane' }>
export type PaneEvent = Parameters<PaneHook>[1]

/** What every page of the board panel draws with: the elements, the view, and the shared pieces (banner, tabs, key hints, text). */
export async function paneParts($: $, e: PaneEvent) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const v: PaneView = await readView($)
  const open = await readOpened($)
  const width = Math.max(20, e.props.bodyColumns ?? 60)
  // Theme colors, so the board reads well in both light and dark themes.
  const color: Record<string, string> = { backlog: 'subtle', review: 'suggestion', waiting: 'warning', failed: 'error', doing: 'success', paused: 'permission', todo: 'text', done: 'inactive', dropped: 'inactive' }
  const word: Record<string, string> = STATUS_WORD
  const mark: Record<string, string> = { backlog: '◇', review: '◆', waiting: '?', failed: '✗', doing: '▶', paused: '‖', todo: '○', done: '✓', dropped: '–' }
  const act = (fn: () => Promise<unknown>) => () => void fn().catch((err: Error) => $.ui.toast(S.N.toast(err.message)))
  const tabNow = await readTab($)
  const onScouts = tabNow === 'scouts'
  const onSettings = tabNow === 'settings'
  const t = open && !onScouts && !onSettings ? v.tasks.find(x => x.id === open) : undefined
  const C = (c: string) => c as never
  const scouts = sortScouts(Array.isArray(v.scouts) ? v.scouts : [])
  const mode = modeOf(v)
  /** What the m key switches to: review and auto swap; from off it goes to review (m never turns the board off). */
  const switchTo: SymccMode = nextMode(mode)
  const target = v.target_branch ?? emptyBoard().target_branch
  /** Switches the board mode between review and auto, the same as /<name>-mode with no word. */
  const switchMode = act(async () => {
    const r = await setBoardMode($, switchTo, 'you')
    $.ui.toast(S.N.toast(r))
    tellLead($, `The owner set the board mode to ${switchTo} from the board: ${r}`)
  })
  /** The banner at the top: the drawing, the board's facts and the board mode. */
  const banner = () => {
    const d = emptyBoard()
    const facts = { ...v, target_branch: v.target_branch ?? d.target_branch, max_parallel: v.max_parallel ?? d.max_parallel, max_minutes: v.max_minutes ?? d.max_minutes, auto_retries: v.auto_retries ?? d.auto_retries }
    const tone: Record<BannerTone, string> = { accent: 'ide', plain: 'text', dim: 'subtle', warning: 'warning' }
    return [
      ...bannerLines(facts, S.root, S.home, v.driving ?? S.driving, width, Date.now(), S.N.name).map((l, i) => (
        <Text key={`banner-${i}`} wrap="truncate">
          {l.art ? <Text color={C(l.art.trim() ? 'ide' : 'subtle')}>{l.art}</Text> : null}
          {l.parts.map(p => (
            <Text bold={p.bold} color={C(tone[p.tone])}>{p.text}</Text>
          ))}
        </Text>
      )),
      // the status strip, right under the counts line: workers and scouts (the banner shows the name and mode)
      <Text key="status-strip" wrap="truncate" bold color={C(v.enabled === false || mode === 'off' ? 'warning' : 'text')}>
        {bannerStrip({ ...v, mode }, Date.now(), width, S.N.name)}
      </Text>,
      <Box key="banner-mode" flexDirection="row">
        <Text wrap="truncate">
          <Text bold color={C(mode === 'off' ? 'warning' : mode === 'review' ? 'suggestion' : 'text')}>{modeLabel(mode)}</Text>{' '}
        </Text>
        <Button key="mode" label={modeButton(mode)} hotkey="m" dimColor onPress={switchMode} />
      </Box>,
      ...(v.git_state === 'no-repo' || v.git_state === 'no-commits'
        ? [
            <Box key="banner-git" flexDirection="row">
              <Text wrap="truncate" color={C('warning')}>{v.git_state === 'no-repo' ? 'No git repo here; nothing starts. ' : 'No commits yet; nothing starts. '}</Text>
              <Button key="setup-git" label="Set up git (g)" hotkey="g" onPress={act(async () => $.ui.toast(S.N.toast(await setupGit($, 'you'))))} />
            </Box>,
          ]
        : []),
    ]
  }
  /** The tab row under the banner: "[t] Tasks (12) │ [s] Scouts (3) │ [c] Settings", the active one bold in the accent color. "t", "s" and "c" switch. */
  const tabs = () => {
    const go = (which: PaneTab) => act(async () => ((S.draft = null), (S.naming = null), (S.diffOpen = null), (S.rejecting = null), (S.settingEdit = null), (S.settingPick = null), await resetPane($, which)))
    const one = (which: PaneTab, label: string) => {
      const active = which === 'scouts' ? onScouts : which === 'settings' ? onSettings : !onScouts && !onSettings
      return (
        <Button key={`tab-${which}`} hotkey={which === 'settings' ? 'c' : which[0]} onPress={go(which)}>
          <Text bold={active} color={C(active ? 'ide' : 'inactive')}>{label}</Text>
        </Button>
      )
    }
    return (
      <Box key="tabs" flexDirection="row">
        {one('tasks', `[t] Tasks (${v.tasks.length})`)}
        <Text color={C('subtle')}> │ </Text>
        {one('scouts', `[s] Scouts (${scouts.length})`)}
        <Text color={C('subtle')}> │ </Text>
        {one('settings', '[c] Settings')}
      </Box>
    )
  }
  /** The whole header: banner, then the tab row, then the rule under them. */
  const header = () => [...banner(), tabs(), <Text key="header-rule" wrap="truncate" color={C('ide')}>{bannerRule(width)}</Text>]
  /** Key hints over as many lines as the width needs, broken only between hints: keys bold, words in the inactive color (readable on dark themes too). */
  const keyLines = (hints: KeyHint[], name: string) =>
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
  return { Box, Text, Button, Input, v, width, color, word, mark, act, onScouts, onSettings, t, C, scouts, mode, target, banner, tabs, header, keyLines, buttonRows, rich, heading, paragraphs }
}
export type PaneParts = Awaited<ReturnType<typeof paneParts>>
