import type { SymccTask } from '../../types'
import { type ChangeSize, parseNumstat, hasMergedChanges, parseShortstat, type Blockers, type BoardTask, type TurnStep, type DiffFile, parseDiffStat, parseStatusZ, reviewedCommit, YOUR_EDITS, type Board, commitMessage, outOfScope, outOfScopeText, testTail, needsReview, find, patchTask, addCommits, moveTarget, researchNotes, intoOf, isTaskCommit, testTimeoutMs, isInvestigation, testsWithChangesOf, untestedChange, untestedText, shortSha, secretFiles, secretsLeftText, onlySecretsQuestion, nameList, isPlainRelPath, SCRATCH_DIR, movedText, tryLabel, tryEntry, taskWasResult, type FailReason, withHistory, findRole, roleOf, isProseRole, notProse, notProseText, docsOnly, PROSE_TESTS_SKIPPED, PROSE_DOCS_CHECKS } from '../board'
import { loadRoles } from './roles'
import { gitOk, git, worktreeDir, asSymcc, taskBranch, branchExists, scratchOn } from './git'
import { S, changesCache } from './state'
import type { Host } from '../host'
import { change, load, now, path, safeWrite } from './store'
import { timed } from './slow-log'
import { inMergeLine, type TurnLimit } from './merge-line'
import { tellLead } from './tell'
import { logQueue } from './evidence'
import { ranOutOfTime, limitMinutes, timedOutDetail, timedOutHead } from '../core/test-timeout'
import { PASSED_TREES_FILE, parsePassedTrees, treePassed, addPassedTree, passedTreesText, isTreeId, testsSkippedText } from '../core/passed-trees'

// ---------------- a task's changes, for review ----------------

/** The changes of a task: from where its work branch left the branch it merges into (the merge base) to the branch's tip. */
export const diffRange = (target: string, t: Pick<SymccTask, 'id' | 'branch'>) => `${target}...${taskBranch(t)}`

export function gitDiff($: Host, target: string, t: SymccTask, opts: string[], file = ''): Promise<string> {
  const key = `${t.id}|${t.updated_at}|${target}|${opts.join(' ')}|${file}`
  let p = changesCache.get(key)
  if (!p) {
    if (changesCache.size > 50) changesCache.clear()
    p = gitOk($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', ...opts, diffRange(target, t), ...(file ? ['--', file] : [])])
    changesCache.set(key, p)
    p.catch(() => changesCache.delete(key))
  }
  return p
}

/**
 * The files the owner changed by hand in task `t`'s folder `dir` since it went to review:
 * uncommitted changes (new files too), and the files of commits newer than the reviewed one
 * (see reviewedCommit). Sorted, no repeats; the board folder is skipped.
 */
export async function ownerEdits($: Host, t: SymccTask, dir: string): Promise<string[]> {
  const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], dir)
  if (st.exitCode !== 0) throw new Error(`git status: ${(st.stderr || st.stdout).trim().slice(0, 300)}`)
  // Secret-looking files (see secretFiles) never merge, so they are not edits that count: a file a check left out stays
  // in the folder, and must not show in the task's diff as the owner's edit or make approve retest. Deleting one still counts.
  const files = parseStatusZ(st.stdout).filter(e => !leftOutKind(e)).map(e => e.path)
  const seen = reviewedCommit(t)
  if (seen) {
    const head = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
    if (head && head !== seen) {
      const d = await git($, ['diff', '--name-only', '--no-renames', '-z', `${seen}..${head}`], dir)
      files.push(...(d.exitCode === 0 ? d.stdout.split('\0').filter(Boolean) : [`(commits after ${shortSha(seen)})`]))
    }
  }
  const skip = S.N.dir
  return [...new Set(files)].filter(f => f !== skip && !f.startsWith(`${skip}/`)).sort()
}

/**
 * Task `t`'s changes as its folder has them now, uncommitted edits included, against where it
 * left the target branch. New files the owner added are marked "intent to add" (git add -N) so
 * the diff shows them; approve commits them anyway. `edits`: see ownerEdits. With no folder or
 * no edits, this is the branch's diff (gitDiff, cached).
 */
export async function folderDiff($: Host, target: string, t: SymccTask, opts: string[], file = ''): Promise<{ text: string; edits: string[] }> {
  const dir = worktreeDir(t.id)
  const edits = (await $.fs.exists(`${dir}/.git`)) ? await ownerEdits($, t, dir) : []
  if (!edits.length) return { text: await gitDiff($, target, t, opts, file), edits }
  const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], dir)
  const entries = parseStatusZ(st.stdout)
  const fresh = entries.filter(e => e.code === '??' && !leftOutKind(e)).map(e => e.path)
  if (fresh.length) await git($, ['add', '-N', '--', ...fresh], dir)
  // secret-looking files left in the folder are never shown: they are not part of what merges
  const hide = entries.filter(leftOutKind).map(e => `:(exclude,literal)${e.path}`)
  const paths = file ? [file, ...hide] : hide
  const base = await gitOk($, ['merge-base', `refs/heads/${target}`, 'HEAD'], dir)
  const text = await gitOk($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', ...opts, base, ...(paths.length ? ['--', ...paths] : [])], dir)
  return { text, edits }
}

/** Whether a `git status` entry is a secret-looking file (see secretFiles) that is there, not deleted: one a check leaves out of a task's change. */
const leftOutKind = (e: { code: string; path: string }) => !e.code.includes('D') && secretFiles([e.path]).length > 0

/** The files a task changed, with +/- line counts, as its folder has them now (see folderDiff); the owner's edited files are marked. */
export async function changedFiles($: Host, target: string, t: SymccTask): Promise<DiffFile[]> {
  const d = await folderDiff($, target, t, ['--stat=1000,800'])
  return parseDiffStat(d.text).map(f => (d.edits.includes(f.file) ? { ...f, edited: true } : f))
}

/**
 * The diff of a task's changes (all files, or just `file`) as its folder has them now, against
 * the merge base. When the owner's edits are in it, it starts with a line saying so (YOUR_EDITS).
 */
// A function declaration, not an arrow: the plugin loader follows $ past an import only into one.
export async function changesText($: Host, target: string, t: SymccTask, file = '') {
  const d = await folderDiff($, target, t, [], file)
  const mine = d.edits.length && d.text.trim() && (!file || d.edits.includes(file))
  return mine ? `${YOUR_EDITS}\n${d.text}` : d.text
}

