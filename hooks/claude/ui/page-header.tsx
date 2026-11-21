// The 4-line header of a task's page and a scout's page on the Claude Code boards (T-751; the lines themselves are
// core's, see core/page-header.ts): where you are (Back, and the place in the list with prev/next), the title, the
// state, the buttons in groups, then a heavy rule.
// On the terminal every button (Back too) is a `plain` Button drawn "[Label]" in the text color, all alike (T-775; no
// key inside it): the keys belong to hidden Buttons in a Box drawn `display="none"` (`<id>-key`), as the tab keys and
// the answer keys, and are listed in the footer only. Desktop and mobile draw native buttons, all secondary. VS Code
// draws the same 4 lines with its own controls (vsPageHeader), all secondary too.
import type { RenderChildren } from 'claude-code'
import type { Seg } from '../../board'
import { type HeaderButton, type PageFrom, type Place, BACK_ARROW, backText, groupSegLines, headerRule, inGroups, packGroups, PILL_COLOR, pillText, titleLines, whereLine, ITEM_GAP } from '../../core/page-header'
import type { PaneParts } from './parts'

/** What a page header shows and what its buttons do. `label`: the task's id or the scout's name; `place`: its place
 *  in the list it was opened from (null: not in it); `title`: line 2's words and the color of the label there. */
export type PageHeader = {
  from: PageFrom
  label: string
  place: Place | null
  title: string
  color: string
  state: Seg[][]
  buttons: (HeaderButton & { onPress: () => void })[]
  onBack: () => void
  onPrev: () => void
  onNext: () => void
  /** Back takes the focus when the page opens (not while a box or an answer waits) */
  backFocus?: boolean
  /** the keys of prev and next (k and j) */
  nav: { prev: string; next: string }
  /** the Back button's element key ('back' when not given) */
  backKey?: string
}

/** The header on the terminal, desktop and mobile. */
export function pageHeader(pane: PaneParts, hd: PageHeader): RenderChildren {
  const { Box, Text, Button, C, width } = pane
  const terminal = pane.vs.surface === 'terminal'
  const segs = (key: string, l: Seg[]) => (
    <Text key={key}>
      {l.map((g, i) => (
        <Text key={`${key}-${i}`} bold={g.bold} italic={g.italic} color={C(g.color)}>
          {g.text}
        </Text>
      ))}
    </Text>
  )
  const where = whereLine(hd.from, hd.label, hd.place, width)
  const goes = { back: hd.onBack, prev: hd.onPrev, next: hd.onNext }
  const whereRow = (
    <Box key="hdr-where" flexDirection="row">
      {[...where.left, { text: ' '.repeat(where.pad) }, ...where.right].map((p, i) =>
        'go' in p && p.go === 'back' && !terminal ? (
          <Button key={hd.backKey ?? 'back'} label={backText(hd.from)} variant="secondary" autoFocus={hd.backFocus ? true : undefined} onPress={hd.onBack} />
        ) : 'go' in p && p.go ? (
          <Button key={p.go === 'back' ? (hd.backKey ?? 'back') : p.go} plain label={p.go === 'back' ? backText(hd.from) : p.go === 'prev' ? 'Previous' : 'Next'} autoFocus={p.go === 'back' && hd.backFocus ? true : undefined} onPress={goes[p.go]}>
            <Text color={C(p.go === 'back' ? PILL_COLOR : 'inactive')}>{p.text}</Text>
          </Button>
        ) : (
          <Text key={`hdr-where-${i}`} color={C('inactive')}>{p.text}</Text>
        ),
      )}
    </Box>
  )
  const groups = inGroups(hd.buttons)
  const rows = packGroups(groups.map(g => g.map(b => pillText(b).length)), width)
  const pill = (b: PageHeader['buttons'][number]) => {
    if (b.fact) return <Text key={b.id} color={C('inactive')}>{b.label}</Text>
    if (!terminal) return <Button key={b.id} label={b.label} variant="secondary" onPress={b.onPress} />
    return (
      <Button key={b.id} plain label={b.label} onPress={b.onPress}>
        <Text color={C(PILL_COLOR)}>{pillText(b)}</Text>
      </Button>
    )
  }
  const keyed = hd.buttons.filter(b => b.key && !b.fact)
  return (
    <Box key="page-header" flexDirection="column">
      {whereRow}
      <Box key="hdr-title" flexDirection="column">
        {titleLines(hd.label, hd.title, hd.color, width).map((l, i) => segs(`hdr-title-${i}`, l))}
      </Box>
      <Box key="hdr-state" flexDirection="column">
        {groupSegLines(hd.state, width).map((l, i) => segs(`hdr-state-${i}`, l))}
      </Box>
      {rows.map((row, i) => (
        <Box key={`hdr-buttons-${i}`} flexDirection="row">
          {row.flatMap(({ g, i: j, gap }) => [...(gap ? [<Text key={`hdr-gap-${g}-${j}`}>{' '.repeat(gap)}</Text>] : []), pill(groups[g]![j]!)])}
        </Box>
      ))}
      <Box key="hdr-keys" display="none">
        <Button key={`${hd.backKey ?? 'back'}-key`} label="b" hotkey="b" onPress={hd.onBack} />
        {hd.place && hd.place.of > 1 ? <Button key="prev-key" label={hd.nav.prev} hotkey={hd.nav.prev} onPress={hd.onPrev} /> : null}
        {hd.place && hd.place.of > 1 ? <Button key="next-key" label={hd.nav.next} hotkey={hd.nav.next} onPress={hd.onNext} /> : null}
        {keyed.map(b => (
          <Button key={`${b.id}-key`} label={b.key!} hotkey={b.key!} onPress={b.onPress} />
        ))}
      </Box>
      <Box key="hdr-rule" flexDirection="column">
        <Text wrap="truncate" color={C('ide')}>{headerRule(width)}</Text>
      </Box>
    </Box>
  )
}

