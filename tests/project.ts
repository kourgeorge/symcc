// The project folder for a test (T-274): path() refuses an empty root, so a test that runs the plugin's
// hooks gives the session a folder, and a test that calls plugin code directly sets S.root.
import type { On } from 'claude-code'
import { S } from '../hooks/plugin/state'

/** The folder the tests use as the project. */
export const PROJECT = '/proj'

const given = new WeakSet<On>()

/** Lets the plugin find its project folder from the session (as findRoot does after a reload). Once per test: a second call does nothing. */
export function inProject(on: On, root = PROJECT) {
  if (given.has(on)) return
  given.add(on)
  on('session.root', () => ({ value: root }) as never)
}

/** For a test that calls plugin code directly, without its hooks: sets the project folder in the plugin's state. */
export function setRoot(root = PROJECT) {
  S.root = root
}
