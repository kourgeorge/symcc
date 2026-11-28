// T-1199: the lead (or the owner) adds, changes and removes projects: a name -> repo path table in board.json.
import { isFinished, isProjectName, type Board } from '../board'
import type { Host } from '../host'
import { S } from './state'
import { loadScouts } from './scouts'
import { change, load } from './store'
import { git, repoOf, worktreeDir, taskBranch, branchExists } from './git'

/** The path as given with `~` and a trailing slash dealt with; relative paths are refused by the caller. */
const expand = (p: string): string => {
  const t = p.trim()
  const home = S.home.replace(/\/+$/, '')
  const x = t === '~' ? home : t.startsWith('~/') ? `${home}/${t.slice(2)}` : t
  return x.length > 1 ? x.replace(/\/+$/, '') : x
}

const openOf = (b: Board, name: string) => b.tasks.filter(t => !isFinished(t) && (t as { project?: string }).project === name)

/** Why a project path can't be added (a plain reason), or the repo's real top folder. */
async function checkRepo($: Host, path: string): Promise<{ error: string } | { top: string }> {
  if (!path.startsWith('/')) return { error: `Nothing changed: the path must be a full path (starting with / or ~), got '${path.slice(0, 200)}'` }
  if (!(await $.fs.exists(path).catch(() => false))) return { error: `Nothing changed: ${path} does not exist` }
  const r = await git($, ['rev-parse', '--show-toplevel', '--show-prefix'], path, 15_000).catch(() => null)
  if (!r || r.exitCode !== 0) return { error: `Nothing changed: ${path} is not a git repo` }
  const [top, prefix] = r.stdout.split('\n')
  if (!top) return { error: `Nothing changed: ${path} is not a git repo` }
  if ((prefix ?? '').trim() !== '') return { error: `Nothing changed: ${path} is a folder inside the repo ${top}, not the repo's top folder; give ${top}` }
  const real = top.trim()
  if (real.split('/').includes(S.N.dir)) return { error: `Nothing changed: ${path} is inside a ${S.N.dir} folder` }
  const head = await git($, ['rev-parse', '--verify', '-q', 'HEAD'], real, 15_000).catch(() => null)
  if (!head || head.exitCode !== 0) return { error: `Nothing changed: the repo ${real} has no commits yet` }
  if (await $.fs.exists(`${real}/${S.N.boardFile.replace(/^\/+/, '')}`).catch(() => false)) return { error: `Nothing changed: the repo ${real} has a ${S.N.name} board of its own (${S.N.boardFile}); a project can't be a repo with its own board` }
  return { top: real }
}

/** Checks `rawPath` (a repo's top folder that no other project has) and saves it as project `name`'s path; `skip`
 *  is the project not counted as "another" (its own name when changing). `ready` is asked after the path checks,
 *  right before saving. Returns the saved top folder, or an error. */
async function savePath($: Host, b: Board, name: string, rawPath: string, skip: string | null, ready: () => Promise<{ error: string } | null> = async () => null): Promise<{ error: string } | { top: string }> {
  const c = await checkRepo($, expand(rawPath))
  if ('error' in c) return c
  const same = Object.entries(b.projects ?? {}).find(([n, p]) => n !== skip && p.path === c.top)
  if (same) return { error: `Nothing changed: ${c.top} is already the project '${same[0]}'` }
  const no = await ready()
  if (no) return no
  await change($, x => [{ ...x, projects: { ...(x.projects ?? {}), [name]: { ...(x.projects?.[name] ?? {}), path: c.top } } } as Board, null])
  return c
}

/** Adds project `name` at `rawPath` (nothing else is set); returns the answer text, or an error. */
export async function addProject($: Host, name: string, rawPath: string): Promise<{ error: string } | { text: string }> {
  if (!isProjectName(name)) return { error: `Nothing changed: '${String(name).slice(0, 80)}' is not a project name (letters, digits, . _ - only)` }
  const b = await load($)
  if (b.projects?.[name]?.path) return { error: `Nothing changed: the project name '${name}' is taken (path ${b.projects[name]?.path})` }
  const c = await savePath($, b, name, rawPath, null)
  return 'error' in c ? c : { text: `project ${name} added: ${c.top}` }
}

/** Points project `name` at another repo path, only while no open task of it has a copy or a branch. */
export async function changeProjectPath($: Host, name: string, rawPath: string): Promise<{ error: string } | { text: string }> {
  const b = await load($)
  if (!Object.prototype.hasOwnProperty.call(b.projects ?? {}, name)) return { error: `Nothing changed: '${name}' is not a project here; add it with project and path` }
  // an open task's copy or branch is looked for after the path checks, so their errors come first
  const c = await savePath($, b, name, rawPath, name, async () => {
    for (const t of openOf(b, name)) {
      const old = S.projects[name]
      const has = (await $.fs.exists(`${worktreeDir(t.id)}/.git`).catch(() => false)) || (!!old && (await branchExists($, taskBranch(t), repoOf(t)).catch(() => false)))
      if (has) return { error: `Nothing changed: ${t.id} of project ${name} already has a copy or a branch in ${S.projects[name] ?? 'its repo'}; finish or drop it first` }
    }
    return null
  })
  return 'error' in c ? c : { text: `project ${name} now points at ${c.top}` }
}

/** Removes project `name` (its path and its test commands), refused while an open task uses it. */
export async function removeProject($: Host, name: string): Promise<{ error: string } | { text: string }> {
  const b = await load($)
  if (!Object.prototype.hasOwnProperty.call(b.projects ?? {}, name)) return { error: `Nothing changed: '${name}' is not a project here` }
  const open = openOf(b, name)
  if (open.length) return { error: `Nothing changed: ${open.map(t => t.id).slice(0, 8).join(', ')} still use${open.length === 1 ? 's' : ''} project ${name}; finish or drop ${open.length === 1 ? 'it' : 'them'} first` }
  const naming = (await loadScouts($)).filter(x => x.projects?.includes(name)).map(x => x.name)
  if (naming.length) return { error: `Nothing changed: scout${naming.length === 1 ? '' : 's'} ${naming.join(', ')} still name${naming.length === 1 ? 's' : ''} project ${name}; change ${naming.length === 1 ? 'its' : 'their'} projects: line first` }
  await change($, x => {
    const { [name]: _gone, ...rest } = x.projects ?? {}
    const { projects: _old, ...others } = x
    return [(Object.keys(rest).length ? { ...others, projects: rest } : others) as Board, null]
  })
  return { text: `project ${name} removed` }
}
