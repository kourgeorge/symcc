// T-650: notify has 3 sound sets, so the owner can tell which project chimed; T-695: they are the notify choices
// "sound 1", "sound 2" and "sound 3" (there is no sound_set setting any more).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost } from './fake-host'
import { S, type PaneView } from '../hooks/app/state'
import { publish } from '../hooks/app/lead'
import { type Players, findPlayers, playsFor, playSample, sayDone, sayNext, MAC_SETS, FD_SETS } from '../hooks/app/voice'
import { readOld } from './old-data-fixture'
import { type SoundSet, SOUND_SETS, SETTING_GROUPS, SETTING_NAMES, applySettings, emptyBoard, groupSummary, leadSettingsText, notifyChoices, notifyOf, parseBoard, readBoard, parseSettingValue, settingChoices, settingValue, settingsText, soundNotify, soundSetFor } from '../hooks/board'

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

const chime = async ($: Parameters<typeof playsFor>[0], set: SoundSet, needsYou: boolean) => (await playsFor($, soundNotify(set), [needsYou ? '?T-5' : 'T-3'])).map(p => p.argv)

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
  // with no notify saved on a machine that can only chime, the default is sound 2
  expect(notifyOf({}, { voice: false, sound: true })).toBe('sound 2')
  expect(notifyOf({}, { voice: true, sound: true })).toBe('sound 2')
  expect(notifyOf({}, { voice: false, sound: false })).toBe('off')
  const { $ } = machine('Darwin', ['afplay'], ALL_MAC)
  S.root = '/x/web'
  expect((await playsFor($, null, ['T-1'])).map(p => p.argv)).toEqual([['afplay', `${MAC}/${MAC_SETS[2][0]}.aiff`]])
  // the default is sound 2 for every folder
  S.root = '/x/symcc'
  expect((await playsFor($, null, ['T-1'])).map(p => p.argv)).toEqual([['afplay', `${MAC}/${MAC_SETS[2][0]}.aiff`]])
})

test('T-695: notify takes voice, sound 1, sound 2, sound 3 or off, and nothing else; there is no sound_set', async () => {
  for (const v of ['voice', 'sound 1', 'sound 2', 'sound 3', 'off']) expect(parseSettingValue('notify', v)).toEqual({ ok: true, input: { notify: v } })
  // typed loosely: case and spaces do not matter
  expect(parseSettingValue('notify', 'Sound2')).toEqual({ ok: true, input: { notify: 'sound 2' } })
  for (const v of ['sound', 'sound 4', 'loud', '2']) expect(parseSettingValue('notify', v)).toEqual({ ok: false, message: 'notify must be voice, sound 1, sound 2, sound 3 or off' })
  expect(settingChoices('notify', notifyChoices({ sound: true, voice: true }))).toEqual(['voice', 'sound 1', 'sound 2', 'sound 3', 'off'])
  expect(notifyChoices({ sound: true, voice: false })).toEqual(['sound 1', 'sound 2', 'sound 3', 'off'])
  expect((SETTING_NAMES as readonly string[]).includes('sound_set')).toBe(false)
  expect(SETTING_GROUPS.find(g => g.title === 'Board and alerts')!.items).toEqual(['notify', 'open_on_start', 'archive_days'])
  const b = emptyBoard()
  const r = applySettings(b, { notify: 'sound 3' })
  expect(r.board.notify).toBe('sound 3')
  expect(r.changes.map(c => [c.name, c.value])).toEqual([['notify', 'sound 3']])
  expect(applySettings(b, { notify: 'sound' }).changes).toEqual([])
  expect(applySettings(b, { notify: 'sound 7' }).changes).toEqual([])
  // kept in the board file; a bad value is dropped
  expect(parseBoard(JSON.stringify({ ...b, notify: 'sound 2' })).notify).toBe('sound 2')
  expect(parseBoard(JSON.stringify({ ...b, notify: 'sound 9' })).notify).toBe(undefined)
  // shown in the settings lists
  expect(settingValue({ notify: 'sound 1' }, 'notify', '/x/web')).toBe('sound 1')
  const text = settingsText({ notify: 'sound 2' }, 'symcc', '/x/web')
  expect(text).toMatch(/notify\s+sound 2\s+\(default sound 2 \(else voice if this computer can only speak, else off\) · voice \/ sound 1 \/ sound 2 \/ sound 3 \/ off\)/)
  expect(text).toContain('sound 1: a short chime, sound set 1')
  expect(text).not.toContain('sound_set')
  const lead = leadSettingsText({}, { sound: true, voice: false }, '/x/web')
  expect(lead).toContain('notify: sound 2 (default sound 2')
  expect(lead).toContain('this machine can play: sound 1, sound 2, sound 3, off')
  expect(lead).not.toContain('sound_set')
  expect(groupSummary(SETTING_GROUPS.find(g => g.title === 'Board and alerts')!, { notify: 'sound 2' }, 200)).toContain('notify sound 2')
  // the choice changes the files played
  const { $ } = machine('Darwin', ['afplay'], ALL_MAC)
  S.root = '/x/web'
  const files = await Promise.all(SOUND_SETS.map(async set => (await playsFor($, `sound ${set}`, ['T-1']))[0]!.argv[1]))
  expect(files).toEqual(SOUND_SETS.map(set => `${MAC}/${MAC_SETS[set][0]}.aiff`))
})

