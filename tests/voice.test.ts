import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost } from './fake-host'
import { S } from '../hooks/app/state'
import { type Players, playsFor, spokenProject, withProject, findPlayers, WIN_TEXT_VAR } from '../hooks/app/voice'

// A machine that has every speech command (macOS, Linux and Windows ones), found without running anything.
function machineFor(system: 'mac' | 'linux' | 'windows') {
  const programs: Record<string, string[]> = { mac: ['say', 'afplay'], linux: ['spd-say', 'espeak-ng', 'espeak'], windows: ['powershell'] }
  const uname: Record<string, string> = { mac: 'Darwin', linux: 'Linux', windows: '' }
  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
  const no = () => ({ exitCode: 1, stdout: '', stderr: '' })
  return fakeHost({
    run: async argv => {
      const [cmd, ...rest] = argv
      if (cmd === 'uname') return uname[system] ? ok(uname[system] + '\n') : no()
      if (cmd === 'cmd') return system === 'windows' ? ok('Microsoft Windows [Version 10]') : no()
      if (cmd === 'sh') return programs[system]!.includes(rest[3]!) ? ok() : no()
      if (cmd === 'where') return programs[system]!.includes(rest[0]!) ? ok() : no()
      if (cmd === 'test') return ok()
      return ok()
    },
  }).host
}

async function voiceOn(system: 'mac' | 'linux' | 'windows', root: string) {
  const $ = machineFor(system)
  S.players = findPlayers($) as Promise<Players>
  S.root = root
  return $
}

test('the spoken line starts with the project name, for done and for needs you', async () => {
  const $ = await voiceOn('mac', '/Users/me/repositories/symcc')
  expect(await playsFor($, 'voice', ['T-5'])).toEqual([{ argv: ['say', '-r', '200', 'symcc: T-5 done'] }])
  expect(await playsFor($, 'voice', ['?T-5'])).toEqual([{ argv: ['say', '-r', '200', 'symcc: T-5 needs you'] }])
  S.root = '/work/my-app'
  expect(await playsFor($, 'voice', ['T-3', '?T-5'])).toEqual([{ argv: ['say', '-r', '200', 'my app: T-3 done. T-5 needs you'] }])
  // the chime stays the same in every project
  const sound = await playsFor($, 'sound', ['T-3'])
  expect(sound.every(p => !p.argv.join(' ').includes('my app'))).toBe(true)
})

test('dashes, underscores and dots are said as spaces, and a long name is cut to its first words', () => {
  expect(spokenProject('/home/me/my_app-2')).toBe('my app 2')
  expect(spokenProject('/home/me/web.site__v2/')).toBe('web site v2')
  expect(spokenProject('C:\\code\\big-project')).toBe('big project')
  expect(spokenProject('/x/a-very-long_project.name-here')).toBe('a very long')
  expect(spokenProject('')).toBe('')
  expect(withProject('T-1 done', '')).toBe('T-1 done')
  expect(withProject('T-1 done', '/p/my_app-2')).toBe('my app 2: T-1 done')
})

test('a folder name with quotes or $ is passed as one argument on every system, never as shell code', async () => {
  const root = `/x/it's "$HOME" $(rm -rf ~)`
  const name = spokenProject(root)
  expect(name).toBe(`it's "$HOME" $(rm`)
  const mac = await voiceOn('mac', root)
  expect(await playsFor(mac, 'voice', ['T-1'])).toEqual([{ argv: ['say', '-r', '200', `${name}: T-1 done`] }])
  const linux = await voiceOn('linux', root)
  expect((await playsFor(linux, 'voice', ['T-1'])).map(p => p.argv)).toEqual([
    ['spd-say', '-w', `${name}: T-1 done`],
    ['espeak-ng', `${name}: T-1 done`],
    ['espeak', `${name}: T-1 done`],
  ])
  // Windows: the text is an environment value the fixed script reads, never part of the script
  const win = await voiceOn('windows', root)
  const [speak] = await playsFor(win, 'voice', ['T-1'])
  expect(speak!.env).toEqual({ [WIN_TEXT_VAR]: `${name}: T-1 done` })
  expect(speak!.argv.join(' ')).not.toContain('rm')
  expect(speak!.argv.join(' ')).not.toContain('HOME')
})