/**
 * What checking (and maybe merging) a task's work came to; `untested`: the note "T-3 changed code but no test" when
 * the setting tests_with_changes flagged it (see untestedChange); `review`: the checks passed and it now waits for the owner;
 * `blocked`: everything passed, only the owner's files on the target branch are in the way of the merge (nothing moved).
 * The checker setting (see app/checker.ts): `checker`: the checker found problems (its report is `testOutput`);
 * `noVerdict`: why the checker gave none (then it waits for review after the tests); `again`: the checker was stopped before
 * its verdict or couldn't start yet, so nothing joined the merge line and the task stays in its checker step for a new checker.
 * `secrets`: changed files whose names look like secrets (see secretFiles), left out of the commit and merge but kept in the task's folder;
 * `ask`: the change was only such files, so nothing merged and the task waits for the owner with this question.
 * `timedOut`: a test command was stopped by its time limit (these minutes); it fails like a failing test, with its
 * output in `testOutput` (T-547), only its note says so (see settle).
 */
export type CheckResult = { ok: boolean; detail: string; reason?: FailReason; earlier?: boolean; timedOut?: number; command?: string; conflict?: boolean; testOutput?: string; review?: boolean; merged?: string; notes?: string[]; blocked?: Blockers; untested?: string; size?: ChangeSize; checker?: boolean; again?: boolean; noVerdict?: string; secrets?: string[]; ask?: string; gone?: boolean; moved?: boolean }

/** T-733: how many times one try's branch goes back into the merge line for each reason (main moved by hand, a reload cut its tests off), so it can't loop. */
export const AGAIN_MAX = 2

/** T-733: the history line (after "try N: ") when main moved by hand during the merge and the same branch is tested and merged again. */
export const MOVED_AGAIN = 'main moved by hand; testing again'

/** T-733: the history line (after "try N: ") when a reload cut off a task's test or merge and the same branch is tested and merged again. */
export const RELOAD_AGAIN = 'tests cut off by a reload; testing again'

/** T-733: how many times task `t`'s current try already went back into the merge line for `why` (MOVED_AGAIN or RELOAD_AGAIN), from its history. */
export const againsThisTry = (t: Pick<BoardTask, 'history' | 'role' | 'attempts'>, why: string) => (t.history ?? []).filter(h => h.text === `${tryLabel(t)}: ${why}`).length

/** T-733: writes task `t`'s history line for going back into the merge line (`why`), while it is still the same try. Never throws. */
export async function noteAgain($: Host, t: Pick<SymccTask, 'id' | 'status' | 'attempts'>, why: string) {
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts) return x
    return patchTask(x, t.id, { history: withHistory(cur.history, now(), tryEntry(cur, 'step', why)) }, now())
  }).catch(() => undefined)
}

/** T-440: the branch the task merges into (`target`) was deleted while it was checked: nothing merged; the caller makes the task wait with the "branch is gone" question (waitIfBranchGone). */
export const goneResult = (target: string): CheckResult => ({ ok: false, gone: true, reason: 'notmerged', detail: `not merged: branch ${target} is gone` })

/**
 * The checker setting (T-551): what the checker, run after the prep step and before the task joins the merge line
 * (checkAndMerge's `first`), came to. undefined: the task joins the line as usual (the checker said OK, or this change
 * skips it); `noVerdict`: it joins the line, but stops for review after the tests (the checker gave no verdict, and why);
 * `result`: the check ends here with it, and the task never joins the line (problems found, stopped, or a new checker starts).
 */
export type BeforeLine = { result: CheckResult } | { noVerdict: string } | undefined

/** How checkAndMerge runs: 'finish' (a worker just finished), 'approve' (the owner approved), 'merge' (finished work that waited only for the owner's files is merged again, see BoardTask.live?.merge_wait). */
export type CheckMode = 'finish' | 'approve' | 'merge'

/**
 * Commit the worker's changes, check scope (on a worker's try, files outside the task are undone on the branch, see undoOutOfScope; on approve they are kept), bring in the latest of the task's branch (intoOf), test, then move that branch forward.
 * `mode` 'finish' (a worker just finished): when the task needs review (see needsReview), stop
 * after the tests, before merging, and return `review`. 'approve' (the owner approved a task in
 * review): the same checked merge, but the tests run again only if main had to be merged in,
 * or when `retest` (the owner edited files in the task's folder since review, see ownerEdits).
 * 'merge' is the same as 'approve', for finished work whose merge waited only for the owner's files.
 * `stop` is asked after each test and just before the merge: when it returns a reason (the task
 * was dropped or paused meanwhile), nothing is merged and that reason is returned.
 * Every merge takes its turn in the project-wide merge line (inMergeLine, app/merge-line.ts): at its turn, in one go, it
 * catches up with the target branch, tests and moves the branch. When the branch still moved before ours could move it
 * (the owner committed to it by hand), nothing is merged: a worker's finished work ('finish') puts the same branch back
 * in the line to test again, at most AGAIN_MAX times per try; after that, or in the other modes, the turn fails.
 * `release`: settles when the caller gave this check up as stuck, so the tasks behind it in line stop waiting for it.
 * `limit`: the caller's time limit, run only during the task's turn in the line (see TurnLimit): waiting in line doesn't count.
 * `first`: the checker step (see BeforeLine and app/checker.ts), run with the changed files once the prep step passed
 * (commit, secrets, scope) and before the task joins the merge line, outside it, so checkers of several tasks run side by side.
 */
