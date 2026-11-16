import type { SymccTask } from '../../types'
import { type Blockers, type CheckStep, type DiffFile, parseDiffStat, parseStatusZ, reviewedCommit, YOUR_EDITS, type Board, commitMessage, outOfScope, outOfScopeText, testTail, needsReview, find, patchTask, addCommits, moveTarget, researchNotes, intoOf, isTaskCommit, TEST_TIMEOUT_MS, kindOf, testsWithChangesOf, untestedChange, untestedText } from '../board'
import { gitOk, git, worktreeDir, asSymcc, taskBranch } from './git'
import { S, type $, changesCache } from './state'
import { change, now } from './store'
import { tellLead } from './tell'

// ---------------- a task's changes, for review ----------------

/** The changes of a task: from where its work branch left the branch it merges into (the merge base) to the branch's tip. */
export const diffRange = (target: string, t: Pick<SymccTask, 'id' | 'branch'>) => `${target}...${taskBranch(t)}`

export function gitDiff($: $, target: string, t: SymccTask, opts: string[], file = ''): Promise<string> {
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
export async function ownerEdits($: $, t: SymccTask, dir: string): Promise<string[]> {
  const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], dir)
  if (st.exitCode !== 0) throw new Error(`git status: ${(st.stderr || st.stdout).trim().slice(0, 300)}`)
  const files = parseStatusZ(st.stdout).map(e => e.path)
  const seen = reviewedCommit(t)
  if (seen) {
    const head = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
    if (head && head !== seen) {
      const d = await git($, ['diff', '--name-only', '--no-renames', '-z', `${seen}..${head}`], dir)
      files.push(...(d.exitCode === 0 ? d.stdout.split('\0').filter(Boolean) : [`(commits after ${seen.slice(0, 8)})`]))
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
export async function folderDiff($: $, target: string, t: SymccTask, opts: string[], file = ''): Promise<{ text: string; edits: string[] }> {
  const dir = worktreeDir(t.id)
  const edits = (await $.fs.exists(`${dir}/.git`)) ? await ownerEdits($, t, dir) : []
  if (!edits.length) return { text: await gitDiff($, target, t, opts, file), edits }
  const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], dir)
  const fresh = parseStatusZ(st.stdout).filter(e => e.code === '??').map(e => e.path)
  if (fresh.length) await git($, ['add', '-N', '--', ...fresh], dir)
  const base = await gitOk($, ['merge-base', `refs/heads/${target}`, 'HEAD'], dir)
  const text = await gitOk($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', ...opts, base, ...(file ? ['--', file] : [])], dir)
  return { text, edits }
}

/** The files a task changed, with +/- line counts, as its folder has them now (see folderDiff); the owner's edited files are marked. */
export async function changedFiles($: $, target: string, t: SymccTask): Promise<DiffFile[]> {
  const d = await folderDiff($, target, t, ['--stat=1000,800'])
  return parseDiffStat(d.text).map(f => (d.edits.includes(f.file) ? { ...f, edited: true } : f))
}

/**
 * The diff of a task's changes (all files, or just `file`) as its folder has them now, against
 * the merge base. When the owner's edits are in it, it starts with a line saying so (YOUR_EDITS).
 */
// A function declaration, not an arrow: the plugin loader follows $ past an import only into one.
export async function changesText($: $, target: string, t: SymccTask, file = '') {
  const d = await folderDiff($, target, t, [], file)
  const mine = d.edits.length && d.text.trim() && (!file || d.edits.includes(file))
  return mine ? `${YOUR_EDITS}\n${d.text}` : d.text
}

/**
 * What checking (and maybe merging) a task's work came to; `untested`: the note "T-3 changed code but no test" when
 * the setting tests_with_changes flagged it (see untestedChange); `review`: the checks passed and it now waits for the owner;
 * `blocked`: everything passed, only the owner's files on the target branch are in the way of the merge (nothing moved).
 */
export type CheckResult = { ok: boolean; detail: string; conflict?: boolean; testOutput?: string; review?: boolean; merged?: string; notes?: string[]; blocked?: Blockers; untested?: string }

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
 */
export async function checkAndMerge($: $, t: SymccTask, dir: string, b: Board, mode: CheckMode = 'finish', made: string[] = [], stop: () => string | undefined = () => undefined, retest = false, release?: Promise<unknown>, turn?: (go: boolean) => void): Promise<CheckResult> {
  const stopped = (): CheckResult | undefined => {
    const why = stop()
    return why ? { ok: false, detail: `not merged: the task was ${why} while it was being checked` } : undefined
  }
  // the branch this task merges into: the one checked out when it was made
  const target = intoOf(t)
  await markStep($, t, 'checking', stopped)
  const add = await git($, ['add', '-A', '--', '.'], dir)
  if (add.exitCode !== 0) return { ok: false, detail: `symcc could not stage the work (git add): ${gitFailText(add)}` }
  const committed = await commitTry($, t, dir, made)
  if (committed) return { ok: false, detail: `symcc could not commit the work: ${committed}` }
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const head = await gitOk($, ['rev-parse', 'HEAD'], dir)
  const base = (await git($, ['merge-base', main, head])).stdout.trim() || main
  // -z: names come through as they are (without it git quotes and escapes unusual ones, e.g. "caf\303\251.md").
  const d = await git($, ['diff', '--name-only', '--no-renames', '-z', `${base}..${head}`])
  if (d.exitCode !== 0) throw new Error(`git diff --name-only: ${(d.stderr || d.stdout).trim().slice(0, 300)}`)
  const changed = d.stdout.split('\0').filter(Boolean)
  if (!changed.length) {
    // Nothing new, but this task's own work is already on the target branch (an earlier try merged
    // it and a reload sent the task back): it is done, not failed.
    if (await onTarget($, t.id, head, target)) return { ok: true, merged: head, detail: `already merged into ${target} (${head.slice(0, 8)}) by an earlier try; nothing new to merge` }
    return { ok: false, detail: 'the worker made no change' }
  }
  const bad = outOfScope(changed, t.files, S.N.dir)
  if (bad.length) {
    // On approve the owner's edits stay in the folder: once the files are allowed, approving again merges them.
    if (mode !== 'finish') return { ok: false, detail: outOfScopeText(bad, t.files) }
    const undo = await undoOutOfScope($, t, dir, base, bad, made)
    return { ok: false, detail: outOfScopeText(bad, t.files, !undo) + undo }
  }
  // Merges into the same branch take turns (mergeTurn), from bringing in the latest of it to moving it.
  // If it still moved under us (the owner, or another copy of the plugin), bring it in again and retry, a few times at most.
  for (let n = 1; ; n++) {
    // The time limit stops while this waits behind an earlier merge (that one has its own limit and
    // `release`, so the line keeps moving) and starts again from zero when its own go begins.
    const restart = n > 1 || mergeTurns.has(target)
    if (restart) turn?.(false)
    const r = await mergeTurn(target, () => (restart && turn?.(true), upToDateTestMove($, t, dir, b, mode, made, stopped, retest, target, head, changed)), release)
    if (!r.raced || n >= MAX_MERGE_RACES) return r.result
  }
}

/**
 * After a try failed the scope check: puts the files outside the task (`bad`) on the task's branch
 * back to how they are at `base` (the merge base) and commits that, so the next try in the same
 * folder starts clean and keeps the work inside the task's files. Returns '' when done, or a note
 * to add to the failure when it could not be undone.
 */
async function undoOutOfScope($: $, t: SymccTask, dir: string, base: string, bad: string[], made: string[]): Promise<string> {
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
async function commitTry($: $, t: SymccTask, dir: string, made: string[], subject?: string): Promise<string> {
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

/**
 * Says on the board which step of checking task `t` is going on now (BoardTask.checking), so the list
 * shows it; only while the task is still as it was when the check began and the check was not
 * stopped or given up. Never fails the check: a board that can't be written only misses the word.
 */
async function markStep($: $, t: SymccTask, step: CheckStep, stopped: () => CheckResult | undefined) {
  if (stopped()) return
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts || stopped() || cur.checking?.step === step) return x
    return patchTask(x, t.id, { checking: { step, at: now() } }, cur.updated_at)
  }).catch(() => undefined)
}

