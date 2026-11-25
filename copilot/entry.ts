// symcc's GitHub Copilot CLI extension entry (T-960): what scripts/build-copilot.sh bundles into
// copilot/extensions/symcc/extension.mjs, the one JavaScript file Copilot CLI runs (a Copilot extension must be one
// .mjs file; it can't be TypeScript). It hands plain Node's parts (the Node host's files, commands, timers and
// processes) and the SDK to startCopilot (hooks/copilot/extension.ts), which joins the session and starts symcc.
// It lives here, not in hooks/copilot/, because it uses Node (tests/host-free.sh keeps Node out of hooks/copilot/).
// The two SDK imports stay outside the bundle: Copilot CLI gives every extension its own copy of the SDK at run time.
import { joinSession } from '@microsoft/copilot-sdk/extension'
import { CopilotClient, RuntimeConnection, approveAll } from '@microsoft/copilot-sdk'
import type { CpJoinSession, CpSdk } from '../hooks/copilot/sdk'
import { startCopilot } from '../hooks/copilot/extension'
import { nodeFs, runCommand, nodeClock, nodeProcesses } from '../hosts/node/host'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * symcc's own folder (roles/, kinds/, examples/, .claude-plugin/plugin.json): the repo root, three folders above the
 * built copilot/extensions/symcc/extension.mjs (one above this file when run unbundled).
 */
const HERE = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_ROOT = resolve(HERE, basename(dirname(HERE)) === 'extensions' ? '../../..' : '..')

// process.execPath is the copilot binary itself: the agents' own copilot processes are started from it (agents.ts)
const execPath = (process as typeof process & { execPath: string }).execPath

await startCopilot({
  joinSession: joinSession as CpJoinSession,
  // Copilot starts an extension in the session's folder
  dir: process.cwd(),
  system: { fs: nodeFs, run: runCommand, clock: nodeClock, env: async name => process.env[name], processes: nodeProcesses },
  pluginRoot: PLUGIN_ROOT,
  say: line => void process.stderr.write(`${line}\n`),
  debug: !!process.env.SYMCC_DEBUG,
  agentSdk: {
    sdk: { CopilotClient, RuntimeConnection, approveAll } as CpSdk,
    execPath,
    environment: () => process.env,
  },
})
