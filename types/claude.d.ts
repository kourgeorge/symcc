// The board panel's values as Claude Code's PluginState holds them (see hooks/claude/panel.ts). Kept apart from
// index.d.ts, so a program that imports symcc's own types (hooks/app/, hooks/core/) needs no Claude Code types.
import type { SymccView } from './index'

declare module 'claude-code' {
  interface PluginState {
    // keyed by the plugin's name: keep it the same as "name" in .claude-plugin/plugin.json
    symcc: { view: Shaped<SymccView>; opened: string; tab: string; scout: string }
  }
}
