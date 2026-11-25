// Notify: a chime (sound 1, 2 or 3: one of the sound sets) or "symcc: T-3 done" said out loud (voice) when a task is merged or a question waits.
import type { SymccTask } from '../../types'
import { type Board, type Notify, type NotifySystem, type Playable, type SoundSet, SOUND_SETS, notifyOf, notifyKind, notifySet, canPlay, unplayableNote, symccOn, spokenLine, soundSetFor, projectFolder, NEEDS_YOU_MARK } from '../board'
import { S, onHere, sayQueue } from './state'
import type { Host } from '../host'

/** One command to run: the text is always its own argument (or, on Windows, an environment value), never part of a shell string. */
export type Play = { argv: string[]; env?: Record<string, string> }
/** Makes the command for one line: `text` the words, `needsYou` when a question waits (a different chime), `set` the sound set (chimes only). */
export type Player = (text: string, needsYou: boolean, set: SoundSet) => Play
/** What this machine has, found once per session: its system, and the speech and sound commands to try in order. */
export type Players = { system: NotifySystem; voice: Player[]; sound: Player[] }

/** The environment value the Windows speech command reads the text from. */
export const WIN_TEXT_VAR = 'SYMCC_NOTIFY_TEXT'
const PS = ['powershell', '-NoProfile', '-NonInteractive', '-Command']
const WIN_SPEAK = `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:${WIN_TEXT_VAR})`
// Play() returns at once; the short wait lets the chime finish before PowerShell exits
const winChime = (name: string) => `[System.Media.SystemSounds]::${name}.Play(); Start-Sleep -Milliseconds 900`
/** A Windows media file (in %windir%\Media) played to the end, or set 1's system sound `fallback` when the file is missing. */
const winMedia = (file: string, fallback: string) =>
  `$p = Join-Path $env:windir 'Media\\${file}'; if (Test-Path $p) { (New-Object System.Media.SoundPlayer $p).PlaySync() } else { ${winChime(fallback)} }`

const MAC_SOUNDS = '/System/Library/Sounds'
const FD_SOUNDS = '/usr/share/sounds/freedesktop/stereo'

/** The sound sets as [done, needs you] sounds, per system. Set 1 is the one every project used before (T-650). */
export const MAC_SETS: Record<SoundSet, [string, string]> = { 1: ['Glass', 'Ping'], 2: ['Hero', 'Pop'], 3: ['Submarine', 'Funk'] }
export const FD_SETS: Record<SoundSet, [string, string]> = { 1: ['complete', 'bell'], 2: ['message-new-instant', 'dialog-warning'], 3: ['service-login', 'window-attention'] }
/** Windows: set 1 is the system sounds; sets 2 and 3 are media files, each falling back to set 1's sound when missing. */
export const WIN_SETS: Record<SoundSet, [string, string]> = { 1: ['Asterisk', 'Exclamation'], 2: ['tada.wav', 'chord.wav'], 3: ['chimes.wav', 'notify.wav'] }

/** A sound file for each set and each of done / needs you: [done, needs]. */
type SetFiles = Record<SoundSet, [string, string]>

function run(host: Host, argv: string[]) {
  return host.run(argv, { timeoutMs: 5000 }).catch(() => null)
}
async function okRun(host: Host, argv: string[]) {
  return (await run(host, argv))?.exitCode === 0
}

/** Which system this is: uname first; where there is no uname (Windows), `cmd /c ver`. */
export async function systemOf(host: Host): Promise<NotifySystem> {
  const r = await run(host, ['uname', '-s'])
  const os = r && r.exitCode === 0 ? String(r.stdout ?? '').trim() : ''
  if (os === 'Darwin') return 'mac'
  if (os === 'Linux') return 'linux'
  if (/^(MINGW|MSYS|CYGWIN)|windows/i.test(os)) return 'windows'
  if (os) return 'other'
  const w = await run(host, ['cmd', '/c', 'ver'])
  return w && w.exitCode === 0 && /windows/i.test(String(w.stdout ?? '')) ? 'windows' : 'other'
}

/** Is the program `name` installed? Looked up only (command -v, or where on Windows), never run. */
function hasProgram(host: Host, system: NotifySystem, name: string) {
  return system === 'windows' ? okRun(host, ['where', name]) : okRun(host, ['sh', '-c', 'command -v "$1" >/dev/null 2>&1', 'sh', name])
}
function hasFile(host: Host, path: string) {
  return okRun(host, ['test', '-f', path])
}

/**
 * The files of every set, from the sound names in `sets` (`file` turns a name into its path), or null when set 1's
 * "done" file is missing (nothing to chime). A missing file falls back to set 1's file for the same moment
 * (and set 1's "needs you" to its "done").
 */
