// Scouts with a lot in them (long names and summaries, a long report, running, paused, on demand, a bad file) and the
// board's settings, for the tests that draw the Scouts and Settings pages on several surfaces (see
// vscode-scouts-settings.test.tsx). The board view is BOARD_VIEW's, with these scouts.
import type { On } from 'claude-code'
import { BOARD_VIEW, T0, seedBoard } from './board-fixture'
import { ran, entry } from './fakes'

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

/** The plugin's roles (built-in) and the project's own roles and kinds the Roles and Kinds pages list (T-460): a
 *  replaced role, one turned off, one added with a long name and description, one whose file can't be read, the
 *  checker role; a built-in kind turned off and an added kind. fs.write and `rm -f` change the project's files. */
export const ROLE_FILES = {
  builtIn: {
    'general.md': '---\ndescription: a plain worker for any task; use it when no other role fits\n---\n',
    'tester.md': '---\ndescription: writes tests\nmodel: sonnet\n---\n- cover errors\n',
    'docs.md': '---\ndescription: writes the docs\n---\n- plain words\n',
    'checker.md': '---\ndescription: checks a finished change before it merges and tries to break it (used only by the checker setting, never for a task)\noff: true\n---\n- read the whole diff\n',
  } as Record<string, string>,
  mine: {
    'tester.md': '---\ndescription: writes tests that try hard to break the change, with every edge case found\nmodel: sonnet\nskills: testing, review\n---\n- cover errors\n- cover empty input\n',
    'docs.md': '---\ndescription: writes the docs\noff: true\n---\n- plain words\n',
    'mobile-apps-and-tablets-everywhere.md': '---\ndescription: builds and fixes phone and tablet apps, on every platform, with the shop listings and screenshots too\n---\n- test on a small screen\n',
    'bad.md': 'no front matter here',
  } as Record<string, string>,
  kinds: {
    'bug.md': '---\ndescription: something that works wrongly\noff: true\n---\n',
    'chore-and-upkeep-of-the-build.md': '---\ndescription: small upkeep: bumping versions, tidying the build, moving files, nothing the user sees at all\n---\nKeep it small.\n',
  } as Record<string, string>,
}

/** Seeds the board on Settings (see seedScouts) with the roles and kinds of ROLE_FILES. */
export function seedRolesKinds(on: On, toast: (e: unknown) => void = () => {}) {
  seedScouts(on, 'settings', '', toast)
  const builtIn = { ...ROLE_FILES.builtIn }
  const mine = { ...ROLE_FILES.mine }
  const kinds = { ...ROLE_FILES.kinds }
  const where = (p: string): [Record<string, string>, string] | null => {
    const k = /\/\.symcc\/kinds(?:\/(.*))?$/.exec(p)
    if (k) return [kinds, k[1] ?? '']
    const m = /\/\.symcc\/roles(?:\/(.*))?$/.exec(p)
    if (m) return [mine, m[1] ?? '']
    const b = /\/roles(?:\/(.*))?$/.exec(p)
    return b ? [builtIn, b[1] ?? ''] : null
  }
  on('fs.exists', (_, e, next) => {
    const w = where(e.path)
    return w ? { value: w[1] === '' || w[1] in w[0] } : next(e)
  })
  on('fs.list', (_, e, next) => {
    const w = where(e.path)
    return w && w[1] === '' ? { value: Object.keys(w[0]).map(name => entry(name)) } : next(e)
  })
  on('fs.read', (_, e, next) => {
    const w = where(e.path)
    if (!w) return next(e)
    if (!(w[1] in w[0])) throw new Error('no file')
    return { value: w[0][w[1]]! }
  })
  on('fs.write', (_, e, next) => {
    const w = where(e.path)
    if (!w) return next(e)
    w[0][w[1]] = String(e.text)
    return { value: undefined }
  })
  on('process.run', (_, e, next) => {
    const argv = (e as { argv: string[] }).argv
    if (argv[0] === 'mv') {
      // safeWrite: a temp file, then mv over the real one
      const [src, dest] = argv.slice(-2).map(p => where(p!))
      if (!src || !dest) return next(e)
      dest[0][dest[1]] = src[0][src[1]]!
      delete src[0][src[1]]
      return { value: ran() }
    }
    const w = where(argv[argv.length - 1] ?? '')
    if (!w) return next(e)
    // rm deletes; anything else on these folders (mkdir -p) just works
    if (argv[0] === 'rm') delete w[0][w[1]]
    return { value: ran() }
  })
  return { mine, kinds }
}
