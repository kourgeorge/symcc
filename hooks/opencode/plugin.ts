// symcc's OpenCode server plugin (T-462): what opencode/server.ts exports. OpenCode starts a fresh copy of it (its own
// module memory) for every folder a session works in, all in one server process that shares globalThis; a session's
// permission and tool hooks fire only in the copy for its own folder. So:
//   - the copy whose folder is the project's main folder or a folder inside it (anything but a worker's folder; the
//     owners are keyed by the main folder with links followed: macOS gives /tmp and /private/tmp separate copies) runs
//     symcc's engine: sessionStart, which claims lead.json (the one-driver lock across sessions and programs), starts
//     the timers and the board;
//   - a copy in a worker's folder only guards: guardStart reads the roles, kinds
//     and board and never claims the lead, so its hooks can judge that folder's sessions (T-472, with T-471's board
//     lookups);
//   - two copies for the same real main folder (e.g. the main folder and a subfolder of it): the first runs the engine, the other only guards until the first is
//     unloaded, then takes over (the owners are kept on globalThis by real path, and let go in cleanup);
//   - every copy registers the edit guard (guard.ts).
// A copy that is unloaded and loaded again (a file edit reloads every copy) starts cleanly: cleanup ends its engine
// and timers (sessionEnd), and the next setup starts them again. Only the engine copy may act on OpenCode's events
// (every copy sees every session's): the next OpenCode tasks add those, and the lead, tools and TUI. The agents are
// OpenCode sessions (agents.ts, T-463), children of the lead's session (the last one in the copy's folder given a
// prompt that is none of symcc's agents).
import type { Host, HostAgentKind } from '../host'
import { sessionStarting, sessionStart, guardStart, sessionEnd, agentFinished } from '../app/symcc'
import { useName, scoutRuns } from '../app/state'
import { mainRoot, isWorkerFolder } from '../app/store'
import { agentOnBoard } from '../app/workers'
import type { OcContext, OcRegistration, OcServerPlugin } from './ctx'
import { opencodeHost, type OpencodeHostOptions } from './host'
import { onEvaluate, onToolBefore, realPathOf } from './guard'
import { opencodeAgents, type OpencodeAgentsOptions } from './agents'

/** What a copy does with symcc's engine: run it (the main folder's copy), only guard (any other), or end it. */
export type Engine = {
  start: (host: Host) => Promise<void>
  guard: (host: Host, root: string) => Promise<void>
  end: (host: Host) => Promise<void>
}

/** symcc's own entry points, in the order every host calls them (hooks/register.tsx, hosts/node/session.ts). */
export const SYMCC_ENGINE: Engine = {
  async start(host) {
    useName(host)
    sessionStarting()
    await sessionStart(host)
  },
  async guard(host, root) {
    useName(host)
    await guardStart(host, root)
  },
  async end(host) {
    useName(host)
    await sessionEnd(host)
  },
}

/** A copy waiting to run the engine for a main folder, and how it takes over. */
type Waiting = { token: object; takeOver: () => Promise<void> }
/** Who runs the engine for one real main folder, and who waits to. */
type Slot = { owner?: object; waiting: Waiting[] }

const OWNERS_KEY = '__symccOpencodeOwners'

/** The engine owners, by real main folder, shared by every copy of the plugin in this server process. */
export function owners(): Map<string, Slot> {
  const g = globalThis as unknown as Record<string, unknown>
  if (!(g[OWNERS_KEY] instanceof Map)) g[OWNERS_KEY] = new Map<string, Slot>()
  return g[OWNERS_KEY] as Map<string, Slot>
}

/** How a copy's role was decided (for its log line and the tests). */
export type CopyRole = 'engine' | 'guard' | 'waiting'

export type ServerOptions = {
  /** symcc's engine (default: SYMCC_ENGINE); tests pass one that records what it was asked */
  engine?: Engine
  /** builds the copy's Host (default: opencodeHost) */
  host?: (o: OpencodeHostOptions) => Host
  /** passed on to the Host */
  hostOptions?: Omit<OpencodeHostOptions, 'dir'>
  /** told each copy's folder and role */
  onRole?: (dir: string, role: CopyRole) => void
  /** passed on to the agents (opencodeAgents), e.g. shorter waits in the tests */
  agentOptions?: Pick<OpencodeAgentsOptions, 'waitMs' | 'pollMs' | 'sleep'>
}

