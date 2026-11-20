// Builds the symcc GitHub Pages site (T-593). Plain HTML, no npm packages: run it with bun.
//   bun scripts/build-site.ts [--root <repo folder>] [--out <build folder>]
// --root defaults to the repo this script is in, --out to <root>/_site.
// It copies site/ (index.html, style.css) into the build folder and turns README.md, docs/guide.md,
// docs/reference.md and docs/research/*.md into HTML pages with the same header and footer as
// site/index.html. Links to these pages are rewritten from .md to .html; links to other files in the
// repo point to GitHub; images that pages use are copied next to them. HTML in the markdown text is
// escaped (README's centered <p> banner blocks at the top are left out: the landing page covers them).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'

const GITHUB = 'https://github.com/kourgeorge/symcc'

type Page = { src: string; out: string; title: string; dropHtml?: boolean }
// md: links to pages point to their .md copies (for the plain Markdown copy of a page, T-601)
type Ctx = { page: Page; slugs: Map<string, number>; images: Set<string>; pages: Map<string, Page>; root: string; md?: boolean }

const SITE = 'https://kourgeorge.github.io/symcc'
const mdOut = (p: Page) => p.out.replace(/\.html$/, '.md')

// ---------- small markdown to HTML converter ----------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

const LIST = /^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^`\s]*)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>/
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

const indentOf = (l: string) => (/^\s*/.exec(l)?.[0] ?? '').replace(/\t/g, '    ').length
const blank = (l: string | undefined) => l === undefined || l.trim() === ''

function startsBlock(l: string): boolean {
  return FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || LIST.test(l)
}

// GitHub-style heading id: lower case, punctuation dropped, each space a dash.
export function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

function stripTags(html: string): string {
  return unescapeHtml(html.replace(/<[^>]*>/g, ''))
}

function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  let tick = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue }
    if (c === '`') tick = tick ? 0 : 1
    if (c === '|' && !tick) { cells.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  cells.push(cur.trim())
  return cells
}

export function inline(text: string, ctx: Ctx): string {
  const keep: string[] = []
  const hold = (html: string) => `\u0000${keep.push(html) - 1}\u0000`
  let s = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code: string) => {
    const c = code.replace(/\n/g, ' ')
    return hold(`<code>${escapeHtml(/^ .* $/.test(c) ? c.slice(1, -1) : c)}</code>`)
  })
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_, c: string) => hold(escapeHtml(c)))
  s = escapeHtml(s)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt: string, href: string) =>
    hold(`<img src="${escapeHtml(rewrite(unescapeHtml(href), ctx, true))}" alt="${alt}">`))
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label: string, href: string) =>
    hold(`<a href="${escapeHtml(rewrite(unescapeHtml(href), ctx, false))}">${label}</a>`))
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
  s = s.replace(/(^|[^\w*])\*(?=[^\s*])([^*]*?[^\s*])\*(?![\w*])/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^\w])~~(?=\S)([\s\S]*?\S)~~/g, '$1<del>$2</del>')
  for (let n = 0; n < 5 && s.includes('\u0000'); n++) s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => keep[Number(i)] ?? '')
  return s
}

