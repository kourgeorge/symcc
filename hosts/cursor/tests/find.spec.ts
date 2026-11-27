// How the editor extension finds the symcc it runs (../extension/src/find.ts): the harnesses' records, what each copy
// holds, the newest copy whose contract fits, and the one message when none does. Run with `npx -y bun test ./tests/`
// in hosts/cursor/ (or `npm test` there).
import { test, expect } from 'bun:test'
import { CLAUDE, COPILOT, OPENCODE, choose, compareVersions, describe, devCopy, editorRipgrep, nodeFits, places, type Copy, type FindFs } from '../extension/src/find'

/** Files by path; a folder lists what is under it; `links` maps a link to its target. */
function memFs(files: Record<string, string>, links: Record<string, string> = {}): FindFs {
  return {
    read: p => files[p],
    list: p => [...new Set(Object.keys(files).flatMap(f => (f.startsWith(`${p}/`) ? [f.slice(p.length + 1).split('/')[0]!] : [])))],
    real: p => links[p] ?? (p in files ? p : undefined),
    isFile: p => p in files,
  }
}
const copyAt = (root: string, version: string, protocol?: number): Record<string, string> => ({
  [`${root}/.claude-plugin/plugin.json`]: JSON.stringify({ name: 'symcc', version }),
  ...(protocol === undefined ? {} : { [`${root}/editor/serve.json`]: JSON.stringify({ protocol }), [`${root}/editor/serve.mjs`]: '' }),
})

test("each harness's copies are found: Claude Code's record, Copilot CLI's copy and folder, OpenCode's link and cache", () => {
  const H = '/home/d'
  const fs = memFs(
    {
      [`${H}/.claude/plugins/installed_plugins.json`]: JSON.stringify({ version: 2, plugins: { 'symcc@symcc': [{ scope: 'user', installPath: `${H}/.claude/plugins/cache/symcc/symcc/0.5.42` }], 'other@x': [{ installPath: '/nope' }] } }),
      [`${H}/.copilot/installed-plugins/symcc/symcc/README.md`]: '',
      [`${H}/.copilot/installed-plugins/other/thing/README.md`]: '',
      [`${H}/.copilot/settings.json`]: JSON.stringify({ extraKnownMarketplaces: { mine: { source: { source: 'directory', path: '/src/symcc' } }, off: { source: { source: 'directory', path: '/src/off' } } }, enabledPlugins: { 'symcc@mine': true } }),
      '/src/symcc/.github/plugin/marketplace.json': JSON.stringify({ plugins: [{ name: 'symcc', source: './' }] }),
      [`${H}/.cache/opencode/npm/git-symcc-abc/100/node_modules/symcc/README.md`]: '',
      [`${H}/.cache/opencode/npm/git-symcc-abc/250/node_modules/symcc/README.md`]: '',
    },
    { [`${H}/.config/opencode/plugins/symcc`]: '/src/clone/opencode' },
  )
  expect(places({}, H, fs)).toEqual([
    { root: `${H}/.claude/plugins/cache/symcc/symcc/0.5.42`, from: CLAUDE },
    { root: `${H}/.copilot/installed-plugins/symcc/symcc`, from: COPILOT },
    { root: '/src/symcc', from: COPILOT },
    { root: '/src/clone', from: OPENCODE },
    { root: `${H}/.cache/opencode/npm/git-symcc-abc/250/node_modules/symcc`, from: OPENCODE },
  ])
  // CLAUDE_CONFIG_DIR and COPILOT_HOME move the records
  const moved = memFs({ '/c/plugins/installed_plugins.json': JSON.stringify({ plugins: { 'symcc@m': [{ installPath: '/x' }] } }), '/k/installed-plugins/m/symcc/a': '' })
  expect(places({ CLAUDE_CONFIG_DIR: '/c', COPILOT_HOME: '/k' }, H, moved)).toEqual([
    { root: '/x', from: CLAUDE },
    { root: '/k/installed-plugins/m/symcc', from: COPILOT },
  ])
})

