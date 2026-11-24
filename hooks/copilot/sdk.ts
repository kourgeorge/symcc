// The parts of GitHub Copilot CLI's extension SDK (`@microsoft/copilot-sdk/extension`, 2.x, given by Copilot CLI 1.0.114
// at run time: an extension never installs it) that symcc uses, written by hand so hooks/copilot/ type-checks and its
// tests run with no Copilot package (as hooks/opencode/ctx.ts does for OpenCode). Only what is used here is declared:
// add a member when the host needs one more. The names and shapes are the SDK's own (types.d.ts, session.d.ts,
// extension.d.ts); see docs/research/spike-test-a-small-copilot-cli-extension-for-the-4-open-host.md (T-955).

/** What a tool's handler answers: plain text, or the text with how the call went (ToolResultObject). */
export type CpToolResult = string | { textResultForLlm: string; resultType: 'success' | 'failure' | 'rejected' | 'denied' | 'timeout'; error?: string }

/** A tool call as the handler is given it (ToolInvocation); `agentId` is set when one of Copilot's own sub-agents calls it. */
export type CpToolInvocation = { sessionId: string; toolCallId: string; toolName: string; arguments: unknown; agentId?: string }

/** A tool (Tool): its JSON schema in `parameters`; `skipPermission` runs it with no permission prompt. */
export type CpTool = {
  name: string
  description?: string
  parameters?: Record<string, unknown>
  skipPermission?: boolean
  handler: (args: unknown, invocation: CpToolInvocation) => Promise<CpToolResult>
}

/** A slash command run by the owner (CommandContext): `args` is the text after "/<name>". Only the interactive CLI runs them. */
export type CpCommandContext = { sessionId: string; command: string; commandName: string; args: string }

/** A slash command (CommandDefinition), shown as /<name>. */
export type CpCommand = { name: string; description?: string; handler: (ctx: CpCommandContext) => Promise<void> }

/** The owner (or an automation send) gave the session a prompt (UserPromptSubmittedHookInput). */
export type CpPromptInput = { prompt: string; sessionId: string; workingDirectory: string }

/** What the prompt hook may answer: `additionalContext` is added for the model with the prompt. */
export type CpPromptOutput = { additionalContext?: string }

/** The session ended (SessionEndHookInput). */
export type CpSessionEndInput = { reason: 'complete' | 'error' | 'abort' | 'timeout' | 'user_exit'; sessionId: string }

/** The session hooks symcc registers (SessionHooks). */
export type CpHooks = {
  onUserPromptSubmitted?: (input: CpPromptInput, invocation: { sessionId: string }) => Promise<CpPromptOutput | void>
  onSessionEnd?: (input: CpSessionEndInput, invocation: { sessionId: string }) => Promise<void>
}

/** What joinSession is given (JoinSessionOptions, the parts used). */
export type CpJoinOptions = {
  tools?: { definitions?: readonly CpTool[] }
  commands?: readonly CpCommand[]
  hooks?: { handlers?: CpHooks }
}

/**
 * A message into the session (MessageOptions): "enqueue" starts a turn in an idle session (about 1 s later) or waits
 * for a busy one's turn to end; "immediate" is given to a busy session at its next tool boundary.
 */
export type CpSend = { prompt: string; mode?: 'enqueue' | 'immediate'; source?: `automation-${string}` }

/** The joined session (JoinedSession, the parts used). */
export type CpSession = {
  readonly sessionId: string
  /** answers the message's id */
  send: (options: CpSend) => Promise<string>
  /** a line in the chat timeline */
  log: (message: string, options?: { level?: 'info' | 'warning' | 'error'; ephemeral?: boolean }) => Promise<void>
}

/** joinSession from "@microsoft/copilot-sdk/extension". */
export type CpJoinSession = (options: CpJoinOptions) => Promise<CpSession>
