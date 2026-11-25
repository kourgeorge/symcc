#!/bin/sh
# Checks what symcc ships for VS Code and Cursor: scripts/build-editor.sh builds serve.mjs, the webview and the notices;
# serve.mjs imports only Node built-ins, and the Cursor SDK only when it runs (it is fetched, not shipped); serve,
# started with node on a scratch git repo, first says it is ready with symcc's version and the contract's number, then
# answers the webview with the agents it can run, on Cursor's agents and on Copilot's; and the contract is as recorded
# (tests/editor-contract.sh). It does not check that the committed editor/ is up to date (build-editor.sh --check does).
# Needs node and git on PATH, and npm ci done in hosts/cursor and hosts/cursor/extension. Uses no network.
# Usage: sh tests/editor-bundle.sh [folder]
set -eu
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
fail() { echo "editor-bundle: $1" >&2; exit 1; }
command -v node >/dev/null 2>&1 || fail "node is not on PATH"
command -v git >/dev/null 2>&1 || fail "git is not on PATH"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/symcc-editor-bundle.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

# 1. the build writes serve.mjs, the webview, codicons and the notices
sh scripts/build-editor.sh --out "$tmp/editor" >/dev/null || fail "scripts/build-editor.sh failed"
for f in serve.mjs serve.json webview/webview.js webview/webview.css webview/codicons/codicon.css webview/codicons/codicon.ttf THIRD-PARTY-NOTICES.md; do
  [ -s "$tmp/editor/$f" ] || fail "the build wrote no editor/$f"
done
serve="$tmp/editor/serve.mjs"

# 2. its only outside imports are Node built-ins, and the Cursor SDK when it runs; the Copilot SDK is inside
others=$(grep -oE '^(import|export)[^;]* from "[^"]+"' "$serve" | sed 's/.* from "\([^"]*\)"/\1/' | grep -vE '^node:' || true)
[ -z "$others" ] || fail "serve.mjs imports more than Node: $others"
grep -q 'import("@cursor/sdk")' "$serve" || fail "serve.mjs doesn't import the Cursor SDK when it runs"
grep -qE 'class CopilotClient|CopilotClient = class' "$serve" || fail "the Copilot SDK is not inside serve.mjs"
grep -q 'import("@microsoft/copilot-sdk")' "$serve" && fail "serve.mjs loads the Copilot SDK by name (it must be inside)"
grep -q 'from "koffi"' "$serve" && fail "serve.mjs imports koffi (the in-process Copilot runtime must stay out)"
for p in '@microsoft/copilot-sdk' 'react' 'undici'; do
  grep -q "^## $p " "$tmp/editor/THIRD-PARTY-NOTICES.md" || fail "THIRD-PARTY-NOTICES.md doesn't list $p"
done

# 3. serve starts on a scratch repo: ready first, then the webview's answer (offline: the SDK fetch fails at once)
repo="$tmp/project"
mkdir -p "$repo"
git -C "$repo" init -q -b main
git -C "$repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
version=$(node -p 'require("./.claude-plugin/plugin.json").version')
protocol=$(sed -n 's/^export const PROTOCOL = \([0-9][0-9]*\)$/\1/p' hosts/cursor/contract.ts)
[ "$(cat "$tmp/editor/serve.json")" = "{\"protocol\":$protocol}" ] || fail "editor/serve.json is not {\"protocol\":$protocol}: $(cat "$tmp/editor/serve.json")"
for agents in cursor copilot; do
  SYMCC_CACHE="$tmp/cache" SYMCC_NPM_REGISTRY=http://127.0.0.1:9 COPILOT_CLI_PATH=/nonexistent/copilot node -e '
    const { spawn } = require("node:child_process")
    const [serve, repo, plugin, agents, version, protocol] = process.argv.slice(1)
    const bad = m => { console.error("editor-bundle: " + agents + ": " + m); child.kill(); process.exit(1) }
    const child = spawn(process.execPath, [serve, "--root", repo, "--plugin-root", plugin, "--agents", agents], { cwd: repo, stdio: ["pipe", "pipe", "inherit"] })
    const late = setTimeout(() => bad("no ready line and agents answer within 60 s; got: " + lines.join(" | ").slice(0, 600)), 60000)
    const lines = []
    let buf = ""
    child.stdout.on("data", d => {
      buf += d
      for (let i; (i = buf.indexOf("\n")) >= 0; ) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        lines.push(line)
        let m
        try { m = JSON.parse(line) } catch { bad("a line that is not JSON: " + line) }
        if (lines.length === 1) {
          if (JSON.stringify(m) !== JSON.stringify({ event: "ready", version, protocol: Number(protocol) })) bad("the first line is not the ready line: " + line)
          child.stdin.write(JSON.stringify({ op: "webview", surface: "panel", message: { type: "ready" } }) + "\n")
        } else if (m.event === "webview" && m.message.type === "agents" && m.surface === "panel") {
          if (m.message.current !== agents || !m.message.list.some(a => a.id === "cursor") || !m.message.list.some(a => a.id === "copilot")) bad("the agents answer is wrong: " + line)
          clearTimeout(late)
          child.stdin.end()
        }
      }
    })
    child.on("exit", code => { if (lines.length < 2) bad("serve ended (" + code + ") after: " + lines.join(" | ")) })
  ' "$serve" "$repo" "$root" "$agents" "$version" "$protocol" || exit 1
done

# 4. the contract is as recorded
sh tests/editor-contract.sh "$root" >/dev/null || { sh tests/editor-contract.sh "$root"; exit 1; }
echo "editor-bundle: serve.mjs and the webview build, serve imports only Node, starts ready with symcc $version on protocol $protocol, answers the webview on cursor and copilot, and the contract is as recorded"