export async function checkAndMerge($: Host, t: SymccTask, dir: string, b: Board, mode: CheckMode = 'finish', made: string[] = [], stop: () => string | undefined = () => undefined, retest = false, release?: Promise<unknown>, limit?: TurnLimit, first?: (changed: readonly string[]) => Promise<BeforeLine>): Promise<CheckResult> {
  const stopped = (): CheckResult | undefined => {
    const why = stop()
    return why ? taskWasResult(why) : undefined
  }
  // the branch this task merges into: the one checked out when it was made
  const target = intoOf(t)
  await markStep($, t, 'prep', stopped)
  // T-1053: a worker may change git in its own folder; a rebase or bisect it left unfinished is ended first, so the
  // folder is on the task's branch again and symcc's commit lands there
  const onBranch = await backOnBranch($, dir, taskBranch(t))
  if (onBranch) return { ok: false, reason: 'other', detail: onBranch }
  // T-1053: a merge or cherry-pick (revert, am) it left stopped on a conflict is aborted, so no conflict markers get
  // committed; one it resolved but did not commit is finished by symcc's commit below
  const unfinished = await endUnfinished($, dir)
  if (unfinished) return { ok: false, reason: 'other', detail: unfinished }
  // T-1053: the worker's own commits of this try (a commit, a merge of another branch), saved with the try's commits
  const own = await workerCommits($, t, dir, target)
  made.push(...own)
  // The worker's throwaway folder (T-456) is kept out by its info/exclude line. It is not named in the add: git add
  // fails on a pathspec naming an ignored path (T-477). As a second safeguard, anything under it that still got staged
  // is unstaged below, but not where the project keeps files there in git (scratchOn false): those are staged as usual.
  const add = await git($, ['add', '-A', '--', '.'], dir)
  if (add.exitCode !== 0) return { ok: false, reason: 'other', detail: `symcc could not stage the work (git add): ${gitFailText(add)}` }
  // Files whose names look like secrets (.env, *.pem, *.key, id_rsa, ...) are taken out of what is staged
  // before the commit: they stay in the folder, but never reach a commit or the target branch.
  // Deletions are kept (--diff-filter=d): removing such a file from the project is allowed.
  const staged = await git($, ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=d', '-z'], dir)
  if (staged.exitCode !== 0) return { ok: false, reason: 'other', detail: `symcc could not list the staged work (git diff --cached): ${gitFailText(staged)}` }
  const stagedNames = staged.stdout.split('\0').filter(Boolean)
  const left = secretFiles(stagedNames)
  if (await scratchOn($, dir)) {
    const inScratch = stagedNames.filter(f => f.startsWith(`${SCRATCH_DIR}/`))
    const why = await unstage($, dir, inScratch)
    if (why) return { ok: false, reason: 'other', detail: `symcc could not leave out the worker's ${SCRATCH_DIR}/ folder: ${why}` }
  }
  const unstaged = await unstage($, dir, left)
  if (unstaged) return { ok: false, reason: 'other', detail: `symcc could not leave out files that look like secrets (${nameList(left)}): ${unstaged}` }
  const before = made.length
  let committed = await commitTry($, t, dir, made)
  // T-1053: the worker committed everything itself: an empty commit of symcc's for this try still ends the branch, so
  // its tip names the task and try (a reload finds the try merged, see alreadyMerged; the task page reads its commits)
  if (!committed && own.length && made.length === before) committed = await commitTry($, t, dir, made, undefined, true)
  if (committed) return { ok: false, reason: 'other', detail: `symcc could not commit the work: ${committed}` }
  if (!(await branchExists($, target))) return goneResult(target)
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  let head = await gitOk($, ['rev-parse', 'HEAD'], dir)
  const base = (await git($, ['merge-base', main, head])).stdout.trim() || main
  let changed = await changedSince($, base, head)
  // Secret-looking files in any of the branch's commits (the worker committed them, or an earlier try did),
  // even ones a later commit deleted again: the branch's work is made one commit again without them,
  // so they are not in the history that merges (a fast-forward would bring in every commit as it is).
  // Only the ones still there at the end are taken out of the new commit (and reported); a deletion
  // stays a deletion (commits that only delete such a file are not counted, see above).
  const inHistory = secretFiles(await touchedSince($, base, head, true))
  const inBranch = secretFiles(await changedSince($, base, head, true))
  if (inHistory.length || inBranch.length) {
    const why = await dropFromBranch($, t, dir, base, inBranch, made)
    if (why) return { ok: false, reason: 'other', detail: `symcc could not take files that look like secrets out of the task's branch (${nameList([...new Set([...inHistory, ...inBranch])].sort())}): ${why}` }
    head = await gitOk($, ['rev-parse', 'HEAD'], dir)
    changed = await changedSince($, base, head)
    left.push(...inBranch)
  }
  const secrets = [...new Set(left)].sort()
  // T-1080: how big the work is, saved on the task with this try's outcome (the merge turn measures it again with main merged in)
  const size0 = await sizeOf($, base, head)
  // A merge removes the task's folder afterwards (git worktree remove --force deletes untracked files too),
  // so on a merge the left-out files are first moved out of it to keepLeftOut's folder; otherwise they stay in the folder.
  const withSecrets = async (r: CheckResult): Promise<CheckResult> => {
    if (size0 && !r.size) r = { ...r, size: size0 }
    if (!secrets.length) return r
    const where = r.ok && r.merged ? await keepLeftOut($, t.id, dir, secrets) : undefined
    return { ...r, secrets, detail: `${r.detail}; ${secretsLeftText(secrets, where)}` }
  }
  if (!changed.length) {
    // Nothing new, but this task's own work is already on the target branch (an earlier try merged
    // it and a reload sent the task back): it is done, not failed. Checked first: files an earlier try
    // left out as secrets are still in the folder then, and must not turn this into a question.
    if (await onTarget($, t.id, head, target)) return withSecrets({ ok: true, merged: head, earlier: true, detail: `already merged into ${target} (${shortSha(head)}) by an earlier try; nothing new to merge` })
    if (secrets.length) {
      const ask = onlySecretsQuestion(t.id, secrets)
      // Nothing merges: settle makes the task wait for the owner with the question.
      return { ok: false, secrets, ask, detail: `not merged: ${secretsLeftText(secrets)}, and the task changed nothing else` }
    }
    return { ok: false, reason: 'nochange', detail: 'the worker made no change' }
  }
  // T-1053: every file any commit of the branch changed counts, not only its net change: a worker may merge another
  // branch in and then delete its file outside the task, and that branch's commits would still reach the target
  const touched = [...new Set([...changed, ...(await touchedSince($, base, head))])]
  const bad = outOfScope(touched, t.files, S.N.dir)
  if (bad.length) {
    // On approve the owner's edits stay in the folder: once the files are allowed, approving again merges them.
    if (mode !== 'finish') return withSecrets({ ok: false, reason: 'scope', detail: outOfScopeText(bad, t.files) })
    const undo = await undoOutOfScope($, t, dir, base, bad, made)
    return withSecrets({ ok: false, reason: 'scope', detail: outOfScopeText(bad, t.files, !undo) + undo })
  }
  // T-900: a task whose role says code: false may only change prose (the checker's strict rule): anything else fails
  // the scope check the same way, so such a role can never merge code; and its prose-only change skips the tests
  const role = findRole(await loadRoles($).catch(() => S.roles), roleOf(t))
  const prose = isProseRole(role)
  const code = prose ? notProse(touched) : []
  if (code.length) {
    if (mode !== 'finish') return withSecrets({ ok: false, reason: 'scope', detail: notProseText(role!.name, code) })
    const undo = await undoOutOfScope($, t, dir, base, code, made)
    return withSecrets({ ok: false, reason: 'scope', detail: notProseText(role!.name, code, !undo) + undo })
  }
  // The checker setting: the checker looks at the change before it joins the line; the line's tests run once, after it
  const pre = first ? await first(changed) : undefined
  if (pre && 'result' in pre) return withSecrets(pre.result)
  const noVerdict = pre?.noVerdict
  // One merge line for the whole project (inMergeLine): only the task at its front catches up, tests and moves its branch.
  // So the branch can only move under it by hand (the owner committed to it meanwhile): then the same branch is tested
  // again (T-733, below), at most AGAIN_MAX times per try; only after that does the turn fail as one normal try.
  // The time limit runs only during its own turn (each task in front has its own limit and `release`, so the line keeps moving).
  const turn = () => inMergeLine<CheckResult>($, t.id, refresh => upToDateTestMove($, t, dir, b, mode, made, stopped, retest, target, head, changed, refresh, noVerdict, prose), {
    t,
    stopped,
    ...(release ? { release } : {}),
    ...(limit ? { limit } : {}),
  })
  let r = await turn()
  // T-733: main moved under a worker's finished work only by a commit made outside the board: the same branch goes
  // back into the merge line (catch up, test, merge) instead of failing the try, at most AGAIN_MAX times per try
  if (r.moved && mode === 'finish') {
    const cur = find(await load($).catch(() => b), t.id) ?? t
    let left = AGAIN_MAX - againsThisTry(cur, MOVED_AGAIN)
    while (r.moved && left-- > 0 && !stopped()) {
      await noteAgain($, t, MOVED_AGAIN)
      r = await turn()
    }
  }
  // T-660: the turn's outcome goes to the evidence file (in the background)
  logQueue($, t.id, Number(t.attempts) || 0, r)
  return withSecrets(r)
}

/**
 * Moves the secret-looking `files` (left out of task `id`'s merge) from its folder `dir` to
 * <root>/<board folder>/left-out/<id>/ (the board folder is never committed; left-out/ is made for the owner only, mode 700),
 * since the folder is removed after the merge. Returns where they are now, for the merge result.
 */
async function keepLeftOut($: Host, id: string, dir: string, files: readonly string[]): Promise<string> {
  const rel = `${S.N.dir}/left-out/${id}`
  const gone = "not kept: the task's folder is removed after the merge"
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !S.root) return gone
  const top = `${S.root}/${S.N.dir}/left-out`
  const mk = await $.run(['mkdir', '-p', '-m', '700', top])
  if (mk.exitCode !== 0) return gone
  // never committed, even in a repo whose .gitignore doesn't list the board folder
  if (!(await $.fs.exists(`${top}/.gitignore`))) await $.fs.write(`${top}/.gitignore`, '*\n').catch(() => undefined)
  const moved: string[] = []
  for (const f of files) {
    if (!isPlainRelPath(f)) continue
    const to = `${top}/${id}/${f}`
    const md = await $.run(['mkdir', '-p', to.slice(0, to.lastIndexOf('/'))])
    if (md.exitCode !== 0) continue
    if ((await $.run(['mv', '-f', `${dir}/${f}`, to])).exitCode === 0) moved.push(f)
  }
  if (!moved.length) return gone
  return moved.length === files.length ? `moved to ${rel}/, since the task's folder is removed after the merge` : `only ${moved.join(', ')} moved to ${rel}/; the rest was ${gone}`
}

