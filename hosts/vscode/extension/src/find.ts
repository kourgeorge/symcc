// Finds the symcc this extension runs. symcc is installed once, through a harness; the extension only finds that copy:
// symcc.pluginPath when set, else the copies Claude Code, Copilot CLI and OpenCode installed. Each copy says its
// version (.claude-plugin/plugin.json) and the contract its serve speaks (editor/serve.json). The newest copy whose
// contract this extension speaks wins. No vscode here, so the host's tests (hosts/vscode/tests/find.spec.ts) run it.
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** An installed symcc: its folder, who installed it, and what the extension runs from it. */
export type Copy = { root: string; from: string; version: string; protocol?: number; serve: string; webview: string }

export type FindFs = { read: (p: string) => string | undefined; list: (p: string) => string[]; real: (p: string) => string | undefined; isFile: (p: string) => boolean }

export const nodeFindFs: FindFs = {
  read: p => {
    try {
      return readFileSync(p, 'utf8')
    } catch {
      return undefined
    }
  },
  list: p => {
    try {
      return readdirSync(p)
    } catch {
      return []
    }
  },
  real: p => {
    try {
      return realpathSync(p)
    } catch {
      return undefined
    }
  },
  isFile: p => {
    try {
      return statSync(p).isFile()
    } catch {
      return false
    }
  },
}

