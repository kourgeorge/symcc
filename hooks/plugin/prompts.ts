import { type PromptKind, PROMPT_KINDS, BUILT_IN_PROMPTS, isPromptKind, promptProblems, promptFileOf, leadPromptsText, leadPromptText } from '../board'
import { type $, S, warnedPrompts } from './state'
import { path } from './store'
import { tellLead } from './tell'

// ---------------- worker prompts ----------------

/** The text prompt `kind` is made from now: the owner's file when there is one (and it isn't empty), else the built-in one. */
export const promptTemplate = (kind: PromptKind): string => (S.prompts[kind]?.trim() ? S.prompts[kind]! : BUILT_IN_PROMPTS[kind])

/**
 * Reads the owner's prompt files (.<name>/prompts/<kind>.md) again into S.prompts. A file with something wrong
 * (empty, {{ask}} or {{details}} missing, an unknown placeholder) is still used as far as it can be, and the owner
 * (a toast) and the lead hear once what is wrong; again only when that changes.
 */
export async function loadPrompts($: $): Promise<Partial<Record<PromptKind, string>>> {
  const own: Partial<Record<PromptKind, string>> = {}
  if (S.root) {
    for (const k of PROMPT_KINDS) {
      const file = promptFileOf(S.N.dir, k)
      if (!(await $.fs.exists(path(file)).catch(() => false))) {
        warnedPrompts.delete(file)
        continue
      }
      const text = await $.fs.read(path(file)).catch(() => '')
      own[k] = typeof text === 'string' ? text : ''
      warnPrompt($, k, file, own[k]!)
    }
  }
  S.prompts = own
  return own
}

/** Says once (a toast and a note for the lead) what is wrong with the owner's prompt file; nothing when it is fine. */
function warnPrompt($: $, kind: PromptKind, file: string, text: string) {
  const problems = promptProblems(kind, text)
  if (!problems.length) return void warnedPrompts.delete(file)
  const said = problems.join('; ')
  $.ui.log(`${file}: ${said}`, { to: 'debug' })
  if (warnedPrompts.get(file) === said) return
  warnedPrompts.set(file, said)
  $.ui.toast(S.N.toast(`${file}: ${said}`))
  tellLead($, `⚠ The owner's worker prompt ${file}: ${said}. Fix the file (${S.N.name} prompts list ${kind} shows the placeholders), or ${S.N.name} prompts reset ${kind} to go back to the built-in one.`)
}

/** What the lead's prompts tool gets. */
export type LeadPromptInput = { action?: unknown; name?: unknown; text?: unknown }

/** The lead's prompts tool (see changePrompt). */
export async function leadPrompts($: $, a: LeadPromptInput): Promise<string> {
  return (await changePrompt($, a)).text
}

/**
 * The prompts tool's work: list (both, or one in full with its placeholders), edit (writes the owner's file: with text, that text;
 * without, a copy of the prompt as it is now, to edit by hand), reset (deletes the owner's file, so the built-in comes back).
 * Only the two known names make a path, so nothing outside <dir>/prompts is touched. `ok` says a file was written or removed.
 */
export async function changePrompt($: $, a: LeadPromptInput): Promise<{ ok: boolean; text: string }> {
  const action = typeof a.action === 'string' && a.action.trim() ? a.action.trim().toLowerCase() : 'list'
  const asked = typeof a.name === 'string' ? a.name.trim().toLowerCase() : ''
  const actions = ['list', 'edit', 'reset']
  const no = (text: string) => ({ ok: false, text })
  if (!actions.includes(action)) return no(`unknown action "${action}": use ${actions.join(', ')}`)
  if (asked && !isPromptKind(asked)) return no(`no prompt named ${asked} (have: ${PROMPT_KINDS.join(', ')})`)
  if (!asked && action !== 'list') return no(`say which prompt to ${action} (name: ${PROMPT_KINDS.join(' or ')})`)
  if (action !== 'list' && !S.root) return no('no project folder yet, so prompts can not be changed')
  const own = await loadPrompts($)
  const dir = S.N.dir
  if (action === 'list') return { ok: false, text: asked ? leadPromptText(asked as PromptKind, own, dir) : leadPromptsText(own, dir, S.N.name) }
  const kind = asked as PromptKind
  const file = promptFileOf(dir, kind)
  const done = async (said: string) => {
    await loadPrompts($)
    $.ui.invalidate('ui.render')
    return { ok: true, text: `${said}; it counts from the next worker on` }
  }
  if (action === 'reset') {
    if (own[kind] === undefined) return no(`the ${kind} prompt is already the built-in one`)
    // An argument list (no shell), with "--" so the path can never be read as an option.
    const r = await $.process.run(['rm', '-f', '--', path(file)])
    if (r.exitCode !== 0) return no(`could not remove ${file}: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`)
    warnedPrompts.delete(file)
    return done(`the ${kind} prompt is the built-in one again (your version ${file} is deleted)`)
  }
  const given = typeof a.text === 'string' ? a.text : undefined
  if (given !== undefined && !given.trim()) return no(`text is empty: give the whole prompt, or use reset to go back to the built-in one`)
  const text = given ?? promptTemplate(kind)
  await $.process.run(['mkdir', '-p', '--', path(`${dir}/prompts`)])
  await $.fs.write(path(file), text.endsWith('\n') ? text : `${text}\n`)
  const problems = promptProblems(kind, text)
  const warn = problems.length ? `. ⚠ ${problems.join('; ')}` : ''
  return done(given === undefined ? `copied the ${kind} prompt to ${file}: edit that file by hand${warn}` : `saved the ${kind} prompt (${file})${warn}`)
}

// ---------------- the Prompts page of the panel's Settings view ----------------

/** What the Prompts page (opened from Settings) shows: whether it is shown at all (`list`), the opened prompt ('' = none) and its edit box. */
export const promptView = {
  list: false,
  open: '' as PromptKind | '',
  draft: null as { kind: PromptKind; text: string; error: string } | null,
}

/** Closes the Prompts page and everything on it. */
export function resetPromptView() {
  promptView.list = false
  promptView.open = ''
  promptView.draft = null
}

/** Saves the edit box through the prompts tool's edit; says what happened, or keeps the box open with the error. */
export async function savePromptDraft($: $): Promise<string> {
  const d = promptView.draft
  if (!d) return ''
  const r = await changePrompt($, { action: 'edit', name: d.kind, text: d.text })
  if (!r.ok) {
    d.error = r.text
    $.ui.invalidate('ui.render')
    return ''
  }
  promptView.draft = null
  $.ui.invalidate('ui.render')
  return r.text
}
