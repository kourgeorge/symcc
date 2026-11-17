# Research: can symcc start each worker in a sandbox that only lets it write inside its own folder?

Kept from task T-357 (3 tries). This note holds the final, combined answer.

## The question
Can symcc start each worker so that it can only write inside its own worktree folder?

## Short answer
On macOS and Linux (including WSL2), yes. Both were tested. On native Windows, not yet in a way to trust: the only tool that does it there is an "alpha" and needs an admin install, and it could not be tested. Claude Code's own sandbox does not work on native Windows either. Its docs say: "On native Windows, Claude Code runs commands unsandboxed."

The way that works (called "(A)"): symcc's `tool.call` hook rewrites each worker's Bash command so it runs inside an operating-system sandbox. Only the worker's own folder (plus a few git and temp paths) can be written.
- **macOS:** wrap with `/usr/bin/sandbox-exec`. Tested in a real Claude Code session.
- **Linux and WSL2:** wrap with `bwrap` (bubblewrap). Tested in a Linux container: the same escape attempts were all blocked.
- **One tool for every OS:** Anthropic's `srt` (`@anthropic-ai/sandbox-runtime`) can do the wrapping on all three systems with one settings file per worker. Tested on macOS and Linux. Linux has one gap the Mac doesn't, in how tightly git branches can be locked down (section 3).

## 1. Claude Code's own Bash sandbox (why it doesn't fit as it is)
Sources: https://code.claude.com/docs/en/sandboxing, and Claude Code 2.1.319 on a Mac.

**What it limits:**
- Bash, PowerShell and Monitor commands, and the processes they start.
- **Writes:** only the working folder, `--add-dir` folders and a per-user temp folder.
- **Reads:** almost everything is readable.
- **Network:** goes through a proxy with an allow list.
- **Not covered:** Read/Edit/Write, web tools, hooks, MCP servers.

**How to turn it on:**
- one session: `--settings '{"sandbox":{"enabled":true}}'`
- one project: `/sandbox`
- every project: `~/.claude/settings.json`

**Operating systems (docs):**
- "The sandbox runs on macOS, Linux, and WSL2. On native Windows, Claude Code runs commands unsandboxed."
- **macOS:** uses Seatbelt (built in).
- **Linux and WSL2:** uses `bubblewrap` and `socat`. WSL1 is not supported.
- **Ubuntu 24.04 and later:** AppArmor may block bubblewrap until you add a profile or change a sysctl setting.

**Why it doesn't fit symcc:**
- **No per-worker setting.** Subagents "use the same sandbox configuration". `$.agent.spawn` takes only `prompt`, `description`, `subagentType`, `model`, `name` and `cwd` (`.claude-plugin/types/claude-code/index.d.ts:251`). `permissionMode` is fixed to the parent's (`index.d.ts:325-329`).
- **Wrong folder.** The lead's working folder is the main checkout, and worktrees live inside it (`${S.root}/.symcc/worktrees/<id>`, `hooks/plugin/git.ts:138`). A session-wide sandbox would still let workers write anywhere in the main checkout.

## 2. Way (A) on macOS: tested end to end
**Setup:**
- A throwaway plugin in a real `claude -p --plugin-dir` session.
- Its `agent.spawn` hook set `cwd` to the worktree.
- Its `tool.call` hook wrapped Bash only when `e.agentId` was set:
```ts
on('tool.call', async ($, e, next) => {
  if (e.tool !== 'Bash' || !e.agentId) return next(e)
  return next({ ...e, command: `/usr/bin/sandbox-exec -f ${PROFILE} /bin/zsh -c ${sq(e.command)}` })
})
```

**The profile allowed writes only in:**
- the worktree
- `.git/objects` and `.git/worktrees/w1`
- that branch's ref file, its `.lock` and its ref log
- the real `$TMPDIR`
- `/dev/null`, `/dev/zero`, `/dev/tty*` and `/dev/fd/*`

**Refused (`operation not permitted`):**
- a write through `../../a.txt`
- a write to a path built with base64
- a write through a symlink
- `node` writing into the main checkout
- a write to a plain full path
- `git -C <root> branch -f main`
- `touch /tmp/x`

