// The Roles and Task types pages as a table (T-918): one line per role or task type, the columns lined up, the description cut
// to fit with "…". Every board draws it from here (the terminal, VS Code, OpenCode):
//     NAME        FROM       MODEL   WEB  WRITES  WHAT IT'S FOR
//   ❯ general     changed    —       —    code    a plain worker for any task
//     researcher  built-in   —       web  —       finds things out and hands back an answer
// When narrow the columns go in this order: MODEL, WEB, WRITES; then the description is cut. The name never cuts.
// Also what a role writes (code, prose only, or nothing), as its WRITES cell and as the "Writes: ..." line of its page.
import { type RoleDef, isCheckerRole, isProseRole } from './roles'
import type { KindDef } from './kinds'
import { type DefSource, type BrokenDef, brokenLabel } from './def-files'
import { textWidth, padWidth, cutTitle } from './width'
import { plural } from './text'

/** A column of the table. */
export type DefCol = 'name' | 'from' | 'model' | 'web' | 'writes' | 'about'

/** The column heads, as the table's first line shows them. */
export const DEF_COL_HEADS: Record<DefCol, string> = { name: 'NAME', from: 'FROM', model: 'MODEL', web: 'WEB', writes: 'WRITES', about: "WHAT IT'S FOR" }

/** The Roles page's columns, and the Kinds page's. */
export const ROLE_COLS: readonly DefCol[] = ['name', 'from', 'model', 'web', 'writes', 'about']
export const KIND_COLS: readonly DefCol[] = ['name', 'from', 'about']

/** The columns that go when the table is narrow, first to last; then the description is cut. */
export const DROP_ORDER: readonly DefCol[] = ['model', 'web', 'writes']

/** A cell that says nothing ("no model", "no web", "writes nothing"). */
export const NONE_CELL = '—'
/** The spaces between two columns. */
export const TABLE_GAP = 2
/** The room in front of each line, for the cursor mark. */
export const TABLE_INDENT = 2
/** What marks the cursor's line (as the other lists). */
export const CURSOR_MARK = '❯ '
/** The fewest columns of description a line keeps before a column goes. */
export const MIN_ABOUT = 16

/** Where a role or task type comes from, as its FROM cell says it: off wins. */
export type DefFrom = 'built-in' | 'changed' | 'added by you' | 'off'
export const defFrom = (source: DefSource | undefined, off: boolean): DefFrom => (off ? 'off' : source === 'replaced' ? 'changed' : source === 'added' ? 'added by you' : 'built-in')
/** The color of a FROM cell. */
export const FROM_TONE: Record<DefFrom, string> = { 'built-in': 'inactive', changed: 'suggestion', 'added by you': 'success', off: 'warning' }

/** What a role's worker writes: code (the tests run before merging), prose only (code: false), or nothing (a role
 *  that only answers questions, as researcher: its tasks are investigations by default). */
export type RoleWrites = 'code' | 'prose' | 'nothing'
/** The roles whose workers only find things out and answer (nothing is merged). */
export const INVESTIGATION_ROLES: readonly string[] = ['researcher']
export function roleWrites(r: Pick<RoleDef, 'name' | 'code'>): RoleWrites {
  if (isProseRole(r)) return 'prose'
  return INVESTIGATION_ROLES.includes(r.name.toLowerCase()) ? 'nothing' : 'code'
}
/** A role's WRITES cell. */
export const WRITES_CELL: Record<RoleWrites, string> = { code: 'code', prose: 'prose', nothing: NONE_CELL }
/** What the "Writes:" line of a role's page says after "Writes: ". */
export const WRITES_TEXT: Record<RoleWrites, string> = {
  code: 'code (tests run before merging)',
  prose: 'prose only (code: false; only docs checks run)',
  nothing: 'nothing (answers questions; nothing is merged)',
}
/** The line near the top of every role's page: "Writes: code (tests run before merging)". */
export const roleWritesLine = (r: Pick<RoleDef, 'name' | 'code'>): string => `Writes: ${WRITES_TEXT[roleWrites(r)]}`

/** The Edit page's pick for what a role writes: its two choices, the words each shows, and the role's now. */
export type CodePick = 'code' | 'prose'
export const CODE_PICKS: readonly CodePick[] = ['code', 'prose']
export const CODE_PICK_LABEL: Record<CodePick, string> = { code: 'code', prose: 'prose only' }
export const codePickOf = (r: Pick<RoleDef, 'code'> | undefined): CodePick => (isProseRole(r) ? 'prose' : 'code')
/** What the pick says under its choices. */
export const CODE_PICK_HINT = 'code: its tests run before merging · prose only: it may only change prose files (.md), and only docs checks run'

/** One line of the table: the name, each cell's text, whether it is off (a dim line), and why its file can't be read. */
export type DefRow = { name: string; off: boolean; cells: Partial<Record<DefCol, string>>; broken?: string; mine?: boolean }
/** Whether the owner's own file says it (changed or added; for the heading's count). */
const mineOf = (source: DefSource | undefined) => source === 'replaced' || source === 'added'

