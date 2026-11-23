// T-241: core/ knows no Claude Code tool names, agent types or agent statuses. A role's tools are symcc's words
// (T-373: tools: web), which each host maps to its own tools, and the agent functions take AgentState (alive, a worker or not), so another host (an
// OpenCode plugin, a standalone client) can use them with its own words. The Claude Code ones live in hooks/claude/.
import { expect, test } from 'claude-code/testing'
import { addTask, emptyBoard, patchTask, parseRole, roleSkipReason, roleTools, roleSection, liveWorkersFor, mayStart, orphanMove, WEB_SAFETY_LINE, statsReport, ROLE_TOOL_WORDS, type AgentState, type LeadCall } from '../hooks/board'
import * as claudeTypes from '../hooks/claude/agent-types'
import * as claudeAgents from '../hooks/claude/agents'
import * as board from '../hooks/board'
import { runBy } from './agent-fixture'
import { leadCalls, leadUsage, LEAD_LOGS } from '../hooks/claude/lead-usage'
import { usageTokens, turnEnd } from '../hooks/claude/usage'
import { type Host, agentState } from '../hooks/host'

const T = '2026-11-18T00:00:00.000Z'
test('core reads a role\'s tools: line in symcc\'s words (web), the same in every host; the Claude adapter maps them', () => {
  const text = '---\ndescription: d\ntools: web\n---\n- check\n'
  expect(ROLE_TOOL_WORDS).toEqual(['web'])
  expect(parseRole('r', text)?.tools).toEqual(['web'])
  expect(roleSkipReason('r', '---\ndescription: d\ntools: Agent\n---\n')).toBe('unknown tool "Agent" in tools (a role may only add: web)')
  expect(roleTools(['WEB', 'web'])).toEqual(['web'])
  expect(roleSection(parseRole('r', text)!, {})).toContain(WEB_SAFETY_LINE)
  expect(roleSection(parseRole('r', '---\ndescription: d\n---\nx')!, {})).not.toContain(WEB_SAFETY_LINE)
  // Claude Code's tool names are not role words
  expect(parseRole('r', '---\ndescription: d\ntools: WebSearch\n---\n')).toBe(null)
  // the Claude adapter: web is WebSearch and WebFetch, on the worker-web agent type
  expect(claudeTypes.claudeRoleTools(['web'])).toEqual(['WebSearch', 'WebFetch'])
  expect(claudeTypes.workerTypeFor(parseRole('r', text)!)).toBe('symcc:worker-web')
  expect(claudeTypes.workerAgentTypes().find(t => t.suffix === 'worker-web')?.tools).toEqual([...claudeTypes.BASE_WORKER_TOOLS, 'WebSearch', 'WebFetch', 'mcp__symcc__ask_owner'])
})

test('core finds live workers from AgentState; the Claude adapter makes HostAgents from $.agent.list() entries, and the host those AgentState', () => {
  const b = patchTask(addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'A' }, T)[0], 'T-1', { status: 'doing', live: { session: 'me' }, runs: [runBy('w1', T)] }, T)
  const live: AgentState = { id: 'w1', worker: true, alive: true, name: 'symcc-T-1' }
  expect(liveWorkersFor({ id: 'T-1' }, [live, { ...live, id: 'w2', alive: false }, { ...live, id: 'w3', worker: false }]).map(a => a.id)).toEqual(['w1'])
  expect(mayStart(patchTask(b, 'T-1', { status: 'todo' }, T).tasks[0], [live])).toBe(false)
  expect(orphanMove(live, b, 'me', 'me')).toEqual({ move: 'adopt', task: 'T-1' })
  expect(orphanMove({ ...live, alive: false }, b, 'me', 'me')).toEqual({ move: 'leave' })
  expect(claudeAgents.hostAgent({ id: 'w1', type: 'symcc:worker-web', status: 'running' })).toEqual({ id: 'w1', kind: 'worker', status: 'running' })
  expect(claudeAgents.hostAgent({ id: 's1', type: 'symcc:scout', status: 'running' }).kind).toBe('scout')
  expect(claudeAgents.hostAgent({ id: 'c1', type: 'symcc:checker', status: 'running' }).kind).toBe('scout')
  expect(claudeAgents.hostAgent({ id: 'g1', type: 'general-purpose', status: 'running' }).kind).toBe('other')
  expect(agentState(claudeAgents.hostAgent({ id: 'w1', type: 'symcc:worker', status: 'killed' }))).toMatchObject({ worker: true, alive: false })
  expect(agentState(claudeAgents.hostAgent({ id: 'w1', type: 'symcc:worker-web', status: 'running' }))).toMatchObject({ worker: true, alive: true })
  expect(agentState({ id: 's1', kind: 'scout', status: 'waiting' })).toMatchObject({ worker: false, alive: true })
  expect(claudeAgents.isNotReady("Agent type 'symcc:worker' not found")).toBe(true)
  expect(claudeAgents.scoutNotReady("Agent type 'symcc:scout' not found")).toBe(true)
  expect(claudeAgents.scoutNotReady("Agent type 'symcc:checker' not found")).toBe(true)
})

