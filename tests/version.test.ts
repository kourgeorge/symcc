// T-404: the plugin's version (from plugin.json, read once through the Host) in the board's titles: the panel's
// title and banner, the band above the prompt and the board as text. No version when plugin.json can't be read.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { ICON } from '../hooks/name'
import { bannerLines, bannerText, boardBrand, boardText, boardTitle, emptyBoard, versionOf } from '../hooks/board'
import { S, loadVersion } from '../hooks/app/state'
import { bandTitle } from '../hooks/claude/ui/above-prompt'

const PLUGIN = '/plugin'
const PLUGIN_JSON = `${PLUGIN}/.claude-plugin/plugin.json`

/** A host with only the plugin's folder and a disk of `files` (path → text); `reads` counts the reads. */
function hostWith(files: Record<string, string>) {
  const reads: string[] = []
  return {
    reads,
    host: {
      plugin: { name: 'symcc', root: PLUGIN },
      fs: {
        read: async (p: string) => {
          reads.push(p)
          if (!(p in files)) throw new Error('no file')
          return files[p]!
        },
      },
    } as never,
  }
}

test('versionOf takes the version from plugin.json text, and gives none for broken text', () => {
  expect(versionOf('{"name":"symcc","version":"0.3.0"}')).toBe('0.3.0')
  expect(versionOf('{"name":"symcc"}')).toBe('')
  expect(versionOf('{ not json')).toBe('')
  expect(versionOf('null')).toBe('')
  expect(versionOf('{"version":3}')).toBe('')
  expect(versionOf('{"version":"0.3.0 with a long story after it"}')).toBe('')
})

test('the version read from plugin.json shows in the panel title, the banner, the band and the text board', async () => {
  const { host, reads } = hostWith({ [PLUGIN_JSON]: '{"name":"symcc","version":"0.3.0"}' })
  await loadVersion(host)
  await loadVersion(host)
  expect(reads).toEqual([PLUGIN_JSON]) // read once
  expect(S.version).toBe('0.3.0')
  expect(boardTitle('/Users/me/repositories/symcc', 'symcc', S.version)).toBe(`${ICON} symcc v0.3.0 · symcc`)
  expect(boardText(emptyBoard(), 0, '~/repositories/symcc', 'symcc', 0, {}, S.version).split('\n')[0]).toBe(`${ICON} symcc v0.3.0 · ~/repositories/symcc`)
  expect(bannerText(bannerLines(emptyBoard(), '/Users/me/repositories/symcc', '/Users/me', true, 80, 0, 'symcc', undefined, S.version)[0]!)).toContain('symcc v0.3.0 · symcc')
  expect(boardBrand('symcc', '0.3.0')).toBe(`${ICON} symcc v0.3.0`)
  expect(bannerLines(emptyBoard(), '/Users/me/repositories/symcc', '/Users/me', true, 80, 0, 'symcc', undefined, S.version)[0]!.parts.some(p => p.text.includes('board'))).toBe(false)
  // the band above the prompt shows no version (T-576)
  expect(bandTitle('/Users/me/repositories/symcc')).toBe(`${ICON} symcc`)
})

test('a missing or broken plugin.json shows no version, and no error', async () => {
  await loadVersion(hostWith({}).host)
  expect(S.version).toBe('')
  expect(boardTitle('/x/symcc', 'symcc', S.version)).toBe(`${ICON} symcc board · symcc`)
  expect(boardText(emptyBoard(), 0, '~/x', 'symcc', 0, {}, S.version).split('\n')[0]).toBe(`${ICON} symcc board · ~/x`)
})

test('a broken plugin.json shows no version', async () => {
  await loadVersion(hostWith({ [PLUGIN_JSON]: '{ "version": ' }).host)
  expect(S.version).toBe('')
  expect(bannerText(bannerLines(emptyBoard(), '/x/symcc', '/x', true, 80, 0, 'symcc', undefined, S.version)[0]!)).toContain('symcc board · symcc')
})

test('a narrow panel drops the version first', async () => {
  await loadVersion(hostWith({ [PLUGIN_JSON]: '{"version":"0.3.0"}' }).host)
  // the banner's first line: 20 columns with the version, 19 without
  expect(bannerText(bannerLines(emptyBoard(), '/x/symcc', '/x', true, 30, 0, 'symcc', undefined, S.version)[0]!)).toBe('symcc v0.3.0 · symcc')
  expect(bannerText(bannerLines(emptyBoard(), '/x/symcc', '/x', true, 19, 0, 'symcc', undefined, S.version)[0]!)).toBe('symcc board · symcc')
})

test('the version is passed in, never shared: with no version given, the titles show none', async () => {
  await loadVersion(hostWith({ [PLUGIN_JSON]: '{"version":"0.3.0"}' }).host)
  expect(boardTitle('/x/symcc')).toBe(`${ICON} symcc board · symcc`)
  expect(boardText(emptyBoard(), 0, '~/x').split('\n')[0]).toBe(`${ICON} symcc board · ~/x`)
  expect(bannerText(bannerLines(emptyBoard(), '/x/symcc', '/x', true, 80)[0]!)).toContain('symcc board · symcc')
})
