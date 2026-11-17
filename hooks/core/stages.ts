// A kind's workflow: the stages written in its file's body (docs/research/task-kinds-and-workflows.md, section 1).
// Each stage is a `## <name>` heading, then `key: value` lines, then free text (the worker's instructions).
// Exactly one of worker: / check: / gate: / children: says what the stage is; files:, on fail:, minutes: and
// model: are optional. A merging kind ends with the built-in merge step, which is not written in the file.
// Pure code, no I/O. Nothing runs these stages yet: a task still runs as one worker, then commit, tests and merge.

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
      const m = /^back to\s+([A-Za-z0-9-]+)\s*(?:,\s*(\d+)\s+times?)?$/.exec(v)
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
