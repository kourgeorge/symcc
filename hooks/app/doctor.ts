// /<name>-doctor and the lead's doctor tool (T-676): checks the project's data folder (.<name>/) and git, lists what
// it found with sizes, and cleans up only what the owner confirms (core/doctor.ts has the pure part). Each fix checks
// again right before it acts, so nothing unmerged, uncommitted or in use is ever deleted. Reports, org-mem, scouts,
// roles and kinds are never touched: only migration backups, task folders of finished tasks, stale git worktree
// entries and task branches already in their branch can be cleaned up.
import { isFinished, type BoardTask, type Board, liveWorkersFor, intoOf, finishingNow, checkStepNow, parseLead, isFresh, liveDriver, activeFrom } from '../board'
import { type DoctorItem, oldBackups, backupIds, branchId, folderId, PRUNE_ID, parseDoctorArgs, doctorText, fixedText, type DoctorFixed, mergeRunsText, mergeNoteText, pruneLines, STRAY_DIRS, DOCTOR_STUCK_MIN, BACKUP_MARK, MIGRATE_ID } from '../core/doctor'
import { SIZE_WARN_BYTES, READ_LIMIT_BYTES, PARTS_DIR, mbText } from '../core/board-parts'
import { type Host, agentState } from '../host'
import { S, workers, starting, finishing, approving } from './state'
import { load, path } from './store'
import { readLeadText } from './lead'
import { readArchiveFile } from './archive'
import { git, deleteMergedBranch } from './git'
import { oldDataFound, oldRowsText, migrateData } from './migrate-data'

/** A found item with its fix (fixable ones): answers '' when done, else why it was not done. */
type Found = DoctorItem & { fix?: () => Promise<string>; done?: string[] }

/** A merge going on now: `id` is the task whose work is being merged (none for a git merge in the project folder). */
type Merging = { id?: string }

/** Whether a merge is going on now: a task's work being checked or merged (in any session), or a git merge in the project folder. */
async function mergeRuns(host: Host, b: Board | null): Promise<Merging | null> {
  const nowMs = Date.now()
  const t = b?.tasks.find(x => finishingNow(x, nowMs) || !!checkStepNow(x, nowMs))
  if (t) return { id: t.id }
  const mine = [...finishing, ...approving][0]
  if (mine) return { id: mine }
  const m = await git(host, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).catch(() => null)
  if (m?.exitCode === 0 && m.stdout.trim()) return {}
  return null
}

/** The live agents of this session, or null when they can't be told. */
const agentsNow = (host: Host) => host.agents.list().then(a => a.map(agentState), () => null)

/** Whether a worker of this copy (or a live agent) works on task `id` now. */
function inUse(id: string, t: BoardTask | undefined, agents: ReturnType<typeof agentState>[] | null): boolean {
  if ([...workers.values()].some(w => w.task === id) || starting.has(id) || finishing.has(id) || approving.has(id)) return true
  if (!agents) return true
  return liveWorkersFor({ id, runs: t?.runs }, agents, S.N.name).length > 0
}

/** Whether folder `dir` (a git worktree) has uncommitted changes; true also when git can't tell. */
async function dirty(host: Host, dir: string): Promise<boolean> {
  const st = await git(host, ['status', '--porcelain'], dir).catch(() => null)
  return !st || st.exitCode !== 0 || !!st.stdout.trim()
}

/**
 * Whether folder `dir`'s HEAD commit is safe to lose the folder over: already in `into` or on some branch. False
 * also when git can't tell, so a detached HEAD with commits on no branch is never removed.
 */
async function headKept(host: Host, dir: string, into: string): Promise<boolean> {
  const h = await git(host, ['rev-parse', '-q', '--verify', 'HEAD'], dir).catch(() => null)
  const head = h?.exitCode === 0 ? h.stdout.trim() : ''
  if (!/^[0-9a-f]{7,64}$/i.test(head)) return false
  const anc = await git(host, ['merge-base', '--is-ancestor', head, `refs/heads/${into}`]).catch(() => null)
  if (anc?.exitCode === 0) return true
  const on = await git(host, ['branch', '--contains', head, '--format=%(refname:short)']).catch(() => null)
  return on?.exitCode === 0 && !!on.stdout.trim()
}

