// The process runner's view of Node (hooks/process/system.ts, T-474): agent processes start detached (each in its own
// process group), a stop signals the whole group, and a recorded process counts as alive only while `ps` still shows
// it as the program it was started as, started at the recorded time (a reused pid is someone else's).
import { spawn, spawnSync } from 'node:child_process'
import type { ProcessSystem } from '../../hooks/process/system'

const base = (cmd: string) => cmd.slice(cmd.lastIndexOf('/') + 1)

/** How far a process's start (from ps) may be from its entry's `started` and still be the recorded process. */
const START_SLACK_MS = 10_000

/** ps's elapsed time `[[dd-]hh:]mm:ss` in seconds; undefined when it isn't one. */
export function elapsedSeconds(etime: string): number | undefined {
  const m = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(etime.trim())
  if (!m) return undefined
  const [d, h, mi, se] = [m[1], m[2], m[3], m[4]].map(x => Number(x ?? 0)) as [number, number, number, number]
  return ((d * 24 + h) * 60 + mi) * 60 + se
}

/**
 * Whether ps's command line `line` runs `command`: the program itself (its first word is `command`, or has its base
 * name), or a script run by its interpreter (`/bin/sh /path/claude ...`, `node /path/claude ...`: the second word). A
 * name that only shows up in an argument (a path under ~/.claude/, say) doesn't count.
 */
export function runsProgram(line: string, command: string): boolean {
  const name = base(command)
  if (!name) return false
  if (line === command || line.startsWith(`${command} `)) return true
  const [first = '', second = ''] = line.split(/\s+/)
  return base(first) === name || base(second) === name
}

export const nodeProcessSystem: ProcessSystem = {
  spawn: (cmd, args, o) => spawn(cmd, args, { cwd: o.cwd, env: { ...process.env, ...o.env }, detached: true, stdio: [o.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] }),
  signalGroup(pid, sig) {
    process.kill(-pid, sig)
  },
  alive(pid, command, started) {
    try {
      process.kill(pid, 0)
    } catch {
      return false
    }
    const r = spawnSync('ps', ['-o', 'etime=,command=', '-p', String(pid)], { encoding: 'utf8' })
    // when ps can't tell (it failed, or its line can't be read), the process is not counted: nothing is stopped on a guess
    if (r.status !== 0) return false
    const m = /^\s*(\S+)\s+(.*)$/.exec(r.stdout.trim())
    const elapsed = m ? elapsedSeconds(m[1] ?? '') : undefined
    const at = Date.parse(started)
    if (!m || elapsed === undefined || Number.isNaN(at)) return false
    // it started at about the recorded time (the entry is written just after the start; ps counts whole seconds)
    if (Math.abs(Date.now() - elapsed * 1000 - at) > START_SLACK_MS) return false
    return runsProgram(m[2] ?? '', command)
  },
  run: (argv, cwd) => {
    const [cmd, ...args] = argv
    if (!cmd) return { status: null, stdout: '' }
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
    return { status: r.status, stdout: r.stdout ?? '' }
  },
  env: name => process.env[name],
  // not a loose timer: the CLI waits for a stop's grace time before it quits (main.ts then ends the process itself)
  sleep: ms => new Promise<void>(r => void setTimeout(r, ms)),
}
