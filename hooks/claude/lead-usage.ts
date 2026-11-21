// The lead's tokens, read from Claude Code's own session logs. Only the Claude Code adapter knows where they
// are and what their lines look like; core/stats.ts works on LeadCall lists (see TeamInput there).
import type { Host, LeadUsage } from '../host'
import { jsonObj } from '../core/text'
import { tokenCount } from '../core/runs'
import { rangeSpan, type LeadCall, type StatsRange } from '../core/stats'
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

/** The most $.fs.read takes (Claude Code refuses a bigger file). */
export const READ_LIMIT = 4 * 1024 * 1024
/** The size in MiB of one part a bigger log is read in (under the 4 MiB of stdout $.process.run keeps). */
export const PART_MIB = 3

/**
 * The usage lines of a session log too big for $.fs.read: read in parts of PART_MIB MiB with dd (the path is an
 * argument, never in a shell string), keeping only the lines that hold "usage". A line cut between two parts is
 * joined again. null when a part can't be read.
 *
 * T-778: dd runs in the log's own folder. Without a cwd, Claude Code starts it in the session's working folder,
 * which a shell `cd` of the lead moves (e.g. into a task's worktree); once that worktree is removed, every dd failed
 * to start (ENOENT) and the lead showed 0 tokens.
 */
export async function bigLogUsageLines($: Pick<Host, 'run'>, path: string): Promise<string | null> {
  const keep: string[] = []
  let carry = ''
  const cwd = path.slice(0, path.lastIndexOf('/')) || '/'
  for (let part = 0; part < 100_000; part++) {
    const r = await $.run(['dd', `if=${path}`, 'bs=1048576', `skip=${part * PART_MIB}`, `count=${PART_MIB}`], { cwd, timeoutMs: 60_000 }).catch(() => null)
    // a cut part (over the 4 MiB $.process.run keeps) would lose lines: say the log can't be read instead
    if (!r || r.exitCode !== 0 || (r as { isStdoutTruncated?: boolean }).isStdoutTruncated) return null
    const text = String(r.stdout ?? '')
    if (!text) break
    const lines = (carry + text).split('\n')
    carry = lines.pop() ?? ''
    for (const l of lines) if (l.includes('"usage"')) keep.push(l)
  }
  if (carry.includes('"usage"')) keep.push(carry)
  return keep.join('\n')
}

/** What leadUsage answers: the host's LeadUsage plus how many session logs couldn't be read at all (`leadUnread`). */
export type LeadUsageRead = LeadUsage & { leadUnread?: number }

/**
 * The lead's tokens for project folder `root`: the plugin API gives no per-session token counts (only this session's
 * $ total), so they are read from Claude Code's own session logs, ~/.claude/projects/<this project's folder>/<session>.jsonl.
 * Read-only, only this project's folder, only the usage numbers (see leadCalls). For a days range, logs not written
 * to since the range began are skipped. A log over 4 MiB (too big for $.fs.read) is read in parts (bigLogUsageLines);
 * one that still can't be read is counted in `leadUnread`, so the stats say the figure is short.
 */
export async function leadUsage($: Pick<Host, 'env' | 'fs' | 'run'>, root: string, range: StatsRange, nowMs: number): Promise<LeadUsageRead> {
  const home = (await $.env('HOME')) || (await $.env('USERPROFILE'))
  const base = (await $.env('CLAUDE_CONFIG_DIR')) || (home ? `${home}/.claude` : '')
  if (!base) return { leadProblem: "can't find Claude Code's folder (no HOME)" }
  const dir = `${base}/projects/${projectFolderName(root)}`
  const files = await $.fs.list(dir).catch(() => null)
  if (!files) return { leadProblem: `no session logs in ${shortHome(dir, home)}` }
  const from = rangeSpan(range, [], nowMs).from
  // a resumed session's log may repeat calls of the one before: each call counts once
  const lead = new Map<string, LeadCall>()
  let sessions = 0
  let unread = 0
  for (const f of files) {
    if (f.kind !== 'file' || !f.name.endsWith('.jsonl')) continue
    if (range.kind === 'days' && from !== undefined && f.mtimeMs < from) continue
    const path = `${dir}/${f.name}`
    let text = f.size > READ_LIMIT ? null : await $.fs.read(path).catch(() => null)
    if (text === null) text = await bigLogUsageLines($, path)
    if (text === null) { unread++; continue }
    const calls = leadCalls(String(text))
    if (calls.length) sessions++
    for (const c of calls) lead.set(c.id, c)
  }
  return { lead: [...lead.values()], leadSessions: sessions, leadFrom: LEAD_LOGS, ...(unread ? { leadUnread: unread } : {}) }
}
