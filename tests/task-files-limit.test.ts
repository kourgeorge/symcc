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

test('T-713: change widening a task past 30 files keeps them all', () => {
  const [b0, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'big', files: many(30) }, NOW)
  const b1 = patchTask(b0, t.id, { files: many(40) }, NOW)
  expect(find(b1, t.id)!.files).toEqual(many(40))
})
