import type { SymccTask } from '../../types'
import { type Blockers, type CheckStep, type DiffFile, parseDiffStat, parseStatusZ, reviewedCommit, YOUR_EDITS, type Board, commitMessage, outOfScope, outOfScopeText, testTail, needsReview, find, patchTask, addCommits, moveTarget, researchNotes, intoOf, isTaskCommit, TEST_TIMEOUT_MS, isInvestigation, testsWithChangesOf, untestedChange, untestedText, shortSha, secretFiles, secretsLeftText, onlySecretsQuestion, isPlainRelPath, TEST_LOCK_FILE, TEST_LOCK_STALE_MS, testLockText, parseTestLock, waitingTestsNote, isLockStale, checkStepNow, SCRATCH_DIR } from '../board'
import { gitOk, git, worktreeDir, asSymcc, taskBranch, branchExists, scratchOn } from './git'
import { S, changesCache } from './state'
import type { Host } from '../host'
import { change, now, load, path, tryLock, dropIfSame, safeWrite } from './store'
import { tellLead } from './tell'
import { ranOutOfTime, limitMinutes, timedOutDetail } from '../core/test-timeout'
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
 * The checker setting (see app/checker.ts): `held`: the checks passed and nothing merged, for a checker to look at first;
 * `checker`: the checker found problems (its report is `testOutput`); `noVerdict`: why the checker gave none (then it waits for review).
 * `secrets`: changed files whose names look like secrets (see secretFiles), left out of the commit and merge but kept in the task's folder;
 * `ask`: the change was only such files, so nothing merged and the task waits for the owner with this question.
 * `timedOut` (T-511): a test command was stopped by its time limit (these minutes), so nothing failed and nothing merged;
 * there is no `testOutput`, so no new try starts for it: only the tests run again (see settle and rerunTimedOutTests).
 */
export type CheckResult = { ok: boolean; detail: string; timedOut?: number; conflict?: boolean; testOutput?: string; review?: boolean; merged?: string; notes?: string[]; blocked?: Blockers; untested?: string; held?: boolean; checker?: boolean; noVerdict?: string; secrets?: string[]; ask?: string; gone?: boolean }

/** T-440: the branch the task merges into (`target`) was deleted while it was checked: nothing merged; the caller makes the task wait with the "branch is gone" question (waitIfBranchGone). */
export const goneResult = (target: string): CheckResult => ({ ok: false, gone: true, detail: `not merged: branch ${target} is gone` })

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
 * Merges into the same branch take turns (mergeTurn); when the branch still moved before ours
 * could move it, the task is brought up to date, tested and merged again by itself (MAX_MERGE_RACES at most).
 * `release`: settles when the caller gave this check up as stuck, so later merges into the branch stop waiting for it.
 * `turn`: the caller's time limit. `turn(false)` when this check has to wait in line for its merge turn (or tries
 * again after the branch moved), `turn(true)` when that turn begins: waiting in line and earlier goes don't count.
 * `hold`: asked with the changed files once the tests passed; when it says yes, nothing is merged and the result
 * is `held` (with `review` too when the task waits for review): the checker runs next (see app/checker.ts).
 */