/** Lists a lead file held by a session that stopped (into `listed`); gives back the file's text. */
async function leadCheck(host: Host, listed: Found[]): Promise<string | null> {
  const nowMs = Date.now()
  const leadText = await readLeadText(host)
  const lead = parseLead(leadText)
  if (lead && !isFresh(lead.heartbeat, nowMs))
    listed.push({ kind: 'board', fixable: false, text: `${S.N.leadFile} names a session that stopped ${Math.round((nowMs - lead.heartbeat) / 60_000)} min ago, so no session drives the board: /${S.N.name}-drive makes this one drive it` })
  return leadText
}

/** A folder's size in bytes by `du -sk`, or undefined when it can't be told. */
async function folderBytes(host: Host, dir: string): Promise<number | undefined> {
  const r = await host.run(['du', '-sk', dir], { timeoutMs: 30_000 }).catch(() => null)
  const k = Number(r?.exitCode === 0 ? r.stdout.trim().split(/\s+/)[0] : NaN)
  return Number.isFinite(k) && r?.stdout.trim() ? k * 1024 : undefined
}

/**
 * Everything the doctor finds now, in the order the list shows it (and the fixes run in), and the merge going on
 * (if any: the check is read-only, so it still runs, but the task being merged has its folder and branch only listed
 * as "being merged"); or the reason it doesn't run (the project folder isn't known).
 */
export async function doctorCheck(host: Host): Promise<{ found: Found[]; merging: Merging | null } | string> {
  if (!S.root) return `${S.N.name} doesn't know the project folder yet; try again in a moment.`
  const b = await load(host).catch(() => null)
  const merging = await mergeRuns(host, b)
  return { found: await findAll(host, b, merging?.id), merging }
}