async function setFiles(host: Host, sets: Record<SoundSet, [string, string]>, file: (name: string) => string): Promise<SetFiles | null> {
  const has = new Map<string, boolean>()
  const ok = async (name: string) => {
    if (!has.has(name)) has.set(name, await hasFile(host, file(name)))
    return has.get(name)!
  }
  const [done1, needs1] = sets[1]
  if (!(await ok(done1))) return null
  const base: [string, string] = [done1, (await ok(needs1)) ? needs1 : done1]
  const out = {} as SetFiles
  for (const set of SOUND_SETS) {
    const [done, needs] = sets[set]
    out[set] = [(await ok(done)) ? done : base[0], (await ok(needs)) ? needs : base[1]]
  }
  return out
}
const pick = (files: SetFiles, set: SoundSet, needs: boolean) => (files[set] ?? files[1])[needs ? 1 : 0]

/** Finds this machine's speech and sound commands by looking for the programs (and sound files), playing nothing. */
export async function findPlayers(host: Host): Promise<Players> {
  const system = await systemOf(host)
  const voice: Player[] = []
  const sound: Player[] = []
  if (system === 'mac') {
    if (await hasProgram(host, system, 'say')) voice.push(text => ({ argv: ['say', '-r', '200', text] }))
    const mac = (await hasProgram(host, system, 'afplay')) ? await setFiles(host, MAC_SETS, n => `${MAC_SOUNDS}/${n}.aiff`) : null
    if (mac) sound.push((_, needs, set) => ({ argv: ['afplay', `${MAC_SOUNDS}/${pick(mac, set, needs)}.aiff`] }))
  } else if (system === 'linux') {
    if (await hasProgram(host, system, 'spd-say')) voice.push(text => ({ argv: ['spd-say', '-w', text] }))
    if (await hasProgram(host, system, 'espeak-ng')) voice.push(text => ({ argv: ['espeak-ng', text] }))
    if (await hasProgram(host, system, 'espeak')) voice.push(text => ({ argv: ['espeak', text] }))
    const paplay = await hasProgram(host, system, 'paplay')
    const canberra = await hasProgram(host, system, 'canberra-gtk-play')
    const oga = paplay || canberra ? await setFiles(host, FD_SETS, n => `${FD_SOUNDS}/${n}.oga`) : null
    if (oga && paplay) sound.push((_, needs, set) => ({ argv: ['paplay', `${FD_SOUNDS}/${pick(oga, set, needs)}.oga`] }))
    if (canberra) {
      // canberra finds the sound by its name in the theme; with no files to look at, set 1's names (always in the theme)
      const names = oga ?? { 1: FD_SETS[1], 2: FD_SETS[1], 3: FD_SETS[1] }
      sound.push((_, needs, set) => ({ argv: ['canberra-gtk-play', '-i', pick(names, set, needs)] }))
    }
    const wav = (await hasProgram(host, system, 'aplay')) ? await setFiles(host, FD_SETS, n => `${FD_SOUNDS}/${n}.wav`) : null
    if (wav) sound.push((_, needs, set) => ({ argv: ['aplay', '-q', `${FD_SOUNDS}/${pick(wav, set, needs)}.wav`] }))
  } else if (system === 'windows') {
    if (await hasProgram(host, system, 'powershell')) {
      voice.push(text => ({ argv: [...PS, WIN_SPEAK], env: { [WIN_TEXT_VAR]: text } }))
      sound.push((_, needs, set) => {
        const i = needs ? 1 : 0
        const name = (WIN_SETS[set] ?? WIN_SETS[1])[i]
        return { argv: [...PS, set === 1 || !name.endsWith('.wav') ? winChime(WIN_SETS[1][i]) : winMedia(name, WIN_SETS[1][i])] }
      })
    }
  }
  return { system, voice, sound }
}

/** This machine's players, found once per session. */
export function players(host: Host): Promise<Players> {
  S.players ??= findPlayers(host).catch(() => ({ system: 'other' as const, voice: [], sound: [] }))
  return S.players
}

/** Which of sound and voice this machine can play (found once per session). */
export async function playable(host: Host): Promise<Playable> {
  const p = await players(host)
  return { system: p.system, sound: p.sound.length > 0, voice: p.voice.length > 0 }
}

/**
 * The project's name as it is said before every spoken line: the last part of `root` (the folder
 * the board lives in), with dashes, underscores and dots said as spaces, and only its first few
 * words when it is long. '' when there is no folder name.
 */
