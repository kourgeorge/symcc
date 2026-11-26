// Used by tests/build-site.sh (T-593): checks a built site folder.
//   bun tests/build-site-check.mjs <built folder> <workflow file> [<repo folder, for GitHub links>]
// Prints one "FAIL: ..." line per problem and exits 1 if there were any.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const [out, workflow, root] = process.argv.slice(2)
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

// (T-601) llms.txt: starts with "# symcc", lists every built page (but the two index pages) with a link to
// its .md copy that exists in the build; each .md copy links only to files in the build or in the repo on GitHub.
const SITE = 'https://kourgeorge.github.io/symcc/'
const GITHUB = /^https:\/\/github\.com\/kourgeorge\/symcc\/(blob|tree)\/main\/([^#?]+)/
const llmsFile = join(out, 'llms.txt')
const pages = html.map(f => relative(out, f)).filter(p => p !== 'index.html' && p !== 'research/index.html' && p !== 'blog/index.html')
if (!existsSync(llmsFile)) bad('missing llms.txt')
else {
  const llms = readFileSync(llmsFile, 'utf8')
  if (!llms.startsWith('# symcc\n')) bad('llms.txt does not start with "# symcc"')
  if (!/^> \S/m.test(llms)) bad('llms.txt has no "> " summary')
  if (/swarm/i.test(llms.split('## Docs')[0])) bad('llms.txt calls symcc a swarm')
  for (const s of ['## Docs', '## Research notes']) if (!llms.includes(`\n${s}\n`)) bad(`llms.txt has no ${s} section`)
  const listed = [...llms.matchAll(/^- \[[^\]]+\]\(([^)]+)\)(: .+)?$/gm)]
  for (const m of listed) {
    if (!m[1].startsWith(SITE) || !m[1].endsWith('.md')) { bad(`llms.txt: link is not a .md page on the site: ${m[1]}`); continue }
    if (!existsSync(join(out, m[1].slice(SITE.length)))) bad(`llms.txt: link to a missing file: ${m[1]}`)
    if (!m[2]) bad(`llms.txt: no summary for ${m[1]}`)
  }
  const links = new Set(listed.map(m => m[1].slice(SITE.length)))
  for (const p of pages) if (!links.has(p.replace(/\.html$/, '.md'))) bad(`llms.txt does not list ${p}`)
}
let mdChecked = 0
for (const p of pages) {
  const file = join(out, p.replace(/\.html$/, '.md'))
  if (!existsSync(file)) { bad(`missing .md copy of ${p}`); continue }
  // links outside code blocks and inline code
  const text = readFileSync(file, 'utf8').replace(/^(\s*)(`{3,}|~{3,})[\s\S]*?^\s*\2\s*$/gm, '').replace(/`+[^`\n]*`+/g, '')
  const found = [...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)/g), ...text.matchAll(/\b(?:href|src)="([^"]*)"/g)].map(m => m[1])
  for (const link of found) {
    const gh = GITHUB.exec(link)
    if (gh) {
      mdChecked++
      if (!root) continue
      if (!existsSync(join(root, decodeURIComponent(gh[2])))) bad(`${p}.md: GitHub link to a file not in the repo: ${link}`)
      continue
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('//') || link.startsWith('#')) continue
    mdChecked++
    const path = link.split('#')[0]
    const target = join(dirname(file), decodeURIComponent(path))
    if (!existsSync(target) || statSync(target).isDirectory()) bad(`${relative(out, file)}: link to a file not on the site: ${link}`)
    else if (target.endsWith('.html')) bad(`${relative(out, file)}: links to the HTML page, not its .md copy: ${link}`)
  }
}
if (mdChecked < 50) bad(`only ${mdChecked} links checked in the .md copies; expected many more`)

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
