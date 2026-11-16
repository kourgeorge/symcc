# Spike: can a symcc daemon beside Codex reach the lead and run workers?

Task T-239. Hands-on checks on 2026-11-16 with Codex CLI 0.163.0
(`/Users/georgekour/.npm-global/bin/codex`; the `codex` on PATH is a cmux wrapper that adds
`--dangerously-bypass-hook-trust`). Follows docs/research/codex-host.md (T-233),
docs/research/host-independence.md (T-234) and docs/research/standalone-cli.md (T-235).

## Short answer

**Go.** A symcc daemon beside Codex can do all four things it needs:

- **Tell the lead something with no typing:** `codex queue --thread <id> --message ...` lands in
  a running interactive (TUI) session. If the lead is idle, a new turn starts by itself in about
  0.5 s. If the lead is busy, the message waits and runs as the next turn.
- **Hand the lead a message at the end of its turn:** a `Stop` hook that returns
  `{"decision":"block","reason":"..."}` makes the lead keep going with that text.
- **Give the lead board tools:** an MCP server works, and it learns the lead's session id from
  each tool call.
- **Run workers:** `codex exec --json` runs them in the background, with events, the final
  answer, early stop and token counts.

Blockers and rough edges (none of them stop the plan):

1. Hooks only run after they are **trusted**: a hash is stored in config.toml under
   `hooks.state."<key>".trusted_hash`, normally set by the owner with `/hooks`. symcc's install
   step would have to ask the owner to trust its hooks once.
2. Workers start slowly: about 10 to 20 s before the first model call.
3. A worker stopped early prints no `turn.failed` event. The daemon has to judge "stopped" from
   the exit code and the missing `turn.completed`.
4. MCP tools need `default_tools_approval_mode = "approve"`, or calls fail when approvals are off.
5. Not confirmed: `turn/steer` (adding to a turn while it runs) through the app-server socket. My
   client hung during the handshake (see below). `codex queue` covers the main need anyway.
6. Every check below used a fake model (see next section). How a real model reacts to these
   messages was not tested.

## How the experiments were run (no tokens)

- The owner's ChatGPT account is at its usage limit until 2026-11-18 09:02. There is no API key,
  and the local Ollama `qwen3-coder` model is too slow to use.
- What worked: a throwaway fake model server (Python, in /tmp) that speaks the Responses API over
  SSE. It answers every request with `ACK: <last user message>` and logs each request. It was set
  up in a temporary `CODEX_HOME` like this:

  ```toml
  model = "fake-model"
  model_provider = "fake"
  approval_policy = "never"
  sandbox_mode = "workspace-write"
  [features]
  apps = false
  [model_providers.fake]
  name = "fake"
  base_url = "http://127.0.0.1:18765/v1"
  wire_api = "responses"
  [projects."/tmp/cxs/work"]
  trust_level = "trusted"
  ```

  The SSE events it sends: `response.created`, `response.output_item.added`,
  `response.output_text.delta`, `response.output_item.done` (an assistant `message` item with
  `output_text`), and `response.completed` (with `usage`). Codex prints the warning "Model
  metadata for `fake-model` not found" but works.
- No copy of `auth.json` was used or left behind. Everything lived in `/tmp/cxs`, which is deleted.
  The tmux server, the fake server and the app-server daemon that Codex started for the temporary
  home were all stopped.

## Experiment 1: telling the running lead something (`codex queue`) - worked

Setup: the TUI ran in a private tmux server:

```
tmux -L cxs new-session -d -s lead -x 160 -y 45 \
  "CODEX_HOME=/tmp/cxs/home /Users/georgekour/.npm-global/bin/codex -C /tmp/cxs/work"
```

The TUI starts its own app-server daemon
(`<CODEX_HOME>/packages/app-server-daemon/releases/0.163.0-aarch64-apple-darwin/bin/codex app-server --listen unix:// --managed-daemon`,
plus `app-server daemon pid-update-loop`). Its socket is
`<CODEX_HOME>/app-server-control/app-server-control.sock`, a link to
`/private/tmp/codex-daemon-501/<hash>`.

