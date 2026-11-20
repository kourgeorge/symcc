// T-650: notify "sound" has 3 sound sets, so the owner can tell which project chimed.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost } from './fake-host'
import { S, type PaneView } from '../hooks/app/state'
import { publish } from '../hooks/app/lead'
import { type Players, findPlayers, playsFor, playSample, sayDone, sayNext, MAC_SETS, FD_SETS } from '../hooks/app/voice'
import { type SoundSet, SOUND_SETS, SETTING_GROUPS, applySettings, emptyBoard, groupSummary, leadSettingsText, parseBoard, parseSettingValue, settingChoices, settingValue, settingsText, soundSetFor, soundSetOf } from '../hooks/board'

const MAC = '/System/Library/Sounds'
const FD = '/usr/share/sounds/freedesktop/stereo'
const ALL_MAC = Object.values(MAC_SETS).flat().map(n => `${MAC}/${n}.aiff`)
const ALL_FD = Object.values(FD_SETS).flat().map(n => `${FD}/${n}.oga`)

/** A machine with `programs` and only the sound files in `files`; `ran` keeps every command run. */
function machine(os: 'Darwin' | 'Linux' | '', programs: string[], files: string[]) {
  const ran: string[][] = []
  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
  const no = () => ({ exitCode: 1, stdout: '', stderr: '' })
  const $ = fakeHost({
    run: async argv => {
      ran.push([...argv])
      const [cmd, ...rest] = argv
      if (cmd === 'uname') return os ? ok(os + '\n') : no()
      if (cmd === 'cmd') return os ? no() : ok('Microsoft Windows [Version 10]')
      if (cmd === 'sh') return programs.includes(rest[3]!) ? ok() : no()
      if (cmd === 'where') return programs.includes(rest[0]!) ? ok() : no()
      if (cmd === 'test') return files.includes(rest[1]!) ? ok() : no()
      return ok()
    },
  }).host
  S.players = findPlayers($) as Promise<Players>
  return { $, ran }
}

const chime = async ($: Parameters<typeof playsFor>[0], set: SoundSet, needsYou: boolean) => (await playsFor($, 'sound', [needsYou ? '?T-5' : 'T-3'], set)).map(p => p.argv)

test('on macOS each sound set plays its own done and needs-you sounds, all different', async () => {
  const { $ } = machine('Darwin', ['afplay'], ALL_MAC)
  const seen: string[] = []
  for (const set of SOUND_SETS) {
    const done = await chime($, set, false)
    const needs = await chime($, set, true)
    expect(done).toEqual([['afplay', `${MAC}/${MAC_SETS[set][0]}.aiff`]])
    expect(needs).toEqual([['afplay', `${MAC}/${MAC_SETS[set][1]}.aiff`]])
    seen.push(done[0]![1]!, needs[0]![1]!)
  }
  expect(new Set(seen).size).toBe(6)
  // set 1 is the chime every project played before
  expect(MAC_SETS[1]).toEqual(['Glass', 'Ping'])
  // a missing file falls back to set 1's sound for the same moment
  const missing = machine('Darwin', ['afplay'], ALL_MAC.filter(f => !f.includes('Hero') && !f.includes('Funk')))
  expect(await chime(missing.$, 2, false)).toEqual([['afplay', `${MAC}/Glass.aiff`]])
  expect(await chime(missing.$, 2, true)).toEqual([['afplay', `${MAC}/${MAC_SETS[2][1]}.aiff`]])
  expect(await chime(missing.$, 3, true)).toEqual([['afplay', `${MAC}/Ping.aiff`]])
  // only Glass there: every set plays Glass
  const glass = machine('Darwin', ['afplay'], [`${MAC}/Glass.aiff`])
  for (const set of SOUND_SETS) expect(await chime(glass.$, set, true)).toEqual([['afplay', `${MAC}/Glass.aiff`]])
})

