// Typed pieces for the tests' fake files, commands and waits (T-360), so the fakes pass the strict type check
// the plugin's own code passes. They only fill in what the real answers carry; what a test checks stays its own.
import type { CommandRunInput, FsEntry, OpEventResult, ProcessRunResult } from 'claude-code'

/** One folder entry as `fs.list` answers it: a plain file (or the given kind), empty, not a link. */
export const entry = (name: string, kind: FsEntry['kind'] = 'file'): FsEntry => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })

/** A `process.run` answer: exit 0 with no output unless given, never cut short. */
export const ran = (r: { exitCode?: number; stdout?: string; stderr?: string } = {}): ProcessRunResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  ...r,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

/** An `fs.read` answer for a fake file's text: the text, or a failed read (as for a missing file) when there is none. */
export const readText = (text: string | null | undefined): OpEventResult<'fs.read'> | Promise<OpEventResult<'fs.read'>> =>
  typeof text === 'string' ? { value: text } : Promise.reject(new Error('no file'))

/** A slash command as the engine runs it when the owner types it at the terminal. */
export const slash = (command: string, args = ''): CommandRunInput => ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

// The test runner has setTimeout and console, but the plugin's types (no DOM, no Node) leave them out.
const host = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown; console: { log(...a: unknown[]): void } }

/** Waits `ms` of real time, for work the plugin does in the background (a few ms at a time). */
export const pause = (ms: number) => new Promise<void>(r => host.setTimeout(r, ms))

/** Prints to the test's output. */
export const print = (...a: unknown[]) => host.console.log(...a)

/** The lines a `parseSettingValue('test_commands', ...)` answer holds; throws (failing the test) on a refusal or any other shape. */
export function commandsOf(r: { ok: true; input: Record<string, unknown> } | { ok: false; message: string }): string[] {
  if (!r.ok) throw new Error(`refused: ${r.message}`)
  const c = r.input.test_commands
  if (!Array.isArray(c) || !c.every((x): x is string => typeof x === 'string')) throw new Error(`test_commands is not a list of lines: ${JSON.stringify(c)}`)
  return c
}
