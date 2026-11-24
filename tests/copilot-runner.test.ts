// T-961: the `copilot -p` fallback runner (hooks/process/copilot-runner.ts): the command line it builds for a worker
// (its folder, model, tool limits, deny rules that win over every allow, --allow-all-tools only with symcc's guard),
// and how it turns a JSONL event stream (as Copilot CLI 1.0.114 writes it) into finished or failed, with the last
// message and the tokens from the --usage-output-file.
import { expect, test } from 'claude-code/testing'
import { copilotRunner, copilotResult, copilotSession, copilotUsageTokens, copilotWriteRule, copilotAllowRules, COPILOT_FOLLOW_UP_TOOLS } from '../hooks/process/copilot-runner'
import type { ProcessOutput } from '../hooks/process/agents'
import type { HostAgentStart } from '../hooks/host'

const WT = '/repo/.symcc/worktrees/T-7'
const SID = '4120d006-a877-47d9-bfc6-6aa98ac1610b'

/** A fake system: `git ls-files -- .scratch` prints nothing (the folder uses .scratch/), `cat` reads `files`, `rm` removes. */
function fakeSys(files = new Map<string, string>(), env: Record<string, string> = {}) {
  const ran: string[][] = []
  return {
    ran,
    files,
    run(argv: readonly string[]) {
      ran.push([...argv])
      if (argv[0] === 'git') return { status: 0, stdout: '' }
      if (argv[0] === 'cat') {
        const t = files.get(argv[1] ?? '')
        return t === undefined ? { status: 1, stdout: '' } : { status: 0, stdout: t }
      }
      if (argv[0] === 'rm') files.delete(argv[2] ?? '')
      return { status: 0, stdout: '' }
    },
    env: (n: string) => env[n],
  }
}

const worker: HostAgentStart = { kind: 'worker', prompt: 'do T-7', name: 'symcc-T-7', description: 'T-7', files: ['src/a.ts', 'tests/'], cwd: WT, model: 'sonnet' }

/** The values after flag `f` in `argv` (up to the next flag). */
function after(argv: string[], f: string): string[] {
  const i = argv.indexOf(f)
  if (i < 0) return []
  const out: string[] = []
  for (const x of argv.slice(i + 1)) {
    if (x.startsWith('-')) break
    out.push(x)
  }
  return out
}

/** Every value given with a repeated flag `f`. */
const each = (argv: string[], f: string) => argv.flatMap((x, i) => (x === f ? [argv[i + 1] ?? ''] : []))

test('a worker runs as copilot -p in its folder, with its model, tool limits and write rules for its files only', () => {
  const sys = fakeSys(new Map(), { SYMCC_COPILOT_MODELS: 'sonnet=claude-sonnet-5.5' })
  const { argv, stdin } = copilotRunner(sys, { usageDir: '/tmp/u', random: () => 0.5 }).command(worker)
  expect(stdin).toBe(undefined)
  expect(argv.slice(0, 3)).toEqual(['copilot', '-p', 'do T-7'])
  expect(after(argv, '--output-format')).toEqual(['json'])
  expect(argv).toContain('--no-ask-user')
  expect(after(argv, '-C')).toEqual([WT])
  expect(after(argv, '--model')).toEqual(['claude-sonnet-5.5'])
  const sid = after(argv, '--session-id')[0] ?? ''
  expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sid)).toBe(true)
  expect(after(argv, '--usage-output-file')).toEqual([`/tmp/u/symcc-copilot-usage-${sid}.json`])
  const avail = after(argv, '--available-tools')
  for (const t of ['view', 'bash', 'apply_patch', 'edit']) expect(avail).toContain(t)
  for (const t of ['task', 'ask_user', 'web_fetch']) expect(avail).not.toContain(t)
  const excl = after(argv, '--excluded-tools')
  for (const t of ['task', 'ask_user', 'write_bash', 'web_fetch', 'web_search']) expect(excl).toContain(t)
  // without symcc's guard: no blanket allow, only shell and writes to its files (and .scratch/); extensions off
  expect(argv).not.toContain('--allow-all-tools')
  expect(argv).toContain('--no-experimental')
  expect(each(argv, '--allow-tool')).toEqual(['shell', `write(${WT}/src/a.ts)`, `write(${WT}/src/a.ts/**)`, `write(${WT}/tests/**)`, `write(${WT}/.scratch/**)`])
  const deny = each(argv, '--deny-tool')
  for (const r of ['shell(git commit)', 'shell(git push)', 'shell(git reset)', 'shell(git checkout)']) expect(deny).toContain(r)
})

test('--allow-all-tools comes only together with symcc guard, and the deny rules still come with it', () => {
  const sys = fakeSys()
  const { argv } = copilotRunner(sys, { guarded: true }).command(worker)
  expect(argv).toContain('--allow-all-tools')
  expect(argv).toContain('--experimental')
  expect(argv).not.toContain('--allow-tool')
  expect(each(argv, '--deny-tool')).toContain('shell(git commit)')
  // the binary from SYMCC_COPILOT, no model when the agent names none
  const plain = copilotRunner(fakeSys(new Map(), { SYMCC_COPILOT: '/opt/copilot' })).command({ ...worker, model: undefined }).argv
  expect(plain[0]).toBe('/opt/copilot')
  expect(plain).not.toContain('--model')
})