**Worked:**
- writes in the worktree
- `git commit` (lands on the worker's branch)
- `npm test`
- `mktemp`
- the network (the profile didn't limit it)
- the main session's own Bash, which was not wrapped

symcc's own suite (`claude plugin test .`) passed 865 of 865 under a profile that allowed only the folder plus `$TMPDIR`.

**Side effects:**
- `cd` doesn't carry over to the next call.
- The owner's shell aliases are gone.
- `ps` is blocked (setuid programs).
- Every `git commit` prints a harmless `Unable to create '.git/packed-refs.lock'`. The commit still succeeds. Allowing that one literal file removes the message.
- The global git hook could not write its log under `~/.cache`.

**The permission check sees the wrapped command:**
- `tool.check` runs after `tool.call` (`index.d.ts:4171`).
- So allow rules like `Bash(npm test:*)` stopped matching, and the wrapped command got "ask", which is a refusal when there is no one to ask.
- **Fix (tested):** remember wrapped to original, and answer `tool.check` with `$.tool.check({tool:'Bash', input:{command: original}})` (`index.d.ts:3190`).
  - **Catch:** that check judges relative paths against the main checkout, so make them absolute against the worktree first.
- symcc's `bashOutsideFolder` (run from `tool.check`, `hooks/register.tsx:264`) should move to `tool.call` and run on the original command.

**When Claude Code's own sandbox is also on:** the wrapped command fails, with exit 71 and `sandbox-exec: sandbox_apply: Operation not permitted`, because one Seatbelt sandbox can't be nested in another. `$.settings.read({key:'sandbox'})` shows `enabled:true`, so symcc can detect this and skip wrapping.

## 3. Linux: tested
**Setup:**
- Debian stable in a podman container (`--privileged`, so bubblewrap could create its namespaces).
- bubblewrap 0.11, git 2.47.3, node 20.19.2.
- Run once as root and once as a normal user.
- Same layout as symcc: the worktree at `.symcc/worktrees/w1`, on branch `symcc/w1`.
- The wrapper:
```
bwrap --ro-bind / / --dev /dev --proc /proc --unshare-pid \
  --bind $W $W --bind $G/objects $G/objects --bind $G/worktrees/w1 $G/worktrees/w1 \
  --bind $G/refs/heads/symcc $G/refs/heads/symcc --bind $G/logs/refs/heads/symcc $G/logs/refs/heads/symcc \
  --tmpfs /tmp --chdir $W -- /bin/bash -c "<command>"
```

**Results:**

| Worker command | Result |
|---|---|
| `pwd` | the worktree |
| write in the worktree | works |
| `echo x > ../../../a.txt` | `Read-only file system` |
| write to a base64-built path into main | `Read-only file system` |
| symlink to main, then write | refused |
| `node` `writeFileSync` into main | refused (child processes are covered) |
| `echo hi > ~/x.txt` | refused |
| `git add && git commit` | works and lands on `symcc/w1`. Prints the same harmless `packed-refs.lock` message |
| `git -C <root> branch -f other HEAD` | refused (`cannot lock ref`) |
| `git update-ref refs/heads/other HEAD` | refused |
| `mktemp`, `touch /tmp/x`, node `os.tmpdir()` | work (a private /tmp per command) |
| `ps` | works (unlike macOS) |
| `git branch -f symcc/w2 HEAD` | **worked: a worker could move another symcc task's branch** |

Afterwards, `a.txt` and `main` in the main checkout were unchanged.

**The Linux gap, and why it exists:** bubblewrap can only open existing files and folders for writing. Git writes a new `<branch>.lock` file next to the ref, and that file doesn't exist beforehand. So symcc must open the whole `.git/refs/heads/symcc/` folder, which also covers the other workers' branches. `main` and other non-symcc branches stay safe. macOS has no such gap, because there the profile can name the not-yet-existing lock file (and in the `srt` test below, `symcc/w2` was refused). This is a smaller hole than today's, and the merge-time scope check already runs per branch. Still, it is a real difference.

**Linux catches (from the docs and the srt README; not all tested):**
- `bwrap` must be installed. It is not there by default on every distro.
- On Ubuntu 24.04 and later, AppArmor may block it until you add a profile or run `sysctl kernel.apparmor_restrict_unprivileged_userns=0`.
- Inside an unprivileged container, bubblewrap can't mount a fresh `/proc`. The docs' workaround (`enableWeakerNestedSandbox`) gives weaker protection.

## 4. One tool for all three systems: Anthropic's `srt`
Source: https://github.com/anthropic-experimental/sandbox-runtime (npm `@anthropic-ai/sandbox-runtime`, Apache-2.0, labelled "early research preview"). Version 0.0.83 was tested.

**What it is:**
- It runs `srt --settings <file> -c "<command>"`, with `filesystem.allowWrite` and `denyWrite` lists.
- It is the same engine Claude Code's own sandbox is built on.
- Per its README:
  - **macOS:** uses `sandbox-exec` with a generated profile. Needs `ripgrep`.
  - **Linux:** uses bubblewrap. Needs `bubblewrap`, `socat` and `ripgrep`.
  - **Windows:** "Alpha", with a bundled `srt-win.exe`.
- On every system, it always blocks writes to `.git/hooks/`, `.git/config`, `.gitconfig`, `.bashrc`/`.zshrc`, `.vscode/`, `.claude/commands/`, `.claude/agents/` and `.mcp.json`, even inside allowed folders. That is useful extra protection for symcc.

**Tested on macOS** (`allowWrite` = worktree, `.git/objects`, `.git/worktrees/w1`, the literal `refs/heads/symcc/w1` and its `.lock`, its ref log, and `packed-refs.lock`):
- **Refused:** `../../../a.txt`, the base64 path, `branch -f other`, and `branch -f symcc/w2`.
- **Worked:** `git commit`.
- **Catch:** srt sets `TMPDIR=/tmp/claude`, and `mktemp` failed until that folder is created and allowed.

**Tested on Linux, as a normal user, same settings:**
- **Refused:** `../../../a.txt` and `branch -f other`.
- **Worked:** `git commit`.
- **Same `/tmp/claude` catch:** `mktemp` failed with "No such file or directory".

**Windows (from the README only, not tested):**
- srt runs the command as a separate local account `srt-sandbox`, with "a write-restricted token, and explicit ACEs" (access-control entries) on each `allowWrite` folder.
- It needs a one-time admin install (`npx @anthropic-ai/sandbox-runtime windows-install`, one UAC prompt). The install creates that account and a group, and adds machine-wide network filters.
- Write grants "are kept between sessions", so it would leave lasting access rules on every symcc worktree, until `srt-win acl forget`.
- "A session can write only the roots in its own `allowWrite`", which suggests two workers with different folders are kept apart. Not tested.
- Known limits: programs that use Windows' own TLS stack can't make HTTPS connections (Node, Python and Git for Windows still work). The command gets the sandbox account's own profile and environment. Under the experimental "MXC" backend, Git Bash crashes, and Claude Code's Bash tool on Windows uses Git Bash.
- Untested guesses: commits made as a different Windows user may trip git's "dubious ownership" check, and per-user tools (nvm, bun, npm globals) may not be found.

**What srt costs compared with calling `sandbox-exec`/`bwrap` directly:**
- one npm dependency, plus `ripgrep` (and `socat` on Linux)
- a Node start-up on every Bash call (not timed)
- a beta/preview tool whose settings format "may evolve"

**What it gives:**
- one settings format and one code path for all OSes
- network limits if wanted later
- the built-in git and shell-config protections

## 5. The lead and the owner's own session
Only Bash calls whose `agentId` is a live symcc worker get wrapped. The main session's Bash ran unwrapped in the test, so the lead and the owner are not limited to one folder. The real hook should check symcc's `workers` map, not "any subagent".

## 6. Way (B): a separate `claude -p` per worker
**Tested:** `claude -p --settings '{"sandbox":{"enabled":true,...}}'` in a worktree. Commits went through, and writes to main were refused.

**What symcc would lose:** everything tied to `$.agent.spawn`:
- stop
- `checkEdit`
- `ask_owner`
- the hand-back and token counts (`hooks/register.tsx:281-290`)
- `$.agent.list`

It is also no better on native Windows, because Claude Code's sandbox doesn't run there. This belongs to the planned standalone-runner work, not to this question.

## 7. Fallback for systems with no sandbox (native Windows, WSL1, no bwrap, or Claude Code's sandbox already on)
Around each worker Bash call in `tool.call`, compare `git -C <root> status --porcelain` and `git for-each-ref` before and after. If anything changed, warn the owner.

**Limits:**
- It catches changes only after they happen.
- It misses files git ignores.
- It must never undo anything, because the owner may have uncommitted work.
- The plugin API has no file-watch call.

## What was not checked
- **Native Windows:** anything there, including srt's Windows alpha and Claude Code's Bash tool on Windows.
- **WSL2:** not run. The docs say it behaves like Linux.
- **Ubuntu's AppArmor block:** not hit, because the container was Debian and privileged.
- **The Linux wrap from inside a real Claude Code session:** only the wrapper command was tested, not the full hook run. The hook part is the same as on macOS, where it was tested.
- **Speed:** how much slower srt makes each command.
- **`npm install` and tools writing under home:** `~/.npm`, `~/.cache`, `~/.bun`.
- **`sandbox-exec` on future macOS:** Apple's man page marks it deprecated. It still works on macOS 27.2.

## Recommendation
Build (A) with a small "sandbox backend" chosen by OS. Start with macOS and Linux, and use the watcher fallback everywhere else.

1. **Choosing the backend:**
   - On `darwin`, call `/usr/bin/sandbox-exec` with a generated profile (about 2 to 3 days).
   - On `linux` (including WSL2), call `bwrap` with the bind list from section 3 (about 1 to 2 more days). Bind `.git/refs/heads/symcc` and `.git/logs/refs/heads/symcc` (create them first), and give each command a private `/tmp`.
   - If `bwrap` is missing or fails a quick start-up test, fall back.
   - **Native Windows, or Claude Code's sandbox on:** don't wrap. Run the watcher from section 7 and tell the owner once that workers are not sandboxed on this machine.
2. **Direct tools or `srt`:** call `sandbox-exec`/`bwrap` directly for now: no new dependency, no beta tool, and every path stays under symcc's control. Keep `srt` as the later option if native Windows matters. Its Windows support is alpha, needs an admin install, and leaves lasting access rules on folders. Test it on a real Windows machine before relying on it.
3. **Permission checks:**
   - Run `bashOutsideFolder` on the original command in `tool.call`.
   - Answer `tool.check` on the original command, with relative paths made absolute against the worktree.
   - Tell workers that `cd` doesn't carry over, and that on macOS `ps` is unavailable.

## Test plan
**Unit tests (tests/):**
- For a given root, worktree and branch: the macOS profile text is right and uses real paths, and the bwrap argument list is right.
- The backend choice is right for `darwin`, `linux`, `linux` without bwrap, `win32`, and Claude Code's sandbox on.
- Only live workers get wrapped.
- Quoting survives `'`, `"`, `$()` and newlines.
- `tool.check` answers on the original command.

**Live run on a throwaway project, on macOS and on Linux** (a VM or `podman --privileged`; also a normal Ubuntu 24.04 VM, for AppArmor). A worker must be refused for:
- a base64-built path write into main
- a symlink write
- `node` writing into main
- `git -C <root> branch -f other`
- `git update-ref refs/heads/other HEAD`
- on macOS also `git branch -f symcc/<other task>`

It must succeed for `git commit`, the board's test command and `mktemp`.

Afterwards the main folder and its refs must be unchanged. Also check that the lead's Bash is not wrapped, that stop, `ask_owner`, token counts and the hand-back still work, and that a `Bash(npm test:*)` rule still works.

**On Windows:** check that the warning appears and the watcher reports a change to the main folder.

## How it was found
Three tries. Try 1 read the Claude Code sandbox docs and tested way (B). Try 2 tested way (A) on macOS in a real Claude Code session. Try 3 tested bubblewrap on Linux in a podman container and tested `srt` on macOS and Linux; Windows was read from the README only. No project files were changed by the research.
