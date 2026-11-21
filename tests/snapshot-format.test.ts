// The saved page pictures are written one drawn row per line (snapshot-format.ts, T-705), so two UI tasks that change
// different rows don't clash in git. These check the format keeps the data exactly, keeps lines short, and that a
// one-row change touches only that row's line.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { snapshotText, snapshotEntry, WIDTH } from './snapshot-format'
import { changedTree } from './board-fixture'
import { BEFORE, BEFORE_DROPPED } from './board-snapshot'
import { ROLES_KINDS_BEFORE } from './roles-kinds-snapshot'
import { SCOUTS_SETTINGS_BEFORE } from './scouts-settings-snapshot'
import { TASK_BEFORE } from './task-page-snapshot'
import { TASK_BEFORE_MOBILE } from './task-page-mobile-snapshot'

const SAVED: Record<string, Record<string, unknown>> = {
  BEFORE, BEFORE_DROPPED, ROLES_KINDS_BEFORE, SCOUTS_SETTINGS_BEFORE, TASK_BEFORE, TASK_BEFORE_MOBILE,
}

/** Reads snapshotText back: the only non-JSON part is the `" +\n  "` joins of long strings. */
const readBack = (text: string): unknown => JSON.parse(text.replace(/" \+\n *"/g, ''))
/** A line's length in drawn characters (box-drawing marks count as one). */
const width = (line: string): number => Array.from(line).length

test('T-705: every saved page reads back from the snapshot format exactly as it was', () => {
  const wrong: string[] = []
  for (const [name, pages] of Object.entries(SAVED))
    for (const [key, tree] of Object.entries(pages))
      if (JSON.stringify(readBack(snapshotText(tree, 1))) !== JSON.stringify(tree)) wrong.push(`${name} ${key}`)
  expect(wrong).toEqual([])
})

test('T-705: no line of a saved page is longer than 500 characters', () => {
  const long: string[] = []
  for (const [name, pages] of Object.entries(SAVED))
    for (const [key, tree] of Object.entries(pages)) {
      const most = Math.max(...snapshotEntry(key, tree).split('\n').map(width))
      if (most > 500) long.push(`${name} ${key}: ${most}`)
    }
  expect(long).toEqual([])
})

test('T-705: a short drawn row stays on one line, so a one-row change changes one line', () => {
  const before = snapshotEntry('terminal 50', BEFORE['terminal 50']).split('\n')
  const after = snapshotEntry('terminal 50', changedTree(BEFORE['terminal 50'], [['"2 doing"', '"3 doing"']])).split('\n')
  expect(after.length).toBe(before.length)
  const changed = before.flatMap((line, i) => (line === after[i] ? [] : [(after[i] ?? '').trim()]))
  expect(changed).toEqual(['{"type":"Text","props":{"color":"inactive"},"children":["3 doing"]},'])
})

test('T-705: a node that fits in the width stays on one line, a bigger one opens up one child per line', () => {
  expect(snapshotText({ type: 'Text', children: ['hi'] })).toBe('{"type":"Text","children":["hi"]}')
  const wide = { type: 'Box', children: ['a'.repeat(WIDTH / 2), 'b'.repeat(WIDTH / 2)] }
  expect(snapshotText(wide)).toBe(`{\n  "type": "Box",\n  "children": [\n    "${'a'.repeat(WIDTH / 2)}",\n    "${'b'.repeat(WIDTH / 2)}"\n  ]\n}`)
})

test('T-705: empty lists and objects, numbers, booleans and null are written as plain JSON', () => {
  expect([snapshotText([]), snapshotText({}), snapshotText(3), snapshotText(true), snapshotText(null)]).toEqual(['[]', '{}', '3', 'true', 'null'])
  expect(snapshotText({ a: undefined, b: 1 })).toBe('{"b":1}')
})

test('T-705: a long string is cut into short pieces joined with + and reads back whole', () => {
  const long = '┃ ' + 'x"\\'.repeat(100) + ' é'
  const text = snapshotText({ children: [long] })
  expect(text.split('\n').length > 2).toBe(true)
  expect(Math.max(...text.split('\n').map(width)) <= WIDTH).toBe(true)
  expect(readBack(text)).toEqual({ children: [long] })
})

test('T-705: a value JSON cannot hold is refused instead of saved as nothing', () => {
  expect(() => snapshotText(undefined)).toThrow("can't be saved")
  expect(() => snapshotText(() => 1)).toThrow("can't be saved")
})

test('T-705: snapshotEntry writes a record entry indented one level and ending in a comma', () => {
  expect(snapshotEntry('mobile T-501', { type: 'Box' })).toBe('  "mobile T-501": {"type":"Box"},')
})
