// The process runner's view of Node (hooks/process/system.ts, T-474): agent processes start detached (each in its own
// process group), a stop signals the whole group, and a recorded process counts as alive only while `ps` still shows
// it as the command it was started as (a reused pid is someone else's).
import { spawn, spawnSync } from 'node:child_process'
import type { ProcessSystem } from '../../hooks/process/system'

const base = (cmd: string) => cmd.slice(cmd.lastIndexOf('/') + 1)

export const nodeProcessSystem: ProcessSystem = {
  spawn: (cmd, args, o) => spawn(cmd, args, { cwd: o.cwd, env: { ...process.env, ...o.env }, detached: true, stdio: [o.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] }),
  signalGroup(pid, sig) {
    process.kill(-pid, sig)
  },
  alive(pid, command) {
    try {
      process.kill(pid, 0)
    } catch {
      return false
    }
    const r = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })
    // a zombie or a pid `ps` can't tell about counts as alive only when ps itself failed (nothing is stopped on a guess the other way)
    if (r.status !== 0) return r.status === null
    const name = base(command)
    return !!name && r.stdout.includes(name)
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
