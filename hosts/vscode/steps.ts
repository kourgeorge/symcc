// An agent's steps (what it said, thought and called), shared by the engine, the extension and the board: a list keeps
// the newest STEPS_KEPT, a tool call's end replaces its start, and the whole session reads as a Markdown page.
import type { PanelStep } from './protocol'

/** How many steps of each agent a list keeps, and how long one step's words get (the newest are kept). */
export const STEPS_KEPT = 200
const WORDS_KEPT = 20_000

/** Whether `s` is a piece of what the agent says or thinks (the SDK streams those a few words at a time). */
export const isWords = (s: Pick<PanelStep, 'kind'>) => s.kind === 'text' || s.kind === 'thinking'

/** The argument a tool call is best told by (its path, command or search), else its arguments as short JSON. */
export function argWords(args: unknown): string {
  if (!args || typeof args !== 'object') return typeof args === 'string' ? args : ''
  const a = args as Record<string, unknown>
  for (const k of ['command', 'path', 'target_file', 'file', 'filePath', 'pattern', 'query', 'glob', 'url', 'target_directory']) if (typeof a[k] === 'string' && a[k]) return a[k] as string
  const json = JSON.stringify(a)
  return json === '{}' ? '' : json
}

export const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The agent id the lead's steps go under. */
export const LEAD_AGENT = 'lead'

/** Where an agent's session is saved, under the board's folder `dir`. */
export const sessionPath = (dir: string, agent: string) => `${dir}/sessions/${agent.replace(/[^\w.-]/g, '_')}.jsonl`

/**
 * Adds step `s` to `list` in place: words right after words of the same kind join them (one message, streamed), and
 * a tool call already in it is replaced by its newer state.
 */
function pushStep(list: PanelStep[], s: PanelStep) {
  const last = list[list.length - 1]
  if (isWords(s) && last?.kind === s.kind) {
    const text = last.text + s.text
    list[list.length - 1] = { ...last, text: text.length > WORDS_KEPT ? `…${text.slice(-WORDS_KEPT)}` : text }
    return
  }
  if (s.kind === 'tool' && s.callId)
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i]!.kind === 'tool' && list[i]!.callId === s.callId) return void (list[i] = { ...s, atMs: list[i]!.atMs })
  list.push(s)
}

/** `list` with step `s` added (see pushStep), the newest STEPS_KEPT kept. */
export function addStep(list: readonly PanelStep[], s: PanelStep): PanelStep[] {
  const out = [...list]
  pushStep(out, s)
  return out.length > STEPS_KEPT ? out.slice(-STEPS_KEPT) : out
}

/** A session file's lines (one step per line, as JSON) as steps, all of them; lines that aren't steps are skipped. */
export function readSteps(text: string): PanelStep[] {
  const out: PanelStep[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const s = JSON.parse(line) as PanelStep
      if (typeof s.kind === 'string' && typeof s.text === 'string') pushStep(out, s)
    } catch {
      // a line cut short by a crash
    }
  }
  return out
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** A whole session as a Markdown page, `title` on top. */
export function sessionMarkdown(title: string, steps: readonly PanelStep[]): string {
  const lines = [`# ${title}`, '']
  if (!steps.length) lines.push('No steps were saved for this agent.')
  for (const s of steps) {
    const at = `\`${clock(s.atMs)}\``
    if (s.kind === 'text') lines.push(`${at} **said**`, '', s.text, '')
    else if (s.kind === 'thinking') lines.push(`${at} *thought*`, '', ...s.text.split('\n').map(l => `> ${l}`), '')
    else if (s.kind === 'tool') lines.push(`${at} **${s.tool}**${s.status === 'error' ? ' (failed)' : s.status === 'running' ? ' (still running)' : ''}`, '', '```', s.text || '(no arguments)', '```', '')
    else lines.push(`${at} *${s.text}*`, '')
  }
  return lines.join('\n')
}

/** The steps since the newest turn started (its "running" status), none from before `sinceMs` when given. */
export function turnSteps(steps: readonly PanelStep[], sinceMs = 0): PanelStep[] {
  let at = steps.length - 1
  while (at >= 0 && !(steps[at]!.kind === 'status' && steps[at]!.text === 'running') && steps[at]!.atMs >= sinceMs) at--
  return steps.slice(at + 1)
}
