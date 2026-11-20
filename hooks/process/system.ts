// What the process runner (hooks/process/) needs from the program it runs in: starting a process in its own group,
// signalling a group, telling whether a process still lives, a short command that waits for its answer, the
// environment and a sleep. hooks/process/ imports no Node, Bun, Claude Code or OpenCode module (it is type-checked with
// the rest of hooks/), so each host that runs agents as processes hands it one of these (hosts/node/system.ts).

/** A started process, as far as the runner uses it (Node's ChildProcess fits it). */
export type ProcessChild = {
  pid?: number
  stdout: { on(event: 'data', fn: (chunk: { toString(): string }) => void): void }
  stderr: { on(event: 'data', fn: (chunk: { toString(): string }) => void): void }
  stdin: { end(text?: string): void } | null
  kill(signal?: string): boolean
  on(event: 'close', fn: (code: number | null) => void): void
  on(event: 'error', fn: (err: Error) => void): void
}

export type ProcessSignal = 'SIGTERM' | 'SIGKILL'

export interface ProcessSystem {
  /**
   * Starts `cmd` with `args` in folder `o.cwd`, in its own process group (so a stop ends what it started too), its
   * stdout and stderr piped, and its stdin piped when `o.stdin` (else none).
   */
  spawn(cmd: string, args: readonly string[], o: { cwd?: string; env?: Record<string, string>; stdin: boolean }): ProcessChild
  /** Sends `sig` to process group `pid`; throws when there is no such group. */
  signalGroup(pid: number, sig: ProcessSignal): void
  /**
   * Whether process `pid` still runs and is the agent process started as `command` at time `started` (an ISO date): a
   * pid can be given to another program once its process ended, so the program must be `command` itself (not just a
   * command line that mentions its name) and the process must have started at about `started`; else it answers false.
   */
  alive(pid: number, command: string, started: string): boolean
  /** Runs `argv` in `cwd` and waits for it: its exit status (null when it couldn't run) and output. */
  run(argv: readonly string[], cwd: string | undefined): { status: number | null; stdout: string }
  /** an environment variable */
  env(name: string): string | undefined
  sleep(ms: number): Promise<void>
}
