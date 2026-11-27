// Filling {{placeholders}} in prompt text (T-851). Two kinds: the named ones symcc fills for each task ({{title}},
// {{folder}} ...), and the generic {{task.<path>}}, which gives any field of the task (e.g. {{task.origin.request}},
// {{task.files}}), so a prompt or a role's checklist can pull in a task fact with no code. Everything here is pure.

/** A placeholder: a name, or "task." and a dotted path ({{task.origin.request}}). */
export const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g

/** The most characters one {{task.<path>}} gives; a longer value (a long timeline) is cut with a note. */
export const TASK_VALUE_MAX = 8000

/** The key a role page lists for the generic task placeholder. */
export const TASK_PLACEHOLDER = 'task.<path>'

/** What the generic task placeholder is, for the lists of placeholders. */
export const TASK_PLACEHOLDER_ABOUT = 'any field of the task, by its path (e.g. {{task.origin.request}}, {{task.files}}): text as it is, a list one item per line, an object as "key: value" lines, a missing one as nothing'

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** One value on one line: text as it is, a list joined with ", ", an object as "key: value" pairs. */
function inline(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.replace(/\s*\n\s*/g, ' ')
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  if (depth >= 2) return ''
  if (Array.isArray(v)) return v.map(x => inline(x, depth + 1)).filter(Boolean).join(', ')
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${inline(x, depth + 1)}`).join(', ')
  return ''
}

/** A task field as prompt text: a string as it is, a list one item per line, an object as short "key: value" lines, anything missing as ''. */
export function showValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  if (Array.isArray(v)) return v.map(x => inline(x)).join('\n')
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${inline(x)}`).join('\n')
  return ''
}

/** The text of `task`'s field at dotted `path` (e.g. "origin.request"), formatted by showValue; '' when it is missing. Never reads inherited keys. */
export function taskValue(task: unknown, path: string): string {
  let cur: unknown = task
  for (const seg of path.split('.')) {
    if (BLOCKED_KEYS.has(seg) || cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, seg)) return ''
    cur = (cur as Record<string, unknown>)[seg]
  }
  const s = showValue(cur)
  return s.length > TASK_VALUE_MAX ? `${s.slice(0, TASK_VALUE_MAX)}\n… (cut here)` : s
}

/**
 * `text` with every placeholder named in `known` replaced by its value from `values`, in one pass (so a value that holds
 * "{{...}}", e.g. in the task's details, is never filled again). Any other {{word}}, or one without a value, is left as
 * written. {{task.<path>}} is filled from `task` when one is given (see taskValue), and left as written when not.
 */
export function fillPlaceholders(text: string, known: Record<string, unknown>, values: Record<string, string>, task?: unknown): string {
  return text.replace(PLACEHOLDER, (all, p: string) => {
    if (p.startsWith('task.')) return task === undefined ? all : taskValue(task, p.slice(5))
    return Object.hasOwn(known, p) && Object.hasOwn(values, p) ? values[p]! : all
  })
}

/** The placeholder names written in `text`, in order, each once. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map(m => m[1]!))]
}
