// T-241: core/ knows no Claude Code tool names, agent types or agent statuses. The role functions take the host's
// tool names (RoleTools), and the agent functions take AgentState (alive, a worker or not), so another host (an
// OpenCode plugin, a standalone client) can use them with its own words. The Claude Code ones live in hooks/claude/.
import { expect, test } from 'claude-code/testing'
import { addTask, emptyBoard, patchTask, parseRole, roleSkipReason, roleTools, roleSection, liveWorkersFor, mayStart, orphanMove, WEB_SAFETY_LINE, type RoleTools, type AgentState } from '../hooks/board'
import * as claudeTypes from '../hooks/claude/agent-types'
import * as claudeAgents from '../hooks/claude/agents'

const T = '2026-11-18T00:00:00.000Z'
const OTHER: RoleTools = { extra: ['websearch', 'webfetch', 'todo'], web: ['websearch', 'webfetch'] }

test('core reads a role\'s tools: line with the tool names it is given, not Claude Code\'s', () => {
  const text = '---\ndescription: d\ntools: WebSearch, todo\n---\n- check\n'
  expect(parseRole('r', text, OTHER)?.tools).toEqual(['websearch', 'todo'])
  expect(roleSkipReason('r', '---\ndescription: d\ntools: Agent\n---\n', OTHER)).toBe('unknown tool "Agent" in tools (a role may only add: websearch, webfetch, todo)')
  expect(roleTools(['TODO', 'todo'], OTHER)).toEqual(['todo'])
  expect(roleSection(parseRole('r', text, OTHER)!, {}, OTHER)).toContain(WEB_SAFETY_LINE)
  expect(roleSection(parseRole('r', '---\ndescription: d\ntools: todo\n---\nx', OTHER)!, {}, OTHER)).not.toContain(WEB_SAFETY_LINE)
  // the same file with Claude Code's names, through the adapter
  expect(claudeTypes.parseRole('r', text)).toBe(null)
  expect(claudeTypes.roleSkipReason('r', text)).toBe('unknown tool "todo" in tools (a role may only add: WebSearch, WebFetch)')
  expect(claudeTypes.ROLE_TOOLS).toEqual({ extra: ['WebSearch', 'WebFetch'], web: ['WebSearch', 'WebFetch'] })
})

test('core finds live workers from AgentState; the Claude adapter makes those from $.agent.list() entries', () => {
  const b = patchTask(addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'A' }, T)[0], 'T-1', { status: 'doing', session: 'me', agent: 'w1' }, T)
  const live: AgentState = { id: 'w1', worker: true, alive: true, name: 'symcc-T-1' }
  expect(liveWorkersFor({ id: 'T-1' }, [live, { ...live, id: 'w2', alive: false }, { ...live, id: 'w3', worker: false }]).map(a => a.id)).toEqual(['w1'])
  expect(mayStart(patchTask(b, 'T-1', { status: 'todo' }, T).tasks[0], [live])).toBe(false)
  expect(orphanMove(live, b, 'me', 'me')).toEqual({ move: 'adopt', task: 'T-1' })
  expect(orphanMove({ ...live, alive: false }, b, 'me', 'me')).toEqual({ move: 'leave' })
  expect(claudeAgents.agentState({ id: 'w1', type: 'symcc:worker', status: 'killed' })).toMatchObject({ worker: true, alive: false })
  expect(claudeAgents.agentState({ id: 'w1', type: 'symcc:worker-web', status: 'running' })).toMatchObject({ worker: false, alive: true })
  expect(claudeAgents.isNotReady("Agent type 'symcc:worker' not found")).toBe(true)
  expect(claudeAgents.scoutNotReady("Agent type 'symcc:scout' not found")).toBe(true)
})
