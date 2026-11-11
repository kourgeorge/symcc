// The plugin's name, and everything made from it. The name itself comes from "name" in
// .claude-plugin/plugin.json (read at runtime as $.plugin.name); DEFAULT_NAME is only the
// fallback, for tests and for code that runs before the plugin knows its name.
// To rename the plugin, change "name" in plugin.json and DEFAULT_NAME below.

export const DEFAULT_NAME = 'symcc'

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
