// Scouts with a lot in them (long names and summaries, a long report, running, paused, on demand, a bad file) and the
// board's settings, for the tests that draw the Scouts and Settings pages on several surfaces (see
// vscode-scouts-settings.test.tsx). The board view is BOARD_VIEW's, with these scouts.
import type { On } from 'claude-code'
import { BOARD_VIEW, T0, seedBoard } from './board-fixture'

const iso = (ms: number) => new Date(ms).toISOString()
/** The scouts' times are set from T0, the fixed clock seedBoard gives the pages (see hooks/claude/ui/now.ts). */
const NOW = T0
const MIN = 60_000

/** A long report that numbers its findings, in Markdown. */
export const LONG_REPORT = [
  '## Findings',
  '',
  '1. The package `left-pad` has a security advisory for every version older than the one in the lock file, and the fix is a small update.',
  '2. The package `tiny-json` is two major versions behind, and its old version is no longer looked after by anyone.',
  '3. The package `fast-glob` pulls in an old copy of `micromatch` with a known slow pattern; a newer `fast-glob` does not, and the update needs no change in the code.',
  '4. The package `node-fetch` is on a version that sends cookies to another site after a redirect; the fix came out last week and is a patch update with no breaking change at all.',
  '5. The package `semver` is fine now, but the lock file still has an older copy under `make-dir` that has the same advisory as last month.',
  '',
  'Checked: package.json, the lock file and the advisories of the last thirty days.',
].join('\n')

export const SCOUTS = [
  { name: 'dependency-updates', every_minutes: 30, last_run: iso(NOW - 40 * MIN), running: true, model: 'haiku', summary: 'Looks for packages with a newer version and says which ones are safe to update today', prompt: 'Look at package.json and the lock file.\nSay which packages have a newer version.', last_report: 'NOTHING' },
  { name: 'security-advisories-for-node-packages', every_minutes: 1440, last_run: iso(NOW - 21 * 60 * MIN), next_run: iso(NOW + 3 * 60 * MIN), running: false, prompt: 'Check the security advisories for every package the project uses, and say which ones need a fix soon.', last_report: LONG_REPORT },
  { name: 'docs-drift', every_minutes: 60, last_run: iso(NOW - 90 * MIN), running: false, paused: true, summary: 'Finds places where the guide no longer matches what the code does', prompt: 'Compare docs/guide.md with the code.', last_report: 'NOTHING.\nChecked every section of the guide.' },
  { name: 'on-demand-check', every_minutes: 0, last_run: null, running: false, prompt: 'Run only when asked: look for files nobody has changed in a year.' },
  { name: 'broken', every_minutes: 0, last_run: null, running: false, warning: 'every_minutes "-5" is not valid: runs only on demand until fixed', prompt: 'A scout whose file has a bad number.' },
]

/** The board view with the scouts above and settings that differ from the defaults. */
export const SCOUTS_VIEW = {
  shape: 'view-1',
  value: { ...BOARD_VIEW.value, scouts: SCOUTS, notify: 'sound', notify_choices: ['off', 'sound', 'voice'], scout_findings: 'backlog', max_parallel: 2 },
}

/** Seeds the board with the scouts and settings, on tab `tab` ('scouts' or 'settings'), scout `scout` open ('' none);
 *  `toast` sees each toast the panel shows. */
export function seedScouts(on: On, tab: 'scouts' | 'settings', scout = '', toast: (e: unknown) => void = () => {}) {
  seedBoard(on, { view: SCOUTS_VIEW, tab, ...(scout ? { scout } : {}) })
  on('ui.toast', (_, e) => (toast(e), { value: undefined }))
}

/** The scout pages the tests open, one by one. */
export const SCOUT_PAGES = SCOUTS.map(s => s.name)
