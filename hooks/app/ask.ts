// A worker's try hands back through Claude Code's own mechanisms, never through words in its text:
// - a question: the workers' ask_owner tool (as the host names it, see toolName in state.ts), served in the tool.call hook;
// - more files: an edit outside the task's files is refused in the tool.check hook, and the path is recorded as a
//   request to the owner. The host tells what a call would touch (a file path, or a shell command: FileTouch in
//   host.ts; for Claude Code, its Edit, Write and NotebookEdit, and Bash: claude/tools.ts), so no tool name is read here.
// Both are written to the task's current try on the board at once (try_question, try_refused), so a plugin reload
// before the hand-back doesn't lose them; finishWork (workers.ts) decides from the board.
import { type Board, type BoardTask, ASK_TOOL, ASK_SCHEMA, ASK_SENT, OPTIONS_MIN, OPTIONS_MAX, parseAsk, blockedEdit, blockedEditText, editOutsideFolder, outsideFolderText, bashOutsideFolder, bashOutsideText, bashPathsToCheck, bashTooManyText, gitWriteIn, gitWriteText, workerGitWriteText, scoutGitWriteText, editInProject, scoutEditText, mergeStepAllow, intoOf, editTarget, find, isInvestigation, patchTask, realPathOf, brokenLinkText, guardReason, guardFailedText, type PathLookup } from '../board'
import { S, toolName, type Worker, scoutRuns, checkerRuns, isOwnAgent } from './state'
import type { FileTouch, Host } from '../host'
import { load, change, now } from './store'
import { workerOf } from './workers'
import { scratchOn } from './git'

