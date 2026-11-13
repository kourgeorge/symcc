import { expect, test } from 'claude-code/testing'
import { addTask, emptyBoard, ready, scoutWhyNot, statusLine, statusStrip, bannerStrip, emptyPlan, inPlan, notePlan, planAdded, planAddText, planBacklog, planBandText, planEndText, planFromAttachment, planFromMode, PLAN_NOTE, type PlanState } from '../hooks/board'

const T = '2026-11-13T00:00:00.000Z'
const W = { why: 'a test' }
const ON: PlanState = { on: true, added: [] }
const GO = { driving: true, gitOk: true, mode: 'auto' as const, on: true }

test('plan mode is read from the permission mode and the plan mode attachments; anything else says nothing', () => {
  expect(planFromMode('plan')).toBe(true)
  for (const m of ['default', 'acceptEdits', 'auto', 'bypassPermissions', 'dontAsk']) expect(planFromMode(m)).toBe(false)
  for (const m of [undefined, '', null, 3]) expect(planFromMode(m)).toBe(null)
  expect(planFromAttachment('plan_mode')).toBe(true)
  expect(planFromAttachment('plan_mode_reentry')).toBe(true)
  expect(planFromAttachment('plan_mode_exit')).toBe(false)
  expect(planFromAttachment('todo_reminder')).toBe(null)
})

test('add in plan mode goes to the backlog and says so; the task is noted once', () => {
  expect(planBacklog(false, ON)).toBe(true)
  expect(planBacklog(true, ON)).toBe(true)
  const [b, t] = addTask(emptyBoard(), { origin: W, title: 'Idea', backlog: planBacklog(false, ON) }, T)
  expect(t.status).toBe('backlog')
  expect(ready(b)).toEqual([])
  expect(planAddText(t.id, t.title)).toBe(`plan mode: ${t.id} Idea added to the backlog; nothing starts`)
  const p = planAdded(planAdded(ON, t.id), t.id)
  expect(p.added).toEqual([t.id])
})

test('unknown mode behaves as today: add is not moved to the backlog, scouts may start, no plan words', () => {
  const p = emptyPlan()
  expect(p.on).toBe(null)
  expect(inPlan(p)).toBe(false)
  expect(planBacklog(false, p)).toBe(false)
  const [, t] = addTask(emptyBoard(), { origin: W, title: 'Now', backlog: planBacklog(false, p) }, T)
  expect(t.status).toBe('todo')
  expect(scoutWhyNot({ name: 's', running: false }, { ...GO, plan: inPlan(p) })).toBe('')
  // a signal that says nothing keeps it unknown
  expect(notePlan(p, null)).toEqual({ plan: p, left: null, changed: false })
  const tasks = [{ id: 'T-1', status: 'doing' as const }]
  expect(statusLine({ tasks }, true, '', 'auto', inPlan(p))).not.toContain(PLAN_NOTE)
  expect(statusStrip({ mode: 'auto', plan_mode: inPlan(p), tasks, scouts: [] }, 0)).not.toContain(PLAN_NOTE)
})

test('scouts skip in plan mode (timer and run now go through scoutWhyNot); the other reasons still come first', () => {
  expect(scoutWhyNot({ name: 's', running: false }, { ...GO, plan: true })).toBe('plan mode: nothing starts, so scout s waits; leave plan mode first')
  expect(scoutWhyNot({ name: 's', running: true }, { ...GO, plan: true })).toBe('s is already running')
  expect(scoutWhyNot({ name: 's', running: false }, { ...GO, plan: false })).toBe('')
})

test('the band, the status line and the status strip say "plan mode: nothing starts"; running workers keep going', () => {
  expect(planBandText(0)).toBe('plan mode: nothing starts')
  expect(planBandText(1)).toBe('plan mode: nothing starts (1 worker keeps going)')
  expect(planBandText(3)).toBe('plan mode: nothing starts (3 workers keep going)')
  const tasks = [{ id: 'T-1', status: 'doing' as const }]
  expect(statusLine({ tasks }, true, '', 'auto', true)).toBe('plan mode: nothing starts · ⏵ auto · T-1 doing')
  expect(statusLine({ tasks: [] }, true, '', 'auto', true)).toBe('plan mode: nothing starts')
  expect(statusLine({ tasks: [] }, true, '', 'auto', false)).toBe(undefined)
  expect(statusStrip({ mode: 'auto', plan_mode: true, max_parallel: 3, tasks, scouts: [] }, 0)).toBe('symcc · auto · 1/3 workers · 0 scouts · plan mode: nothing starts')
  expect(bannerStrip({ mode: 'auto', plan_mode: true, max_parallel: 3, tasks, scouts: [] }, 0)).toBe('1/3 workers · 0 scouts · plan mode: nothing starts')
})

test('leaving plan mode tells the lead once, with the backlog tasks added during it; nothing is moved', () => {
  let p: PlanState = emptyPlan()
  let r = notePlan(p, true)
  expect(r.changed).toBe(true)
  expect(r.left).toBe(null)
  p = planAdded(planAdded(r.plan, 'T-4'), 'T-5')
  // still in plan mode: nothing to tell
  r = notePlan(p, true)
  expect(r).toEqual({ plan: p, left: null, changed: false })
  r = notePlan(p, false)
  expect(r.left).toEqual(['T-4', 'T-5'])
  expect(r.plan).toEqual({ on: false, added: [] })
  // a second "off" signal tells nothing more
  expect(notePlan(r.plan, false).left).toBe(null)
  const tasks = [
    { id: 'T-4', title: 'Search', status: 'backlog' as const },
    { id: 'T-5', title: 'Moved already', status: 'todo' as const },
  ]
  const text = planEndText(['T-4', 'T-5'], tasks, 'symcc')
  expect(text).toBe('Plan mode is off. 1 task was added to the backlog during plan mode:\n- T-4 Search\nAsk the owner which ones to move to todo (symcc change backlog: false); don\'t move them without asking.')
  expect(tasks[0]!.status).toBe('backlog')
  // none left in the backlog: the lead isn't woken
  expect(planEndText([], tasks)).toBe('')
  expect(planEndText(['T-5'], tasks)).toBe('')
  // from unknown straight to off: nothing to tell
  expect(notePlan(emptyPlan(), false).left).toBe(null)
})