// T-242: core/ knows no Claude Code plan mode fields, usage field names or session log format either.
test('plan mode, usage and session log readers live in the Claude adapter, not in core', () => {
  for (const name of ['leadCalls', 'projectFolderName', 'leadUsage', 'LEAD_LOGS', 'planFromMode', 'planFromAttachment', 'usageTokens', 'seeMainMode']) expect(name in board).toBe(false)
  expect(usageTokens({ input_tokens: 3, cache_creation_input_tokens: 2 })).toEqual({ input: 3, cache_write: 2 })
  // how a turn ended: Claude Code's turn.complete fields become symcc's TurnEnd; a refusal only rides along on a refusal
  expect(turnEnd({ reason: 'refusal', refusal: { category: 'c', explanation: null } })).toEqual({ reason: 'refusal', refusal: { category: 'c', explanation: null } })
  expect(turnEnd({ reason: 'answer', refusal: { category: 'c', explanation: null } })).toEqual({ reason: 'answer' })
})

test('the stats say where the lead\'s calls come from as the adapter tells it', async () => {
  const NOW = Date.parse('2026-11-18T12:00:00.000Z')
  const call: LeadCall = { id: 'a', atMs: NOW - 60_000, tokens: { input: 10 } }
  const tasks = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'A' }, T)[0].tasks
  expect(statsReport({ tasks, nowMs: NOW, full: true, team: { lead: [call], leadFrom: 'the host\'s logs' } })).toMatch(/1 call, from the\s+host's logs/)
  expect(statsReport({ tasks, nowMs: NOW, full: true, team: { lead: [call] } })).toMatch(/10 tokens · 1 call\n/)
  const line = JSON.stringify({ type: 'assistant', timestamp: new Date(NOW).toISOString(), message: { id: 'm1', usage: { input_tokens: 5 } } })
  expect(leadCalls(line)).toEqual([{ id: 'm1', atMs: NOW, tokens: { input: 5 }, from: LEAD_LOGS }])
  // the reader: Claude Code's ~/.claude/projects/<folder>/*.jsonl, and it says so even when there are no calls
  const read: string[] = []
  const $ = {
    env: async (n: string) => (n === 'HOME' ? '/h' : undefined),
    fs: { list: async (d: string) => (read.push(d), [{ name: 's.jsonl', kind: 'file', size: 1, mtimeMs: NOW, isLink: false }]), read: async () => line },
  } as unknown as Host
  expect(await leadUsage($, '/p/my.app', { kind: 'all' }, NOW)).toEqual({ lead: [{ id: 'm1', atMs: NOW, tokens: { input: 5 }, from: LEAD_LOGS }], leadSessions: 1, leadFrom: LEAD_LOGS })
  expect(read).toEqual(['/h/.claude/projects/-p-my-app'])
})
