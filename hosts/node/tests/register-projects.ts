// T-1196: a board's projects are a table in board.json. These tests put their repo folders below the board, so after
// `symcc-init` they write the table the way the one-time move does: each folder holding .git, path <board>/<name>.
import { readFile, writeFile, access } from 'node:fs/promises'
import { runCommand } from '../host'

export async function registerProjects(board: string): Promise<string[]> {
  const names: string[] = []
  for (const e of (await runCommand(['ls'], { cwd: board })).stdout.split('\n').filter(Boolean)) {
    if (await access(`${board}/${e}/.git`).then(() => true, () => false)) names.push(e)
  }
  const file = `${board}/.symcc/board.json`
  const raw = JSON.parse(await readFile(file, 'utf8')) as { projects?: Record<string, Record<string, unknown>> }
  const projects = { ...(raw.projects ?? {}) }
  for (const n of names) projects[n] = { ...(projects[n] ?? {}), path: `${board}/${n}` }
  await writeFile(file, JSON.stringify({ ...raw, projects }, null, 2))
  return names
}
