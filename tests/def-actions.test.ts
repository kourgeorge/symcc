// T-906: defActions (core/page-header.ts) is the one set of rules for which buttons a role or kind page gets (Edit,
// Turn off or on, Reset to built-in, Remove), used by the terminal, desktop, mobile, VS Code and OpenCode pages.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { defActions } from '../hooks/core/page-header'

const BUILT_IN = [{ name: 'general' }, { name: 'tester' }, { name: 'checker' }]
const KINDS = [{ name: 'change' }, { name: 'investigation' }, { name: 'bug' }]

test('T-906: a built-in role can be edited and turned off, not reset or removed', () => {
  expect(defActions('role', 'tester', 'built-in', false, BUILT_IN)).toEqual({ canEdit: true, canReset: false, canRemove: false, canOff: true })
})

test('T-906: a replaced role can be reset; an added one removed', () => {
  expect(defActions('role', 'tester', 'replaced', false, BUILT_IN)).toEqual({ canEdit: true, canReset: true, canRemove: false, canOff: true })
  expect(defActions('role', 'poet', 'added', false, BUILT_IN)).toEqual({ canEdit: true, canReset: false, canRemove: true, canOff: true })
})

test('T-906: the general and checker roles are never turned off here', () => {
  expect(defActions('role', 'General', 'built-in', false, BUILT_IN).canOff).toBe(false)
  expect(defActions('role', 'checker', 'replaced', false, BUILT_IN)).toEqual({ canEdit: true, canReset: true, canRemove: false, canOff: false })
})

test('T-906: a broken role file gets only Reset (a built-in name) or Remove (another name), neither with a bad name', () => {
  expect(defActions('role', 'Tester', undefined, true, BUILT_IN)).toEqual({ canEdit: false, canReset: true, canRemove: false, canOff: false })
  expect(defActions('role', 'poet', undefined, true, BUILT_IN)).toEqual({ canEdit: false, canReset: false, canRemove: true, canOff: false })
  expect(defActions('role', 'bad name', undefined, true, BUILT_IN)).toEqual({ canEdit: false, canReset: false, canRemove: false, canOff: false })
})

test('T-906: the always-on kinds are never turned off; other kinds are', () => {
  expect(defActions('kind', 'change', 'built-in', false, KINDS)).toEqual({ canEdit: true, canReset: false, canRemove: false, canOff: false })
  expect(defActions('kind', 'investigation', 'replaced', false, KINDS)).toEqual({ canEdit: true, canReset: true, canRemove: false, canOff: false })
  expect(defActions('kind', 'bug', 'built-in', false, KINDS).canOff).toBe(true)
  expect(defActions('kind', 'bug', undefined, true, KINDS)).toEqual({ canEdit: false, canReset: true, canRemove: false, canOff: false })
})
