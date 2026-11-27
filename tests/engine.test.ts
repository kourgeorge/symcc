// T-635, softened by T-645: hooks/engine.ts re-exports engine names, and each value it exports must be the very same
// value as in the file it comes from. The list of names is built from hooks/engine.ts itself (its exports), so no
// table here needs a row per name, and a host starting or stopping to use an engine name never makes this test fail.
// Whether the list still matches what the hosts import is only reported, as a note, by tests/engine-names.mjs.
// SOURCES lists the engine files hooks/engine.ts re-exports from; add one only when hooks/engine.ts gets a new file.
import { expect, test } from 'claude-code/testing'
import * as engine from '../hooks/engine'
import * as m_app_ask from '../hooks/app/ask'
import * as m_app_board_mode from '../hooks/app/board-mode'
import * as m_app_git from '../hooks/app/git'
import * as m_app_kinds from '../hooks/app/kinds'
import * as m_app_logo from '../hooks/app/logo'
import * as m_app_open from '../hooks/app/open'
import * as m_app_org_mem from '../hooks/app/org-mem'
import * as m_app_plan from '../hooks/app/plan'
import * as m_app_questions from '../hooks/app/questions'
import * as m_app_review from '../hooks/app/review'
import * as m_app_roles from '../hooks/app/roles'
import * as m_app_scouts from '../hooks/app/scouts'
import * as m_app_starts from '../hooks/app/starts'
import * as m_app_state from '../hooks/app/state'
import * as m_app_store from '../hooks/app/store'
import * as m_app_symcc from '../hooks/app/symcc'
import * as m_app_tell from '../hooks/app/tell'
import * as m_app_tools from '../hooks/app/tools'
import * as m_app_workers from '../hooks/app/workers'
import * as m_board from '../hooks/board'
import * as m_core_ask from '../hooks/core/ask'
import * as m_core_banner from '../hooks/core/banner'
import * as m_core_board_file from '../hooks/core/board-file'
import * as m_core_days from '../hooks/core/days'
import * as m_core_def_files from '../hooks/core/def-files'
import * as m_core_timeline from '../hooks/core/timeline'
import * as m_core_org_mem from '../hooks/core/org-mem'
import * as m_core_path_guard from '../hooks/core/path-guard'
import * as m_core_prompts from '../hooks/core/prompts'
import * as m_core_questions from '../hooks/core/questions'
import * as m_core_roles from '../hooks/core/roles'
import * as m_core_runs from '../hooks/core/runs'
import * as m_core_scouts from '../hooks/core/scouts'
import * as m_core_stats from '../hooks/core/stats'
import * as m_core_task_sections from '../hooks/core/task-sections'
import * as m_core_text from '../hooks/core/text'
import * as m_host from '../hooks/host'
import * as m_name from '../hooks/name'
import * as m_opencode_board_view from '../hooks/opencode/board-view'
import * as m_process_agents from '../hooks/process/agents'
import * as m_process_claude_runner from '../hooks/process/claude-runner'
import * as m_process_record from '../hooks/process/record'
const SOURCES: [string, Record<string, unknown>][] = [
  ['./app/ask', m_app_ask],
  ['./app/board-mode', m_app_board_mode],
  ['./app/git', m_app_git],
  ['./app/kinds', m_app_kinds],
  ['./app/logo', m_app_logo],
  ['./app/open', m_app_open],
  ['./app/org-mem', m_app_org_mem],
  ['./app/plan', m_app_plan],
  ['./app/questions', m_app_questions],
  ['./app/review', m_app_review],
  ['./app/roles', m_app_roles],
  ['./app/scouts', m_app_scouts],
  ['./app/starts', m_app_starts],
  ['./app/state', m_app_state],
  ['./app/store', m_app_store],
  ['./app/symcc', m_app_symcc],
  ['./app/tell', m_app_tell],
  ['./app/tools', m_app_tools],
  ['./app/workers', m_app_workers],
  ['./board', m_board],
  ['./core/ask', m_core_ask],
  ['./core/banner', m_core_banner],
  ['./core/board-file', m_core_board_file],
  ['./core/days', m_core_days],
  ['./core/def-files', m_core_def_files],
  ['./core/timeline', m_core_timeline],
  ['./core/org-mem', m_core_org_mem],
  ['./core/path-guard', m_core_path_guard],
  ['./core/prompts', m_core_prompts],
  ['./core/questions', m_core_questions],
  ['./core/roles', m_core_roles],
  ['./core/runs', m_core_runs],
  ['./core/scouts', m_core_scouts],
  ['./core/stats', m_core_stats],
  ['./core/task-sections', m_core_task_sections],
  ['./core/text', m_core_text],
  ['./host', m_host],
  ['./name', m_name],
  ['./opencode/board-view', m_opencode_board_view],
  ['./process/agents', m_process_agents],
  ['./process/claude-runner', m_process_claude_runner],
  ['./process/record', m_process_record],
]

const E = engine as Record<string, unknown>

test('every value hooks/engine.ts exports is defined and the same value as in an engine file it re-exports from', () => {
  const wrong: string[] = []
  for (const name of Object.keys(E).sort()) {
    if (E[name] === undefined) { wrong.push(`${name}: undefined in hooks/engine.ts`); continue }
    const from = SOURCES.filter(([, src]) => name in src)
    if (!from.length) wrong.push(`${name}: in none of the engine files listed in SOURCES (add its file there)`)
    else if (!from.some(([, src]) => src[name] === E[name])) wrong.push(`${name}: hooks/engine.ts differs from ${from.map(([f]) => f).join(', ')}`)
  }
  expect(wrong).toEqual([])
})

test('hooks/engine.ts exports some values (the check above is not empty)', () => {
  expect(Object.keys(E).length > 0).toBe(true)
})