/** What doctorCheck finds; `mergingId` is the task being merged now (its folder and branch are left alone). */
async function findAll(host: Host, b: Board | null, mergingId: string | undefined): Promise<Found[]> {
  const dir = path(S.N.dir)
  const shown = (p: string) => (p.startsWith(`${S.root}/`) ? p.slice(S.root.length + 1) : p)
  const archived = await readArchiveFile(host).then(r => (r.broken ? [] : r.archive.tasks), () => [] as BoardTask[])
  const taskOf = (id: string): BoardTask | undefined => b?.tasks.find(t => t.id === id) ?? archived.find(t => t.id === id)
  const agents = await agentsNow(host)
  const backups: Found[] = []
  const data: Found[] = []
  const trees: Found[] = []
  const prunes: Found[] = []
  const branches: Found[] = []
  const listed: Found[] = []

  // 1. the data folder: old migration backups, files near the read limit, stray files
  const top = await host.fs.list(dir).catch(() => [])
  // T-804: what is still in an old shape (read-only count); `fix` saves every data file once in today's shape, after a backup
  const old = await oldDataFound(host).catch(() => null)
  if (old?.rows.length) {
    const item: Found = {
      kind: 'data', fixable: old.fixable, id: MIGRATE_ID, text: `old data shapes: ${oldRowsText(old.rows)}`,
      fix: async () => {
        const r = await migrateData(host)
        item.done = r.done
        return r.failed
      },
    }
    data.push(item)
  }
  const isBackup = (e: { kind: string; name: string }) => (e.kind === 'file' || e.kind === 'dir') && e.name.includes(BACKUP_MARK)
  const ids = backupIds(top.filter(isBackup).map(e => e.name))
  for (const f of oldBackups(top.filter(e => e.kind === 'file' || isBackup(e)))) {
    const file = `${dir}/${f.name}`
    // a folder's own size is not its files' (T-854): ask du, and fall back to the listing
    const bytes = f.kind === 'dir' ? ((await folderBytes(host, file)) ?? f.size) : f.size
    backups.push({
      kind: 'backup', fixable: true, id: ids.get(f.name)!, bytes, text: `old migration backup ${shown(file)} (a newer one is kept)`,
      fix: async () => {
        if (!f.name.includes(BACKUP_MARK)) return 'not a backup'
        const r = await host.run(f.kind === 'dir' ? ['rm', '-rf', file] : ['rm', '-f', file]).catch((e: unknown) => ({ exitCode: 1, stdout: '', stderr: String(e) }))
        return r.exitCode === 0 ? '' : `rm failed: ${(r.stderr || r.stdout).trim().slice(0, 120)}`
      },
    })
  }
  const parts = await host.fs.list(`${dir}/${PARTS_DIR}`).catch(() => [])
  for (const [where, list] of [[dir, top], [`${dir}/${PARTS_DIR}`, parts]] as const)
    for (const f of list)
      if (f.kind === 'file' && f.name.endsWith('.json') && !f.name.includes('.before-') && f.size > SIZE_WARN_BYTES)
        listed.push({ kind: 'size', fixable: false, bytes: f.size, text: `${shown(`${where}/${f.name}`)} is ${f.size > READ_LIMIT_BYTES ? 'over' : 'close to'} the ${mbText(READ_LIMIT_BYTES)} limit on reading one file whole` })
  for (const f of top) {
    if (f.name === '.DS_Store') listed.push({ kind: 'stray', fixable: false, bytes: f.size, text: `stray file ${shown(`${dir}/${f.name}`)}` })
    if (f.kind === 'dir' && STRAY_DIRS.includes(f.name) && !(await host.fs.list(`${dir}/${f.name}`).catch(() => [{}])).length)
      listed.push({ kind: 'stray', fixable: false, text: `empty folder ${shown(`${dir}/${f.name}`)}/` })
  }

  // without a board, no task's state is known: folders, worktree entries and branches are all left alone
  if (!b) {
    listed.push({ kind: 'board', fixable: false, text: `the board can't be read, so folders and branches are left alone (${S.N.boardFile} needs fixing first)` })
    await leadCheck(host, listed)
    return [...data, ...backups, ...listed]
  }

  // 2. task folders (.<name>/worktrees/T-n) of tasks that are done or dropped (a folder of a task not on the board is only listed)
  const wtRoot = path(S.N.worktrees)
  /** The folders kept below (not offered), by path: a branch checked out in one of them can't be deleted. */
  const keptDirs = new Map<string, string>()
  for (const e of (await host.fs.list(wtRoot).catch(() => [])).filter(x => x.kind === 'dir').sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))) {
    const id = e.name
    const t = taskOf(id)
    const wt = `${wtRoot}/${id}`
    if (id === mergingId) {
      listed.push({ kind: 'worktree', fixable: false, text: `folder ${shown(wt)}/ (${id} is being merged), left alone` })
      keptDirs.set(wt, 'is being merged')
      continue
    }
    if (t && !isFinished(t)) continue
    if (!t) {
      listed.push({ kind: 'worktree', fixable: false, text: `folder ${shown(wt)}/ (${id} is not on the board), kept; remove it by hand if you don't need it` })
      keptDirs.set(wt, 'is not on the board')
      continue
    }
    const why = `${id} is ${t.status}`
    const into = intoOf(t)
    if (inUse(id, t, agents)) {
      listed.push({ kind: 'worktree', fixable: false, text: `folder ${shown(wt)}/ (${why}): an agent may still use it, kept` })
      keptDirs.set(wt, 'an agent may still use it')
      continue
    }
    if (!(await host.fs.exists(`${wt}/.git`).catch(() => false))) {
      listed.push({ kind: 'worktree', fixable: false, text: `folder ${shown(wt)}/ (${why}) is not a git worktree; remove it by hand if you don't need it` })
      keptDirs.set(wt, 'is not a git worktree')
      continue
    }
    const bytes = await folderBytes(host, wt)
    if (await dirty(host, wt)) {
      listed.push({ kind: 'worktree', fixable: false, bytes, text: `folder ${shown(wt)}/ (${why}) has uncommitted changes, kept` })
      keptDirs.set(wt, 'has uncommitted changes')
      continue
    }
    if (!(await headKept(host, wt, into))) {
      listed.push({ kind: 'worktree', fixable: false, bytes, text: `folder ${shown(wt)}/ (${why}) holds commits on no branch, kept` })
      keptDirs.set(wt, 'holds commits on no branch')
      continue
    }
    trees.push({
      kind: 'worktree', fixable: true, id: folderId(id), bytes, text: `folder ${shown(wt)}/ (${why})`,
      fix: async () => {
        const nb = await load(host).catch(() => null)
        if (!nb) return "the board can't be read now"
        const nt = nb.tasks.find(x => x.id === id)
        if (nt && !isFinished(nt)) return `${id} is ${nt.status} now`
        if (inUse(id, nt ?? taskOf(id), await agentsNow(host))) return 'an agent may still use it'
        if (await dirty(host, wt)) return 'it has uncommitted changes now'
        if (!(await headKept(host, wt, into))) return 'it holds commits on no branch now'
        // no --force: git itself refuses a folder with changes
        const r = await git(host, ['worktree', 'remove', wt])
        return r.exitCode === 0 ? '' : `git worktree remove: ${(r.stderr || r.stdout).trim().slice(0, 150)}`
      },
    })
  }

  // 3. git worktree entries whose folder is gone
  const dry = await git(host, ['worktree', 'prune', '--dry-run', '-v']).catch(() => null)
  const stale = dry && dry.exitCode === 0 ? pruneLines(`${dry.stdout}\n${dry.stderr}`) : []
  if (stale.length)
    prunes.push({
      kind: 'prune', fixable: true, id: PRUNE_ID, text: `${stale.length} git worktree ${stale.length === 1 ? 'entry' : 'entries'} whose folder is gone (git worktree prune)`,
      fix: async () => {
        const r = await git(host, ['worktree', 'prune'])
        return r.exitCode === 0 ? '' : `git worktree prune: ${(r.stderr || r.stdout).trim().slice(0, 150)}`
      },
    })

  // 4. task branches (<name>/T-n) of done and dropped tasks: deleted only when their tip is in the branch they merge into
  // where each branch is checked out (git worktree list): such a branch can't be deleted while its folder stays
  const wl = await git(host, ['worktree', 'list', '--porcelain']).catch(() => null)
  const outAt = new Map<string, string>()
  let at = ''
  for (const l of (wl?.exitCode === 0 ? wl.stdout : '').split('\n').map(x => x.trim())) {
    if (l.startsWith('worktree ')) at = l.slice('worktree '.length)
    else if (l.startsWith('branch refs/heads/')) outAt.set(l.slice('branch refs/heads/'.length), at)
  }
  const offered = new Set(trees.map(f => f.id))
  const refs = await git(host, ['for-each-ref', '--format=%(refname:short) %(objectname)', `refs/heads/${S.N.branch('')}`]).catch(() => null)
  const rows = (refs?.exitCode === 0 ? refs.stdout : '').split('\n').map(l => l.trim().split(/\s+/)).filter(r => r.length === 2) as [string, string][]
  for (const [br, sha] of rows.sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true }))) {
    const id = br.slice(S.N.branch('').length)
    const t = taskOf(id)
    if (id === mergingId) {
      listed.push({ kind: 'branch', fixable: false, text: `branch ${br} (${id} is being merged), left alone` })
      continue
    }
    if (!t || !isFinished(t)) continue
    const into = intoOf(t)
    const anc = await git(host, ['merge-base', '--is-ancestor', sha, `refs/heads/${into}`]).catch(() => null)
    if (anc?.exitCode === 0) {
      const folder = outAt.get(br)
      // checked out in a folder that is kept (or the project folder itself): git refuses to delete it, so only list it
      if (wl?.exitCode !== 0 || (folder !== undefined && !(folder === `${wtRoot}/${id}` && offered.has(folderId(id))))) {
        const why = wl?.exitCode !== 0 ? 'git could not tell where it is checked out' : keptDirs.get(folder!) === 'has uncommitted changes' ? 'checked out in a folder with uncommitted changes' : `checked out in ${shown(folder!)}/`
        listed.push({ kind: 'branch', fixable: false, text: `branch ${br} (${id} is ${t.status}; all of it is already in ${into}): kept: ${why}` })
        continue
      }
      const after = folder !== undefined ? ` (goes after its folder, ${folderId(id)})` : ''
      branches.push({
        kind: 'branch', fixable: true, id: branchId(id), text: `branch ${br} (${id} is ${t.status}; all of it is already in ${into})${after}`,
        fix: async () => ((await deleteMergedBranch(host, br, into)) ? '' : `it is no longer all in ${into}, or it is still checked out in a folder${after ? ` (clean up ${folderId(id)} too)` : ''}`),
      })
      continue
    }
    const n = anc?.exitCode === 1 ? await git(host, ['rev-list', '--count', `refs/heads/${into}..${sha}`]).catch(() => null) : null
    const count = n?.exitCode === 0 ? Number(n.stdout.trim()) : NaN
    listed.push({ kind: 'branch', fixable: false, text: `branch ${br} (${id} is ${t.status}) holds unmerged work${Number.isFinite(count) && count > 0 ? ` (${count} commit${count === 1 ? '' : 's'} not in ${into})` : ''}; never deleted by the doctor` })
  }

  // 5. the board: who drives it, and running tasks with no worker
  const nowMs = Date.now()
  const leadText = await leadCheck(host, listed)
  const driver = liveDriver(leadText, nowMs)
  // another live session's workers aren't in this session's agent list: only the driver (or nobody) can tell
  if (b && agents && (!driver || driver === S.me))
    for (const t of b.tasks) {
      // the task being merged has no worker on purpose: never tell the owner to retry it
      if (t.status !== 'doing' || t.id === mergingId || inUse(t.id, t, agents)) continue
      const run = t.runs?.at(-1)
      const since = run?.started ? activeFrom(run, Date.parse(run.started)) : Date.parse(t.updated_at)
      const min = Number.isFinite(since) ? Math.round((nowMs - since) / 60_000) : NaN
      if (!(min >= DOCTOR_STUCK_MIN)) continue
      listed.push({ kind: 'board', fixable: false, text: `${t.id} is running but has no live worker (for ${min} min): /${S.N.name}-task ${t.id} retry${driver ? '' : `, or /${S.N.name}-drive so the regular check takes it back`}` })
    }

  return [...data, ...backups, ...trees, ...prunes, ...branches, ...listed]
}

