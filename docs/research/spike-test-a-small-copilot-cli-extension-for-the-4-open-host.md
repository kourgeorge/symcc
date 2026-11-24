# Research: a small Copilot CLI extension for the 4 open host questions

Task T-955 (a spike: a short hands-on test). Tested with GitHub Copilot CLI 1.0.114 and a
small throwaway extension. It follows the Copilot host plan from T-953.

## The question

Can a Copilot CLI extension do the four things a symcc host needs?

1. Add tools and slash commands.
2. Guard tool calls (block edits and shell commands that a task may not do).
3. Wake an idle lead with a message.
4. Start worker sessions in a git worktree, each with its own guard, and know when they finish.

## Short answer

Yes, all four work in Copilot CLI 1.0.114. Tools and slash commands work, the deny guard
blocks edits and shell calls, a timer message wakes an idle lead, and a child session can run
in a git worktree with its own guard and report when it is done.

One catch: the default `new CopilotClient()` crashes inside an extension. It only works when
you tell it to start a separate copilot process
(`RuntimeConnection.forSpawnedStdio({ path: process.execPath })`).

The T-953 plan still holds.

## How it was found

The spike took two tries. The first try installed everything and read the SDK, but could not
run anything until the owner logged in to Copilot. The second try ran all four tests.

### Setup

- CLI: `@github/copilot` 1.0.114, installed with `npm install @github/copilot@latest` into
  /tmp/t955/cli. It installs one native binary, `@github/copilot-darwin-arm64/copilot`
  (193 MB). A wrapper, /tmp/t955/cp.sh, set HOME, COPILOT_HOME and COPILOT_CACHE_HOME under
  /tmp/t955/home and turned off auto-update.
- Login: without a login, `copilot -p ...` stops with "No authentication information found",
  and the extension never starts. The owner logged in with `cp.sh login` (a device-code login).
- SDK: extensions don't need to install it. The CLI ships its own copy (here under
  /tmp/t955/home/cache/pkg/darwin-arm64/1.0.114/copilot-sdk/). Its docs/extensions.md says
  "The `@microsoft/copilot-sdk` import is resolved automatically — you don't install it". The
  flag `--extension-sdk-path` can swap in another copy.
- SDK name and version: the old `@github/copilot-sdk` (1.0.34) is marked deprecated with
  "migrate to @microsoft/copilot-sdk". The current `@microsoft/copilot-sdk` is 2.0.1, with
  breaking changes in v2:
  - tools are now `tools: {definitions: [...]}`;
  - hooks are now `hooks: {handlers: {...}}`;
  - `CopilotClient` needs `mode: "coding-agent" | "empty"`;
  - permission handling moved to `permissions: {onRequest}`.

  The old flat forms are still converted for you (`dist/optionsCompatibility.js`), but the
  SDK's own docs/extensions.md still shows the old form.
- Extensions are experimental: `copilot help extensions` says "Extensions are experimental:
  start the CLI with --experimental, or run /settings experimental on." With `-p`, project
  extensions are skipped unless `GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS=true`, but user and
  plugin extensions still load.
- Plugin: /tmp/t955/plugin, with plugin.json `"extensions": "extensions"` and the code in
  extensions/symspike/extension.mjs. `cp.sh plugin install /tmp/t955/plugin` printed
  `Plugin "symspike" installed successfully.`, and config.json shows `source: local`. The
  extension started in every session, both interactive and `-p`.
  - The install warned: "Direct plugin installs (repos, URLs, local paths) are deprecated. Only
    plugin@marketplace installs will be supported in a future release." So symcc should ship a
    marketplace file (`.github/plugin/marketplace.json`).
  - Installing from GitHub was not tested. `copilot plugin install --help` lists `owner/repo`,
    `owner/repo:path` and git URLs as sources.
- A scratch git repo at /tmp/t955/repo, with a worktree at /tmp/t955/wt (branch w1).
- Interactive tests ran through a small pty driver (/tmp/t955/drive.py). The extension wrote
  everything it did to /tmp/t955/ext.log.

### 1. Tools and commands: yes

- Tool: `-p "Call the spike_ping tool with word 'banana'…" --allow-all-tools --output-format json`
  ran the handler and returned `"pong banana from pid 25148"`. The model's tool list had
  `spike_ping` and `spike_worker` next to the built-in tools (bash, apply_patch, view, rg,
  glob, task, …).
