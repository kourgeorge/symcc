import { DAM_ENV, DAM_EXE_ENV, isDamChatExe, isDamValue } from '../core/dam'
import type { Host } from '../host'
import { S } from './state'

/** T-929: this session runs in a DAM image (DAM_ENV is set), so an sdk-origin owner prompt marks it a DAM Slack session. */
let harness = false

/**
 * T-922, T-929: whether this session is a DAM Slack (chat) session. DAM sets DAM_ENV for its whole image, terminal
 * windows too; only its chat path runs Claude Code through harness-claude (DAM_EXE_ENV). Also records whether DAM_ENV
 * is set, for damOwnerPrompt.
 */
export async function isDamSession(host: Pick<Host, 'env'>): Promise<boolean> {
  harness = isDamValue(await host.env(DAM_ENV).catch(() => undefined))
  return harness && isDamChatExe(await host.env(DAM_EXE_ENV).catch(() => undefined))
}

/** T-929: an owner prompt with origin "sdk" arrived (a Slack message through DAM): in a DAM image this is a Slack session from now on. */
export function damOwnerPrompt() {
  if (harness) S.dam = true
}
