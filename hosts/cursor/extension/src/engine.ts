// The engine process (hosts/cursor/main.ts, built to dist/engine.mjs) for one project: started with the editor's own
// Node (ELECTRON_RUN_AS_NODE) unless a Node is set, spoken to in JSON lines. A crash restarts it, a few times at most.
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { EngineState, PanelLeadEvent, PanelStep, PanelView } from '../../protocol'

export type EngineEvents = {
  state: (s: EngineState) => void
  view: (v: PanelView) => void
  lead: (e: PanelLeadEvent) => void
  toast: (text: string) => void
  open: () => void
  step: (agent: string, step: PanelStep) => void
  log: (line: string) => void
}

/**
 * `args`: what the engine's command line adds (--agents, --lead-model, ...) and `env` what its environment adds, both
 * read at each start: the settings and the proxy can change in between.
 */
export type EngineOptions = { root: string; engine: string; node?: string; args?: () => string[]; env?: () => Record<string, string> }

type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }

/** How many times a crashed engine is started again before the owner has to restart it. */
const RESTARTS = 3

export class Engine {
  private child: ChildProcess | undefined
  private next = 1
  private pending = new Map<number, Pending>()
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
    const args = [this.o.engine, '--root', this.o.root, ...(this.o.args?.() ?? [])]
    const node = this.o.node || process.execPath
    const env = { ...process.env, SYMCC_DEBUG: '1', ...this.o.env?.(), ...(this.o.node ? {} : { ELECTRON_RUN_AS_NODE: '1' }) }
    this.on.log(`starting: ${node} ${args.join(' ')}`)
    const child = spawn(node, args, { cwd: this.o.root, env, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    createInterface({ input: child.stdout! }).on('line', line => this.line(line))
    createInterface({ input: child.stderr! }).on('line', line => this.on.log(line))
    child.on('error', err => this.on.log(`couldn't start the engine: ${err.message}`))
    child.on('exit', (code, signal) => {
      this.child = undefined
      for (const p of this.pending.values()) p.reject(new Error('the engine stopped'))
      this.pending.clear()
      this.on.log(`the engine ended (${signal ?? `exit ${code}`})`)
      if (this.stopping) return this.set({ state: 'stopped' })
      if (++this.crashes > RESTARTS) return this.set({ state: 'failed', text: `The engine stopped ${RESTARTS + 1} times. Its log has the reason.` })
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
    if (typeof m.event === 'string') {
      if (m.event === 'ready') {
        this.crashes = 0
        this.on.log(`ready: symcc ${String(m.version ?? '?')}, protocol ${String(m.protocol ?? '?')}`)
        return this.set({ state: 'ready' })
      }
      if (m.event === 'view') return this.on.view(m.view as PanelView)
      if (m.event === 'lead') return this.on.lead(m as unknown as PanelLeadEvent)
      if (m.event === 'toast' && typeof m.text === 'string') return this.on.toast(m.text)
      if (m.event === 'open') return this.on.open()
      if (m.event === 'step' && typeof m.agent === 'string' && m.step) return this.on.step(m.agent, m.step as PanelStep)
      return
    }
    const p = typeof m.id === 'number' ? this.pending.get(m.id) : undefined
    if (!p) return
    this.pending.delete(m.id as number)
    if (m.ok) p.resolve(m)
    else p.reject(new Error(typeof m.error === 'string' ? m.error : 'the engine refused it'))
  }

  /** Sends request `r` (an op and its fields); resolves with the engine's answer. */
  request(r: Record<string, unknown>): Promise<Record<string, unknown>> {
    const child = this.child
    if (!child?.stdin || this.state.state !== 'ready') return Promise.reject(new Error('symcc is still starting, try again in a moment'))
    const id = this.next++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      child.stdin!.write(`${JSON.stringify({ ...r, id })}\n`)
    })
  }

  /** Sends a request and answers its text. */
  async text(r: Record<string, unknown>): Promise<string> {
    const a = await this.request(r)
    return typeof a.text === 'string' ? a.text : ''
  }

  /** Stops the engine the way it stops itself (its workers are stopped and their tasks go back to "todo"). */
  async stop(): Promise<void> {
    const child = this.child
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