- Command: in the interactive CLI, typing `/spike hello there` called the handler with
  `{"command":"/spike hello there","commandName":"spike","args":"hello there"}`.
  `session.log(...)` showed up in the timeline as
  "● symspike: /spike ran with args "hello there"".
- Surprise: in `-p` mode, `/spike hello world` is not treated as a command. It goes to the
  model as plain text, although the `commands.changed` event lists the commands. Slash
  commands only work interactively.

### 2. Guard: yes

- `onPreToolUse` returned
  `{ permissionDecision: "deny", permissionDecisionReason: "symcc guard (lead): …" }`. It
  blocked both kinds of call, even with `--allow-all-tools`:
  - an edit: `apply_patch` with `*** Add File: blocked.txt`;
  - a shell call: `bash {"command":"echo BLOCKME > shell-out.txt"}`.
- Neither file was created.
- What the model sees: the tool fails with
  `{"success":false,"error":{"message":"Denied by preToolUse hook: symcc guard (lead): this path or command is not allowed for this task","code":"denied"}}`.
  The model passed that text on and stopped trying.
- Surprise for the guard code: `apply_patch` arguments are one raw patch string, not an object
  with a path. The guard has to read the `*** Add File:` / `*** Update File:` lines itself.
  The bash call's `tool.execution_start` event carries
  `shellToolInfo: {possiblePaths:[...], hasWriteFileRedirection:true}`, but the hook input
  only has `toolName` and `toolArgs`.

### 3. Waking the lead: yes, both modes

- `enqueue`: 20 s after start, with the session idle,
  `session.send({prompt, mode:"enqueue", source:"automation-symspike"})` returned a message
  id. About 1 s later a new turn started on its own (`user.message`, then
  `assistant.turn_start`), and the model replied "AWAKE".
- `immediate`: sent from a timer at 14 s, while the model was working through five `sleep 4`
  shell calls. It did not cut off the shell call that was running. It was delivered at the
  next tool boundary, about 3 s later (the log showed `"delivery": "steeri…"`, cut off,
  probably "steering"). The model dropped the rest of the work and replied "INTERRUPTED".
- Environment variables set when starting the CLI did reach the extension. The docs say
  "sensitive" ones like `GITHUB_TOKEN` are removed unless the extension asks for them with
  `requestedEnvironmentVariables`.

### 4. Worker sessions: yes, with one catch

- How `joinSession` connects (`dist/extension.js`): it builds a private `CopilotClient` that
  talks to the parent CLI process, then calls
  `resumeSessionForExtension(process.env.SESSION_ID)`. That client is not exposed, so a worker
  session needs a second `CopilotClient`.
- The plain `new CopilotClient({mode:"coding-agent"})` fails inside the extension:
  `Error: Cannot find the native Koffi module; did you bundle it correctly?` (from
  `startInProcessFfi`). The default connection (`RuntimeConnection.forInProcess`) loads a
  native library, and that doesn't work in an extension.
- What works: `runtime: RuntimeConnection.forSpawnedStdio({ path: process.execPath })`. Here
  `process.execPath` is the copilot binary itself
  (/private/tmp/t955/cli/node_modules/@github/copilot-darwin-arm64/copilot). Then
  `client.createSession({ workingDirectory: "/tmp/t955/wt", systemMessage:{mode:"append",content:…}, tools:{excludedTools:["web_fetch"]}, permissions:{onRequest: approveAll}, hooks:{handlers:{onPreToolUse: guard("worker")}} })`,
  followed by `child.send({prompt})`. The worker ran its turns, so the first try's worry (could
  a second client log in from inside the extension?) did not come true.
- What was seen:
  - `pwd` printed `/private/tmp/t955/wt`.
  - The allowed write (`printf 'hi' > hello.txt`) landed only in the worktree
    (`?? hello.txt`), not in the main repo.
  - The blocked write was denied by the worker's own guard ("symcc guard (worker)").
  - `session.idle` fired when the worker finished, about 25 s after it started.
- The lead's guard never fired for the worker's tools, so each session has its own guard.
- The worker's process did not load the symspike extension again (no loop), and no processes
  were left behind afterwards.
- The `model` option was not tested; the worker used Copilot's automatic choice
  (mai-code-2-flash).

### Extras

- `/model` lists:
  - Copilot Fusion (automatic choice);
  - gpt-6.2-sol/astra, gpt-6.1-sol/terra, gpt-6-sol/luna/astra, gpt-5.6-sol/terra/luna,
    gpt-5.3-codex;
  - claude-sonnet-5.5/5/4.6, claude-fable-5.2/5.1/5, claude-opus-5.5/5/4.8/4.8-fast,
    claude-haiku-5.5;
  - local Ollama models (qwen3-coder:30b-a3b-q8_0, qwen3.8:27b).
