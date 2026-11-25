// serve (the plugin's editor/serve.mjs) for one project: started with the editor's own Node (ELECTRON_RUN_AS_NODE)
// unless a Node is set, spoken to in JSON lines (../../contract.ts). A crash restarts it, a few times at most.
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { EditorAction, EngineState, ExtensionLine, ReadyEvent, Surface } from '../../contract'

export type EngineEvents = {
  state: (s: EngineState) => void
  ready: (r: ReadyEvent) => void
  webview: (message: unknown, surface?: Surface) => void
  editor: (a: EditorAction) => void
  log: (line: string) => void
}

/**
 * `serve`: the file to run. `args`: what its command line adds (--agents, --lead-model, ...) and `env` what its
 * environment adds, both read at each start: the settings and the proxy can change in between.
 */
export type EngineOptions = { root: string; serve: () => string; node?: string; args?: () => string[]; env?: () => Record<string, string> }

type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }
/** A line serve answers, without the id this file gives it. */
type Request = ExtensionLine extends infer L ? (L extends { id: number } ? Omit<L, 'id'> : never) : never

/** How many times a crashed serve is started again before the owner has to restart it. */
const RESTARTS = 3
/** How many lines wait for serve while it starts; older ones are dropped. */
const QUEUED = 200

export class Engine {
  private child: ChildProcess | undefined
  private next = 1
  private pending = new Map<number, Pending>()
  private queue: string[] = []
  private crashes = 0
  private stopping = false
  state: EngineState = { state: 'stopped' }

  constructor(
    private readonly o: EngineOptions,
    private readonly on: EngineEvents,
  ) {}

  start() {
    if (this.child) return
    this.stopping = false
    this.set({ state: 'starting' })
    const args = [this.o.serve(), '--root', this.o.root, ...(this.o.args?.() ?? [])]
    const node = this.o.node || process.execPath
    const env = { ...process.env, SYMCC_DEBUG: '1', ...this.o.env?.(), ...(this.o.node ? {} : { ELECTRON_RUN_AS_NODE: '1' }) }
    this.on.log(`starting: ${node} ${args.join(' ')}`)
    const child = spawn(node, args, { cwd: this.o.root, env, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    createInterface({ input: child.stdout! }).on('line', line => this.line(line))
    createInterface({ input: child.stderr! }).on('line', line => this.on.log(line))
    child.on('error', err => this.on.log(`couldn't start symcc: ${err.message}`))
    child.on('exit', (code, signal) => {
      this.child = undefined
      for (const p of this.pending.values()) p.reject(new Error('symcc stopped'))
      this.pending.clear()
      this.on.log(`symcc ended (${signal ?? `exit ${code}`})`)
      if (this.stopping) return this.set({ state: 'stopped' })
      if (++this.crashes > RESTARTS) return this.set({ state: 'failed', text: `symcc stopped ${RESTARTS + 1} times. Its log has the reason.` })
      setTimeout(() => this.start(), 1000 * this.crashes)
    })
  }

  private set(s: EngineState) {
    this.state = s
    this.on.state(s)
  }

  private line(line: string) {
    let m: Record<string, unknown>
    try {
      m = JSON.parse(line) as Record<string, unknown>
    } catch {
      return this.on.log(line)
    }
    if (m.event === 'ready') {
      this.crashes = 0
      this.on.ready(m as ReadyEvent)
      this.set({ state: 'ready' })
      for (const q of this.queue.splice(0)) this.child?.stdin?.write(q)
      return
    }
    if (m.event === 'webview') return this.on.webview(m.message, m.surface === 'panel' || m.surface === 'side' ? m.surface : undefined)
    if (m.event === 'editor' && m.action && typeof m.action === 'object') return this.on.editor(m.action as EditorAction)
    const p = typeof m.id === 'number' ? this.pending.get(m.id) : undefined
    if (!p) return
    this.pending.delete(m.id as number)
    if (m.ok) p.resolve(m)
    else p.reject(new Error(typeof m.error === 'string' ? m.error : 'symcc refused it'))
  }

  /** Sends a line that has no answer; while serve starts it waits (the newest few). */
  send(l: ExtensionLine) {
    const text = `${JSON.stringify(l)}\n`
    if (this.child?.stdin && this.state.state === 'ready') return void this.child.stdin.write(text)
    this.queue = [...this.queue, text].slice(-QUEUED)
  }

  /** Sends a request; resolves with serve's answer. */
  request(r: Request): Promise<Record<string, unknown>> {
    const child = this.child
    if (!child?.stdin || this.state.state !== 'ready') return Promise.reject(new Error('symcc is still starting, try again in a moment'))
    const id = this.next++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      child.stdin!.write(`${JSON.stringify({ ...r, id })}\n`)
    })
  }

  /** Stops serve the way it stops itself (its workers are stopped and their tasks go back to "todo"). */
  async stop(): Promise<void> {
    const child = this.child
    this.queue = []
    if (!child) return
    this.stopping = true
    const ended = new Promise<void>(r => child.once('exit', () => r()))
    child.kill('SIGTERM')
    const late = setTimeout(() => child.kill('SIGKILL'), 20_000)
    await ended
    clearTimeout(late)
  }

  async restart() {
    await this.stop()
    this.crashes = 0
    this.start()
  }
}
