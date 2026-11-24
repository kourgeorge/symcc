// The `copilot -p` agent runner (T-961): a fallback for GitHub Copilot CLI when the SDK child sessions
// (hooks/copilot/agents.ts) can't be used. Each worker, scout or checker is one `copilot -p <prompt> --output-format json`
// process in its folder (-C), like claudeRunner (./claude-runner.ts) for `claude -p`. No Copilot import: it only builds
// a command line and reads text.
//
// What Copilot CLI 1.0.114 gives (tried by hand for T-961, see docs/research/spike-test-a-small-copilot-cli-extension-for-the-4-open-host.md):
// - stdout: JSONL session events ({type, data, ...}); the answer is the last "assistant.message" with text in
//   data.content, a failure is a "session.error" (data.message), and the last line is {type: "result", sessionId,
//   exitCode, usage: {premiumRequests, ...}}. The token counts are not in the stream ("assistant.usage" is left out),
//   so the run writes them to --usage-output-file: {modelMetrics: {<model>: {usage: {inputTokens, outputTokens,
//   cacheReadTokens, cacheWriteTokens}}}} (also summed in tokenDetails.<input|output|cache_read|cache_write>.tokenCount).
// - Tool limits: --available-tools / --excluded-tools decide which tools the model sees at all; --allow-tool rules
//   ('shell', 'write(<path>)') let a tool run without asking (-p can't ask, so anything else is refused); --deny-tool
//   rules ('shell(git commit)') win over every allow, even --allow-all-tools.
// - The plugin's extension, and its onPreToolUse guard, also load in -p mode. `guarded` says symcc's guard runs in
//   the agent's process: then --allow-all-tools (the guard decides; the deny rules still win), else symcc's own allow
//   rules and --no-experimental (extensions are experimental in 1.0.114, so no symcc extension starts in the agent's
//   process and takes it for a lead).
import type { HostAgentStart } from '../host'
import { cleanTokens, addTokens } from '../core/runs'
import { SCRATCH_DIR } from '../core/path-guard'
import { AGENT_BUILTIN_TOOLS, AGENT_EXCLUDED_TOOLS, WEB_TOOLS, copilotModel, parseModels, MODELS_ENV } from '../copilot/agents'
import type { SymccTokens } from '../../types'
import type { AgentRunner, ProcessOutput, RunnerEnd } from './agents'
import type { ProcessSystem } from './system'
import { GIT_DENIED_SUBCOMMANDS, scratchInUse } from './claude-runner'

/** Copilot's built-in tools that change files (a scout gets none of them). */
const EDIT_TOOLS = ['edit', 'create', 'str_replace_editor', 'str_replace', 'apply_patch']

/** Whether agent `a` may use the web: a scout or checker always, a worker when its role says `tools: web`. */
const webAllowed = (a: Pick<HostAgentStart, 'kind' | 'tools'>) => a.kind !== 'worker' || a.tools?.includes('web') === true

/** The tools agent `a` is offered (--available-tools): a worker or checker the built-ins symcc's guard knows, a scout no edit tools; the web ones when allowed. */
export function copilotAvailableTools(a: Pick<HostAgentStart, 'kind' | 'tools'>): string[] {
  const base = a.kind === 'scout' ? AGENT_BUILTIN_TOOLS.filter(t => !EDIT_TOOLS.includes(t)) : [...AGENT_BUILTIN_TOOLS]
  return [...base, ...(webAllowed(a) ? WEB_TOOLS : [])]
}

/** The tools left out (--excluded-tools): Copilot's own sub-agents, its question form, typing into a shell, and the web ones when not allowed. */
export const copilotExcludedTools = (a: Pick<HostAgentStart, 'kind' | 'tools'>): string[] => [...AGENT_EXCLUDED_TOOLS, ...(webAllowed(a) ? [] : WEB_TOOLS)]

/** The --deny-tool rules every agent gets: each git subcommand that writes (symcc commits and merges itself). */
export const copilotDeniedRules = (): string[] => GIT_DENIED_SUBCOMMANDS.map(c => `shell(git ${c})`)

/**
 * The `write(<path>)` rule that lets the agent change `file` (relative to folder `cwd`; a folder ends with "/" or is
 * "."). The path is made absolute: Copilot matches a relative one by its trailing parts, in any folder.
 */
