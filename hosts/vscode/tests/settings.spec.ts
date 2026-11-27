// The editor extension's settings that choose what runs or where the agents' traffic goes (the symcc copy, the Node,
// the proxy) can't come from a project's .vscode/settings.json: they are "machine" settings, set only in the user's
// own settings. Otherwise opening a repository could run its own code as serve, or send the agents' API keys through
// its proxy.
import { test, expect } from 'bun:test'
import { readFile } from 'node:fs/promises'

const MACHINE_ONLY = ['symcc.pluginPath', 'symcc.nodePath', 'symcc.proxy']

test('the settings that pick the symcc copy, the Node and the proxy are machine settings, not per project', async () => {
  const pkg = JSON.parse(await readFile(new URL('../extension/package.json', import.meta.url), 'utf8')) as {
    contributes: { configuration: { properties: Record<string, { scope?: string }> } }
  }
  const props = pkg.contributes.configuration.properties
  expect(MACHINE_ONLY.map(k => `${k}=${props[k]?.scope ?? 'window'}`)).toEqual(MACHINE_ONLY.map(k => `${k}=machine`))
})

test('the extension does not run in a workspace the owner has not trusted', async () => {
  const pkg = JSON.parse(await readFile(new URL('../extension/package.json', import.meta.url), 'utf8')) as {
    capabilities?: { untrustedWorkspaces?: { supported?: boolean | string } }
  }
  expect(pkg.capabilities?.untrustedWorkspaces?.supported).toBe(false)
})
