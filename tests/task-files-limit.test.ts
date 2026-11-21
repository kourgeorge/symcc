// T-713: a task's files were silently cut at 30, so allowFiles said "allowed" for a file it dropped.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { addTask, allowFiles, cleanFiles, emptyBoard, find, patchTask } from '../hooks/board'

const NOW = new Date().toISOString()
const many = (n: number) => Array.from({ length: n }, (_, i) => `src/f${i}.ts`)

test('T-713: addTask with 31 files keeps all 31', () => {
  const [, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'big', files: many(31) }, NOW)
  expect(t.files.length).toBe(31)
  expect(t.files).toEqual(many(31))
  expect(cleanFiles(many(250)).length).toBe(250)
})

test('T-713: allowFiles on a task with 30 files adds the asked file and says so', () => {
  const [b0, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'big', files: many(30) }, NOW)
  const b1 = patchTask(b0, t.id, { status: 'waiting', asked_files: ['src/f30.ts'] }, NOW)
  const b2 = allowFiles(b1, t.id, NOW)
  const after = find(b2, t.id)!
  expect(after.files.length).toBe(31)
  expect(after.files.includes('src/f30.ts')).toBe(true)
  expect(after.status).toBe('todo')
  expect(after.history[after.history.length - 1]!.text.includes('+ src/f30.ts')).toBe(true)
})

test('T-713: allowFiles refuses asked files a task cannot hold: no "allowed" line, still waiting', () => {
  for (const bad of ['.symcc/x.md', '.git/config', '.git', '../x.ts', '/abs.ts', '.']) {
    const [b0, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'guarded', files: ['src/a.ts'] }, NOW)
    const b1 = patchTask(b0, t.id, { status: 'waiting', asked_files: ['src/b.ts', bad] }, NOW)
    let said = ''
    try {
      allowFiles(b1, t.id, NOW, '.symcc')
    } catch (e) {
      said = (e as Error).message
    }
    expect(said.includes(`Can't allow ${bad} for ${t.id}`)).toBe(true)
    const still = find(b1, t.id)!
    expect(still.status).toBe('waiting')
    expect(still.files).toEqual(['src/a.ts'])
    expect(still.history.some(l => l.text.startsWith('the owner allowed files'))).toBe(false)
  }
})

test('T-713: allowFiles writes the cleaned names it really added', () => {
  const [b0, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'dot', files: ['src/a.ts'] }, NOW)
  const b1 = patchTask(b0, t.id, { status: 'waiting', asked_files: ['./src/b.ts'] }, NOW)
  const after = find(allowFiles(b1, t.id, NOW, '.symcc'), t.id)!
  expect(after.files).toEqual(['src/a.ts', 'src/b.ts'])
  expect(after.history[after.history.length - 1]!.text).toBe('the owner allowed files: + src/b.ts')
})

test('T-713: change widening a task past 30 files keeps them all', () => {
  const [b0, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'big', files: many(30) }, NOW)
  const b1 = patchTask(b0, t.id, { files: many(40) }, NOW)
  expect(find(b1, t.id)!.files).toEqual(many(40))
})