Why try 1 got stuck: `tmux send-keys "text" Enter` in one call leaves the text in the input box
(the Enter seems to be read as part of a paste; a guess). Sending `Enter` as a second, separate
`send-keys` call submits it. The owner's first prompt also makes Codex send one extra small model
request to name the session ("Capitalize only the first word ... User prompt: ...").

The session id comes from the hook input (`session_id`) or from the MCP `_meta` (exp 2). Then:

**a) Lead idle:**

```
$ CODEX_HOME=/tmp/cxs/home codex queue --thread 01a1e349-28ef-7631-9e15-e16b990a1903 \
    --message "queued from daemon while idle"
Queued message 01a1e34a-aeee-7452-87a6-acda13101dba for thread 01a1e349-...
(0.17 s total)
```

The TUI showed `› queued from daemon while idle` / `• ACK: queued from daemon while idle`, with no
typing. Queued at 1794814684.75 (epoch seconds), and the model request reached the fake server
at 1794814685.19, so **about 0.45 s**.

**b) Lead busy:** I queued "please run slow work" (the fake server waits 15 s on it), then 3 s
later queued "second queued while busy". The second message was not mixed into the running
turn. It ran as its own turn right after the first turn (and its Stop-hook continuation, see
exp 4) ended: the requests reached the server at 771.2 (slow), 772.6 (Stop hook text) and 773.1
(second message). So the queue is first in, first out, one turn per message.

Limits seen: the message shows up as if the user had typed it (a `›` line), so the lead can't
tell it came from the daemon unless the text says so. `codex queue` needs the session to be
loaded by the app-server daemon. I only tested with the TUI running; queueing for a closed
session was not tested.

**c) `turn/steer` / `turn/start` over the socket: not confirmed.** The app-server schema
(`codex app-server generate-json-schema`) lists `thread/start`, `thread/resume`, `thread/read`,
`thread/list`, `turn/start`, `turn/steer` (needs `threadId`, `expectedTurnId`, `input`),
`turn/interrupt`, `hooks/list`, and a `thread/queue/changed` notification. `thread/queue/add`
(used by `codex queue`) is not in the normal schema, so it is probably experimental (a guess).
A JSON-RPC client over plain `codex app-server` (stdio) worked (`hooks/list`, below). The same
client through `codex app-server proxy` (stdio to the daemon socket) hung after `initialize`, and
I stopped it. I did not find out why. The time ran out before I could try further.

## Experiment 2: a tiny MCP server (worked under `codex exec`, try 1)

- The tool shows up to the model in the namespace `mcp__spike`, tool `board`.
- It needs `mcp_servers.<id>.default_tools_approval_mode = "approve"` in config. Without it the
  call fails with "MCP tool call requires approval, but approval policy is never".
- Every `tools/call` carries `_meta.x-codex-turn-metadata` with `session_id` / `thread_id`, so the
  server learns the lead's session id from its first call. That is the id `codex queue --thread`
  needs.
- The owner's ChatGPT login loads connected apps as extra tools; `features.apps = false` turns
  them off.
- Not tested: whether the same server process stays up across many TUI turns (Codex starts stdio
  MCP servers per session, so it most likely does, but this is a guess). A daemon can also run
  on its own and offer MCP over HTTP, so this doesn't block anything.

## Experiment 3: workers with `codex exec --json` (worked, try 1 and again here)

- Command shape: `codex exec --json -s workspace-write -C <worktree> -o <file> "<task>"`.
- Events on stdout (one JSON object per line), as seen in this try:

  ```
  {"type":"thread.started","thread_id":"01a1e347-fa84-73a0-9133-a96540af7202"}
  {"type":"turn.started"}
  {"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"ACK: hello lead"}}
  {"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":0,
    "cache_write_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":0}}
  ```

- `-o <file>` holds the final answer.
- Without `< /dev/null`, `codex exec` prints "Reading additional input from stdin..." and waits
  for stdin, so a daemon should close stdin.
- Stopping early: SIGINT ends it with exit 1. SIGTERM gave exit 0, but that was read through the
  wrapper, so it is unconfirmed. No `turn.failed` event is printed either way.
- Startup: about 20 s before the first model call in try 1, and 11 s for a whole run here.

