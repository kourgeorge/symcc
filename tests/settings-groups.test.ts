import { expect, test } from 'claude-code/testing'
import { SETTINGS, SETTING_GROUPS, SETTING_NAMES, SETTING_PAGES, emptyBoard, leadSettingsText, settingsText, settingDots, settingsRuleWidth, settingInfo } from '../hooks/board'

test('T-1055: both boards share the Settings dot leaders and rule width: every value starts in one column', () => {
  const ends = [...SETTINGS.map(x => x.label), 'Roles', 'Task types'].map(l => (l + settingDots(l)).length)
  expect(new Set(ends).size).toBe(1)
  expect(settingDots('Task types').trim().length).toBeGreaterThanOrEqual(2)
  expect([0, 30, 100].map(settingsRuleWidth)).toEqual([10, 28, 60])
  expect(settingInfo('max_parallel')?.label).toBe(SETTINGS.find(s => s.name === 'max_parallel')!.label)
})

test('every setting is in exactly one category (a new setting needs one), and so are the Roles and Task types pages', () => {
  const all = SETTING_GROUPS.flatMap(g => g.items)
  for (const name of [...SETTING_NAMES, ...SETTING_PAGES]) expect(all.filter(x => x === name)).toHaveLength(1)
  expect(all).toHaveLength(SETTING_NAMES.length + SETTING_PAGES.length)
  expect(SETTING_GROUPS.map(g => g.title)).toEqual(['Work', 'Checks before merging', 'Workers', 'Scouts', 'Board and alerts'])
})

/** The heading lines of a listing and the setting names under each, in order. */
function sections(text: string, isHeading: (l: string) => string | null, nameOf: (l: string) => string | null) {
  const out: [string, string[]][] = []
  for (const l of text.split('\n')) {
    const h = isHeading(l)
    if (h !== null) out.push([h, []])
    else if (out.length) {
      const n = nameOf(l)
      if (n) out.at(-1)![1].push(n)
    }
  }
  return out
}

const expected = SETTING_GROUPS.map(g => [g.title, g.items.filter(x => (SETTING_NAMES as readonly string[]).includes(x))] as [string, string[]])

test("the lead's settings listing shows the same headings, each with its settings under it", () => {
  const text = leadSettingsText(emptyBoard(), { sound: true, voice: false })
  const got = sections(text, l => (l.startsWith('## ') ? l.slice(3) : null), l => /^(\w+): /.exec(l)?.[1] ?? null)
  expect(got.map(([t, names]) => [t, names.filter(n => n !== 'roles')])).toEqual(expected)
  expect(text).toContain('roles and task types: use the roles and kinds tools')
})

test("the owner's settings text (when the panel can't be shown) is grouped the same way", () => {
  const text = settingsText(emptyBoard(), 'crew')
  const got = sections(text, l => (/^\S.*:$/.test(l) ? l.slice(0, -1) : null), l => /^ {2}(\w+)\s/.exec(l)?.[1] ?? null)
  expect(got.map(([t, names]) => [t, names.filter(n => n !== 'roles')])).toEqual(expected)
})

test('T-800: the owner reads approve merge in the settings text; the lead sees the stored values', () => {
  const line = (t: string, start: RegExp) => t.split('\n').find(l => start.test(l)) ?? ''
  const owner = line(settingsText({ mode: 'review' }), /^ {2}mode\s/)
  expect(owner).toContain('approve merge')
  expect(owner).not.toMatch(/\breview\b/)
  const lead = line(leadSettingsText({ mode: 'review' }, { sound: false, voice: false }), /^mode:/)
  expect(lead).toContain('mode: review (default auto, can be paused / review / auto)')
})
