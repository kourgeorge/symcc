// T-1204: at start, the driving session looks (once) whether GitHub has a newer symcc minor or major release and tells
// the lead, who asks the owner. Every failure (offline, slow, bad answer) is silent.
import type { Host } from '../host'
import { S } from './state'
import { tellLead } from './tell'

const PLUGIN_URL = 'https://raw.githubusercontent.com/kourgeorge/symcc/main/.claude-plugin/plugin.json'
const TIMEOUT_MS = 5000

/** "0.5.40" -> [0, 5]; null when the text is not a version. */
const minorOf = (v: unknown): [number, number] | null => {
  const m = /^\s*v?(\d+)\.(\d+)(?:\.\d+)?/.exec(typeof v === 'string' ? v : '')
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** True when `published` has a higher major or minor part than `own` (0.5.40 vs 0.5.51: no; 0.5.40 vs 0.6.3: yes). */
export function newerMinor(own: string, published: string): boolean {
  const a = minorOf(own)
  const b = minorOf(published)
  if (!a || !b) return false
  return b[0] > a[0] || (b[0] === a[0] && b[1] > a[1])
}

/** The one line for the lead; `steps` are the host's own update steps (HostWords.updateSteps), '' for none. */
export function updateLine(own: string, published: string, steps: string): string {
  const head = `symcc ${published} is out (you have ${own})`
  return steps ? `${head}. To update: ${steps}.` : `${head}; update it.`
}

let checked = false

/** Forgets that this session checked (tests start each world clean). */
export function forgetUpdateCheck(): void {
  checked = false
}

type Fetch = (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>

/** Looks once per session; never throws, never waits longer than about 5 s. Call it without awaiting. */
export async function checkForUpdate(host: Host): Promise<void> {
  let timer: { cancel: () => void } | undefined
  try {
    if (checked || !S.version || S.guardOnly || S.fresh || !S.driving) return
    checked = true
    const g = (globalThis as { fetch?: Fetch }).fetch
    const f: ((url: string) => Promise<string>) | undefined = host.httpFetch
      ? async url => {
          const r = await host.httpFetch!(url)
          return r.ok ? r.text : ''
        }
      : typeof g === 'function'
        ? url => g(url).then(r => (r.ok ? r.text() : ''))
        : undefined
    if (!f) return
    const timeout = new Promise<never>((_, no) => {
      timer = host.clock.after(TIMEOUT_MS, () => no(new Error('slow')))
    })
    const answer = await Promise.race([f(PLUGIN_URL), timeout])
    const published = (JSON.parse(answer) as { version?: unknown }).version
    if (typeof published !== 'string' || !newerMinor(S.version, published)) return
    tellLead(host, updateLine(S.version, published, S.W.updateSteps))
  } catch {
    // silent
  } finally {
    timer?.cancel()
  }
}
