// T-635, softened by T-645: reports how hooks/engine.ts differs from the engine names the hosts import. The list may
// lag behind the hosts: a host starting or stopping to use an engine name only prints a note here (exit 0), it never
// fails the tests. Refresh hooks/engine.ts from these notes when the engine/client split starts.
// Not a `claude plugin test` file (that runtime can't read files): tests/host-free.sh runs it with node or bun.
// Usage: node tests/engine-names.mjs [folder]. It reads every static `import ... from '...'` and `export ... from '...'`
// in the host files (hooks/claude/, hooks/register.tsx, hooks/opencode/ but board-view.ts, hosts/node/, opencode/;
// not their tests/ folders) that names an engine file (hooks/app/, hooks/core/, hooks/process/, hooks/board.ts,
// hooks/name.ts, hooks/host.ts, hooks/opencode/board-view.ts, types/), and the `export { ... } from` lines of
// hooks/engine.ts. It notes (drift, exit 0)
//   1. a host imports an engine name hooks/engine.ts does not export;
//   2. a host imports a value (not `type`) that hooks/engine.ts exports only as a type;
//   3. hooks/engine.ts exports a name no host imports;
//   4. a host imports all of an engine file (`import * as`), so its names can't be listed.
// It fails (exit 1) only on the shape of hooks/engine.ts itself, which host work never changes: a line that is not a
// comment or an `export { ... } from '<engine file>'`, a renamed name, or a name exported twice.
// tests/engine.test.ts checks each value hooks/engine.ts exports is the same as in its source file.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'

const root = resolve(process.argv[2] || join(dirname(new URL(import.meta.url).pathname), '..'))
const ENGINE = 'hooks/engine.ts'
if (!existsSync(join(root, ENGINE))) { console.log('engine-names: no hooks/engine.ts here, nothing to check'); process.exit(0) }

const walk = d => !existsSync(join(root, d)) ? [] : readdirSync(join(root, d)).flatMap(n => {
  const p = join(d, n)
  if (statSync(join(root, p)).isDirectory()) return n === 'tests' || n === 'node_modules' ? [] : walk(p)
  return /\.tsx?$/.test(n) && !n.endsWith('.d.ts') ? [p] : []
})
const hosts = [...walk('hooks/claude'), ...(existsSync(join(root, 'hooks/register.tsx')) ? ['hooks/register.tsx'] : []),
  ...walk('hooks/opencode').filter(f => f !== 'hooks/opencode/board-view.ts'), ...walk('hosts/node'), ...walk('opencode')]

// a module path from the root, no .ts/.tsx, no /index; is it on the engine side?
const modOf = (file, spec) => relative(root, resolve(root, dirname(file), spec)).replace(/\.tsx?$/, '').replace(/\/index$/, '')
const isEngine = m => /^hooks\/(app|core|process)\//.test(m) || /^hooks\/(board|name|host)$/.test(m) || m === 'hooks/opencode/board-view' || m === 'types' || m.startsWith('types/')

// `import|export [type] { a, type B, c as d } from '...'` statements, over several lines too
const STATEMENT = /(?:^|\n)[ \t]*(import|export)[ \t]+(type[ \t]+)?(\{[^}]*\}|\*[ \t]+as[ \t]+\w+|\w+)[ \t]+from[ \t]+['"]([^'"]+)['"]/g
const namesIn = (list, allTypes) => list.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const type = allTypes || /^type\s/.test(s)
  const [name, as] = s.replace(/^type\s+/, '').split(/\s+as\s+/)
  return { name, as: as ?? name, type }
})

const fails = []
const notes = []
// what the hosts import: name -> { value: imported as a value somewhere, where: ['file (module)'] }
const used = new Map()
for (const file of hosts) {
  const text = readFileSync(join(root, file), 'utf8')
  for (const m of text.matchAll(STATEMENT)) {
    if (!m[4].startsWith('.')) continue
    const mod = modOf(file, m[4])
    if (!isEngine(mod)) continue
    if (!m[3].startsWith('{')) { notes.push(`${file} imports all of ${mod} (${m[3].trim()}): name what it uses`); continue }
    for (const { name, type } of namesIn(m[3], !!m[2])) {
      const u = used.get(name) ?? { value: false, where: [] }
      u.value ||= !type
      u.where.push(`${file} (${mod})`)
      used.set(name, u)
    }
  }
}

// what hooks/engine.ts exports: name -> { value }
const listed = new Map()
const engineText = readFileSync(join(root, ENGINE), 'utf8')
for (const m of engineText.matchAll(STATEMENT)) {
  const mod = modOf(ENGINE, m[4])
  if (m[1] !== 'export' || !m[3].startsWith('{')) { fails.push(`${ENGINE}: only \`export { ... } from\` lines: ${m[0].trim()}`); continue }
  if (!isEngine(mod)) fails.push(`${ENGINE} re-exports from ${mod}, which is not an engine file`)
  for (const { name, as, type } of namesIn(m[3], !!m[2])) {
    if (as !== name) fails.push(`${ENGINE} renames ${name} to ${as}: keep each name as in its source file`)
    if (listed.has(name)) fails.push(`${ENGINE} exports ${name} twice`)
    listed.set(name, { value: !type })
  }
}
// every line is a comment, blank, or part of an `export { ... } from` statement
const rest = engineText.replace(STATEMENT, '\n').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'))
for (const l of rest) fails.push(`${ENGINE}: a line that is not a re-export: ${l}`)

for (const [name, u] of [...used].sort()) {
  const e = listed.get(name)
  if (!e) notes.push(`${ENGINE} is missing ${name}, imported by ${u.where.join(', ')}`)
  else if (u.value && !e.value) notes.push(`${ENGINE} exports ${name} as a type, but ${u.where.join(', ')} import it as a value`)
}
for (const name of [...listed.keys()].sort()) {
  if (!used.has(name)) notes.push(`${ENGINE} exports ${name}, which no host imports any more`)
}

for (const n of notes) console.log('engine-names: note (the list lags behind the hosts): ' + n)
if (fails.length) {
  for (const f of fails) console.error('engine-names: ' + f)
  process.exit(1)
}
if (notes.length) console.log(`engine-names: hooks/engine.ts lists ${listed.size} names; ${notes.length} differences from the hosts' imports (only a note)`)
else console.log(`engine-names: hooks/engine.ts lists the ${listed.size} engine names the hosts import`)
