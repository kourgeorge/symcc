# Research: can the editor extension use an installed symcc, with serve running from one built file?

Step 1 of the store plan for PR #1 (the VS Code and Cursor extension as a client of an installed plugin). Checked on
2026-11-25 on Linux x64, branch `cursor/sdk-host` (base 0.5.41), with `@cursor/sdk` 1.3.1, `@microsoft/copilot-sdk`
2.0.2, Copilot CLI 1.0.115, Claude Code 2.1.321, OpenCode 2.4.0, the Cursor CLI 2026.11.11, Cursor 3.32.4 and VS Code
1.148.0.

The probe bundled the real adapters (`hosts/cursor/sdk.ts` and `hosts/cursor/copilot.ts`) with both SDKs into one file
with esbuild. It ran from `/tmp`, which has no `node_modules` above it. Each run was one agent turn that had to search a
folder for a word with its search tool. `strace` showed which programs each run started.

## Short answer

- **Technically, yes.** Both SDKs run from one built file with no `node_modules`. The Cursor SDK uses the editor's
  ripgrep. The Copilot SDK uses the user's installed `copilot`. Both work on Node 22.14 and on the editor's Node 24.22.1.
- **The Copilot SDK may ship inside symcc.** It and everything it needs are MIT.
- **The Cursor SDK may not.** Its license is "© Anysphere Inc. All rights reserved. Use is subject to Cursor's Terms of
  Service." Nothing grants a right to redistribute it. So `editor/serve.mjs` can't hold it, and decision 2 can't be done
  as written. Section 5 lists the options. None is chosen here.
- **Claude Code and Copilot CLI record installed plugins.** OpenCode has only its config list, a cache folder, or the link
  `scripts/install-opencode.sh` makes.
- **Cursor has plugin marketplaces from git**, with `.cursor-plugin/` manifests. Whether a user can install symcc that way
  isn't checked.

## 1. Can serve run with no node_modules?

### The Cursor SDK

It bundles, with three changes to a plain esbuild run:

- Its chunks load through a computed `import()`. esbuild then takes every file in `dist/esm`, so `.d.ts` and `.map` files
  have to load as empty.
- `bun:sqlite` stays external. On Node the SDK uses `node:sqlite`, which is why it needs Node 22.13 or later.
- Nothing else is native and required.

How it finds ripgrep, in order (`dist/esm/305.js` and the platform-package locator in `dist/esm/index.js`):

1. `CURSOR_RIPGREP_PATH`, if it is absolute.
2. `node_modules/@cursor/sdk-<platform>-<arch>/bin/rg`, in a folder above the script or above the Node binary.
3. `rg` on the `PATH`.

With none of them, the grep tool fails. The agent then tried `rg` and `grep` in the shell (seen in the trace).

Where the editors keep ripgrep, under `vscode.env.appRoot`:

| Editor | Path | Worked |
|---|---|---|
| Cursor 3.32.4 | `node_modules/@cursor/ripgrep-<platform>-<arch>/bin/rg`, also `resources/helpers/rg` | yes |
| VS Code 1.147, 1.148 | `node_modules/@vscode/ripgrep-universal/bin/<platform>-<arch>/rg` | yes |
| older VS Code | `node_modules/@vscode/ripgrep/bin/rg` | not checked |

Cursor already sets `CURSOR_RIPGREP_PATH` for the processes it starts, so serve gets it for free there. In VS Code the
extension has to set it. A test that runs inside Cursor inherits it too: my first "no ripgrep" run still used Cursor's.

The platform package also holds `cursorsandbox` and the tree-sitter natives. Neither is needed:

- Without tree-sitter, the SDK says "shell command analysis is disabled". The agent still ran shell commands.
- Without `cursorsandbox`, the SDK refuses to start only when sandboxing is asked for (`local.sandboxOptions.enabled`, or
  a `~/.cursor/sandbox.json`). symcc asks for neither.

### The Copilot SDK

It bundles, with two changes:

- `copilot.ts` imports the SDK through a variable (`import(COPILOT_SDK)`), so a bundler skips it. The build needs a
  literal import.
- `koffi` is imported at the top of `ffiRuntimeHost.js`, which only the in-process runtime uses. In a one-file ESM build
  that import is hoisted, so `koffi` has to be a stub that throws if it is ever used.

`COPILOT_CLI_PATH=<the user's copilot>` makes the SDK start `copilot --headless --no-auto-update --stdio` from the
user's install. `RuntimeConnection.forSpawnedStdio({ path })` does the same. That CLI brings its own ripgrep. Without
it, the SDK wants its platform package, whose runtime is a 223 MB `runtime.node`.