/** The files changed from commit `base` to commit `head` (`noDeleted`: files deleted there are not listed; -z: names come through as they are; without it git quotes and escapes unusual ones, e.g. "caf\303\251.md"). */
async function changedSince($: Host, base: string, head: string, noDeleted = false): Promise<string[]> {
  const d = await git($, ['diff', '--name-only', '--no-renames', ...(noDeleted ? ['--diff-filter=d'] : []), '-z', `${base}..${head}`])
  if (d.exitCode !== 0) throw new Error(`git diff --name-only: ${(d.stderr || d.stdout).trim().slice(0, 300)}`)
  return d.stdout.split('\0').filter(Boolean)
}

/**
 * Every file added or changed by any single commit from `base` to `head` (not just the net change: a file
 * added and later deleted again is listed too, and so is a file a commit only deletes, unless `noDeleted`);
 * a merge commit lists the files it changed against every parent (--cc: what the merge itself added, T-1053), not
 * the ones it only brought in from one side (those are listed by their own commits).
 */
async function touchedSince($: Host, base: string, head: string, noDeleted = false): Promise<string[]> {
  const d = await git($, ['log', '--cc', '--format=', '--name-only', '--no-renames', ...(noDeleted ? ['--diff-filter=d'] : []), '-z', `${base}..${head}`])
  if (d.exitCode !== 0) throw new Error(`git log --name-only: ${(d.stderr || d.stdout).trim().slice(0, 300)}`)
  return [...new Set(d.stdout.split('\0').map(f => f.replace(/^\n+/, '')).filter(Boolean))]
}

/** Takes `files` out of what is staged in folder `dir` (back to how HEAD has them), leaving them on disk. Returns '' when done, or git's error. */
async function unstage($: Host, dir: string, files: readonly string[]): Promise<string> {
  // :(literal): names are taken as they are, never as patterns.
  for (let i = 0; i < files.length; i += 100) {
    const r = await git($, ['restore', '--staged', '--', ...files.slice(i, i + 100).map(f => `:(literal)${f}`)], dir)
    if (r.exitCode !== 0) return gitFailText(r)
  }
  return ''
}

