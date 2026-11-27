# The editor pictures (docs/editor-*.svg)

This page is for people who want to change the pictures of the VS Code and Cursor extension. If you only want to use
symcc, skip it: see the [README](../README.md).

Three still pictures show how the extension works. Each is one SVG file with no JavaScript, no animation and no
outside fonts or images. They use the same colors and rounded dark card as `docs/architecture.svg`.

| Picture | What it shows | Where it is |
|---|---|---|
| `docs/editor-extension.svg` | the extension, the symcc a harness installed, and the agents | "Using symcc in VS Code and Cursor" in [Clients](clients.md#using-symcc-in-vs-code-and-cursor) |
| `docs/editor-parts.svg` | how the extension and serve talk, and the five steps when the board opens | "The editor extension" in [Architecture](architecture.md#the-editor-extension) |
| `docs/editor-releases.svg` | the plugin's release track and the extension's | [releasing.md](releasing.md) |

The extension's own README is its page in the VS Code Marketplace, which shows no SVG and only https images. So it
shows `docs/cursor/how-it-works.png`, a PNG of `editor-extension.svg`, from raw.githubusercontent.com.

## How to change the editor pictures

Don't edit the SVGs by hand; change the script below and run it again. Each picture is one function:
`extensionPicture`, `partsPicture` and `releasesPicture`. `card`, `chip`, `arrow` and `elbow` draw the pieces. A line
written in backticks is drawn in the mono font.

From the project folder:

```bash
mkdir -p /tmp/symcc-editor-pictures
sed -n '/^```js$/,/^```$/p' docs/editor-pictures.md | sed '1d;$d' > /tmp/symcc-editor-pictures/gen.js
node /tmp/symcc-editor-pictures/gen.js docs
xmllint --noout docs/editor-*.svg
```

Then open the SVGs in a browser to look at them. When `editor-extension.svg` changed, make the PNG again at twice the
size with Chrome (or Chromium):

```bash
google-chrome --headless --no-sandbox --hide-scrollbars --force-device-scale-factor=2 \
  --default-background-color=00000000 --window-size=900,360 \
  --screenshot=docs/cursor/how-it-works.png "file://$PWD/docs/editor-extension.svg"
```

## The editor pictures script

```js
// docs/editor-*.svg generator: three still pictures of the VS Code and Cursor extension.
// Run: node gen.js docs   (writes editor-extension.svg, editor-parts.svg and editor-releases.svg into docs/)
const fs = require('fs')
const path = require('path')

const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace"
const C = {
  bg1: '#1b1f2a', bg2: '#2a2233', edge: '#3a3f4f', line: '#4a5063', panel: '#222634',
  text: '#f5f5f7', dim: '#b8bccb', grey: '#8b90a3', peach: '#f2a58a', orange: '#d97757',
  blue: '#7aa7f0', worker: '#9fb6e0',
}
// one hue per part: the editor and the extension blue, symcc peach, the agents the workers' blue-grey
const EDITOR = C.blue, SYMCC = C.peach, AGENTS = C.worker

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = v => +v.toFixed(1)

function text(x, y, s, o = {}) {
  const { size = 14, weight = 400, fill = C.text, anchor = 'start', mono = false } = o
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}"${weight !== 400 ? ` font-weight="${weight}"` : ''} fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''} font-family="${mono ? MONO : SANS}">${esc(s)}</text>`
}
// lines under each other; a line written `code` is drawn in the mono font
function lines(x, y, list, o = {}) {
  const lh = o.lh ?? Math.round((o.size ?? 13) * 1.5)
  return list.map((s, i) => (s.startsWith('`') ? text(x, y + i * lh, s.slice(1, -1), { size: 12, fill: C.dim, ...o, mono: true }) : text(x, y + i * lh, s, { size: 13, fill: C.dim, ...o }))).join('')
}
function box(x, y, w, h, o = {}) {
  const { fill = C.panel, stroke = C.edge, dash = false, rx = 14, width = 1.5 } = o
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash ? ' stroke-dasharray="6 5"' : ''}/>`
}
// a card: its colored label, its bold title and its lines
function card(x, y, w, h, o) {
  const pad = 18
  return box(x, y, w, h, o.box) +
    (o.label ? text(x + pad, y + 28, o.label, { size: 13, weight: 600, fill: o.color }) : '') +
    text(x + pad, y + (o.label ? 54 : 30), o.title, { size: o.titleSize ?? 18, weight: 700, mono: !!o.titleMono }) +
    lines(x + pad, y + (o.label ? 80 : 54), o.lines ?? [])
}
// a small name in a pill
function chip(x, y, s, o = {}) {
  const w = o.w ?? Math.round(s.length * 7.3 + 22)
  return box(x, y, w, 24, { fill: C.bg1, stroke: C.line, rx: 12, width: 1 }) + text(x + w / 2, y + 16.5, s, { size: 12, mono: true, fill: o.fill ?? C.dim, anchor: 'middle' })
}
function head(x, y, ang, color) {
  const L = 10, W = 5
  const bx = x - L * Math.cos(ang), by = y - L * Math.sin(ang)
  const px = -Math.sin(ang) * W, py = Math.cos(ang) * W
  return `<path d="M${n(x)},${n(y)} L${n(bx + px)},${n(by + py)} L${n(bx - px)},${n(by - py)} Z" fill="${color}"/>`
}
// an arrow from (x1,y1) to (x2,y2); `both`: a head at each end
function arrow(x1, y1, x2, y2, o = {}) {
  const { color = C.grey, both = false, dash = false } = o
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const s = both ? 9 : 0
  const line = `<line x1="${n(x1 + s * Math.cos(ang))}" y1="${n(y1 + s * Math.sin(ang))}" x2="${n(x2 - 9 * Math.cos(ang))}" y2="${n(y2 - 9 * Math.sin(ang))}" stroke="${color}" stroke-width="2"${dash ? ' stroke-dasharray="5 5"' : ''}/>`
  return line + head(x2, y2, ang, color) + (both ? head(x1, y1, ang + Math.PI, color) : '')
}
// an arrow along straight segments through `pts` ([x, y] pairs), its head at the last point
function elbow(pts, o = {}) {
  const { color = C.grey } = o
  const [px, py] = pts[pts.length - 2], [x, y] = pts[pts.length - 1]
  const ang = Math.atan2(y - py, x - px)
  const end = [x - 9 * Math.cos(ang), y - 9 * Math.sin(ang)]
  const d = [...pts.slice(0, -1), end].map(([a, b], i) => `${i ? 'L' : 'M'}${n(a)},${n(b)}`).join(' ')
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` + head(x, y, ang, color)
}
function svg(W, H, title, label, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
<title>${esc(title)}</title>
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient></defs>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="24" fill="url(#bg)" stroke="${C.edge}" stroke-width="2"/>
${body.join('\n')}
</svg>
`
}
const heading = (W, title, sub) => text(W / 2, 46, title, { size: 21, weight: 700, anchor: 'middle' }) + (sub ? text(W / 2, 72, sub, { size: 14, fill: C.dim, anchor: 'middle' }) : '')

// ---------- 1. editor-extension.svg: the extension, the symcc a harness installed, the agents ----------
function extensionPicture() {
  const W = 900, H = 360, y = 98, h = 196
  const A = { x: 36, w: 200 }, B = { x: 335, w: 230 }, Cc = { x: 664, w: 200 }
  const mid = y + h / 2
  return svg(W, H, 'symcc in VS Code and Cursor',
    'symcc in VS Code and Cursor. You install symcc once, with Claude Code, Copilot CLI or OpenCode. The symcc extension in your editor finds that copy, starts it and shows its board panel and sidebar; the extension itself only does what needs the editor, such as files, diffs and terminals. symcc runs the agents, Cursor\'s or GitHub Copilot\'s: the lead and the workers, each task in its own git worktree. The extension brings no symcc of its own, so you update symcc with your harness.',
    [
      heading(W, 'symcc in VS Code and Cursor', 'You install symcc once. The extension is a window onto it.'),
      card(A.x, y, A.w, h, { label: 'Your editor', color: EDITOR, title: 'symcc extension', lines: ['board panel and sidebar', 'files, diffs, terminals'] }),
      chip(A.x + 18, y + h - 42, 'kourgeorge.symcc'),
      card(B.x, y, B.w, h, { label: 'Installed once', color: SYMCC, title: 'symcc', lines: ['by Claude Code, Copilot CLI', 'or OpenCode'] }),
      chip(B.x + 18, y + h - 72, 'editor/serve.mjs'),
      chip(B.x + 18, y + h - 42, 'editor/webview/'),
      card(Cc.x, y, Cc.w, h, { label: 'Agents', color: AGENTS, title: 'Cursor or Copilot', lines: ['the lead and workers,', 'each task in its own', 'git worktree'] }),
      arrow(A.x + A.w + 8, mid, B.x - 8, mid, { both: true }),
      text((A.x + A.w + B.x) / 2, mid - 12, 'finds it', { size: 12.5, fill: C.dim, anchor: 'middle' }),
      text((A.x + A.w + B.x) / 2, mid + 24, 'starts it', { size: 12.5, fill: C.dim, anchor: 'middle' }),
      arrow(B.x + B.w + 8, mid, Cc.x - 8, mid),
      text((B.x + B.w + Cc.x) / 2, mid - 12, 'runs them', { size: 12.5, fill: C.dim, anchor: 'middle' }),
      text(W / 2, H - 30, 'The extension brings no symcc of its own. Update symcc with your harness.', { size: 14, fill: C.dim, anchor: 'middle' }),
    ])
}

// ---------- 2. editor-parts.svg: how the parts talk, and what happens when the board opens ----------
function partsPicture() {
  const W = 900, H = 640
  const top = 92, zoneH = 318
  const L = { x: 36, w: 300 }, R = { x: 436, w: 428 }
  const row1 = top + 40, row2 = top + 180, r1h = 96, r2h = 112
  const c1 = { x: R.x + 22, w: 210 }, c2 = { x: R.x + 22 + 210 + 46, w: 128 }
  const steps = [
    { title: 'Find copies', lines: ['symcc.pluginPath, then', 'Claude Code, Copilot', 'CLI, OpenCode'] },
    { title: 'Pick one', lines: ['the newest whose', '`editor/serve.json`', 'number it speaks'] },
    { title: 'Start serve', lines: ['`editor/serve.mjs`', "on the editor's own", 'Node'] },
    { title: 'Ready', lines: ['`{"event":"ready",`', '`"version":"0.5.42",`', '`"protocol":1}`'] },
    { title: 'Show the board', lines: ["the copy's", '`editor/webview/`', 'with a strict CSP'] },
  ]
  const sy = top + zoneH + 66, sw = 152, sg = 17, sh = 122
  return svg(W, H, 'How the extension and symcc talk',
    'How the extension and symcc talk. In the VS Code or Cursor window, the board page is a webview; it and the extension pass messages to each other, and the extension passes them on to serve unread. The extension finds symcc, starts serve and does the editor glue: files, diffs, terminals, confirms and the status bar. In the symcc a harness installed, editor/webview/ is the board page, loaded from that copy, and editor/serve.mjs holds the board logic, the lead and the workers; it uses the engine and runs the agents, the Cursor SDK fetched on first use or the copilot CLI. The extension and serve talk in JSON lines: the contract, protocol 1. When the board opens: 1, find copies in symcc.pluginPath, then Claude Code, Copilot CLI and OpenCode. 2, pick the newest whose editor/serve.json number it speaks. 3, start editor/serve.mjs on the editor\'s own Node. 4, serve says it is ready, with its version and protocol 1. 5, show the copy\'s editor/webview/ with a strict content security policy.',
    [
      heading(W, 'How the extension and symcc talk'),
      box(L.x, top, L.w, zoneH, { fill: 'none', stroke: C.line, dash: true, rx: 18 }),
      text(L.x + 18, top + 26, 'VS Code or Cursor window', { size: 13, weight: 600, fill: EDITOR }),
      box(R.x, top, R.w, zoneH, { fill: 'none', stroke: C.line, dash: true, rx: 18 }),
      text(R.x + 18, top + 26, 'symcc, installed by a harness', { size: 13, weight: 600, fill: SYMCC }),
      card(L.x + 22, row1, L.w - 44, r1h, { title: 'Board page', titleSize: 16, lines: ['a webview, in the panel', 'and the sidebar'] }),
      card(L.x + 22, row2, L.w - 44, r2h, { title: 'Extension', titleSize: 16, lines: ['finds symcc, starts serve,', 'editor glue: files, diffs,', 'terminals, confirms'] }),
      arrow(L.x + 70, row1 + r1h + 6, L.x + 70, row2 - 6, { both: true }),
      text(L.x + 86, (row1 + r1h + row2) / 2 + 4, 'messages, passed on unread', { size: 12.5, fill: C.dim }),
      card(c1.x, row1, c1.w, r1h, { title: 'editor/webview/', titleMono: true, titleSize: 15, lines: ['the board page, built', 'and committed'] }),
      card(c1.x, row2, c1.w, r2h, { title: 'editor/serve.mjs', titleMono: true, titleSize: 15, lines: ['the board logic, the', 'lead, the workers'] }),
      card(c2.x, row1, c2.w, r1h, { title: 'Agents', titleSize: 16, lines: ['Cursor SDK,', 'or copilot CLI'] }),
      card(c2.x, row2, c2.w, r2h, { title: 'The engine', titleSize: 16, lines: ['`hooks/app/`', '`hooks/core/`'] }),
      arrow(c1.x + c1.w + 6, row2 + r2h / 2, c2.x - 6, row2 + r2h / 2),
      elbow([[c1.x + c1.w + 6, row2 + 26], [(c1.x + c1.w + c2.x) / 2, row2 + 26], [(c1.x + c1.w + c2.x) / 2, row1 + r1h / 2], [c2.x - 6, row1 + r1h / 2]]),
      arrow(c1.x - 6, row1 + r1h / 2, L.x + L.w - 16, row1 + r1h / 2, { dash: true, color: C.grey }),
      text((L.x + L.w + R.x) / 2, row1 + r1h / 2 - 26, 'loaded from', { size: 12.5, fill: C.dim, anchor: 'middle' }),
      text((L.x + L.w + R.x) / 2, row1 + r1h / 2 - 10, 'the copy', { size: 12.5, fill: C.dim, anchor: 'middle' }),
      arrow(L.x + L.w - 16, row2 + r2h / 2, c1.x - 6, row2 + r2h / 2, { both: true, color: SYMCC }),
      text((L.x + L.w + R.x) / 2, row2 + r2h / 2 - 12, 'JSON lines', { size: 12.5, fill: C.text, anchor: 'middle' }),
      text((L.x + L.w + R.x) / 2, row2 + r2h / 2 + 24, 'protocol 1', { size: 12.5, fill: C.dim, anchor: 'middle' }),
      text(36, sy - 18, 'When the board opens', { size: 15, weight: 700, fill: C.text }),
      ...steps.map((s, i) => {
        const x = 36 + i * (sw + sg)
        return box(x, sy, sw, sh) +
          `<circle cx="${x + 26}" cy="${sy + 26}" r="12" fill="${C.orange}"/>` + text(x + 26, sy + 31, String(i + 1), { size: 13, weight: 700, anchor: 'middle' }) +
          text(x + 46, sy + 31, s.title, { size: 14, weight: 700 }) +
          lines(x + 14, sy + 62, s.lines, { size: 12.5, lh: 19 }) +
          (i < steps.length - 1 ? head(x + sw + sg - 3, sy + sh / 2, 0, C.grey) : '')
      }),
    ])
}

// ---------- 3. editor-releases.svg: the plugin's track and the extension's ----------
function releasesPicture() {
  const W = 900, H = 430
  const bx = 214, bw = 194, gap = 34, bh = 112
  const lanes = [
    { y: 100, name: 'The plugin', when: 'most changes', color: SYMCC, boxes: [
      { title: 'You change', lines: ['the engine, serve or', "the board's webview"] },
      { title: 'Release it', lines: ['rebuild `editor/`, bump', 'the version, merge'] },
      { title: 'People get it', lines: ["with their harness's", 'update; Restart symcc'] },
    ] },
    { y: 240, name: 'The extension', when: 'rarely', color: EDITOR, boxes: [
      { title: 'You change', lines: ['how it finds symcc,', 'its frame or glue'] },
      { title: 'Release it', lines: ['bump, merge, push a', '`vscode-v<version>` tag'] },
      { title: 'People get it', lines: ['from the Marketplace or', 'Open VSX, on its own'] },
    ] },
  ]
  return svg(W, H, 'Two things to release',
    'Two things to release. The plugin, for most changes: you change the engine, serve or the board\'s webview; you release it by rebuilding editor/, bumping the version and merging; people get it with their harness\'s update, then Restart symcc in the editor. The extension, rarely: you change how it finds symcc, its frame or its editor glue; you release it by bumping its version, merging and pushing a vscode-v tag; people get it from the VS Code Marketplace or Open VSX, on its own. When the protocol number is raised, release the extension first, then the plugin.',
    [
      heading(W, 'Two things to release', 'Most changes need only a plugin release.'),
      ...lanes.map(l => [
        text(36, l.y + bh / 2 - 2, l.name, { size: 17, weight: 700, fill: l.color }),
        text(36, l.y + bh / 2 + 20, l.when, { size: 13, fill: C.dim }),
        ...l.boxes.map((b, i) => {
          const x = bx + i * (bw + gap)
          // a line with a `code` part is drawn as plain text with that part in mono
          const body = b.lines.map((s, k) => {
            const parts = s.split('`')
            if (parts.length === 1) return text(x + 18, l.y + 72 + k * 20, s, { size: 13, fill: C.dim })
            return `<text x="${x + 18}" y="${l.y + 72 + k * 20}" font-size="13" fill="${C.dim}" font-family="${SANS}">${parts.map((p, j) => (j % 2 ? `<tspan font-family="${MONO}" font-size="12">${esc(p)}</tspan>` : esc(p))).join('')}</text>`
          }).join('')
          return box(x, l.y, bw, bh) + text(x + 18, l.y + 34, b.title, { size: 15, weight: 700 }) + body +
            (i < l.boxes.length - 1 ? arrow(x + bw + 5, l.y + bh / 2, x + bw + gap - 5, l.y + bh / 2) : '')
        }),
      ].join('')),
      text(W / 2, H - 34, 'Raising the protocol number? Release the extension first, then the plugin.', { size: 14, weight: 600, fill: SYMCC, anchor: 'middle' }),
    ])
}

const out = process.argv[2] || '.'
fs.writeFileSync(path.join(out, 'editor-extension.svg'), extensionPicture())
fs.writeFileSync(path.join(out, 'editor-parts.svg'), partsPicture())
fs.writeFileSync(path.join(out, 'editor-releases.svg'), releasesPicture())
```
