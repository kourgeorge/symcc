// T-1200: a read of a file inside a project repo (a path from the board's project table, maybe outside the board's own
// folder) is allowed without a permission prompt, for a scout, worker or checker; edits there stay refused (T-1198).

const READ_WORDS = new Set(['cat', 'head', 'tail', 'grep', 'rg', 'ls', 'find', 'wc', 'stat', 'file', 'tree', 'diff', 'sort', 'uniq', 'du'])

/** Whether absolute `p` is inside one of `roots` (no `..` piece). */
function inside(p: string, roots: string[]): boolean {
  if (p.split('/').includes('..')) return false
  return roots.some(r => {
    const root = r.replace(/\/+$/, '')
    return root !== '' && (p === root || p.startsWith(`${root}/`))
  })
}

/**
 * Whether tool call `tool` with `input` only reads, and every path it names is inside one of `roots` (the project
 * paths): the Read tool with a file there, or one plain shell command of read-only words (cat, grep, find, ls ...)
 * with no pipe, redirect, `;`, `&`, `$`, backtick or parenthesis, at least one absolute path, all of them in `roots`.
 */
export function readInsideProjects(tool: string, input: unknown, roots: string[]): boolean {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  if (!roots.length) return false
  if (tool === 'Read') return typeof o.file_path === 'string' && o.file_path.startsWith('/') && inside(o.file_path, roots)
  if (tool !== 'Bash' || typeof o.command !== 'string') return false
  const cmd = o.command.trim()
  if (!cmd || /[|&;<>`$()\n\\]/.test(cmd)) return false
  const words = cmd.split(/\s+/).map(w => w.replace(/^(['"])(.*)\1$/, '$2'))
  if (!READ_WORDS.has(words[0]!)) return false
  if (words[0] === 'find' && words.some(w => /^-(exec|execdir|ok|okdir|delete|fprint\w*|fls)$/.test(w))) return false
  if (words.some(w => w.includes('"') || w.includes("'"))) return false
  const paths = words.slice(1).filter(w => w.startsWith('/') || w.startsWith('~') || w.includes('/../'))
  return paths.length > 0 && paths.every(p => p.startsWith('/') && inside(p, roots))
}
