// A kind's workflow: the stages written in its file's body (docs/research/task-kinds-and-workflows.md, section 1).
// Each stage is a `## <name>` heading, then `key: value` lines, then free text (the worker's instructions).
// Exactly one of worker: / check: / gate: / children: says what the stage is; files:, on fail:, minutes: and
// model: are optional. A merging kind ends with the built-in merge step, which is not written in the file.
// Pure code, no I/O. hooks/plugin/workers.ts runs them (runStages): each worker stage is a fresh worker in the task's folder.

/** What a stage is: a worker run, a check symcc runs itself, an approval, an epic's child tasks, or the built-in merge. */
export type StageType = 'worker' | 'check' | 'gate' | 'children' | 'merge'

/** Which files a worker stage may change: the task's files, only the test files among them, or only the epic's spec. */
export type StageFiles = 'task' | 'tests' | 'spec'

/** One stage of a kind's workflow. `value` is what follows its type key (a role name or `task`, a check, `owner` / `lead`, `from spec`). */
export type Stage = {
  name: string
  type: StageType
  value: string
  files: StageFiles
  /** `on fail: back to <stage>, <N> times`. */
  onFail?: { back: string; times: number }
  minutes?: number
  model?: string
  /** The free text after the key lines (only worker stages use it). */
  text: string
}

/** A kind's front matter keys that say how it runs (description and off are read by kinds.ts). */
export type KindRun = { merges: boolean; mergeTests: boolean }

/** The kind whose file may have a `children:` stage. */
export const EPIC_KIND = 'epic'

/** The name of the built-in last step of a merging kind. */
export const MERGE_STAGE = 'merge'

/** The front matter keys a kind file may have. */
export const KIND_KEYS: readonly string[] = ['description', 'off', 'merges', 'merge_tests']

/** The keys a stage may have; the first four say what the stage is. */
export const STAGE_TYPE_KEYS: readonly string[] = ['worker', 'check', 'gate', 'children']
export const STAGE_KEYS: readonly string[] = [...STAGE_TYPE_KEYS, 'files', 'on fail', 'minutes', 'model']

/** The checks symcc knows (plus `run: <shell command>`). */
export const CHECKS: readonly string[] = ['tests', 'scope', 'new test fails on old code', 'no test files changed']

const STAGE_NAME = /^[A-Za-z0-9-]+$/
const ROLE_NAME = /^[A-Za-z0-9_-]+$/
/** A key line: one or two lowercase words, then a colon (so "Note: ..." or a sentence with a colon stays text). */
const KEY_LINE = /^([a-z_]+(?: [a-z_]+)?):(?:\s+(.*?))?\s*$/

/** A yes / no front matter value as true / false, or null when it is neither. */
export function yesNo(value: string): boolean | null {
  const v = value.trim().toLowerCase()
  if (/^(yes|true)$/.test(v)) return true
  if (/^(no|false)$/.test(v)) return false
  return null
}

/** The front matter keys that say how a kind runs, from its `key -> value` pairs; or why they can't be used. */
export function readKindRun(pairs: readonly { key: string; value: string }[]): KindRun | string {
  const run: KindRun = { merges: true, mergeTests: true }
  for (const { key, value } of pairs) {
    if (!KIND_KEYS.includes(key)) return `unknown key "${key}" in the front matter (use ${KIND_KEYS.join(', ')})`
    if (key !== 'merges' && key !== 'merge_tests') continue
    const yes = yesNo(value)
    if (yes === null) return `${key} must be yes or no, not "${value}"`
    if (key === 'merges') run.merges = yes
    else run.mergeTests = yes
  }
  return run
}

/** The stages a kind gets when its body names none: one worker (the task's role, with the body as its text), then tests when it merges. */
export function defaultStages(merges: boolean, text = ''): Stage[] {
  const code: Stage = { name: 'code', type: 'worker', value: 'task', files: 'task', text: text.trim() }
  if (!merges) return [code]
  return [code, { name: 'tests', type: 'check', value: 'tests', files: 'task', onFail: { back: 'code', times: 2 }, text: '' }]
}

