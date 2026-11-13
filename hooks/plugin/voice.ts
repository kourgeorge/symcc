// Notify: a chime (sound) or "T-3 done" said out loud (voice) when a task is merged or a question waits.
import type { SymccTask } from '../../types'
import { type Board, type Notify, type NotifySystem, type Playable, notifyOf, canPlay, unplayableNote, symccOn, spokenLine, NEEDS_YOU_MARK } from '../board'
import { type $, S, sayQueue } from './state'

/** One command to run: the text is always its own argument (or, on Windows, an environment value), never part of a shell string. */
export type Play = { argv: string[]; env?: Record<string, string> }
/** Makes the command for one line: `text` the words, `needsYou` when a question waits (a different chime). */
export type Player = (text: string, needsYou: boolean) => Play
/** What this machine has, found once per session: its system, and the speech and sound commands to try in order. */
export type Players = { system: NotifySystem; voice: Player[]; sound: Player[] }

/** The environment value the Windows speech command reads the text from. */
export const WIN_TEXT_VAR = 'SYMCC_NOTIFY_TEXT'
const PS = ['powershell', '-NoProfile', '-NonInteractive', '-Command']
const WIN_SPEAK = `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:${WIN_TEXT_VAR})`
// Play() returns at once; the short wait lets the chime finish before PowerShell exits
const winChime = (name: string) => `[System.Media.SystemSounds]::${name}.Play(); Start-Sleep -Milliseconds 900`

const MAC_SOUNDS = '/System/Library/Sounds'
const FD_SOUNDS = '/usr/share/sounds/freedesktop/stereo'

function run($: $, argv: string[]) {
  return $.process.run(argv, { timeoutMs: 5000 }).catch(() => null)
}
async function okRun($: $, argv: string[]) {
  return (await run($, argv))?.exitCode === 0
}

/** Which system this is: uname first; where there is no uname (Windows), `cmd /c ver`. */
export async function systemOf($: $): Promise<NotifySystem> {
  const r = await run($, ['uname', '-s'])
  const os = r && r.exitCode === 0 ? String(r.stdout ?? '').trim() : ''
  if (os === 'Darwin') return 'mac'
  if (os === 'Linux') return 'linux'
  if (/^(MINGW|MSYS|CYGWIN)|windows/i.test(os)) return 'windows'
  if (os) return 'other'
  const w = await run($, ['cmd', '/c', 'ver'])
  return w && w.exitCode === 0 && /windows/i.test(String(w.stdout ?? '')) ? 'windows' : 'other'
}

/** Is the program `name` installed? Looked up only (command -v, or where on Windows), never run. */
function hasProgram($: $, system: NotifySystem, name: string) {
  return system === 'windows' ? okRun($, ['where', name]) : okRun($, ['sh', '-c', 'command -v "$1" >/dev/null 2>&1', 'sh', name])
}
function hasFile($: $, path: string) {
  return okRun($, ['test', '-f', path])
}
/** The freedesktop "complete" and "bell" sounds with extension `ext`, or null when there is no "complete" one. */
async function fdSounds($: $, ext: string) {
  if (!(await hasFile($, `${FD_SOUNDS}/complete.${ext}`))) return null
  const done = `${FD_SOUNDS}/complete.${ext}`
  return { done, needs: (await hasFile($, `${FD_SOUNDS}/bell.${ext}`)) ? `${FD_SOUNDS}/bell.${ext}` : done }
}

