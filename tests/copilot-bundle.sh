#!/bin/sh
# Checks symcc's GitHub Copilot CLI plugin (T-960): scripts/build-copilot.sh builds one extension.mjs; it imports only
# Node built-ins and the two SDK modules Copilot CLI gives ("@microsoft/copilot-sdk" and its "/extension"); it loads
# and joins the session with symcc's tools and /symcc command (run with node against a fake SDK); and the plugin
# manifest (.github/plugin/plugin.json) and marketplace file (.github/plugin/marketplace.json) are valid and point at
# the committed copilot/extensions/symcc/extension.mjs. It does not check that the committed file is up to date with
# the engine (sh scripts/build-copilot.sh --check does). Needs bun and node on PATH.
# Usage: sh tests/copilot-bundle.sh [folder]
set -eu
root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root"
fail() { echo "copilot-bundle: $1" >&2; exit 1; }
command -v node >/dev/null 2>&1 || fail "node is not on PATH"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/symcc-copilot-bundle.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

# 1. the build writes one file
sh scripts/build-copilot.sh --out "$tmp/copilot" >/dev/null || fail "scripts/build-copilot.sh failed"
built="$tmp/copilot/extensions/symcc/extension.mjs"
[ -s "$built" ] || fail "the build wrote no $built"

# 2. its only outside imports are Node built-ins and the SDK (left external, not bundled in)
others=$(grep -oE '^(import|export)[^;]* from "[^"]+"' "$built" | sed 's/.* from "\([^"]*\)"/\1/' | grep -vE '^(node:.*|@microsoft/copilot-sdk|@microsoft/copilot-sdk/extension)$' || true)
[ -z "$others" ] || fail "extension.mjs imports more than Node and the SDK: $others"
grep -q 'from "@microsoft/copilot-sdk/extension"' "$built" || fail "extension.mjs does not import joinSession from @microsoft/copilot-sdk/extension"
grep -q 'from "@microsoft/copilot-sdk"' "$built" || fail "extension.mjs does not import @microsoft/copilot-sdk"
grep -q 'class CopilotClient\|function joinSession' "$built" && fail "the SDK was bundled into extension.mjs (it must stay external)"

# 3. it loads: a fake SDK beside it records what joinSession was given, then ends the process
sdk="$tmp/node_modules/@microsoft/copilot-sdk"
mkdir -p "$sdk" "$tmp/project"
printf '%s\n' '{ "name": "@microsoft/copilot-sdk", "type": "module", "exports": { ".": "./index.js", "./extension": "./extension.js" } }' >"$sdk/package.json"
printf '%s\n' 'export class CopilotClient {}' 'export const RuntimeConnection = { forSpawnedStdio: () => ({}) }' 'export const approveAll = () => ({ kind: "approved" })' >"$sdk/index.js"
printf '%s\n' \
  'import { writeFileSync } from "node:fs"' \
  'export async function joinSession(o) {' \
  '  writeFileSync(process.env.FAKE_OUT, JSON.stringify({ cwd: process.cwd(), tools: o.tools.definitions.map(t => t.name), commands: o.commands.map(c => c.name), hooks: Object.keys(o.hooks.handlers), env: o.requestedEnvironmentVariables }))' \
  '  process.exit(0)' \
  '}' >"$sdk/extension.js"
log="$tmp/run.log"
(cd "$tmp/project" && FAKE_OUT="$tmp/joined.json" node "$built") >"$log" 2>&1 || { cat "$log" >&2; fail "node could not run extension.mjs"; }
[ -s "$tmp/joined.json" ] || { cat "$log" >&2; fail "extension.mjs loaded but never called joinSession"; }
node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
  const need = (ok, what) => { if (!ok) { console.error("copilot-bundle: " + what + ": " + JSON.stringify(j)); process.exit(1) } }
  need(j.tools.includes("symcc_board"), "no symcc_board tool at the join")
  need(j.commands.includes("symcc"), "no /symcc command at the join")
  need(j.hooks.includes("onUserPromptSubmitted") && j.hooks.includes("onSessionEnd"), "the prompt and session-end hooks are missing")
  need(Array.isArray(j.env) && j.env.includes("COPILOT_PROVIDER_API_KEY"), "the agents SDK was not passed in (no provider secrets asked for)")
' "$tmp/joined.json" || exit 1

# 4. the manifest and the marketplace file are valid JSON and point at the committed extension.mjs
node -e '
  const fs = require("fs"), path = require("path")
  const root = process.argv[1]
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(root, f), "utf8")) } catch (e) { console.error("copilot-bundle: " + f + " is not valid JSON: " + e.message); process.exit(1) } }
  const bad = m => { console.error("copilot-bundle: " + m); process.exit(1) }
  const market = read(".github/plugin/marketplace.json")
  if (market.name !== "symcc" || !market.owner || !Array.isArray(market.plugins)) bad("marketplace.json needs name symcc, owner and plugins")
  const entry = market.plugins.find(p => p.name === "symcc")
  if (!entry || typeof entry.source !== "string") bad("marketplace.json has no symcc plugin with a source folder")
  const plugin = path.join(root, entry.source)
  const manifest = read(path.relative(root, path.join(plugin, ".github/plugin/plugin.json")))
  if (manifest.name !== "symcc" || typeof manifest.extensions !== "string") bad("plugin.json needs name symcc and an extensions folder")
  // Without a hooks field Copilot reads the Claude Code hooks/hooks.json and logs "Invalid hooks config" every session
  if (typeof manifest.hooks !== "string") bad("plugin.json needs a hooks path (else Copilot reads the Claude Code hooks/hooks.json)")
  if (path.normalize(manifest.hooks) === path.normalize("hooks/hooks.json")) bad("plugin.json hooks must not be the Claude Code hooks/hooks.json")
  const hooks = read(path.relative(root, path.join(plugin, manifest.hooks)))
  if (!hooks.hooks || typeof hooks.hooks !== "object" || Array.isArray(hooks.hooks)) bad(manifest.hooks + " needs a hooks object")
  const ext = path.join(plugin, manifest.extensions, "symcc", "extension.mjs")
  if (!fs.existsSync(ext)) bad("plugin.json points at " + ext + ", which is missing (run sh scripts/build-copilot.sh)")
  for (const d of ["roles", "kinds", "examples/scouts", ".claude-plugin/plugin.json"]) if (!fs.existsSync(path.join(plugin, d))) bad("the plugin folder has no " + d + " (the extension reads it from there)")
' "$root" || exit 1
echo "copilot-bundle: extension.mjs builds, imports only Node and the SDK, joins with symcc's tools, and the manifest and marketplace point at it"
