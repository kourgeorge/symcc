// T-902: one board for the /<name>-status tests in every client (Claude Code, OpenCode, the Node host): T-1 waits for the
// owner's answer, T-2 runs its second try and is in tests, T-3 is in review, T-4 (to do) waits for T-2 (a waiting train),
// T-5 and T-6 were merged earlier today. Only hooks/core: the OpenCode and Node host specs (bun test) import it too.
import { addTask } from '../hooks/core/task'
import { emptyBoard, type Board, type BoardTask } from '../hooks/core/board-file'
import { localOffset } from '../hooks/core/days'
import { liveTodayLines, segText, LIVE_INDENT, liveLegend, liveInner } from '../hooks/core/live'

/** A moment inside nowMs's local day: `share` 0 is midnight, 1 is nowMs (tests/day-clock.ts's inToday, kept here so
 *  the bun specs need nothing more). */
function inToday(nowMs: number, share: number): number {
  const off = localOffset(nowMs)
  const start = nowMs - ((((nowMs + off * 60_000) % 86_400_000) + 86_400_000) % 86_400_000)
  return start + Math.round((nowMs - start) * share)
}

/** The board at `nowMs`; with `quiet`, T-1 and T-3 are left out (nothing waits for the owner). */
export function statusBoard(nowMs: number, quiet = false): Board {
  const iso = (ms: number) => new Date(ms).toISOString()
  const at = iso(nowMs)
  const titles = ['Pick the database', 'Add search to the list', 'Fix the login page', 'Write the export', 'Speed up the import', 'Tidy the README']
  let b = emptyBoard()
  for (const [i, title] of titles.entries()) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'], after: i === 3 ? ['T-2'] : [] }, at)[0]
  const started = iso(nowMs - 10 * 60_000)
  const handed = iso(nowMs - 4 * 60_000)
  const testing = iso(nowMs - 2 * 60_000)
  const merged = (share: number) => {
    const when = inToday(nowMs, share)
    return { runs: [{ started: iso(when - 60_000), ended: iso(when - 30_000), agents: [{ id: 'w', kind: 'worker' as const, started: iso(when - 60_000), ended: iso(when - 30_000), tokens: { input: 1_000_000 } }] }], history: [{ kind: 'merged', at: iso(when), text: 'try 1 → merged into main' }] }
  }
  const patch: Record<string, Partial<BoardTask>> = {
    'T-1': { status: 'waiting', ask: { by: 'worker', text: 'Postgres or SQLite?', options: ['Postgres', 'SQLite'], asked_at: at } as BoardTask['ask'] },
    'T-2': { status: 'doing', attempts: 2, live: { session: 'driver', checking: { step: 'testing', at: testing } }, runs: [{ started: iso(nowMs - 30 * 60_000), ended: iso(nowMs - 20 * 60_000) }, { started, ended: handed }], history: [{ kind: 'stage', step: 'tests', at: testing, text: 'tests started' }] } as Partial<BoardTask>,
    'T-3': { status: 'review' },
    'T-5': { status: 'done', ...merged(0.3) } as Partial<BoardTask>,
    'T-6': { status: 'done', ...merged(0.6) } as Partial<BoardTask>,
  }
  const tasks = b.tasks.map(t => ({ ...t, ...(patch[t.id] ?? {}) }) as BoardTask).filter(t => !quiet || (t.id !== 'T-1' && t.id !== 'T-3'))
  return { ...b, tasks }
}

/** The TODAY lines the Live tab draws for `b` at `nowMs` in an 80-column chat (as /<name>-status prints them). */
export const statusTodayLines = (b: Board, nowMs: number): string[] => liveTodayLines({ tasks: b.tasks }, nowMs, 79).map(x => (LIVE_INDENT + segText(x)).trimEnd())

/** The section headings' words in a /<name>-status text, in order (each heading line starts with "─── ❯ " and one). */
export const statusHeadings = (text: string): string[] =>
  text.split('\n').flatMap(l => {
    const m = /^─── ❯ (NEEDS YOU|TASKS|BRANCHES|TODAY|ORGANIZATIONAL MEMORY)\b/.exec(l)
    return m ? [m[1]!] : []
  })

/** The lines of section `name` (from its heading to the next blank line), heading left out. */
export function statusSection(text: string, name: string): string[] {
  const lines = text.split('\n')
  const i = lines.findIndex(l => l.startsWith(`─── ❯ ${name}`))
  if (i < 0) return []
  const end = lines.findIndex((l, j) => j > i && l === '')
  return lines.slice(i + 1, end < 0 ? undefined : end)
}

/** T-933: the lines from the hint line to the end: the hint, then the ✧ / ⌀ legend (cut to `width`) when lanes show. */
export function statusTail(text: string, hint: string): string[] {
  const lines = text.split('\n')
  return lines.slice(lines.lastIndexOf(hint))
}

/** T-933: what statusTail should be at `width` columns: the hint, then the legend lines. */
export function statusTailWant(hint: string, width = 80): string[] {
  return [hint, ...liveLegend(liveInner(width)).map(x => LIVE_INDENT + x)]
}