/**
 * /<name>-doctor with its words `args` (and the lead's doctor tool): no words lists what it finds; "fix" cleans up
 * every item offered now, "fix b-T-5 m-1101-1000" only the items with those ids that are still offered (an id the
 * list no longer has is named and skipped, never matched to another item).
 */
export async function doctor(host: Host, args: string): Promise<string> {
  const ask = parseDoctorArgs(args, S.N.name)
  if ('bad' in ask) return ask.bad
  const check = await doctorCheck(host)
  if (typeof check === 'string') return check
  const { found, merging } = check
  const list = doctorText(found, S.N.name, S.N.dir)
  // the list is read-only, so it runs during a merge too; only the fixes wait for the merge to end
  if (merging) return `${(ask.fix === null ? mergeNoteText : mergeRunsText)(S.N.name, merging.id)}\n${list}`
  if (ask.fix === null) return list
  const fixable = found.filter(f => f.fixable && f.fix && f.id)
  const want = ask.fix
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const picked = want === 'all' ? fixable : fixable.filter(f => want.some(w => same(w, f.id!)))
  const gone = want === 'all' ? [] : want.filter(w => !fixable.some(f => same(w, f.id!)))
  const done: DoctorFixed[] = []
  // in list order: task folders go before their branches, so a branch freed by its folder's removal can go too
  for (const f of picked) {
    const failed = await f.fix!().catch((e: Error) => String(e?.message ?? e).slice(0, 150))
    done.push({ id: f.id!, text: f.text, ...(f.bytes !== undefined ? { bytes: f.bytes } : {}), failed, ...(f.done ? { done: f.done } : {}) })
  }
  return fixedText(done, S.N.name, gone)
}
