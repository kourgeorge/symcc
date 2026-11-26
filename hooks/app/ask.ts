// A worker's try hands back through Claude Code's own mechanisms, never through words in its text:
// - a question: the workers' ask_owner tool (as the host names it, see toolName in state.ts), served in the tool.call hook;
// - more files: an edit outside the task's files is refused in the tool.check hook, and the path is recorded as a
//   request to the owner. The host tells what a call would touch (a file path, or a shell command: FileTouch in
//   host.ts; for Claude Code, its Edit, Write and NotebookEdit, and Bash: claude/tools.ts), so no tool name is read here.
// Both are written to the task's current try on the board at once (live.ask, live.refused), so a plugin reload
// before the hand-back doesn't lose them; finishWork (workers.ts) decides from the board.
import { type Board, type BoardTask, type Live, ASK_TOOL, ASK_SCHEMA, ASK_SENT, OPTIONS_MIN, OPTIONS_MAX, parseAsk, makeAsk, blockedEdit, blockedEditText, editOutsideFolder, outsideFolderText, bashOutsideFolder, bashOutsideText, BASH_DOTDOT, BASH_ABOVE, gitWriteIn, gitPlaceOk, gitWriteText, workerGitWriteText, scoutGitWriteText, editInProject, scoutEditText, editTarget, find, isInvestigation, patchTask, realPathOf, brokenLinkText, guardReason, guardFailedText, type PathLookup } from '../board'
import { S, toolName, type Worker, workers, scoutRuns, checkerRuns, stopped, isOwnAgent, boardAgents, rememberOnBoard, movedAgents, movedRefused, DRIVING_MOVED } from './state'
import { drivenElsewhere } from './lead'
import type { FileTouch, Host } from '../host'
import { load, change, now } from './store'
import { timedSync } from './slow-log'

/** The git guard check, timed (T-1048). */
const gitWrite = ($: Host, command: unknown, who?: 'reader' | 'worker') => timedSync($, 'gitWriteIn', () => gitWriteIn(command, who))
import { workerOf, agentOnBoard } from './workers'
import { scratchOn } from './git'
import { logRefusal, logAsked, type Refusal, type Who } from './evidence'

/** Writes `patch` (from the task as it is now) to worker `w`'s task, only while it is still "doing" on the same try. */
function recordOnTry($: Host, w: Worker, attempts: number, patch: (cur: BoardTask) => Live | null): Promise<boolean> {
  return change($, (b: Board) => {
    const cur = find(b, w.task)
    const p = cur && cur.status === 'doing' && cur.attempts === attempts ? patch(cur) : null
    return p ? ([patchTask(b, w.task, { live: p }, now()), true] as [Board, boolean]) : ([b, false] as [Board, boolean])
  })
}

/** The workers' question tool as registered with $.tool.register. */
export const ASK_TOOL_DEF = () => ({
  name: ASK_TOOL,
  description: `For ${S.N.name} workers only (the lead and scouts never call it): ask the owner a question you can't go on without. Give question, and optionally options: ${OPTIONS_MIN} to ${OPTIONS_MAX} short choices the owner can pick from. The task then waits for the owner's answer and a new try continues with it, so after the call stop and hand back.`,
  inputSchema: ASK_SCHEMA,
})

/**
 * An ask_owner call from agent `agentId` with input `a`: the reply the caller sees. Taken only from a running
 * worker whose task is still "doing" (one this copy doesn't hold, started by another session's copy or lost in a
 * reload, is found from the board, see workerOf); the question is written to its try on the board (a later call
 * replaces it). Everyone else is refused.
 */
export async function askCall($: Host, agentId: string | undefined, a: Record<string, unknown>): Promise<string> {
  const who: Who = { role: 'agent' }
  const text = await askAnswer($, agentId, a, who)
  // T-660: an agent's refused call (the lead's is not evidence of an agent struggling) and a question sent are logged, never its text
  if (agentId && text !== ASK_SENT) logRefusal($, who, { text, guard: 'ask' })
  else if (text === ASK_SENT && who.task) logAsked($, who.task, who.try ?? 0)
  return text
}