/**
 * Secret-looking `files` are in the commits of task `t`'s branch since `base` (the merge base): the branch
 * goes back to `base` with its work kept staged (git reset --soft), the files are taken out of it (kept on
 * disk), and the rest is committed again as one commit of this try. `files` may be empty: the secret was only
 * in commits deleted again later, and the rewrite alone keeps those commits out. Returns '' when done, or why not.
 */
async function dropFromBranch($: Host, t: SymccTask, dir: string, base: string, files: readonly string[], made: string[]): Promise<string> {
  const r = await git($, ['reset', '-q', '--soft', base], dir)
  if (r.exitCode !== 0) return gitFailText(r)
  return (await unstage($, dir, files)) || (await commitTry($, t, dir, made))
}

/**
 * After a try failed the scope check: the branch's work since `base` (the merge base) is made one commit on `base`
 * again (git reset --soft), with the files outside the task (`bad`) put back to how they are at `base`, so the next
 * try in the same folder starts clean and keeps the work inside the task's files. Always one commit (T-1053): a
 * worker's merge (also a fast-forward one) may have brought in another branch's commits, which would otherwise still
 * reach the target later, and a file a commit changed and a later one undid would fail every next try's scope check.
 * Returns '' when done, or a note to add to the failure when it could not be undone.
 */
async function undoOutOfScope($: Host, t: SymccTask, dir: string, base: string, bad: string[], made: string[]): Promise<string> {
  const head = (await git($, ['rev-parse', 'HEAD'], dir)).stdout.trim()
  // only files the branch changed in the end are put back; one only a commit in between changed goes with the squash
  const net = new Set(head ? await changedSince($, base, head).catch(() => bad) : bad)
  const back = bad.filter(f => net.has(f))
  const r = await git($, ['reset', '-q', '--soft', base], dir)
  if (r.exitCode !== 0) return `. Could not undo them on the task's branch: ${gitFailText(r)}`
  // :(literal): names are taken as they are, never as patterns.
  for (let i = 0; i < back.length; i += 100) {
    const r = await git($, ['restore', `--source=${base}`, '--staged', '--worktree', '--', ...back.slice(i, i + 100).map(f => `:(literal)${f}`)], dir)
    if (r.exitCode !== 0) return `. Could not undo them on the task's branch: ${(r.stderr || r.stdout).trim().slice(0, 200)}`
  }
  const c = await commitTry($, t, dir, made, `${t.id}: undo changes outside the task`)
  return c ? `. Could not undo them on the task's branch: ${c}` : ''
}

/**
 * T-1053: the commits the worker made itself on task `t`'s branch in folder `dir` (its first-parent line since
 * `target`, oldest first): those that carry no Task line of `t`'s (symcc's own commits do) and that no earlier try
 * saved. A worker may commit and merge in its own folder; these are saved with the try's commits.
 */
async function workerCommits($: Host, t: SymccTask, dir: string, target: string): Promise<string[]> {
  const r = await git($, ['log', '--first-parent', '--reverse', '-z', '--format=%H%n%B', `refs/heads/${target}..HEAD`], dir)
  if (r.exitCode !== 0) return []
  const saved = new Set((t.runs ?? []).flatMap(x => (Array.isArray(x?.commits) ? x.commits : [])))
  return r.stdout
    .split('\0')
    .map(e => ({ sha: e.slice(0, e.indexOf('\n') < 0 ? e.length : e.indexOf('\n')).trim(), body: e.slice(e.indexOf('\n') + 1) }))
    .filter(e => /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(e.sha) && !saved.has(e.sha) && !isTaskCommit(e.body, t.id, S.N.name))
    .map(e => e.sha)
}

/**
 * T-1053: puts folder `dir` back on `branch` when the worker left it off (a rebase or bisect not finished: HEAD is
 * detached): `git bisect reset` and `git rebase --abort` (the branch as it was before that rebase). '' when it is on
 * the branch (or git can't tell), else why not.
 */
async function backOnBranch($: Host, dir: string, branch: string): Promise<string> {
  const ref = `refs/heads/${branch}`
  const off = async () => {
    const r = await git($, ['symbolic-ref', '-q', 'HEAD'], dir)
    return r.exitCode === 1 || (r.exitCode === 0 && !!r.stdout.trim() && r.stdout.trim() !== ref)
  }
  if (!(await off())) return ''
  await git($, ['bisect', 'reset'], dir)
  if (await off()) await git($, ['rebase', '--abort'], dir)
  return (await off()) ? `the worker left its folder off the task's branch ${branch} (HEAD is elsewhere), so symcc could not commit the work there` : ''
}

/**
 * T-1053: ends a merge, cherry-pick, revert or `git am` the worker left stopped on a conflict in folder `dir`, so its
 * conflict markers are never staged and committed: while files are still unmerged, each is aborted, which puts the
 * files back as they were before it; files still unmerged with nothing to abort (`cherry-pick -n`, `merge --squash`)
 * are reset with `git reset --merge`. One the worker fully resolved but did not commit is kept: symcc's own commit
 * then finishes it (a merge becomes a merge commit), as the merge_main prompt allows. A `git am` is always aborted
 * (a commit does not end it). '' when fine, else why symcc can't commit (files still unmerged after that).
 */
async function endUnfinished($: Host, dir: string): Promise<string> {
  const pending = async (ref: string) => {
    const r = await git($, ['rev-parse', '-q', '--verify', ref], dir)
    return r.exitCode === 0 && !!r.stdout.trim()
  }
  const unmerged = async () => {
    const r = await git($, ['ls-files', '-u', '-z'], dir)
    return r.exitCode === 0 && !!r.stdout.trim()
  }
  if (await unmerged()) {
    for (const [ref, cmd] of [['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert']] as const) {
      if (await pending(ref)) await git($, [cmd, '--abort'], dir)
    }
    // a conflict with nothing to abort (cherry-pick -n, merge --squash, revert -n): put the files back to HEAD's, so
    // the folder isn't stuck for this try and every later one
    if (await unmerged()) await git($, ['reset', '-q', '--merge'], dir)
  }
  const apply = (await git($, ['rev-parse', '--path-format=absolute', '--git-path', 'rebase-apply'], dir)).stdout.trim()
  if (apply && (await $.fs.exists(apply).catch(() => false))) await git($, ['am', '--abort'], dir)
  if (await unmerged()) return 'the worker left files with unresolved merge conflicts in its folder, so symcc did not commit them'
  return ''
}

