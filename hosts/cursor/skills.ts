// The skills the owner can call from the lead chat with /<name>: the project's and the user's, in the folders Cursor
// reads skills from (one folder per skill, with a SKILL.md). Cursor's own built-in skills (skills-cursor) are left out:
// they drive the editor, which the lead has none of. A skill is called by telling the lead to read its SKILL.md.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type Skill = { name: string; description: string; argumentHint?: string; path: string; scope: 'project' | 'user' }

const SKILL_DIRS = ['.cursor/skills', '.agents/skills', '.claude/skills']

/** One frontmatter field of a SKILL.md: plain, quoted, or folded over the indented lines after it (`>-`, `|`). */
function field(front: string[], key: string): string | undefined {
  const i = front.findIndex(l => l.startsWith(`${key}:`))
  if (i < 0) return undefined
  let v = front[i]!.slice(key.length + 1).trim()
  if (/^[>|][-+]?$/.test(v) || v === '') {
    const more: string[] = []
    for (const l of front.slice(i + 1)) {
      if (!/^\s/.test(l)) break
      more.push(l.trim())
    }
    v = more.join(' ')
  }
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.endsWith(v[0]!)) v = v.slice(1, -1).replace(/\\"/g, '"')
  return v || undefined
}

/** A SKILL.md's name, description and argument hint (the folder's name when it names none). */
export function skillOf(text: string, folder: string): Pick<Skill, 'name' | 'description' | 'argumentHint'> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const front = m ? m[1]!.split(/\r?\n/) : []
  const hint = field(front, 'argument-hint')
  return { name: field(front, 'name') ?? folder, description: field(front, 'description') ?? '', ...(hint ? { argumentHint: hint } : {}) }
}

async function skillsIn(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const names = await readdir(dir).catch(() => [] as string[])
  const out = await Promise.all(
    names.map(async folder => {
      const path = join(dir, folder, 'SKILL.md')
      const text = await readFile(path, 'utf8').catch(() => undefined)
      return text === undefined ? undefined : { ...skillOf(text, folder), path, scope }
    }),
  )
  return out.filter((s): s is Skill => !!s)
}

/** The skills of project `root` and of the user (`home`), by name; a project skill wins over a user's of the same name. */
export async function listSkills(root: string, home: string | undefined): Promise<Skill[]> {
  const dirs = [...SKILL_DIRS.map(d => ({ dir: join(root, d), scope: 'project' as const })), ...(home && home !== root ? SKILL_DIRS.map(d => ({ dir: join(home, d), scope: 'user' as const })) : [])]
  const seen = new Set<string>()
  const out: Skill[] = []
  for (const list of await Promise.all(dirs.map(d => skillsIn(d.dir, d.scope))))
    for (const s of list.sort((a, b) => a.name.localeCompare(b.name))) if (!seen.has(s.name)) (seen.add(s.name), out.push(s))
  return out
}

/** The message that calls skill `s` with the owner's words `rest`. */
export const skillMessage = (s: Skill, rest: string) =>
  `Use the skill "${s.name}": read ${s.path} and follow it. Other skills it names are beside it (${join(s.path, '..', '..')}/<name>/SKILL.md).${rest ? `\n\n${rest}` : ''}`