/** The header in VS Code's side panel: "‹" and a Tasks back button, a "‹ 2 of 6 ›" pager, the title as a heading,
 *  the state as small chips, the buttons (all secondary, one style, T-775), then a divider. */
export function vsPageHeader(pane: PaneParts, hd: PageHeader): RenderChildren {
  const { Box, Text, Button, C } = pane
  const chip = (key: string, g: Seg[], first: boolean) =>
    <Box key={key} flexDirection="row">
      {first ? (
        <Text bold size="caption" backgroundColor={C(g[0]?.color ?? 'inactive')} color={C('inverseText')}>{` ${g.map(x => x.text).join('')} `}</Text>
      ) : (
        <Text size="caption" wrap="wrap">
          {g.map((x, i) => (
            <Text key={`${key}-${i}`} bold={x.bold} italic={x.italic} color={C(x.color)}>{x.text}</Text>
          ))}
        </Text>
      )}
    </Box>
  const status = hd.state[0] ?? []
  const button = (b: PageHeader['buttons'][number]) => {
    if (b.fact) return <Text key={b.id} color={C('inactive')}>{b.label}</Text>
    return <Button key={b.id} label={b.label} variant="secondary" onPress={b.onPress} />
  }
  return (
    <Box key="vs-page-header" flexDirection="column" gap={1}>
      <Box key="vs-where" flexDirection="row" justifyContent="space-between" flexWrap="wrap">
        <Box key="vs-back" flexDirection="row" columnGap={1}>
          <Text color={C('inactive')}>{BACK_ARROW.trim()}</Text>
          <Button key={hd.backKey ?? 'back'} label={backText(hd.from)} variant="secondary" autoFocus={hd.backFocus ? true : undefined} onPress={hd.onBack} />
        </Box>
        {hd.place && hd.place.of > 1 ? (
          <Box key="vs-pager" flexDirection="row" columnGap={1}>
            <Button key="prev" label="‹" variant="secondary" onPress={hd.onPrev} />
            <Text color={C('inactive')}>{`${hd.place.n} of ${hd.place.of}`}</Text>
            <Button key="next" label="›" variant="secondary" onPress={hd.onNext} />
          </Box>
        ) : null}
      </Box>
      <Box key="vs-head" flexDirection="column">
        <Text key="vs-title" wrap="wrap" bold size="title">
        <Text key="vs-title-id" bold size="title" color={C(hd.color)}>{hd.label}</Text>
        <Text key="vs-title-gap">{'  '}</Text>
        <Text key="vs-title-text" wrap="wrap" bold size="title" color={C('text')}>{hd.title}</Text>
      </Text>
      </Box>
      <Box key="vs-state" flexDirection="row" flexWrap="wrap" columnGap={2}>
        {chip('vs-state-status', status, true)}
        {hd.state.slice(1).map((g, i) => chip(`vs-state-${i + 1}`, g, false))}
      </Box>
      <Box key="vs-actions" flexDirection="row" flexWrap="wrap" columnGap={ITEM_GAP} rowGap={1}>
        {inGroups(hd.buttons).flatMap((g, i) => [...(i ? [<Text key={`vs-gap-${i}`}>{'   '}</Text>] : []), ...g.map(button)])}
      </Box>
      <Box key="vs-header-rule" flexDirection="column">
        <Text wrap="truncate" color={C('ide')}>{headerRule(pane.width)}</Text>
      </Box>
    </Box>
  )
}
