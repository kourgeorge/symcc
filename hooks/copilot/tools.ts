// symcc's lead tools, slash commands and lead guide in GitHub Copilot CLI (T-957), from the same lists the Claude host
// registers (hooks/claude/registration.ts): the lead's tools (TOOLS, hooks/app/tools.ts) as Copilot tools named as the
// host's words say ("symcc_board", skipPermission: they only touch symcc's board), run through symcc's toolCall; the
// slash commands (COMMANDS, hooks/app/symcc.ts) run through runCommand. Nothing is decided here that Claude Code's
// wiring doesn't decide too. The workers' question tool (ask_owner) comes with the agents, in a later task.
// A call from one of Copilot's own sub-agents (invocation.agentId) is passed on with that id, so toolCall refuses it
// the lead's tools (T-525), as for OpenCode's own subagents.
// A command's answer only for the owner (the text board, the help) is a line in the chat timeline (session.log); any
// other is sent to the lead as a prompt it answers (enqueue), as Claude Code does with a command's text.
// The lead's guide comes with each prompt (onUserPromptSubmitted's additionalContext), read every time, so
// /symcc-disable counts from the next message, as Claude Code's prompt.compose does.
import type { Host } from '../host'
import { TOOLS } from '../app/tools'
import { COMMANDS, runCommand, toolCall, toolCallFailed, leadGuideText, ownerTyped, type CommandAnswer } from '../app/symcc'
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

/**
 * The slash commands: each runs symcc's runCommand with the text after it. An answer for the owner goes to the
 * timeline (session.log); any other is a prompt for the lead (enqueue, told to `sent` so it isn't taken for the owner's).
 */
export function copilotCommands(host: Host, session: () => CpSession | undefined, sent: (prompt: string) => void = () => undefined): CpCommand[] {
  return COMMANDS(host.features).map(c => ({
    name: c.name,
    description: c.description,
    async handler(ctx) {
      useName(host)
      const s = session()
      if (!s) return
      const answer: CommandAnswer | null = await runCommand(host, c.name, (ctx.args ?? '').trim()).catch((err: Error) => ({ text: `${S.N.name}: /${c.name} failed: ${err?.message ?? err}`, isTextDisplayOnly: true as const }))
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
      if (!ours(input.prompt)) ownerTyped(input.prompt)
      const guide = await leadGuideText(host).catch(() => undefined)
      return guide ? { additionalContext: guide } : {}
    },
    async onSessionEnd() {
      await ended()
    },
  }
}
