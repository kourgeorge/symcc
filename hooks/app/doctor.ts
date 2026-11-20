// /<name>-doctor and the lead's doctor tool (T-676): checks the project's data folder (.<name>/) and git, lists what
// it found with sizes, and cleans up only what the owner confirms (core/doctor.ts has the pure part). Each fix checks
// again right before it acts, so nothing unmerged, uncommitted or in use is ever deleted. Reports, org-mem, scouts,
// roles and kinds are never touched: only migration backups, task folders of finished tasks, stale git worktree
// entries and task branches already in their branch can be cleaned up.
import { type BoardTask, type Board, liveWorkersFor, intoOf, finishingNow, checkStepNow, parseLead, isFresh, liveDriver } from '../board'
import { type DoctorItem, oldBackups, parseDoctorArgs, doctorText, fixedText, type DoctorFixed, mergeRunsText, pruneLines, STRAY_DIRS, DOCTOR_STUCK_MIN, BACKUP_MARK } from '../core/doctor'
import { SIZE_WARN_BYTES, READ_LIMIT_BYTES, PARTS_DIR, mbText } from '../core/board-parts'
import { type Host, agentState } from '../host'
import { S, workers, starting, finishing, approving } from './state'
import { load, path } from './store'
import { readArchiveFile } from './archive'
import { git, deleteMergedBranch } from './git'

/** A found item with its fix (fixable ones): answers '' when done, else why it was not done. */
type Found = DoctorItem & { fix?: () => Promise<string> }

const FINISHED = ['done', 'dropped']

/** Whether a merge is going on now: a task's work being checked or merged (in any session), or a git merge in the project folder. */
async function mergeRuns(host: Host, b: Board | null): Promise<string | null> {
  const nowMs = Date.now()
  const t = b?.tasks.find(x => finishingNow(x, nowMs) || !!checkStepNow(x, nowMs))
  if (t) return mergeRunsText(S.N.name, t.id)
  const mine = [...finishing, ...approving][0]
  if (mine) return mergeRunsText(S.N.name, mine)
  const m = await git(host, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).catch(() => null)
  if (m?.exitCode === 0 && m.stdout.trim()) return mergeRunsText(S.N.name)
  return null
}

/** The live agents of this session, or null when they can't be told. */
const agentsNow = (host: Host) => host.agents.list().then(a => a.map(agentState), () => null)

/** Whether a worker of this copy (or a live agent) works on task `id` now. */
function inUse(id: string, t: BoardTask | undefined, agents: ReturnType<typeof agentState>[] | null): boolean {
  if ([...workers.values()].some(w => w.task === id) || starting.has(id) || finishing.has(id) || approving.has(id)) return true
  if (!agents) return true
  return liveWorkersFor({ id, agent: t?.agent }, agents, S.N.name).length > 0
}

/** Whether folder `dir` (a git worktree) has uncommitted changes; true also when git can't tell. */
async function dirty(host: Host, dir: string): Promise<boolean> {
  const st = await git(host, ['status', '--porcelain'], dir).catch(() => null)
  return !st || st.exitCode !== 0 || !!st.stdout.trim()
}

/** A folder's size in bytes by `du -sk`, or undefined when it can't be told. */
async function folderBytes(host: Host, dir: string): Promise<number | undefined> {
  const r = await host.run(['du', '-sk', dir], { timeoutMs: 30_000 }).catch(() => null)
  const k = Number(r?.exitCode === 0 ? r.stdout.trim().split(/\s+/)[0] : NaN)
  return Number.isFinite(k) && r?.stdout.trim() ? k * 1024 : undefined
}

/**
 * Everything the doctor finds now, in the order the list shows it (the fixable ones numbered in this order), or the
 * reason it doesn't run (a merge is in progress, or the project folder isn't known).
 */
