// Evidence events (T-660): besides the task events of a board write (core/events.ts), the activity log keeps what
// shows where agents struggle: a guard refusing a tool call, a "needs files" stop, a worker's question to the owner,
// a checker's verdict and a merge-queue outcome. Pure: the app side (app/evidence.ts) adds them to the log after the
// decision, in the background. Nothing in them is a full command, file contents or anything secret-looking.
import { hideSecrets } from './org-mem'

/** Who made the refused call. */
export type EvidenceRole = 'worker' | 'checker' | 'scout' | 'agent'

/**
 * Which guard refused it: 'path' (outside the agent's own folder), 'link' (a link that leads nowhere), 'too-many'
 * (too many paths to check), 'git' (a git write), 'files' (outside the task's files), 'scout-edit' (a scout editing
 * the project), 'stopped' (a stopped agent), 'unknown-agent', 'tools' (a symcc tool the agent may not call), 'ask'
 * (an ask_owner call that was refused).
 */
export type EvidenceGuard = 'path' | 'link' | 'too-many' | 'git' | 'files' | 'scout-edit' | 'stopped' | 'unknown-agent' | 'tools' | 'ask'

/** How a task's turn in the merge queue came out. */
export type QueueOutcome = 'merged' | 'review' | 'tests-failed' | 'timed-out' | 'conflict' | 'not-merged'

/** One evidence event. `task` is the task's id (a scout's refusal names the scout instead), `try` its try number then. */
export type EvidenceEvent =
  | { kind: 'refused'; at: string; task?: string; scout?: string; try?: number; role: EvidenceRole; guard: EvidenceGuard; reason: string; what?: string }
  | { kind: 'needs-files'; at: string; task: string; try: number; files: string[] }
  | { kind: 'asked'; at: string; task: string; try: number }
  | { kind: 'verdict'; at: string; task: string; try: number; verdict: 'ok' | 'problems' | 'none'; count?: number }
  | { kind: 'queue'; at: string; task: string; try: number; outcome: QueueOutcome; command?: string; commit?: string }

/** The longest reason kept on a 'refused' event. */
export const REASON_MAX = 120
/** The longest "what" (a path or a command's head) kept. */
export const WHAT_MAX = 60
/** The most files kept on a 'needs-files' event. */
export const FILES_MAX = 20

/** A name that looks like it holds a secret (PGPASSWORD, GITHUB_TOKEN, db_secret, API_KEY...), then "=" or ":". */
const SECRET_NAME = /\b([\w.-]*(?:pass|pwd|secret|token|key|auth|cred|session|cookie)[\w.-]*\s*[:=]\s*)\S+/gi

/** `s` made one line, secret-looking parts hidden (hideSecrets, plus any secret-named `NAME=value`), cut at `max` characters with "…". */
export function cleanBit(s: unknown, max: number): string {
  const one = hideSecrets(String(s ?? '').replace(/\s+/g, ' ').trim())
    .replace(SECRET_NAME, '$1[hidden]')
    // a password inside a URL (https://user:pass@host)
    .replace(/(:\/\/)[^\s/@]+@/g, '$1[hidden]@')
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one
}

/** A refusal's text cut to a short reason: its "Refused: " front off, its first sentence only, cleaned (cleanBit). */
export function shortReason(text: string): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/^Refused:\s*/i, '')
  const end = s.search(/[.!?](?:\s|$)/)
  return cleanBit(end >= 0 ? s.slice(0, end + 1) : s, REASON_MAX)
}

/**
 * The first `words` words of shell command `command`, cleaned and cut short: never the whole command. A setting in
 * front (`NAME=value`, also after `export` or `env`) keeps only its name, since its value may be a secret.
 */
export function commandHead(command: string, words = 2): string {
  const parts = String(command ?? '').trim().split(/\s+/).filter(Boolean)
  const head = parts.slice(0, words).map(w => w.replace(/^([A-Za-z_][\w]*)=.*$/, '$1=[hidden]'))
  return cleanBit(head.join(' '), WHAT_MAX)
}

/**
 * Only the program name of shell command `command`: its first word after any `NAME=value` settings in front (and an
 * `env` or `export` before them), never its arguments (no URLs, no flags, no values). Cleaned and cut short.
 */
export function programName(command: string): string {
  const parts = String(command ?? '').trim().split(/\s+/).filter(Boolean)
  let i = 0
  while (i < parts.length && (/^[A-Za-z_]\w*=/.test(parts[i]!) || ((parts[i] === 'env' || parts[i] === 'export') && /^[A-Za-z_]\w*=/.test(parts[i + 1] ?? '')))) i++
  const word = parts[i] ?? ''
  return /^[\w./+-]+$/.test(word) ? cleanBit(word, WHAT_MAX) : ''
}

/** A checker's problems report counted: its list items ("- ", "* ", "1. "), or 1 when it has none. */
export function problemCount(report: string): number {
  const n = String(report ?? '').split('\n').filter(l => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)).length
  return n || 1
}

/** Files asked for, each cleaned (cleanBit), at most FILES_MAX. */
export const cleanFiles = (files: readonly string[]): string[] => files.slice(0, FILES_MAX).map(f => cleanBit(f, WHAT_MAX * 2))
