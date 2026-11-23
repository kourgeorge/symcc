import { DAM_ENV, isDamValue } from '../core/dam'
import type { Host } from '../host'

/** T-922: whether this session runs under DAM (a Claude Code session run from a Slack thread): DAM sets DAM_ENV. */
export async function isDamSession(host: Pick<Host, 'env'>): Promise<boolean> {
  return isDamValue(await host.env(DAM_ENV).catch(() => undefined))
}
