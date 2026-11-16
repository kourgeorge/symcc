import { expect, test } from 'claude-code/testing'
import { changeScoutMemory, recordScoutRun } from '../hooks/plugin/scouts'
import { tmpFor } from '../hooks/plugin/store'
import { parseScoutMemory, parseScoutUsage } from '../hooks/board'
import { setRoot } from './project'

// these call the plugin's code directly, so the project folder is set here (path() refuses an empty one)
setRoot()

const tick = () => new Promise(r => setTimeout(r, 5))

/** A fake $ over an in-memory folder: reads, writes and `mv`s are slow (a few ms each), so two saves overlap. Keeps every temp name written. */
function fakeFiles(files: Map<string, string>) {
  const temps: string[] = []
  const $ = {
    fs: {
      read: async (p: string) => {
        await tick()
        if (!files.has(p)) throw new Error('no file')
        return files.get(p)!
      },
      write: async (p: string, text: string) => {
        if (p.endsWith('.tmp')) temps.push(p)
        await tick()
        files.set(p, String(text))
      },
    },
    process: {
      run: async (argv: string[]) => {
        await tick()
        if (argv[0] === 'mv') {
          const [from, to] = argv.slice(-2) as [string, string]
          if (!files.has(from)) return { exitCode: 1, stdout: '', stderr: `mv: rename ${from} to ${to}: No such file or directory` }
          files.set(to, files.get(from)!)
          files.delete(from)
        }
        if (argv[0] === 'rm') files.delete(argv[argv.length - 1]!)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
  } as unknown as Parameters<typeof changeScoutMemory>[0]
  return { $, temps }
}

test('two overlapping saves of scouts.json both succeed and both changes are kept', async () => {
  const files = new Map<string, string>()
  const { $, temps } = fakeFiles(files)
  const T = new Date(Date.now() - 60_000).toISOString()
  // a run's totals and a last_run change, started together
  const run = recordScoutRun($, 'docs-check', { endMs: Date.now(), ms: 5_000 })
  const timer = changeScoutMemory($, old => {
    const m = parseScoutMemory(old)
    const raw = old ? JSON.parse(old) : {}
    return JSON.stringify({ ...raw, scouts: { ...m, 'docs-check': { last_run: T } } }, null, 2) + '\n'
  })
  await Promise.all([run, timer])
  const file = [...files.keys()].find(f => f.endsWith('scouts.json'))!
  expect(file).toBeTruthy()
  const text = files.get(file)!
  expect(parseScoutMemory(text)['docs-check']?.last_run).toBe(T)
  expect(JSON.stringify(parseScoutUsage(text))).toContain('docs-check')
  // every save used its own temp file, and none is left behind
  expect(new Set(temps).size).toBe(temps.length)
  expect(temps.length).toBe(2)
  expect([...files.keys()].filter(f => f.endsWith('.tmp'))).toEqual([])
})

test('a save that fails does not stop the next one in the queue', async () => {
  const files = new Map<string, string>()
  const { $ } = fakeFiles(files)
  const bad = changeScoutMemory($, () => {
    throw new Error('boom')
  })
  const good = changeScoutMemory($, () => JSON.stringify({ scouts: { a: { last_run: null, paused: true } } }) + '\n')
  await expect(bad).rejects.toThrow('boom')
  await good
  const file = [...files.keys()].find(f => f.endsWith('scouts.json'))!
  expect(parseScoutMemory(files.get(file)!).a?.paused).toBe(true)
})

test('temp file names are new for every save', () => {
  const names = Array.from({ length: 50 }, () => tmpFor('/p/.symcc/scouts.json'))
  expect(new Set(names).size).toBe(50)
  for (const n of names) expect(n).toMatch(/^\/p\/\.symcc\/scouts\.json\.[\w-]+\.[\w-]+\.tmp$/)
})