export async function doctorCheck(host: Host): Promise<Found[] | string> {
  if (!S.root) return `${S.N.name} doesn't know the project folder yet; try again in a moment.`
  const b = await load(host).catch(() => null)
  const merging = await mergeRuns(host, b)
  if (merging) return merging
  const dir = path(S.N.dir)
  const shown = (p: string) => (p.startsWith(`${S.root}/`) ? p.slice(S.root.length + 1) : p)
  const archived = await readArchiveFile(host).then(r => (r.broken ? [] : r.archive.tasks), () => [] as BoardTask[])
  const taskOf = (id: string): BoardTask | undefined => b?.tasks.find(t => t.id === id) ?? archived.find(t => t.id === id)
  const agents = await agentsNow(host)
  const backups: Found[] = []
  const trees: Found[] = []
  const prunes: Found[] = []
  const branches: Found[] = []
  const listed: Found[] = []

  // 1. the data folder: old migration backups, files near the read limit, stray files
  const top = await host.fs.list(dir).catch(() => [])
  for (const f of oldBackups(top.filter(e => e.kind === 'file'))) {
    const file = `${dir}/${f.name}`
    backups.push({
      kind: 'backup', fixable: true, bytes: f.size, text: `old migration backup ${shown(file)} (a newer one is kept)`,
      fix: async () => {
        if (!f.name.includes(BACKUP_MARK)) return 'not a backup'
        const r = await host.run(['rm', '-f', file]).catch((e: unknown) => ({ exitCode: 1, stdout: '', stderr: String(e) }))
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

  // 2. task folders (.<name>/worktrees/T-n) of tasks that are done, dropped or gone from the board
  const wtRoot = path(S.N.worktrees)
  for (const e of (await host.fs.list(wtRoot).catch(() => [])).filter(x => x.kind === 'dir').sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))) {
    const id = e.name
    const t = taskOf(id)
    if (t && !FINISHED.includes(t.status)) continue
    const wt = `${wtRoot}/${id}`
    const why = t ? `${id} is ${t.status}` : `${id} is not on the board`
    if (inUse(id, t, agents)) {
      listed.push({ kind: 'worktree', fixable: false, text: `folder ${shown(wt)}/ (${why}): an agent may still use it, kept` })
      continue
    }
    if (!(await host.fs.exists(`${wt}/.git`).catch(() => false))) {
      listed.push({ kind: 'worktree', fixable: false, text: `folder ${shown(wt)}/ (${why}) is not a git worktree; remove it by hand if you don't need it` })
      continue
    }
    const bytes = await folderBytes(host, wt)
    if (await dirty(host, wt)) {
      listed.push({ kind: 'worktree', fixable: false, bytes, text: `folder ${shown(wt)}/ (${why}) has uncommitted changes, kept` })
      continue
    }
    trees.push({
      kind: 'worktree', fixable: true, bytes, text: `folder ${shown(wt)}/ (${why})`,
      fix: async () => {
        if (inUse(id, taskOf(id), await agentsNow(host))) return 'an agent may still use it'
        if (await dirty(host, wt)) return 'it has uncommitted changes now'
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
      kind: 'prune', fixable: true, text: `${stale.length} git worktree ${stale.length === 1 ? 'entry' : 'entries'} whose folder is gone (git worktree prune)`,
      fix: async () => {
        const r = await git(host, ['worktree', 'prune'])
        return r.exitCode === 0 ? '' : `git worktree prune: ${(r.stderr || r.stdout).trim().slice(0, 150)}`
      },
    })

  // 4. task branches (<name>/T-n) of done and dropped tasks: deleted only when their tip is in the branch they merge into
  const refs = await git(host, ['for-each-ref', '--format=%(refname:short) %(objectname)', `refs/heads/${S.N.branch('')}`]).catch(() => null)
  const rows = (refs?.exitCode === 0 ? refs.stdout : '').split('\n').map(l => l.trim().split(/\s+/)).filter(r => r.length === 2) as [string, string][]
  for (const [br, sha] of rows.sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true }))) {
    const id = br.slice(S.N.branch('').length)
    const t = taskOf(id)
    if (!t || !FINISHED.includes(t.status)) continue
    const into = intoOf(t)
    const anc = await git(host, ['merge-base', '--is-ancestor', sha, `refs/heads/${into}`]).catch(() => null)
    if (anc?.exitCode === 0) {
      branches.push({ kind: 'branch', fixable: true, text: `branch ${br} (${id} is ${t.status}; all of it is already in ${into})`, fix: async () => ((await deleteMergedBranch(host, br, into)) ? '' : `it is no longer all in ${into}, or it is still checked out in a folder`) })
      continue
    }
    const n = anc?.exitCode === 1 ? await git(host, ['rev-list', '--count', `refs/heads/${into}..${sha}`]).catch(() => null) : null
    const count = n?.exitCode === 0 ? Number(n.stdout.trim()) : NaN
    listed.push({ kind: 'branch', fixable: false, text: `branch ${br} (${id} is ${t.status}) holds unmerged work${Number.isFinite(count) && count > 0 ? ` (${count} commit${count === 1 ? '' : 's'} not in ${into})` : ''}; never deleted by the doctor` })
  }

  // 5. the board: who drives it, and running tasks with no worker
  const nowMs = Date.now()
  const leadText = await host.fs.read(path(S.N.leadFile)).catch(() => null)
  const lead = parseLead(leadText)
  if (lead && !isFresh(lead.heartbeat, nowMs))
    listed.push({ kind: 'board', fixable: false, text: `${S.N.leadFile} names a session that stopped ${Math.round((nowMs - lead.heartbeat) / 60_000)} min ago, so no session drives the board: /${S.N.name}-drive makes this one drive it` })
  const driver = liveDriver(leadText, nowMs)
  // another live session's workers aren't in this session's agent list: only the driver (or nobody) can tell
  if (b && agents && (!driver || driver === S.me))
    for (const t of b.tasks) {
      if (t.status !== 'doing' || inUse(t.id, t, agents)) continue
      const since = Date.parse(t.runs?.at(-1)?.started ?? t.updated_at)
      const min = Number.isFinite(since) ? Math.round((nowMs - since) / 60_000) : NaN
      if (!(min >= DOCTOR_STUCK_MIN)) continue
      listed.push({ kind: 'board', fixable: false, text: `${t.id} is running but has no live worker (for ${min} min): /${S.N.name}-task ${t.id} retry${driver ? '' : `, or /${S.N.name}-drive so the regular check takes it back`}` })
    }

  return [...backups, ...trees, ...prunes, ...branches, ...listed]
}

/**
 * /<name>-doctor with its words `args` (and the lead's doctor tool): no words lists what it finds; "fix" cleans up
 * every numbered item, "fix 1 3" only those (the numbers of the list as it is now).
 */
export async function doctor(host: Host, args: string): Promise<string> {
  const ask = parseDoctorArgs(args, S.N.name)
  if ('bad' in ask) return ask.bad
  const found = await doctorCheck(host)
  if (typeof found === 'string') return found
  if (ask.fix === null) return doctorText(found, S.N.name, S.N.dir)
  const fixable = found.filter(f => f.fixable && f.fix)
  const wrong = ask.fix === 'all' ? [] : ask.fix.filter(n => n > fixable.length)
  if (wrong.length) return `Nothing changed: there is no item ${wrong.join(', ')} (the list has ${fixable.length} to clean up). See /${S.N.name}-doctor.`
  const picked = ask.fix === 'all' ? fixable.map((_, i) => i + 1) : ask.fix
  const done: DoctorFixed[] = []
  // in list order: task folders go before their branches, so a branch freed by its folder's removal can go too
  for (const n of picked) {
    const f = fixable[n - 1]!
    const failed = await f.fix!().catch((e: Error) => String(e?.message ?? e).slice(0, 150))
    done.push({ n, text: f.text, ...(f.bytes !== undefined ? { bytes: f.bytes } : {}), failed })
  }
  return fixedText(done, S.N.name)
}
