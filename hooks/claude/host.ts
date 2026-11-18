// Claude Code's side of the Host (hooks/host.ts): claudeHost makes a Host from one hook's `$`. Most members are the
// same calls under the same names; `agents` is in Claude Code's terms here: symcc's workers, scouts and checkers are
// background subagents of the agent types register.tsx registers ("<name>:worker", "<name>:worker-web", ...,
// "<name>:scout"), listed by $.agent.list() and told to stop with $.session.send. It also carries the board panel's
// values (`panel`), which only Claude Code's `$` holds.
import type { EngineInterface } from 'claude-code'
import type { Host, HostAgent, HostAgentStart } from '../host'
import { namesFor } from '../name'
import { S, panelValues, type PanelValues } from '../plugin/state'
import { asBaseWorkers, workerTypeFor } from './agent-types'
import { isNotReady, scoutNotReady } from './agents'

/** The Host register.tsx hands the logic: Host, plus the board panel's values (see plugin/state.ts panelValues). */
export type ClaudeHost = Host & { panel: PanelValues }

/** The Claude Code agent type an agent of this kind is started as: a worker's fits its role's extra tools; scouts and checkers are scouts. */
export function agentTypeFor(a: Pick<HostAgentStart, 'kind' | 'tools'>, name: string = S.N.name): string {
  return a.kind === 'worker' ? workerTypeFor({ tools: a.tools ? [...a.tools] : undefined }, name) : namesFor(name).scout
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
    // Every worker type (worker, worker-web, ...) is listed as the base "<name>:worker", as Host's agent list says.
    list: async () => asBaseWorkers((await $.agent.list()) as HostAgent[], S.N.name),
    send: (agentId, text) => $.session.send({ to: { agentId }, text }),
    stop: (agentId, text) => $.session.send({ to: { agentId }, text }),
  }
}

/**
 * The environment variables symcc reads (claude/lead-usage.ts, register.tsx). Claude Code's loader wants each name
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
 * own time), plus `agents`, and `panel`, the board panel's values (plugin/state.ts). Cheap and holds
 * nothing, so each hook makes its own. Written out member by member: Claude Code's loader only lets `$` be used as
 * `$.noun.event(...)` or handed to the plugin's own functions, so `$` can't be wrapped as a whole (and some calls want
 * their first argument written out: see envGet).
 */
export function claudeHost($: EngineInterface): ClaudeHost {
  return {
    plugin: {
      get name() {
        return $.plugin.name
      },
      get root() {
        return $.plugin.root
      },
    },
    session: { id: () => $.session.id(), repo: () => $.session.repo(), root: () => $.session.root(), usage: () => $.session.usage() },
    prompt: { submit: input => $.prompt.submit(input) },
    agents: claudeAgents($),
    env: { get: name => envGet($, name) },
    fs: {
      read: p => $.fs.read(p),
      write: (p, text) => $.fs.write(p, text),
      exists: p => $.fs.exists(p),
      list: p => $.fs.list(p),
      stat: (p, options) => $.fs.stat(p, options),
    },
    process: { run: (argv, init) => $.process.run(argv, init) },
    clock: { after: (ms, fn) => $.clock.after(ms, fn), every: (ms, fn) => $.clock.every(ms, fn), sleep: ms => $.clock.sleep(ms) },
    ui: {
      toast: text => $.ui.toast(text),
      status: text => $.ui.status(text),
      log: (text, options) => $.ui.log(text, options),
      // its only event is 'ui.render'; the loader wants the event written out
      invalidate: () => $.ui.invalidate('ui.render'),
      open: pane => $.ui.open(pane),
      panes: () => $.ui.panes(),
    },
    panel: panelValues($),
  }
}
