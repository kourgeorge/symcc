// T-1222: the "The export list" section of docs/architecture.md must match hooks/engine.ts: the same modules, and the
// same names under each. Not a `claude plugin test` file (that runtime can't read files): tests/host-free.sh runs it
// with node or bun. Usage: node tests/engine-doc.mjs [folder]. Exits 1 and says what to add or remove.
// A name in a type-only line (`export type { X } from`) counts as `type X`, as the doc writes it.
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const root = resolve(process.argv[2] || join(dirname(new URL(import.meta.url).pathname), '..'))
const read = f => readFileSync(join(root, f), 'utf8')

// engine.ts: module (path without ./ and extension, under hooks/) -> set of names
const engine = new Map()
const add = (map, mod, names) => map.set(mod, new Set([...(map.get(mod) || []), ...names]))
for (const line of read('hooks/engine.ts').split('\n')) {
  const m = /^export (type )?\{(.*)\} from '([^']+)'/.exec(line)
  if (!m) continue
  const mod = m[3].startsWith('../') ? m[3].slice(3) : 'hooks/' + m[3].replace(/^\.\//, '')
  add(engine, mod, m[2].split(',').map(s => s.trim()).filter(Boolean).map(s => (m[1] && !s.startsWith('type ') ? 'type ' : '') + s))
}

// the doc: the section from "### The export list" to the next heading
const doc = new Map()
const lines = read('docs/architecture.md').split('\n')
const start = lines.findIndex(l => /^#+ The export list\s*$/.test(l))
if (start < 0) { console.error('engine-doc: docs/architecture.md has no "The export list" heading'); process.exit(1) }
for (const line of lines.slice(start + 1)) {
  if (/^#+ /.test(line)) break
  const m = /^\*\*`([^`]+)`\*\*:\s*(.*)$/.exec(line)
  if (!m) continue
  add(doc, m[1], [...m[2].matchAll(/`([^`]+)`/g)].map(x => x[1]))
}

const problems = []
for (const [mod, names] of engine) {
  if (!doc.has(mod)) { problems.push(`add a line **\`${mod}\`**: ${[...names].map(n => '`' + n + '`').join(', ')} to the export list in docs/architecture.md`); continue }
  const have = doc.get(mod)
  for (const n of names) if (!have.has(n)) problems.push(`add \`${n}\` under \`${mod}\` in the export list in docs/architecture.md`)
  for (const n of have) if (!names.has(n)) problems.push(`remove \`${n}\` from \`${mod}\` in the export list in docs/architecture.md (hooks/engine.ts does not export it from there)`)
}
for (const mod of doc.keys()) if (!engine.has(mod)) problems.push(`remove the \`${mod}\` line from the export list in docs/architecture.md (hooks/engine.ts has no export from it)`)

if (problems.length) {
  console.error('engine-doc: the export list in docs/architecture.md does not match hooks/engine.ts:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log('engine-doc: the export list matches hooks/engine.ts')
