// Copilot's model list as the host's. Kept apart from ./copilot.ts, which needs Node, so the webview's browser
// preview (extension/preview/fake.ts) can use it.
import type { SdkModelInfo } from './sdk'

export type CopilotModel = {
  id: string
  name: string
  supportedReasoningEfforts?: string[]
  defaultReasoningEffort?: string
  policy?: { state: string }
  billing?: { multiplier?: number }
}

const EFFORT_WORDS: Record<string, string> = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }

/** Copilot's model list as the host's: the ones the account may use, each with its reasoning efforts (medium by default). */
export function copilotModels(list: readonly CopilotModel[]): SdkModelInfo[] {
  return list
    .filter(m => !m.policy || m.policy.state === 'enabled')
    .map(m => {
      const efforts = m.supportedReasoningEfforts ?? []
      const fallback = efforts.includes('medium') ? 'medium' : efforts[0]
      const def = m.defaultReasoningEffort && efforts.includes(m.defaultReasoningEffort) ? m.defaultReasoningEffort : fallback
      const cost = m.billing?.multiplier
      return {
        id: m.id,
        label: m.name || m.id,
        ...(cost !== undefined ? { description: cost === 0 ? 'included' : `${cost}× premium requests` } : {}),
        options: efforts.length ? [{ id: 'reasoning', label: 'Reasoning', values: efforts.map(v => ({ value: v, label: EFFORT_WORDS[v] ?? v })) }] : [],
        variants: efforts.length ? efforts.map(v => ({ params: { reasoning: v }, ...(v === def ? { isDefault: true } : {}) })) : [{ params: {}, isDefault: true }],
      }
    })
}
