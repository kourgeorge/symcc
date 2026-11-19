// T-515: scripts/test-opencode-host.sh and scripts/test-node-host.sh end a failing run with a short summary (each
// failing test's name and the first lines of its error), so a board that keeps only the tail of the output still shows
// which test failed and why. Each script runs here on a scratch folder holding a small spec of its own: one test that
// passes, one that fails with a known assertion, and one after it that prints many lines (as a later test's output
// would push the failure out of the tail). Run with bun test (scripts/test-opencode-host.sh), as it needs processes.
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises'
import { runCommand } from '../../../hosts/node/host'
import { PLUGIN_ROOT } from '../host'

/** the most one script run may take (it starts a bun test of its own; a busy machine can take long) */
const RUN_MS = 120_000

const FAILING = 'a failing check whose name the summary must show'
const PASSING = 'a passing check'
const SPEC = (fail: boolean) => `import { test, expect } from 'bun:test'
test(${JSON.stringify(PASSING)}, () => { expect(1 + 1).toBe(2) })
${fail ? `test(${JSON.stringify(FAILING)}, () => { expect({ messages: 2 }).toEqual({ messages: 1 }) })` : ''}
test('a later test that prints a lot', () => { for (let i = 0; i < 200; i++) console.log('noise line ' + i) })
`

/** Runs `script` on a scratch folder whose `dir` holds the spec (failing or not); its exit code and output lines. */
async function runScript(script: string, dir: string, fail: boolean) {
  const base = await realpath(await mkdtemp('/tmp/symcc-script-spec-'))
  try {
    await mkdir(`${base}/${dir}`, { recursive: true })
    await writeFile(`${base}/${dir}/x.spec.ts`, SPEC(fail))
    const r = await runCommand(['sh', `${PLUGIN_ROOT}/scripts/${script}`, base], { cwd: base, timeoutMs: RUN_MS })
    return { exitCode: r.exitCode, lines: (r.stdout + r.stderr).trimEnd().split('\n') }
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

for (const [script, dir] of [['test-opencode-host.sh', 'hooks/opencode'], ['test-node-host.sh', 'hosts/node']] as const) {
  test(`${script}: a failing run ends with the failing test's name and its assertion, after any later output`, async () => {
    const r = await runScript(script, dir, true)
    // bun's own exit code comes through, and the summary names it
    expect(r.exitCode).toBe(1)
    const tail = r.lines.slice(-12).join('\n')
    expect(tail).toContain(`${script.replace(/\.sh$/, '')}: failed tests (bun exit 1):`)
    expect(tail).toContain(`FAILED: ${FAILING}`)
    expect(tail).toContain('error: expect(received).toEqual(expected)')
    expect(tail).toContain('"messages": 1')
    expect(tail).toContain('x.spec.ts:')
    // the passing test and the later noise are not in the summary
    expect(tail).not.toContain(PASSING)
    expect(tail).not.toContain('noise line')
  }, RUN_MS + 10_000)

  test(`${script}: a passing run exits 0 with no failure summary`, async () => {
    const r = await runScript(script, dir, false)
    expect(r.exitCode).toBe(0)
    expect(r.lines.join('\n')).not.toContain('failed tests')
  }, RUN_MS + 10_000)
}