test('T-695: an old board with notify "sound" is upgraded by migrate-data to "sound N": its sound_set, else the project set', async () => {
  const b = emptyBoard()
  const old = (x: object) => readOld(JSON.stringify({ ...b, ...x }), '/x/web')
  expect(old({ notify: 'sound', sound_set: 2 }).board.notify).toBe('sound 2')
  expect(old({ notify: 'sound', sound_set: 3 }).board.notify).toBe('sound 3')
  expect(old({ notify: 'sound' }).board.notify).toBe(`sound ${soundSetFor('/x/web')}`)
  expect(readOld(JSON.stringify({ ...b, notify: 'sound' }), '/x/symcc').board.notify).toBe(`sound ${soundSetFor('/x/symcc')}`)
  // a bad old sound_set: the project's set
  expect(old({ notify: 'sound', sound_set: 9 }).board.notify).toBe('sound 2')
  // not a fixed (bad) value
  expect(old({ notify: 'sound', sound_set: 2 }).fixed).toEqual([])
  // an old sound_set next to voice or off is dropped
  const v = old({ notify: 'voice', sound_set: 3 })
  expect(v.board.notify).toBe('voice')
  expect('sound_set' in v.board).toBe(false)
  expect(old({ notify: 'off', sound_set: 1 }).board.notify).toBe('off')
  // read without the upgrade (a plain load), the old "sound" is a bad value: the default
  expect(readBoard(JSON.stringify({ ...b, notify: 'sound' })).fixed).toEqual(['notify'])
})

test("playing a sample plays the set's done chime once, and nothing where there is no player", async () => {
  const { $, ran } = machine('Darwin', ['afplay'], ALL_MAC)
  expect(await playSample($, 3)).toEqual({ argv: ['afplay', `${MAC}/${MAC_SETS[3][0]}.aiff`] })
  expect(ran.filter(a => a[0] === 'afplay')).toEqual([['afplay', `${MAC}/${MAC_SETS[3][0]}.aiff`]])
  const none = machine('Darwin', [], [])
  expect(await playSample(none.$, 2)).toBe(null)
})

test('a queued chime plays the set its notify names', async () => {
  const { $, ran } = machine('Darwin', ['afplay'], ALL_MAC)
  S.root = '/x/web'
  S.driving = true
  sayDone($, { ...emptyBoard(), notify: 'sound 3' }, 'T-3')
  S.sayTimer = null
  await sayNext($)
  sayDone($, { ...emptyBoard(), notify: 'sound 1' }, 'T-4')
  S.sayTimer = null
  await sayNext($)
  S.driving = false
  expect(ran.filter(a => a[0] === 'afplay')).toEqual([['afplay', `${MAC}/${MAC_SETS[3][0]}.aiff`], ['afplay', `${MAC}/${MAC_SETS[1][0]}.aiff`]])
})

test('the board view the Settings pages read has notify (with its set) and the five choices, and no sound_set', async () => {
  const f = fakeHost()
  S.root = '/x/web'
  await publish(f.host, { ...emptyBoard(), notify: 'sound 3' })
  const v = f.panel.view() as PaneView
  expect(v.notify_now).toBe('sound 3')
  expect('sound_set' in v).toBe(false)
})
