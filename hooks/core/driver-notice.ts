// T-952: the notice a window that does not drive the board shows, naming the window that drives it: when that window
// started driving and when it was last active (from lead.json's `since` and `active`), else when it last checked in
// (the heartbeat). A window that follows says "this window follows (…); /symcc-drive to
// drive from here". Each has shorter forms for a narrow place: "started …" goes first, then the commands get short.

/** What a window knows of the driving window, from lead.json (see Lead): its heartbeat, and since T-952 when it claimed the board and when it was last active. */
export type DriverFacts = { heartbeat: number; since?: number; active?: number }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')

/** A time as the owner reads it, in the local time zone: "Nov 23 09:26". */
export function startedText(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** How long ago, short: "just now", "10 s ago", "3 min ago", "2 h ago", "4 d ago". */
export function agoShort(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** DriverFacts from what lead.json holds (undefined when it names no heartbeat). */
export function driverFacts(l: { heartbeat?: unknown; since?: unknown; active?: unknown } | null | undefined): DriverFacts | undefined {
  const heartbeat = num(l?.heartbeat)
  if (heartbeat === undefined) return undefined
  const since = num(l?.since)
  const active = num(l?.active)
  return { heartbeat, ...(since !== undefined ? { since } : {}), ...(active !== undefined ? { active } : {}) }
}

/**
 * What is known of the driver, for inside the brackets: "started Nov 23 09:26, active 3 min ago" (`withStart`), or
 * "active 3 min ago"; with no `active` saved (an old lead.json, or a host that can't tell), the heartbeat's age:
 * "checked in 10 s ago". '' with no facts at all.
 */
function driverWhen(d: DriverFacts | undefined, nowMs: number, withStart = true): string {
  if (!d) return ''
  const start = withStart && d.since !== undefined ? `started ${startedText(d.since)}` : ''
  const act = d.active !== undefined ? `active ${agoShort(nowMs - d.active)}` : `checked in ${agoShort(nowMs - d.heartbeat)}`
  return [start, act].filter(Boolean).join(', ')
}

/** A piece of a notice; `command` marks a slash command (a view draws it in its own color). */
export type NoticePart = { text: string; command?: boolean }

const brackets = (s: string) => (s ? ` (${s})` : '')

/**
 * The notice of a window that follows (symcc on here, another window drives), longest first: "this window follows
 * (driver started Nov 23 09:26, active 3 min ago); /symcc-drive to drive from here", then without "started …", then
 * "· /symcc-drive", then with no facts. `idle`: the driver looks idle (driverLooksIdle), said inside the brackets.
 */
export function followForms(name: string, d: DriverFacts | undefined, nowMs: number, idle = false): NoticePart[][] {
  const drive = { text: `/${name}-drive`, command: true }
  const facts = (withStart: boolean) => {
    const when = driverWhen(d, nowMs, withStart)
    const parts = [when ? `driver ${when}` : '', idle ? (when ? 'looks idle' : 'the driver looks idle') : ''].filter(Boolean)
    return brackets(parts.join(', '))
  }
  const long = (f: string): NoticePart[] => [{ text: `this window follows${f}; ` }, drive, { text: ' to drive from here' }]
  const short = (f: string): NoticePart[] => [{ text: `this window follows${f} · ` }, drive]
  // the narrowest form with facts leaves out "this window" (the status line has the mode in front of it)
  const shorter = (f: string): NoticePart[] => [{ text: `follows${f} · ` }, drive]
  return uniqueForms([long(facts(true)), long(facts(false)), short(facts(false)), shorter(facts(false)), short(idle ? brackets('idle?') : '')])
}

const formText = (f: NoticePart[]) => f.map(p => p.text).join('')

function uniqueForms(forms: NoticePart[][]): NoticePart[][] {
  const seen = new Set<string>()
  return forms.filter(f => !seen.has(formText(f)) && (seen.add(formText(f)), true))
}

/** The longest of `forms` whose text (after `before`, e.g. "⚠ ") is no wider than `width`; the shortest when none fits. */
export function fitForm(forms: NoticePart[][], width = Infinity, before = ''): NoticePart[] {
  return forms.find(f => before.length + formText(f).length <= width) ?? forms[forms.length - 1]!
}

/** A notice's plain text. */
export const noticeText = formText
