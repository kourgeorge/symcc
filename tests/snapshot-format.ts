// How the saved page pictures (board-snapshot.ts, roles-kinds-snapshot.ts, scouts-settings-snapshot.ts,
// task-page-snapshot.ts, task-page-mobile-snapshot.ts) are written (T-705): each drawn tree is spread over many short
// lines, so a change to one drawn row changes only that row's lines and git can merge two UI tasks line by line.
//
// A node (a Box, a Text, a list of children) that fits in WIDTH characters stays on one line, which is usually one
// drawn row; a bigger one is opened up, one child per line. A string longer than STRING_PIECE is cut into pieces
// joined with `+`, so no line gets much longer than WIDTH (the file is TypeScript, not JSON).
//
// To re-capture a picture, print `snapshotEntry(key, drawnData(await ui.drawn()))` from a short probe test and put
// the lines in place of that key's entry in the file.

export const WIDTH = 160
export const STRING_PIECE = 120

const pad = (depth: number): string => '  '.repeat(depth)

function stringText(s: string, depth: number): string {
  const whole = JSON.stringify(s)
  if (whole.length <= STRING_PIECE) return whole
  const chars = Array.from(s)
  const pieces: string[] = []
  for (let i = 0; i < chars.length; i += STRING_PIECE / 2) pieces.push(JSON.stringify(chars.slice(i, i + STRING_PIECE / 2).join('')))
  return pieces.join(` +\n${pad(depth + 1)}`)
}

/** The value as TypeScript text that starts `depth` levels in (the first line's indent is the caller's). */
export function snapshotText(value: unknown, depth = 0): string {
  if (typeof value === 'string') return stringText(value, depth)
  const flat = JSON.stringify(value)
  if (flat === undefined) throw new Error(`snapshotText: ${typeof value} can't be saved`)
  if (pad(depth).length + flat.length <= WIDTH && !/"(?:[^"\\]|\\.){120,}"/.test(flat)) return flat
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map(v => pad(depth + 1) + snapshotText(v, depth + 1)).join(',\n')}\n${pad(depth)}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return '{}'
    return `{\n${entries.map(([k, v]) => `${pad(depth + 1)}${JSON.stringify(k)}: ${snapshotText(v, depth + 1)}`).join(',\n')}\n${pad(depth)}}`
  }
  return flat
}

/** One page's entry, as it sits in a snapshot file's record (indented one level, ending in a comma). */
export const snapshotEntry = (key: string, tree: unknown): string => `${pad(1)}${JSON.stringify(key)}: ${snapshotText(tree, 1)},`