/** Git's error in a few words: the first lines of its error output, plus a hint when it is about commit signing. */
function gitFailText(r: { stdout: string; stderr: string }): string {
  const lines = `${r.stderr}\n${r.stdout}`.split('\n').map(l => l.trim()).filter(Boolean)
  const text = lines.slice(0, 3).join(' | ').slice(0, 300) || 'git failed'
  const signing = /gpg|signing|failed to sign|ssh-keygen/i.test(r.stderr)
  return signing ? `${text} (commit signing failed: run \`git config commit.gpgsign false\` in this repo, or fix the signer so it works without a terminal)` : text
}

/**
 * Commits what is staged in task `t`'s folder `dir` as symcc (no hooks), with the task's message
 * (see commitMessage; `subject` replaces its first line). Nothing to commit is fine (exit 1, HEAD
 * unchanged); only a new HEAD counts as a commit of this try and is added to `made`.
 * Returns '' when fine, or git's error when the commit failed for another reason (e.g. signing).
 */
async function commitTry($: Host, t: SymccTask, dir: string, made: string[], subject?: string, empty = false): Promise<string> {
  const before = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
  // The message ends with trailers (task, origin, why, try); see commitMessage. `empty`: commit even with nothing staged.
  const c = await git($, [...asSymcc(), 'commit', '-q', '--no-verify', ...(empty ? ['--allow-empty'] : []), '-m', commitMessage(t, { name: S.N.name, ...(subject ? { subject } : {}), ...((t as BoardTask).done ? { done: (t as BoardTask).done } : {}) })], dir)
  const head = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
  if (head && head !== before) {
    made.push(head)
    return ''
  }
  if (c.exitCode === 0 || /nothing to commit|nothing added to commit|no changes added to commit/i.test(`${c.stdout}\n${c.stderr}`)) return ''
  return gitFailText(c)
}

/**
 * Says on the board which step of checking task `t` is going on now (Live.checking), so the list
 * shows it; only while the task is still as it was when the check began and the check was not
 * stopped or given up; its words are built when drawing (shownNote). Never fails the check: a board that can't be written only misses the word.
 */
export async function markStep($: Host, t: SymccTask, step: TurnStep, stopped: () => CheckResult | undefined) {
  if (stopped()) return
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts || stopped()) return x
    const phase = step === 'checker' ? 'checker' as const : undefined
    if (cur.live?.checking?.step === step && cur.live.phase === phase) return x
    return patchTask(x, t.id, { live: { checking: { step, at: now() }, ...(cur.status === 'doing' ? { phase } : {}) } }, cur.updated_at)
  }).catch(() => undefined)
}

/**
 * One go at the end of checkAndMerge, the task's merge turn (it is at the front of the merge line): bring in the latest
 * `target`, test, move `target` forward. `refresh` dates the task's place in line again (before each test command, so a
 * long run is never taken as stale). `noVerdict`: the checker gave no verdict (why), so after the tests it stops for review.
 */