/** askCall's answer; `who` is filled in with the caller's role and task as they are found. */
async function askAnswer($: Host, agentId: string | undefined, a: Record<string, unknown>, who: Who): Promise<string> {
  const tool = toolName(ASK_TOOL)
  if (!agentId) return `Refused: ${tool} is only for ${S.N.name} workers; the lead (the main chat) never calls it (use ${toolName('ask')} to make a task wait for the owner).`
  const scout = scoutRuns.get(agentId)
  if (scout !== undefined) {
    Object.assign(who, { role: 'scout', scout })
    return `Refused: ${tool} is only for ${S.N.name} workers, not scouts. End with your report as usual.`
  }
  const chk = checkerRuns.get(agentId)
  if (chk) {
    Object.assign(who, { role: 'checker', task: chk.task })
    return `Refused: ${tool} is only for ${S.N.name} workers, not checkers. End with your verdict as usual.`
  }
  const w = await workerOf($, agentId)
  if (!w) return `Refused: ${tool} is only for running ${S.N.name} workers, and you are not one (or your try already handed back).`
  Object.assign(who, { role: 'worker', task: w.task })
  const t = find(await load($), w.task)
  if (!t || t.status !== 'doing') return `Refused: your task ${w.task} is not running any more${t ? ` (it is ${t.status})` : ''}. Stop and hand back.`
  who.try = t.attempts
  const q = parseAsk(a)
  if (typeof q === 'string') return `Refused: ${q}. Nothing was sent; call ${tool} again with a valid question.`
  if (!(await recordOnTry($, w, t.attempts, () => ({ ask: makeAsk('worker', q.question, now(), { options: q.options }) })))) return `Refused: your task ${w.task} is not running any more. Stop and hand back.`
  return ASK_SENT
}

/** How realPathOf looks at the disk through the host; a failed lookup (even one that throws at once) answers "not there" / "not a link". */
const diskLook = ($: Host): PathLookup => ({
  real: q => Promise.resolve().then(() => $.fs.stat(q, { resolve: true })).then(st => st.realPath, () => undefined),
  isLink: (dir, name) => Promise.resolve().then(() => $.fs.list(dir)).then(es => es.some(e => e.name === name && e.isLink), () => false),
})

/** Folder `dir` by both its names: as written, and where its symbolic links lead (when that can be looked up). */
async function bothNames(look: PathLookup, dir: string): Promise<string[]> {
  if (!dir.startsWith('/')) return [dir]
  const real = await realPathOf('/', dir, look).catch(() => undefined)
  return real && real !== dir ? [dir, real] : [dir]
}

/**
 * An edit's path, the worker's folder `worktree` and the project folder `root` with symbolic links followed
 * (realPathOf), so a link in the worker's folder that leads into the owner's copy is judged by where it leads; the
 * folders keep their names as written too, so either name matches (T-417). When any of the three can't be looked up,
 * all three stay as written (the checks then work as before T-303, with /tmp and /private/tmp still matched, see
 * pathAliases). Null when the path goes through a link that leads nowhere.
 */
async function realEdit($: Host, path: string, worktree: string, root: string): Promise<{ path: string; worktree: string[]; root: string[] } | null> {
  const asIs = { path, worktree: [worktree], root: [root] }
  const p = editTarget(path)
  if (!p || !worktree.startsWith('/') || !root.startsWith('/')) return asIs
  const look = diskLook($)
  const [file, wt, top] = await Promise.all([realPathOf(worktree, p, look), realPathOf('/', worktree, look), realPathOf('/', root, look)])
  if (file === null) return null
  if (!file || !wt || !top) return asIs
  // the real names first: blockedEdit reads the path from the first
  return { path: file, worktree: [wt, worktree], root: [top, root] }
}

/**
 * Why worker shell `command` is refused for naming the project `root` outside its own folder `worktree`, or for a
 * `..` path piece (bashOutsideFolder, both folders by both their names: as written and where links lead). Undefined: allowed.
 */
async function bashOutside($: Host, command: string, worktree: string, root: string): Promise<Refusal | undefined> {
  if (!root) return undefined
  const look = diskLook($)
  const [wts, tops] = await Promise.all([bothNames(look, worktree), bothNames(look, root)])
  const rel = bashOutsideFolder(command, wts, tops, S.home || undefined)
  if (rel === undefined) return undefined
  return { text: bashOutsideText(rel, worktree), guard: 'path', ...(rel === BASH_DOTDOT || rel === BASH_ABOVE ? {} : { what: rel }) }
}