The SDK and the CLI must speak the same protocol. SDK 2.0.2 accepts protocol 4 only:

- CLI 1.0.115 works.
- CLI 1.0.105 fails with "SDK protocol version mismatch: SDK supports versions 4-4, but server reports version 3."

So a CLI that moves to protocol 5 breaks a built serve until symcc ships a newer SDK. Serve has to pass this message on
plainly.

### Sizes and Node

| Built file | Size | gzip |
|---|---|---|
| both SDKs | 13 MB | 2.4 MB |
| the Copilot SDK only | 1.1 MB | 224 KB |

Cursor 3.29 to 3.32 and VS Code 1.147 and 1.148 all ship Node 24.22.1. Both probes passed on it, with a `PATH` of only
`/usr/bin:/bin`.

## 2. Licenses

| Package | Version | License | May ship inside symcc? |
|---|---|---|---|
| `@cursor/sdk` | 1.3.1 | "© Anysphere Inc. All rights reserved. Use is subject to Cursor's Terms of Service." | no, not without Anysphere's permission |
| `@cursor/sdk-linux-x64` | 1.3.1 | the same | not needed (the editor's ripgrep) |
| `@bufbuild/protobuf` | 1.10.0 | Apache-2.0 and BSD-3-Clause | yes, with notices |
| `@connectrpc/connect`, `@connectrpc/connect-web` | 1.7.0 | Apache-2.0 | yes, with notices |
| `@statsig/js-client`, `@statsig/client-core` | 3.31.0 | ISC | yes, with notices |
| `@microsoft/copilot-sdk` | 2.0.2 | MIT | yes, with notices |
| `vscode-jsonrpc`, `zod`, `lossless-json` | 10.0.0, 4.6.7, 4.3.3 | MIT | yes, with notices |
| `koffi` | 3.3.7 | MIT | not needed (stubbed) |
| `@microsoft/copilot-sdk-linux-x64` | 2.0.2 | MIT in `package.json`; holds the Copilot runtime and QuickJS licenses | not needed (the user's CLI) |
| `undici`, `https-proxy-agent`, `agent-base`, `debug`, `ms` | | MIT | yes, with notices |

The Cursor SDK's README says nothing about bundling. I couldn't read Cursor's Terms of Service, because web fetches are
blocked for this account. A built serve needs a third-party notices file next to it.

## 3. Where each harness records an installed plugin

I installed symcc under a throwaway `HOME`: into Claude Code from this clone, and into Copilot CLI from the clone and from
GitHub. The version is in the copy's `.claude-plugin/plugin.json`; `.github/plugin/plugin.json` has none.

### Claude Code

- Record: `~/.claude/plugins/installed_plugins.json`. Example:
  `{"version":2,"plugins":{"symcc@symcc":[{"scope":"user","installPath":"…/plugins/cache/symcc/symcc/0.5.41","version":"0.5.41","gitCommitSha":"…"}]}}`.
  Each plugin has a list of installs, one per scope.
- Copy: `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. `~/.claude/settings.json` has `enabledPlugins`.
- From a local folder it copies the folder as it is, with untracked `node_modules` (691 MB here).
- Update: `claude plugin marketplace update symcc && claude plugin update symcc@symcc`.

### Copilot CLI

- Home: `$COPILOT_HOME`, else `~/.copilot` (seen in the CLI's code).
- Record: `<home>/settings.json`, with `extraKnownMarketplaces.symcc.source` and `enabledPlugins["symcc@symcc"]: true`.
  The source is `{"source":"github","repo":"kourgeorge/symcc"}` or `{"source":"directory","path":"…"}`. No version or path
  is recorded.
- Copy from GitHub: `<home>/installed-plugins/symcc/symcc/`, with no version in the path. The marketplace is a git clone
  in `$XDG_CACHE_HOME/copilot/marketplaces/kourgeorge-symcc/`.
- From a folder nothing is copied ("It is loaded live from <path>"). The folder is the copy.
- Update: `copilot plugin marketplace update symcc`, then `copilot plugin update symcc@symcc`.

### OpenCode

- `opencode plugin add github:kourgeorge/symcc` adds `"github:kourgeorge/symcc"` to `"plugins"` in
  `$XDG_CONFIG_HOME/opencode/opencode.json` (default `~/.config/opencode`).
- Copy: `~/.cache/opencode/npm/git-symcc-<hash>/<timestamp>/node_modules/symcc/`. No file records this path. The newest
  timestamp is the live one. This machine has a 0.5.30 copy there. It is under `~/.cache` even though `XDG_CACHE_HOME`
  points elsewhere.
- `scripts/install-opencode.sh` makes the link `$XDG_CONFIG_HOME/opencode/plugins/symcc` (or
  `<project>/.opencode/plugins/symcc`) to `<clone>/opencode`. The plugin root is the parent of the link's target.
- Update: `opencode plugin update` for the GitHub install, and `git pull` in the clone for the link.

### Lookup order for the extension

1. `symcc.pluginPath`.
2. Claude Code's `installed_plugins.json`.
3. Copilot CLI's `installed-plugins/symcc/symcc`, and any `directory` source in its `settings.json`.
4. OpenCode's link, then its cache folder.

Then take the newest version whose protocol fits.

## 4. Can Cursor install a third-party plugin?

Partly yes:

- The Cursor CLI has `agent plugin marketplace add <gitUrl> [--git-ref <ref>]`, plus `list`, `remove` and `update`.
  `--plugin-dir <path>` loads a local plugin folder for one run.
- Marketplaces are kept per account on Cursor's side. This account sees `cursor-public` (global) and `__DEFAULT__`
  (team).
- A marketplace has `.cursor-plugin/marketplace.json` (`name`, `owner`, `plugins` with `name`, `source` and
  `description`). A plugin has `.cursor-plugin/plugin.json`: `name`, `version`, `skills`, `agents`, `rules`,
  `commands`, `mcpServers`, and paths through `${CURSOR_PLUGIN_ROOT}`. A GitHub marketplace on this machine ships both
  `.claude-plugin/` and `.cursor-plugin/`.
- Copies: marketplace clones go in `~/.cursor/plugins/marketplaces/<host>/<owner>/<repo>/<sha>/`. Installed plugins go
  in `~/.cursor/plugins/cache/<marketplace>/<plugin>/<sha>/`, next to a `<sha>.installed` file.
  `~/.cursor/plugins/cache/.cloud-plugin-manifest.json` lists sources but not paths, and it misses some plugins.

Not checked:

- whether a user who isn't a team admin can add a marketplace and install from it;
- whether Cursor reads `.claude-plugin/`;
- how updates work.

The docs were blocked, and adding a marketplace would change the account. symcc has no `.cursor-plugin/` today. So Cursor
can't count as an install harness yet. The extension could still look in `~/.cursor/plugins/cache/*/symcc/*/` later.

## 5. What this means for decision 2: the options

The Copilot half of `editor/serve.mjs` can ship. The Cursor half can't be committed. These are the options. They can
be combined, for example A with D.

- **A. Serve fetches the Cursor SDK on first use.** `editor/serve.mjs` holds the Copilot SDK and the open packages. The
  first time a Cursor agent is used, serve downloads `@cursor/sdk` and its five open dependencies from the npm registry
  into a cache, such as `~/.cache/symcc/cursor-sdk/1.3.1/node_modules/`. Versions and sha512 hashes are pinned from
  `package-lock.json`. Serve then imports the SDK from there. The user gets the SDK from Anysphere's own npm release, as
  with `npm install`.
  - Cost: serve needs its own fetch and untar code, because the editor's Node has no npm. It needs the proxy (the
    registry was reachable here through `HTTPS_PROXY`) and a clear offline error.
  - Size: six tarballs, the SDK about 20 MB unpacked.
  - The SDK alone doesn't load: "Cannot find package '@bufbuild/protobuf'". It needs the five others in the same
    `node_modules` (checked).
- **B. A one-time setup command in the plugin.** It runs `npm install --omit=dev` in the installed copy's
  `hosts/cursor`. It is simple, but needs npm. Each harness update replaces the copy, and Claude Code keeps one folder per
  version, so it has to be run again.
- **C. Ask Anysphere for written permission** to ship `@cursor/sdk` inside symcc. Then decision 2 stays as written.
  George would have to ask.
- **D. Ship Copilot only first.** `editor/serve.mjs` holds only the Copilot SDK. Cursor agents say they need the Cursor SDK
  until A, B or C lands.

Separately, the Copilot side depends on the CLI's protocol (section 1). One answer is to show the mismatch message and
the update command. Another is to fetch the matching Copilot runtime package into the same cache, which is over 100 MB.

## 6. Notes for later steps

- `engines.vscode`: Cursor 3.32.4 reports VS Code 1.147.0, and Cursor 3.29 to 3.31 report 1.128.0. All ship Node 24.22.1.
  Not checked: Windsurf (not on this machine), and the first VS Code with Node 22.13 or later (no web access).
- The build changes from sections 1 and 2: load `.d.ts` and `.map` files as empty, keep `bun:sqlite` external, use a
  literal Copilot SDK import, stub `koffi`, and add a notices file.