async function upToDateTestMove($: Host, t: SymccTask, dir: string, b: Board, mode: CheckMode, made: string[], stopped: () => CheckResult | undefined, retest: boolean, target: string, head: string, changed: string[], refresh: () => Promise<void>, noVerdict?: string, prose = false): Promise<CheckResult> {
  // First, before touching the folder: a step stopped or given up while it waited in the merge
  // line does nothing, as the next try may already be using the folder.
  const early = stopped()
  if (early) return early
  // T-440: checked again here, as the task may have waited long in the merge line
  if (!(await branchExists($, target))) return goneResult(target)
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const tip = await gitOk($, ['rev-parse', 'HEAD'], dir)
  let candidate = tip
  // the catch-up with the target shows as "test" (owner's choice, Q-30), so the Stage line only moves on: queue → test → merge
  await markStep($, t, 'testing', stopped)
  if ((await git($, ['merge-base', '--is-ancestor', main, tip])).exitCode !== 0) {
    const m = await timed($, `${t.id} catch up`, () => git($, [...asSymcc(), 'merge', '--no-edit', '--no-verify', '-m', commitMessage(t, { name: S.N.name, subject: `${t.id}: bring up to date with ${target}`, ...((t as BoardTask).done ? { done: (t as BoardTask).done } : {}) }), main], dir))
    if (m.exitCode !== 0) {
      await git($, ['merge', '--abort'], dir)
      // Only a real conflict is one: any other failure (e.g. signing the merge commit) is git's error, and retrying on conflicts can't help it.
      if (/^CONFLICT|fix conflicts|unmerged/im.test(`${m.stdout}\n${m.stderr}`)) return { ok: false, reason: 'clash', detail: `conflicts with the latest ${target}`, conflict: true }
      return { ok: false, reason: 'other', detail: `symcc could not bring the work up to date with ${target} (git merge): ${gitFailText(m)}` }
    }
    candidate = await gitOk($, ['rev-parse', 'HEAD'], dir)
    made.push(candidate)
  }
  let testsRun = mode === 'finish' || candidate !== head || retest
  // T-900: a prose-only role's change (it passed the scope check above, so every file is prose) runs no test command;
  // T-908: unless the board has docs_test_commands, which then run instead of test_commands
  const proseOnly = prose && docsOnly(changed)
  const docsCmds = proseOnly ? (b.docs_test_commands ?? []) : []
  const docsRun = docsCmds.length > 0
  const cmds = docsRun ? docsCmds : b.test_commands
  const proseSkip = proseOnly && !docsRun && b.test_commands.length > 0
  if (proseSkip) testsRun = false
  // T-527: the code about to be tested (its git tree, the target merged in). When this same tree already passed
  // these same test commands, the run is skipped. Unknown (git could not tell): the tests run as usual.
  const tree = testsRun && cmds.length ? await testedTree($, candidate, dir) : ''
  const skipped = !!tree && treePassed(await readPassedTrees($), tree, cmds)
  if (skipped) testsRun = false
  if (testsRun && cmds.length) {
    // Only this task's tests run now: it holds the front of the merge line.
    const failed = await (async (): Promise<CheckResult | undefined> => {
      await markStep($, t, 'testing', stopped)
      for (const cmd of cmds) {
        await refresh()
        let thrown: string | undefined
        const r = await timed($, `${t.id} test run`, () => $.run(['/bin/sh', '-c', cmd], { cwd: dir, timeoutMs: testTimeoutMs(b) })).catch((e: Error) => ((thrown = String(e?.message ?? e)), { exitCode: 1, stdout: '', stderr: thrown }))
        // T-547: stopped by its time limit: it fails like a failing test, its output goes to a new try (see settle)
        if (r.exitCode !== 0 && ranOutOfTime(r, thrown)) {
          const min = limitMinutes(testTimeoutMs(b))
          return stopped() ?? { ok: false, reason: 'timeout', timedOut: min, command: cmd, detail: timedOutDetail(cmd, min), testOutput: testTail(`${timedOutHead(cmd, min)}\n${r.stdout}\n${r.stderr}`) }
        }
        if (r.exitCode !== 0) {
          const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join(' | ').slice(0, 700)
          return stopped() ?? { ok: false, reason: 'tests', command: cmd, detail: `tests failed: \`${cmd}\` (exit ${r.exitCode}). ${tail}`, testOutput: testTail(`$ ${cmd} (exit ${r.exitCode})\n${r.stdout}\n${r.stderr}`) }
        }
        const s = stopped()
        if (s) return s
      }
      // all passed: remembered during the turn, so two sessions never write the file at once; a failed, timed-out or stopped run never is
      if (tree) await recordPassedTree($, tree, cmds)
      return undefined
    })()
    if (failed) return failed
  }
  const passed = proseSkip ? `; ${PROSE_TESTS_SKIPPED}` : skipped ? `; ${testsSkippedText(tree)}` : docsRun ? `; ${PROSE_DOCS_CHECKS}` : '; tests passed'
  // tests_with_changes: a change task's work that edits code but no test file is flagged (not on the owner's approve).
  const flag = testsWithChangesOf(b)
  // T-1080: the size of what merges (or waits for review): the target as it is now against the tested tip
  const size = await sizeOf($, main, candidate)
  const untested = mode !== 'approve' && flag !== 'off' && !isInvestigation(t) && untestedChange(changed) ? untestedText(t.id) : ''
  const flagged = untested ? { untested } : {}
  // the checker gave no verdict (it ran before the line): the task waits for the owner's review, nothing merged
  if (noVerdict) return { ok: true, review: true, noVerdict, ...(size ? { size } : {}), ...flagged, detail: `checks passed, but ${noVerdict}; ready for review, nothing merged yet` }
  if (mode === 'finish' && (needsReview(b, t) || (untested && flag === 'review'))) return { ok: true, review: true, ...(size ? { size } : {}), ...flagged, detail: `checks passed${cmds.length || proseSkip ? passed : '; no test command set'}; ready for review, nothing merged yet${untested ? ` (${untested})` : ''}` }
  // Move main forward (compare-and-swap). If the person has main checked out, update their
  // files too, but never over their uncommitted changes, untracked or ignored files in files the merge changes.
  const s = stopped()
  if (s) return s
  // T-440: the tests can take many minutes; the branch may have been deleted meanwhile
  if (!(await branchExists($, target))) return goneResult(target)
  await markStep($, t, 'merging', stopped)
  const current = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
  const moved = await timed($, `${t.id} merge`, () => moveTarget(args => git($, args), { target, id: t.id, from: main, to: candidate, checkedOut: current === target, note: `${S.N.name} ${t.id}`, skipDir: S.N.dir, action: mode === 'approve' ? 'approve' : 'retry' }))
  if (!moved.ok && !(await branchExists($, target))) return goneResult(target)
  if (!moved.ok) return { ok: false, detail: moved.detail, ...(moved.reason ? { reason: moved.reason } : {}), ...(moved.blocked ? { blocked: moved.blocked } : {}), ...(moved.detail === movedText(target) ? { moved: true } : {}) }
  const tests = !cmds.length && !proseSkip ? '; no test command set' : skipped || testsRun || proseSkip ? passed : ''
  // Research notes the merge added or changed (not deleted): asked of git only when the work touched docs/research/.
  let notes: string[] = []
  if (researchNotes(changed).length) {
    const n = await git($, ['diff', '--name-only', '--no-renames', '-z', '--diff-filter=AM', main, candidate])
    notes = researchNotes(n.exitCode === 0 ? n.stdout.split('\0').filter(Boolean) : changed)
  }
  return { ok: true, merged: candidate, ...(size ? { size } : {}), ...(notes.length ? { notes } : {}), ...flagged, detail: `merged into ${target} (${shortSha(candidate)})${mode === 'approve' ? '; approved by the owner' : ''}${tests}` }
}

/** T-1080: the size of the change from commit `from` to commit `to` (a shortstat diff); undefined when there is none or it can't be read. */
export async function sizeOf($: Host, from: string, to: string): Promise<ChangeSize | undefined> {
  const r = await git($, ['diff', '--shortstat', '--no-renames', from, to]).catch(() => null)
  return r && r.exitCode === 0 ? parseShortstat(String(r.stdout ?? '')) : undefined
}

/** T-1086: what main was before a done task's merged commit: the second parent of symcc's catch-up merge (its parents are the task's tip, then main);
 *  else the first commit down the first-parent line that is not the task's own. '' when git does not have the commit. */
export async function mergedBefore($: Host, t: Pick<SymccTask, 'id' | 'runs'>, merged: string): Promise<string> {
  // T-1096: commits the worker made itself have no Task line; the try saved them, so they count as the task's own too
  const saved = new Set((t.runs ?? []).flatMap(r => (Array.isArray(r?.commits) ? r.commits : [])))
  const own = (sha: string, msg: string) => saved.has(sha) || isTaskCommit(msg, t.id, S.N.name)
  const p = await git($, ['rev-list', '--parents', '-n', '1', merged]).catch(() => null)
  if (!p || p.exitCode !== 0) return ''
  const [, first, second] = String(p.stdout ?? '').trim().split(/\s+/)
  if (!first) return ''
  if (second) {
    // symcc's own merge commit (the task's trailer): main is its second parent. A merge made by hand on main: its first parent is main.
    const m = await git($, ['log', '-n', '1', '--format=%B', merged]).catch(() => null)
    if (m && m.exitCode === 0 && isTaskCommit(String(m.stdout ?? ''), t.id, S.N.name)) return second
    // the worker's own merge of main (saved in the runs) sits on the task's line: its first parent is the task's own commit
    if (saved.has(merged)) {
      const f = await git($, ['log', '-n', '1', '--format=%B', first]).catch(() => null)
      if (f && f.exitCode === 0 && own(first, String(f.stdout ?? ''))) return second
    }
    return first
  }
  const log = await git($, ['log', '--first-parent', '-n', '200', '--format=%H%x1f%P%x1f%B%x1e', merged]).catch(() => null)
  if (!log || log.exitCode !== 0) return first
  for (const entry of String(log.stdout ?? '').split('\x1e')) {
    const [sha, parents, msg] = entry.trim().split('\x1f')
    if (!sha) continue
    if (!own(sha, msg ?? '')) return sha
    // the task's own merge of main (symcc's catch-up, or the worker's own): main as it was then is its second parent
    const second = (parents ?? '').split(' ')[1]
    if (second) return second
  }
  return first
}

