// The Cursor SDK on first use. Its license (Cursor's own) keeps it out of symcc, so serve fetches it: the tarballs of
// @cursor/sdk and the open packages it imports come from npm at the versions pinned here, each checked against its
// sha512, into a cache folder that serve imports it from. A Node that finds @cursor/sdk by itself (after npm install
// in hosts/vscode) uses that one. The platform packages (@cursor/sdk-<os>-<cpu>) only carry ripgrep, which serve
// takes from the editor (CURSOR_RIPGREP_PATH) or the PATH.
import { createHash } from 'node:crypto'
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

/** A package at one version, and its tarball's sha512 as npm writes it ("sha512-<base64>"). */
export type Pinned = { name: string; version: string; integrity: string }

/** @cursor/sdk and what it imports when it runs, as hosts/vscode/package-lock.json has them (a test checks they agree). */
export const CURSOR_SDK: readonly Pinned[] = [
  { name: '@cursor/sdk', version: '1.3.1', integrity: 'sha512-Mn0gK8V+5BkOqm22J2ocU+1BrqnNH8QcK9kmA7SkRuawDOeq2ABC2BIZq9gRnF3z68x/I7J/ZU8jl6DcshCVUA==' },
  { name: '@bufbuild/protobuf', version: '1.10.0', integrity: 'sha512-QDdVFLoN93Zjg36NoQPZfsVH9tZew7wKDKyV5qRdj8ntT4wQCOradQjRaTdwMhWUYsgKsvCINKKm87FdEk96Ag==' },
  { name: '@connectrpc/connect', version: '1.7.0', integrity: 'sha512-iNKdJRi69YP3mq6AePRT8F/HrxWCewrhxnLMNm0vpqXAR8biwzRtO6Hjx80C6UvtKJ5sFmffQT7I4Baecz389w==' },
  { name: '@connectrpc/connect-web', version: '1.7.0', integrity: 'sha512-qyP0YOnUPRWwCc/VfsoydMJvkb7EyUPr2q9sHgBuJzbADjiqck1gKH5V5ZPzPhTLBvmz5UvG+wiZ5sMRQHU1MQ==' },
  { name: '@statsig/js-client', version: '3.31.0', integrity: 'sha512-LFa5E0LjT6sTfZv3sNGoyRLSZ1078+agdgOA+Vm1ecjG+KbSOfBLTW7hMwimrJ29slRwbYDzbtKaPJo/R37N2g==' },
  { name: '@statsig/client-core', version: '3.31.0', integrity: 'sha512-SuxQD6TmVszPG7FoMKwTk/uyBuVFk7XnxI3T/E0uyb7PL7GNjONtfsoh+NqBBVUJVse0CUeSFfgJPoZy1ZOslQ==' },
  { name: 'zod', version: '4.6.7', integrity: 'sha512-g8W2D2kU6a8untc053fX1uVBKzM7yqAxW/3zwk83+6RyF2+SKOuV+c0wBDhUwzV1PaGapmZH+rmcUzPf+3CGwg==' },
]

export const NPM_REGISTRY = 'https://registry.npmjs.org'

/** A package's tarball on registry `registry`: <registry>/@scope/name/-/name-1.0.0.tgz. */
export const tarballUrl = (registry: string, p: Pinned): string => `${registry.replace(/\/+$/, '')}/${p.name}/-/${p.name.split('/').pop()}-${p.version}.tgz`

export const integrityOf = (data: Uint8Array): string => `sha512-${createHash('sha512').update(data).digest('base64')}`

/** Where symcc keeps what it fetches: SYMCC_CACHE, else the system's cache folder. */
export function cacheDir(env: Record<string, string | undefined> = process.env, os: string = process.platform): string {
  if (env.SYMCC_CACHE) return env.SYMCC_CACHE
  const home = homedir()
  if (os === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'symcc', 'Cache')
  if (os === 'darwin') return join(home, 'Library', 'Caches', 'symcc')
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'symcc')
}

/** The regular files of a tar archive, by their path in it; folders, links and the rest are skipped. */
export function untar(tar: Uint8Array): { path: string; data: Uint8Array }[] {
  const words = (b: Uint8Array) => new TextDecoder().decode(b).replace(/\0[\s\S]*$/, '')
  const files: { path: string; data: Uint8Array }[] = []
  // a long path comes in the entry before its file: a pax header ("x") or a GNU one ("L")
  let long: string | undefined
  for (let at = 0; at + 512 <= tar.length; ) {
    if (tar[at] === 0) break
    const name = words(tar.subarray(at, at + 100))
    const size = parseInt(words(tar.subarray(at + 124, at + 136)).trim() || '0', 8)
    const type = String.fromCharCode(tar[at + 156] || 48)
    const prefix = words(tar.subarray(at + 345, at + 500))
    const data = tar.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    if (type === 'x') long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(data))?.[1] ?? long
    else if (type === 'L') long = words(data)
    else if (type !== 'g') {
      if (type === '0' || type === '7') files.push({ path: long ?? (prefix ? `${prefix}/${name}` : name), data })
      long = undefined
    }
  }
  return files
}

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  )

