import type { SymccTask } from '../../types'
import { type DiffFile, parseDiffStat, parseStatusZ, reviewedCommit, YOUR_EDITS, type Board, commitMessage, outOfScope, outOfScopeText, testTail, needsReview, find, patchTask, addCommits, moveTarget, researchNotes } from '../board'
import { gitOk, git, worktreeDir } from './git'
import { S, type $, changesCache } from './state'
import { change, now } from './store'
import { tellLead } from './tell'

// ---------------- a task's changes, for review ----------------

/** The changes of a task: from where its branch left the target branch (the merge base) to the branch's tip. */
export const diffRange = (target: string, t: Pick<SymccTask, 'id' | 'branch'>) => `${target}...${t.branch ?? S.N.branch(t.id)}`

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

/** What checking (and maybe merging) a task's work came to; `review`: the checks passed and it now waits for the owner. */
export type CheckResult = { ok: boolean; detail: string; conflict?: boolean; testOutput?: string; review?: boolean; merged?: string; notes?: string[] }

/**
 * Commit the worker's changes, check scope, bring in the latest main, test, then move main forward.
 * `mode` 'finish' (a worker just finished): when the task needs review (see needsReview), stop
 * after the tests, before merging, and return `review`. 'approve' (the owner approved a task in
 * review): the same checked merge, but the tests run again only if main had to be merged in,
 * or when `retest` (the owner edited files in the task's folder since review, see ownerEdits).
 * `stop` is asked after each test and just before the merge: when it returns a reason (the task
 * was dropped or paused meanwhile), nothing is merged and that reason is returned.
 */
export async function checkAndMerge($: $, t: SymccTask, dir: string, b: Board, mode: 'finish' | 'approve' = 'finish', made: string[] = [], stop: () => string | undefined = () => undefined, retest = false): Promise<CheckResult> {
  const stopped = (): CheckResult | undefined => {
    const why = stop()
    return why ? { ok: false, detail: `not merged: the task was ${why} while it was being checked` } : undefined
  }
  const target = b.target_branch
  await git($, ['add', '-A', '--', '.'], dir)
  const before = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
  // The message ends with trailers (task, origin, why, try); see commitMessage.
  const c = await git($, ['-c', `user.name=${S.N.author.name}`, '-c', `user.email=${S.N.author.email}`, 'commit', '-q', '--no-verify', '-m', commitMessage(t, { name: S.N.name })], dir)
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const head = await gitOk($, ['rev-parse', 'HEAD'], dir)
  // Nothing to commit is fine (exit 1, HEAD unchanged); only a new HEAD counts as a commit of this try.
  if (c.exitCode === 0 && head !== before) made.push(head)
  const base = (await git($, ['merge-base', main, head])).stdout.trim() || main
  // -z: names come through as they are (without it git quotes and escapes unusual ones, e.g. "caf\303\251.md").
  const d = await git($, ['diff', '--name-only', '--no-renames', '-z', `${base}..${head}`])
  if (d.exitCode !== 0) throw new Error(`git diff --name-only: ${(d.stderr || d.stdout).trim().slice(0, 300)}`)
  const changed = d.stdout.split('\0').filter(Boolean)
  if (!changed.length) return { ok: false, detail: 'the worker made no change' }
  const bad = outOfScope(changed, t.files, S.N.dir)
  if (bad.length) return { ok: false, detail: outOfScopeText(bad, t.files) }
  let candidate = head
  if ((await git($, ['merge-base', '--is-ancestor', main, head])).exitCode !== 0) {
    const m = await git($, ['-c', `user.name=${S.N.author.name}`, '-c', `user.email=${S.N.author.email}`, 'merge', '--no-edit', '-m', commitMessage(t, { name: S.N.name, subject: `${t.id}: bring up to date with ${target}` }), main], dir)
    if (m.exitCode !== 0) {
      await git($, ['merge', '--abort'], dir)
      return { ok: false, detail: `conflicts with the latest ${target}`, conflict: true }
    }
    candidate = await gitOk($, ['rev-parse', 'HEAD'], dir)
    made.push(candidate)
  }
  const testsRun = mode === 'finish' || candidate !== head || retest
  for (const cmd of testsRun ? b.test_commands : []) {
    const r = await $.process.run(['/bin/sh', '-c', cmd], { cwd: dir, timeoutMs: 600_000 }).catch((e: Error) => ({ exitCode: 1, stdout: '', stderr: e.message }))
    if (r.exitCode !== 0) {
      const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join(' | ').slice(0, 700)
      return stopped() ?? { ok: false, detail: `tests failed: \`${cmd}\` (exit ${r.exitCode}). ${tail}`, testOutput: testTail(`$ ${cmd} (exit ${r.exitCode})\n${r.stdout}\n${r.stderr}`) }
    }
    const s = stopped()
    if (s) return s
  }
  if (mode === 'finish' && needsReview(b, t)) return { ok: true, review: true, detail: `checks passed${b.test_commands.length ? '; tests passed' : '; no test command set'}; ready for review, nothing merged yet` }
  // Move main forward (compare-and-swap). If the person has main checked out, update their
  // files too, but never over uncommitted changes or untracked or ignored files the merge would overwrite.
  const s = stopped()
  if (s) return s
  const current = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
  const moved = await moveTarget(args => git($, args), { target, id: t.id, from: main, to: candidate, checkedOut: current === target, note: `${S.N.name} ${t.id}`, skipDir: S.N.dir })
  if (!moved.ok) return { ok: false, detail: moved.detail }
  const tests = !b.test_commands.length ? '; no test command set' : testsRun ? '; tests passed' : ''
  // Research notes the merge added or changed (not deleted): asked of git only when the work touched docs/research/.
  let notes: string[] = []
  if (researchNotes(changed).length) {
    const n = await git($, ['diff', '--name-only', '--no-renames', '-z', '--diff-filter=AM', main, candidate])
    notes = researchNotes(n.exitCode === 0 ? n.stdout.split('\0').filter(Boolean) : changed)
  }
  return { ok: true, merged: candidate, ...(notes.length ? { notes } : {}), detail: `merged into ${target} (${candidate.slice(0, 8)})${mode === 'approve' ? '; approved by the owner' : ''}${tests}` }
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
