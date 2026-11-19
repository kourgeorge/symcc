// T-527: the code (git tree) whose pre-merge test run passed, with the test commands it ran, kept per board in
// <data folder>/passed-trees.json, so the same code with the same commands is not tested again before a merge.
// A tree id is the content of every file, so any change to the work, to the target branch merged in, or to the
// test commands gives a different key. Pure functions only; app/review.ts reads and writes the file.

/** The file in the board folder that keeps the passed trees. */
export const PASSED_TREES_FILE = 'passed-trees.json'
/** How many passed trees are kept (the newest ones), so the file stays small. */
export const PASSED_TREES_MAX = 200

/** One passed run: the tested tree, the test commands exactly as set, and when (ms). */
export type PassedTree = { tree: string; commands: string[]; at: number }

/** Whether `s` looks like a git object id (sha-1 or sha-256). */
export const isTreeId = (s: string) => /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(s)

/** The passed trees in `text` (the file's contents); anything that can't be read counts as none. */
export function parsePassedTrees(text: string | null): PassedTree[] {
  if (!text) return []
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return []
  }
  const list = v && typeof v === 'object' && Array.isArray((v as { passed?: unknown }).passed) ? (v as { passed: unknown[] }).passed : []
  return list.filter((e): e is PassedTree => {
    const x = e as Partial<PassedTree> | null
    return !!x && typeof x.tree === 'string' && isTreeId(x.tree) && Array.isArray(x.commands) && x.commands.every(c => typeof c === 'string') && typeof x.at === 'number'
  })
}

const sameCommands = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c, i) => c === b[i])

/** Whether tree `tree` already passed with exactly these test `commands`. */
export const treePassed = (list: readonly PassedTree[], tree: string, commands: readonly string[]) => isTreeId(tree) && list.some(e => e.tree === tree && sameCommands(e.commands, commands))

/** `list` with tree `tree` passed with `commands` at `at` (newest last; an older same entry is dropped), the newest PASSED_TREES_MAX kept. */
export function addPassedTree(list: readonly PassedTree[], tree: string, commands: readonly string[], at: number): PassedTree[] {
  const rest = list.filter(e => !(e.tree === tree && sameCommands(e.commands, commands)))
  return [...rest, { tree, commands: [...commands], at }].slice(-PASSED_TREES_MAX)
}

/** The file's text for `list`. */
export const passedTreesText = (list: readonly PassedTree[]) => JSON.stringify({ passed: list }) + '\n'

/** What the task's history and the lead's update say when the run was skipped. */
export const testsSkippedText = (tree: string) => `tests: this exact code already passed (tree ${tree.slice(0, 7)}); not run again`