test('a scout gets no edit tools and no write rule; a checker writes only in .scratch/', () => {
  const scout = copilotRunner(fakeSys()).command({ kind: 'scout', prompt: 'look', name: 'symcc scout bugs', description: 'bugs' }).argv
  expect(after(scout, '--available-tools')).not.toContain('apply_patch')
  expect(after(scout, '--available-tools')).toContain('web_fetch')
  expect(scout).not.toContain('-C')
  expect(each(scout, '--allow-tool')).toEqual(['shell'])
  expect(copilotAllowRules({ kind: 'checker', cwd: WT }, true)).toEqual(['shell', `write(${WT}/.scratch/**)`])
  expect(copilotAllowRules({ kind: 'worker', cwd: WT })).toEqual(['shell', `write(${WT}/**)`])
  expect(copilotWriteRule(`${WT}/`, './docs')).toEqual([`write(${WT}/docs)`, `write(${WT}/docs/**)`])
})

// A JSONL stream as `copilot -p --output-format json` writes it (shortened from a real 1.0.114 run)
const ev = (type: string, data: Record<string, unknown> = {}) => JSON.stringify({ type, data, id: 'x', timestamp: '2026-11-24T13:03:37.700Z' })
const resultLine = (exitCode: number) => JSON.stringify({ type: 'result', timestamp: '2026-11-24T13:03:37.710Z', sessionId: SID, exitCode, usage: { premiumRequests: 1, totalApiDurationMs: 5262, sessionDurationMs: 9347, codeChanges: { linesAdded: 0, linesRemoved: 0, filesModified: [] } } })
const stream = (...lines: string[]) => `${lines.join('\n')}\n`
const USAGE = JSON.stringify({
  totalPremiumRequestCost: 1,
  tokenDetails: { input: { tokenCount: 4000 }, output: { tokenCount: 9 }, cache_read: { tokenCount: 0 }, cache_write: { tokenCount: 0 } },
  modelMetrics: {
    'mai-code-2-flash': { usage: { inputTokens: 3673, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0, reasoningTokens: 0 } },
    'claude-haiku-5.5': { usage: { inputTokens: 327, outputTokens: 4 } },
  },
}, null, 2)
const out = (stdout: string, exitCode = 0, stderr = '', killed = false): ProcessOutput => ({ stdout, stderr, exitCode, killed })

test('a finished run: the last assistant message is the answer, the tokens come from the usage file', () => {
  const s = stream(
    ev('session.start', { sessionId: SID, copilotVersion: '1.0.114' }),
    ev('user.message', { content: 'do T-7' }),
    ev('assistant.message', { content: 'Looking at the files.', toolRequests: [{ name: 'view' }] }),
    ev('tool.execution_complete', { success: true }),
    ev('assistant.message', { content: '', toolRequests: [{ name: 'apply_patch' }] }),
    ev('assistant.message', { content: 'I changed src/a.ts.', phase: 'final_answer' }),
    ev('assistant.turn_end', { turnId: '0' }),
    'not json',
    resultLine(0),
  )
  expect(copilotSession(out(s))).toBe(SID)
  expect(copilotResult(out(s), USAGE)).toEqual({ answer: 'I changed src/a.ts.', end: { reason: 'answer' }, isAborted: false, tokens: { input: 4000, output: 9, cache_read: 100 } })
  expect(copilotUsageTokens(JSON.stringify({ tokenDetails: { input: { tokenCount: 3 }, output: { tokenCount: 2 } } }))).toEqual({ input: 3, output: 2 })
  expect(copilotUsageTokens('broken')).toBe(undefined)
})

test('a failed run: a session error, a non-zero exit code, no result line, or a stop', () => {
  const err = stream(ev('session.start', { sessionId: SID }), ev('assistant.message', { content: 'Starting.' }), ev('session.error', { errorType: 'quota', message: 'You have no premium requests left' }), resultLine(1))
  expect(copilotResult(out(err, 1))).toEqual({ answer: 'You have no premium requests left', end: { reason: 'error' }, isAborted: false, tokens: undefined })
  expect(copilotResult(out(stream(resultLine(1)), 1, 'boom'))).toEqual({ answer: 'boom', end: { reason: 'error' }, isAborted: false, tokens: undefined })
  expect(copilotResult(out('', 1, 'No authentication information found'))).toEqual({ answer: 'No authentication information found', end: { reason: 'error' }, isAborted: false, tokens: undefined })
  expect(copilotResult(out(stream(ev('session.error', { message: 'model gone' })), 1)).answer).toBe('model gone')
  expect(copilotResult(out(stream(ev('assistant.message', { content: 'half' })), 143, '', true))).toEqual({ answer: 'half', end: { reason: 'aborted' }, isAborted: true, tokens: undefined })
})

test('the runner reads the run usage file named by its session and removes it; a follow-up resumes that session read-only', () => {
  const file = `/tmp/u/symcc-copilot-usage-${SID}.json`
  const sys = fakeSys(new Map([[file, USAGE]]))
  const r = copilotRunner(sys, { usageDir: '/tmp/u/' })
  const s = stream(ev('session.start', { sessionId: SID }), ev('assistant.message', { content: 'done' }), resultLine(0))
  expect(r.result(out(s)).tokens).toEqual({ input: 4000, output: 9, cache_read: 100 })
  expect(sys.files.has(file)).toBe(false)
  expect(r.session?.(out(s))).toBe(SID)
  const f = r.followUp!(SID, 'any notes?', worker).argv
  expect(f.slice(0, 5)).toEqual(['copilot', '-p', 'any notes?', '--resume', SID])
  expect(after(f, '--available-tools')).toEqual(COPILOT_FOLLOW_UP_TOOLS)
  expect(after(f, '-C')).toEqual([WT])
  expect(f).not.toContain('--allow-all-tools')
  expect(f).not.toContain('--allow-tool')
})