/**
 * The tool.check hook's part, for a call that touches what `touch` says (from the host: a file it writes, or a shell
 * command it runs; null for anything else, which is never refused here): for a running worker, an edit inside the
 * project but outside its own folder (the owner's copy, the board, another worker's folder) is always refused, with no
 * file request (the worker should edit its own copy).
 * On a change task, an edit in its folder outside the task's files is refused (the reason the worker reads) and its path
 * recorded on its try on the board. Undefined: not ours to decide. An investigation
 * has no file list, so its edits are never refused (they are not kept anyway). A worker's shell command whose text names
 * the project outside its own folder, or has a `..` path piece, is refused too (bashOutsideFolder), and so is a git
 * command of the deny list (workerGitWrite), as for a checker; files written through the shell inside its folder are
 * only caught by the merge-time scope check. `cwd` is the folder the worker's shell is in (a shell tool may keep it
 * between calls): a worker's git writes run only there when it is its own folder or /tmp. An agent symcc has no record
 * of that the host (`kindOf`, by default its agent list) says is one of symcc's is refused (unknownAgentCheck, T-555).
 */
export async function checkEdit($: Host, agentId: string | undefined, touch: FileTouch | null, cwd?: string, kindOf: AgentKindOf = () => listedKind($, agentId!)): Promise<string | undefined> {
  if (!agentId || !touch) return undefined
  const who: Who = { role: 'agent' }
  const r = await judgeEdit($, agentId, touch, who, cwd, kindOf)
  // T-660: logged after the decision, in the background (never waited on, a failure ignored)
  if (r) logRefusal($, who, r, touch)
  return r?.text
}

/** checkEdit's decision: the refusal (and which guard), or undefined; `who` is filled in with the caller's role and task. */
async function judgeEdit($: Host, agentId: string, touch: FileTouch, who: Who, cwd: string | undefined, kindOf: AgentKindOf): Promise<Refusal | undefined> {
  if (stopped.has(agentId)) return { text: stoppedTextFor(agentId), guard: 'stopped' }
  // a checker (the checker setting) is kept inside the task's folder it checks, as a worker is; it has no file list
  const chk = checkerRuns.get(agentId)
  if (chk) {
    Object.assign(who, { role: 'checker', task: chk.task })
    return checkerCheck($, touch, chk.worktree)
  }
  // a scout runs in the owner's own folder: it may run tests and read with git, and write throwaway files outside the
  // project (such as /tmp), but never write with git or edit a file inside the project
  const scout = scoutRuns.get(agentId)
  if (scout !== undefined) {
    Object.assign(who, { role: 'scout', scout })
    return scoutCheck($, touch)
  }
  // a worker or checker this copy doesn't hold (another session's copy started it, or this copy lost it in a reload)
  // is found from the board (T-471), as for ask_owner; an unreadable board throws, so the call is refused (guardFailed).
  const mine = workers.get(agentId)
  const on = mine ? undefined : await agentOnBoard($, agentId)
  if (on?.kind === 'ended') {
    who.task = on.task
    return { text: stoppedText(), guard: 'stopped' }
  }
  if (on?.kind === 'checker') {
    Object.assign(who, { role: 'checker', task: on.task })
    return checkerCheck($, touch, on.worktree)
  }
  const w = mine ?? (on?.kind === 'worker' ? on.worker : undefined)
  if (!w) return unknownAgentCheck($, agentId, kindOf)
  Object.assign(who, { role: 'worker', task: w.task })
  if ('command' in touch) return (await outsideOwnFolder($, touch, w.worktree)) ?? workerGitWrite($, w, touch.command, cwd)
  const real = await realEdit($, touch.path, w.worktree, S.root)
  // realEdit gives null only for an edit with a path
  if (real === null) return { text: brokenLinkText(editTarget(touch.path)!), guard: 'link' }
  const outside = real.root.length ? editOutsideFolder(real.path, real.worktree, real.root) : undefined
  if (outside !== undefined) return { text: outsideFolderText(outside, w.worktree, S.N.dir), guard: 'path', what: outside }
  // an unreadable board throws on, so the hook's .catch refuses the edit (see guardFailed): never let it through unchecked
  const t = find(await load($), w.task)
  if (!t || isInvestigation(t)) return undefined
  who.try = t.attempts
  // the throwaway .scratch/ is free to edit only where the project keeps no file there in git (T-456)
  const path = blockedEdit(real.path, real.worktree, t.files, S.N.dir, await scratchOn($, w.worktree))
  if (!path) return undefined
  if (!t.live?.refused?.includes(path)) await recordOnTry($, w, t.attempts, cur => (cur.live?.refused?.includes(path) ? null : { refused: [...(cur.live?.refused ?? []), path] })).catch(() => false)
  return { text: blockedEditText(path), guard: 'files', what: path }
}

