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

export type OcContext = {
  /** the folder this copy of the plugin runs for (OpenCode starts one copy per folder a session works in) */
  readonly location: { readonly directory: string; readonly project?: { readonly directory: string } }
  readonly permission: { readonly hook: (name: 'evaluate', fn: (e: OcPermissionEvaluation) => Promise<void> | void) => Promise<OcRegistration> }
  readonly tool: { readonly hook: (name: 'execute.before', fn: (e: OcToolBefore) => Promise<void> | void) => Promise<OcRegistration> }
}

/** What a plugin's server entry exports as its default (`Plugin.define` in @opencode/plugin 2.3.0 only hands it back). */
export type OcServerPlugin = { readonly id: string; readonly setup: (ctx: OcContext) => Promise<(() => Promise<void>) | void> }
