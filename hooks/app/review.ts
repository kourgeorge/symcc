import type { SymccTask } from '../../types'
import { type Blockers, type BoardTask, type CheckStep, type DiffFile, parseDiffStat, parseStatusZ, reviewedCommit, YOUR_EDITS, type Board, commitMessage, outOfScope, outOfScopeText, testTail, needsReview, find, patchTask, addCommits, moveTarget, researchNotes, intoOf, isTaskCommit, testTimeoutMs, isInvestigation, testsWithChangesOf, untestedChange, untestedText, shortSha, secretFiles, secretsLeftText, onlySecretsQuestion, nameList, isPlainRelPath, SCRATCH_DIR, stepNote } from '../board'
import { gitOk, git, worktreeDir, asSymcc, taskBranch, branchExists, scratchOn } from './git'
import { S, changesCache } from './state'
import type { Host } from '../host'
import { change, now, path, safeWrite } from './store'
import { inMergeLine, type TurnLimit } from './merge-line'
import { tellLead } from './tell'
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
export type CheckResult = { ok: boolean; detail: string; timedOut?: number; conflict?: boolean; testOutput?: string; review?: boolean; merged?: string; notes?: string[]; blocked?: Blockers; untested?: string; checker?: boolean; again?: boolean; noVerdict?: string; secrets?: string[]; ask?: string; gone?: boolean }

/** T-440: the branch the task merges into (`target`) was deleted while it was checked: nothing merged; the caller makes the task wait with the "branch is gone" question (waitIfBranchGone). */
export const goneResult = (target: string): CheckResult => ({ ok: false, gone: true, detail: `not merged: branch ${target} is gone` })

/**
 * The checker setting (T-551): what the checker, run after the prep step and before the task joins the merge line
 * (checkAndMerge's `first`), came to. undefined: the task joins the line as usual (the checker said OK, or this change
 * skips it); `noVerdict`: it joins the line, but stops for review after the tests (the checker gave no verdict, and why);
 * `result`: the check ends here with it, and the task never joins the line (problems found, stopped, or a new checker starts).
 */
export type BeforeLine = { result: CheckResult } | { noVerdict: string } | undefined

/** How checkAndMerge runs: 'finish' (a worker just finished), 'approve' (the owner approved), 'merge' (finished work that waited only for the owner's files is merged again, see BoardTask.merge_wait). */
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
 * (the owner committed to it by hand), nothing is merged and the turn fails as one normal try.
 * `release`: settles when the caller gave this check up as stuck, so the tasks behind it in line stop waiting for it.
 * `limit`: the caller's time limit, run only during the task's turn in the line (see TurnLimit): waiting in line doesn't count.
 * `first`: the checker step (see BeforeLine and app/checker.ts), run with the changed files once the prep step passed
 * (commit, secrets, scope) and before the task joins the merge line, outside it, so checkers of several tasks run side by side.
 */
