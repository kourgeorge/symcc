// T-1002: the VS Code board's tab bar as the tests read it (hooks/claude/ui/vscode.tsx vsTabs): one Markdown line
// (`tabs-row`), the shown tab bold, the others links with the count as plain words. No pill, mark or rule.

type Found = { type?: string; text?: string; props: Record<string, unknown> } | undefined
type Finder = { find: (q: { key: string }) => Promise<unknown> }

export const TAB_NAMES = ['live', 'tasks', 'scouts', 'settings'] as const

export type TabRead = { type?: string; text?: string; pressable: string[] }

/** The tab bar, as drawn: its Markdown text and the links a press answers. */
export async function tabBar(ui: Finder): Promise<TabRead> {
  const b = (await ui.find({ key: 'tabs-row' })) as Found
  return { type: b?.type, text: b?.props.text as string | undefined, pressable: (b?.props.pressableLinks as string[] | undefined) ?? [] }
}

/** The tab bar a page should have: `shown` the one shown, `counts` the Tasks and Scouts counts. */
export function wantTabs(shown: (typeof TAB_NAMES)[number], counts: { tasks: number; scouts: number }): TabRead {
  const label = { live: 'Live', tasks: 'Tasks', scouts: 'Scouts', settings: 'Settings' } as const
  const words = (which: (typeof TAB_NAMES)[number]) => (which === 'tasks' || which === 'scouts' ? `${label[which]} ${counts[which]}` : label[which])
  const href = (which: string) => `https://symcc.invalid/tab/${which}`
  return {
    type: 'Markdown',
    text: TAB_NAMES.map(which => (which === shown ? `**${words(which)}**` : `[${words(which)}](${href(which)})`)).join('  '),
    pressable: TAB_NAMES.map(which => href(which)),
  }
}
