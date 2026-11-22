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
// (every copy sees every session's): the next OpenCode tasks add those, and the TUI. Every copy adds symcc's tools and
// slash commands (tools.ts, T-465); the lead gets its guide through the "context" hook. The agents are
// OpenCode sessions (agents.ts, T-463), children of the lead's session. The lead (lead.ts, T-464) is the session the
// owner talks to: the last one in a main copy's folder given a prompt that is no child session and none of symcc's
// agents. It is kept per board owner (by real main folder, see leads), so a copy that takes over the engine, or one
// loaded again, still knows it; board updates sent before it was known go to it then.
import type { Host, HostAgentKind } from '../host'
import { sessionStarting, sessionStart, guardStart, sessionEnd, agentFinished, leadGuideText } from '../app/symcc'
import { useName, scoutRuns } from '../app/state'
import { projectRoot, isWorkerFolder } from '../app/store'
import { agentOnBoard } from '../app/workers'
import type { OcContext, OcRegistration, OcServerPlugin } from './ctx'
import { opencodeHost, type OpencodeHostOptions } from './host'
import { onEvaluate, onToolBefore, realPathOf } from './guard'
import { opencodeAgents, type OpencodeAgentsOptions } from './agents'
import { opencodeLead } from './lead'
import { opencodeTools, opencodeCommands, callerOf, hiddenTools } from './tools'

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

const LEADS_KEY = '__symccOpencodeLeads'

/**
 * The lead's OpenCode session, by real main folder (the board owner's), shared by every copy of the plugin in this
 * server process and kept when the copies are unloaded, so a copy that takes over (or a reloaded one) still knows it.
 */
export function leads(): Map<string, string> {
  const g = globalThis as unknown as Record<string, unknown>
  if (!(g[LEADS_KEY] instanceof Map)) g[LEADS_KEY] = new Map<string, string>()
  return g[LEADS_KEY] as Map<string, string>
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

/** A session in folder `at` can be the lead of the project whose main folder is `main`: `at` is that folder or inside
 * it, and not a worker's folder. */
export async function isLeadFolder(host: Host, at: string | undefined, main: string, realMain: string): Promise<boolean> {
  if (!at) return false
  const real = await realPathOf(at).catch(() => at)
  if (real !== realMain && !real.startsWith(realMain.endsWith('/') ? realMain : realMain + '/')) return false
  return !(await isWorkerFolder(host, at, main).catch(() => true))
}

/** The server plugin, as OpenCode wants its default export ({ id, setup }). */
export function symccServer(o: ServerOptions = {}): OcServerPlugin {
  const engine = o.engine ?? SYMCC_ENGINE
  return {
    id: 'symcc',
    async setup(ctx: OcContext) {
      const dir = ctx.location.directory
      // the agents are OpenCode sessions (agents.ts), children of the lead's session: the last session in a main
      // copy's folder that was given a prompt and is no child and none of symcc's agents, kept per real main folder
      // (leads) once this copy knows it is a main copy. Only the engine copy starts any.
      let ownLead: string | undefined
      let leadKey: string | undefined
      const lead = () => (leadKey ? leads().get(leadKey) : undefined) ?? ownLead
      const ref: { host?: Host } = {}
      // whether this copy runs symcc's engine now (see takeOver)
      let running = false
      const agents = o.hostOptions?.agents
        ? undefined
        : opencodeAgents(ctx.session, {
            ...o.agentOptions,
            dir,
            lead,
            ready: (id, kind) => recorded(ref.host!, id, kind),
            onEnd: (id, end) => {
              useName(ref.host!)
              agentFinished(ref.host!, id, end)
            },
            log: text => ref.host?.ui.log(text),
          })
      const leadApi = o.hostOptions?.lead ? undefined : opencodeLead(ctx.session, { lead, log: text => ref.host?.ui.log(text) })
      const host = (o.host ?? opencodeHost)({ ...o.hostOptions, ...(agents ? { agents } : {}), ...(leadApi ? { lead: leadApi } : {}), dir })
      ref.host = host
      const say = (text: string) => host.ui.toast(text)
      useName(host)
      const regs: OcRegistration[] = []
      // where this copy's project is (set below): a session elsewhere (another project on the same server, or one
      // opened in a worker's folder) is never this project's lead
      let placed!: (v: { main: string; realMain: string; inMain: boolean }) => void
      const place = new Promise<{ main: string; realMain: string; inMain: boolean }>(r => (placed = r))
      regs.push(
        await ctx.session.hook('prompt', async e => {
          const id = e.sessionID
          if (!id || agents?.has(id)) return
          // the lead may already be known from another main copy's hook (copies share it): still send what this copy kept
          if (id === lead()) return void (await leadApi?.known())
          // a child session (one of symcc's agents from an earlier copy, or OpenCode's own subagent) is never the lead
          const info = await ctx.session.get({ sessionID: id }).catch(() => undefined)
          if (!info || info.parentID || info.metadata?.symcc) return
          const at = await place
          if (!at.inMain || !(await isLeadFolder(host, info.location?.directory, at.main, at.realMain))) return
          if (id !== lead()) {
            ownLead = id
            if (leadKey) leads().set(leadKey, id)
          }
          await leadApi?.known()
        }),
      )
      // a session's symcc metadata: the kind of symcc agent it was made for (agents.ts), nothing for any other
      const kindOf = (sessionID: string) => ctx.session.get({ sessionID }).then(i => i.metadata?.symcc)
      // the guard first, so a session's edits are judged from the start (an unknown project refuses nothing); a
      // session made for one of symcc's agents that symcc has no record of now is refused edits and shell (T-555)
      regs.push(await ctx.permission.hook('evaluate', onEvaluate(host, dir, kindOf)))
      regs.push(await ctx.tool.hook('execute.before', onToolBefore(host, dir, kindOf)))
      // symcc's tools and slash commands (tools.ts), before the engine starts, as Claude Code registers them first;
      // a guard-only copy answers its lead tools and commands that the board runs from the main folder
      const tools = opencodeTools(host, lead, kindOf)
      regs.push(await ctx.tool.transform(t => tools.forEach(x => t.add(x))))
      const commands = opencodeCommands(host, ctx.session)
      regs.push(await ctx.command.transform(c => commands.forEach(x => c.add(x))))
      // each model request: a session is offered only the symcc tools it may call (callerOf), and the lead (in the
      // copy running the engine) gets its guide in the system prompt, read on every request as Claude Code's
      // prompt.compose does (so /symcc-disable counts from the next message)
      regs.push(
        await ctx.session.hook('context', async e => {
          useName(host)
          const isLead = e.sessionID === lead()
          const caller = isLead ? 'lead' : await callerOf(host, e.sessionID, () => kindOf(e.sessionID))
          for (const name of hiddenTools(caller)) delete e.tools[name]
          if (!isLead || !running) return
          const guide = await leadGuideText(host).catch(() => undefined)
          if (guide) e.system.push({ type: 'text', text: guide, metadata: { symcc: 'lead-guide' } })
        }),
      )
      const main = await projectRoot(host, dir).catch(() => dir)
      const realMain = await realPathOf(main || dir)
      // the main folder or any folder inside it (not a worker's folder) is a main copy, as Claude Code's sessionStart
      // treats it; the owner's own worktree outside the project has itself as its main root
      const inMain = !(await isWorkerFolder(host, dir, main || dir).catch(() => false))
      placed({ main: main || dir, realMain, inMain })
      const token = {}
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
        leadKey = realMain
        if (ownLead) leads().set(realMain, ownLead)
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
