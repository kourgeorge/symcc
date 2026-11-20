// T-586: OpenCode's background service keeps the stderr of the command that started it (`opencode plugin list`),
// which has exited by the time symcc's first notice ("added 8 example scouts") comes. A stream write there failed
// with EPIPE, which OpenCode logged as `unhandled rejection cause="Error: EPIPE: broken pipe, write"`. Here a child bun
// process gets a stderr pipe whose reader has already exited, waits, and then says a notice: symcc's writer
// (stderrSay, host.ts) must leave no uncaught error or unhandled rejection. The old stream write is run the same way
// first, to show the setup does make the error. Run with bun test (scripts/test-opencode-host.sh), as it needs processes.
import { test, expect } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile, realpath } from 'node:fs/promises'
import { runCommand } from '../../../hosts/node/host'
import { PLUGIN_ROOT } from '../host'

const CHILD = (how: 'symcc' | 'stream') => `import { appendFileSync } from 'node:fs'
import { stderrSay } from ${JSON.stringify(`${PLUGIN_ROOT}/hooks/opencode/host.ts`)}
const out = process.argv[2]
process.on('unhandledRejection', e => appendFileSync(out, 'unhandled rejection ' + e + '\\n'))
process.on('uncaughtException', e => appendFileSync(out, 'uncaught ' + e + '\\n'))
const say = ${how === 'symcc' ? 'stderrSay()' : "(line: string) => void process.stderr.write('[symcc] ' + line + '\\\\n')"}
// the reader of stderr (\`true\`) has exited by now
setTimeout(() => { say('added 8 example scouts'); say('a second notice') }, 400)
setTimeout(() => appendFileSync(out, 'done\\n'), 900)
`

/** Runs the child with a stderr pipe nobody reads any more; what it noted about errors. */
async function run(how: 'symcc' | 'stream'): Promise<string> {
  const base = await realpath(await mkdtemp('/tmp/symcc-stderr-say-'))
  try {
    await writeFile(`${base}/child.ts`, CHILD(how))
    await writeFile(`${base}/out.txt`, '')
    await runCommand(['sh', '-c', 'bun child.ts out.txt 2>&1 >/dev/null | true'], { cwd: base, timeoutMs: 30_000 })
    return await readFile(`${base}/out.txt`, 'utf8')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

test('a plain stream write to a closed stderr pipe fails later with EPIPE (the setup shows the error)', async () => {
  expect(await run('stream')).toMatch(/EPIPE/)
}, 30_000)

test("symcc's notice to a closed stderr pipe leaves no uncaught error or unhandled rejection", async () => {
  expect(await run('symcc')).toBe('done\n')
}, 30_000)
