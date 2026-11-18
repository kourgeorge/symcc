// Claude Code's side of the Host (hooks/host.ts): claudeHost makes a Host from one hook's `$`, mapping symcc's words
// to Claude Code's: `run` is $.process.run, `env` is $.env.get, symcc's workers, scouts and checkers are background
// subagents of the agent types claude/registration.ts registers ("<name>:worker", "<name>:worker-web", ...,
// "<name>:scout"), listed by $.agent.list() and told to stop with $.session.send. The lead is the main chat, sent a
// prompt with $.prompt.submit, and its usage is read from Claude Code's session logs (claude/lead-usage.ts);
// `ui.refresh` is $.ui.invalidate('ui.render'), `ui.panel` carries the board panel's values, which only Claude Code's
// `$` holds (claude/panel.ts), `words` gives symcc's tools their "mcp__<name>__<tool>" names, and `features` are all on.
import type { EngineInterface } from 'claude-code'
import { type Host, type HostAgentStart, type HostWords, ALL_FEATURES } from '../host'
import { S } from '../app/state'
import { claudeNames, workerTypeFor } from './agent-types'
import { hostAgent, isNotReady, scoutNotReady } from './agents'
import { leadUsage } from './lead-usage'
import { panelValues } from './panel'

/** The Host register.tsx hands the logic (the board panel's values are its ui.panel). */
export type ClaudeHost = Host

/** The Claude Code agent type an agent of this kind is started as: a worker's fits its role's tool words (web: "<name>:worker-web", which has WebSearch and WebFetch); scouts and checkers are scouts. */
export function agentTypeFor(a: Pick<HostAgentStart, 'kind' | 'tools'>, name: string = S.N.name): string {
  return a.kind === 'worker' ? workerTypeFor({ tools: a.tools ? [...a.tools] : undefined }, name) : claudeNames(name).scout
}

/**
 * Claude Code's words: symcc's tools are MCP tools, "mcp__<name>__<tool>"; a role's `tools: web` gives a worker WebSearch and WebFetch (claude/agent-types.ts); a
 * worker's file tools are Read, Edit and Write; plan mode is turned on with Shift+Tab; its question dialog is
 * AskUserQuestion.
 */
export const CLAUDE_WORDS: HostWords = {
  tool: (name, tool) => claudeNames(name).tool(tool),
  fileTools: 'Read, Edit and Write',
  planMode: "Claude Code's own planning mode, Shift+Tab",
  askPopup: 'AskUserQuestion',
}

/** An error from a start, marked when it only means the agent type isn't there yet (see notReadyYet in host.ts). */
function startError(a: HostAgentStart, err: unknown): unknown {
  const msg = (err as Error)?.message ?? String(err)
  const notReady = a.kind === 'worker' ? isNotReady(msg, S.N.name) : scoutNotReady(msg, S.N.name)
  const e = err instanceof Error ? err : new Error(msg)
  return notReady ? Object.assign(e, { notReady: true }) : e
}

/** host.agents for Claude Code, over the hook's own `$`. */
export function claudeAgents($: EngineInterface): Host['agents'] {
  return {
    async spawn(a) {
      const input = { prompt: a.prompt, name: a.name, description: a.description, subagentType: agentTypeFor(a), ...(a.cwd !== undefined ? { cwd: a.cwd } : {}), ...(a.model ? { model: a.model } : {}) }
      let spawned: Awaited<ReturnType<EngineInterface['agent']['spawn']>>
      try {
        spawned = await $.agent.spawn(input)
      } catch (err) {
        throw startError(a, err)
      }
      if ('deny' in spawned && spawned.deny) throw startError(a, new Error(spawned.deny))
      return 'agentId' in spawned && spawned.agentId ? { agentId: spawned.agentId } : {}
    },
    // Every worker type (worker, worker-web, ...) is listed as a 'worker', the scout type as a 'scout' (see HostAgent).
    list: async () => (await $.agent.list()).map(a => hostAgent(a, S.N.name)),
    send: (agentId, text) => $.session.send({ to: { agentId }, text }),
    stop: (agentId, text) => $.session.send({ to: { agentId }, text }),
  }
}

/**
 * The environment variables symcc reads (claude/lead-usage.ts, app/symcc.ts). Claude Code's loader wants each name
 * `$.env.get` reads written out, so the modules' reads can be listed: one more name means one more line here.
 */
function envGet($: EngineInterface, name: string): Promise<string | undefined> {
  if (name === 'HOME') return $.env.get('HOME')
  if (name === 'USERPROFILE') return $.env.get('USERPROFILE')
  if (name === 'CLAUDE_CONFIG_DIR') return $.env.get('CLAUDE_CONFIG_DIR')
  return Promise.resolve(undefined)
}

/**
 * The hook's `$` as a Host: each member makes the same call on the same `$` (so a hook's waits still count against its
 * own time), under symcc's names, plus `agents`, `lead`, `words` and `ui.panel`, the board panel's values (app/state.ts). Cheap and holds
 * nothing, so each hook makes its own. Written out member by member: Claude Code's loader only lets `$` be used as
 * `$.noun.event(...)` or handed to the plugin's own functions, so `$` can't be wrapped as a whole (and some calls want
 * their first argument written out: see envGet).
 */
export function claudeHost($: EngineInterface): ClaudeHost {
  const host: ClaudeHost = {
    // Claude Code has every feature: the board panel, the band, a lead woken at once, plan mode and the lead's session logs
    features: ALL_FEATURES,
    plugin: {
      get name() {
        return $.plugin.name
      },
      get root() {
        return $.plugin.root
      },
    },
    session: { id: () => $.session.id(), repo: () => $.session.repo(), root: () => $.session.root(), usage: () => $.session.usage() },
    lead: { send: text => $.prompt.submit({ text }), usage: (root, range, nowMs) => leadUsage(host, root, range, nowMs) },
    agents: claudeAgents($),
    words: CLAUDE_WORDS,
    env: name => envGet($, name),
    fs: {
      read: p => $.fs.read(p),
      write: (p, text) => $.fs.write(p, text),
      exists: p => $.fs.exists(p),
      list: p => $.fs.list(p),
      stat: (p, options) => $.fs.stat(p, options),
    },
    run: (argv, init) => $.process.run(argv, init),
    clock: { after: (ms, fn) => $.clock.after(ms, fn), every: (ms, fn) => $.clock.every(ms, fn), sleep: ms => $.clock.sleep(ms) },
    ui: {
      toast: text => $.ui.toast(text),
      status: text => $.ui.status(text),
      log: (text, options) => $.ui.log(text, options),
      // the board panel is drawn on 'ui.render'; the loader wants the event written out
      refresh: () => $.ui.invalidate('ui.render'),
      open: pane => $.ui.open(pane),
      panes: () => $.ui.panes(),
      panel: panelValues($),
    },
  }
  return host
}
