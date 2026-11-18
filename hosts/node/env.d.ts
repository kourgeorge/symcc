// The few Node/Bun APIs hosts/node/ uses, written by hand so the folder type-checks with no @types/node or bun-types
// installed (hosts/node/tsconfig.json, run by scripts/typecheck.sh). Only what is used here is declared: add a line
// when the host needs one more. Kept out of the main tsconfig.json, so hooks/ never sees Node's globals.

declare module 'node:fs/promises' {
  type Stats = { size: number; mtimeMs: number; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }
  type Dirent = { name: string }
  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  export function writeFile(path: string, text: string, encoding?: 'utf8'): Promise<void>
  export function mkdir(path: string, options: { recursive: true; mode?: number }): Promise<string | undefined>
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  export function lstat(path: string): Promise<Stats>
  export function stat(path: string): Promise<Stats>
  export function realpath(path: string): Promise<string>
  export function access(path: string): Promise<void>
  export function mkdtemp(prefix: string): Promise<string>
  export function rm(path: string, options: { recursive: true; force: true }): Promise<void>
  export function chmod(path: string, mode: number): Promise<void>
}

declare module 'node:child_process' {
  type Readable = { on(event: 'data', fn: (chunk: { toString(): string }) => void): void }
  type Writable = { end(text?: string): void }
  export type ChildProcess = {
    pid?: number
    stdout: Readable
    stderr: Readable
    stdin: Writable | null
    kill(signal?: string): boolean
    on(event: 'close', fn: (code: number | null, signal: string | null) => void): void
    on(event: 'error', fn: (err: Error) => void): void
  }
  export function spawn(cmd: string, args: readonly string[], options: { cwd?: string; env?: Record<string, string | undefined>; detached?: boolean; stdio?: readonly ('pipe' | 'ignore' | 'inherit')[] }): ChildProcess
  export function spawnSync(cmd: string, args: readonly string[], options: { cwd?: string; encoding: 'utf8' }): { status: number | null; stdout: string; stderr: string }
}

declare module 'bun:test' {
  export function test(name: string, fn: () => unknown | Promise<unknown>, timeoutMs?: number): void
  export function expect(value: unknown): {
    toBe(v: unknown): void
    toEqual(v: unknown): void
    toContain(v: unknown): void
    toMatch(v: RegExp | string): void
    toBeGreaterThan(v: number): void
    not: { toBe(v: unknown): void; toContain(v: unknown): void; toMatch(v: RegExp | string): void }
  }
}

type NodeTimer = { unref?: () => unknown }

declare var process: {
  argv: string[]
  env: Record<string, string | undefined>
  exitCode: number | undefined
  exit(code?: number): never
  kill(pid: number, signal?: string): boolean
  on(event: 'SIGINT' | 'SIGTERM', fn: () => void): void
  cwd(): string
  stdout: { write(text: string): boolean }
  stderr: { write(text: string): boolean }
}
declare var console: { log(...a: unknown[]): void; error(...a: unknown[]): void }
declare function setTimeout(fn: () => void, ms: number): NodeTimer
declare function clearTimeout(t: NodeTimer): void
declare function setInterval(fn: () => void, ms: number): NodeTimer
declare function clearInterval(t: NodeTimer): void
interface ImportMeta {
  url: string
}