/** What a done task's page shows under Changes: its files, the commit it merged as, and what main was before it. */
export type MergedChanges = { files: DiffFile[]; error: string; merged: string; before: string }

/** T-1086: the answers kept in memory for the page (nothing is saved in the data folder); null: nothing to show. */
const mergedMemo = new Map<string, MergedChanges | null>()

/** Forgets the answers kept in memory (a plugin reload; tests). */
export function resetMergedChanges() {
  mergedMemo.clear()
}

/**
 * T-1086: a done change task's Changes: `git diff --numstat <main before> <merged commit>`, read from the commits
 * the task recorded; null for an investigation or errand, a task with no merged commit, or when git has none of it.
 */
export async function mergedChanges($: Host, t: SymccTask): Promise<MergedChanges | null> {
  if (!hasMergedChanges(t)) return null
  const merged = (t as BoardTask).merged!
  const key = `${t.id}:${merged}`
  if (mergedMemo.has(key)) return mergedMemo.get(key)!
  const before = await mergedBefore($, t, merged)
  const r = before ? await git($, ['diff', '--numstat', '--no-renames', before, merged]).catch(() => null) : null
  const files = r && r.exitCode === 0 ? parseNumstat(String(r.stdout ?? '')) : []
  const got = files.length ? { files, error: '', merged, before } : null
  // a missing commit or an empty diff is a final answer (kept); a failed git diff is tried again next time
  if (!before || r?.exitCode === 0) mergedMemo.set(key, got)
  return got
}

/** T-1086: said in place of a done task's diff when git no longer has its commits. */
export const DIFF_GONE = 'diff not available'

/** T-1086: a done task's diff (all files, or just `file`) from git: `git diff <before> <merged> -- <file>`; DIFF_GONE when git has no such commits. */
export async function mergedDiff($: Host, t: SymccTask, file = ''): Promise<string> {
  const c = await mergedChanges($, t).catch(() => null)
  if (!c) return DIFF_GONE
  const r = await git($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', c.before, c.merged, ...(file ? ['--', file] : [])]).catch(() => null)
  return r && r.exitCode === 0 ? String(r.stdout ?? '') : DIFF_GONE
}

/** T-527: the git tree id of commit `commit` (the code a test run tests), or '' when git can't tell. */
export async function testedTree($: Host, commit: string, dir: string): Promise<string> {
  const r = await git($, ['rev-parse', '-q', '--verify', `${commit}^{tree}`], dir).catch(() => null)
  const id = r && r.exitCode === 0 ? r.stdout.trim() : ''
  return isTreeId(id) ? id : ''
}

/** T-527: the trees whose test run passed (PASSED_TREES_FILE in the board folder); none when it can't be read. */
export async function readPassedTrees($: Host) {
  return parsePassedTrees(await $.fs.read(path(`${S.N.dir}/${PASSED_TREES_FILE}`)).catch(() => null))
}

/** T-527: remembers that tree `tree` passed all of `commands`. A file that can't be written only means the next run is not skipped. */
async function recordPassedTree($: Host, tree: string, commands: readonly string[]) {
  const list = addPassedTree(await readPassedTrees($), tree, commands, Date.now())
  await safeWrite($, path(`${S.N.dir}/${PASSED_TREES_FILE}`), passedTreesText(list), 'the passed trees').catch(() => undefined)
}

/** Whether commit `sha` is one of task `id`'s commits (of try `tryNo`, when given) and already on branch `target`. */
async function onTarget($: Host, id: string, sha: string, target: string, tryNo?: number): Promise<boolean> {
  if (!sha) return false
  const msg = await git($, ['log', '-1', '--format=%B', sha])
  if (msg.exitCode !== 0 || !isTaskCommit(msg.stdout, id, S.N.name, tryNo)) return false
  return (await git($, ['merge-base', '--is-ancestor', sha, `refs/heads/${target}`])).exitCode === 0
}

/**
 * The commit of task `t`'s current try that is already on the branch it merges into (the tip of its
 * work branch, when that tip was made by this try and is on that branch); null when this try's
 * work isn't merged. A task like that is done: a reload must not send it back for another try.
 */
export async function alreadyMerged($: Host, t: Pick<SymccTask, 'id' | 'branch' | 'merge_into' | 'attempts'>): Promise<string | null> {
  if (!(t.attempts > 0)) return null
  const tip = (await git($, ['rev-parse', '-q', '--verify', `refs/heads/${taskBranch(t)}`])).stdout.trim()
  return tip && (await onTarget($, t.id, tip, intoOf(t), t.attempts)) ? tip : null
}

/**
 * Saves on the board the commits a try made (on its last run) and, once merged, the commit that
 * landed on the target branch (`merged`). Read fresh inside the change, so no other write is lost.
 * A failure to save is told to the lead, never hidden; the merge itself already happened.
 */
export async function recordCommits($: Host, id: string, made: readonly string[], merged?: string, size?: ChangeSize) {
  if (!made.length && !merged && !size) return
  try {
    await change($, x => {
      const cur = find(x, id)
      if (!cur) return x
      return patchTask(x, id, { runs: addCommits(cur.runs, made), ...(merged ? { merged } : {}), ...(size ? { size } : {}) }, now())
    })
  } catch (e) {
    tellLead($, `${id}: could not save its commits on the board (${(e as Error).message.slice(0, 200)}). Commits: ${[...made, ...(merged ? [merged] : [])].join(', ')}`)
  }
}
