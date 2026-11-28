// The keys and the mouse of symcc's OpenCode board (T-815, split from tui.ts): what each panel key does on each tab
// and page, the task page's actions, a click on the panel and the mouse wheel. They read and set the panel through `s`
// (tui.ts's TuiState) and ask through the dialogs (tui-dialogs.ts).
import { dataDir } from '../name'
import { reportPickId, reportPickOf, pagePlace, panelKeys, panelTaskActions, approveInProgress, panelRoleChoices, TASK_ACTION_COMMANDS, hasPage, answerOptions, moveCursor, OWN_ANSWER, groupOf, groupId, BACKLOG_MORE_ID, dayOfId, dayId, settingsPlace, orgMemNoteOf, ORG_MEM_PAGE, orgMemPageId, orgMemPageTopic, LIVE_OM_ALL_ID, liveNoteId, liveTopicId, branchIdTask, orgMemIn, defPageId, rolePromptId, settingGroupOf, settingGroupId, PANEL_TABS, CHOICE_KEYS, editOf, editBoxId, boardPageOf, removeAsk, resetAsk, EDIT_SAVE_ID, EDIT_CANCEL_ID, type ChoiceKey, type PanelHit, type PanelKey, type PanelTab } from './board-view'
import { taskReports, taskActions, type TaskAction, type TaskActionId, isSettingPage, nextFindings, nextMode, modeOf, promptsOfRole, showsHeader, showsDriveButton, defEditFields, type SettingName } from '../board'
import { orgMemDeleteAsk, orgMemFile, orgMemNoteKey, orgMemTopicCounts } from '../core/org-mem'
import { runNowQuestion, runNowWaits, RUN_NOW_NO, RUN_NOW_YES } from '../core/run-now'
import { WHEEL_LINES, type TuiContext, type TuiMouseEvent, type TuiState } from './tui-draw'
import type { TuiDialogs } from './tui-dialogs'

/** The tab each tab key goes to. */
const TAB_OF: Partial<Record<PanelKey, PanelTab>> = Object.fromEntries(PANEL_TABS.map(t => [t.key, t.tab]))