/** Writes `patch` (from the task as it is now) to worker `w`'s task, only while it is still "doing" on the same try. */
function recordOnTry($: Host, w: Worker, attempts: number, patch: (cur: BoardTask) => Partial<BoardTask> | null): Promise<boolean> {
  return change($, (b: Board) => {
    const cur = find(b, w.task)
    const p = cur && cur.status === 'doing' && cur.attempts === attempts ? patch(cur) : null
    return p ? ([patchTask(b, w.task, p, now()), true] as [Board, boolean]) : ([b, false] as [Board, boolean])
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
 * worker whose task is still "doing" (a worker this copy lost in a reload is found again from the board, see
 * workerOf); the question is written to its try on the board (a later call replaces it). Everyone else is refused.
 */
export async function askCall($: Host, agentId: string | undefined, a: Record<string, unknown>): Promise<string> {
  const tool = toolName(ASK_TOOL)
  if (!agentId) return `Refused: ${tool} is only for ${S.N.name} workers; the lead (the main chat) never calls it (use ${toolName('ask')} to make a task wait for the owner).`
  if (scoutRuns.has(agentId)) return `Refused: ${tool} is only for ${S.N.name} workers, not scouts. End with your report as usual.`
  const w = await workerOf($, agentId)
  if (!w) return `Refused: ${tool} is only for running ${S.N.name} workers, and you are not one (or your try already handed back).`
  const t = find(await load($), w.task)
  if (!t || t.status !== 'doing') return `Refused: your task ${w.task} is not running any more${t ? ` (it is ${t.status})` : ''}. Stop and hand back.`
  const q = parseAsk(a)
  if (typeof q === 'string') return `Refused: ${q}. Nothing was sent; call ${tool} again with a valid question.`
  if (!(await recordOnTry($, w, t.attempts, () => ({ try_question: q })))) return `Refused: your task ${w.task} is not running any more. Stop and hand back.`
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
 * Why worker shell `command` is refused for naming a path in the project `root` outside its own folder `worktree`
 * (bashOutsideFolder, with both folders by both their names), or for naming a path elsewhere that a symbolic link
 * leads into the project, in its own folder or elsewhere (each looked up on disk, see bashPathsToCheck), or for
 * having too many paths or folder changes to check (T-436). Undefined: allowed.
 */
async function bashOutside($: Host, command: string, worktree: string, root: string, cwd?: string): Promise<string | undefined> {
  if (!root) return undefined
  const home = S.home || undefined
  const look = diskLook($)
  const [wts, tops] = await Promise.all([bothNames(look, worktree), bothNames(look, root)])
  const rel = bashOutsideFolder(command, wts, tops, home, cwd)
  if (rel !== undefined) return bashOutsideText(rel, worktree)
  const { paths, tooMany } = bashPathsToCheck(command, wts, home, cwd, tops)
  if (tooMany) return bashTooManyText(worktree)
  // only where links lead matters here (a link that leads nowhere is no way into the project), so no folder is listed
  const bashLook: PathLookup = { real: look.real, isLink: async () => false }
  const linky = linkFinder($, wts)
  const reals = await Promise.all(
    paths.map(async abs => ((await linky(abs).catch(() => true)) ? realPathOf('/', abs, bashLook).catch(() => undefined) : abs)),
  )
  for (const [i, real] of reals.entries()) {
    // a path that can't be looked up is judged as written
    const via = editOutsideFolder(real || paths[i]!, wts, tops)
    if (via !== undefined) return bashOutsideText(via, worktree)
  }
  return undefined
}

/**
 * Whether clean absolute path `abs` may go through a symbolic link, so it is worth looking up where it leads (T-436):
 * from the worker's folder (any of its names `wts`, when `abs` is inside it) or else from "/", each piece is found in
 * its folder's list (each folder listed once per command, letter case ignored, as on macOS); a link piece answers
 * true, a missing one false (nothing under it exists), a folder that can't be listed true. So a long command naming many plain files costs one listing
 * per folder, not a lookup per path.
 */
function linkFinder($: Host, wts: readonly string[]): (abs: string) => Promise<boolean> {
  const lists = new Map<string, Promise<Map<string, boolean> | null>>()
  const listOf = (dir: string) => {
    let got = lists.get(dir)
    if (!got) {
      got = Promise.resolve()
        .then(() => $.fs.list(dir))
        .then(
          es => {
            const m = new Map<string, boolean>()
            for (const e of es) m.set(e.name.toLowerCase(), (m.get(e.name.toLowerCase()) ?? false) || e.isLink)
            return m
          },
          () => null,
        )
      lists.set(dir, got)
    }
    return got
  }
  return async abs => {
    const from = wts.filter(w => w.startsWith('/') && abs.startsWith(`${w}/`)).sort((a, b) => b.length - a.length)[0] ?? '/'
    let dir = from
    for (const part of abs.slice(from.length).split('/').filter(Boolean)) {
      const m = await listOf(dir)
      // a folder that can't be listed: looked up the slow way
      if (!m) return true
      const isLink = m.get(part.toLowerCase())
      if (isLink === undefined) return false
      if (isLink) return true
      dir = dir === '/' ? `/${part}` : `${dir}/${part}`
    }
    return false
  }
}

/**
 * The tool.check hook's part, for a call that touches what `touch` says (from the host: a file it writes, or a shell
 * command it runs; null for anything else, which is never refused here): for a running worker, an edit inside the
 * project but outside its own folder (the owner's copy, the board, another worker's folder) is always refused, with no
 * file request (the worker should edit its own copy).
 * On a change task, an edit in its folder outside the task's files is refused (the reason the worker reads) and its path
 * recorded on its try on the board. Undefined: not ours to decide. An investigation
 * has no file list, so its edits are never refused (they are not kept anyway). A worker's shell command that names a path
 * in the project outside its own folder is refused too (bashOutsideFolder), and so is one that writes with git
 * (workerGitWrite), as for a checker; files written through the shell inside its folder are only caught by the
 * merge-time scope check. `cwd` is the folder the worker's shell is in (a shell tool may
 * keep it between calls); relative paths start there when it is inside the worker's folder.
 */
export async function checkEdit($: Host, agentId: string | undefined, touch: FileTouch | null, cwd?: string): Promise<string | undefined> {
  if (!agentId || !touch) return undefined
  // a checker (the checker setting) is kept inside the task's folder it checks, as a worker is; it has no file list
  const chk = checkerRuns.get(agentId)
  if (chk) {
    // a checker only reads with git: its branch names are shared with the owner's folder (main too), and so is the stash
    const git = 'command' in touch ? gitWriteIn(touch.command) : undefined
    if (git) return gitWriteText(git)
    return outsideOwnFolder($, touch, chk.worktree, cwd)
  }
  // a scout runs in the owner's own folder: it may run tests and read with git, and write throwaway files outside the
  // project (such as /tmp), but never write with git or edit a file inside the project
  if (scoutRuns.has(agentId)) return scoutCheck($, touch)
  // a worker this copy lost in a reload is found again from the board, as for ask_owner; if not found, nothing is refused
  const w = await workerOf($, agentId).catch(() => undefined)
  if (!w) return undefined
  if ('command' in touch) return (await outsideOwnFolder($, touch, w.worktree, cwd)) ?? workerGitWrite($, w, touch.command)
  const real = await realEdit($, touch.path, w.worktree, S.root)
  // realEdit gives null only for an edit with a path
  if (real === null) return brokenLinkText(editTarget(touch.path)!)
  const outside = real.root.length ? editOutsideFolder(real.path, real.worktree, real.root) : undefined
  if (outside !== undefined) return outsideFolderText(outside, w.worktree, S.N.dir)
  // an unreadable board throws on, so the hook's .catch refuses the edit (see guardFailed): never let it through unchecked
  const t = find(await load($), w.task)
  if (!t || isInvestigation(t)) return undefined
  // the throwaway .scratch/ is free to edit only where the project keeps no file there in git (T-456)
  const path = blockedEdit(real.path, real.worktree, t.files, S.N.dir, await scratchOn($, w.worktree))
  if (!path) return undefined
  if (!t.try_refused?.includes(path)) await recordOnTry($, w, t.attempts, cur => (cur.try_refused?.includes(path) ? null : { try_refused: [...(cur.try_refused ?? []), path] })).catch(() => false)
  return blockedEditText(path)
}

/**
 * Why worker `w`'s shell `command` is refused for a git write (gitWriteIn: a commit, a push, a merge, update-ref, a
 * branch, tag, stash or reset...): its branch names, tags and stash are shared with the owner's folder (main too), so
 * `git update-ref refs/heads/main HEAD` from its own folder would move main. A "merge it in" try (merge_main on its
 * task, after a clash with the branch it merges into) may still run `git merge <that branch>` and `git merge --abort`
 * (mergeStepAllow), as its prompt asks; symcc adds and commits the resolved files as for any try. Undefined: allowed.
 */
async function workerGitWrite($: Host, w: Worker, command: string): Promise<string | undefined> {
  if (!gitWriteIn(command)) return undefined
  // an unreadable board throws on, so the hook's .catch refuses the command (see guardFailed)
  const t = find(await load($), w.task)
  const into = t?.merge_main ? intoOf(t) : undefined
  const git = gitWriteIn(command, into ? mergeStepAllow(into) : undefined)
  return git ? workerGitWriteText(git, into) : undefined
}

/**
 * Why a scout's call that touches what `touch` says is refused: a shell command that writes with git (gitWriteIn), or
 * an edit of a file inside the project (symbolic links followed, see realEdit). Its other shell commands are not
 * checked here (it is only asked in its prompt not to install or change files that way). Undefined: allowed.
 */
async function scoutCheck($: Host, touch: FileTouch): Promise<string | undefined> {
  if ('command' in touch) {
    const git = gitWriteIn(touch.command)
    return git ? scoutGitWriteText(git) : undefined
  }
  const real = await realEdit($, touch.path, S.root, S.root)
  if (real === null) return brokenLinkText(editTarget(touch.path)!)
  const rel = editInProject(real.path, real.root)
  return rel !== undefined ? scoutEditText(rel) : undefined
}

/**
 * Why a shell command or an edit of a checker in folder `worktree` is refused: it names a path in the project outside
 * that folder (the owner's copy, the board, another worker's folder). Undefined: allowed.
 */
async function outsideOwnFolder($: Host, touch: FileTouch, worktree: string, cwd?: string): Promise<string | undefined> {
  if ('command' in touch) {
    return bashOutside($, touch.command, worktree, S.root, cwd)
  }
  const real = await realEdit($, touch.path, worktree, S.root)
  if (real === null) return brokenLinkText(editTarget(touch.path)!)
  const outside = real.root.length ? editOutsideFolder(real.path, real.worktree, real.root) : undefined
  return outside !== undefined ? outsideFolderText(outside, worktree, S.N.dir) : undefined
}

/** The guard failures already logged (hook and reason), so each is logged once; kept small. */
export const guardLogged = new Set<string>()
const GUARD_LOGGED_MAX = 50


/**
 * A guard hook (tool.check, tool.call) threw or ran out of time on a call of agent `agentId` (`failure`: why, as the
 * hook's .catch reads it on next.error). For symcc's own agents (isOwnAgent) the reason to refuse the call with;
 * undefined for the lead and everyone else, whose call goes on as if the hook were not there (a symcc error never
 * blocks the owner's own session). The failure is logged once.
 */
export function guardFailed($: Pick<Host, 'ui'>, hook: string, agentId: string | undefined, failure: { kind?: string; message?: string } | undefined): string | undefined {
  const own = isOwnAgent(agentId)
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