export function copilotWriteRule(cwd: string, file: string): string[] {
  const dir = cwd.replace(/\/+$/, '')
  const f = file.replace(/^\.\//, '').replace(/^\/+/, '')
  if (f === '' || f === '.') return [`write(${dir}/**)`]
  if (f.endsWith('/')) return [`write(${dir}/${f}**)`]
  // a plain name may also be a folder (e.g. "docs"): its contents are allowed too
  return [`write(${dir}/${f})`, `write(${dir}/${f}/**)`]
}

/**
 * Copilot's --allow-tool rules for agent `a` when symcc's guard does not run in its process: every agent may run
 * shell commands (no git writes, see copilotDeniedRules; the merge-time scope check stays the backstop); a worker may
 * change its task's files only (a.files; none given: anywhere in its folder); with `scratch`, a worker and a checker
 * may also write in SCRATCH_DIR (a checker only there). A scout writes nothing.
 */
export function copilotAllowRules(a: Pick<HostAgentStart, 'kind' | 'files' | 'cwd'>, scratch = false): string[] {
  const cwd = a.cwd ?? '.'
  const scratchRules = scratch && a.kind !== 'scout' ? copilotWriteRule(cwd, `${SCRATCH_DIR}/`) : []
  if (a.kind !== 'worker') return ['shell', ...scratchRules]
  const writes = a.files?.length ? a.files.flatMap(f => copilotWriteRule(cwd, f)) : copilotWriteRule(cwd, '.')
  return ['shell', ...writes, ...scratchRules]
}

/** One line of `copilot -p --output-format json`, as far as the runner reads it. */
type CopilotLine = { type?: string; sessionId?: string; exitCode?: number; data?: { content?: unknown; message?: unknown; sessionId?: unknown } }

/** The JSON lines of a run's stdout (broken lines are skipped). */
function linesOf(stdout: string): CopilotLine[] {
  const out: CopilotLine[] = []
  for (const l of stdout.split('\n')) {
    const t = l.trim()
    if (!t.startsWith('{')) continue
    try {
      out.push(JSON.parse(t) as CopilotLine)
    } catch {
      // a broken line: skipped
    }
  }
  return out
}

/** The session a run's output names: its "result" line's sessionId, else its "session.start" event's. */
export function copilotSession(out: Pick<ProcessOutput, 'stdout'>): string | undefined {
  let id: string | undefined
  for (const j of linesOf(out.stdout)) {
    if (j.type === 'result' && typeof j.sessionId === 'string' && j.sessionId) id = j.sessionId
    else if (j.type === 'session.start' && typeof j.data?.sessionId === 'string' && j.data.sessionId && !id) id = j.data.sessionId
  }
  return id
}

/** The tokens in a --usage-output-file's text: each model's usage added up (or the totals in tokenDetails); none when it can't be read. */
export function copilotUsageTokens(text: string | null | undefined): SymccTokens | undefined {
  if (!text) return undefined
  let j: { modelMetrics?: Record<string, { usage?: Record<string, unknown> }>; tokenDetails?: Record<string, { tokenCount?: unknown }> }
  try {
    j = JSON.parse(text) as typeof j
  } catch {
    return undefined
  }
  if (!j || typeof j !== 'object') return undefined
  const models = j.modelMetrics && typeof j.modelMetrics === 'object' ? Object.values(j.modelMetrics) : []
  let sum: SymccTokens | undefined
  for (const m of models) {
    const u = m?.usage
    const t = cleanTokens({ input: u?.inputTokens, output: u?.outputTokens, cache_read: u?.cacheReadTokens, cache_write: u?.cacheWriteTokens })
    if (t) sum = addTokens(sum, t)
  }
  if (sum && Object.keys(sum).length) return sum
  const d = j.tokenDetails
  return cleanTokens({ input: d?.input?.tokenCount, output: d?.output?.tokenCount, cache_read: d?.cache_read?.tokenCount, cache_write: d?.cache_write?.tokenCount })
}

/**
 * How a `copilot -p` run ended, from its JSONL events: the answer is the last assistant message with text; it failed
 * when the "result" line's exitCode is not 0, a session.error came, or there is no "result" line (then the answer is
 * the error, or the end of stderr). `usage` is the run's --usage-output-file text, for the tokens.
 */
export function copilotResult(out: ProcessOutput, usage?: string | null): RunnerEnd {
  const lines = linesOf(out.stdout)
  let answer = ''
  let error = ''
  let result: CopilotLine | undefined
  for (const j of lines) {
    if (j.type === 'assistant.message' && typeof j.data?.content === 'string' && j.data.content.trim()) answer = j.data.content.trim()
    else if (j.type === 'session.error') error = typeof j.data?.message === 'string' && j.data.message ? j.data.message : 'session error'
    else if (j.type === 'result') result = j
  }
  const tokens = copilotUsageTokens(usage)
  if (out.killed) return { answer, end: { reason: 'aborted' }, isAborted: true, tokens }
  if (!result) {
    const why = error || out.stderr.trim().slice(-2000) || answer || `copilot exited with code ${out.exitCode} and no result`
    return { answer: why, end: { reason: 'error' }, isAborted: false, tokens }
  }
  const failed = (typeof result.exitCode === 'number' && result.exitCode !== 0) || out.exitCode !== 0 || !!error
  // a session error says why the run failed better than the last message did
  return { answer: error || answer || (failed ? (out.stderr.trim().slice(-2000) || `copilot exited with code ${result.exitCode ?? out.exitCode}`) : ''), end: { reason: failed ? 'error' : 'answer' }, isAborted: false, tokens }
}

/** A new session id (a UUID, version 4), so the run's usage file can be named before it starts. */
function newSessionId(rand: () => number): string {
  const h = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16))
  h[12] = '4'
  h[16] = ((parseInt(h[16] ?? '0', 16) & 3) | 8).toString(16)
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/** What a follow-up turn (the debrief, T-656) may use: reading only; no shell, no edits, no web. */
export const COPILOT_FOLLOW_UP_TOOLS = ['view', 'grep', 'rg', 'glob']

