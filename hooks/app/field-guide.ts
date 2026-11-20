// T-600: the Field Guide on disk (<project>/.<name>/field-guide.md; the pure parts are in core/field-guide.ts).
// A worker's or checker's report adds its "Learned:" lines (learnFrom); every new worker, checker and scout gets the
// guide in its prompt (fieldGuideText). The owner and the lead may edit or trim the file by hand.
import { addLearned, guideFile, guideSection } from '../core/field-guide'
import type { Host } from '../host'
import { S } from './state'
import { now, oneAtATime, path, safeWrite } from './store'

/** The guide's text, or null when it is missing or can't be read. */
async function readGuide(host: Host): Promise<string | null> {
  try {
    return await host.fs.read(path(guideFile(S.N.dir)))
  } catch {
    return null
  }
}

/** The guide as a new agent's prompt shows it (see guideSection): '' when the file is missing, empty or can't be read. */
export async function fieldGuideText(host: Host): Promise<string> {
  return guideSection(await readGuide(host), guideFile(S.N.dir))
}

/**
 * Adds the "Learned:" lines of task `id`'s report `answer` to the guide (see addLearned), one save at a time. Nothing
 * is written when the report has no new lines. Never throws: the guide is a help, so a failure only loses the lines.
 */
export async function learnFrom(host: Host, id: string, answer: string): Promise<void> {
  if (S.guardOnly || !S.root) return
  const file = guideFile(S.N.dir)
  await oneAtATime(file, async () => {
    const old = await readGuide(host)
    const { text, added } = addLearned(old, answer, id, now().slice(0, 10))
    if (added.length) await safeWrite(host, path(file), text, 'the field guide')
  }).catch(() => undefined)
}