const why = (err: unknown): string => {
  const e = err as { message?: string; cause?: { code?: string; message?: string } }
  const cause = e.cause?.code ?? e.cause?.message
  return `${e.message ?? String(err)}${cause && !e.message?.includes(cause) ? ` (${cause})` : ''}`
}

export type CachedImport = {
  /** the packages, the one to import first */
  files: readonly Pinned[]
  cache: string
  registry?: string
  fetch?: (url: string) => Promise<Response>
  log?: (line: string) => void
}

/**
 * Imports the first of `files` from the cache, fetching them all there first when they aren't yet. Each tarball must
 * match its sha512; the folder appears only once every file is in it, so a fetch that stopped halfway leaves nothing.
 */
export async function cachedImport<T>(o: CachedImport): Promise<T> {
  const main = o.files[0]!
  const key = createHash('sha256').update(JSON.stringify(o.files)).digest('hex').slice(0, 10)
  const dir = join(o.cache, `${main.name.replace(/^@/, '').replace(/\//g, '-')}-${main.version}-${key}`)
  const loader = join(dir, 'load.mjs')
  if (!(await exists(loader))) await install(o, dir)
  return (await import(pathToFileURL(loader).href)) as T
}

async function install(o: CachedImport, dir: string) {
  const registry = o.registry || NPM_REGISTRY
  const get = o.fetch ?? (url => fetch(url))
  const tmp = `${dir}.${process.pid}-${Date.now()}.tmp`
  try {
    for (const p of o.files) {
      const url = tarballUrl(registry, p)
      o.log?.(`fetching ${url}`)
      const res = await get(url).catch(err => {
        throw new Error(`couldn't fetch ${url}: ${why(err)}`)
      })
      if (!res.ok) throw new Error(`${url} answered ${res.status} ${res.statusText}`.trim())
      const tgz = new Uint8Array(await res.arrayBuffer())
      if (integrityOf(tgz) !== p.integrity) throw new Error(`${url} is not the ${p.name} ${p.version} symcc pins: its sha512 differs`)
      for (const f of untar(gunzipSync(tgz))) {
        // npm's tarballs hold one folder ("package/"); a path that climbs out is refused, and so is a piece with a
        // backslash or a colon, which Windows reads as a folder break or a drive ("..\..\x", "C:x")
        const rel = f.path.split('/').slice(1).filter(s => s && s !== '.')
        if (!rel.length) continue
        if (rel.some(s => s === '..' || /[\\:]/.test(s))) throw new Error(`${url} has a file outside its folder: ${f.path}`)
        const to = join(tmp, 'node_modules', ...p.name.split('/'), ...rel)
        await mkdir(dirname(to), { recursive: true })
        await writeFile(to, f.data)
      }
    }
    await writeFile(join(tmp, 'load.mjs'), `export * from ${JSON.stringify(o.files[0]!.name)}\n`)
    await mkdir(dirname(dir), { recursive: true })
    // another serve may have put it there meanwhile: then its copy stays
    await rename(tmp, dir).catch(async err => {
      if (!(await exists(join(dir, 'load.mjs')))) throw err
    })
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

type CursorSdkModule = typeof import('@cursor/sdk')

/** The Cursor SDK: the one Node finds, else the cached copy (fetched on first use). */
export async function loadCursorSdk(env: Record<string, string | undefined> = process.env, log?: (line: string) => void): Promise<CursorSdkModule> {
  try {
    return await import('@cursor/sdk')
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'ERR_UNKNOWN_BUILTIN_MODULE') throw new Error(`the Cursor SDK needs Node 22.13 or newer, and this is Node ${process.versions.node}`)
    if (code !== 'ERR_MODULE_NOT_FOUND') throw err
  }
  const cache = cacheDir(env)
  try {
    return await cachedImport<CursorSdkModule>({ files: CURSOR_SDK, cache, ...(env.SYMCC_NPM_REGISTRY ? { registry: env.SYMCC_NPM_REGISTRY } : {}), ...(log ? { log } : {}) })
  } catch (err) {
    const text = why(err)
    const offline = text.startsWith("couldn't fetch")
    const proxy = offline && !(env.HTTPS_PROXY || env.https_proxy) ? ' Behind a proxy, set HTTPS_PROXY (in VS Code or Cursor, the symcc.proxy setting).' : ''
    throw new Error(`symcc couldn't get the Cursor SDK into ${cache}: ${text}.${proxy}${offline ? ' An npm mirror goes in SYMCC_NPM_REGISTRY.' : ''}`)
  }
}
