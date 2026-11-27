// The webview's line to serve, through the extension: its messages in, and requests out that resolve with serve's
// reply. The browser preview (../preview/) puts a stand-in for acquireVsCodeApi on window before this file runs.
import type { FromWebview, ToWebview } from '../../protocol'

type Api = { postMessage: (m: FromWebview) => void }
declare global {
  interface Window {
    acquireVsCodeApi?: () => Api
  }
}

const api: Api = window.acquireVsCodeApi?.() ?? { postMessage: () => undefined }
let next = 1
const waiting = new Map<number, (r: { ok: boolean; text: string }) => void>()
const listeners = new Set<(m: ToWebview) => void>()

window.addEventListener('message', (e: MessageEvent<ToWebview>) => {
  const m = e.data
  if (m?.type === 'reply') {
    waiting.get(m.id)?.({ ok: m.ok, text: m.text })
    waiting.delete(m.id)
    return
  }
  // a serve that stopped or restarted answers nothing it was asked before
  if (m?.type === 'engine' && m.engine.state !== 'ready') {
    for (const w of waiting.values()) w({ ok: false, text: m.engine.state === 'starting' ? 'symcc restarted; try again.' : 'symcc stopped.' })
    waiting.clear()
  }
  for (const l of listeners) l(m)
})

export const onMessage = (l: (m: ToWebview) => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

type Ask = FromWebview extends infer M ? (M extends { id: number } ? Omit<M, 'id'> : never) : never

/** Sends `m`; resolves with the engine's answer, or rejects with its error. */
export function ask(m: Ask): Promise<string> {
  const id = next++
  return new Promise((resolve, reject) => {
    waiting.set(id, r => (r.ok ? resolve(r.text) : reject(new Error(r.text))))
    api.postMessage({ ...m, id } as FromWebview)
  })
}

export const tell = (m: Extract<FromWebview, { type: 'ready' | 'restart' | 'log' | 'session' | 'lead-set' | 'lead-stop' | 'agents-set' | 'open-file' | 'worktrees' | 'open-board' }>) => api.postMessage(m)

/** Which view this webview is: the board panel, or the sidebar in the activity bar (the extension's page says). */
export const surface: 'panel' | 'side' = document.body.dataset.surface === 'side' ? 'side' : 'panel'