test('on Linux each sound set plays its own freedesktop sounds, and a missing one falls back to set 1', async () => {
  const { $ } = machine('Linux', ['paplay', 'canberra-gtk-play'], ALL_FD)
  const seen: string[] = []
  for (const set of SOUND_SETS) {
    const [done, needs] = FD_SETS[set]
    expect(await chime($, set, false)).toEqual([['paplay', `${FD}/${done}.oga`], ['canberra-gtk-play', '-i', done]])
    expect(await chime($, set, true)).toEqual([['paplay', `${FD}/${needs}.oga`], ['canberra-gtk-play', '-i', needs]])
    seen.push(done, needs)
  }
  expect(new Set(seen).size).toBe(6)
  // only set 1's files: sets 2 and 3 play them too
  const few = machine('Linux', ['paplay'], [`${FD}/complete.oga`, `${FD}/bell.oga`])
  expect(await chime(few.$, 3, false)).toEqual([['paplay', `${FD}/complete.oga`]])
  expect(await chime(few.$, 3, true)).toEqual([['paplay', `${FD}/bell.oga`]])
  // only one sound on the machine: everything plays it
  const one = machine('Linux', ['paplay'], [`${FD}/complete.oga`])
  expect(await chime(one.$, 2, true)).toEqual([['paplay', `${FD}/complete.oga`]])
})

test('on Windows sets 2 and 3 play media files, falling back to set 1 system sounds inside the script', async () => {
  const { $ } = machine('', ['powershell'], [])
  expect((await chime($, 1, false))[0]![4]).toContain('[System.Media.SystemSounds]::Asterisk.Play()')
  const two = (await chime($, 2, false))[0]![4]!
  expect(two).toContain('tada.wav')
  expect(two).toContain('[System.Media.SystemSounds]::Asterisk.Play()')
  expect((await chime($, 3, true))[0]![4]).toContain('notify.wav')
  expect((await chime($, 2, true))[0]![4]).not.toBe((await chime($, 3, true))[0]![4])
})

test('the default sound set comes from the project folder name and stays the same', async () => {
  expect(soundSetFor('/a/symcc')).toBe(soundSetFor('/other/place/symcc/'))
  expect(soundSetFor('C:\\code\\symcc')).toBe(soundSetFor('/a/symcc'))
  for (let i = 0; i < 5; i++) expect(soundSetFor('/work/my-app')).toBe(soundSetFor('/work/my-app'))
  // fixed values, so a change to the hash (which would move every project's chime) shows up here
  expect(['repo', 'symcc', 'web', 'api', 'site'].map(n => soundSetFor(`/x/${n}`))).toEqual([1, 3, 2, 3, 1])
  // many names spread over all 3 sets
  const sets = new Set(['a', 'b', 'c', 'web', 'api', 'site', 'alpha', 'beta'].map(n => soundSetFor(`/x/${n}`)))
  expect(sets.size).toBe(3)
  expect(soundSetOf({}, '/x/web')).toBe(2)
  expect(soundSetOf({ sound_set: 3 }, '/x/web')).toBe(3)
  // with nothing given, playsFor uses the set of the project folder (S.root)
  const { $ } = machine('Darwin', ['afplay'], ALL_MAC)
  S.root = '/x/web'
  expect((await playsFor($, 'sound', ['T-1'])).map(p => p.argv)).toEqual([['afplay', `${MAC}/${MAC_SETS[2][0]}.aiff`]])
  S.root = '/x/symcc'
  expect((await playsFor($, 'sound', ['T-1'])).map(p => p.argv)).toEqual([['afplay', `${MAC}/${MAC_SETS[3][0]}.aiff`]])
})

