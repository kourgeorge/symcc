// The Scouts and Settings pages the surface tests draw (vscode-scouts-settings.test.tsx): each scene seeds the board
// and presses its way to one page. scouts-settings-snapshot.ts holds the trees the terminal, the desktop and mobile
// drew for these scenes before the VS Code Scouts and Settings pages (T-415).
import type { On } from 'claude-code'
import { SETTING_GROUPS } from '../hooks/board'
import { SCOUT_PAGES, seedScouts, seedRolesKinds } from './scouts-settings-fixture'

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

/** The Roles and Task types pages and their one-role and one-kind pages (T-460), on the terminal, the desktop and mobile:
 *  opened from Settings' Roles and Task types rows (in the Team group), with the roles and task types of ROLE_FILES. */
export const ROLE_KIND_PAGES = { roles: ['general', 'tester', 'docs', 'mobile-apps-and-tablets-everywhere', 'checker', 'bad'], kinds: ['bug', 'change', 'chore-and-upkeep-of-the-build'] }
const seedRK = (on: On) => void seedRolesKinds(on)
export const ROLE_KIND_SCENES: Scene[] = [
  { name: 'roles list', seed: seedRK, go: async ui => (await openGroups(ui), void (await ui.press({ key: 'settings-roles' }))) },
  ...ROLE_KIND_PAGES.roles.map(r => ({ name: `role ${r}`, seed: seedRK, go: async (ui: Mount) => (await openGroups(ui), await ui.press({ key: 'settings-roles' }), void (await ui.press({ key: `roleRow:${r}` }))) })),
  { name: 'kinds list', seed: seedRK, go: async ui => (await openGroups(ui), void (await ui.press({ key: 'settings-kinds' }))) },
  ...ROLE_KIND_PAGES.kinds.map(k => ({ name: `kind ${k}`, seed: seedRK, go: async (ui: Mount) => (await openGroups(ui), await ui.press({ key: 'settings-kinds' }), void (await ui.press({ key: `kindRow:${k}` }))) })),
]
