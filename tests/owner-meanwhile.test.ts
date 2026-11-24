// T-970: which owner board actions leave the lead a Meanwhile line: an org-mem note the owner deletes does (the
// lead's own orgmem remove doesn't); a settings change only for settings that change the work (not notify,
// open_on_start, archive_days); a role or task type edit by slash command doesn't (the lead's instructions show the list).
import { expect } from 'claude-code/testing'
import { emptyBoard } from '../hooks/board'
import { S, leadQueue, meanwhile } from '../hooks/app/state'
import { saveBoard } from '../hooks/app/store'
import { runCommand } from '../hooks/app/symcc'
import { deleteOrgMem, orgMemTool } from '../hooks/app/org-mem'
import { ownerSettings } from '../hooks/app/tools'
import { test } from './reset'
import { fakeHost, memoryFs } from './fake-host'

const ROOT = '/repo'
const MAIN = 'e1'.repeat(20)
const ORG_MEM = `${ROOT}/.symcc/org-mem.md`
const NOTES = '- 2026-11-18: [tests] run one test file\n- 2026-11-19: [tests] the type check is separate\n- 2026-11-20: [site] build the site in /tmp\n'

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })

/** A fake Host on a project with git set up and an empty board; its files in `files` (mv and rm work on them). */
async function world(start: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(start))
  const runGit = (a: string[]): Res => {
    const s = a.join(' ')
    if (s === '--version') return ok('git version 2.50.0')
    if (s === 'rev-parse --is-inside-work-tree') return ok('true')
    if (s === 'rev-parse --verify -q HEAD' || s === 'rev-parse --verify -q refs/heads/main') return ok(MAIN)
    if (a[0] === 'worktree' && a[1] === 'list') return ok(`worktree ${ROOT}\nbranch refs/heads/main\n`)
    return ok()
  }
  const { host } = fakeHost({
    run: async argv => {
      const [cmd, ...rest] = argv
      if (cmd === 'git') return runGit(rest)
      const paths = rest.filter(x => !x.startsWith('-'))
      const [from = '', to = ''] = paths
      if (cmd === 'mv') return files.set(to, files.get(from) ?? ''), files.delete(from), ok()
      if (cmd === 'rm') return paths.forEach(p => files.delete(p)), ok()
      return ok()
    },
    fs: {
      ...memoryFs(files),
      exists: async p => files.has(p) || [...files.keys()].some(k => k.startsWith(`${p}/`)),
      list: async dir => [...files.keys()].filter(k => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/')).map(k => ({ name: k.slice(dir.length + 1), kind: 'file' as const, size: files.get(k)!.length, mtimeMs: 0, isLink: false })),
    },
    agents: { spawn: async () => Promise.reject(new Error('no agents in this world')) },
  })
  S.root = ROOT
  S.writing = Promise.resolve()
  S.driving = false
  S.enabledNow = true
  leadQueue.splice(0)
  meanwhile.splice(0)
  await saveBoard(host, emptyBoard())
  return { host, files }
}

test("T-970: the owner's org-mem delete leaves the lead one Meanwhile line with the note's number and text", async () => {
  const w = await world({ [ORG_MEM]: NOTES })
  const r = await deleteOrgMem(w.host, 2, '[tests] the type check is separate')
  expect(r.ok).toBe(true)
  expect(w.files.get(ORG_MEM)).not.toContain('the type check is separate')
  expect(meanwhile).toEqual(['The owner deleted org-mem note 2: "[tests] the type check is separate"; numbers after it moved up.'])
  expect(leadQueue).toEqual([])
})

test('T-970: a delete that finds no note leaves no line; the lead\'s own orgmem remove leaves none either', async () => {
  const w = await world({ [ORG_MEM]: NOTES })
  expect((await deleteOrgMem(w.host, 9)).ok).toBe(false)
  expect(meanwhile).toEqual([])
  const said = await orgMemTool(w.host, { action: 'remove', which: 1 })
  expect(said).toContain('Removed note 1')
  expect(meanwhile).toEqual([])
})

test('T-970: a notify, open_on_start or archive_days change leaves no line; mode and max_parallel do', async () => {
  const w = await world()
  expect(await ownerSettings(w.host, { notify: 'off' }, 'from the board')).toContain('notify')
  expect(await ownerSettings(w.host, { open_on_start: false }, 'from the board')).toContain('open_on_start')
  expect(await ownerSettings(w.host, { archive_days: 9 }, 'from the board')).toContain('archive_days')
  expect(meanwhile).toEqual([])
  await ownerSettings(w.host, { max_parallel: 5 }, 'from the board')
  expect(meanwhile.length).toBe(1)
  expect(meanwhile[0]).toContain('The owner changed the settings: ')
  expect(meanwhile[0]).toContain('max_parallel')
  await ownerSettings(w.host, { mode: 'paused' }, 'from the board')
  expect(meanwhile.length).toBe(2)
  expect(meanwhile[1]).toContain('mode set to')
  // a mixed change tells only the setting that changes the work
  meanwhile.splice(0)
  await ownerSettings(w.host, { archive_days: 4, auto_retries: 2 }, 'from the board')
  expect(meanwhile.length).toBe(1)
  expect(meanwhile[0]).toContain('auto_retries')
  expect(meanwhile[0]).not.toContain('archive_days')
})

test('T-970: a role edit by slash command leaves no Meanwhile line', async () => {
  const w = await world()
  const said = (await runCommand(w.host, 'symcc-settings', 'role docs add'))!.text
  expect(said).toContain('docs')
  const edited = (await runCommand(w.host, 'symcc-settings', 'role docs edit description Writes the docs'))!.text
  expect(edited).not.toContain('Unknown')
  expect(meanwhile).toEqual([])
  expect(leadQueue).toEqual([])
})
