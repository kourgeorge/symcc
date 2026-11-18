// symcc's tiny command line on the Node host (T-377), with no Claude Code: each run is one session.
//   bun hosts/node/main.ts [--root <project>] [--claude <bin>] [--model <model>] <command> ...
//     add "<title>" [details] [--files a,b/] [--why <why>]   add a task (the owner asked for it)
//     tick                                                   start what is ready, wait for its workers, tests and merges
//     board                                                  the text board
//     tool <name> ['<json input>']                           any of the lead's tools, e.g. tool settings '{"test_commands":["sh test.sh"]}'
//     cmd <name> [args]                                      a slash command, e.g. cmd symcc-mode review
// What symcc would tell the lead is printed after the answer, under "[lead]".
import { claudeRunner } from './runner'
import { openSession, leadTool, slashCommand, settle, closeSession, type NodeSession } from './session'

/**
 * The CLI's words: the options (--name value) apart from the rest. An option with no value after it (the last word,
 * or another option next) is refused, so e.g. a bare `--files` never becomes the task's details with no file limit.
 */
export function parseArgs(argv: readonly string[]): { opts: Record<string, string>; rest: string[] } {
  const opts: Record<string, string> = {}
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) {
      rest.push(a)
      continue
    }
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value after it`)
    opts[a.slice(2)] = v
    i++
  }
  return { opts, rest }
}

const USAGE = 'usage: main.ts [--root <project>] [--claude <bin>] [--model <model>] add "<title>" [details] [--files a,b/] [--why <why>] | tick | board | tool <name> [json] | cmd <name> [args]'

/** Runs one CLI command in session `s`; answers what to print. */
async function command(s: NodeSession, rest: string[], opts: Record<string, string>): Promise<string> {
  const [what, ...args] = rest
  switch (what) {
    case 'add': {
      const [title, details] = args
      if (!title) return USAGE
      const files = opts.files ? opts.files.split(',').map(f => f.trim()).filter(Boolean) : []
      const r = await leadTool(s, 'add', { title, details: details ?? title, files, why: opts.why ?? 'asked for from the command line', origin_by: 'owner', request: title })
      await settle(s, false)
      return r
    }
    case 'tick': {
      const minutes = Number(opts['wait-minutes'] ?? 60)
      const quiet = await settle(s, true, minutes * 60_000)
      const board = await leadTool(s, 'board', {})
      return quiet ? board : `${board}\n(still running after ${minutes} min; stopped waiting)`
    }
    case 'board':
      return leadTool(s, 'board', {})
    case 'tool': {
      const [name, json] = args
      if (!name) return USAGE
      const r = await leadTool(s, name, json ? (JSON.parse(json) as Record<string, unknown>) : {})
      await settle(s, false)
      return r
    }
    case 'cmd': {
      const [name, ...more] = args
      if (!name) return USAGE
      const r = await slashCommand(s, name, more.join(' '))
      await settle(s, false)
      return r
    }
    default:
      return USAGE
  }
}

async function main() {
  let args: ReturnType<typeof parseArgs>
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`error: ${(err as Error).message}\n${USAGE}`)
    return 2
  }
  const { opts, rest } = args
  if (!rest.length) {
    console.log(USAGE)
    return 2
  }
  const runner = claudeRunner({ ...(opts.claude ? { bin: opts.claude } : {}), ...(opts.model ? { model: opts.model } : {}) })
  const s = await openSession({ root: opts.root ?? process.cwd(), runner })
  // Ctrl-C or a kill: the agents are stopped and their tasks put back before the CLI ends (they run in their own groups)
  const quit = (sig: string) => () => void closeSession(s, `the command line got ${sig}`).finally(() => process.exit(130))
  process.on('SIGINT', quit('SIGINT'))
  process.on('SIGTERM', quit('SIGTERM'))
  let code = 0
  try {
    console.log(await command(s, rest, opts))
  } catch (err) {
    console.error(`error: ${(err as Error).message}`)
    code = 1
  } finally {
    const update = await closeSession(s).catch(() => undefined)
    if (update) console.log(`\n[lead] ${update}`)
  }
  return code
}

// Loose timers (scouts, the heartbeat) must not keep the process alive: it ends once its command is done.
main().then(
  code => process.exit(code),
  err => (console.error(err), process.exit(1)),
)