test('the sound_set setting is read, saved, shown and changes the files played', async () => {
  expect(parseSettingValue('sound_set', '2')).toEqual({ ok: true, input: { sound_set: 2 } })
  expect(parseSettingValue('sound_set', '4')).toEqual({ ok: false, message: 'sound_set must be 1, 2 or 3' })
  expect(settingChoices('sound_set')).toEqual(['1', '2', '3'])
  const b = emptyBoard()
  // a pick list gives text; the lead's tool gives a number
  const r = applySettings(b, { sound_set: '3' })
  expect(r.board.sound_set).toBe(3)
  expect(r.changes.map(c => [c.name, c.value])).toEqual([['sound_set', '3']])
  expect(applySettings(b, { sound_set: 2 }).board.sound_set).toBe(2)
  expect(applySettings(b, { sound_set: 7 }).changes).toEqual([])
  // kept in the board file; a bad value is dropped
  expect(parseBoard(JSON.stringify({ ...b, sound_set: 2 })).sound_set).toBe(2)
  expect(parseBoard(JSON.stringify({ ...b, sound_set: 9 })).sound_set).toBe(undefined)
  // shown: the saved one, else the one picked from the project name
  expect(settingValue({ sound_set: 1 }, 'sound_set', '/x/web')).toBe('1')
  expect(settingValue({}, 'sound_set', '/x/web')).toBe('2')
  expect(SETTING_GROUPS.find(g => g.items.includes('sound_set'))!.title).toBe('Board and alerts')
  expect(settingsText({}, 'symcc', '/x/web')).toMatch(/sound_set\s+2\s+\(default picked from the project name · 1 \/ 2 \/ 3\)/)
  expect(leadSettingsText({ sound_set: 3 }, { sound: true, voice: true })).toContain('sound_set: 3 (default picked from the project name, can be 1 / 2 / 3)')
  expect(groupSummary(SETTING_GROUPS.find(g => g.title === 'Board and alerts')!, { notify: 'sound', sound_set: 2 }, 200)).toContain('sounds 2')
  // the setting changes the files played
  const { $ } = machine('Darwin', ['afplay'], ALL_MAC)
  S.root = '/x/web'
  const files = await Promise.all(SOUND_SETS.map(async set => (await playsFor($, 'sound', ['T-1'], soundSetOf({ sound_set: set }, S.root)))[0]!.argv[1]))
  expect(files).toEqual(SOUND_SETS.map(set => `${MAC}/${MAC_SETS[set][0]}.aiff`))
})

test("playing a sample plays the set's done chime once, and nothing where there is no player", async () => {
  const { $, ran } = machine('Darwin', ['afplay'], ALL_MAC)
  expect(await playSample($, 3)).toEqual({ argv: ['afplay', `${MAC}/${MAC_SETS[3][0]}.aiff`] })
  expect(ran.filter(a => a[0] === 'afplay')).toEqual([['afplay', `${MAC}/${MAC_SETS[3][0]}.aiff`]])
  const none = machine('Darwin', [], [])
  expect(await playSample(none.$, 2)).toBe(null)
})

test("a queued chime plays the board's sound set, else the project's", async () => {
  const { $, ran } = machine('Darwin', ['afplay'], ALL_MAC)
  S.root = '/x/web'
  S.driving = true
  sayDone($, { ...emptyBoard(), notify: 'sound', sound_set: 3 }, 'T-3')
  S.sayTimer = null
  await sayNext($)
  sayDone($, { ...emptyBoard(), notify: 'sound' }, 'T-4')
  S.sayTimer = null
  await sayNext($)
  S.driving = false
  expect(ran.filter(a => a[0] === 'afplay')).toEqual([['afplay', `${MAC}/${MAC_SETS[3][0]}.aiff`], ['afplay', `${MAC}/${MAC_SETS[2][0]}.aiff`]])
})

test('the board view the Settings pages read has the sound set: the saved one, else the one from the project name', async () => {
  const f = fakeHost()
  S.root = '/x/web'
  await publish(f.host, emptyBoard())
  expect((f.panel.view() as PaneView).sound_set).toBe(soundSetFor('/x/web'))
  await publish(f.host, { ...emptyBoard(), sound_set: 3 })
  expect((f.panel.view() as PaneView).sound_set).toBe(3)
})
