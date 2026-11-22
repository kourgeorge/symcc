// T-870: a slow or failed `git --version` (a busy machine) is not "git is not installed". Only a command that
// really is not found (a rejection saying ENOENT, or exit code 127) gives the no-git state.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { gitReady, probeGit } from '../hooks/app/git'
import { S, leadQueue, meanwhile } from '../hooks/app/state'
import { fakeHost, memoryFs } from './fake-host'

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })

/** `answers`: what each git command does now ('timeout' rejects, 'slow' exits 124, 'enoent' rejects with ENOENT, a Res answers). */
function world(answers: Record<string, Res | 'timeout' | 'slow' | 'enoent'>) {
  const files = new Map<string, string>()
  const { host: $ } = fakeHost({
    run: async (argv: readonly string[]): Promise<Res> => {
      if (argv[0] !== 'git') return { exitCode: 127, stdout: '', stderr: 'not found' }
      const a = answers[argv.slice(1).join(' ')] ?? ok()
      if (a === 'timeout') throw new Error('command timed out after 15000 ms')
      if (a === 'enoent') throw new Error('spawn git ENOENT')
      if (a === 'slow') return { exitCode: 124, stdout: '', stderr: 'timed out' }
      return a
    },
    fs: memoryFs(files),
    ui: { toast: () => undefined, status: () => undefined },
    clock: { after: () => ({ cancel() {} }), sleep: async () => undefined },
  })
  S.root = '/repo'
  S.driving = true
  S.gitState = 'ok'
  S.toldGit = 'ok'
  leadQueue.splice(0)
  meanwhile.splice(0)
  return { $, files }
}

const good: Record<string, Res> = {
  '--version': ok('git version 2.55.0'),
  'rev-parse --is-inside-work-tree': ok('true\n'),
  'rev-parse --show-cdup': ok(''),
  'rev-parse --verify -q HEAD': ok('a'.repeat(40)),
}

test('a git --version that times out keeps the state ok and tells nobody', async () => {
  for (const slow of ['timeout', 'slow'] as const) {
    const w = world({ ...good, '--version': slow })
    expect(await gitReady(w.$)).toBe(true)
    expect(S.gitState).toBe('ok')
    expect(leadQueue.length + meanwhile.length).toBe(0)
  }
})

test('after a timeout a good check keeps everything running', async () => {
  const w = world({ ...good, '--version': 'timeout' })
  expect(await gitReady(w.$)).toBe(true)
  const w2 = world(good)
  expect(await gitReady(w2.$)).toBe(true)
  expect(S.gitState).toBe('ok')
})

test('git not found (exit 127 or ENOENT) is still the no-git state', async () => {
  expect(await probeGit(world({ ...good, '--version': { exitCode: 127, stdout: '', stderr: 'command not found' } }).$)).toBe('no-git')
  expect(await probeGit(world({ ...good, '--version': 'enoent' }).$)).toBe('no-git')
})

test('a rev-parse timeout keeps an ok repo ok', async () => {
  for (const key of ['rev-parse --is-inside-work-tree', 'rev-parse --show-cdup', 'rev-parse --verify -q HEAD']) {
    for (const slow of ['timeout', 'slow'] as const) {
      expect(await probeGit(world({ ...good, [key]: slow }).$)).toBe('ok')
    }
  }
})
