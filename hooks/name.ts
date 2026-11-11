// The plugin's name, and everything made from it. The name itself comes from "name" in
// .claude-plugin/plugin.json (read at runtime as $.plugin.name); DEFAULT_NAME is only the
// fallback, for tests and for code that runs before the plugin knows its name.
// To rename the plugin, change "name" in plugin.json and DEFAULT_NAME below.

export const DEFAULT_NAME = 'symcc'

/**
 * The plugin's icon for one-line spots (panel title, band above the prompt, boardText's first
 * line): a treble clef, U+1D11E. It sits outside the basic range, so in JavaScript its
 * `.length` is 2 although it takes one column. The plugin never measures it itself: these
 * spots hand it to the engine as one whole Text (wrap="truncate"), and the banner text that the
 * plugin does measure (cutParts in board.ts) never contains it. If a terminal draws it badly,
 * "♪" (U+266A, inside the basic range) is the safe fallback. The status line keeps no icon.
 */
export const ICON = '\u{1D11E}'

/**
 * The icon drawn for the banner at the top of the open board: a small treble clef, 4 lines
 * tall and 5 columns wide, every line padded to the same width. A loop at the top, the line
 * down through the middle, the curl around it, and a hook at the bottom.
 */
export const ICON_ART = [
  '  ╭╮ ',
  '╭─┼╯ ',
  '╰─┼─╯',
  ' ╰╯  ',
]

/** A usable plugin name: letters, digits, ".", "_" or "-"; anything else falls back to DEFAULT_NAME. */
export function cleanName(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(s) ? s : DEFAULT_NAME
}

/** The data folder in the project: ".<name>". The board, lock, lead file, worktrees and scouts live in it. */
export const dataDir = (name: string = DEFAULT_NAME) => `.${name}`

/** Everything made from the plugin's name. */
export function namesFor(raw: string = DEFAULT_NAME) {
  const name = cleanName(raw)
  const dir = dataDir(name)
  return {
    name,
    /** ".<name>" */
    dir,
    boardFile: `${dir}/board.json`,
    lockFile: `${dir}/board.lock`,
    leadFile: `${dir}/lead.json`,
    worktrees: `${dir}/worktrees`,
    scouts: `${dir}/scouts`,
    /** a task's branch: "<name>/T-1" */
    branch: (id: string) => `${name}/${id}`,
    /** who the plugin's own commits and merges are by */
    author: { name, email: `${name}@localhost` },
    worker: `${name}:worker`,
    scout: `${name}:scout`,
    /** a tool's full name as the model sees it: "mcp__<name>__board" */
    tool: (t: string) => `mcp__${name}__${t}`,
    /** the board panel's id */
    pane: `${name}-board`,
    /** the board's name in titles: "<name> board" */
    boardName: `${name} board`,
    /** the manual command, without its slash */
    man: `${name}-man`,
    /** a toast line: "<name>: <text>" */
    toast: (text: string) => `${name}: ${text}`,
  }
}

export type Names = ReturnType<typeof namesFor>