/** One go at the end of checkAndMerge: bring in the latest `target`, test, move `target` forward. `raced`: it moved meanwhile, so nothing was merged. */
async function upToDateTestMove($: $, t: SymccTask, dir: string, b: Board, mode: CheckMode, made: string[], stopped: () => CheckResult | undefined, retest: boolean, target: string, head: string, changed: string[]): Promise<{ result: CheckResult; raced?: boolean }> {
  const res = (result: CheckResult) => ({ result })
  // First, before touching the folder: a step stopped or given up while it waited for its merge
  // turn does nothing, as the next try may already be using the folder.
  const early = stopped()
  if (early) return res(early)
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const tip = await gitOk($, ['rev-parse', 'HEAD'], dir)
  let candidate = tip
  await markStep($, t, 'merging', stopped)
  if ((await git($, ['merge-base', '--is-ancestor', main, tip])).exitCode !== 0) {
    const m = await git($, [...asSymcc(), 'merge', '--no-edit', '-m', commitMessage(t, { name: S.N.name, subject: `${t.id}: bring up to date with ${target}` }), main], dir)
    if (m.exitCode !== 0) {
      await git($, ['merge', '--abort'], dir)
      // Only a real conflict is one: any other failure (e.g. signing the merge commit) is git's error, and retrying on conflicts can't help it.
      if (/^CONFLICT|fix conflicts|unmerged/im.test(`${m.stdout}\n${m.stderr}`)) return res({ ok: false, detail: `conflicts with the latest ${target}`, conflict: true })
      return res({ ok: false, detail: `symcc could not bring the work up to date with ${target} (git merge): ${gitFailText(m)}` })
    }
    candidate = await gitOk($, ['rev-parse', 'HEAD'], dir)
    made.push(candidate)
  }
  const testsRun = mode === 'finish' || candidate !== head || retest
  if (testsRun && b.test_commands.length) await markStep($, t, 'testing', stopped)
  for (const cmd of testsRun ? b.test_commands : []) {
    const r = await $.process.run(['/bin/sh', '-c', cmd], { cwd: dir, timeoutMs: TEST_TIMEOUT_MS }).catch((e: Error) => ({ exitCode: 1, stdout: '', stderr: e.message }))
    if (r.exitCode !== 0) {
      const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join(' | ').slice(0, 700)
      return res(stopped() ?? { ok: false, detail: `tests failed: \`${cmd}\` (exit ${r.exitCode}). ${tail}`, testOutput: testTail(`$ ${cmd} (exit ${r.exitCode})\n${r.stdout}\n${r.stderr}`) })
    }
    const s = stopped()
    if (s) return res(s)
  }
  // tests_with_changes: a change task's work that edits code but no test file is flagged (not on the owner's approve).
  const flag = testsWithChangesOf(b)
  const untested = mode !== 'approve' && flag !== 'off' && kindOf(t) === 'change' && untestedChange(changed) ? untestedText(t.id) : ''
  const flagged = untested ? { untested } : {}
  if (mode === 'finish' && (needsReview(b, t) || (untested && flag === 'review'))) return res({ ok: true, review: true, ...flagged, detail: `checks passed${b.test_commands.length ? '; tests passed' : '; no test command set'}; ready for review, nothing merged yet${untested ? ` (${untested})` : ''}` })
  // Move main forward (compare-and-swap). If the person has main checked out, update their
  // files too, but never over their uncommitted changes, untracked or ignored files in files the merge changes.
  const s = stopped()
  if (s) return res(s)
  await markStep($, t, 'merging', stopped)
  const current = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
  const moved = await moveTarget(args => git($, args), { target, id: t.id, from: main, to: candidate, checkedOut: current === target, note: `${S.N.name} ${t.id}`, skipDir: S.N.dir, action: mode === 'approve' ? 'approve' : 'retry' })
  if (!moved.ok) return { result: { ok: false, detail: moved.detail, ...(moved.blocked ? { blocked: moved.blocked } : {}) }, ...(moved.raced ? { raced: true } : {}) }
  const tests = !b.test_commands.length ? '; no test command set' : testsRun ? '; tests passed' : ''
  // Research notes the merge added or changed (not deleted): asked of git only when the work touched docs/research/.
  let notes: string[] = []
  if (researchNotes(changed).length) {
    const n = await git($, ['diff', '--name-only', '--no-renames', '-z', '--diff-filter=AM', main, candidate])
    notes = researchNotes(n.exitCode === 0 ? n.stdout.split('\0').filter(Boolean) : changed)
  }
  return res({ ok: true, merged: candidate, ...(notes.length ? { notes } : {}), ...flagged, detail: `merged into ${target} (${candidate.slice(0, 8)})${mode === 'approve' ? '; approved by the owner' : ''}${tests}` })
}

/** Whether commit `sha` is one of task `id`'s commits (of try `tryNo`, when given) and already on branch `target`. */
async function onTarget($: $, id: string, sha: string, target: string, tryNo?: number): Promise<boolean> {
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
export async function alreadyMerged($: $, t: Pick<SymccTask, 'id' | 'branch' | 'merge_into' | 'attempts'>): Promise<string | null> {
  if (!(t.attempts > 0)) return null
  const tip = (await git($, ['rev-parse', '-q', '--verify', `refs/heads/${taskBranch(t)}`])).stdout.trim()
  return tip && (await onTarget($, t.id, tip, intoOf(t), t.attempts)) ? tip : null
}

/**
 * Saves on the board the commits a try made (on its last run) and, once merged, the commit that
 * landed on the target branch (`merged`). Read fresh inside the change, so no other write is lost.
 * A failure to save is told to the lead, never hidden; the merge itself already happened.
 */
export async function recordCommits($: $, id: string, made: readonly string[], merged?: string) {
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