export async function checkAndMerge($: Host, t: SymccTask, dir: string, b: Board, mode: CheckMode = 'finish', made: string[] = [], stop: () => string | undefined = () => undefined, retest = false, release?: Promise<unknown>, turn?: (go: boolean) => void, hold?: (changed: readonly string[]) => boolean): Promise<CheckResult> {
  const stopped = (): CheckResult | undefined => {
    const why = stop()
    return why ? { ok: false, detail: `not merged: the task was ${why} while it was being checked` } : undefined
  }
  // the branch this task merges into: the one checked out when it was made
  const target = intoOf(t)
  await markStep($, t, 'checking', stopped)
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
  if (unstaged) return { ok: false, detail: `symcc could not leave out files that look like secrets (${secretNames(left)}): ${unstaged}` }
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
    if (why) return { ok: false, detail: `symcc could not take files that look like secrets out of the task's branch (${secretNames([...new Set([...inHistory, ...inBranch])].sort())}): ${why}` }
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
  // Merges into the same branch take turns (mergeTurn), from bringing in the latest of it to moving it.
  // If it still moved under us (the owner, or another copy of the plugin), bring it in again and retry, a few times at most.
  for (let n = 1; ; n++) {
    // The time limit stops while this waits behind an earlier merge (that one has its own limit and
    // `release`, so the line keeps moving) and starts again from zero when its own go begins.
    const restart = n > 1 || mergeTurns.has(target)
    if (restart) turn?.(false)
    const r = await mergeTurn(target, () => (restart && turn?.(true), upToDateTestMove($, t, dir, b, mode, made, stopped, retest, target, head, changed, hold, turn)), release)
    if (!r.raced || n >= MAX_MERGE_RACES) return withSecrets(r.result)
  }
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

/**
 * The secret-looking `files` named in a failure ("tests/.env, id_rsa"): just the names (at most 10), with control characters shown as "?".
 * Not secretsLeftText: that says the files were left out, which a failed step did not finish (T-507).
 */
function secretNames(files: readonly string[]): string {
  // eslint-disable-next-line no-control-regex
  const shown = files.slice(0, 10).map(f => f.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?'))
  return `${shown.join(', ')}${files.length > 10 ? `, and ${files.length - 10} more` : ''}`
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

/** How many times checkAndMerge brings a task up to date and tries again when its branch moved during the merge. */
export const MAX_MERGE_RACES = 5

/** The merge running now (or last) into each branch: the next one into that branch waits for it. */
const mergeTurns = new Map<string, Promise<unknown>>()

/** Forgets the merges queued per branch (what a reload starts with); for the tests' resetPlugin() only. */
export function resetMergeTurns() {
  mergeTurns.clear()
}

/** Runs `fn` once every earlier merge into branch `target` (through this function) has ended, whether it worked or not, or was let go (`release`). */
export function mergeTurn<T>(target: string, fn: () => Promise<T>, release?: Promise<unknown>): Promise<T> {
  const prev = mergeTurns.get(target) ?? Promise.resolve()
  const mine = prev.then(fn, fn)
  // `release`: once it settles, the next merge no longer waits for this one (a step given up as stuck).
  const tail = (release ? Promise.race([mine, release]) : mine).catch(() => undefined)
  mergeTurns.set(target, tail)
  void tail.then(() => { if (mergeTurns.get(target) === tail) mergeTurns.delete(target) })
  return mine
}

// ---------------- one task's tests at a time ----------------

/** How often a task waiting for the test lock looks again. */
export const TEST_LOCK_POLL_MS = 2_000

/** The tasks of this copy of the plugin waiting for the test lock, oldest first: only the first one tries to take it. */
const testLine: { id: string }[] = []

/** Forgets the tasks waiting for the test lock (what a reload starts with); for the tests' resetPlugin() only. */
export function resetTestLine() {
  testLine.length = 0
}

/**
 * Whether test lock text `held` (file time `fileMs`) may be taken over: it is older than TEST_LOCK_STALE_MS, or its
 * task is no longer being checked by any copy of the plugin (gone from the board, or its check mark is no longer
 * refreshed: its check ended or was given up, or its session died), or it is task `me`'s own, left by an earlier
 * go of that task (say one cut short by a reload; this go's fresh check mark would otherwise keep it looking alive).
 * A board that can't be read: not stale.
 */
async function testLockStale($: Host, me: string, held: string, fileMs?: number): Promise<boolean> {
  if (isLockStale(held, Date.now(), fileMs, TEST_LOCK_STALE_MS)) return true
  const l = parseTestLock(held)
  if (!l) return false
  if (l.task === me) return true
  const b = await load($).catch(() => null)
  if (!b) return false
  const cur = find(b, l.task)
  return !cur || !checkStepNow(cur, Date.now())
}

/** T-511: whether some task's tests run now: one of this copy waits for or holds the test lock, or a lock file that is not stale is there. */
export async function testsRunningNow($: Host): Promise<boolean> {
  if (testLine.length) return true
  const file = path(`${S.N.dir}/${TEST_LOCK_FILE}`)
  const held = await $.fs.read(file).catch(() => null)
  if (held === null) return false
  const st = await $.fs.stat(file).catch(() => null)
  return !(await testLockStale($, '', held, st?.mtimeMs))
}

/**
 * Runs `run` (task `t`'s test commands) while holding the project-wide test lock (TEST_LOCK_FILE in the board folder),
 * so only one task's tests run at a time, across tasks and sessions; symcc's merge step only, not the workers' own runs.
 * Tasks of this copy take turns oldest first (testLine); a lock held elsewhere is waited for, a stale one
 * (testLockStale) taken over. While it waits, the task's note says whose tests it waits for (waitingTestsNote), and
 * the step's time limit is stopped (`turn(false)`, started again from zero by `turn(true)` once the lock is ours), so
 * waiting never counts as running over, nor twice in a row as hung. Asked between looks: when `stopped` gives a
 * reason, it stops waiting and returns it. `run` gets `refresh`, which dates the lock again (before each command,
 * so a long run of several commands is not taken as stale). The lock is let go however `run` ends.
 */
export async function withTestLock<T>($: Host, t: Pick<SymccTask, 'id' | 'status' | 'attempts'>, stopped: () => CheckResult | undefined, turn: ((go: boolean) => void) | undefined, run: (refresh: () => Promise<void>) => Promise<T>): Promise<T | CheckResult> {
  const me = { id: t.id }
  testLine.push(me)
  let mine = ''
  let file = ''
  let shown = ''
  let before: string | undefined
  let waited = false
  let again = false
  try {
    file = path(`${S.N.dir}/${TEST_LOCK_FILE}`)
    for (;;) {
      const s = stopped()
      if (s) return s
      if (testLine[0] === me) {
        const text = testLockText(t.id, S.me || 'unknown', Date.now())
        if (await tryLock($, file, text)) {
          mine = text
          break
        }
      }
      const held = await $.fs.read(file).catch(() => null)
      // let go between our try and our look: try again at once (only once in a row, so a lock that can't be read never spins)
      if (testLine[0] === me && held === null && !again) {
        again = true
        continue
      }
      again = false
      if (testLine[0] === me && held !== null) {
        const st = await $.fs.stat(file).catch(() => null)
        if (await testLockStale($, t.id, held, st?.mtimeMs)) {
          await dropIfSame($, file, held)
          continue
        }
      }
      const holder = parseTestLock(held)?.task ?? (testLine[0] && testLine[0] !== me ? testLine[0].id : 'another task')
      if (!waited) {
        waited = true
        turn?.(false)
      }
      if (holder !== shown) {
        const was = shown
        shown = holder
        await noteTask($, t, stopped, note => {
          if (!was) before = note
          return waitingTestsNote(holder)
        })
      }
      await $.clock.sleep(TEST_LOCK_POLL_MS)
    }
  } finally {
    const at = testLine.indexOf(me)
    if (at >= 0) testLine.splice(at, 1)
    // the waiting note goes back to what it was, unless something else changed it meanwhile
    if (shown) await noteTask($, t, () => undefined, note => (note === waitingTestsNote(shown) ? before : note))
  }
  if (waited) turn?.(true)
  try {
    return await run(async () => {
      if ((await $.fs.read(file).catch(() => null)) !== mine) return
      const next = testLockText(t.id, S.me || 'unknown', Date.now())
      await safeWrite($, file, next, 'the test lock').then(() => void (mine = next), () => undefined)
    })
  } finally {
    await dropIfSame($, file, mine)
  }
}

/** Sets task `t`'s note to what `note` makes of it, while the task is still as it was and its check not `stopped`. Never throws. */
async function noteTask($: Host, t: Pick<SymccTask, 'id' | 'status' | 'attempts'>, stopped: () => CheckResult | undefined, note: (now: string | undefined) => string | undefined) {
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts || stopped()) return x
    const next = note(cur.note)
    return next === cur.note ? x : patchTask(x, t.id, { note: next }, now())
  }).catch(() => undefined)
}