export function blocks(lines: string[], ctx: Ctx, tight = false): string {
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (blank(line)) { i++; continue }

    const fence = FENCE.exec(line)
    if (fence) {
      const ind = fence[1]!.length
      const mark = fence[2]!
      const lang = fence[3] ?? ''
      const code: string[] = []
      i++
      while (i < lines.length) {
        const l = lines[i]!
        const t = l.trim()
        if (t.startsWith(mark[0]!.repeat(mark.length)) && /^(`+|~+)$/.test(t)) { i++; break }
        code.push(l.slice(Math.min(ind, indentOf(l))))
        i++
      }
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : ''
      out.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const h = HEADING.exec(line)
    if (h) {
      const level = h[1]!.length
      const html = inline(h[2]!, ctx)
      let id = slug(stripTags(html))
      const seen = ctx.slugs.get(id)
      ctx.slugs.set(id, (seen ?? -1) + 1)
      if (seen !== undefined) id = `${id}-${seen + 1}`
      out.push(`<h${level} id="${id}">${html} <a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`)
      i++
      continue
    }

    if (HR.test(line)) { out.push('<hr>'); i++; continue }

    if (line.includes('|') && TABLE_SEP.test(lines[i + 1] ?? '') && (lines[i + 1] ?? '').includes('-')) {
      const head = splitRow(line)
      const align = splitRow(lines[i + 1]!).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''))
      const cell = (tag: string, c: string, k: number) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c.replace(/\\\|/g, "|"), ctx)}</${tag}>`
      const rows: string[] = []
      i += 2
      while (i < lines.length && !blank(lines[i]) && lines[i]!.includes('|')) {
        rows.push(`<tr>${splitRow(lines[i]!).map((c, k) => cell('td', c, k)).join('')}</tr>`)
        i++
      }
      out.push(`<div class="table"><table><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`)
      continue
    }

    if (QUOTE.test(line)) {
      const q: string[] = []
      while (i < lines.length && QUOTE.test(lines[i]!)) { q.push(lines[i]!.replace(/^\s{0,3}> ?/, '')); i++ }
      out.push(`<blockquote>${blocks(q, ctx)}</blockquote>`)
      continue
    }

    const m = LIST.exec(line)
    if (m) {
      const base = indentOf(line)
      const ordered = /\d/.test(m[2]!)
      const items: string[][] = []
      let loose = false
      while (i < lines.length) {
        const im = LIST.exec(lines[i]!)
        if (!im || indentOf(lines[i]!) !== base || /\d/.test(im[2]!) !== ordered) break
        const content = base + im[2]!.length + im[3]!.length
        const item = [im[4]!]
        i++
        while (i < lines.length) {
          const l = lines[i]!
          if (blank(l)) {
            let j = i
            while (j < lines.length && blank(lines[j])) j++
            if (j < lines.length && indentOf(lines[j]!) >= content) { for (; i < j; i++) item.push(''); continue }
            break
          }
          const ind = indentOf(l)
          if (ind >= content) { item.push(l.slice(content)); i++; continue }
          if (LIST.test(l) && ind <= base) break
          if (ind > base) { item.push(l.slice(ind)); i++; continue }
          if (startsBlock(l)) break
          item.push(l.trim()) // lazy continuation of the item's paragraph
          i++
        }
        items.push(item)
        let j = i
        while (j < lines.length && blank(lines[j])) j++
        const next = j < lines.length ? LIST.exec(lines[j]!) : null
        if (j > i && next && indentOf(lines[j]!) === base && /\d/.test(next[2]!) === ordered) { loose = true; i = j }
        else if (j > i) break
      }
      const start = ordered ? Number.parseInt(m[2]!, 10) : 1
      const tag = ordered ? 'ol' : 'ul'
      const startAttr = ordered && start !== 1 ? ` start="${start}"` : ''
      const lis = items.map(it => {
        const inner = it.includes('') || loose ? blocks(it, ctx, false) : blocks(it, ctx, true)
        return `<li>${inner}</li>`
      })
      out.push(`<${tag}${startAttr}>${lis.join('')}</${tag}>`)
      continue
    }

    // a paragraph: lines up to a blank line or the start of another block
    const para: string[] = []
    while (i < lines.length && !blank(lines[i]) && (para.length === 0 || !startsBlock(lines[i]!))) { para.push(lines[i]!.trim()); i++ }
    if (ctx.page.dropHtml && /^<\/?(p|img|div|br|a)\b/i.test(para[0]!)) continue
    const html = inline(para.join('\n'), ctx)
    out.push(tight ? html : `<p>${html}</p>`)
  }
  return out.join('\n')
}

// ---------- links ----------

const IMAGE = /\.(svg|png|jpe?g|gif|webp)$/i

function rewrite(href: string, ctx: Ctx, image: boolean): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return href
  const hash = href.indexOf('#')
  const path = hash >= 0 ? href.slice(0, hash) : href
  const frag = hash >= 0 ? href.slice(hash) : ''
  const target = posix.normalize(posix.join(posix.dirname(ctx.page.src), path)).replace(/^\.\//, '')
  const from = posix.dirname(ctx.page.out)
  const page = ctx.pages.get(target.replace(/\/$/, ''))
  if (page) return (page.out === ctx.page.out ? '' : posix.relative(from, ctx.md ? mdOut(page) : page.out)) + frag
  const full = join(ctx.root, target)
  if ((image || IMAGE.test(target)) && existsSync(full) && statSync(full).isFile() && IMAGE.test(target)) {
    ctx.images.add(target)
    return posix.relative(from, target) + frag
  }
  const isDir = path.endsWith('/') || (existsSync(full) && statSync(full).isDirectory())
  return `${GITHUB}/${isDir ? 'tree' : 'blob'}/main/${target.replace(/\/$/, '')}${frag}`
}

// ---------- plain Markdown copies and llms.txt (T-601) ----------

// The page's Markdown with links (markdown links and href/src in raw HTML) rewritten like the HTML:
// links to other pages go to their .md copies, images to the copied images, other repo files to GitHub.
// Code blocks and inline code are left alone.
export function mdCopy(md: string, ctx: Ctx): string {
  const fix = (text: string) => text
    .replace(/(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (_, a: string, href: string, b: string) => `${a}${rewrite(href, ctx, a.startsWith('!'))}${b}`)
    .replace(/\b(href|src)="([^"]*)"/g, (_, attr: string, href: string) => `${attr}="${rewrite(href, ctx, attr === 'src')}"`)
  let fence = ''
  return md.split('\n').map(line => {
    const f = FENCE.exec(line)
    if (fence) { if (f && line.trim().startsWith(fence) && /^(`+|~+)$/.test(line.trim())) fence = ''; return line }
    if (f) { fence = f[2]!; return line }
    const code: string[] = []
    const held = line.replace(/`+[^`]*`+/g, c => `\u0000${code.push(c) - 1}\u0000`)
    return fix(held).replace(/\u0000(\d+)\u0000/g, (_, k: string) => code[Number(k)]!)
  }).join('\n')
}

// Plain text of a markdown paragraph: links become their labels, marks and HTML are dropped.
function plain(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '').replace(/[`*]/g, '').replace(/(^|\s)_|_(\s|$)/g, '$1$2').replace(/\s+/g, ' ').trim()
}

function cut(s: string, n = 150): string {
  if (s.length <= n) return s
  const t = s.slice(0, n)
  const k = t.lastIndexOf(' ')
  return `${(k > 80 ? t.slice(0, k) : t).replace(/[\s,;:.]+$/, '')}…`
}

// One-line summary of a note: the first paragraph under a "Question"/"Short answer" heading if there is
// one, else the first paragraph after the title. HTML, comments, images, tables and code are skipped.
export function summary(md: string): string {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split('\n')
  const paras: { text: string; under: string }[] = []
  let under = ''
  let fence = false
  let cur: string[] = []
  const end = () => { if (cur.length) paras.push({ text: plain(cur.join(' ')), under }); cur = [] }
  for (const l of lines) {
    if (FENCE.test(l)) { end(); fence = !fence; continue }
    if (fence) continue
    const h = HEADING.exec(l)
    if (h) { end(); under = h[1]!.length > 1 ? h[2]! : ''; continue }
    if (blank(l) || HR.test(l) || /^\s*[<|!]/.test(l)) { end(); continue }
    const item = LIST.exec(l)
    if (item) { end(); cur.push(item[4]!); continue } // each list item counts as a paragraph
    cur.push(l.replace(/^\s{0,3}>\s?/, '').trim())
  }
  end()
  const ok = paras.filter(p => p.text.length > 20)
  const pick = ok.find(p => /question|short answer/i.test(p.under)) ?? ok[0]
  return pick ? cut(pick.text) : ''
}

const MAIN_SUMMARY: Record<string, string> = {
  'README.md': 'What symcc is, how to install it, a quick start, how it works, and the full feature list.',
  'docs/guide.md': 'How to use symcc day to day: talking to the lead, the board, tasks, workers, scouts and merges.',
  'docs/reference.md': 'Every command, setting, file and board key of symcc, in one place.',
}

export function llmsTxt(pages: Page[], root: string): string {
  const line = (p: Page) => {
    const md = readFileSync(join(root, p.src), 'utf8').replace(/\r\n?/g, '\n')
    const title = p.src === 'README.md' ? 'Overview' : firstHeading(md) ?? p.title
    const sum = MAIN_SUMMARY[p.src] ?? summary(md)
    return `- [${title}](${SITE}/${mdOut(p)})${sum ? `: ${sum}` : ''}`
  }
  const main = pages.filter(p => !p.src.startsWith('docs/research/'))
  const notes = pages.filter(p => p.src.startsWith('docs/research/'))
  return `# symcc

> symcc is an agent organization for coding agents, as a plugin for Claude Code and OpenCode. You talk to one lead, which plans the work and keeps a shared task board. Workers build the tasks in parallel, each in its own git worktree and branch, and may change only the files their task allows. Scouts look for bugs, missing tests and outdated parts on their own timers. One merge queue tests each finished task and merges it into main, and the lead asks the owner only for real decisions.

Each link below is a plain Markdown copy of a page on ${SITE}/.

## Docs

${main.map(line).join('\n')}

## Research notes

${notes.map(line).join('\n')}
`
}

// ---------- pages ----------

function frame(indexHtml: string) {
  const header = /<header class="site"[\s\S]*?<\/header>/.exec(indexHtml)?.[0]
  const footer = /<footer class="site"[\s\S]*?<\/footer>/.exec(indexHtml)?.[0]
  if (!header || !footer) throw new Error('site/index.html needs <header class="site"> and <footer class="site">')
  return { header, footer }
}

// Point relative href/src attributes at the right place from a page `depth` folders down.
function relink(html: string, depth: number): string {
  if (!depth) return html
  const up = '../'.repeat(depth)
  return html.replace(/\b(href|src)="(?![a-z][a-z0-9+.-]*:|#|\/)([^"]*)"/gi, (_, a: string, v: string) => `${a}="${up}${v}"`)
}

function render(page: Page, body: string, f: { header: string; footer: string }): string {
  const depth = page.out.split('/').length - 1
  const up = '../'.repeat(depth)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} · symcc</title>
<link rel="stylesheet" href="${up}style.css">
</head>
<body>
${relink(f.header, depth)}
<main class="doc">
${body}
</main>
${relink(f.footer, depth)}
</body>
</html>
`
}

function firstHeading(md: string): string | undefined {
  return /^#\s+(.*)$/m.exec(md)?.[1]?.replace(/[`*_]/g, '').trim()
}

// The build writes this file into its output folder; a folder that has it may be deleted and rebuilt.
export const MARKER = '.symcc-site'
const PROTECTED = ['site', 'docs', '.git', '.symcc', 'hooks', 'scripts', 'tests', '.github']

// true when `child` is `parent` or a folder inside it
function within(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

// The full path with links followed (/var and /private/var on macOS are the same), also for a path that does not exist yet.
function real(p: string): string {
  const abs = resolve(p)
  if (existsSync(abs)) return realpathSync(abs)
  const up = dirname(abs)
  return up === abs ? abs : join(real(up), basename(abs))
}

// Says why `out` must not be deleted, or undefined when it is safe: it is not the repo folder, a folder
// above it or one of the repo's source folders, and it is missing, empty, or holds an earlier build's marker.
export function unsafeOut(root: string, out: string): string | undefined {
  const r = real(root)
  const o = real(out)
  if (within(o, r)) return `${o} is the repo folder or a folder above it`
  if (within(r, o)) {
    const top = relative(r, o).split(sep)[0]!
    if (PROTECTED.includes(top)) return `${o} is in the repo's ${top}/ folder`
  }
  if (!existsSync(o)) return undefined
  if (!statSync(o).isDirectory()) return `${o} is a file, not a folder`
  if (readdirSync(o).length === 0 || existsSync(join(o, MARKER))) return undefined
  return `${o} is not empty and was not made by this script (it has no ${MARKER} file); delete it yourself or pick another --out`
}

export function build(root: string, out: string): string[] {
  const why = unsafeOut(root, out)
  if (why) throw new Error(`build-site: refusing --out ${out}: ${why}. Nothing was deleted.`)
  const indexHtml = readFileSync(join(root, 'site/index.html'), 'utf8')
  const f = frame(indexHtml)
  const pages: Page[] = [
    { src: 'README.md', out: 'overview.html', title: 'Overview', dropHtml: true },
    { src: 'docs/guide.md', out: 'guide.html', title: 'Guide' },
    { src: 'docs/reference.md', out: 'reference.html', title: 'Reference' },
  ]
  const researchDir = join(root, 'docs/research')
  const research = existsSync(researchDir) ? readdirSync(researchDir).filter(n => n.endsWith('.md')).sort() : []
  for (const n of research) {
    const md = readFileSync(join(researchDir, n), 'utf8')
    pages.push({ src: `docs/research/${n}`, out: `research/${n.replace(/\.md$/, '.html')}`, title: firstHeading(md) ?? n.replace(/\.md$/, '') })
  }
  const byPath = new Map(pages.map(p => [p.src, p]))
  const images = new Set<string>()

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  cpSync(join(root, 'site'), out, { recursive: true })
  writeFileSync(join(out, '.nojekyll'), '')
  writeFileSync(join(out, MARKER), 'Made by scripts/build-site.ts; this folder is deleted and rebuilt on each build.\n')

  const written = ['index.html']
  for (const page of pages) {
    const ctx: Ctx = { page, slugs: new Map(), images, pages: byPath, root }
    const md = readFileSync(join(root, page.src), 'utf8').replace(/\r\n?/g, '\n')
    const file = join(out, page.out)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, render(page, blocks(md.split('\n'), ctx), f))
    written.push(page.out)
    writeFileSync(join(out, mdOut(page)), mdCopy(md, { ...ctx, md: true }))
  }
  writeFileSync(join(out, 'llms.txt'), llmsTxt(pages, root))

  const indexPage: Page = { src: 'docs/research/index.md', out: 'research/index.html', title: 'Research notes' }
  const list = pages.filter(p => p.src.startsWith('docs/research/'))
    .map(p => `<li><a href="${escapeHtml(posix.basename(p.out))}">${escapeHtml(p.title)}</a></li>`).join('\n')
  const intro = '<h1 id="research-notes">Research notes</h1>\n<p>Answers from symcc investigation tasks, kept as notes. Some are about ideas that were never built, or were built differently.</p>'
  mkdirSync(join(out, 'research'), { recursive: true })
  writeFileSync(join(out, indexPage.out), render(indexPage, `${intro}\n<ul class="notes">\n${list}\n</ul>`, f))
  written.push(indexPage.out)

  // images used by the landing page (relative src not in site/) and by the pages
  for (const m of indexHtml.matchAll(/\bsrc="(?![a-z][a-z0-9+.-]*:|\/)([^"#?]+)"/gi)) {
    if (!existsSync(join(root, 'site', m[1]!))) images.add(m[1]!)
  }
  for (const img of images) {
    const from = join(root, img)
    if (!existsSync(from)) continue
    mkdirSync(dirname(join(out, img)), { recursive: true })
    cpSync(from, join(out, img))
  }
  return written
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const opt = (name: string) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : undefined }
  const root = resolve(opt('--root') ?? join(import.meta.dir, '..'))
  const out = resolve(opt('--out') ?? join(root, '_site'))
  let written: string[]
  try { written = build(root, out) } catch (e) { console.error((e as Error).message); process.exit(1) }
  console.log(`build-site: wrote ${written.length} pages to ${out}`)
}
