// T-878: helpers that used to be copied by hand: fitSegs (live.ts and task-branch.ts), LIST_TONE (the terminal,
// VS Code and OpenCode lists) and the lead.json read (readLeadText, readLead).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fitSegs, textWidth } from '../hooks/core/width'
import { LIST_TONE } from '../hooks/core/details'
import { leadText } from '../hooks/core/lead'
import { readLead, readLeadText } from '../hooks/app/lead'
import { path } from '../hooks/app/store'
import { S } from '../hooks/app/state'
import { fakeHost, memoryFs } from './fake-host'

test('T-878: fitSegs keeps whole pieces that fit, cuts the one crossing the edge with "…" (its other fields kept), drops the rest', () => {
  const xs = [
    { text: 'abc', tone: 'dim', hit: 1 },
    { text: 'defgh', tone: 'run', hit: 2 },
    { text: 'ij', tone: 'text', hit: 3 },
  ]
  expect(fitSegs(xs, 20)).toEqual(xs)
  expect(fitSegs(xs, 6)).toEqual([xs[0]!, { text: 'de…', tone: 'run', hit: 2 }])
  expect(fitSegs(xs, 3)).toEqual([xs[0]!])
  expect(fitSegs(xs, 0)).toEqual([])
  expect(textWidth(fitSegs(xs, 7).map(x => x.text).join(''))).toBe(7)
})

test('T-878: LIST_TONE: the list colors per status', () => {
  expect(LIST_TONE).toEqual({ backlog: 'inactive', review: 'warning', waiting: 'warning', failed: 'error', doing: 'ide', paused: 'permission', todo: 'text', done: 'success', dropped: 'inactive' })
})

test('T-878: readLeadText and readLead read lead.json, null when it is missing', async () => {
  S.root = '/repo'
  const files = new Map<string, string>()
  const host = fakeHost({ fs: memoryFs(files) }).host
  expect(await readLeadText(host)).toBe(null)
  expect(await readLead(host)).toBe(null)
  const text = leadText('s-1', 1000)
  files.set(path(S.N.leadFile), text)
  expect(await readLeadText(host)).toBe(text)
  expect((await readLead(host))?.session).toBe('s-1')
})
