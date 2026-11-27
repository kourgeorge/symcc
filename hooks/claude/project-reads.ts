// T-1200: a read of a file inside a project repo (a path from the board's project table, maybe outside the board's own
// folder) is allowed without a permission prompt, for a scout, worker or checker; edits there stay refused (T-1198).

/** Whether absolute `p` is inside one of `roots` (no `..` anywhere). */
function inside(p: string, roots: string[]): boolean {
  if (!p.startsWith('/') || p.includes('..')) return false
  return roots.some(r => {
    const root = r.replace(/\/+$/, '')
    return root !== '' && (p === root || p.startsWith(`${root}/`))
  })
}

type Spec = {
  /** Short flags without a value. */
  flags: string
  /** Short flags that take a value, and what the value must look like. */
  valued?: Record<string, 'num' | 'any'>
  /** Long options written `--name=VALUE`. */
  long?: string[]
  /** Allow `-N` (digits) alone. */
  digits?: boolean
  /** The first plain argument is a pattern, not a path (unless -e is given). */
  pattern?: boolean
}

const SPECS: Record<string, Spec> = {
  cat: { flags: 'n' },
  head: { flags: '', valued: { n: 'num', c: 'num' }, digits: true },
  tail: { flags: '', valued: { n: 'num', c: 'num' }, digits: true },
  ls: { flags: 'laARh1tr' },
  wc: { flags: 'lwc' },
  grep: {
    flags: 'rRnilLcvwEFhHs',
    valued: { A: 'num', B: 'num', C: 'num', m: 'num', e: 'any' },
    long: ['include', 'exclude', 'exclude-dir'],
    pattern: true,
  },
}

const FIND_VALUED = new Set(['-name', '-iname', '-path', '-type', '-maxdepth', '-mindepth', '-newer', '-size', '-mtime'])

/** The paths a listed command names, or null when it uses a word, option or shape that is not on the list. */
function listedPaths(words: string[]): string[] | null {
  const cmd = words[0]!
  const args = words.slice(1)
  if (args.some(w => /[{}~]/.test(w))) return null
  const paths: string[] = []
  if (cmd === 'find') {
    let i = 0
    while (i < args.length && !args[i]!.startsWith('-')) paths.push(args[i++]!)
    while (i < args.length) {
      const o = args[i]!
      if (!FIND_VALUED.has(o) || i + 1 >= args.length) return null
      if (o === '-newer') paths.push(args[i + 1]!)
      i += 2
    }
    return paths
  }
  const spec = SPECS[cmd]
  if (!spec) return null
  let needPattern = !!spec.pattern
  let i = 0
  let endOpts = false
  while (i < args.length) {
    const a = args[i++]!
    if (endOpts || !a.startsWith('-') || a === '-') {
      if (needPattern) needPattern = false
      else paths.push(a)
      continue
    }
    if (a === '--') {
      endOpts = true
      continue
    }
    if (a.startsWith('--')) {
      const m = /^--([a-z-]+)=(.+)$/.exec(a)
      if (!m || !spec.long?.includes(m[1]!)) return null
      continue
    }
    if (spec.digits && /^-\d+$/.test(a)) continue
    const cluster = a.slice(1)
    for (let k = 0; k < cluster.length; k++) {
      const ch = cluster[k]!
      if (spec.flags.includes(ch)) continue
      const kind = spec.valued?.[ch]
      if (!kind) return null
      let val = cluster.slice(k + 1)
      if (!val) {
        if (i >= args.length) return null
        val = args[i++]!
      }
      if (kind === 'num' && !/^\d+$/.test(val)) return null
      if (ch === 'e') needPattern = false
      break
    }
  }
  if (needPattern) return null
  return paths
}

/**
 * Whether tool call `tool` with `input` only reads, and every path it names is inside one of `roots` (the project
 * paths): the Read tool with a file there, or one plain shell command from a strict list (cat, head, tail, ls, wc,
 * grep, find, each with only its listed options) with no pipe, redirect, `;`, `&`, `$`, backtick, quote or
 * parenthesis, at least one absolute path, all of them in `roots`.
 */
export function readInsideProjects(tool: string, input: unknown, roots: string[]): boolean {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  if (!roots.length) return false
  if (tool === 'Read') return typeof o.file_path === 'string' && o.file_path.startsWith('/') && inside(o.file_path, roots)
  if (tool !== 'Bash' || typeof o.command !== 'string') return false
  const cmd = o.command.trim()
  if (!cmd || /[|&;<>`$()\n\\"']/.test(cmd)) return false
  const paths = listedPaths(cmd.split(/\s+/))
  return !!paths && paths.length > 0 && paths.every(p => inside(p, roots))
}
