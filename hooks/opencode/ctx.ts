// The parts of an OpenCode 2.3 server plugin's context (`@opencode/plugin`'s Context) that symcc uses, written by
// hand so hooks/opencode/ type-checks and its tests run with no OpenCode package installed (as hosts/node/env.d.ts does
// for Node). Only what is used here is declared: add a member when the plugin needs one more. The names and shapes are
// OpenCode 2.3.0's (see docs/research/opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md).

/** A registered hook; dispose takes it away. */
export type OcRegistration = { readonly dispose: () => Promise<void> }

/** A permission check OpenCode is about to decide ("evaluate"): setting `effect` to "deny" (with a `message`) refuses it. */
export type OcPermissionEvaluation = {
  readonly sessionID: string
  readonly agent?: string
  /** e.g. "edit" (resources: the files, relative to the session's folder or absolute), "shell" (the command split into parts), "read", "external_directory" */
  readonly action: string
  readonly resources: ReadonlyArray<string>
  readonly metadata?: Record<string, unknown>
  effect: 'allow' | 'deny' | 'ask'
  message?: string
}

/** A tool call about to run ("execute.before"): throwing refuses it. */
export type OcToolBefore = {
  tool: string
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly id: string
  input: unknown
}

/** A model, as OpenCode names one: its provider and its id there (e.g. claude-agent / sonnet). */
export type OcModelRef = { readonly providerID: string; readonly id: string }

/** A session, as session.get and session.create answer it (the parts symcc reads). */
export type OcSessionInfo = {
  readonly id: string
  readonly parentID?: string
  /** what session.create was given (symcc's agents carry { symcc: their kind }) */
  readonly metadata?: Readonly<Record<string, unknown>>
  /** set once the session's last run ended */
  readonly outcome?: 'succeeded' | 'failed' | 'interrupted'
  readonly tokens?: { readonly input?: number; readonly output?: number; readonly reasoning?: number; readonly cache?: { readonly read?: number; readonly write?: number } }
  /** US dollars; 0 for subscription and free models */
  readonly cost?: number
  readonly location: { readonly directory: string }
}

/** One message of session.context (the parts symcc reads): an assistant's has text parts, and how it finished. */
export type OcSessionMessage = {
  readonly type: string
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }>
  readonly finish?: string
  readonly error?: unknown
}

/** A prompt a session is about to take ("prompt" session hook). */
export type OcSessionPrompt = { readonly sessionID: string; readonly messageID?: string; readonly delivery?: string }

/** The session API of a plugin's context (ctx.session), as far as symcc uses it. */
export type OcSessionApi = {
  readonly create: (input: {
    parentID?: string
    title?: string
    model?: OcModelRef
    location?: { directory: string }
    metadata?: Record<string, string>
    permissions?: ReadonlyArray<{ action: string; resource: string; effect: 'allow' | 'deny' | 'ask' }>
  }) => Promise<OcSessionInfo>
  readonly get: (input: { sessionID: string }) => Promise<OcSessionInfo>
  readonly move: (input: { sessionID: string; directory: string }) => Promise<void>
  readonly prompt: (input: { sessionID: string; text: string; delivery?: 'queue' | 'steer' }) => Promise<unknown>
  readonly wait: (input: { sessionID: string }) => Promise<void>
  readonly interrupt: (input: { sessionID: string }) => Promise<{ interrupted: boolean }>
  readonly context: (input: { sessionID: string }) => Promise<ReadonlyArray<OcSessionMessage>>
  readonly remove?: (input: { sessionID: string }) => Promise<void>
  /** a message in the session's chat that is not the owner's (resume false: it doesn't wake the model; it reads it on its next turn) */
  readonly synthetic: (input: { sessionID: string; text: string; description?: string; delivery?: 'queue' | 'steer'; resume?: boolean }) => Promise<unknown>
  readonly hook: <N extends keyof OcSessionHooks>(name: N, fn: (e: OcSessionHooks[N]) => Promise<void> | void) => Promise<OcRegistration>
}

/** One part of a request's system prompt (OpenCode's SystemPart). */
export type OcSystemPart = { type: 'text'; text: string; metadata?: Record<string, unknown> }

/** A model request about to be built for a session ("context" session hook): its system prompt and the tools it offers can be changed. */
export type OcSessionContext = {
  readonly sessionID: string
  readonly agent: string
  system: OcSystemPart[]
  /** the tools offered, by the name the model calls them */
  tools: Record<string, { description: string; input: unknown }>
}

/** The session hooks symcc uses, by name. */
export type OcSessionHooks = { prompt: OcSessionPrompt; context: OcSessionContext }

/** What a plugin tool's execute is given besides its input: who calls it. */
export type OcToolContext = { readonly sessionID: string; readonly agent: string; readonly messageID: string; readonly id: string }

/** What a plugin tool's execute answers: the text the model sees (`content`). */
export type OcToolResult = { readonly content?: string; readonly metadata?: Readonly<Record<string, unknown>> }

/**
 * A plugin tool, as ctx.tool.transform's editor adds it. `input` is a JSON schema; `options.codemode: false` makes it
 * a normal tool (by default a plugin tool is only reachable from inside Code Mode's execute). Throwing fails the call
 * with the error's message.
 */
export type OcToolInfo = {
  readonly name: string
  readonly description: string
  readonly input: Readonly<Record<string, unknown>>
  readonly options?: { readonly codemode?: boolean; readonly namespace?: string; readonly permission?: string }
  readonly execute: (input: unknown, context: OcToolContext) => Promise<OcToolResult>
}

/** A slash command being run: the session it was typed in, the text after it, and how it is delivered. */
export type OcCommandInvocation = { readonly sessionID: string; readonly prompt: { readonly text: string }; readonly delivery: 'steer' | 'queue' }

/** A slash command, as ctx.command.transform's editor adds it. */
export type OcCommandDefinition = { readonly name: string; readonly description?: string; readonly execute: (input: OcCommandInvocation) => Promise<void> }

export type OcContext = {
  /** the folder this copy of the plugin runs for (OpenCode starts one copy per folder a session works in) */
  readonly location: { readonly directory: string; readonly project?: { readonly directory: string } }
  readonly permission: { readonly hook: (name: 'evaluate', fn: (e: OcPermissionEvaluation) => Promise<void> | void) => Promise<OcRegistration> }
  readonly tool: {
    readonly hook: (name: 'execute.before', fn: (e: OcToolBefore) => Promise<void> | void) => Promise<OcRegistration>
    /** changes the tools this copy offers (the editor's add puts one in) */
    readonly transform: (fn: (editor: { add: (tool: OcToolInfo) => void }) => void) => Promise<OcRegistration>
  }
  /** changes the slash commands this copy offers */
  readonly command: { readonly transform: (fn: (editor: { add: (command: OcCommandDefinition) => void }) => void) => Promise<OcRegistration> }
  readonly session: OcSessionApi
}

/** What a plugin's server entry exports as its default (`Plugin.define` in @opencode/plugin 2.3.0 only hands it back). */
export type OcServerPlugin = { readonly id: string; readonly setup: (ctx: OcContext) => Promise<(() => Promise<void>) | void> }