## Experiment 4: hooks - worked, and the Stop hook is a second way in

Events, from https://learn.chatgpt.com/docs/hooks: `SessionStart`, `SessionEnd`, `SubagentStart`,
`SubagentStop`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreModelRequest`,
`PostModelRequest`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `Stop`, `Interrupt`. Hook
types are `command` and `mcp_tool`. Async hooks deliver their output "at the next safe point".
From the same page: hooks go in `hooks.json` or `[hooks]` in config.toml. A hook gets one JSON
object on stdin (`session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `turn_id`,
`permission_mode`, plus `prompt` for UserPromptSubmit and `stop_hook_active` /
`last_assistant_message` for Stop). Text a UserPromptSubmit hook prints to stdout is added as
developer context. For Stop, `decision: "block"` "tells Codex to continue", using `reason` as
the new prompt.

What I ran: `<CODEX_HOME>/hooks.json`:

```json
{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"/tmp/cxs/hook.sh"}]}],
          "Stop":[{"hooks":[{"type":"command","command":"/tmp/cxs/stop.sh"}]}]}}
```

`hook.sh` appends its stdin to a log (standing in for "call the daemon"). `stop.sh` does the
same, and if `/tmp/cxs/inbox` has text, it prints `{"decision":"block","reason":"<text>"}` and
deletes the inbox.

- **Trust.** New hooks are skipped until trusted. `hooks/list` over `codex app-server` (stdio)
  shows each one with `key`, `currentHash` and `trustStatus: "untrusted"`, e.g. key
  `/private/tmp/cxs/home/hooks.json:stop:0:0`, hash `sha256:92c1...`. Adding this to config.toml
  trusted them (the same thing `/hooks` stores):

  ```toml
  [hooks.state."/private/tmp/cxs/home/hooks.json:stop:0:0"]
  trusted_hash = "sha256:92c1fd942b5ab0aacdf4205189b393f4b3e0ee4327ecdab1eeb6343581352c1e"
  ```

  I did not use `--dangerously-bypass-hook-trust`.
- **UserPromptSubmit** ran in both `codex exec` and the TUI. It also ran for messages that came
  in through `codex queue`, with the right `session_id` and `turn_id`.
- **Stop** ran in the TUI after each turn. With text in the inbox, the TUI showed
  `• Blocked by hook └ DAEMON SAYS: task T-1 finished`, and the lead got a new turn with input
  `<hook_prompt hook_run_id="stop:1:/private/tmp/cxs/home/hooks.json">DAEMON SAYS: task T-1 finished</hook_prompt>`
  1.4 s after the first turn's request. So a daemon can leave news in a file (or answer an HTTP
  call from the hook), and the lead picks it up when its turn ends.
- **Stop did not run under `codex exec`** in my one test (no log line, nothing in the session
  file). That matters only if workers were meant to use it.
- Errors show in the TUI as `• Hook failed └ hook exited with code 127` (or 126 for a file that
  isn't executable).

## What I couldn't run

- Anything with a real model (account at its limit, no API key).
- `turn/steer` / `turn/start` through the daemon socket (client hung, cause unknown).
- `codex queue` for a session that is not open in a TUI.
- SessionStart, PreToolUse and the `mcp_tool` hook type (only UserPromptSubmit and Stop tested).

## Recommended next step

Build a small Codex daemon prototype on these pieces:

- **Tools for the lead:** an MCP server with the board tools.
- **Workers:** `codex exec --json -C <worktree> -o <file>` with stdin closed. Read `turn.completed`
  for token usage, and use the exit code to tell "finished" from "stopped".
- **News to the lead:**
  - `codex queue --thread <session id>` when the lead is idle. The session id comes from the
    MCP `_meta` or the UserPromptSubmit hook.
  - The Stop hook, to add news at the end of the lead's turn.
  - A UserPromptSubmit hook, to add a board summary as context to each prompt.
- **Install step:** write the hooks and their `hooks.state` trust entries only with the owner's
  OK, or point the owner to `/hooks`.

Before building, repeat exp 1 once with a real model when the limit resets (2026-11-18). This
checks that the lead acts sensibly on queued and Stop-hook messages.
