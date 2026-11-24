// The command GitHub Copilot CLI runs for its status line (T-961): prints symcc's band line (statusline.ts) for the
// project it runs in. Point Copilot at it in ~/.copilot/settings.json:
//   "statusLine": { "type": "command", "command": "bun <plugin folder>/hooks/copilot/band.ts" }
// SYMCC_ROOT names the project when Copilot runs it from elsewhere; SYMCC_SESSION, when set, is this window's session
// id (a window that doesn't drive then shows who does). hooks/copilot/ imports no Node module, so the file reading
// comes from the program's own process.getBuiltinModule (Bun and Node 22+ have it).
import { bandOutput } from './statusline'

type Proc = {
  cwd(): string
  env: Record<string, string | undefined>
  stdout: { write(s: string): unknown }
  getBuiltinModule?: (id: string) => unknown
}
type Fs = { readFileSync(path: string, enc: 'utf8'): string }

const proc = (globalThis as unknown as { process?: Proc }).process
const fs = proc?.getBuiltinModule?.('node:fs') as Fs | undefined
if (proc && fs) {
  const readText = (p: string): string | null => {
    try {
      return fs.readFileSync(p, 'utf8')
    } catch {
      return null
    }
  }
  const session = proc.env.SYMCC_SESSION
  const line = bandOutput({ cwd: proc.env.SYMCC_ROOT || proc.cwd(), readText, nowMs: Date.now(), ...(session ? { session } : {}) })
  proc.stdout.write(line ? `${line}\n` : '')
}