/** Finds this machine's speech and sound commands by looking for the programs (and sound files), playing nothing. */
export async function findPlayers($: $): Promise<Players> {
  const system = await systemOf($)
  const voice: Player[] = []
  const sound: Player[] = []
  if (system === 'mac') {
    if (await hasProgram($, system, 'say')) voice.push(text => ({ argv: ['say', '-r', '200', text] }))
    if ((await hasProgram($, system, 'afplay')) && (await hasFile($, `${MAC_SOUNDS}/Glass.aiff`))) {
      const ping = (await hasFile($, `${MAC_SOUNDS}/Ping.aiff`)) ? 'Ping' : 'Glass'
      sound.push((_, needs) => ({ argv: ['afplay', `${MAC_SOUNDS}/${needs ? ping : 'Glass'}.aiff`] }))
    }
  } else if (system === 'linux') {
    if (await hasProgram($, system, 'spd-say')) voice.push(text => ({ argv: ['spd-say', '-w', text] }))
    if (await hasProgram($, system, 'espeak-ng')) voice.push(text => ({ argv: ['espeak-ng', text] }))
    if (await hasProgram($, system, 'espeak')) voice.push(text => ({ argv: ['espeak', text] }))
    const oga = await fdSounds($, 'oga')
    if (oga && (await hasProgram($, system, 'paplay'))) sound.push((_, needs) => ({ argv: ['paplay', needs ? oga.needs : oga.done] }))
    if (await hasProgram($, system, 'canberra-gtk-play')) sound.push((_, needs) => ({ argv: ['canberra-gtk-play', '-i', needs ? 'bell' : 'complete'] }))
    const wav = await fdSounds($, 'wav')
    if (wav && (await hasProgram($, system, 'aplay'))) sound.push((_, needs) => ({ argv: ['aplay', '-q', needs ? wav.needs : wav.done] }))
  } else if (system === 'windows') {
    if (await hasProgram($, system, 'powershell')) {
      voice.push(text => ({ argv: [...PS, WIN_SPEAK], env: { [WIN_TEXT_VAR]: text } }))
      sound.push((_, needs) => ({ argv: [...PS, winChime(needs ? 'Exclamation' : 'Asterisk')] }))
    }
  }
  return { system, voice, sound }
}

/** This machine's players, found once per session. */
export function players($: $): Promise<Players> {
  S.players ??= findPlayers($).catch(() => ({ system: 'other' as const, voice: [], sound: [] }))
  return S.players
}

/** Which of sound and voice this machine can play (found once per session). */
export async function playable($: $): Promise<Playable> {
  const p = await players($)
  return { system: p.system, sound: p.sound.length > 0, voice: p.voice.length > 0 }
}

/** Says "T-3 done" (or chimes) for a merged task, if this session drives the board and notify is on. Never waits, never shows an error. */
export function sayDone($: $, b: Board, id: string) {
  queueSay($, b, id)
}

/** The waiting questions already told ("task id#try#question"), so each one is told only once. */
export const saidNeedsYou = new Set<string>()

/**
 * Says "T-5 needs you" (or chimes) when task `t`'s worker asked the owner something (QUESTION or
 * NEED FILES), once per waiting question, under the same rules and in the same queue as "T-3 done".
 */
export function sayNeedsYou($: $, b: Board, t: Pick<SymccTask, 'id' | 'attempts'>, question = '') {
  const key = `${t.id}#${t.attempts}#${question}`
  if (saidNeedsYou.has(key)) return
  if (queueSay($, b, NEEDS_YOU_MARK + t.id)) saidNeedsYou.add(key)
}

/** Adds `item` to the queue and plays it soon; false when nothing plays here (not the driver, notify or plugin off). */
function queueSay($: $, b: Board, item: string): boolean {
  if (!S.driving || !symccOn(b) || b.notify === 'off') return false
  S.notifyWanted = b.notify ?? null
  sayQueue.push(item)
  if (S.sayTimer || S.saying) return true
  S.sayTimer = $.clock.after(1500, () => {
    S.sayTimer = null
    void sayNext($)
  })
  return true
}

/** The commands to try for one queued line, in order; [] when nothing plays (off, or it can't play here: told once). */
export async function playsFor($: $, wanted: Notify | null, items: string[]): Promise<Play[]> {
  const text = spokenLine(items)
  if (!text) return []
  const p = await players($)
  const can: Playable = { system: p.system, sound: p.sound.length > 0, voice: p.voice.length > 0 }
  const n = notifyOf({ notify: wanted ?? undefined }, can)
  if (n === 'off') return []
  if (!canPlay(n, can)) {
    if (!S.toldUnplayable) {
      S.toldUnplayable = true
      $.ui.toast(S.N.toast(unplayableNote(n, can)))
    }
    return []
  }
  const needsYou = items.some(x => String(x ?? '').startsWith(NEEDS_YOU_MARK))
  return p[n].map(make => make(text, needsYou))
}

export async function sayNext($: $) {
  if (S.saying) return
  const items = sayQueue.splice(0)
  if (!items.length) return
  S.saying = true
  try {
    for (const c of await playsFor($, S.notifyWanted, items)) {
      const r = await $.process.run(c.argv, { timeoutMs: 30_000, ...(c.env ? { env: c.env } : {}) }).catch(() => null)
      if (r && r.exitCode === 0) break
    }
  } catch {
    // stay silent
  } finally {
    S.saying = false
  }
  if (sayQueue.length) void sayNext($)
}