/**
 * Whether symcc has recorded agent `id` of kind `kind`, so the guard of its folder's copy of the plugin knows it: a
 * scout (it runs in the main folder, so this copy's memory is enough) once its run is kept, a worker or a checker
 * once the board names it (the copy for its worktree only knows it from there, see agentOnBoard).
 */
export async function recorded(host: Host, id: string, kind: HostAgentKind): Promise<boolean> {
  if (kind === 'scout') return scoutRuns.has(id)
  const on = await agentOnBoard(host, id)
  return on?.kind === 'worker' || on?.kind === 'checker'
}

/** The server plugin, as OpenCode wants its default export ({ id, setup }). */
export function symccServer(o: ServerOptions = {}): OcServerPlugin {
  const engine = o.engine ?? SYMCC_ENGINE
  return {
    id: 'symcc',
    async setup(ctx: OcContext) {
      const dir = ctx.location.directory
      // the agents are OpenCode sessions (agents.ts), children of the lead's session: the last session in this
      // copy's folder that was given a prompt and is none of symcc's agents. Only the engine copy starts any.
      let lead: string | undefined
      const ref: { host?: Host } = {}
      const agents = o.hostOptions?.agents
        ? undefined
        : opencodeAgents(ctx.session, {
            ...o.agentOptions,
            dir,
            lead: () => lead,
            ready: (id, kind) => recorded(ref.host!, id, kind),
            onEnd: (id, end) => {
              useName(ref.host!)
              agentFinished(ref.host!, id, end)
            },
            log: text => ref.host?.ui.log(text),
          })
      const host = (o.host ?? opencodeHost)({ ...o.hostOptions, ...(agents ? { agents } : {}), dir })
      ref.host = host
      const say = (text: string) => host.ui.toast(text)
      useName(host)
      const regs: OcRegistration[] = []
      regs.push(
        await ctx.session.hook('prompt', e => {
          if (e.sessionID && !agents?.has(e.sessionID)) lead = e.sessionID
        }),
      )
      // the guard first, so a session's edits are judged from the start (an unknown project refuses nothing)
      regs.push(await ctx.permission.hook('evaluate', onEvaluate(host, dir)))
      regs.push(await ctx.tool.hook('execute.before', onToolBefore(host, dir)))
      const main = await mainRoot(host, dir).catch(() => dir)
      const realMain = await realPathOf(main || dir)
      // the main folder or any folder inside it (not a worker's folder) is a main copy, as Claude Code's sessionStart
      // treats it; the owner's own worktree outside the project has itself as its main root
      const inMain = !(await isWorkerFolder(host, dir, main || dir).catch(() => false))
      const token = {}
      let running = false
      let slot: Slot | undefined
      const takeOver = async () => {
        running = true
        slot!.owner = token
        o.onRole?.(dir, 'engine')
        await engine.start(host).catch(err => say(`couldn't start the board: ${(err as Error)?.message ?? err}`))
      }
      if (inMain) {
        slot = owners().get(realMain) ?? { waiting: [] }
        owners().set(realMain, slot)
        if (!slot.owner) await takeOver()
        else {
          slot.waiting.push({ token, takeOver })
          o.onRole?.(dir, 'waiting')
          await engine.guard(host, main).catch(() => undefined)
        }
      } else {
        o.onRole?.(dir, 'guard')
        await engine.guard(host, main).catch(() => undefined)
      }
      return async () => {
        for (const r of regs.splice(0)) await r.dispose().catch(() => undefined)
        if (!slot) return
        if (running) {
          running = false
          await engine.end(host).catch(() => undefined)
          if (slot.owner === token) slot.owner = undefined
          const next = slot.waiting.shift()
          if (next) await next.takeOver()
        } else slot.waiting = slot.waiting.filter(w => w.token !== token)
        if (!slot.owner && !slot.waiting.length && owners().get(realMain) === slot) owners().delete(realMain)
      }
    },
  }
}