/**
 * Says on the board which step of checking task `t` is going on now (BoardTask.checking), so the list
 * shows it; only while the task is still as it was when the check began and the check was not
 * stopped or given up. Never fails the check: a board that can't be written only misses the word.
 */
export async function markStep($: Host, t: SymccTask, step: CheckStep, stopped: () => CheckResult | undefined) {
  if (stopped()) return
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts || stopped() || cur.checking?.step === step) return x
    return patchTask(x, t.id, { checking: { step, at: now() } }, cur.updated_at)
  }).catch(() => undefined)
}

/** One go at the end of checkAndMerge: bring in the latest `target`, test, move `target` forward. `raced`: it moved meanwhile, so nothing was merged. */
async function upToDateTestMove($: Host, t: SymccTask, dir: string, b: Board, mode: CheckMode, made: string[], stopped: () => CheckResult | undefined, retest: boolean, target: string, head: string, changed: string[], hold?: (changed: readonly string[]) => boolean, turn?: (go: boolean) => void): Promise<{ result: CheckResult; raced?: boolean }> {
  const res = (result: CheckResult) => ({ result })
  // First, before touching the folder: a step stopped or given up while it waited for its merge
  // turn does nothing, as the next try may already be using the folder.
  const early = stopped()
  if (early) return res(early)
  // T-440: checked again here, as the merge turn may have waited long behind other merges
  if (!(await branchExists($, target))) return res(goneResult(target))
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const tip = await gitOk($, ['rev-parse', 'HEAD'], dir)
  let candidate = tip
  await markStep($, t, 'merging', stopped)
  if ((await git($, ['merge-base', '--is-ancestor', main, tip])).exitCode !== 0) {
    const m = await git($, [...asSymcc(), 'merge', '--no-edit', '--no-verify', '-m', commitMessage(t, { name: S.N.name, subject: `${t.id}: bring up to date with ${target}` }), main], dir)
    if (m.exitCode !== 0) {
      await git($, ['merge', '--abort'], dir)
      // Only a real conflict is one: any other failure (e.g. signing the merge commit) is git's error, and retrying on conflicts can't help it.
      if (/^CONFLICT|fix conflicts|unmerged/im.test(`${m.stdout}\n${m.stderr}`)) return res({ ok: false, detail: `conflicts with the latest ${target}`, conflict: true })
      return res({ ok: false, detail: `symcc could not bring the work up to date with ${target} (git merge): ${gitFailText(m)}` })
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
    // One task's tests at a time, project-wide (withTestLock); the lock is let go however the tests end.
    const failed = await withTestLock($, t, stopped, turn, async refresh => {
      await markStep($, t, 'testing', stopped)
      for (const cmd of b.test_commands) {
        await refresh()
        let thrown: string | undefined
        const r = await $.run(['/bin/sh', '-c', cmd], { cwd: dir, timeoutMs: TEST_TIMEOUT_MS }).catch((e: Error) => ((thrown = String(e?.message ?? e)), { exitCode: 1, stdout: '', stderr: thrown }))
        // T-511: stopped by its time limit, not failed: no test output, so no new try is started for it (see settle)
        if (r.exitCode !== 0 && ranOutOfTime(r, thrown)) {
          const min = limitMinutes(TEST_TIMEOUT_MS)
          return stopped() ?? { ok: false, timedOut: min, detail: timedOutDetail(cmd, min) }
        }
        if (r.exitCode !== 0) {
          const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join(' | ').slice(0, 700)
          return stopped() ?? { ok: false, detail: `tests failed: \`${cmd}\` (exit ${r.exitCode}). ${tail}`, testOutput: testTail(`$ ${cmd} (exit ${r.exitCode})\n${r.stdout}\n${r.stderr}`) }
        }
        const s = stopped()
        if (s) return s
      }
      // all passed: remembered while the lock is still held, so two sessions never write the file at once; a failed, timed-out or stopped run never is
      if (tree) await recordPassedTree($, tree, b.test_commands)
      return undefined
    })
    if (failed) return res(failed)
  }
  const passed = skipped ? `; ${testsSkippedText(tree)}` : '; tests passed'
  // tests_with_changes: a change task's work that edits code but no test file is flagged (not on the owner's approve).
  const flag = testsWithChangesOf(b)
  const untested = mode !== 'approve' && flag !== 'off' && !isInvestigation(t) && untestedChange(changed) ? untestedText(t.id) : ''
  const flagged = untested ? { untested } : {}
  // the checker setting: a change that needs a checker stops here, before review or merge (see app/checker.ts)
  const held = !!hold?.(changed)
  const holding = held ? { held: true } : {}
  if (mode === 'finish' && (needsReview(b, t) || (untested && flag === 'review'))) return res({ ok: true, review: true, ...holding, ...flagged, detail: `checks passed${b.test_commands.length ? passed : '; no test command set'}; ready for review, nothing merged yet${untested ? ` (${untested})` : ''}` })
  if (held) return res({ ok: true, held: true, ...flagged, detail: `checks passed${b.test_commands.length ? passed : '; no test command set'}; the checker looks at it before it merges` })
  // Move main forward (compare-and-swap). If the person has main checked out, update their
  // files too, but never over their uncommitted changes, untracked or ignored files in files the merge changes.
  const s = stopped()
  if (s) return res(s)
  // T-440: the tests can take many minutes; the branch may have been deleted meanwhile
  if (!(await branchExists($, target))) return res(goneResult(target))
  await markStep($, t, 'merging', stopped)
  const current = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
  const moved = await moveTarget(args => git($, args), { target, id: t.id, from: main, to: candidate, checkedOut: current === target, note: `${S.N.name} ${t.id}`, skipDir: S.N.dir, action: mode === 'approve' ? 'approve' : 'retry' })
  if (!moved.ok && !(await branchExists($, target))) return res(goneResult(target))
  if (!moved.ok) return { result: { ok: false, detail: moved.detail, ...(moved.blocked ? { blocked: moved.blocked } : {}) }, ...(moved.raced ? { raced: true } : {}) }
  const tests = !b.test_commands.length ? '; no test command set' : skipped || testsRun ? passed : ''
  // Research notes the merge added or changed (not deleted): asked of git only when the work touched docs/research/.
  let notes: string[] = []
  if (researchNotes(changed).length) {
    const n = await git($, ['diff', '--name-only', '--no-renames', '-z', '--diff-filter=AM', main, candidate])
    notes = researchNotes(n.exitCode === 0 ? n.stdout.split('\0').filter(Boolean) : changed)
  }
  return res({ ok: true, merged: candidate, ...(notes.length ? { notes } : {}), ...flagged, detail: `merged into ${target} (${shortSha(candidate)})${mode === 'approve' ? '; approved by the owner' : ''}${tests}` })
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
