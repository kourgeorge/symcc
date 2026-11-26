// symcc's tools and slash commands in OpenCode (T-465), mapped from the same lists the Claude host registers
// (hooks/claude/registration.ts): the lead's tools (TOOLS, hooks/app/tools.ts) and the workers' question tool
// (ASK_TOOL_DEF), each added with ctx.tool.transform as a normal tool (options.codemode false: by default a plugin tool
// is only reachable from inside OpenCode's Code Mode), named as the host's words say ("symcc_board"); and the slash
// commands (COMMANDS, hooks/app/symcc.ts) with ctx.command.transform. A tool call runs symcc's own toolCall, a command
// runCommand: nothing is decided here that Claude Code's wiring doesn't decide too, except that a worker (which in
// Claude Code only has the question tool among symcc's) is refused the lead's tools.
// Each session is offered only what it may call, as in Claude Code: a worker only ask_owner, a scout or a checker only
// board and stats (read-only), the lead every lead tool (not ask_owner); see offeredTools, used by plugin.ts's
// "context" hook, which also gives the lead its guide (leadGuideText).
import type { Host } from '../host'
import { TOOLS } from '../app/tools'
import { ASK_TOOL_DEF } from '../app/ask'
import { COMMANDS, runCommand, toolCall, toolCallFailed, type CommandAnswer } from '../app/symcc'
import { S, onHere, useName, toolName, workers, scoutRuns, checkerRuns } from '../app/state'
import { agentOnBoard } from '../app/workers'
import { ASK_TOOL } from '../core/ask'
import { SCOUT_BOARD_TOOLS, SCOUT_LIST_TOOL } from '../core/scouts'
import { load } from '../app/store'
import type { OcCommandDefinition, OcSessionApi, OcToolInfo } from './ctx'
import { PANEL_MARK } from './board-view'
import { ANSWER_COMMAND, answerCommand } from '../app/answer'

/**
 * Who calls a tool: the lead (the session plugin.ts knows as the owner's chat), a worker, a scout or checker, or any
 * other session ('other': OpenCode's own subagents, the owner's other chats, or an agent of symcc's that the board no
 * longer names, T-525), which gets none of symcc's tools.
 */
export type Caller = 'lead' | 'worker' | 'scout' | 'checker' | 'other'

/** symcc's tools in its plain names, with their JSON schemas: the lead's, then the workers' question tool. */
export function symccTools(): { name: string; description: string; inputSchema: Readonly<Record<string, unknown>> }[] {
  return [...TOOLS(), ASK_TOOL_DEF()]
}

/**
 * Whether a `caller` may call symcc tool `tool` (plain name): a worker only ask_owner, a checker board and stats, a
 * scout those and scouts too (T-895: toolCall lets only its action list through), the lead the rest, any other
 * session none.
 */
export function mayCall(caller: Caller, tool: string): boolean {
  if (caller === 'other') return false
  if (caller === 'worker') return tool === ASK_TOOL
  if (caller === 'checker') return SCOUT_BOARD_TOOLS.includes(tool)
  if (caller === 'scout') return SCOUT_BOARD_TOOLS.includes(tool) || tool === SCOUT_LIST_TOOL
  return tool !== ASK_TOOL
}

/** Why a worker's call of lead tool `tool` is refused (in Claude Code a worker has no such tool at all). */
export const workerToolRefusal = (tool: string) =>
  `Refused: ${toolName(tool)} is only for the ${S.N.name} lead; a worker can only call ${toolName(ASK_TOOL)}. Do your task in your folder, and put anything for the board in your final summary.`

/**
 * Who session `id` is: a worker, scout or checker this copy runs, or one the board names (another copy's, see
 * agentOnBoard), or a session OpenCode made for one of symcc's agents (its metadata `symcc` says the kind, `kind()`);
 * else 'other'. The lead is never found here: the caller checks it first (plugin.ts's lead(), T-525), so a session
 * nothing knows is never taken for it.
 */
export async function callerOf(host: Host, id: string, kind: () => Promise<unknown> = async () => undefined): Promise<Caller> {
  if (workers.has(id)) return 'worker'
  if (scoutRuns.has(id)) return 'scout'
  if (checkerRuns.has(id)) return 'checker'
  const on = await agentOnBoard(host, id).catch(() => undefined)
  if (on?.kind === 'worker') return 'worker'
  if (on?.kind === 'checker') return 'checker'
  const k = await kind().catch(() => undefined)
  if (k === 'worker') return 'worker'
  if (k === 'scout' || k === 'checker') return k
  return 'other'
}

/** The names (the host's, e.g. "symcc_add") of symcc's tools a `caller` may not call, to take out of what its session is offered. */
export function hiddenTools(caller: Caller): string[] {
  return symccTools()
    .filter(t => !mayCall(caller, t.name))
    .map(t => toolName(t.name))
}