/** The built-in merge step that ends every merging kind. */
export const mergeStage = (): Stage => ({ name: MERGE_STAGE, type: 'merge', value: '', files: 'task', text: '' })

/** Why a stage's type key value can't be used, or null when it can. */
function typeValueError(type: string, value: string): string | null {
  if (!value) return `${type}: needs a value`
  if (type === 'worker') return value === 'task' || ROLE_NAME.test(value) ? null : `worker: must be a role name or task, not "${value}"`
  if (type === 'check') {
    if (CHECKS.includes(value)) return null
    const run = /^run:\s*(.*)$/.exec(value)
    if (run) return run[1]!.trim() ? null : 'check: run: needs a shell command'
    return `unknown check "${value}" (use ${[...CHECKS, 'run: <shell command>'].join(', ')})`
  }
  if (type === 'gate') return value === 'owner' || value === 'lead' ? null : `gate: must be owner or lead, not "${value}"`
  return value === 'from spec' ? null : `children: must be "from spec", not "${value}"`
}

/**
 * A kind file's body as its stage list, or why it can't be used. `kind` is the kind's name (only `epic` may have a
 * `children:` stage); `merges` adds the built-in merge step at the end. A body with no `## ` heading gets defaultStages.
 */
export function parseStages(body: string, kind: string, merges = true): Stage[] | string {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const first = lines.findIndex(l => /^##\s/.test(l))
  if (first < 0) {
    const stages = defaultStages(merges, body)
    return merges ? [...stages, mergeStage()] : stages
  }
  type Raw = { name: string; lines: string[] }
  const raws: Raw[] = []
  for (const line of lines.slice(first)) {
    const h = /^##\s+(.*?)\s*$/.exec(line)
    if (h) raws.push({ name: h[1]!, lines: [] })
    else raws[raws.length - 1]!.lines.push(line)
  }
  const stages: Stage[] = []
  for (const raw of raws) {
    const where = `stage "${raw.name}"`
    if (!STAGE_NAME.test(raw.name)) return `bad stage name "${raw.name}" (use letters, digits and - only)`
    if (stages.some(s => s.name === raw.name)) return `two stages are named "${raw.name}"`
    if (merges && raw.name === MERGE_STAGE) return `a stage can't be named "${MERGE_STAGE}": that is the built-in last step`
    const keys = new Map<string, string>()
    let i = 0
    for (; i < raw.lines.length; i++) {
      const line = raw.lines[i]!.trim()
      if (!line) {
        if (keys.size) break
        continue
      }
      const kv = KEY_LINE.exec(line)
      if (!kv) break
      const key = kv[1]!
      if (!STAGE_KEYS.includes(key)) return `unknown key "${key}" in ${where} (use ${STAGE_KEYS.join(', ')})`
      if (keys.has(key)) return `"${key}" is given twice in ${where}`
      keys.set(key, (kv[2] ?? '').trim())
    }
    const types = STAGE_TYPE_KEYS.filter(k => keys.has(k))
    if (types.length !== 1) return `${where} needs exactly one of ${STAGE_TYPE_KEYS.map(k => `${k}:`).join(', ')}${types.length ? ` (it has ${types.join(' and ')})` : ''}`
    const type = types[0] as Exclude<StageType, 'merge'>
    const value = keys.get(type)!
    const bad = typeValueError(type, value)
    if (bad) return `${bad} in ${where}`
    if (type === 'children' && kind !== EPIC_KIND) return `${where} has children:, which only the ${EPIC_KIND} kind may have`
    const stage: Stage = { name: raw.name, type, value, files: 'task', text: raw.lines.slice(i).join('\n').trim() }
    if (keys.has('files')) {
      const f = keys.get('files')!
      if (f !== 'task' && f !== 'tests' && f !== 'spec') return `files: must be task, tests or spec, not "${f}" in ${where}`
      stage.files = f
    }
    if (keys.has('on fail')) {
      const v = keys.get('on fail')!
      const m = /^back to\s+([A-Za-z0-9-]+)\s*(?:,?\s*(\d+)\s+times?)?$/.exec(v)
      if (!m) return `on fail: must be "back to <stage>, <N> times", not "${v}" in ${where}`
      if (!m[2]) return `on fail: in ${where} needs a count ("back to ${m[1]}, 2 times")`
      const times = Number(m[2])
      if (times < 1) return `on fail: in ${where} needs a count of 1 or more`
      if (!raws.some(r => r.name === m[1])) return `on fail: in ${where} goes back to "${m[1]}", which is not a stage`
      if (!stages.some(s => s.name === m[1])) return `on fail: in ${where} goes back to "${m[1]}", which is not an earlier stage`
      stage.onFail = { back: m[1]!, times }
    }
    if (keys.has('minutes')) {
      const n = Number(keys.get('minutes'))
      if (!Number.isFinite(n) || n <= 0) return `minutes: must be a number above 0 in ${where}`
      stage.minutes = n
    }
    if (keys.has('model')) {
      const model = keys.get('model')!
      if (!model) return `model: needs a value in ${where}`
      stage.model = model
    }
    stages.push(stage)
  }
  return merges ? [...stages, mergeStage()] : stages
}

// ---------------- running the stages (pure: what comes next) ----------------

/** One finished stage of a task, oldest first (BoardTask.stages): a go-back keeps the record. `try`: the worker try of a worker stage. */
export type StageResult = { name: string; result: 'passed' | 'failed' | 'skipped'; at: string; try?: number; note?: string }

/** What a task keeps about its stages: the one it is in now (missing = the kind's first stage) and how many go-backs each `on fail` used. */
export type StageState = { stage?: string; backs?: Record<string, number> }

/** The stage named `name` in `stages`, else the first one (a task with no stage, or one its kind no longer has, is at its first stage). */
export function currentStage(stages: readonly Stage[], name?: string): Stage | undefined {
  return stages.find(s => s.name === name) ?? stages[0]
}

/** The worker stage a worker on a task at stage `name` runs: that stage when it is a worker stage, else the last worker stage before it (or the first one). */
export function workerStageFor(stages: readonly Stage[], name?: string): Stage | undefined {
  const at = Math.max(0, stages.findIndex(s => s.name === name))
  for (let i = at; i >= 0; i--) if (stages[i]!.type === 'worker') return stages[i]
  return stages.find(s => s.type === 'worker')
}

/** The role a worker stage runs as: its `worker:` role, or the task's own (`taskRole`) for `worker: task`. */
export const roleOfStage = (s: Pick<Stage, 'value'>, taskRole: string): string => (s.value === 'task' ? taskRole : s.value)

/** Whether symcc can run stage `s` yet: a worker, the tests or scope check, the merge step. Gates, the other checks and children come later
 *  (build steps 4 to 8 of docs/research/task-kinds-and-workflows.md); until then such a stage counts as passed, with a note. */
export const stageBuilt = (s: Pick<Stage, 'type' | 'value'>): boolean => s.type === 'worker' || s.type === 'merge' || (s.type === 'check' && (s.value === 'tests' || s.value === 'scope'))

/** The worker stages of `stages`. */
export const workerStages = (stages: readonly Stage[]): Stage[] => stages.filter(s => s.type === 'worker')

/** Whether a kind with `stages` has more than one worker stage (only then does a worker's prompt and history name its stage). */
export const manyWorkers = (stages: readonly Stage[]): boolean => workerStages(stages).length > 1

/** Whether a worker stage comes after stage `name` (so the task goes on to a fresh worker before it reaches the merge step). */
export function workerAfter(stages: readonly Stage[], name: string): boolean {
  const i = stages.findIndex(s => s.name === name)
  return i >= 0 && stages.slice(i + 1).some(s => s.type === 'worker')
}

/**
 * The worker stage a new try goes to after the merge step's tests failed, or its merge conflicted: the last `tests` check's
 * `on fail` target when it comes after the last worker stage, else the last worker stage (the one whose code is merged).
 */
export function retryStage(stages: readonly Stage[], conflict = false): Stage | undefined {
  const last = workerStages(stages).at(-1)
  if (!last || conflict) return last
  const i = stages.indexOf(last)
  const check = stages.slice(i + 1).filter(s => s.type === 'check' && s.value === 'tests').at(-1)
  return (check?.onFail && stages.find(s => s.name === check.onFail!.back)) || last
}

/** The stage a retried task (symcc retry, the board's retry) restarts at: the worker stage it was in or failed after (see workerStageFor). Its go-backs start over. */
export const retriedStage = (stages: readonly Stage[], name?: string): string | undefined => workerStageFor(stages, name)?.name

/** The stage a task rejected from review goes back to: the last worker stage before the merge step (the one whose code is merged). Its go-backs start over. */
export function rejectedStage(stages: readonly Stage[]): string | undefined {
  const m = stages.findIndex(s => s.type === 'merge')
  return workerStages(m >= 0 ? stages.slice(0, m) : stages).at(-1)?.name ?? workerStages(stages).at(-1)?.name
}

/** The `on fail` a stage follows: its own, else (a check) back to the worker stage just before it, `retries` times. A worker stage has none. */
export function onFailOf(stages: readonly Stage[], stage: Stage, retries: number): { back: string; times: number } | undefined {
  if (stage.onFail) return stage.onFail
  if (stage.type !== 'check') return undefined
  const i = stages.indexOf(stage)
  const before = stages.slice(0, Math.max(0, i)).filter(s => s.type === 'worker').at(-1)
  return before && retries > 0 ? { back: before.name, times: retries } : undefined
}

/**
 * How many new tries the merge step's failing tests get: the `on fail` count of the last `tests` check after the last worker stage
 * (the one retryStage goes back from), else `retries` (the board's auto_retries) when that check has no `on fail` or there is none.
 */
export function testRetriesOf(stages: readonly Stage[], retries: number): number {
  const last = workerStages(stages).at(-1)
  const after = last ? stages.slice(stages.indexOf(last) + 1) : stages
  const check = after.filter(s => s.type === 'check' && s.value === 'tests').at(-1)
  return check?.onFail?.times ?? retries
}

/** What comes after a stage: the next stage (maybe the merge step), the end (a kind that doesn't merge), a go-back, or failed. */
export type NextStage =
  | { go: 'next'; stage: Stage }
  | { go: 'end' }
  | { go: 'back'; stage: Stage; from: string; count: number; times: number }
  | { go: 'failed'; why: string }

/**
 * What comes after the task's current stage (`task.stage`, missing = the first) ended with `result`: when it passed, the next stage
 * (or the end); when it failed, its `on fail: back to <stage>, N times` while `task.backs` has used fewer than N (`count` is
 * the go-back this is, 1 for the first), else failed. A check with no `on fail` goes back to the worker stage before it
 * `retries` times (the board's auto_retries); a worker stage with none fails at once.
 */
export function nextStage(stages: readonly Stage[], task: StageState, result: 'passed' | 'failed', retries = 0): NextStage {
  const cur = currentStage(stages, task.stage)
  if (!cur) return result === 'passed' ? { go: 'end' } : { go: 'failed', why: 'the kind has no stages' }
  if (result === 'passed') {
    const next = stages[stages.indexOf(cur) + 1]
    return next ? { go: 'next', stage: next } : { go: 'end' }
  }
  const rule = onFailOf(stages, cur, retries)
  if (!rule) return { go: 'failed', why: `stage ${cur.name} failed` }
  const used = task.backs?.[cur.name] ?? 0
  const back = stages.find(s => s.name === rule.back)
  if (!back) return { go: 'failed', why: `stage ${cur.name} failed and goes back to ${rule.back}, which is not a stage` }
  if (used >= rule.times) return { go: 'failed', why: `stage ${cur.name} still failed after going back to ${rule.back} ${rule.times} ${rule.times === 1 ? 'time' : 'times'}` }
  return { go: 'back', stage: back, from: cur.name, count: used + 1, times: rule.times }
}

/** The stage a task with kind `stages` is at in status `status` when it has none yet (the one-time migration): its first worker stage while it is
 *  open, the stage before the merge step while it waits in review, none once it is done or dropped. */
export function migratedStage(stages: readonly Stage[], status: string): string | undefined {
  if (status === 'done' || status === 'dropped') return undefined
  if (status === 'review') return stages.filter(s => s.type !== 'merge').at(-1)?.name
  return (stages.find(s => s.type === 'worker') ?? stages[0])?.name
}
