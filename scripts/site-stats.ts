// Writes docs/data/symcc-stats.json: aggregate numbers of this project's own board for the website's "Built with
// symcc" page (T-1145). Run it before a release (the owner or the lead), then commit the JSON:
//   bun scripts/site-stats.ts [--root <project folder>] [--out <json file>] [--from YYYY-MM-DD]
// It reads <root>/.symcc/ (board.json, tasks/, archive*.json, scouts.json) through the stats code and, when it can,
// the lead's tokens from Claude Code's session logs. Only counts, times and tokens are written: never a task
// title, detail, request, report, path or person's name (see hooks/core/site-stats.ts).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readArchive } from '../hooks/core/archive'
import { archiveChunkFile, joinParts, partsFilesNamed, readParts } from '../hooks/core/board-parts'
import { readBoardValue } from '../hooks/core/board-file'
import { parseScoutUsage } from '../hooks/core/scout-usage'
import { siteStats } from '../hooks/core/site-stats'
import { leadUsage } from '../hooks/claude/lead-usage'
import type { SymccTask } from '../types'

const text = (f: string): string | null => (existsSync(f) ? readFileSync(f, 'utf8') : null)

export async function collect(root: string, from: string, nowMs: number, offsetMin = -new Date(nowMs).getTimezoneOffset()) {
  const data = join(root, '.symcc')
  const boardText = text(join(data, 'board.json'))
  if (boardText === null) throw new Error(`site-stats: no board at ${join(data, 'board.json')}`)
  const raw: unknown = JSON.parse(boardText)
  const files = new Map<string, Record<string, Record<string, unknown>>>()
  for (const rel of partsFilesNamed(raw)) {
    const t = text(join(data, rel))
    if (t !== null) files.set(rel, readParts(t).tasks)
  }
  const read = readBoardValue(joinParts(raw, files).raw)
  if (read.broken) throw new Error(`site-stats: board.json can't be read: ${read.broken}`)
  const archived = new Map<string, SymccTask>()
  for (let i = 0; i < 200; i++) {
    const t = text(archiveChunkFile(join(data, 'archive.json'), i))
    if (t === null) break
    for (const x of readArchive(t).archive.tasks) archived.set(x.id, x as SymccTask)
  }
  const host = {
    env: async (k: string) => process.env[k],
    fs: {
      list: async (d: string) => readdirSync(d).map(name => { const s = statSync(join(d, name)); return { name, kind: s.isFile() ? 'file' : 'dir', size: s.size, mtimeMs: s.mtimeMs } }),
      read: async (f: string) => readFileSync(f, 'utf8'),
    },
    run: async (cmd: string[], o?: { cwd?: string }) => {
      const p = Bun.spawn(cmd, { cwd: o?.cwd, stdout: 'pipe', stderr: 'ignore' })
      return { stdout: await new Response(p.stdout).text(), exitCode: await p.exited }
    },
  }
  const lead = await leadUsage(host as never, root, { kind: 'all' }, nowMs).catch(() => ({ leadProblem: 'unreadable' }))
  const team = { ...lead, scouts: parseScoutUsage(text(join(data, 'scouts.json'))) }
  return siteStats({ tasks: read.board.tasks as SymccTask[], archived: [...archived.values()], nowMs, from, team, offsetMin })
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const opt = (n: string) => { const k = args.indexOf(n); return k >= 0 ? args[k + 1] : undefined }
  const root = resolve(opt('--root') ?? join(import.meta.dir, '..'))
  const out = resolve(opt('--out') ?? join(root, 'docs/data/symcc-stats.json'))
  const stats = await collect(root, opt('--from') ?? '2026-11-09', Date.now())
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(stats, null, 2) + '\n')
  console.log(`site-stats: wrote ${out} (${stats.tasks.done} tasks done, ${stats.perDay.length} days)`)
}
