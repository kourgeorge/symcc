// The Cursor SDK on first use (../sdk-fetch.ts), against a registry served from this process: the pinned tarballs are
// fetched, checked and unpacked into the cache once, a tarball that isn't the pinned one leaves nothing, and the pins
// are hosts/cursor/package-lock.json's. Run with `npx -y bun test ./tests/` in hosts/cursor/ (or `npm test` there).
import { test, expect } from 'bun:test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { CURSOR_SDK, cachedImport, cacheDir, integrityOf, tarballUrl, untar, type Pinned } from '../sdk-fetch'

/** A tar archive of `files` (path: text); a path longer than a header holds goes in a pax header before it. */
function tar(files: Record<string, string>): Uint8Array {
  const blocks: Uint8Array[] = []
  const header = (name: string, size: number, type: string) => {
    const h = new Uint8Array(512)
    const put = (at: number, s: string) => h.set(new TextEncoder().encode(s), at)
    put(0, name.slice(0, 99))
    put(100, '0000644\0')
    put(124, `${size.toString(8).padStart(11, '0')}\0`)
    put(156, type)
    put(257, 'ustar\x0000')
    return h
  }
  const body = (data: Uint8Array) => {
    const b = new Uint8Array(Math.ceil(data.length / 512) * 512)
    b.set(data)
    return b
  }
  for (const [path, text] of Object.entries(files)) {
    if (path.length > 99) {
      const rec = ` path=${path}\n`
      let line = `${rec.length}${rec}`
      line = `${line.length}${rec}`
      const pax = new TextEncoder().encode(line)
      blocks.push(header('PaxHeader', pax.length, 'x'), body(pax))
    }
    const data = new TextEncoder().encode(text)
    blocks.push(header(path, data.length, '0'), body(data))
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const b of blocks) (out.set(b, at), (at += b.length))
  return out
}

const LONG = `lib/${'deep/'.repeat(24)}far.js`
const PACKAGES: Record<string, Record<string, string>> = {
  '@fake/sdk': {
    'package/package.json': JSON.stringify({ name: '@fake/sdk', version: '1.0.0', type: 'module', exports: { '.': { import: './index.js' } } }),
    'package/index.js': "export { far } from './lib/far.js'\nexport { dep } from 'fake-dep'\nexport const hello = 'hi'\n",
    'package/lib/far.js': `export { far } from './${LONG.slice(4)}'\n`,
    [`package/${LONG}`]: "export const far = 'far'\n",
  },
  'fake-dep': {
    'package/package.json': JSON.stringify({ name: 'fake-dep', version: '2.0.0', type: 'module', main: './index.js' }),
    'package/index.js': "export const dep = 'dep'\n",
  },
}
const tgz = (name: string) => gzipSync(tar(PACKAGES[name]!))
const pins = (): Pinned[] => [
  { name: '@fake/sdk', version: '1.0.0', integrity: integrityOf(tgz('@fake/sdk')) },
  { name: 'fake-dep', version: '2.0.0', integrity: integrityOf(tgz('fake-dep')) },
]

/** A registry that serves the fake packages, and the paths it was asked for. */
async function registry(): Promise<{ url: string; asked: string[]; server: Server }> {
  const asked: string[] = []
  const files = new Map(pins().map(p => [new URL(tarballUrl('http://x', p)).pathname, tgz(p.name)]))
  const server = createServer((req, res) => {
    asked.push(req.url ?? '')
    const body = files.get(req.url ?? '')
    res.writeHead(body ? 200 : 404).end(body)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  return { url: `http://127.0.0.1:${port}/`, asked, server }
}

test('untar reads the files of an archive, long paths too', () => {
  const files = untar(tar(PACKAGES['@fake/sdk']!))
  expect(files.map(f => f.path)).toEqual(Object.keys(PACKAGES['@fake/sdk']!))
  expect(new TextDecoder().decode(files[3]!.data)).toBe("export const far = 'far'\n")
})

test('the pinned packages are fetched into the cache once, checked, and imported from there', async () => {
  const r = await registry()
  const cache = await mkdtemp('/tmp/symcc-sdk-cache-')
  try {
    const m = await cachedImport<{ hello: string; dep: string; far: string }>({ files: pins(), cache, registry: r.url })
    expect([m.hello, m.dep, m.far]).toEqual(['hi', 'dep', 'far'])
    expect(r.asked).toEqual(['/@fake/sdk/-/sdk-1.0.0.tgz', '/fake-dep/-/fake-dep-2.0.0.tgz'])
    await cachedImport({ files: pins(), cache, registry: r.url })
    expect(r.asked.length).toBe(2)
    const [dir] = await readdir(cache)
    expect(dir).toMatch(/^fake-sdk-1\.0\.0-[0-9a-f]{10}$/)
  } finally {
    r.server.close()
  }
})

test("a tarball that isn't the pinned one, or a registry that is down, leaves nothing in the cache", async () => {
  const r = await registry()
  const cache = await mkdtemp('/tmp/symcc-sdk-cache-')
  try {
    const wrong = pins().map(p => (p.name === 'fake-dep' ? { ...p, integrity: 'sha512-AAAA' } : p))
    const err = await cachedImport({ files: wrong, cache, registry: r.url }).then(
      () => undefined,
      (e: Error) => e.message,
    )
    expect(err).toBe(`${r.url}fake-dep/-/fake-dep-2.0.0.tgz is not the fake-dep 2.0.0 symcc pins: its sha512 differs`)
    expect(await readdir(cache)).toEqual([])
  } finally {
    r.server.close()
  }
  const down = await cachedImport({ files: pins(), cache, registry: r.url }).then(
    () => undefined,
    (e: Error) => e.message,
  )
  expect(down).toContain(`couldn't fetch ${r.url}@fake/sdk/-/sdk-1.0.0.tgz`)
  expect(await readdir(cache)).toEqual([])
})

test('the cache is SYMCC_CACHE, else the system cache folder', () => {
  expect(cacheDir({ SYMCC_CACHE: '/c' })).toBe('/c')
  expect(cacheDir({ XDG_CACHE_HOME: '/x' }, 'linux')).toBe('/x/symcc')
  expect(cacheDir({ LOCALAPPDATA: 'C:\\Users\\d\\AppData\\Local' }, 'win32')).toMatch(/symcc.Cache$/)
  expect(cacheDir({}, 'darwin')).toMatch(/Library\/Caches\/symcc$/)
})

test("the pins are package-lock.json's: @cursor/sdk, what it depends on, and zod (its peer)", async () => {
  const lock = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), '../package-lock.json'), 'utf8')) as { packages: Record<string, { version: string; integrity: string; dependencies?: Record<string, string> }> }
  const need = new Set<string>(['@cursor/sdk', 'zod'])
  for (let grew = true; grew; ) {
    grew = false
    for (const name of [...need])
      for (const d of Object.keys(lock.packages[`node_modules/${name}`]?.dependencies ?? {}))
        if (!need.has(d)) (need.add(d), (grew = true))
  }
  expect(CURSOR_SDK.map(p => p.name).sort()).toEqual([...need].sort())
  for (const p of CURSOR_SDK) expect({ name: p.name, version: p.version, integrity: p.integrity }).toEqual({ name: p.name, version: lock.packages[`node_modules/${p.name}`]!.version, integrity: lock.packages[`node_modules/${p.name}`]!.integrity })
  expect(CURSOR_SDK[0]!.name).toBe('@cursor/sdk')
})