export function spokenProject(root: string, maxWords = 3): string {
  const folder = projectFolder(root)
  const words = folder.replace(/[-_.]+/g, ' ').split(/\s+/).filter(Boolean)
  return words.slice(0, maxWords).join(' ')
}

/** `text` with the project's name first ("symcc: T-3 done"); `text` as it is when there is no name. */
export function withProject(text: string, root: string): string {
  const name = spokenProject(root)
  return name && text ? `${name}: ${text}` : text
}

/** Says "symcc: T-3 done" (or chimes) for a merged task, if this session drives the board and notify is on. Never waits, never shows an error. */
export function sayDone(host: Host, b: Board, id: string) {
  queueSay(host, b, id)
}

/** The waiting questions already told ("task id#try#question"), so each one is told only once. */
export const saidNeedsYou = new Set<string>()

/**
 * Says "symcc: T-5 needs you" (or chimes) when task `t`'s worker asked the owner something (its ask_owner
 * call, or files outside its list), once per waiting question, under the same rules and in the same queue as "T-3 done".
 */
export function sayNeedsYou(host: Host, b: Board, t: Pick<SymccTask, 'id' | 'attempts'>, question = '') {
  const key = `${t.id}#${t.attempts}#${question}`
  if (saidNeedsYou.has(key)) return
  if (queueSay(host, b, NEEDS_YOU_MARK + t.id)) saidNeedsYou.add(key)
}

/**
 * Says "symcc: Q-3 needs you" (or the same chime as a waiting task) when the lead put a question for the owner on
 * the board (see core/questions.ts), once per question, in the same queue as "T-5 needs you".
 */
export function sayQuestion(host: Host, b: Board, id: string) {
  const key = `question#${id}`
  if (saidNeedsYou.has(key)) return
  if (queueSay(host, b, NEEDS_YOU_MARK + id)) saidNeedsYou.add(key)
}

/** Adds `item` to the queue and plays it soon; false when nothing plays here (not the driver, notify or plugin off). */
function queueSay(host: Host, b: Board, item: string): boolean {
  if (!S.driving || !onHere(b)) return false
  if (b.notify === 'off') return false
  S.notifyWanted = b.notify ?? null
  sayQueue.push(item)
  if (S.sayTimer || S.saying) return true
  S.sayTimer = host.clock.after(1500, () => {
    S.sayTimer = null
    void sayNext(host)
  })
  return true
}

/**
 * The commands to try for one queued line, in order; [] when nothing plays (off, or it can't play here: told once).
 * A "sound N" choice chimes sound set N; with no choice saved the default is used (see notifyOf: voice, else the
 * project's own set).
 */
export async function playsFor(host: Host, wanted: Notify | null, items: string[]): Promise<Play[]> {
  const text = spokenLine(items)
  if (!text) return []
  const p = await players(host)
  const can = await playable(host)
  const n = notifyOf({ notify: wanted ?? undefined }, can, S.root)
  if (n === 'off') return []
  if (!canPlay(n, can)) {
    if (!S.toldUnplayable) {
      S.toldUnplayable = true
      host.ui.toast(S.N.toast(unplayableNote(n, can)))
    }
    return []
  }
  const needsYou = items.some(x => String(x ?? '').startsWith(NEEDS_YOU_MARK))
  // the spoken line says the project's name; a chime tells projects apart by its sound set
  const line = n === 'voice' ? withProject(text, S.root) : text
  const set = notifySet(n) ?? soundSetFor(S.root)
  return p[notifyKind(n) as 'sound' | 'voice'].map(make => make(line, needsYou, set))
}

export async function sayNext(host: Host) {
  if (S.saying) return
  const items = sayQueue.splice(0)
  if (!items.length) return
  S.saying = true
  try {
    for (const c of await playsFor(host, S.notifyWanted, items)) {
      const r = await host.run(c.argv, { timeoutMs: 30_000, ...(c.env ? { env: c.env } : {}) }).catch(() => null)
      if (r && r.exitCode === 0) break
    }
  } catch {
    // stay silent
  } finally {
    S.saying = false
  }
  if (sayQueue.length) void sayNext(host)
}

/**
 * Plays sound set `set`'s "done" chime once, so the owner hears the set just picked (Settings, notify "sound N").
 * Nothing when this machine has no sound player; never waits, never shows an error.
 */
export async function playSample(host: Host, set: SoundSet): Promise<Play | null> {
  if (!SOUND_SETS.includes(set)) return null
  try {
    for (const make of (await players(host)).sound) {
      const c = make('', false, set)
      const r = await host.run(c.argv, { timeoutMs: 10_000 }).catch(() => null)
      if (r && r.exitCode === 0) return c
    }
  } catch {
    // stay silent
  }
  return null
}
