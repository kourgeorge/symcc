// symcc's lead tools, slash commands and lead guide in GitHub Copilot CLI (T-957), from the same lists the Claude host
// registers (hooks/claude/registration.ts): the lead's tools (TOOLS, hooks/app/tools.ts) as Copilot tools named as the
// host's words say ("symcc_board", skipPermission: they only touch symcc's board), run through symcc's toolCall; the
// slash commands (COMMANDS, hooks/app/symcc.ts) run through runCommand. Nothing is decided here that Claude Code's
// wiring doesn't decide too. symcc's agents (agents.ts, T-959) get their own few tools in their own sessions
// (copilotAgentTools: a worker ask_owner, a scout or checker board and stats), bound to their agent id.
// A call from one of Copilot's own sub-agents (invocation.agentId) is passed on with that id, so toolCall refuses it
// the lead's tools (T-525), as for OpenCode's own subagents.
// A command's answer only for the owner (the text board, the help) is a line in the chat timeline (session.log); any
// other is sent to the lead as a prompt it answers (enqueue), as Claude Code does with a command's text.
// The lead's guide comes with each prompt (onUserPromptSubmitted's additionalContext), read every time, so
// /symcc-disable counts from the next message, as Claude Code's prompt.compose does.
import type { Host, HostAgentKind } from '../host'
import { TOOLS } from '../app/tools'
import { ASK_TOOL_DEF } from '../app/ask'
import { ASK_TOOL } from '../core/ask'
import { SCOUT_BOARD_TOOLS, SCOUT_LIST_TOOL } from '../core/scouts'
import { COMMANDS, runCommand, toolCall, toolCallFailed, leadGuideText, ownerTyped, meanwhileForPrompt, type CommandAnswer } from '../app/symcc'
import { S, useName, toolName } from '../app/state'
import type { CpCommand, CpHooks, CpSession, CpTool } from './sdk'
import { SYMCC_SOURCE } from './lead'

/** The arguments a tool is given, as an object (anything else is none). */
const argsOf = (args: unknown): Record<string, unknown> => (args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {})

/** The lead's tools as Copilot tools: each runs symcc's toolCall; a refusal fails the call with its reason. */
export function copilotTools(host: Host): CpTool[] {
  return TOOLS().map(t => ({
    name: toolName(t.name),
    description: t.description,
    parameters: { ...t.inputSchema },
    skipPermission: true,
    async handler(args, invocation) {
      useName(host)
      const name = toolName(t.name)
      // the lead (the session's own agent) calls with no agent id; Copilot's own sub-agents carry theirs
      const agentId = invocation?.agentId || undefined
      const r = await toolCall(host, name, agentId, argsOf(args)).catch((err: Error) => toolCallFailed(host, name, agentId, { kind: 'error', message: err?.message ?? String(err) }))
      if (!r) return { textResultForLlm: `${S.N.name} has no tool ${name}`, resultType: 'failure' as const, error: `no tool ${name}` }
      if ('deny' in r) return { textResultForLlm: r.deny, resultType: 'failure' as const, error: r.deny }
      return r.result
    },
  }))
}

/** The symcc tools (plain names) an agent of `kind` is offered, as in Claude Code: a worker ask_owner, a checker board and stats, a scout those and scouts. */
export function agentToolNames(kind: HostAgentKind): string[] {
  if (kind === 'worker') return [ASK_TOOL]
  return kind === 'scout' ? [...SCOUT_BOARD_TOOLS, SCOUT_LIST_TOOL] : [...SCOUT_BOARD_TOOLS]
}

/**
 * T-959: the symcc tools of agent session `agentId()` (an agent of `kind`): only those agentToolNames gives. Each runs
 * symcc's toolCall with the agent's id, so a stopped agent is refused, a scout's or checker's call that changes the
 * board is refused, and a worker's question goes on the board as its own; a lead tool is refused anyway (T-525).
 * `agentId` answers undefined until the session's id is known: a call before that is refused.
 */
