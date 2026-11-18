// The lead's tokens, read from Claude Code's own session logs. Only the Claude Code adapter knows where they
// are and what their lines look like; core/stats.ts works on LeadCall lists (see TeamInput there).
import type { Host } from '../host'
import { jsonObj } from '../core/text'
import { tokenCount } from '../core/runs'
import { rangeSpan, type LeadCall, type StatsRange, type TeamInput } from '../core/stats'
import { shortHome } from '../core/banner'
import { usageTokens, type ClaudeUsage } from './usage'

/** Where the lead's calls come from, as /<name>-stats full says it ("…, from <this>"). */
export const LEAD_LOGS = "Claude Code's session logs"

/**
 * The lead's calls in one session log (Claude Code's <session>.jsonl): only assistant lines of the main chat
 * (not sidechains) with usage; only the usage numbers are read. A call written over several lines counts once.
 */
export function leadCalls(jsonl: string): LeadCall[] {
  const byId = new Map<string, LeadCall>()
  let n = 0
  for (const line of String(jsonl ?? '').split('\n')) {
    if (!line.includes('"usage"')) continue
    const o = jsonObj(line)
    if (!o || o.type !== 'assistant' || o.isSidechain === true) continue
    const m = o.message as { id?: unknown; usage?: Record<string, unknown> } | undefined
    const u = m?.usage
    if (!u || typeof u !== 'object') continue
    const tokens = usageTokens(u as ClaudeUsage)
    if (!tokens) continue
    const id = typeof m!.id === 'string' && m!.id ? m!.id : `line-${n++}`
    const atMs = Date.parse(typeof o.timestamp === 'string' ? o.timestamp : '')
    const old = byId.get(id)
    if (!old || tokenCount(tokens) > tokenCount(old.tokens)) byId.set(id, { id, atMs, tokens, from: LEAD_LOGS })
  }
  return [...byId.values()]
}

/** Claude Code's folder name for a project path under ~/.claude/projects: every character not a letter or digit becomes "-". */
export const projectFolderName = (root: string) => String(root ?? '').replace(/[^a-zA-Z0-9]/g, '-')

/**
 * The lead's tokens for project folder `root`: the plugin API gives no per-session token counts (only this session's
 * $ total), so they are read from Claude Code's own session logs, ~/.claude/projects/<this project's folder>/<session>.jsonl.
 * Read-only, only this project's folder, only the usage numbers (see leadCalls). For a days range, logs not written
 * to since the range began are skipped.
 */
export async function leadUsage($: Host, root: string, range: StatsRange, nowMs: number): Promise<Pick<TeamInput, 'lead' | 'leadSessions' | 'leadProblem' | 'leadFrom'>> {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const base = (await $.env.get('CLAUDE_CONFIG_DIR')) || (home ? `${home}/.claude` : '')
  if (!base) return { leadProblem: "can't find Claude Code's folder (no HOME)" }
  const dir = `${base}/projects/${projectFolderName(root)}`
  const files = await $.fs.list(dir).catch(() => null)
  if (!files) return { leadProblem: `no session logs in ${shortHome(dir, home)}` }
  const from = rangeSpan(range, [], nowMs).from
  // a resumed session's log may repeat calls of the one before: each call counts once
  const lead = new Map<string, LeadCall>()
  let sessions = 0
  for (const f of files) {
    if (f.kind !== 'file' || !f.name.endsWith('.jsonl')) continue
    if (range.kind === 'days' && from !== undefined && f.mtimeMs < from) continue
    const text = await $.fs.read(`${dir}/${f.name}`).catch(() => null)
    if (text === null) continue
    const calls = leadCalls(String(text))
    if (calls.length) sessions++
    for (const c of calls) lead.set(c.id, c)
  }
  return { lead: [...lead.values()], leadSessions: sessions, leadFrom: LEAD_LOGS }
}
