// Builds what the plugin ships for editors into <out> (scripts/build-editor.sh runs it; see there):
//   serve.mjs        serve, from main.ts, with the Copilot SDK, undici and https-proxy-agent inside. The Cursor SDK stays
//                    out (its license keeps it out of symcc; ./sdk-fetch.ts fetches it), and so does the Copilot SDK's own
//                    runtime: koffi, which only that runtime uses, is a stub, and serve runs the owner's copilot CLI.
//   serve.json       the contract's number ({"protocol": 1}), so an extension can choose a copy without starting it.
//   webview/         the board's webview (webview.js, webview.css) and codicons, from extension/webview/.
//   THIRD-PARTY-NOTICES.md  the licenses of the open packages inside both.
// Usage: node build-editor.mjs <out>   (from hosts/cursor, after npm ci here and in extension/)
import { build } from 'esbuild'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('build-editor: name the folder to build into')

const editorBuild = {
  name: 'editor-build',
  setup(b) {
    // copilot.ts imports the SDK by a name in a variable, so dist/engine.mjs needn't have it; here it goes inside
    b.onLoad({ filter: /hosts[\\/]cursor[\\/]copilot\.ts$/ }, async a => {
      const text = await readFile(a.path, 'utf8')
      if (!text.includes('await import(COPILOT_SDK)')) throw new Error('build-editor: copilot.ts no longer imports the SDK as await import(COPILOT_SDK)')
      return { contents: text.replace('await import(COPILOT_SDK)', "await import('@microsoft/copilot-sdk')"), loader: 'ts' }
    })
    b.onResolve({ filter: /^koffi$/ }, () => ({ path: 'koffi', namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: "export default new Proxy({}, { get() { throw new Error(\"symcc's editor build has no in-process Copilot runtime\") } })",
      loader: 'js',
    }))
  },
}

const serve = await build({
  entryPoints: ['main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: 'tsconfig.json',
  outfile: join(out, 'serve.mjs'),
  external: ['@cursor/sdk'],
  plugins: [editorBuild],
  banner: { js: "// Built by scripts/build-editor.sh from hosts/cursor/main.ts: do not edit by hand.\nimport { createRequire as __symccRequire } from 'node:module'; const require = __symccRequire(import.meta.url);" },
  metafile: true,
  logLevel: 'warning',
})

const webview = await build({
  entryPoints: { webview: 'extension/webview/main.tsx' },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  tsconfig: 'extension/tsconfig.json',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  outdir: join(out, 'webview'),
  metafile: true,
  logLevel: 'warning',
})
const protocol = /^export const PROTOCOL = (\d+)$/m.exec(await readFile('contract.ts', 'utf8'))?.[1]
if (!protocol) throw new Error("build-editor: contract.ts has no line 'export const PROTOCOL = <number>'")
await writeFile(join(out, 'serve.json'), `${JSON.stringify({ protocol: Number(protocol) })}\n`)
await mkdir(join(out, 'webview', 'codicons'), { recursive: true })
for (const f of ['codicon.css', 'codicon.ttf']) await cp(`extension/node_modules/@vscode/codicons/dist/${f}`, join(out, 'webview', 'codicons', f))

// the packages that put code into the built files, and codicons
const roots = new Set(['extension/node_modules/@vscode/codicons'])
const used = [serve, webview].flatMap(r => Object.values(r.metafile.outputs).flatMap(o => Object.entries(o.inputs).flatMap(([input, i]) => (i.bytesInOutput > 0 ? [input] : []))))
for (const input of used) {
  const m = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input.replace(/\\/g, '/'))
  if (m) roots.add(m[1])
}
const packages = []
for (const root of roots) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const file = (await readdir(root)).sort().find(f => /^licen[cs]e(\.md|\.txt)?$/i.test(f))
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  packages.push({ name: pkg.name, version: pkg.version, license: typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'see its package'), repo, text: file ? (await readFile(join(root, file), 'utf8')).trim() : undefined })
}
const seen = new Set()
const notices = packages
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1))
  .filter(p => !seen.has(`${p.name}@${p.version}`) && seen.add(`${p.name}@${p.version}`))
  .map(p => `## ${p.name} ${p.version} (${p.license})\n\n${p.text ? p.text.replace(/^/gm, '    ') : `Its package names this license and holds no license file.${p.repo ? ` Source: ${p.repo.replace(/^git\+/, '')}` : ''}`}\n`)
await writeFile(join(out, 'THIRD-PARTY-NOTICES.md'), `# Third-party notices\n\nserve.mjs and webview/ hold these open-source packages. Their licenses follow.\n\n${notices.join('\n')}`)
console.log(`build-editor: wrote ${resolve(out)}`)