export function copilotAgentTools(host: Host, kind: HostAgentKind, agentId: () => string | undefined): CpTool[] {
  useName(host)
  const all = [...TOOLS(), ASK_TOOL_DEF()]
  return agentToolNames(kind)
    .flatMap(n => all.filter(t => t.name === n))
    .map(t => ({
      name: toolName(t.name),
      description: t.description,
      parameters: { ...t.inputSchema },
      skipPermission: true,
      async handler(args) {
        useName(host)
        const name = toolName(t.name)
        const id = agentId()
        if (!id) return { textResultForLlm: `${S.N.name} has not started this agent yet`, resultType: 'failure' as const, error: 'not started' }
        const r = await toolCall(host, name, id, argsOf(args)).catch((err: Error) => toolCallFailed(host, name, id, { kind: 'error', message: err?.message ?? String(err) }))
        if (!r) return { textResultForLlm: `${S.N.name} has no tool ${name}`, resultType: 'failure' as const, error: `no tool ${name}` }
        if ('deny' in r) return { textResultForLlm: r.deny, resultType: 'failure' as const, error: r.deny }
        return r.result
      },
    }))
}

/**
 * The commands Copilot registers: COMMANDS for the host's features, plus /<name>-board, which runs /<name> (the board
 * as text) where there is no panel. Without a panel COMMANDS leaves /<name>-board out (OpenCode's terminal part adds its
 * own), but symcc's texts point at it (the /<name>-tasks and /<name>-status answers), so Copilot has it too; and
 * /<name>'s description doesn't send the owner to a panel Copilot doesn't have. `runs`: the command runCommand runs.
 */
export function copilotCommandList(host: Host): { name: string; description: string; runs: string }[] {
  const list = COMMANDS(host.features).map(c => ({ name: c.name, description: c.description, runs: c.name }))
  if (host.features.panel) return list
  const board = `${S.N.name}-board`
  const main = list.find(c => c.name === S.N.name)
  if (main) main.description = `Show the ${S.N.name} board as text in the chat: tasks and scouts`
  // in COMMANDS' place for it: after /<name>-status
  const at = list.findIndex(c => c.name === `${S.N.name}-status`)
  if (!list.some(c => c.name === board)) list.splice(at < 0 ? list.length : at + 1, 0, { name: board, description: `Show the ${S.N.name} board as text in the chat (as /${S.N.name}; there is no board panel here)`, runs: S.N.name })
  return list
}

/**
 * The slash commands: each runs symcc's runCommand with the text after it. An answer for the owner goes to the
 * timeline (session.log); any other is a prompt for the lead (enqueue, told to `sent` so it isn't taken for the owner's).
 */
export function copilotCommands(host: Host, session: () => CpSession | undefined, sent: (prompt: string) => void = () => undefined): CpCommand[] {
  return copilotCommandList(host).map(c => ({
    name: c.name,
    description: c.description,
    async handler(ctx) {
      useName(host)
      const s = session()
      if (!s) return
      const answer: CommandAnswer | null = await runCommand(host, c.runs, (ctx.args ?? '').trim()).catch((err: Error) => ({ text: `${S.N.name}: /${c.name} failed: ${err?.message ?? err}`, isTextDisplayOnly: true as const }))
      if (!answer) return
      if (answer.isTextDisplayOnly) return void (await s.log(answer.text).catch(() => undefined))
      sent(answer.text)
      await s.send({ prompt: answer.text, mode: 'enqueue', source: SYMCC_SOURCE })
    },
  }))
}

/**
 * The session hooks: each prompt gets the lead's guide (none when symcc is off here or the project isn't known), and a
 * prompt that is none of symcc's own sends (`ours`) counts as the owner's typing (ownerTyped). `ended` runs once the
 * session ends.
 */
export function copilotHooks(host: Host, ours: (prompt: string) => boolean, ended: () => Promise<void>): CpHooks {
  return {
    async onUserPromptSubmitted(input) {
      useName(host)
      const owners = !ours(input.prompt)
      if (owners) ownerTyped(input.prompt)
      const guide = await leadGuideText(host).catch(() => undefined)
      // T-968: the owner's board actions waiting as "Meanwhile" lines go with their prompt, once
      const meanwhile = owners && guide ? meanwhileForPrompt().text : ''
      const context = [guide, meanwhile].filter(Boolean).join('\n\n')
      return context ? { additionalContext: context } : {}
    },
    async onSessionEnd() {
      await ended()
    },
  }
}