/**
 * What the host tells of an agent symcc has no record of: 'symcc' when it was started as one of symcc's agents (in
 * Claude Code its agent type is symcc's worker or scout type; in OpenCode its session's metadata names a symcc kind),
 * 'other' for any other agent (the lead's own subagents, e.g. Explore or general-purpose), undefined when the host
 * can't tell (it doesn't list the agent, or the lookup failed).
 */
export type AgentKindOf = () => Promise<'symcc' | 'other' | undefined>

/** Agent `agentId`'s kind from the host's agent list (see AgentKindOf); a list that fails or doesn't name it can't tell. */
export async function listedKind($: Host, agentId: string): Promise<'symcc' | 'other' | undefined> {
  const list = await Promise.resolve().then(() => $.agents.list()).catch(() => undefined)
  const a = list?.find(x => x.id === agentId)
  return a ? (a.kind === 'other' ? 'other' : 'symcc') : undefined
}

/**
 * T-555: an agent that is not the lead and that symcc doesn't know now (no worker, scout or checker of this copy's,
 * and none the board names), the edit or shell command it would run being already known to touch something: when
 * the host says it was started as one of symcc's agents (an old try's worker past the ids the board keeps, or a scout
 * this copy lost track of), it is refused every edit and every shell command (`kindOf`); reads stay allowed, as they
 * touch nothing. It is remembered (boardAgents), so a guard that crashes later still refuses it. Any other agent
 * (the lead's own subagents) is left alone, as is one the host can't tell: undefined.
 */
async function unknownAgentCheck($: Host, agentId: string, kindOf: AgentKindOf): Promise<Refusal | undefined> {
  if ((await kindOf().catch(() => undefined)) !== 'symcc') return undefined
  rememberOnBoard(agentId)
  // T-759: driving the board moved to another session: this run of symcc's is stopped with that plain note (and
  // recorded as stopped, so its end is no finding), not refused as an agent symcc knows nothing of
  if (await movedAway($, agentId)) return { text: movedText(), guard: 'stopped' }
  return { text: unknownAgentText(), guard: 'unknown-agent' }
}

/**
 * T-759: whether agent `agentId` (one of symcc's that this copy has no record of) runs in a session that no longer
 * drives the board, as lead.json says (drivenElsewhere): it is then marked stopped for that (movedAgents), so every
 * later tool call is refused with the same note and its end reports nothing.
 */
export async function movedAway($: Host, agentId: string): Promise<boolean> {
  if (!(await drivenElsewhere($).catch(() => false))) return false
  stopped.add(agentId)
  movedAgents.add(agentId)
  movedRefused().add(agentId)
  return true
}

/** T-759: what a run of symcc's is told once driving the board moved to another session (it was stopped for that). */
export const movedText = () =>
  `${DRIVING_MOVED[0]!.toUpperCase()}${DRIVING_MOVED.slice(1)}: ${S.N.name} runs scouts and workers only in the session that drives the board, and that is another session now, so this run ends here. Do nothing more; answer "${DRIVING_MOVED}" and end.`

/** What a stopped agent is told: the "driving moved" note when it was stopped for that (movedAgents), else stoppedText. */
export const stoppedTextFor = (agentId: string) => (movedAgents.has(agentId) ? movedText() : stoppedText())

/** What an agent of symcc's that symcc has no record of any more is told when it tries to edit a file or run a shell command (see unknownAgentCheck). */
export const unknownAgentText = () =>
  `Refused: ${S.N.name} has no record of this agent (it is not the lead, nor a worker, scout or checker the board names now), so it may not edit files or run shell commands. Do nothing more; answer "stopped" and end.`

/** What an agent symcc stopped (or whose task no longer runs it) is told when it tries a tool. */
export const stoppedText = () => `${S.N.name} stopped this agent. Do nothing more; answer "stopped" and end.`

/**
 * Why a checker's call in the task's folder `worktree` is refused: a checker only reads with git (its branch names
 * are shared with the owner's folder, main too, and so is the stash), and it is kept inside that folder as a worker
 * is; it has no file list. Undefined: allowed.
 */
async function checkerCheck($: Host, touch: FileTouch, worktree: string): Promise<Refusal | undefined> {
  const git = 'command' in touch ? gitWrite($, touch.command) : undefined
  if (git) return { text: gitWriteText(git), guard: 'git', what: git }
  return outsideOwnFolder($, touch, worktree)
}

/**
 * Why worker `w`'s shell `command` is refused for git (T-1062): a command of the worker deny list (gitWriteIn: push,
 * tag, config, update-ref, a branch, stash, `git -C`...; `git update-ref refs/heads/main` from its folder would really
 * move main), or a git write run anywhere but its own folder or /tmp (gitPlaceOk, with the shell's folder `cwd`). An
 * investigation's changes are never kept, so its worker only reads with git. symcc still checks every commit of the
 * try at merge time. Undefined: allowed.
 */
