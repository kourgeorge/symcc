// The webview's line to the extension: its messages in, and requests out that resolve with the engine's reply. The
// browser preview (../preview/) puts a stand-in for acquireVsCodeApi on window before this file runs.
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

export const tell = (m: Extract<FromWebview, { type: 'ready' | 'restart' | 'log' }>) => api.postMessage(m)
