// T-973: the VS Code board's tab bar as the tests read it (hooks/claude/ui/vscode.tsx vsTabs): each tab a plain Button
// (`tab-<which>`), the shown one not dim with the accent mark under it (`tab-mark-<which>`), a count as a badge Box
// (`tab-count-<which>`) with a rounded border and a background.

type Found = { type?: string; text?: string; props: Record<string, unknown> } | undefined
type Finder = { find: (q: { key: string }) => Promise<unknown> }

export const TAB_NAMES = ['live', 'tasks', 'scouts', 'settings'] as const

export type TabRead = { which: string; type?: string; label?: string; plain: boolean; dim: boolean; marked: boolean; count?: string; badge?: unknown[] }

/** Each tab of the bar, in order, as drawn. */
export async function tabBar(ui: Finder): Promise<TabRead[]> {
  const out: TabRead[] = []
  for (const which of TAB_NAMES) {
    const b = (await ui.find({ key: `tab-${which}` })) as Found
    const c = (await ui.find({ key: `tab-count-${which}` })) as Found
    const m = (await ui.find({ key: `tab-mark-${which}` })) as Found
    out.push({
      which,
      type: b?.type,
      label: b?.props.label as string | undefined,
      plain: b?.props.plain === true,
      dim: b?.props.dimColor === true,
      marked: !!m,
      ...(c ? { count: c.text, badge: [c.type, c.props.borderStyle, c.props.backgroundColor] } : {}),
    })
  }
  return out
}

/** The tab bar a page should have: `shown` the one shown, `counts` the Tasks and Scouts counts. */
export function wantTabs(shown: (typeof TAB_NAMES)[number], counts: { tasks: number; scouts: number }): TabRead[] {
  const label = { live: 'Live', tasks: 'Tasks', scouts: 'Scouts', settings: 'Settings' } as const
  return TAB_NAMES.map(which => ({
    which,
    type: 'Button',
    label: label[which],
    plain: true,
    dim: which !== shown,
    marked: which === shown,
    ...(which === 'tasks' || which === 'scouts' ? { count: String(counts[which]), badge: ['Box', 'round', 'inactive'] } : {}),
  }))
}