/** The panel's keys and mouse handlers, over the panel state `s` and its dialogs. */
export function makeKeys(ctx: TuiContext, s: TuiState, dialogs: TuiDialogs) {
  const { d, name, file, now, opened, tab, run, draw, cursor, setCursor, runCursor, setRunCursor, scroll, setScroll, edit, setEdit, search, searchFor, searchChoice, approving, setApproving, setSent, setBacklogAll, fromLive, setFromLive, openPage, showTab, openRun, toggle, toggleDay, toggleSettingGroup, keepPage, listIds, send, sendOk, pickReport } = s
  const { askSearch, changeSetting, editScout, openEdit, yes, newDef, newScout, editBox, saveEdit, setUpGit } = dialogs
  /** The Settings tab's keys: the list moves, changes a setting or opens the Roles or Kinds page; that page moves and
   *  opens a role or task type (n makes a new one); its page turns it off or on (o), resets it (r), edits it (e) or
   *  removes it (d, after a yes); b goes back one page. On the edit page ↑↓ move over Save, Cancel and the boxes,
   *  Enter changes a box or presses the button, x (Cancel) and b leave it without saving. */
  const pressSettings = async (key: PanelKey, sessionID: string) => {
    const f = file()
    const open = opened()
    const ids = draw().ids
    const [cur, setCur] = open ? [runCursor, setRunCursor] : [cursor, setCursor]
    if (key === 'up' || key === 'down') return void setCur(moveCursor(cur(), key === 'up' ? -1 : 1, ids.length))
    const place = open ? settingsPlace(f, open) : null
    if (editOf(f, { tab: tab(), opened: open, ...(edit() ? { edit: edit()! } : {}) })) {
      if (key === 'x' || key === 'back') return void setEdit(undefined)
      const field = ids[moveCursor(cur(), 0, ids.length)]
      // Enter on the Save or Cancel button (↑ from the first box reaches them, as on Claude Code)
      if (key === 'open' && field === EDIT_SAVE_ID) return saveEdit(sessionID)
      if (key === 'open' && field === EDIT_CANCEL_ID) return void setEdit(undefined)
      const k = place?.def ? defEditFields(place.list === 'roles' ? 'role' : 'kind').find(x => editBoxId(x) === field) : undefined
      if (key === 'open' && k) return editBox(k)
      return
    }
    if (key === 'back') return place?.prompt && place.def ? openPage(defPageId('roles', place.def.name)) : place?.def ? openPage(place.list) : open ? openPage('') : showTab('tasks')
    // the built-in prompt page is view only: b goes back to the role
    if (place?.prompt) return
    if (key === 'open' && ids.length && !place?.def) {
      const id = ids[moveCursor(cur(), 0, ids.length)]!
      const g = open ? null : settingGroupOf(id)
      if (g) return toggleSettingGroup(g)
      return open || isSettingPage(id) ? openPage(id) : changeSetting(id as SettingName, sessionID)
    }
    // + New role / + New kind on the Roles or Kinds page
    if (key === 'n' && place && !place.def) return newDef(place.list as 'roles' | 'kinds', sessionID)
    const d = place?.def
    if (!d) return
    const def = place.list === 'roles' ? 'role' : 'kind'
    if (key === 'e' && !d.broken) return openEdit(place.list, d)
    if (key === 'd' && d.canRemove) {
      if (!(await yes(removeAsk(place.list, d), 'Yes, remove'))) return
      if ((await sendOk(sessionID, { kind: 'def', def, name: d.name, action: 'remove' })) && opened() === open) openPage(place.list)
      return
    }
    if (key === 'o' && d.canOff) return send(sessionID, { kind: 'def', def, name: d.name, action: d.off ? 'on' : 'off' })
    if (key === 'r' && d.canReset) {
      // T-871: a role's Reset to built-in asks first, as on Claude Code's page
      if (def === 'role' && !(await yes(resetAsk(d), 'Yes, reset'))) return
      return send(sessionID, { kind: 'def', def, name: d.name, action: 'reset' })
    }
    // T-871: ‹ › (and [ ]) on a role's page go to the role before or after it in the Roles list
    if ((key === 'prev' || key === 'next') && def === 'role' && !d.broken) return goNext(key)
    // See the prompt (T-685): the first built-in prompt the role goes in
    if (key === 'p' && def === 'role' && !d.broken) return openPage(rolePromptId(d.name, promptsOfRole(d.name)[0]!))
  }
  /** The Scouts tab's keys: the list moves and opens; a scout's page moves over its runs, opens one, runs the scout
   *  now (r), pauses or resumes it (p) and edits it (e); a run's page goes back. */
  const pressScouts = async (key: PanelKey, sessionID: string) => {
    const f = file()
    const open = opened()
    const ids = draw().ids
    if (!open) {
      if (key === 'up' || key === 'down') return void setCursor(moveCursor(cursor(), key === 'up' ? -1 : 1, ids.length))
      if (key === 'open' && ids.length) openPage(ids[moveCursor(cursor(), 0, ids.length)]!)
      if (key === 'back') showTab('tasks')
      if (key === 'n') return newScout(sessionID)
      return
    }
    if (run()) return void (key === 'back' && openRun(''))
    if (key === 'back') return openPage('')
    if (key === 'prev' || key === 'next') return goNext(key)
    if (key === 'up' || key === 'down') return void setRunCursor(moveCursor(runCursor(), key === 'up' ? -1 : 1, ids.length))
    if (key === 'open' && ids.length) return openRun(ids[moveCursor(runCursor(), 0, ids.length)]!)
    const offered = panelKeys(f, open, 'scouts').map(k => k.word)
    const sc = f?.view.scouts.find(x => x.name === open)
    if (key === 'r' && offered.includes('run now')) return send(sessionID, { kind: 'scout', scout: open })
    if (key === 'p' && sc) return send(sessionID, { kind: 'scout', scout: open, paused: !sc.paused })
    if (key === 'e' && sc) return editScout(sc, sessionID)
    // T-912: f moves its findings choice on (board default → auto → backlog → board default)
    if (key === 'f' && sc) return send(sessionID, { kind: 'scout-edit', scout: open, field: 'findings', value: nextFindings(sc.findings) })
  }
  /** Opens task `id`'s page on the Tasks tab, with the list's cursor on it (so b comes back to its row). */
  const openOnList = (id: string) => {
    const from = tab() === 'live' ? { tab: 'live' as const, cursor: cursor() } : undefined
    if (tab() !== 'tasks') showTab('tasks')
    const at = listIds().indexOf(id)
    if (at >= 0) setCursor(at)
    if (hasPage(file(), id)) openPage(id), (s.backTo = from), setFromLive(!!from)
  }
  /** [ or ] (`key` prev or next) on a task's or scout's page: the previous or next one of the list it was opened from
   *  (going round at the ends); a task's page keeps where b goes back to. */
  const goNext = (key: 'prev' | 'next') => {
    const place = pagePlace(file(), { tab: tab(), opened: opened(), run: run(), ...searchChoice(), ...(fromLive() ? { from: 'live' as const } : {}) }, now())
    if (!place || place.of < 2) return
    const to = place[key]
    const keep = s.backTo
    const live = fromLive()
    openPage(to)
    s.backTo = keep
    setFromLive(live)
    if (tab() === 'tasks' && !live) {
      const at = listIds().indexOf(to)
      if (at >= 0) setCursor(at)
    }
  }
  /** b on a task's page: back to the tab it was opened from (the Live tab, on its lane), else to the Tasks list. */
  const closeTask = () => {
    const to = s.backTo
    if (!to) return openPage('')
    showTab(to.tab)
    setCursor(to.cursor)
  }
  /** Enter (or a click) on the Live tab's row `id`: a lane's or train's task opens on the Tasks tab; (T-718) a topic of
   *  the org-mem section opens its notes' page, a newest note all notes with the cursor on it. */
  const openLive = (id: string) => {
    const at = draw().ids.indexOf(id)
    if (at >= 0) setCursor(at)
    if (id.startsWith('om-topic:')) {
      const topic = orgMemTopicCounts(orgMemIn(file())).find(x => liveTopicId(x.topic) === id)?.topic
      return topic ? openPage(orgMemPageId(topic)) : undefined
    }
    if (id === LIVE_OM_ALL_ID) return openPage(ORG_MEM_PAGE)
    if (id.startsWith('om-note:')) {
      const n = orgMemIn(file()).findIndex(x => liveNoteId(x.n) === id)
      openPage(ORG_MEM_PAGE)
      return void setRunCursor(Math.max(0, n))
    }
    // T-727: a Branches row opens its task too
    return openOnList(branchIdTask(id) ?? (id.startsWith('need:') ? id.slice(5) : id))
  }
  /** The Live tab's keys (T-692): ↑↓ move between the lanes (and the org-mem section's notes and topics), Enter opens
   *  the lane's task (or the topic's page, see openLive), b goes back to the list; (T-866) Enter on the org-mem
   *  section's "[all]" opens the Organizational memory page (T-687), whose b comes back to the tab. */
  const pressLive = async (key: PanelKey, sessionID: string) => {
    const f = file()
    const ids = draw().ids
    if (orgMemPageTopic(opened()) !== null) {
      if (key === 'back') return openPage('')
      if (key === 'up' || key === 'down') return void setRunCursor(moveCursor(runCursor(), key === 'up' ? -1 : 1, ids.length))
      // Enter or x on a note asks, then deletes it with /<name>-settings orgmem delete N
      const note = ids.length ? orgMemNoteOf(f, ids[moveCursor(runCursor(), 0, ids.length)]!) : undefined
      if ((key !== 'x' && key !== 'open') || !note) return
      const yes = await ctx.ui.dialog.select({ title: orgMemDeleteAsk(note, orgMemFile(dataDir(f?.name || name))), options: [{ title: 'Yes, delete', value: 'yes' }, { title: 'Cancel', value: 'no' }] })
      if (yes === 'yes') return send(sessionID, { kind: 'orgmem-delete', n: note.n, key: orgMemNoteKey(note.text) })
      return
    }
    if (key === 'up' || key === 'down') return void setCursor(moveCursor(cursor(), key === 'up' ? -1 : 1, ids.length))
    if (key === 'open' && ids.length) return openLive(ids[moveCursor(cursor(), 0, ids.length)]!)
    if (key === 'back') return showTab('tasks')
  }
  const press = async (key: PanelKey, sessionID: string) => {
    // Esc closes the panel (OpenCode 2.3 leaves closing to the panel's own keys)
    if (key === 'close') return ctx.ui.panel.close()
    const f = file()
    const to = TAB_OF[key]
    // on a task's page its own action keys come first (l is Role there, as on the terminal's task page)
    const page = tab() === 'tasks' && opened() ? f?.view.tasks.find(x => x.id === opened()) : undefined
    if (to && !(page && panelTaskActions(page, approveInProgress(f, page, approving(), now())).some(x => x.key === key))) return showTab(to)
    // the banner's Set up git (g), on the pages that show the banner
    if (key === 'g') return setUpGit(sessionID)
    // T-1052: the banner's Drive here (d), where the banner shows it and another session drives
    if (key === 'd' && f && showsDriveButton(f.view, f.view.driving ?? false) && showsHeader(boardPageOf(f, { tab: tab(), opened: opened(), run: run(), ...(edit() ? { edit: edit()! } : {}) }))) return void (await send(sessionID, { kind: 'drive' }))
    keepPage(f)
    if (tab() === 'live') return pressLive(key, sessionID)
    if (tab() === 'scouts') return pressScouts(key, sessionID)
    if (tab() === 'settings') return pressSettings(key, sessionID)
    const open = opened()
    if (!open) {
      const ids = draw().ids
      if (key === 'up' || key === 'down') return void setCursor(moveCursor(cursor(), key === 'up' ? -1 : 1, ids.length))
      if (key === 'open') {
        const id = ids[moveCursor(cursor(), 0, ids.length)]
        const g = id ? groupOf(id) : null
        const day = id ? dayOfId(id) : null
        if (g) toggle(g)
        else if (day) toggleDay(day)
        else if (id === BACKLOG_MORE_ID) setBacklogAll(true)
        else if (id) openPage(id)
      }
      // T-685: Claude Code's list buttons: [f] search (or change it), [x] clear search, [m] the board mode
      if (key === 'f') return askSearch()
      if (key === 'x' && search()) return searchFor('')
      if (key === 'm' && f) return send(sessionID, { kind: 'mode', mode: nextMode(modeOf(f.view)) })
      return
    }
    if (key === 'back') return closeTask()
    if (key === 'prev' || key === 'next') return goNext(key)
    // the task's own actions (core's taskActions, panelTaskActions), each by its key, sent as a slash command
    const t = f?.view.tasks.find(x => x.id === open)
    const act = t ? panelTaskActions(t, approveInProgress(f, t, approving(), now())).find(x => x.key === key) : undefined
    if (act) return doAction(act, sessionID)
    // T-1104: ↑↓ move over the Runs lines with a report, Enter shows the one under the cursor
    const runIds = draw().ids.filter(i => reportPickOf(i))
    if ((key === 'up' || key === 'down') && runIds.length) return void setRunCursor(moveCursor(runCursor(), key === 'up' ? -1 : 1, runIds.length))
    if (key === 'open' && runIds.length) return pickReport(reportPickOf(runIds[moveCursor(runCursor(), 0, runIds.length)]!)!)
    // a number key picks that choice of the page, as a click on its line does (T-583)
    const n = CHOICE_KEYS.indexOf(key as ChoiceKey)
    if (n >= 0) return pick(n + 1, sessionID)
    if (key !== 'a' || !panelKeys(f, open).some(k => k.word === 'answer')) return
    const choices = answerOptions(f, open)
    const picked = choices.length > 1 ? await ctx.ui.dialog.select({ title: `Answer ${open}`, options: choices.map(c => ({ title: c, value: c })) }) : OWN_ANSWER
    if (picked) await answerWith(picked, sessionID)
  }
  /** A click on a task page's button without a key (T-680: Drop in review): the open task's action `id`, when its
   *  page still offers it. */
  const pressAction = (id: TaskActionId, sessionID: string) => {
    const f = file()
    const t = tab() === 'tasks' ? f?.view.tasks.find(x => x.id === opened()) : undefined
    const act = t ? taskActions(t, { merging: approveInProgress(f, t, approving(), now()) }).find(x => x.id === id && TASK_ACTION_COMMANDS[x.id]) : undefined
    if (act) return doAction(act, sessionID)
  }
  /** Sends the open task's action `act` (core's taskActions) as its slash command (TASK_ACTION_COMMANDS); reject,
   *  ask more, drop and role ask first. */
  const doAction = async (act: TaskAction, sessionID: string) => {
    const f = file()
    const open = opened()
    const t = f?.view.tasks.find(x => x.id === open)
    const command = TASK_ACTION_COMMANDS[act.id]
    if (command === 'reject') {
      const ask = act.id === 'ask-more'
        ? { title: `Ask more on ${open}`, description: 'What else to find out; it gets a fresh try with your question', placeholder: 'your follow-up question' }
        : { title: `Reject ${open}`, description: 'What is wrong and what to change, for the next worker', placeholder: 'the reason' }
      const reason = (await ctx.ui.dialog.prompt(ask))?.trim()
      if (reason) await send(sessionID, { kind: 'reject', id: open, reason })
      return
    }
    if (command === 'approve') {
      setApproving({ id: open, at: d.now() })
      if (!(await sendOk(sessionID, { kind: 'approve', id: open })) && approving()?.id === open) setApproving(undefined)
      return
    }
    if (command === 'diff') return send(sessionID, { kind: command, id: open })
    if (command === 'drop') {
      // the reason is optional: Enter on the empty box drops it without one; Esc keeps the task
      const reason = await ctx.ui.dialog.prompt({ title: `Drop ${open}`, description: 'Why (optional): Enter on an empty box drops it without a reason', placeholder: 'the reason, or nothing' })
      if (reason === undefined) return
      return send(sessionID, { kind: 'task', id: open, verb: 'drop', ...(reason.trim() ? { arg: reason.trim() } : {}) })
    }
    if (command === 'role') {
      const now = (t!.role || 'general').toLowerCase()
      const role = await ctx.ui.dialog.select({ title: `Pick a role for ${open}`, options: panelRoleChoices(f).map(r => ({ title: r.toLowerCase() === now ? `${r} (now)` : r, value: r })) })
      if (role) await send(sessionID, { kind: 'task', id: open, verb: 'role', arg: role })
      return
    }
    if (command === 'review') return send(sessionID, { kind: 'task', id: open, verb: 'review', arg: t!.needs_review ? 'off' : 'on' })
    // T-954: Run now; a task that waits on unfinished tasks asks "Start anyway?" first (Esc or Cancel starts nothing).
    // Cancel is listed first: OpenCode's select highlights the first option, so Enter alone cancels.
    if (command === 'run') {
      const waits = f && t ? runNowWaits({ tasks: f.view.tasks, ...(f.view.archived_done ? { archived_done: f.view.archived_done } : {}) }, t) : []
      if (!waits.length) return send(sessionID, { kind: 'task', id: open, verb: 'run' })
      const pick = await ctx.ui.dialog.select({ title: runNowQuestion(open, waits), options: [{ title: RUN_NOW_NO, value: 'no' }, { title: RUN_NOW_YES, value: 'yes' }] })
      if (pick === 'yes') await send(sessionID, { kind: 'task', id: open, verb: 'run', arg: 'anyway' })
      return
    }
    if (command) return send(sessionID, { kind: 'task', id: open, verb: command })
  }
  /** Answers the open task or question with `picked` (OWN_ANSWER: the owner types it first), and the page says so. */
  const answerWith = async (picked: string, sessionID: string) => {
    const open = opened()
    const answer = picked === OWN_ANSWER ? (await ctx.ui.dialog.prompt({ title: `Your answer to ${open}`, placeholder: 'type and press Enter' }))?.trim() : picked
    if (!answer) return
    if ((await sendOk(sessionID, { kind: 'answer', id: open, answer })) && opened() === open) setSent({ id: open, answer })
  }
  /** Picks choice `n` (1 = the first) of the open page's answer choices (a click on its line, or its number key). */
  const pick = async (n: number, sessionID: string) => {
    const open = opened()
    if (tab() !== 'tasks' || !open) return
    const choices = answerOptions(file(), open)
    const c = choices[n - 1]
    if (c) await answerWith(c, sessionID)
    // T-1104: with no question, the number keys open that try's worker report
    else if (!choices.length) {
      const t = file()?.view.tasks.find(x => x.id === open)
      if (t && taskReports(t).length > 1 && taskReports(t).some(r => r.try === n)) pickReport({ try: n, kind: 'worker' })
    }
  }
  /** A click on the panel (T-558): a row opens its task or question, a group's row opens or closes it, a key hint
   *  does what its key does. The cursor goes to the clicked row, so the keys go on from there. */
  const click = (hit: PanelHit, sessionID: string) => {
    if ('key' in hit) return press(hit.key, sessionID)
    if ('tab' in hit) return showTab(hit.tab)
    if ('choice' in hit) return pick(hit.choice, sessionID)
    if ('action' in hit) return pressAction(hit.action, sessionID)
    if ('save' in hit) return saveEdit(sessionID)
    if ('report' in hit) {
      const at = draw().ids.indexOf(reportPickId(hit.report))
      if (at >= 0) setRunCursor(at)
      return pickReport(hit.report)
    }
    const ids = draw().ids
    if ('editField' in hit) {
      const at = ids.indexOf(editBoxId(hit.editField))
      if (at >= 0) setRunCursor(at)
      return editBox(hit.editField)
    }
    if ('scout' in hit) {
      if (ids.indexOf(hit.scout) >= 0) setCursor(ids.indexOf(hit.scout))
      return openPage(hit.scout)
    }
    if ('run' in hit) {
      if (ids.indexOf(hit.run) >= 0) setRunCursor(ids.indexOf(hit.run))
      return openRun(hit.run)
    }
    if ('setting' in hit) {
      if (ids.indexOf(hit.setting) >= 0) setCursor(ids.indexOf(hit.setting))
      return changeSetting(hit.setting, sessionID)
    }
    if ('settingGroup' in hit) {
      const at = ids.indexOf(settingGroupId(hit.settingGroup))
      if (at >= 0) setCursor(at)
      return toggleSettingGroup(hit.settingGroup)
    }
    if ('page' in hit) {
      const at = ids.indexOf(hit.page)
      if (at >= 0) (opened() ? setRunCursor : setCursor)(at)
      return hasPage(file(), hit.page, 'settings') ? openPage(hit.page) : undefined
    }
    // a lane on the Live tab opens its task on the Tasks tab
    if ('open' in hit && tab() === 'live') return openLive(hit.open)
    if ('more' in hit) return void setBacklogAll(true)
    const id = 'open' in hit ? hit.open : 'day' in hit ? dayId(hit.day) : groupId(hit.group)
    const at = (tab() === 'tasks' ? listIds() : draw().ids).indexOf(id)
    if (at >= 0) setCursor(at)
    if ('group' in hit) return void toggle(hit.group)
    if ('day' in hit) return void toggleDay(hit.day)
    if (hasPage(file(), hit.open)) openPage(hit.open)
  }
  /** The mouse wheel: scrolls the list or page by WHEEL_LINES (draw keeps it within the list's or page's length). */
  const wheel = (e: TuiMouseEvent) => {
    const by = e.scroll?.direction === 'up' ? -WHEEL_LINES : e.scroll?.direction === 'down' ? WHEEL_LINES : 0
    if (!by) return
    e.stopPropagation?.()
    setScroll(Math.max(0, scroll() + by))
    setScroll(draw().scroll)
  }
  return { press, click, wheel, openOnList }
}