/**
 * The tools to add with ctx.tool.transform: every one of symcc's, a normal tool (codemode false), whose execute runs
 * symcc's toolCall with the calling session as the agent (so a stopped agent, a scout's or checker's call of a tool
 * that changes the board, and a worker's question are judged as in Claude Code). A refusal fails the call with its
 * reason. `lead` tells the lead's session (plugin.ts's lead()): its calls run as the lead's (toolCall with no agent
 * id); any other session's go to toolCall with its id, which refuses it the lead's tools (T-525). `kind` tells the
 * kind metadata of a session (see callerOf).
 */
export function opencodeTools(host: Host, lead: () => string | undefined, kind: (sessionID: string) => Promise<unknown> = async () => undefined): OcToolInfo[] {
  return symccTools().map(t => ({
    name: toolName(t.name),
    description: t.description,
    input: t.inputSchema,
    options: { codemode: false },
    async execute(input, context) {
      useName(host)
      const name = toolName(t.name)
      const args = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
      const isLead = !!context.sessionID && context.sessionID === lead()
      if (!isLead && t.name !== ASK_TOOL && (await callerOf(host, context.sessionID, () => kind(context.sessionID))) === 'worker') throw new Error(workerToolRefusal(t.name))
      const agentId = isLead ? undefined : context.sessionID
      const r = await toolCall(host, name, agentId, args).catch((err: Error) => toolCallFailed(host, name, agentId, { kind: 'error', message: err?.message ?? String(err) }))
      if (!r) throw new Error(`${S.N.name} has no tool ${name}`)
      if ('deny' in r) throw new Error(r.deny)
      return { content: r.result }
    },
  }))
}

/** The arguments of a slash command: the text after it (OpenCode may give the command's own "/<name>" in front too). */
export function commandArgs(name: string, text: string): string {
  const t = text.trim()
  const head = `/${name}`
  return (t === head || t.startsWith(`${head} `) ? t.slice(head.length) : t).trim()
}

/** T-888: a typed command's answer for the owner, as the chat message it goes in as: a last line tells the lead it needn't reply. */
export const ownerAnswerText = (command: string, text: string) =>
  `${text}\n\n(${S.N.name}: this is the answer to /${command}, shown for the owner. Lead: no reply needed, do nothing for it.)`

/**
 * The slash commands to add with ctx.command.transform: each runs symcc's runCommand. Its answer goes into the
 * session's chat: one only for the owner (isTextDisplayOnly) as a normal chat message (ownerAnswerText, T-888: the
 * only kind OpenCode's web page shows in full), or as a quiet synthetic note when the board panel sent the command
 * (PANEL_MARK); any other as a prompt the model answers (as Claude Code does with a command's text).
 */
export function opencodeCommands(host: Host, session: Pick<OcSessionApi, 'prompt' | 'synthetic'>): OcCommandDefinition[] {
  return [...COMMANDS(host.features), ANSWER_COMMAND()].map(c => ({
    name: c.name,
    description: c.description,
    async execute(inv) {
      useName(host)
      const run = c.name === ANSWER_COMMAND().name ? answerCommand : runCommand
      const isInit = c.name === `${S.N.name}-init`
      const isEnable = c.name === `${S.N.name}-enable` || isInit
      // T-841: was symcc on in this window before the command? (a board that can't be read counts as on: nothing to open)
      // T-844: /init in a folder with no board counts as off before (S.fresh); where a board is found it opens nothing
      const wasOn = isInit ? !S.fresh : isEnable ? await load(host).then(b => onHere(b), () => true) : true
      // T-888: the board panel's own sends carry PANEL_MARK (board-view.ts); a typed command (TUI or web page) doesn't
      const fromPanel = inv.prompt.text.includes(PANEL_MARK)
      const typed = inv.prompt.text.split(PANEL_MARK).join('')
      const answer: CommandAnswer | null = await run(host, c.name, commandArgs(c.name, typed)).catch((err: Error) => ({ text: `${S.N.name}: /${c.name} failed: ${err?.message ?? err}`, isTextDisplayOnly: true as const }))
      if (!answer) return
      // T-841: /enable really turned symcc on here: this session's window opens the board (the view file carries the mark)
      const nowOn = isEnable && !wasOn && S.root && !S.guardOnly ? await load(host).then(b => onHere(b), () => false) : false
      if (nowOn) await host.ui.panel?.openNow?.(inv.sessionID).catch(() => undefined)
      // T-888: OpenCode shows a synthetic note only as a one-line label (and the web page's compact timeline folds it
      // away), so a typed command's answer for the owner goes in as a normal chat message the web page shows in full.
      // That wakes the lead for a short turn, so the message tells it no reply is needed. Panel presses stay quiet.
      if (answer.isTextDisplayOnly && fromPanel) await session.synthetic({ sessionID: inv.sessionID, text: answer.text, description: `/${c.name}`, delivery: inv.delivery, resume: false })
      else if (answer.isTextDisplayOnly) await session.prompt({ sessionID: inv.sessionID, text: ownerAnswerText(c.name, answer.text), delivery: inv.delivery })
      else await session.prompt({ sessionID: inv.sessionID, text: answer.text, delivery: inv.delivery })
    },
  }))
}

export { ANSWER_COMMAND, answerCommand } from '../app/answer'
