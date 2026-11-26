// Builds the extension (dist/extension.js, run by the editor), the board webview (dist/webview.js and .css) and the
// browser preview of the webview with demo data (dist/preview.js, opened from preview/index.html); copies codicons.
// `node build.mjs --watch` rebuilds on change.
import { build, context } from 'esbuild'
import { cp, mkdir } from 'node:fs/promises'

const watch = process.argv.includes('--watch')
const common = { bundle: true, sourcemap: true, logLevel: 'info', tsconfig: 'tsconfig.json' }
const browser = { ...common, platform: 'browser', format: 'iife', target: 'es2022', outdir: 'dist', jsx: 'automatic', minify: !watch, define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' } }
const jobs = [
  { ...common, entryPoints: ['src/extension.ts'], platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], outfile: 'dist/extension.js' },
  { ...browser, entryPoints: { webview: 'webview/main.tsx' } },
  { ...browser, entryPoints: { preview: 'preview/main.tsx' } },
]

await mkdir('dist/codicons', { recursive: true })
await cp('node_modules/@vscode/codicons/dist/codicon.css', 'dist/codicons/codicon.css')
await cp('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/codicons/codicon.ttf')
if (watch) for (const j of jobs) await (await context(j)).watch()
else await Promise.all(jobs.map(j => build(j)))