const json = (text: string | undefined): Record<string, unknown> | undefined => {
  if (text === undefined) return undefined
  try {
    const v: unknown = JSON.parse(text)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

export const CLAUDE = 'Claude Code'
export const COPILOT = 'Copilot CLI'
export const OPENCODE = 'OpenCode'
export const SETTING = 'symcc.pluginPath'

/** The folders each harness installed symcc in, in the order they are looked at. */
export function places(env: Record<string, string | undefined>, home: string, fs: FindFs = nodeFindFs): { root: string; from: string }[] {
  const found: { root: string; from: string }[] = []
  // Claude Code: plugins/installed_plugins.json lists each install (one per scope) with its folder
  const claude = env.CLAUDE_CONFIG_DIR || join(home, '.claude')
  const installed = obj(json(fs.read(join(claude, 'plugins', 'installed_plugins.json')))?.plugins)
  for (const [key, list] of Object.entries(installed))
    if (key.split('@')[0] === 'symcc' && Array.isArray(list)) for (const i of list) if (typeof obj(i).installPath === 'string') found.push({ root: obj(i).installPath as string, from: CLAUDE })
  // Copilot CLI: a copy in installed-plugins/<marketplace>/symcc, or a marketplace folder it loads live
  const copilot = env.COPILOT_HOME || join(home, '.copilot')
  for (const market of fs.list(join(copilot, 'installed-plugins'))) if (fs.list(join(copilot, 'installed-plugins', market)).includes('symcc')) found.push({ root: join(copilot, 'installed-plugins', market, 'symcc'), from: COPILOT })
  const settings = json(fs.read(join(copilot, 'settings.json')))
  for (const [name, m] of Object.entries(obj(settings?.extraKnownMarketplaces))) {
    const source = obj(obj(m).source)
    if (source.source !== 'directory' || typeof source.path !== 'string' || obj(settings?.enabledPlugins)[`symcc@${name}`] !== true) continue
    const listed = (obj(json(fs.read(join(source.path, '.github', 'plugin', 'marketplace.json')))).plugins as unknown[] | undefined)?.map(obj).find(p => p.name === 'symcc')
    found.push({ root: typeof listed?.source === 'string' ? resolve(source.path, listed.source) : source.path, from: COPILOT })
  }
  // OpenCode: scripts/install-opencode.sh links plugins/symcc to <clone>/opencode; opencode plugin add keeps a copy
  // in its npm cache, the newest folder being the live one
  const link = fs.real(join(env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode', 'plugins', 'symcc'))
  if (link) found.push({ root: dirname(link), from: OPENCODE })
  const npm = join(home, '.cache', 'opencode', 'npm')
  for (const dir of fs.list(npm).filter(d => d.startsWith('git-symcc-'))) {
    const newest = fs
      .list(join(npm, dir))
      .filter(n => /^\d+$/.test(n))
      .sort((a, b) => Number(b) - Number(a))[0]
    if (newest) found.push({ root: join(npm, dir, newest, 'node_modules', 'symcc'), from: OPENCODE })
  }
  return found
}

/** What a folder holds: its version, and its serve's contract number (none before symcc shipped editor/). */
export function describe(root: string, from: string, fs: FindFs = nodeFindFs): Copy | undefined {
  const version = json(fs.read(join(root, '.claude-plugin', 'plugin.json')))?.version
  if (typeof version !== 'string') return undefined
  const protocol = json(fs.read(join(root, 'editor', 'serve.json')))?.protocol
  const serve = join(root, 'editor', 'serve.mjs')
  return { root, from, version, ...(typeof protocol === 'number' && fs.isFile(serve) ? { protocol } : {}), serve, webview: join(root, 'editor', 'webview') }
}

/** The clone an extension in development runs from: its hosts/vscode/dist/engine.mjs and its own webview build. */
export function devCopy(extensionPath: string, protocol: number, fs: FindFs = nodeFindFs): Copy | undefined {
  const root = resolve(extensionPath, '..', '..', '..')
  const c = describe(root, 'this clone (development)', fs)
  const serve = join(root, 'hosts', 'vscode', 'dist', 'engine.mjs')
  return c && fs.isFile(serve) ? { ...c, protocol, serve, webview: join(extensionPath, 'dist') } : undefined
}

/** -1, 0 or 1 as version `a` is older than, the same as or newer than `b` (numbers compared part by part). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[^\d]+/).filter(Boolean).map(Number)
  const pb = b.split(/[^\d]+/).filter(Boolean).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1
  return 0
}

/** The contracts this extension speaks. */
export type Speaks = { low: number; high: number }

export type Choice = { copy?: Copy; problem?: { kind: 'old' | 'new'; text: string }; copies: Copy[] }

const UPDATE: Record<string, string> = {
  [CLAUDE]: 'claude plugin marketplace update symcc && claude plugin update symcc@symcc',
  [COPILOT]: 'copilot plugin marketplace update symcc && copilot plugin update symcc@symcc',
  [OPENCODE]: 'opencode plugin update (or git pull in the clone you linked)',
  [SETTING]: 'git pull in that folder',
}

/** The newest copy whose contract fits; when none fits, why, from the newest copy. */
export function choose(copies: readonly Copy[], speaks: Speaks): Choice {
  const newest = (list: readonly Copy[]) => list.reduce<Copy | undefined>((best, c) => (!best || compareVersions(c.version, best.version) > 0 ? c : best), undefined)
  const fits = copies.filter(c => c.protocol !== undefined && c.protocol >= speaks.low && c.protocol <= speaks.high)
  const copy = newest(fits)
  if (copy) return { copy, copies: [...copies] }
  const top = newest(copies)
  if (!top) return { copies: [] }
  const range = speaks.low === speaks.high ? `${speaks.high}` : `${speaks.low} to ${speaks.high}`
  if (top.protocol !== undefined && top.protocol > speaks.high)
    return { copies: [...copies], problem: { kind: 'new', text: `symcc ${top.version} from ${top.from} is newer than this extension: it speaks protocol ${top.protocol}, and the extension speaks ${range}. Update the symcc extension.` } }
  const has = top.protocol === undefined ? 'has no editor files yet' : `speaks protocol ${top.protocol}, and the extension speaks ${range}`
  return { copies: [...copies], problem: { kind: 'old', text: `symcc ${top.version} from ${top.from} is too old for this extension: it ${has}. Update symcc: ${UPDATE[top.from] ?? 'install a newer symcc'}.` } }
}

/** The Node serve needs: 22.13 or newer, for node:sqlite (the Cursor SDK's). */
export const NODE_NEEDED = '22.13'
export const nodeFits = (version: string): boolean => compareVersions(version, NODE_NEEDED) >= 0

/** The editor's own ripgrep, for the Cursor agents' search tool (Cursor's, then VS Code's newer and older layouts). */
export function editorRipgrep(appRoot: string, platform: string, arch: string, fs: FindFs = nodeFindFs): string | undefined {
  const rg = platform === 'win32' ? 'rg.exe' : 'rg'
  const modules = join(appRoot, 'node_modules')
  return [
    join(modules, '@cursor', `ripgrep-${platform}-${arch}`, 'bin', rg),
    join(modules, '@vscode', 'ripgrep-universal', 'bin', `${platform}-${arch}`, rg),
    join(modules, '@vscode', 'ripgrep', 'bin', rg),
    join(`${modules}.asar.unpacked`, '@vscode', 'ripgrep', 'bin', rg),
  ].find(p => fs.isFile(p))
}