test('a copy says its version and contract; one from before editor/ has no contract', () => {
  const fs = memFs({ ...copyAt('/a', '0.5.42', 1), ...copyAt('/b', '0.5.30') })
  expect(describe('/a', CLAUDE, fs)).toEqual({ root: '/a', from: CLAUDE, version: '0.5.42', protocol: 1, serve: '/a/editor/serve.mjs', webview: '/a/editor/webview' })
  expect(describe('/b', OPENCODE, fs)?.protocol).toBe(undefined)
  expect(describe('/none', CLAUDE, fs)).toBe(undefined)
})

test("the newest copy whose contract fits wins; else one message says what to update", () => {
  const c = (version: string, from: string, protocol?: number): Copy => ({ root: `/${from}/${version}`, from, version, ...(protocol === undefined ? {} : { protocol }), serve: '', webview: '' })
  const speaks = { low: 1, high: 1 }
  expect(choose([c('0.5.42', CLAUDE, 1), c('0.5.50', COPILOT, 1), c('0.6.0', OPENCODE, 2)], speaks).copy?.version).toBe('0.5.50')
  expect(choose([c('0.5.30', OPENCODE)], speaks).problem).toEqual({ kind: 'old', text: 'symcc 0.5.30 from OpenCode is too old for this extension: it has no editor files yet. Update symcc: opencode plugin update (or git pull in the clone you linked).' })
  expect(choose([c('0.5.30', OPENCODE), c('0.7.0', CLAUDE, 2)], speaks).problem).toEqual({ kind: 'new', text: 'symcc 0.7.0 from Claude Code is newer than this extension: it speaks protocol 2, and the extension speaks 1. Update the symcc extension.' })
  expect(choose([c('0.5.41', CLAUDE, 0)], { low: 1, high: 2 }).problem?.text).toBe('symcc 0.5.41 from Claude Code is too old for this extension: it speaks protocol 0, and the extension speaks 1 to 2. Update symcc: claude plugin marketplace update symcc && claude plugin update symcc@symcc.')
  expect(choose([], speaks)).toEqual({ copies: [] })
})

test('versions compare part by part; Node 22.13 or newer runs serve', () => {
  expect([compareVersions('0.5.10', '0.5.9'), compareVersions('1.0', '1.0.0'), compareVersions('0.5.41', '0.6.0')]).toEqual([1, 0, -1])
  expect([nodeFits('22.12.0'), nodeFits('22.13.0'), nodeFits('24.22.1'), nodeFits('20.19.0')]).toEqual([false, true, true, false])
})

test("in development the extension runs its own clone's builds", () => {
  const fs = memFs({ ...copyAt('/src/symcc', '0.5.41'), '/src/symcc/hosts/cursor/dist/engine.mjs': '' })
  expect(devCopy('/src/symcc/hosts/cursor/extension', 1, fs)).toEqual({ root: '/src/symcc', from: 'this clone (development)', version: '0.5.41', protocol: 1, serve: '/src/symcc/hosts/cursor/dist/engine.mjs', webview: '/src/symcc/hosts/cursor/extension/dist' })
  expect(devCopy('/elsewhere/a/b/c', 1, fs)).toBe(undefined)
})

test("the editor's ripgrep: Cursor's, then VS Code's", () => {
  const cursor = memFs({ '/app/node_modules/@cursor/ripgrep-linux-x64/bin/rg': '' })
  expect(editorRipgrep('/app', 'linux', 'x64', cursor)).toBe('/app/node_modules/@cursor/ripgrep-linux-x64/bin/rg')
  const code = memFs({ '/app/node_modules/@vscode/ripgrep-universal/bin/darwin-arm64/rg': '' })
  expect(editorRipgrep('/app', 'darwin', 'arm64', code)).toBe('/app/node_modules/@vscode/ripgrep-universal/bin/darwin-arm64/rg')
  expect(editorRipgrep('/app', 'linux', 'x64', memFs({}))).toBe(undefined)
})
