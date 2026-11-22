import { expect, test } from 'claude-code/testing'
import { MODES, SCOUT_FINDINGS_CHOICES, TESTS_WITH_CHANGES_CHOICES, cantPlayNotify, settingChoices } from '../hooks/board'

test('settingChoices gives the pick list of each kind of setting, [] for on/off and typed ones', () => {
  expect(settingChoices('mode')).toEqual([...MODES])
  expect(settingChoices('scout_findings')).toEqual([...SCOUT_FINDINGS_CHOICES])
  expect(settingChoices('tests_with_changes')).toEqual([...TESTS_WITH_CHANGES_CHOICES])
  // notify: only what this machine can play, off when it can play nothing (or nothing is known)
  expect(settingChoices('notify', ['sound 1', 'sound 2', 'sound 3', 'off'])).toEqual(['sound 1', 'sound 2', 'sound 3', 'off'])
  expect(settingChoices('notify', [])).toEqual(['off'])
  expect(settingChoices('notify')).toEqual(['off'])
  expect(settingChoices('enabled')).toEqual([])
  expect(settingChoices('max_parallel')).toEqual([])
  expect(settingChoices('test_commands')).toEqual([])
  // a copy each time: changing it does not change MODES
  settingChoices('mode').push('x')
  expect(MODES).toEqual(['paused', 'review', 'auto'])
})

test('cantPlayNotify is true only when notify is set to something this machine does not list', () => {
  expect(cantPlayNotify({ notify_now: 'sound 2', notify_choices: ['off'] })).toBe(true)
  expect(cantPlayNotify({ notify_now: 'sound 2', notify_choices: ['sound 1', 'sound 2', 'sound 3', 'off'] })).toBe(false)
  expect(cantPlayNotify({ notify_now: 'sound 2' })).toBe(false)
  expect(cantPlayNotify({ notify_choices: ['off'] })).toBe(false)
  expect(cantPlayNotify({})).toBe(false)
})