async function workerGitWrite($: Host, w: Worker, command: string, cwd?: string): Promise<Refusal | undefined> {
  if (!gitWrite($, command)) return undefined
  // an unreadable board throws on, so the hook's .catch refuses the command (see guardFailed)
  const t = find(await load($), w.task)
  const reader = !t || isInvestigation(t) || !w.worktree.startsWith('/')
  const git = gitWrite($, command, reader ? 'reader' : 'worker') ?? (gitPlaceOk(command, cwd, [...(await bothNames(diskLook($), w.worktree)), '/tmp']) ? undefined : 'git in another folder')
  return git ? { text: workerGitWriteText(git), guard: 'git', what: git } : undefined
}

/**
 * Why a scout's call that touches what `touch` says is refused: a shell command that writes with git (gitWriteIn), or
 * an edit of a file inside the project (symbolic links followed, see realEdit). Its other shell commands are not
 * checked here (it is only asked in its prompt not to install or change files that way). Undefined: allowed.
 */
async function scoutCheck($: Host, touch: FileTouch): Promise<Refusal | undefined> {
  if ('command' in touch) {
    const git = gitWrite($, touch.command)
    return git ? { text: scoutGitWriteText(git), guard: 'git', what: git } : undefined
  }
  const real = await realEdit($, touch.path, S.root, S.root)
  if (real === null) return { text: brokenLinkText(editTarget(touch.path)!), guard: 'link' }
  const rel = editInProject(real.path, real.root)
  return rel !== undefined ? { text: scoutEditText(rel), guard: 'scout-edit', what: rel } : undefined
}

/**
 * Why a shell command or an edit of a checker in folder `worktree` is refused: it names a path in the project outside
 * that folder (the owner's copy, the board, another worker's folder). Undefined: allowed.
 */
async function outsideOwnFolder($: Host, touch: FileTouch, worktree: string): Promise<Refusal | undefined> {
  if ('command' in touch) return bashOutside($, touch.command, worktree, S.root)
  const real = await realEdit($, touch.path, worktree, S.root)
  if (real === null) return { text: brokenLinkText(editTarget(touch.path)!), guard: 'link' }
  const outside = real.root.length ? editOutsideFolder(real.path, real.worktree, real.root) : undefined
  return outside !== undefined ? { text: outsideFolderText(outside, worktree, S.N.dir), guard: 'path', what: outside } : undefined
}

/** The guard failures already logged (hook and reason), so each is logged once; kept small. */
export const guardLogged = new Set<string>()
const GUARD_LOGGED_MAX = 50


/**
 * A guard hook (tool.check, tool.call) threw or ran out of time on a call of agent `agentId` (`failure`: why, as the
 * hook's .catch reads it on next.error). For symcc's own agents (isOwnAgent, or found on the board by an earlier
 * guard, boardAgents: T-471) the reason to refuse the call with; undefined for the lead and everyone else, whose call
 * goes on as if the hook were not there (a symcc error never blocks the owner's own session). The failure is logged once.
 */
export function guardFailed($: Pick<Host, 'ui'>, hook: string, agentId: string | undefined, failure: { kind?: string; message?: string } | undefined): string | undefined {
  const own = isOwnAgent(agentId) || (!!agentId && boardAgents.has(agentId))
  const reason = hookFailed($, hook, failure, own ? 'the call of its agent was refused' : 'the call went on unchecked')
  return own ? guardFailedText(S.N.name, reason) : undefined
}

/**
 * Hook `hook` threw or ran out of time (`failure`, as its .catch reads it on next.error) and `outcome` was done in
 * its place. Logs that once per hook and reason (a failing log changes nothing) and answers the short reason.
 */
export function hookFailed($: Pick<Host, 'ui'>, hook: string, failure: { kind?: string; message?: string } | undefined, outcome: string): string {
  const reason = guardReason(failure?.kind, failure?.message)
  const key = `${hook}: ${reason}`
  if (!guardLogged.has(key)) {
    if (guardLogged.size >= GUARD_LOGGED_MAX) guardLogged.clear()
    guardLogged.add(key)
    try {
      $.ui.log(`${S.N.name}: the ${hook} hook ${reason}; ${outcome}.`, { to: 'debug' })
    } catch {
      // no log to write to: the decision still stands
    }
  }
  return reason
}
