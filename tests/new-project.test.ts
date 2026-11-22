// T-795: a new project (a folder with no .symcc/board.json) stays off until the owner runs /symcc-enable. Off means
// plain Claude: no lead prompt, no board updates, tools refuse, the band says so, and nothing is written. A project
// that already has a board still starts on (with or without `enabled`).
import { expect } from 'claude-code/testing'
import { emptyBoard, notSetUpAnswer, offStatusLine, offStatusParts, parseLead, type Board } from '../hooks/board'
import { S, toolName } from '../hooks/app/state'
import { leadGuideText, sessionStart, sessionEnd, toolCall, runCommand } from '../hooks/app/symcc'
import { tellLead, takeBoardUpdate } from '../hooks/app/tell'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'

function world(id: string) {
  const files = new Map<string, string>()
  const opened: string[] = []
  const w = fakeHost({
    fs: memoryFs(files),
    session: { id: async () => id, repo: async () => ({ root: ROOT }), root: async () => ROOT },
    run: async argv => {
      const [cmd, ...rest] = argv
      const args = rest.filter(a => !a.startsWith('-'))
      if (cmd === 'mv') {
        const [from, to] = args as [string, string]
        if (!files.has(from)) return done({ exitCode: 1, stderr: 'No such file' })
        files.set(to, files.get(from)!)
        files.delete(from)
        return done()
      }
      if (cmd === 'rm') for (const a of args) files.delete(a)
      return done()
    },
    ui: { open: (async (a: { id: string }) => (opened.push(a.id), { isPlaced: true })) as never },
  })
  return { ...w, files, opened, lead: `${ROOT}/${S.N.leadFile}`, board: `${ROOT}/${S.N.boardFile}` }
}

test('a session in a folder with no board: no lead prompt, no board update, tools refuse, the band says so, nothing is written', async () => {
  const w = world('a')
  await sessionStart(w.host)
  expect(S.fresh).toBe(true)
  expect(S.driving).toBe(false)
  expect(await leadGuideText(w.host)).toBeUndefined()
  tellLead(w.host, 'something happened')
  expect(w.toLead).toEqual([])
  expect(takeBoardUpdate()).toBeUndefined()
  expect(await toolCall(w.host, toolName('board'), undefined, {})).toEqual({ result: notSetUpAnswer(S.N.name) })
  expect(notSetUpAnswer('symcc')).toBe('symcc is not set up here. The owner can start it with /symcc-enable.')
  expect(w.panel.view()).toMatchObject({ on_here: false, off_here: 'new' })
  expect(offStatusLine('symcc', true, 'new')).toBe('symcc is not set up here · /symcc-enable to start it')
  expect(offStatusParts('symcc', true, 'new').find(p => p.command)?.text).toBe('/symcc-enable')
  expect(w.opened).toEqual([])
  // another command points to /symcc-enable
  expect((await runCommand(w.host, 'symcc-mode', 'review'))?.text).toBe(notSetUpAnswer(S.N.name))
  await sessionEnd(w.host)
  expect([...w.files.keys()]).toEqual([])
})

test('/symcc-enable in a new project creates board.json with symcc on, the session becomes the lead, the panel opens', async () => {
  const w = world('a')
  await sessionStart(w.host)
  const r = await runCommand(w.host, 'symcc-enable', '')
  expect(r?.text).toContain('is on in this project')
  expect(S.fresh).toBe(false)
  expect(w.files.has(w.board)).toBe(true)
  expect((JSON.parse(w.files.get(w.board)!) as Board).enabled).not.toBe(false)
  expect(S.driving).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
  expect(w.opened.length).toBe(1)
  expect(w.toLead.length + (takeBoardUpdate() ? 1 : 0)).toBeGreaterThan(0)
  expect(await leadGuideText(w.host)).toBeDefined()
  expect(w.panel.view()).toMatchObject({ on_here: true })
})

test('a folder with an existing board still starts on, with or without `enabled`', async () => {
  for (const board of [JSON.stringify(emptyBoard()), JSON.stringify((({ enabled: _e, ...rest }) => rest)(emptyBoard()))]) {
    const w = world('a')
    w.files.set(w.board, board)
    await sessionStart(w.host)
    expect(S.fresh).toBe(false)
    expect(S.driving).toBe(true)
    expect(await leadGuideText(w.host)).toBeDefined()
    expect(w.panel.view()).toMatchObject({ on_here: true })
    await sessionEnd(w.host)
  }
})

test('/symcc-enable turns the board on even when another window wrote it with enabled: false meanwhile', async () => {
  const w = world('a')
  await sessionStart(w.host)
  w.files.set(w.board, JSON.stringify({ ...emptyBoard(), enabled: false }))
  const r = await runCommand(w.host, 'symcc-enable', '')
  expect(r?.text).toContain('is on in this project')
  expect((JSON.parse(w.files.get(w.board)!) as Board).enabled).toBe(true)
  expect(await leadGuideText(w.host)).toBeDefined()
  expect(JSON.stringify(await toolCall(w.host, toolName('board'), undefined, {}))).not.toContain('disabled')
})

test('/symcc-enable here in a new-project window with another window on turns this one on as a second lead', async () => {
  const w = world('b')
  await sessionStart(w.host)
  w.files.set(w.board, JSON.stringify(emptyBoard()))
  w.files.set(w.lead, JSON.stringify({ session: 'a', heartbeat: Date.now() }))
  const r = await runCommand(w.host, 'symcc-enable', 'here')
  expect(r?.text).toContain('is on in this project')
  expect(S.offHere).toBe(false)
  expect(S.fresh).toBe(false)
  expect(await leadGuideText(w.host)).toBeDefined()
})

test('/symcc-enable without "here" with another window on stays off here, with its heartbeat running', async () => {
  const w = world('b')
  await sessionStart(w.host)
  w.files.set(w.board, JSON.stringify(emptyBoard()))
  w.files.set(w.lead, JSON.stringify({ session: 'a', heartbeat: Date.now() }))
  const r = await runCommand(w.host, 'symcc-enable', '')
  expect(r?.text).toContain('already runs in another window')
  expect(S.offHere).toBe(true)
  expect(S.beat !== undefined).toBe(true)
})

// T-841: /symcc-enable on a project with a board that is off opens the panel; not with open_on_start off, nor twice
test('T-841: /symcc-enable turning symcc back on opens the panel, unless open_on_start is off or it is open already', async () => {
  const cases: [Record<string, unknown>, boolean, number][] = [[{}, false, 1], [{ open_on_start: false }, false, 0], [{}, true, 0]]
  for (const [extra, isOpen, want] of cases) {
    const w = world('a')
    w.files.set(w.board, JSON.stringify({ ...emptyBoard(), enabled: false, ...extra }))
    const host = { ...w.host, ui: { ...w.host.ui, panes: async () => (isOpen ? [{ id: S.N.pane, title: '', isShown: true, isFocused: false, isPlaced: true }] : []) } } as typeof w.host
    await sessionStart(host)
    w.opened.length = 0
    await runCommand(host, 'symcc-enable', '')
    expect(w.opened.length).toBe(want)
  }
})
