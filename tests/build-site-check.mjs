// Used by tests/build-site.sh (T-593): checks a built site folder.
//   bun tests/build-site-check.mjs <built folder> <workflow file>
// Prints one "FAIL: ..." line per problem and exits 1 if there were any.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const [out, workflow] = process.argv.slice(2)
const fails = []
const bad = m => fails.push(m)

const html = []
const walk = d => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (n.endsWith('.html')) html.push(p)
  }
}
walk(out)

for (const name of ['index.html', 'guide.html', 'reference.html', 'overview.html', 'research/index.html', 'style.css']) {
  if (!existsSync(join(out, name))) bad(`missing ${name}`)
}

const ids = file => new Set([...readFileSync(file, 'utf8').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))
let checked = 0
for (const file of html) {
  const text = readFileSync(file, 'utf8')
  const page = relative(out, file)
  for (const m of text.matchAll(/\b(href|src)="([^"]*)"/g)) {
    const link = m[2].replace(/&amp;/g, '&')
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('//')) continue
    checked++
    const [path, frag] = link.split('#')
    const target = path ? join(dirname(file), decodeURIComponent(path)) : file
    if (path && /\.md$/.test(path)) bad(`${page}: link not rewritten from .md: ${link}`)
    if (!existsSync(target) || statSync(target).isDirectory()) { bad(`${page}: link to a missing file: ${link}`); continue }
    if (frag && target.endsWith('.html') && !ids(target).has(decodeURIComponent(frag))) bad(`${page}: link to a missing anchor: ${link}`)
  }
}
if (checked < 50) bad(`only ${checked} internal links checked; expected many more`)

// The workflow file: valid YAML with the Pages permissions and steps.
const wf = Bun.YAML.parse(readFileSync(workflow, 'utf8'))
if (!wf || typeof wf !== 'object') bad('workflow is not a YAML map')
else {
  if (wf.permissions?.pages !== 'write') bad('workflow: permissions.pages is not write')
  if (wf.permissions?.['id-token'] !== 'write') bad('workflow: permissions.id-token is not write')
  if (wf.concurrency?.group !== 'pages') bad('workflow: concurrency group is not pages')
  if (!wf.on?.push || !('workflow_dispatch' in (wf.on ?? {}))) bad('workflow: needs push and workflow_dispatch')
  const steps = Object.values(wf.jobs ?? {}).flatMap(j => j.steps ?? [])
  const uses = steps.map(s => s.uses ?? '').join(' ')
  for (const a of ['actions/upload-pages-artifact', 'actions/deploy-pages', 'oven-sh/setup-bun']) if (!uses.includes(a)) bad(`workflow: no ${a} step`)
  if (!steps.some(s => /scripts\/build-site\.ts/.test(s.run ?? ''))) bad('workflow: no step runs scripts/build-site.ts')
}

for (const f of fails) console.log(`FAIL: ${f}`)
process.exit(fails.length ? 1 : 0)
