// serve: symcc for an editor, one long-running process per project. The engine with its agents and lead chat on the
// Cursor SDK (./session.ts), or on GitHub Copilot's (--agents copilot, ./copilot.ts), and the board's serve side
// (./board.ts). It speaks JSON lines with the editor extension that starts it: what the extension may rely on is
// ./contract.ts (the command line, the ready line, the webview messages it passes on unread, the editor actions).
// Built to editor/serve.mjs by scripts/build-editor.sh.
// For tests and debugging it also answers these (not part of the contract):
//   {"id":1,"op":"tool","name":"add","input":{...}}  {"id":2,"op":"message","text":"..."}  {"id":3,"op":"view"}
//   {"id":4,"op":"steps"}  {"id":5,"op":"act","task":"T-5","action":"approve"}  {"op":"answer"|"mode"|"scout"|"forget",...}
//   {"op":"slash"|"models"|"worktrees"|"lead-set"|"lead-stop"|"summarize"|"worktree-diff"|"worktree-remove",...}
// In a terminal (stdin is a TTY) it is a small chat instead: a line goes to the lead, "/tool <name> [json]" runs one of
// the lead's tools, "/<command> [args]" a slash command (e.g. /symcc-init), and "/quit" ends.
import { basename, dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { openCursorSession, type CursorSession } from './session'
import { cursorSdk } from './sdk'
import { copilotSdk } from './copilot'
import { copilotGuard } from './guard'
import { MODES, PANEL_ACTIONS, openBoard } from './board'
import type { LeadChoice, LeadEvent } from './lead'
import type { Sdk, SdkImage, SdkModel } from './sdk'
import { PROTOCOL, type EditorAction, type ReadyEvent, type ServeLine, type Surface } from './contract'
import type { AgentChoice, FromWebview, PanelActionId, PanelMode, ToWebview } from './protocol'
import { manifestVersion } from '../../hooks/host'
import { nodeFs } from '../node/host'

/** The symcc folder this file ships in: hosts/cursor/main.ts, its bundle in hosts/cursor/dist/, or editor/serve.mjs. */
const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = resolve(HERE, basename(HERE) === 'editor' ? '..' : basename(HERE) === 'dist' ? '../../..' : '../..')

/** `--name value` options; a bare option with no value after it is refused. */
export function parseOptions(argv: readonly string[]): Record<string, string> {
  const opts: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) throw new Error(`unexpected word: ${a}`)
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value after it`)
    opts[a.slice(2)] = v
    i++
  }
  return opts
}

/** Whose agents serve can run the lead and the workers on; the first when nothing says. */
export const AGENT_CHOICES: readonly AgentChoice[] = [
  { id: 'cursor', name: 'Cursor' },
  { id: 'copilot', name: 'GitHub Copilot' },
]

/** Whose agents run the lead and the workers: Cursor's when nothing says. */
export function sdkFor(agents: string | undefined): Sdk {
  if (agents === undefined || agents === 'cursor') return cursorSdk()
  if (agents === 'copilot') return copilotSdk({ guard: copilotGuard })
  throw new Error(`--agents is one of ${AGENT_CHOICES.map(c => c.id).join(', ')}, not ${agents}`)
}

type Request = { id?: unknown; op?: unknown; name?: unknown; input?: unknown; args?: unknown; text?: unknown; task?: unknown; action?: unknown; need?: unknown; mode?: unknown; model?: unknown; images?: unknown; path?: unknown; file?: unknown; n?: unknown; key?: unknown; surface?: unknown; message?: unknown; ok?: unknown }

const word = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${what} is missing`)
  return v.trim()
}

