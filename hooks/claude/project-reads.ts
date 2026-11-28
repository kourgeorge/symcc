// T-1200: a read of a file inside a project repo (a path from the board's project table, maybe outside the board's own
// folder) is allowed without a permission prompt, for a scout, worker or checker; edits there stay refused (T-1198).
// T-1211: each path is judged by where it really leads (symbolic links followed), so a link in a project repo that
// points elsewhere (say to ~/.ssh) gets no automatic allow.
import { realPathOf, type PathLookup } from '../core/path-guard'

/** Whether clean absolute `p` is `root` or inside it. */
const under = (p: string, root: string) => root !== '' && (p === root || p.startsWith(`${root}/`))

/** Each of `roots` by both its names: as written, and where its links lead (when it can be looked up). */
async function rootNames(roots: string[], look: PathLookup): Promise<string[]> {
  const out: string[] = []
  for (const r of roots) {
    const root = r.replace(/\/+$/, '')
    if (!root.startsWith('/')) continue
    out.push(root)
    const real = await realPathOf('/', root, look).catch(() => undefined)
    if (real && real !== '/' && real !== root) out.push(real)
  }
  return out
}

/**
 * Whether absolute `p` (no `..` anywhere) really lands inside one of `names`: the path as written must be inside one,
 * and so must where it leads once links are followed (realPathOf; the last part may not exist yet). A path that can't
 * be looked up, or goes through a link that leads nowhere, is not inside.
 */
async function inside(p: string, names: string[], look: PathLookup): Promise<boolean> {
  if (!p.startsWith('/') || p.includes('..')) return false
  if (!names.some(n => under(p, n))) return false
  const real = await realPathOf('/', p, look).catch(() => undefined)
  return typeof real === 'string' && names.some(n => under(real, n))
}

/** Shell wildcard characters: the shell would turn such a word into other paths than the ones checked. */
const GLOB = /[*?[\]]/

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
    // no -R: it follows every link it meets inside a folder, to anywhere on disk (T-1211)
    flags: 'rnilLcvwEFhHs',
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
    if (paths.some(p => GLOB.test(p))) return null
    while (i < args.length) {
      const o = args[i]!
      if (!FIND_VALUED.has(o) || i + 1 >= args.length) return null
      if (o === '-newer') {
        if (GLOB.test(args[i + 1]!)) return null
        paths.push(args[i + 1]!)
      }
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
      // a wildcard in a path or pattern word could turn into more paths (a pattern word into a file to read)
      if (GLOB.test(a)) return null
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
      if (GLOB.test(val)) return null
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
 * parenthesis or shell wildcard in a path or pattern, at least one absolute path, all of them in `roots`. Every path
 * and root is also looked up through `look` (T-1211): a path whose links lead outside every root is not allowed.
 */
export async function readInsideProjects(tool: string, input: unknown, roots: string[], look: PathLookup): Promise<boolean> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  if (!roots.length) return false
  let paths: string[] | null = null
  if (tool === 'Read') paths = typeof o.file_path === 'string' ? [o.file_path] : null
  else if (tool === 'Bash' && typeof o.command === 'string') {
    const cmd = o.command.trim()
    if (!cmd || /[|&;<>`$()\n\\"']/.test(cmd)) return false
    paths = listedPaths(cmd.split(/\s+/))
  }
  if (!paths || !paths.length || !paths.every(p => p.startsWith('/') && !p.includes('..'))) return false
  const names = await rootNames(roots, look)
  for (const p of paths) if (!(await inside(p, names, look))) return false
  return true
}
