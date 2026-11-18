// A Host (hooks/host.ts) made of plain Node/Bun APIs, with no Claude Code at all (T-377): files are node:fs, commands
// and git are child processes, timers are setTimeout/setInterval, the environment is process.env. It has no screen
// (no panel, no band, no plan mode, no lead usage): the board is the text board, and a board update for the lead is
// kept until the CLI takes it (wakeLead 'next-turn', see leadUpdate in hooks/app/symcc.ts) and prints it. The agents
// are external processes (runner.ts). This is the proof that hooks/app/ and hooks/core/ run outside Claude Code; an
// OpenCode plugin or a standalone client builds its Host the same way.
import { readFile, writeFile, mkdir, readdir, lstat, stat, realpath, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { type Host, type HostFeatures, type HostFileEntry, type HostFileStat, type HostRunResult, SYMCC_WORDS, noUi } from '../../hooks/host'

/** What this host can do: no screen, and the lead is told when the CLI asks (it prints the update). */
export const NODE_FEATURES: HostFeatures = { panel: false, band: false, wakeLead: 'next-turn', planMode: false, leadUsage: false, startQueue: false }

/** The symcc folder this file ships in (where roles/, kinds/, examples/ and .claude-plugin/plugin.json are). */
export const PLUGIN_ROOT = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '')).replace(/\/hosts\/node\/[^/]*$/, '')

export type NodeHostOptions = {
  /** the project folder (a git repository, or the folder to make one in) */
  root: string
  /** the workers, scouts and checkers (runner.ts processAgents) */
  agents: Host['agents']
  /** this session's id; the CLI uses one fixed id, so each run takes the board over from the last one */
  sessionId?: string
  /** symcc's own folder (default: the one this file ships in) */
  pluginRoot?: string
  /** where notices and debug lines go (default: stderr; debug lines only with SYMCC_DEBUG set) */
  say?: (line: string) => void
  /** what this session has cost so far (the runner adds up its processes' costs) */
  cost?: () => number | undefined
}

/** Runs `argv` (no shell) and answers its exit code and output; a timeout kills it (exit code 124). */
export function runCommand(argv: readonly string[], init: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {}): Promise<HostRunResult> {
  return new Promise(resolve => {
    const [cmd, ...args] = argv
    if (!cmd) return resolve({ exitCode: 127, stdout: '', stderr: 'no command' })
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (r: HostRunResult) => void (done || ((done = true), timer && clearTimeout(timer), resolve(r)))
    const child = spawn(cmd, args, { cwd: init.cwd, env: { ...process.env, ...init.env }, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = init.timeoutMs ? setTimeout(() => (child.kill('SIGKILL'), finish({ exitCode: 124, stdout, stderr: `${stderr}\ntimed out after ${init.timeoutMs} ms` })), init.timeoutMs) : null
    child.stdout.on('data', c => void (stdout += c.toString()))
    child.stderr.on('data', c => void (stderr += c.toString()))
    child.on('error', err => finish({ exitCode: 127, stdout, stderr: err.message }))
    child.on('close', code => finish({ exitCode: code ?? 1, stdout, stderr }))
  })
}

const kindOf = (s: { isFile(): boolean; isDirectory(): boolean }): HostFileEntry['kind'] => (s.isFile() ? 'file' : s.isDirectory() ? 'dir' : 'other')

/** host.fs over node:fs: write makes the file's folder first (as Claude Code's $.fs.write does). */
export const nodeFs: Host['fs'] = {
  read: p => readFile(p, 'utf8'),
  async write(p, text) {
    const dir = p.slice(0, p.lastIndexOf('/'))
    if (dir) await mkdir(dir, { recursive: true })
    await writeFile(p, text, 'utf8')
  },
  exists: p => access(p).then(() => true, () => false),
  async list(p) {
    const out: HostFileEntry[] = []
    for (const e of await readdir(p, { withFileTypes: true })) {
      const s = await lstat(`${p}/${e.name}`).catch(() => null)
      if (!s) continue
      const link = s.isSymbolicLink()
      const real = link ? await stat(`${p}/${e.name}`).catch(() => null) : s
      out.push({ name: e.name, kind: real ? kindOf(real) : 'other', size: s.size, mtimeMs: s.mtimeMs, isLink: link })
    }
    return out
  },
  async stat(p, options) {
    const s = await lstat(p)
    const link = s.isSymbolicLink()
    if (!options?.resolve) return { kind: link ? 'other' : kindOf(s), size: s.size, mtimeMs: s.mtimeMs, isLink: link }
    const real = await stat(p)
    const out: HostFileStat = { kind: kindOf(real), size: real.size, mtimeMs: real.mtimeMs, isLink: link, realPath: await realpath(p) }
    return out
  },
}

/** A timer that doesn't keep the process alive by itself (the CLI ends when its command is done). */
const loose = <T extends { unref?: () => unknown }>(t: T): T => (t.unref?.(), t)

/** host.clock over setTimeout/setInterval. */
export const nodeClock: Host['clock'] = {
  after(ms, fn) {
    const t = loose(setTimeout(fn, ms))
    return { cancel: () => clearTimeout(t) }
  },
  every(ms, fn) {
    const t = loose(setInterval(fn, ms))
    return { cancel: () => clearInterval(t) }
  },
  sleep: ms => new Promise<void>(r => void setTimeout(r, ms)),
}

/** The Host for project `o.root`, with plain Node/Bun APIs and `o.agents` (runner.ts). */
export function nodeHost(o: NodeHostOptions): Host {
  const pluginRoot = o.pluginRoot ?? PLUGIN_ROOT
  const say = o.say ?? ((line: string) => void process.stderr.write(`${line}\n`))
  const id = o.sessionId ?? 'node-host'
  return {
    features: NODE_FEATURES,
    plugin: { name: 'symcc', root: pluginRoot },
    session: {
      id: async () => id,
      async repo() {
        const r = await runCommand(['git', 'rev-parse', '--show-toplevel'], { cwd: o.root })
        return r.exitCode === 0 && r.stdout.trim() ? { root: r.stdout.trim() } : null
      },
      root: async () => o.root,
      usage: async () => {
        const usd = o.cost?.()
        return usd === undefined ? {} : { cost: { usd } }
      },
    },
    // The CLI prints the board update itself (leadUpdate); a send only happens on a host whose wakeLead is 'now'.
    lead: { send: async text => say(`[lead] ${text}`), usage: async () => ({}) },
    agents: o.agents,
    words: SYMCC_WORDS,
    env: async name => process.env[name],
    fs: nodeFs,
    run: runCommand,
    clock: nodeClock,
    ui: {
      ...noUi,
      toast: text => say(text),
      log: text => void (process.env.SYMCC_DEBUG ? say(`[debug] ${text}`) : undefined),
    },
  }
}