/**
 * Options of copilotRunner: the copilot binary (default `copilot`, or SYMCC_COPILOT), a model for agents that name
 * none, symcc's model names to Copilot ids (on top of SYMCC_COPILOT_MODELS), whether symcc's guard runs in the agent's
 * process (`guarded`, see the top), the folder for the usage files (default TMPDIR or /tmp), and the random numbers
 * for the session ids (tests).
 */
export type CopilotRunnerOptions = { bin?: string; model?: string; models?: Record<string, string>; guarded?: boolean; usageDir?: string; random?: () => number }

/**
 * Agents as `copilot -p` processes: the prompt as -p's text, JSONL events out, --no-ask-user, the folder as -C, the
 * model, the tool limits, and the usage written to a file named by the session id (--session-id), read and removed
 * once the run ended. A finished agent can be given one more turn with --resume <session> (followUp), which may only read.
 */
export function copilotRunner(sys: Pick<ProcessSystem, 'run' | 'env'>, o: CopilotRunnerOptions = {}): AgentRunner {
  const bin = () => o.bin ?? sys.env('SYMCC_COPILOT') ?? 'copilot'
  const dir = () => (o.usageDir ?? sys.env('TMPDIR') ?? '/tmp').replace(/\/+$/, '') || '/tmp'
  const usageFile = (session: string) => `${dir()}/symcc-copilot-usage-${session}.json`
  const model = (a: HostAgentStart) => copilotModel(a.model ?? o.model, { ...parseModels(sys.env(MODELS_ENV)), ...o.models })
  const common = (a: HostAgentStart, session: string) => {
    const m = model(a)
    return ['--output-format', 'json', '--no-ask-user', '--no-auto-update', '--trust-folder', ...(a.cwd ? ['-C', a.cwd] : []), ...(m ? ['--model', m] : []), '--usage-output-file', usageFile(session)]
  }
  /** Reads the usage file of the run's session (and removes it); null when there is none. */
  const readUsage = (out: ProcessOutput): string | null => {
    const s = copilotSession(out)
    if (!s || !/^[\w-]+$/.test(s)) return null
    const f = usageFile(s)
    const r = sys.run(['cat', f], undefined)
    sys.run(['rm', '-f', f], undefined)
    return r.status === 0 && r.stdout.trim() ? r.stdout : null
  }
  return {
    name: 'copilot',
    command(a) {
      const session = newSessionId(o.random ?? Math.random)
      const scratch = a.kind !== 'scout' && scratchInUse(sys, a.cwd)
      const allow = o.guarded ? ['--experimental', '--allow-all-tools'] : ['--no-experimental', ...copilotAllowRules(a, scratch).flatMap(r => ['--allow-tool', r])]
      const argv = [
        bin(), '-p', a.prompt, '--session-id', session, ...common(a, session),
        '--available-tools', ...copilotAvailableTools(a),
        '--excluded-tools', ...copilotExcludedTools(a),
        ...allow,
        ...copilotDeniedRules().flatMap(r => ['--deny-tool', r]),
      ]
      return { argv }
    },
    result: out => copilotResult(out, readUsage(out)),
    session: copilotSession,
    followUp(session, text, a) {
      const argv = [bin(), '-p', text, '--resume', session, ...common(a, session), '--available-tools', ...COPILOT_FOLLOW_UP_TOOLS, ...(o.guarded ? ['--experimental'] : ['--no-experimental'])]
      return { argv }
    },
  }
}