/** A role's line. The checker role never shows as off (its off: only keeps it out of the task roles). */
export function roleTableRow(r: RoleDef, source: DefSource | undefined): DefRow {
  const off = !!r.off && !isCheckerRole(r.name)
  return {
    name: r.name,
    off,
    mine: mineOf(source),
    cells: { from: defFrom(source, off), model: r.model || NONE_CELL, web: (r.tools ?? []).includes('web') ? 'web' : NONE_CELL, writes: WRITES_CELL[roleWrites(r)], about: r.description },
  }
}
/** A kind's line. */
export const kindTableRow = (k: KindDef, source: DefSource | undefined): DefRow => ({ name: k.name, off: !!k.off, mine: mineOf(source), cells: { from: defFrom(source, !!k.off), about: k.description } })
/** The line of a file that can't be read: its name, then why. */
export const brokenTableRow = (b: BrokenDef): DefRow => ({ name: b.name, off: false, cells: {}, broken: brokenLabel(b) })

/** What the owner reads for a role or a kind: "role" or "task type". */
export const defWord = (noun: 'role' | 'kind'): string => (noun === 'kind' ? 'task type' : 'role')

/** The heading's count: "8 roles · 2 changed by you · 1 off" (changed: the owner's own files, changed or added, off ones too). */
export function defsCountText(noun: 'role' | 'kind', rows: readonly DefRow[]): string {
  const changed = rows.filter(r => r.mine).length
  const off = rows.filter(r => r.off).length
  return `${plural(rows.length, defWord(noun))}${changed ? ` · ${changed} changed by you` : ''}${off ? ` · ${off} off` : ''}`
}

/** The columns that fit in `width` and each one's width (the description's is what is left). */
export type DefLayout = { cols: DefCol[]; widths: Record<DefCol, number> }

/** Which columns fit in `width` (cursor room included) and how wide each is: as wide as its head or widest cell; when
 *  that leaves less than MIN_ABOUT for the description, MODEL goes, then WEB, then WRITES; then the description is
 *  cut. The name is never cut: a line may then be wider than `width`. */
export function defLayout(rows: readonly DefRow[], all: readonly DefCol[], width: number): DefLayout {
  const widths = {} as Record<DefCol, number>
  for (const c of all) widths[c] = Math.max(textWidth(DEF_COL_HEADS[c]), ...rows.map(r => textWidth(c === 'name' ? r.name : r.cells[c] ?? '')))
  let cols = [...all]
  const room = width - TABLE_INDENT
  const fixed = () => cols.filter(c => c !== 'about').reduce((n, c) => n + widths[c] + TABLE_GAP, 0)
  for (const d of DROP_ORDER) if (fixed() + MIN_ABOUT > room && cols.includes(d)) cols = cols.filter(c => c !== d)
  if (cols.includes('about')) {
    const left = room - fixed()
    if (left < 2) cols = cols.filter(c => c !== 'about')
    else widths.about = Math.min(widths.about, left)
  }
  return { cols, widths }
}

/** One cell as drawn: its column and its text (padded to the column, then the gap; the last one not padded). */
export type DefCell = { col: DefCol; text: string }

/** The cells of line `row` (or of the head line, `'head'`) in `layout`, without the cursor room. A file that can't be
 *  read shows its name, then "— your file can't be read: ..." over the other columns, cut to fit. */
export function defCells(layout: DefLayout, row: DefRow | 'head'): DefCell[] {
  const { cols, widths } = layout
  const last = cols.length - 1
  const cell = (c: DefCol, text: string, i: number): DefCell => {
    const cut = c === 'about' ? cutTitle(text, widths.about) : text
    return { col: c, text: i === last ? cut : padWidth(cut, widths[c] + TABLE_GAP) }
  }
  if (row === 'head') return cols.map((c, i) => cell(c, DEF_COL_HEADS[c], i))
  if (row.broken) {
    const rest = cols.slice(1).reduce((n, c) => n + widths[c], 0) + Math.max(0, cols.length - 2) * TABLE_GAP
    const name = cols.length > 1 ? padWidth(row.name, widths.name + TABLE_GAP) : row.name
    return [{ col: 'name', text: name }, ...(cols.length > 1 ? [{ col: 'about' as const, text: cutTitle(`— ${row.broken}`, Math.max(2, rest)) }] : [])]
  }
  return cols.map((c, i) => cell(c, c === 'name' ? row.name : row.cells[c] ?? '', i))
}

/** A whole line as text (cursor mark or room first): for tests and the plain pictures. */
export const defLineText = (layout: DefLayout, row: DefRow | 'head', cursor = false): string => (cursor ? CURSOR_MARK : ' '.repeat(TABLE_INDENT)) + defCells(layout, row).map(c => c.text).join('')

/** The color of a cell of `row`: the name bold in the accent color, FROM in its tone, the rest dim or plain; an off
 *  line all dim (its FROM says "off"); a broken line's name dim and its reason in the error color. */
export function defCellTone(row: DefRow, col: DefCol): { color: string; bold?: boolean } {
  if (row.broken) return col === 'name' ? { color: 'inactive', bold: true } : { color: 'error' }
  if (col === 'name') return row.off ? { color: 'inactive' } : { color: 'claude', bold: true }
  if (row.off) return { color: 'inactive' }
  if (col === 'from') return { color: FROM_TONE[(row.cells.from as DefFrom) ?? 'built-in'] ?? 'inactive' }
  if (col === 'about') return { color: 'text' }
  return { color: row.cells[col] === NONE_CELL ? 'subtle' : 'text' }
}

/** The "+ New role (n)" line's words. */
export const newDefText = (noun: 'role' | 'kind') => `+ New ${defWord(noun)} (n)`
