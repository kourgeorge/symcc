// Worker roles.
import type { SymccTask } from '../../types'
import { DEFAULT_NAME, namesFor } from '../name'
import { frontMatterLine, splitFrontMatter } from './text'

// ---------------- worker roles ----------------

/**
 * A worker role: a file `roles/<name>.md` in the plugin, or `.<plugin name>/roles/<name>.md` in the
 * project (which overrides a built-in one with the same name). Front matter: description (needed),
 * model and skills (optional); the body is the role's checklist (may be empty, as for "general").
 */
export type RoleDef = { name: string; description: string; model?: string; skills: string[]; prompt: string }

/** The role a task gets when none is set: today's plain worker. */
export const DEFAULT_ROLE = 'general'

/** A role's name: letters, digits, - and _ only. */
const ROLE_NAME = /^[A-Za-z0-9_-]{1,64}$/

/** A front matter list: "[a, b]" or "a, b", quotes dropped. */
function frontMatterList(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(s => s.trim().replace(/^["']|["']$/g, '').trim())
    .filter(Boolean)
}

/**
 * A role file as a RoleDef, or null when it can't be used (no front matter, no description,
 * or a name with other characters than letters, digits, - and _); the caller skips it with a note.
 */
export function parseRole(name: string, text: string): RoleDef | null {
  const r = readRole(name, text)
  return typeof r === 'string' ? null : r
}

/** Why a role file can't be used ("no front matter", "no description", "bad name ..."), or null when it can. */
export function roleSkipReason(name: string, text: string): string | null {
  const r = readRole(name, text)
  return typeof r === 'string' ? r : null
}

/** The note shown (once) when a role file is skipped: "symcc: skipped .symcc/roles/x.md: no description". */
export function skippedRoleNote(file: string, reason: string, name: string = DEFAULT_NAME): string {
  return `${name}: skipped ${file}: ${reason}`
}

/** A role file as a RoleDef, or the reason it can't be used. */
function readRole(name: string, text: string): RoleDef | string {
  const fm = splitFrontMatter(text)
  if (!fm.lines) return 'no front matter (it starts with a --- line, then description: ..., then ---)'
  const meta: Record<string, string> = {}
  for (const line of fm.lines) {
    const kv = frontMatterLine(line)
    if (kv) meta[kv.key] = kv.value.replace(/\s+#.*$/, '')
  }
  const unquote = (s: string | undefined) => (s ?? '').trim().replace(/^["']|["']$/g, '').trim()
  const roleName = unquote(meta.name) || name
  const description = unquote(meta.description)
  if (!ROLE_NAME.test(roleName)) return `bad name "${roleName}" (use letters, digits, - and _ only)`
  if (!description) return 'no description'
  const model = unquote(meta.model)
  return { name: roleName, description: description.slice(0, 200), ...(model ? { model } : {}), skills: frontMatterList(meta.skills ?? ''), prompt: fm.body.trim() }
}

/** The built-in roles with the project's added: a project role replaces a built-in one with the same name. Sorted by name, general first. */
export function mergeRoles(builtIn: RoleDef[], project: RoleDef[]): RoleDef[] {
  const out = new Map<string, RoleDef>()
  for (const r of [...builtIn, ...project]) out.set(r.name.toLowerCase(), r)
  return [...out.values()].sort((a, b) => (a.name === DEFAULT_ROLE ? -1 : b.name === DEFAULT_ROLE ? 1 : a.name.localeCompare(b.name)))
}

/** A task's role name: its role, or general when none is set. */
export const roleOf = (t: Pick<SymccTask, 'role'>): string => t.role?.trim() || DEFAULT_ROLE

/** Role `name` from `roles` (any case); general when the name is missing. */
export function findRole(roles: RoleDef[], name: string | undefined): RoleDef | undefined {
  const n = (name ?? '').trim().toLowerCase() || DEFAULT_ROLE
  return roles.find(r => r.name.toLowerCase() === n)
}

/** The known role name for `name` (spelled as in its file), or throws a clear error listing the roles. */
export function checkRole(roles: RoleDef[], name: string): string {
  const r = findRole(roles, name)
  if (r) return r.name
  if (name.trim().toLowerCase() === DEFAULT_ROLE) return DEFAULT_ROLE
  const have = roles.map(x => x.name)
  if (!have.some(x => x.toLowerCase() === DEFAULT_ROLE)) have.unshift(DEFAULT_ROLE)
  throw new Error(`unknown role "${name}"; the roles are: ${have.join(', ')}`)
}

/** The short role mark for lists: the role name, or '' for general (which shows nothing). */
export function roleMark(t: Pick<SymccTask, 'role'>): string {
  const role = roleOf(t)
  return role.toLowerCase() === DEFAULT_ROLE ? '' : role
}

/** The open task's role line: "Role: tests — writes tests · model sonnet" (just "Role: tests" when the role is not known). */
export function roleLine(t: Pick<SymccTask, 'role'>, roles: RoleDef[]): string {
  const name = roleOf(t)
  const r = findRole(roles, name)
  return `Role: ${r?.name ?? name}${r ? ` — ${r.description}` : ''}${r?.model ? ` · model ${r.model}` : ''}`
}

/** The roles to pick from in the board panel: the known ones, general first (general alone when none are loaded). */
export function roleChoices(roles: RoleDef[]): string[] {
  const names = roles.map(r => r.name)
  return names.some(n => n.toLowerCase() === DEFAULT_ROLE) ? names : [DEFAULT_ROLE, ...names]
}

/** "try 2", or "try 2 (role tests)" when the task has a role other than general. */
export function tryLabel(t: Pick<SymccTask, 'role'> & { attempts: number | string }): string {
  const role = roleOf(t)
  return `try ${t.attempts}${role === DEFAULT_ROLE ? '' : ` (role ${role})`}`
}

/**
 * The worker prompt's role section: "Your role: <name>", the role's checklist and the skills to use.
 * Empty for a role with no checklist and no skills (general: today's worker).
 */
export function roleSection(r: RoleDef | undefined): string {
  if (!r || (!r.prompt && !r.skills.length)) return ''
  const skills = r.skills.length ? `Use these skills if they are available: ${r.skills.join(', ')}.` : ''
  return `\nYour role: ${r.name}\n${[r.prompt, skills].filter(Boolean).join('\n')}\n`
}

/** The lead's paragraph about roles: each one with its description, and how to pick. */
export function rolesLeadText(roles: RoleDef[], name: string = DEFAULT_NAME): string {
  const list = roles.length ? roles.map(r => `${r.name} (${r.description})`).join('; ') : `${DEFAULT_ROLE} (a plain worker)`
  return `- Worker roles: ${list}. Pick the role that fits each task (role in ${name} add / change); ${DEFAULT_ROLE} when unsure; the owner can override. Put the task's own focus in its details. A project can add or override roles in ${namesFor(name).dir}/roles/<name>.md.
- One task, one role. When a request needs several kinds of work (e.g. backend, frontend, tests, docs) and each part is big enough to stand alone, or a role really helps (security, a careful test suite, a refactor with no behavior change), split it into one task per role and link them with after (the frontend waits for the backend it uses; tests and docs wait for the code they cover; parts with different files run in parallel). When the request is small, keep it as one task with the ${DEFAULT_ROLE} role: each extra task costs a worker run, a test run and a merge.`
}
