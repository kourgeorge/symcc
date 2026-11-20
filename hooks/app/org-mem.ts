// T-600, T-620: organizational memory (org-mem) on disk (<project>/.<name>/org-mem.md; the pure parts are in core/org-mem.ts).
// A worker's or checker's report adds its "Learned:" lines (learnFrom); every new worker, checker and scout gets the
// org-mem in its prompt (orgMemText). The owner and the lead may edit or trim the file by hand.
import { addLearned, orgMemFile, orgMemSection } from '../core/org-mem'
import type { Host } from '../host'
import { S } from './state'
import { now, oneAtATime, path, safeWrite } from './store'

/** Org-mem's text, or null when it is missing or can't be read. */
async function readGuide(host: Host): Promise<string | null> {
  try {
    return await host.fs.read(path(orgMemFile(S.N.dir)))
  } catch {
    return null
  }
}

/** Org-mem as a new agent's prompt shows it (see orgMemSection): '' when the file is missing, empty or can't be read. */
export async function orgMemText(host: Host): Promise<string> {
  return orgMemSection(await readGuide(host), orgMemFile(S.N.dir))
}

/**
 * Adds the "Learned:" lines of task `id`'s report `answer` to org-mem (see addLearned), one save at a time. Nothing
 * is written when the report has no new lines. Never throws: org-mem is a help, so a failure only loses the lines.
 */
export async function learnFrom(host: Host, id: string, answer: string): Promise<void> {
  if (S.guardOnly || !S.root) return
  const file = orgMemFile(S.N.dir)
  await oneAtATime(file, async () => {
    const old = await readGuide(host)
    const { text, added } = addLearned(old, answer, id, now().slice(0, 10))
    if (added.length) await safeWrite(host, path(file), text, 'the organizational memory (org-mem)')
  }).catch(() => undefined)
}

/**
 * T-620: the one-time move of the old notes file (.<name>/field-guide.md, its name before T-620) to org-mem.md, at
 * session start. Only when the old file exists and org-mem.md doesn't; nothing else reads the old name. Never throws.
 */
export async function moveOldOrgMem(host: Host): Promise<void> {
  if (S.guardOnly || !S.root) return
  const from = path(`${S.N.dir}/field-guide.md`)
  const to = path(orgMemFile(S.N.dir))
  try {
    if (!(await host.fs.exists(from)) || (await host.fs.exists(to))) return
    await host.run(['mv', '-f', from, to])
  } catch {
    // the old notes stay where they are; org-mem starts empty
  }
}