/** Runs one request; answers its text. */
async function handle(s: CursorSession, r: Request, stop: () => void): Promise<string> {
  switch (r.op) {
    case 'act': {
      const action = word(r.action, 'action') as PanelActionId
      if (!PANEL_ACTIONS.includes(action)) throw new Error(`unknown action: ${action}`)
      return s.act(word(r.task, 'task'), action, typeof r.text === 'string' ? r.text : '')
    }
    case 'answer':
      return s.answer(word(r.need, 'need'), word(r.text, 'text'))
    case 'mode': {
      const mode = word(r.mode, 'mode') as PanelMode
      if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`)
      return s.mode(mode)
    }
    case 'scout':
      return s.runScout(word(r.name, 'name'))
    case 'forget': {
      if (typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n < 1) throw new Error('forget needs a note number')
      return s.forget(r.n, word(r.key, 'key'))
    }
    case 'tool':
      if (typeof r.name !== 'string') throw new Error('tool needs a name')
      return s.tool(r.name, r.input && typeof r.input === 'object' ? (r.input as Record<string, unknown>) : {})
    case 'command':
      if (typeof r.name !== 'string') throw new Error('command needs a name')
      return s.command(r.name, typeof r.args === 'string' ? r.args : '')
    case 'lead-stop':
      await s.lead.stop()
      return 'stopped'
    case 'summarize':
      return (await s.lead.summarize()) ?? 'summarizing'
    case 'worktree-diff':
      return s.worktrees.diff(word(r.path, 'path'))
    case 'worktree-remove':
      return s.worktrees.remove(word(r.path, 'path'))
    case 'stop':
      stop()
      return 'stopping'
    default:
      throw new Error(`unknown op: ${String(r.op)}`)
  }
}

/** The pictures of a message request (base64 data with its type); anything else in the list is left out. */
const imagesOf = (v: unknown): SdkImage[] =>
  Array.isArray(v) ? v.filter((i): i is SdkImage => !!i && typeof i.data === 'string' && typeof i.mimeType === 'string' && i.mimeType.startsWith('image/')) : []

/** The lead's model and mode in a lead-set request: a model is an id with its options; null goes back to the chat's own. */
function choiceOf(r: Request): Partial<LeadChoice> {
  const c: Partial<LeadChoice> = {}
  if (r.mode === 'agent' || r.mode === 'plan') c.mode = r.mode
  if (r.model === null) c.model = undefined
  else if (r.model && typeof r.model === 'object' && typeof (r.model as SdkModel).id === 'string') {
    const m = r.model as SdkModel
    c.model = { id: m.id, ...(Array.isArray(m.params) ? { params: m.params.filter(p => typeof p?.id === 'string' && typeof p?.value === 'string') } : {}), ...(m.maxMode ? { maxMode: true } : {}) }
  }
  return c
}

/** A lead event as a terminal line. */
function leadLine(e: LeadEvent): string | undefined {
  if (e.type === 'answer') return `\nlead> ${e.text}\n`
  if (e.type === 'error') return `\n[lead error] ${e.text}\n`
  if (e.type === 'stopped') return '\n[lead stopped]\n'
  if (e.type === 'summarized') return `\n[lead summarized] ${e.text}\n`
  if (e.type === 'message' && e.from === 'symcc') return `\n[symcc -> lead] ${e.text.length > 400 ? `${e.text.slice(0, 400)}...` : e.text}`
  return undefined
}

async function main() {
  const opts = parseOptions(process.argv.slice(2))
  const tty = process.stdin.isTTY === true
  const out = (o: ServeLine | Record<string, unknown>) => void process.stdout.write(`${JSON.stringify(o)}\n`)
  const say = (line: string) => void process.stdout.write(`${line}\n`)
  const debug = process.env.SYMCC_DEBUG ? (line: string) => void process.stderr.write(`[symcc] ${line}\n`) : undefined
  const sdk = sdkFor(opts.agents)
  const root = opts.root ?? process.cwd()
  const pluginRoot = opts['plugin-root'] ?? PLUGIN_ROOT
  const ready: ReadyEvent = { event: 'ready', version: await manifestVersion(nodeFs, pluginRoot), protocol: PROTOCOL }
  const env = process.env
  let session: CursorSession | undefined
  const board = openBoard({
    session: () => {
      if (!session) throw new Error('symcc is still starting')
      return session
    },
    root,
    agents: opts.agents ?? AGENT_CHOICES[0]!.id,
    choices: AGENT_CHOICES,
    proxy: env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || '',
    ...(opts['state-dir'] ? { stateDir: opts['state-dir'] } : {}),
    toWebview: (message: ToWebview, surface?: Surface) => out({ event: 'webview', message, ...(surface ? { surface } : {}) }),
    editor: (action: EditorAction) => out({ event: 'editor', action }),
    ...(debug ? { log: debug } : {}),
  })
  const s = (session = await openCursorSession({
    root,
    sdk,
    pluginRoot,
    ...(opts['worker-model'] ? { workerModel: opts['worker-model'] } : {}),
    ...(opts['lead-model'] ? { leadModel: opts['lead-model'] } : {}),
    sessionId: `cursor-${process.pid}`,
    onLead: e => (tty ? void (leadLine(e) && say(leadLine(e)!)) : board.onLead(e)),
    onToast: text => (tty ? say(`* ${text}`) : board.onToast(text)),
    onStatus: text => (tty ? text && say(`[status] ${text}`) : undefined),
    onView: view => (tty ? undefined : board.onView(view)),
    onOpen: () => (tty ? undefined : board.onOpen()),
    onStep: (agent, step) => (tty ? undefined : board.onStep(agent, step)),
    ...(debug ? { log: debug } : {}),
  }))
  let stopping: Promise<void> | undefined
  const stop = (why?: string) =>
    void (stopping ??= s
      .close(why)
      .catch(err => void process.stderr.write(`[symcc] close failed: ${(err as Error).message}\n`))
      .finally(() => process.exit(0)))
  process.on('SIGTERM', () => stop('the editor stopped symcc'))
  process.on('SIGINT', () => stop('symcc got Ctrl-C'))
  // an editor that went away no longer reads stdout
  process.stdout.on('error', () => stop('the editor closed symcc'))

  const lines = createInterface({ input: process.stdin, terminal: false })
  lines.on('close', () => stop('the editor closed symcc'))
  if (!tty) {
    out(ready)
    void board.start().catch(err => debug?.(`the board didn't start: ${(err as Error).message}`))
    lines.on('line', line => {
      if (!line.trim()) return
      let r: Request
      try {
        r = JSON.parse(line) as Request
      } catch {
        return out({ ok: false, error: 'not JSON' })
      }
      if (r.op === 'webview') {
        if ((r.surface !== 'panel' && r.surface !== 'side') || !r.message || typeof r.message !== 'object') return
        return void board.fromWebview(r.message as FromWebview, r.surface).catch(err => debug?.(`a webview message failed: ${(err as Error).message}`))
      }
      if (r.op === 'confirmed') return typeof r.id === 'number' && board.confirmed(r.id, r.ok === true)
      if (r.op === 'say') {
        if (typeof r.text !== 'string' || !r.text.trim()) return
        return void board.say(r.text).catch(err => out({ event: 'editor', action: { do: 'notify', level: 'warning', text: (err as Error).message } }))
      }
      if (r.op === 'view') return out({ id: r.id ?? null, ok: true, view: s.view() })
      if (r.op === 'steps') return out({ id: r.id ?? null, ok: true, steps: s.steps() })
      const answer = (p: Promise<Record<string, unknown>>) => void p.then(a => out({ id: r.id ?? null, ok: true, ...a })).catch(err => out({ id: r.id ?? null, ok: false, error: (err as Error).message }))
      if (r.op === 'message') {
        if (typeof r.text !== 'string' || !r.text.trim()) return out({ id: r.id ?? null, ok: false, error: 'message needs text' })
        return answer(s.message(r.text, imagesOf(r.images)).then(m => ({ text: m.said ?? 'sent', said: m.said ?? null })))
      }
      if (r.op === 'slash') return answer(s.slash().then(slash => ({ slash })))
      if (r.op === 'models') return answer(s.models().then(models => ({ models })))
      if (r.op === 'worktrees') return answer(s.worktrees.list().then(worktrees => ({ worktrees })))
      if (r.op === 'worktree-base') return answer(Promise.resolve().then(() => s.worktrees.base(word(r.path, 'path'), word(r.file, 'file'))))
      if (r.op === 'lead-set') return answer(Promise.resolve({ lead: s.lead.configure(choiceOf(r)) }))
      handle(s, r, () => stop())
        .then(text => out({ id: r.id ?? null, ok: true, text }))
        .catch(err => out({ id: r.id ?? null, ok: false, error: (err as Error).message }))
    })
    return
  }
  say(`symcc on ${sdk.name}, project ${opts.root ?? process.cwd()}. Type to the lead; /tool <name> [json], /<command> [args], /quit.`)
  lines.on('line', line => {
    const t = line.trim()
    if (!t) return
    const run = async (): Promise<string | undefined> => {
      if (t === '/quit') return void stop()
      const tool = /^\/tool\s+(\S+)\s*(.*)$/.exec(t)
      if (tool) return s.tool(tool[1]!, tool[2] ? (JSON.parse(tool[2]) as Record<string, unknown>) : {})
      const cmd = /^\/(\S+)\s*(.*)$/.exec(t)
      if (cmd) return s.command(cmd[1]!, cmd[2] ?? '')
      return (await s.message(t)).said
    }
    run()
      .then(text => text && say(text))
      .catch(err => say(`error: ${(err as Error).message}`))
  })
}

main().catch(err => {
  process.stderr.write(`symcc: ${(err as Error).stack ?? err}\n`)
  process.exit(1)
})
