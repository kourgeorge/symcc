// symcc on Cursor as one long-running process per project: the engine with its agents and lead chat on the Cursor SDK
// (./session.ts), or on GitHub Copilot's (--agents copilot, ./copilot.ts), for an editor extension to start and talk
// to. It speaks JSON lines: requests on stdin, answers and events on stdout; debug lines go to stderr (with SYMCC_DEBUG set).
//   node dist/engine.mjs --root <project> [--plugin-root <symcc>] [--agents cursor|copilot] [--worker-model <id>] [--lead-model <id>]
// Requests: {"id":1,"op":"tool","name":"add","input":{...}}   {"id":2,"op":"command","name":"symcc-init","args":""}
//           {"id":3,"op":"message","text":"..."}               {"id":4,"op":"stop"}
//           the board panel's: {"op":"view"}  {"op":"act","task":"T-5","action":"approve","text":"..."}
//           {"op":"answer","need":"T-5","text":"..."}  {"op":"mode","mode":"review"}  {"op":"scout","name":"..."}
// Answers:  {"id":1,"ok":true,"text":"..."}  or  {"id":1,"ok":false,"error":"..."} (op view: "view" instead of "text")
// Events:   {"event":"ready"}  {"event":"lead",...LeadEvent}  {"event":"toast","text":"..."}  {"event":"status","text":"..."}
//           {"event":"view","view":PanelView}  {"event":"open"} (show the board panel)
//           {"event":"step","agent":"cursor-1-...","step":PanelStep} (a step of an agent's turn; the lead's agent is "lead")
//           and {"op":"steps"} answers {"steps":{agent: PanelStep[]}}, the newest steps of each agent
// The lead chat's: {"op":"message","text":"...","images":[{"data":"<base64>","mimeType":"image/png"}]} answers
//           {"said":"..."} when a /command answered the owner itself (nothing went to the lead), else {"said":null};
//           {"op":"slash"} answers {"slash":SlashItem[]}; {"op":"models"} answers {"models":ModelInfo[]};
//           {"op":"lead-set","model":{"id":...,"params":[...]}|null,"mode":"agent"|"plan"} answers {"lead":LeadChoice};
//           {"op":"lead-stop"} ends the lead's running turn; {"op":"summarize"} condenses the lead's chat
// The Worktrees page's: {"op":"worktrees"} answers {"worktrees":PanelWorktree[]}; {"op":"worktree-diff","path":"..."}
//           its changes as diff text; {"op":"worktree-base","path":"...","file":"src/a.ts"} answers {"text","ref"}, the
//           file where it is compared from; {"op":"worktree-remove","path":"..."} removes a finished task's folder
// In a terminal (stdin is a TTY) it is a small chat instead: a line goes to the lead, "/tool <name> [json]" runs one of
// the lead's tools, "/<command> [args]" a slash command (e.g. /symcc-init), and "/quit" ends.
import { basename, dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { openCursorSession, type CursorSession } from './session'
import { cursorSdk } from './sdk'
import { copilotSdk } from './copilot'
import { copilotGuard } from './guard'
import type { LeadChoice, LeadEvent } from './lead'
import type { Sdk, SdkImage, SdkModel } from './sdk'
import type { PanelActionId, PanelMode } from './protocol'

/** The symcc folder this file ships in: hosts/cursor/main.ts, or its bundle in hosts/cursor/dist/. */
const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = resolve(HERE, basename(HERE) === 'dist' ? '../../..' : '../..')

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

/** Whose agents run the lead and the workers: Cursor's when nothing says. */
export function sdkFor(agents: string | undefined): Sdk {
  if (agents === undefined || agents === 'cursor') return cursorSdk()
  if (agents === 'copilot') return copilotSdk({ guard: copilotGuard })
  throw new Error(`--agents is cursor or copilot, not ${agents}`)
}

type Request = { id?: unknown; op?: unknown; name?: unknown; input?: unknown; args?: unknown; text?: unknown; task?: unknown; action?: unknown; need?: unknown; mode?: unknown; model?: unknown; images?: unknown; path?: unknown; file?: unknown; n?: unknown; key?: unknown }

const PANEL_ACTIONS: readonly PanelActionId[] = ['approve', 'reject', 'done', 'keep-note', 'ask-more', 'retry', 'run-now', 'drop', 'pause', 'resume', 'show-changes', 'to-todo', 'merge-now']
const MODES: readonly PanelMode[] = ['paused', 'review', 'auto']
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
  const out = (o: Record<string, unknown>) => void process.stdout.write(`${JSON.stringify(o)}\n`)
  const say = (line: string) => void process.stdout.write(`${line}\n`)
  const debug = process.env.SYMCC_DEBUG ? (line: string) => void process.stderr.write(`[symcc] ${line}\n`) : undefined
  const sdk = sdkFor(opts.agents)
  const s = await openCursorSession({
    root: opts.root ?? process.cwd(),
    sdk,
    pluginRoot: opts['plugin-root'] ?? PLUGIN_ROOT,
    ...(opts['worker-model'] ? { workerModel: opts['worker-model'] } : {}),
    ...(opts['lead-model'] ? { leadModel: opts['lead-model'] } : {}),
    sessionId: `cursor-${process.pid}`,
    onLead: e => (tty ? void (leadLine(e) && say(leadLine(e)!)) : out({ event: 'lead', ...e })),
    onToast: text => (tty ? say(`* ${text}`) : out({ event: 'toast', text })),
    onStatus: text => (tty ? text && say(`[status] ${text}`) : out({ event: 'status', text: text ?? null })),
    onView: view => (tty ? undefined : out({ event: 'view', view })),
    onOpen: () => (tty ? undefined : out({ event: 'open' })),
    onStep: (agent, step) => (tty ? undefined : out({ event: 'step', agent, step })),
    ...(debug ? { log: debug } : {}),
  })
  let stopping: Promise<void> | undefined
  const stop = (why?: string) =>
    void (stopping ??= s
      .close(why)
      .catch(err => void process.stderr.write(`[symcc] close failed: ${(err as Error).message}\n`))
      .finally(() => process.exit(0)))
  process.on('SIGTERM', () => stop('the editor stopped symcc'))
  process.on('SIGINT', () => stop('symcc got Ctrl-C'))

  const lines = createInterface({ input: process.stdin, terminal: false })
  lines.on('close', () => stop('the editor closed symcc'))
  if (!tty) {
    out({ event: 'ready' })
    lines.on('line', line => {
      if (!line.trim()) return
      let r: Request
      try {
        r = JSON.parse(line) as Request
      } catch {
        return out({ ok: false, error: 'not JSON' })
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