- The test account is on Copilot Free: "Your Copilot Free plan currently includes only Copilot
  Fusion", and the High and Max tiers are marked unavailable. Every run used mai-code-2-flash,
  so choosing a model for each worker could not be tested.
- The docs say extensions restart on `/clear` or when the session is replaced. symcc's lead
  state must live on disk, not in the extension's memory.
- The first interactive start asks "Confirm folder trust". `--trust-folder` only works with
  `-p`.
- The login token was saved as plain text in /tmp/t955/home/.copilot/config.json
  (`authTokens`), so it may not be in the macOS keychain (the keychain was not checked).
  Deleting /tmp/t955 removes the token.

### The extension code

The full file was /tmp/t955/plugin/extensions/symspike/extension.mjs (about 70 lines). The
parts that matter:

```js
import { joinSession } from "@microsoft/copilot-sdk/extension";
import { CopilotClient, RuntimeConnection, approveAll } from "@microsoft/copilot-sdk";
const guard = (who) => async (input) => { const a = JSON.stringify(input.toolArgs ?? {});
  if (/blocked|BLOCKME/.test(a)) return { permissionDecision: "deny", permissionDecisionReason: `symcc guard (${who}): …` }; };
session = await joinSession({ tools: { definitions: [{ name: "spike_ping", parameters: {...}, skipPermission: true, handler }] },
  commands: [{ name: "spike", description: "…", handler: async (ctx) => session.log(`… ${ctx.args}`) }],
  hooks: { handlers: { onPreToolUse: guard("lead") } } });
setTimeout(() => session.send({ prompt: "…AWAKE.", mode: "enqueue", source: "automation-symspike" }), 20000);
// worker:
const client = new CopilotClient({ mode: "coding-agent", runtime: RuntimeConnection.forSpawnedStdio({ path: process.execPath }) });
const child = await client.createSession({ workingDirectory: dir, systemMessage: {mode:"append",content:"…"}, permissions: { onRequest: approveAll }, hooks: { handlers: { onPreToolUse: guard("worker") } } });
child.on((e) => { if (e.type === "session.idle") session.log("worker finished"); });
await child.send({ prompt: "…" });
```

## Not checked

- Installing from GitHub, and loading inside VS Code's Copilot.
- Choosing a model for each worker (not possible on the Free plan).
- Workers or extensions surviving `/clear`.
- Whether `enqueue` sent while the lead is busy waits for the end of the turn.

## Does the T-953 plan hold?

Yes. The main plan works: a `hooks/copilot/` adapter as an extension, the lead woken with
`session.send`, and workers as SDK child sessions with their own guard. The `copilot -p`
runner is still a good fallback: the extension and its guard also load in `-p` mode, and
`--output-format json` gives a clean event stream. Its limit is that slash commands don't work
there.

Two changes to the plan: extensions need the experimental setting (`--experimental` or
`/settings experimental on`), and symcc should ship a marketplace file, since direct plugin
installs are deprecated.

## Suggested first build tasks

1. **Copilot host core:** `hooks/copilot/host.ts`, `tools.ts` and `lead.ts`. Register symcc's
   tools and the `/symcc` commands through `joinSession`, show board text with `session.log`,
   and wake the lead with `session.send` (`enqueue` normally, `immediate` for urgent notes).
   Lead state lives on disk because `/clear` restarts the extension.
2. **Copilot guard:** `hooks/copilot/guard.ts`. Map `onPreToolUse` to symcc's file and shell
   rules, including reading the file paths out of `apply_patch` patch text. Test it on the
   fake host.
3. **Copilot agents:** workers, checkers and scouts as child sessions through
   `RuntimeConnection.forSpawnedStdio({ path: process.execPath })`, each in its own worktree
   with its own guard. Watch `session.idle` and `session.error` to know when an agent ends,
   and stop the client after.
4. **Bundle and install:** a script that builds a single `extension.mjs` plus the plugin
   manifest (and a marketplace file), so the plugin installs with
   `copilot plugin install owner/repo:path` or from a marketplace.
5. **Fallback runner and band:** a `copilot -p … --output-format json` runner in
   `hooks/process/`, and a statusLine script for the band.

Before task 3, check choosing a model for each worker on a paid Copilot plan.
