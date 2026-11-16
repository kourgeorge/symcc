// A small made-up disk with symbolic links (T-303): the test runner has no real file system, so the real-path
// checks are tested against this instead. `entries` maps a real absolute path to 'dir', 'file' or '-> target'
// (a symbolic link; a relative target is taken from the link's folder). Lookups behave like the system's:
// links are followed, and ".." after a link goes up from where the link leads.
import { type PathLookup, resolvePath } from '../hooks/board'

const parent = (p: string) => resolvePath('/', `${p}/..`)

export function fakeDisk(entries: Record<string, string>): PathLookup & { list(dir: string): { name: string; isLink: boolean }[] } {
  const all: Record<string, string> = { '/': 'dir', ...entries }
  const real = async (p: string): Promise<string | undefined> => {
    let cur = '/'
    for (const part of p.split('/').filter(x => x && x !== '.')) {
      if (part === '..') {
        cur = parent(cur)
        continue
      }
      if (all[cur] !== 'dir') return undefined
      let next = resolvePath(cur, part)
      for (let hops = 0; all[next]?.startsWith('-> '); hops++) {
        if (hops > 40) return undefined
        next = (await real(resolvePath(parent(next), all[next]!.slice(3)))) ?? ''
      }
      if (!all[next]) return undefined
      cur = next
    }
    return cur
  }
  const list = (dir: string) =>
    Object.keys(all)
      .filter(k => k !== '/' && parent(k) === dir)
      .map(k => ({ name: k.slice(dir.length + (dir === '/' ? 0 : 1)), isLink: all[k]!.startsWith('-> ') }))
  return { real, list, isLink: async (dir, name) => list(dir).some(e => e.name === name && e.isLink) }
}