export async function checkAndMerge($: Host, t: SymccTask, dir: string, b: Board, mode: CheckMode = 'finish', made: string[] = [], stop: () => string | undefined = () => undefined, retest = false, release?: Promise<unknown>, limit?: TurnLimit, first?: (changed: readonly string[]) => Promise<BeforeLine>): Promise<CheckResult> {
  const stopped = (): CheckResult | undefined => {
    const why = stop()
    return why ? { ok: false, detail: `not merged: the task was ${why} while it was being checked` } : undefined
  }
  // the branch this task merges into: the one checked out when it was made
  const target = intoOf(t)
  await markStep($, t, 'prep', stopped)
  // The worker's throwaway folder (T-456) is kept out by its info/exclude line. It is not named in the add: git add
  // fails on a pathspec naming an ignored path (T-477). As a second safeguard, anything under it that still got staged
  // is unstaged below, but not where the project keeps files there in git (scratchOn false): those are staged as usual.
  const add = await git($, ['add', '-A', '--', '.'], dir)
  if (add.exitCode !== 0) return { ok: false, detail: `symcc could not stage the work (git add): ${gitFailText(add)}` }
  // Files whose names look like secrets (.env, *.pem, *.key, id_rsa, ...) are taken out of what is staged
  // before the commit: they stay in the folder, but never reach a commit or the target branch.
  // Deletions are kept (--diff-filter=d): removing such a file from the project is allowed.
  const staged = await git($, ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=d', '-z'], dir)
  if (staged.exitCode !== 0) return { ok: false, detail: `symcc could not list the staged work (git diff --cached): ${gitFailText(staged)}` }
  const stagedNames = staged.stdout.split('\0').filter(Boolean)
  const left = secretFiles(stagedNames)
  if (await scratchOn($, dir)) {
    const inScratch = stagedNames.filter(f => f.startsWith(`${SCRATCH_DIR}/`))
    const why = await unstage($, dir, inScratch)
    if (why) return { ok: false, detail: `symcc could not leave out the worker's ${SCRATCH_DIR}/ folder: ${why}` }
  }
  const unstaged = await unstage($, dir, left)
  if (unstaged) return { ok: false, detail: `symcc could not leave out files that look like secrets (${nameList(left)}): ${unstaged}` }
  const committed = await commitTry($, t, dir, made)
  if (committed) return { ok: false, detail: `symcc could not commit the work: ${committed}` }
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
  const inHistory = secretFiles(await touchedSince($, base, head))
  const inBranch = secretFiles(await changedSince($, base, head, true))
  if (inHistory.length || inBranch.length) {
    const why = await dropFromBranch($, t, dir, base, inBranch, made)
    if (why) return { ok: false, detail: `symcc could not take files that look like secrets out of the task's branch (${nameList([...new Set([...inHistory, ...inBranch])].sort())}): ${why}` }
    head = await gitOk($, ['rev-parse', 'HEAD'], dir)
    changed = await changedSince($, base, head)
    left.push(...inBranch)
  }
  const secrets = [...new Set(left)].sort()
  // A merge removes the task's folder afterwards (git worktree remove --force deletes untracked files too),
  // so on a merge the left-out files are first moved out of it to keepLeftOut's folder; otherwise they stay in the folder.
  const withSecrets = async (r: CheckResult): Promise<CheckResult> => {
    if (!secrets.length) return r
    const where = r.ok && r.merged ? await keepLeftOut($, t.id, dir, secrets) : undefined
    return { ...r, secrets, detail: `${r.detail}; ${secretsLeftText(secrets, where)}` }
  }
  if (!changed.length) {
    // Nothing new, but this task's own work is already on the target branch (an earlier try merged
    // it and a reload sent the task back): it is done, not failed. Checked first: files an earlier try
    // left out as secrets are still in the folder then, and must not turn this into a question.
    if (await onTarget($, t.id, head, target)) return withSecrets({ ok: true, merged: head, detail: `already merged into ${target} (${shortSha(head)}) by an earlier try; nothing new to merge` })
    if (secrets.length) {
      const ask = onlySecretsQuestion(t.id, secrets)
      // Nothing merges: settle makes the task wait for the owner with the question.
      return { ok: false, secrets, ask, detail: `not merged: ${secretsLeftText(secrets)}, and the task changed nothing else` }
    }
    return { ok: false, detail: 'the worker made no change' }
  }
  const bad = outOfScope(changed, t.files, S.N.dir)
  if (bad.length) {
    // On approve the owner's edits stay in the folder: once the files are allowed, approving again merges them.
    if (mode !== 'finish') return withSecrets({ ok: false, detail: outOfScopeText(bad, t.files) })
    const undo = await undoOutOfScope($, t, dir, base, bad, made)
    return withSecrets({ ok: false, detail: outOfScopeText(bad, t.files, !undo) + undo })
  }
  // The checker setting: the checker looks at the change before it joins the line; the line's tests run once, after it
  const pre = first ? await first(changed) : undefined
  if (pre && 'result' in pre) return withSecrets(pre.result)
  const noVerdict = pre?.noVerdict
  // One merge line for the whole project (inMergeLine): only the task at its front catches up, tests and moves its branch.
  // So the branch can only move under it by hand (the owner committed to it meanwhile): that fails this turn as one normal try.
  // The time limit runs only during its own turn (each task in front has its own limit and `release`, so the line keeps moving).
  const r = await inMergeLine<CheckResult>($, t.id, refresh => upToDateTestMove($, t, dir, b, mode, made, stopped, retest, target, head, changed, refresh, noVerdict), {
    t,
    stopped,
    ...(release ? { release } : {}),
    ...(limit ? { limit } : {}),
  })
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
 * added and later deleted again is listed too). Commits that only delete a file don't list it (--diff-filter=d);
 * merge commits list nothing (git log's default).
 */
async function touchedSince($: Host, base: string, head: string): Promise<string[]> {
  const d = await git($, ['log', '--format=', '--name-only', '--no-renames', '--diff-filter=d', '-z', `${base}..${head}`])
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
 * After a try failed the scope check: puts the files outside the task (`bad`) on the task's branch
 * back to how they are at `base` (the merge base) and commits that, so the next try in the same
 * folder starts clean and keeps the work inside the task's files. Returns '' when done, or a note
 * to add to the failure when it could not be undone.
 */
async function undoOutOfScope($: Host, t: SymccTask, dir: string, base: string, bad: string[], made: string[]): Promise<string> {
  // :(literal): names are taken as they are, never as patterns.
  for (let i = 0; i < bad.length; i += 100) {
    const r = await git($, ['restore', `--source=${base}`, '--staged', '--worktree', '--', ...bad.slice(i, i + 100).map(f => `:(literal)${f}`)], dir)
    if (r.exitCode !== 0) return `. Could not undo them on the task's branch: ${(r.stderr || r.stdout).trim().slice(0, 200)}`
  }
  const c = await commitTry($, t, dir, made, `${t.id}: undo changes outside the task`)
  return c ? `. Could not undo them on the task's branch: ${c}` : ''
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
async function commitTry($: Host, t: SymccTask, dir: string, made: string[], subject?: string): Promise<string> {
  const before = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
  // The message ends with trailers (task, origin, why, try); see commitMessage.
  const c = await git($, [...asSymcc(), 'commit', '-q', '--no-verify', '-m', commitMessage(t, { name: S.N.name, ...(subject ? { subject } : {}) })], dir)
  const head = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
  if (head && head !== before) {
    made.push(head)
    return ''
  }
  if (c.exitCode === 0 || /nothing to commit|nothing added to commit|no changes added to commit/i.test(`${c.stdout}\n${c.stderr}`)) return ''
  return gitFailText(c)
}

/**
 * Says on the board which step of checking task `t` is going on now (BoardTask.checking), so the list
 * shows it; only while the task is still as it was when the check began and the check was not
 * stopped or given up; the prep step also says it in the note (stepNote). Never fails the check: a board that can't be written only misses the word.
 */
export async function markStep($: Host, t: SymccTask, step: CheckStep, stopped: () => CheckResult | undefined) {
  if (stopped()) return
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts || stopped() || cur.checking?.step === step) return x
    const note = stepNote(step, cur.note)
    return patchTask(x, t.id, { checking: { step, at: now() }, ...(note !== cur.note ? { note } : {}) }, cur.updated_at)
  }).catch(() => undefined)
}

/**
 * One go at the end of checkAndMerge, the task's merge turn (it is at the front of the merge line): bring in the latest
 * `target`, test, move `target` forward. `refresh` dates the task's place in line again (before each test command, so a
 * long run is never taken as stale). `noVerdict`: the checker gave no verdict (why), so after the tests it stops for review.
 */
async function upToDateTestMove($: Host, t: SymccTask, dir: string, b: Board, mode: CheckMode, made: string[], stopped: () => CheckResult | undefined, retest: boolean, target: string, head: string, changed: string[], refresh: () => Promise<void>, noVerdict?: string): Promise<CheckResult> {
  // First, before touching the folder: a step stopped or given up while it waited in the merge
  // line does nothing, as the next try may already be using the folder.
  const early = stopped()
  if (early) return early
  // T-440: checked again here, as the task may have waited long in the merge line
  if (!(await branchExists($, target))) return goneResult(target)
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const tip = await gitOk($, ['rev-parse', 'HEAD'], dir)
  let candidate = tip
  await markStep($, t, 'merging', stopped)
  if ((await git($, ['merge-base', '--is-ancestor', main, tip])).exitCode !== 0) {
    const m = await git($, [...asSymcc(), 'merge', '--no-edit', '--no-verify', '-m', commitMessage(t, { name: S.N.name, subject: `${t.id}: bring up to date with ${target}` }), main], dir)
    if (m.exitCode !== 0) {
      await git($, ['merge', '--abort'], dir)
      // Only a real conflict is one: any other failure (e.g. signing the merge commit) is git's error, and retrying on conflicts can't help it.
      if (/^CONFLICT|fix conflicts|unmerged/im.test(`${m.stdout}\n${m.stderr}`)) return { ok: false, detail: `conflicts with the latest ${target}`, conflict: true }
      return { ok: false, detail: `symcc could not bring the work up to date with ${target} (git merge): ${gitFailText(m)}` }
    }
    candidate = await gitOk($, ['rev-parse', 'HEAD'], dir)
    made.push(candidate)
  }
  let testsRun = mode === 'finish' || candidate !== head || retest
  // T-527: the code about to be tested (its git tree, the target merged in). When this same tree already passed
  // these same test commands, the run is skipped. Unknown (git could not tell): the tests run as usual.
  const tree = testsRun && b.test_commands.length ? await testedTree($, candidate, dir) : ''
  const skipped = !!tree && treePassed(await readPassedTrees($), tree, b.test_commands)
  if (skipped) testsRun = false
  if (testsRun && b.test_commands.length) {
    // Only this task's tests run now: it holds the front of the merge line.
    const failed = await (async (): Promise<CheckResult | undefined> => {
      await markStep($, t, 'testing', stopped)
      for (const cmd of b.test_commands) {
        await refresh()
        let thrown: string | undefined
        const r = await $.run(['/bin/sh', '-c', cmd], { cwd: dir, timeoutMs: testTimeoutMs(b) }).catch((e: Error) => ((thrown = String(e?.message ?? e)), { exitCode: 1, stdout: '', stderr: thrown }))
        // T-547: stopped by its time limit: it fails like a failing test, its output goes to a new try (see settle)
        if (r.exitCode !== 0 && ranOutOfTime(r, thrown)) {
          const min = limitMinutes(testTimeoutMs(b))
          return stopped() ?? { ok: false, timedOut: min, detail: timedOutDetail(cmd, min), testOutput: testTail(`${timedOutHead(cmd, min)}\n${r.stdout}\n${r.stderr}`) }
        }
        if (r.exitCode !== 0) {
          const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join(' | ').slice(0, 700)
          return stopped() ?? { ok: false, detail: `tests failed: \`${cmd}\` (exit ${r.exitCode}). ${tail}`, testOutput: testTail(`$ ${cmd} (exit ${r.exitCode})\n${r.stdout}\n${r.stderr}`) }
        }
        const s = stopped()
        if (s) return s
      }
      // all passed: remembered during the turn, so two sessions never write the file at once; a failed, timed-out or stopped run never is
      if (tree) await recordPassedTree($, tree, b.test_commands)
      return undefined
    })()
    if (failed) return failed
  }
  const passed = skipped ? `; ${testsSkippedText(tree)}` : '; tests passed'
  // tests_with_changes: a change task's work that edits code but no test file is flagged (not on the owner's approve).
  const flag = testsWithChangesOf(b)
  const untested = mode !== 'approve' && flag !== 'off' && !isInvestigation(t) && untestedChange(changed) ? untestedText(t.id) : ''
  const flagged = untested ? { untested } : {}
  // the checker gave no verdict (it ran before the line): the task waits for the owner's review, nothing merged
  if (noVerdict) return { ok: true, review: true, noVerdict, ...flagged, detail: `checks passed, but ${noVerdict}; ready for review, nothing merged yet` }
  if (mode === 'finish' && (needsReview(b, t) || (untested && flag === 'review'))) return { ok: true, review: true, ...flagged, detail: `checks passed${b.test_commands.length ? passed : '; no test command set'}; ready for review, nothing merged yet${untested ? ` (${untested})` : ''}` }
  // Move main forward (compare-and-swap). If the person has main checked out, update their
  // files too, but never over their uncommitted changes, untracked or ignored files in files the merge changes.
  const s = stopped()
  if (s) return s
  // T-440: the tests can take many minutes; the branch may have been deleted meanwhile
  if (!(await branchExists($, target))) return goneResult(target)
  await markStep($, t, 'merging', stopped)
  const current = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
  const moved = await moveTarget(args => git($, args), { target, id: t.id, from: main, to: candidate, checkedOut: current === target, note: `${S.N.name} ${t.id}`, skipDir: S.N.dir, action: mode === 'approve' ? 'approve' : 'retry' })
  if (!moved.ok && !(await branchExists($, target))) return goneResult(target)
  if (!moved.ok) return { ok: false, detail: moved.detail, ...(moved.blocked ? { blocked: moved.blocked } : {}) }
  const tests = !b.test_commands.length ? '; no test command set' : skipped || testsRun ? passed : ''
  // Research notes the merge added or changed (not deleted): asked of git only when the work touched docs/research/.
  let notes: string[] = []
  if (researchNotes(changed).length) {
    const n = await git($, ['diff', '--name-only', '--no-renames', '-z', '--diff-filter=AM', main, candidate])
    notes = researchNotes(n.exitCode === 0 ? n.stdout.split('\0').filter(Boolean) : changed)
  }
  return { ok: true, merged: candidate, ...(notes.length ? { notes } : {}), ...flagged, detail: `merged into ${target} (${shortSha(candidate)})${mode === 'approve' ? '; approved by the owner' : ''}${tests}` }
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
export async function recordCommits($: Host, id: string, made: readonly string[], merged?: string) {
  if (!made.length && !merged) return
  try {
    await change($, x => {
      const cur = find(x, id)
      if (!cur) return x
      return patchTask(x, id, { runs: addCommits(cur.runs, made), ...(merged ? { merged } : {}) }, now())
    })
  } catch (e) {
    tellLead($, `${id}: could not save its commits on the board (${(e as Error).message.slice(0, 200)}). Commits: ${[...made, ...(merged ? [merged] : [])].join(', ')}`)
  }
}
