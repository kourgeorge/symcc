// The Scouts and Settings pages the surface tests draw (vscode-scouts-settings.test.tsx): each scene seeds the board
// and presses its way to one page. scouts-settings-snapshot.ts holds the trees the terminal, the desktop and mobile
// drew for these scenes before the VS Code Scouts and Settings pages (T-415).
import type { On } from 'claude-code'
import { SETTING_GROUPS } from '../hooks/board'
import { SCOUT_PAGES, seedScouts } from './scouts-settings-fixture'

type Mount = { press: (t: { key: string }) => Promise<unknown> }

export type Scene = { name: string; seed: (on: On) => void; go: (ui: Mount) => Promise<void> }

const openGroups = async (ui: Mount) => {
  for (const g of SETTING_GROUPS) await ui.press({ key: `group:${g.title}` })
}

export const SCENES: Scene[] = [
  { name: 'scouts list', seed: on => seedScouts(on, 'scouts'), go: async () => {} },
  { name: 'scouts new', seed: on => seedScouts(on, 'scouts'), go: async ui => void (await ui.press({ key: 'scout-new' })) },
  ...SCOUT_PAGES.map(s => ({ name: `scout ${s}`, seed: (on: On) => seedScouts(on, 'scouts', s), go: async () => {} })),
  { name: 'settings closed', seed: on => seedScouts(on, 'settings'), go: async () => {} },
  { name: 'settings open', seed: on => seedScouts(on, 'settings'), go: openGroups },
  { name: 'settings pick mode', seed: on => seedScouts(on, 'settings'), go: async ui => (await openGroups(ui), void (await ui.press({ key: 'setting:mode' }))) },
  { name: 'settings pick notify', seed: on => seedScouts(on, 'settings'), go: async ui => (await openGroups(ui), void (await ui.press({ key: 'setting:notify' }))) },
  { name: 'settings edit max_parallel', seed: on => seedScouts(on, 'settings'), go: async ui => (await openGroups(ui), void (await ui.press({ key: 'setting:max_parallel' }))) },
  { name: 'settings edit test_commands', seed: on => seedScouts(on, 'settings'), go: async ui => (await openGroups(ui), void (await ui.press({ key: 'setting:test_commands' }))) },
]

/** The surfaces that must draw exactly as before. */
export const OLD_SURFACES = ['terminal', 'desktop', 'mobile'] as const
