// The dialogs of symcc's OpenCode board (T-815, split from tui.ts): every ctx.ui.dialog prompt and pick list the
// panel asks (the search, a setting's value, a scout's edit, a new role, kind or scout, an edit page's box, Set up
// git), and what each sends once answered. They read and set the panel through `s` (tui.ts's TuiState).
import { dataDir } from '../name'
import { settingsPlace, defPageId, defDraftOf, draftChanges, draftError, boardPageOf, DEF_EDIT_BOXES, SETUP_GIT_ASK, newNameError, EDIT_FIRST_BOX } from './board-view'
import { parseSettingValue, settingChoices, settingInfo, settingShown, settingValue, viewAsBoard, everyText, everyMinutesOf, SEARCH_WORDS, NEW_SCOUT_EVERY, showsHeader, type SettingName, type ScoutEditField, type DefEditField } from '../board'
import { choiceNote, settingAbout } from '../core/setting-notes'
import type { SymccScout } from '../../types'
import type { TuiContext, TuiState } from './tui-draw'

/** The panel's dialogs, over the panel state `s`. */
export function makeDialogs(ctx: TuiContext, s: TuiState) {
  const { d, name, file, search, searchFor, say, send, sendOk, setRunCursor, setScroll, edit, setEdit, tab, opened, run } = s
  /** f on the list ([f] search, [f] change search): asks for the search words; Enter on an empty box clears it, Esc
   *  keeps it as it was. */
  const askSearch = async () => {
    const now = search()
    const text = await ctx.ui.dialog.prompt({ title: now ? `Search the tasks (now: ${now})` : 'Search the tasks', description: `words, or ${SEARCH_WORDS} · Enter on empty clears`, placeholder: `words, or ${SEARCH_WORDS}` })
    if (text !== undefined) searchFor(text)
  }
  /** Changes setting `setting` (Enter or a click on its row): on/off flips, a setting with choices is picked from a
   *  list, the rest is typed; then /<name>-settings NAME VALUE sets it. */
  const changeSetting = async (setting: SettingName, sessionID: string) => {
    const info = settingInfo(setting)
    const f = file()
    if (!info || !f) return
    const now = settingValue(viewAsBoard(f.view), setting)
    const choices = settingChoices(setting, f.view.notify_choices)
    let value: string | undefined
    if (info.kind === 'onoff') value = now === 'on' ? 'off' : 'on'
    else {
      s.asking = setting
      if (choices.length) value = await ctx.ui.dialog.select({ title: `${setting} (now ${settingShown(setting, now)}): ${settingAbout(setting)}`, options: choices.map(c => ({ title: c === now ? `${settingShown(setting, c)} (now)` : settingShown(setting, c), description: choiceNote(setting, c), value: c })) })
      else value = (await ctx.ui.dialog.prompt({ title: `${setting} (now ${now})`, description: settingAbout(setting), placeholder: info.kind === 'commands' ? 'e.g. npm test, or none' : info.range }))?.trim()
      // its group was closed meanwhile: the pick or box was cancelled
      if (s.asking !== setting) return
      s.asking = ''
    }
    if (!value || value === now) return
    const ok = parseSettingValue(setting, value)
    if (!ok.ok) return say(ok.message, 'error')
    await send(sessionID, { kind: 'setting', setting, value })
  }
  /** Edits scout `sc` (e on its page): pick what to change (how often, model, instructions), then type the new value;
   *  /<name>-scout <name> every|model|prompt VALUE saves it in the scout's file. */
  const editScout = async (sc: SymccScout, sessionID: string) => {
    const field = await ctx.ui.dialog.select<ScoutEditField>({
      title: `Change scout ${sc.name}`,
      options: [
        { title: `How often: ${everyText(sc.every_minutes)}`, value: 'every' },
        { title: `Model: ${sc.model || "the session's model"}`, value: 'model' },
        { title: `Projects: ${(sc as { projects?: string[] }).projects?.join(', ') || 'every project'}`, value: 'projects' },
        { title: `Findings: ${sc.findings ?? 'default (the board setting)'}`, value: 'findings' },
        { title: 'Instructions', value: 'prompt' },
      ],
    })
    if (!field) return
    if (field === 'findings') {
      const pick = await ctx.ui.dialog.select<string>({ title: `${sc.name}: where its findings' tasks go`, options: [{ title: 'auto: the lead decides', value: 'auto' }, { title: 'backlog: every task waits for you', value: 'backlog' }, { title: 'default: the board setting', value: 'default' }] })
      if (pick) await send(sessionID, { kind: 'scout-edit', scout: sc.name, field, value: pick })
      return
    }
    const ask =
      field === 'every'
        ? { title: `${sc.name}: runs every how many minutes (now ${sc.every_minutes})`, description: '0 = only on demand', placeholder: 'minutes: a whole number, 0 or more' }
        : field === 'model'
          ? { title: `${sc.name}: model (now ${sc.model || "the session's model"})`, description: "none = the session's model", placeholder: 'a model name, or none' }
          : field === 'projects'
            ? { title: `${sc.name}: projects (now ${(sc as { projects?: string[] }).projects?.join(', ') || 'none named'})`, description: 'names separated by commas; none = every project', placeholder: 'e.g. api, web, or none' }
            : { title: `${sc.name}: new instructions`, description: (sc.prompt ?? '').split('\n').find(l => l.trim())?.trim() ?? '', placeholder: 'what to look for, in plain words (longer ones: edit its file)' }
    const value = (await ctx.ui.dialog.prompt(ask))?.trim()
    if (!value) return
    if (field === 'every' && everyMinutesOf(value) === null) return say('every must be a whole number of minutes: 0 for only on demand, or 1 or more', 'error')
    await send(sessionID, { kind: 'scout-edit', scout: sc.name, field, value: field === 'model' && value.toLowerCase() === 'none' ? '' : value })
  }
  /** Opens the edit mode of the open role or task type, with the cursor on its first box (Claude Code's autoFocus). */
  const openEdit = (list: 'roles' | 'kinds', x: Parameters<typeof defDraftOf>[1]) => {
    setRunCursor(EDIT_FIRST_BOX)
    setScroll(0)
    setEdit(defDraftOf(list, x))
  }
  /** Asks a yes (Claude Code's confirm step) before `what`; true when the owner picked it. */
  const yes = async (title: string, label: string) => (await ctx.ui.dialog.select({ title, options: [{ title: label, value: 'yes' }, { title: 'Cancel', value: 'no' }] })) === 'yes'
  /** "+ New role" / "+ New kind" (n): asks the name, then /<name>-settings role|type NAME add; its page opens in the edit
   *  mode once the view file has it. Esc or an empty name leaves it. */
  const newDef = async (list: 'roles' | 'kinds', sessionID: string) => {
    const noun = list === 'roles' ? 'role' : 'kind'
    const asked = await askNewName(noun, `New ${noun === 'role' ? 'role' : 'task type'}'s name`, `Enter makes ${dataDir(file()?.name || name)}/${list}/<name>.md and opens it`, 'letters, digits, - and _')
    if (!asked) return
    if (await sendOk(sessionID, { kind: 'def-add', def: noun, name: asked })) s.pendingOpen = { tab: 'settings', id: defPageId(list, list === 'kinds' ? asked.toLowerCase() : asked), edit: true, at: d.now() }
  }
  /** Asks a new role's, kind's or scout's name; a name the engine would refuse (bad, or taken: newNameError) asks
   *  again with the reason, as Claude Code's name box stays open with it. Esc or an empty name: undefined. */
  const askNewName = async (what: 'role' | 'kind' | 'scout', title: string, description: string, placeholder: string): Promise<string | undefined> => {
    let error = ''
    for (;;) {
      const asked = (await ctx.ui.dialog.prompt({ title, ...(error || description ? { description: error || description } : {}), placeholder }))?.trim()
      if (!asked) return undefined
      error = newNameError(file(), what, asked)
      if (!error) return asked
    }
  }
  /** "+ New scout" (n): asks the name, then its instructions, then /<name>-scout NAME new INSTRUCTIONS (it runs every
   *  NEW_SCOUT_EVERY minutes; e on its page changes that); its page opens once the view file has it. */
  const newScout = async (sessionID: string) => {
    const scout = await askNewName('scout', "New scout's name", '', 'lowercase letters, digits and dashes')
    if (!scout) return
    const prompt = (await ctx.ui.dialog.prompt({ title: `${scout}: what it does`, description: `in plain words; it runs every ${NEW_SCOUT_EVERY} minutes (Edit on its page changes that)`, placeholder: 'what to look for, in plain words (longer ones: edit its file)' }))?.trim()
    if (!prompt) return
    if (await sendOk(sessionID, { kind: 'scout-new', scout, prompt })) s.pendingOpen = { tab: 'scouts', id: scout, edit: false, at: d.now() }
  }
  /** Enter or a click on an edit page's box: asks its new value (Enter on an empty box empties it, Esc keeps it). */
  const editBox = async (field: DefEditField) => {
    const e = edit()
    const place = e ? settingsPlace(file(), e.page) : null
    if (!e || !place?.def) return
    // T-918: the Writes pick has two choices, so Enter (or a click) switches it: code ↔ prose only (sent as code: true or false)
    if (field === 'code') return void setEdit({ ...e, values: { ...e.values, code: e.values.code === 'false' ? 'true' : 'false' } })
    const box = DEF_EDIT_BOXES[field]
    const now = (e.values[field] ?? '').split('\n').find(l => l.trim())?.trim() ?? ''
    const value = await ctx.ui.dialog.prompt({ title: `${place.def.name}: ${box.label}${now ? ` (now: ${now})` : ''}`, description: box.placeholder(place.list === 'roles' ? 'role' : 'kind'), placeholder: box.placeholder(place.list === 'roles' ? 'role' : 'kind') })
    if (value === undefined || edit()?.page !== e.page) return
    setEdit({ page: e.page, values: { ...edit()!.values, [field]: value.trim() } })
  }
  /** Save on the edit page: a value the lead's tool would refuse (draftError: an empty description, a tool word a role
   *  may not have, ...) stays on the page with Claude Code's error and sends nothing; else the changed boxes go in one
   *  /<name>-settings role|type NAME save {...} (one edit: all or none), and the page goes back to the role or task type
   *  once it is sent. */
  const saveEdit = async (sessionID: string) => {
    const e = edit()
    const place = e ? settingsPlace(file(), e.page) : null
    if (!e || !place?.def) return
    const error = draftError(place.list, place.def.name, e)
    if (error) return void setEdit({ ...e, error })
    const def = place.list === 'roles' ? 'role' : 'kind'
    const changed = draftChanges(place.list, place.def, e)
    if (changed.length && !(await sendOk(sessionID, { kind: 'def-save', def, name: place.def.name, fields: Object.fromEntries(changed.map(f => [f, e.values[f] ?? ''])) }))) return
    if (edit()?.page === e.page) setEdit(undefined)
  }
  /** Set up git (g, or the banner's button), where the banner shows it: asks a yes, then /<name>-settings git setup. */
  const setUpGit = async (sessionID: string) => {
    const f = file()
    const gs = f?.view.git_state
    if (!f || (gs !== 'no-commits' && gs !== 'no-git') || !showsHeader(boardPageOf(f, { tab: tab(), opened: opened(), run: run(), ...(edit() ? { edit: edit()! } : {}) }))) return
    if (gs === 'no-git') return void (await send(sessionID, { kind: 'check-git' }))
    if (await yes(SETUP_GIT_ASK, 'Yes, set up git')) await send(sessionID, { kind: 'setup-git' })
  }
  return { askSearch, changeSetting, editScout, openEdit, yes, newDef, askNewName, newScout, editBox, saveEdit, setUpGit }
}

/** What makeDialogs gives the keys and tui.ts. */
export type TuiDialogs = ReturnType<typeof makeDialogs>
