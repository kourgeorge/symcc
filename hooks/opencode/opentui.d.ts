// The two modules of OpenCode's TUI that opencode/tui.ts imports by name (T-500). OpenCode 2.3 gives them to TUI
// plugins at load time, so they are never installed here: these empty declarations only let hooks/opencode/tsconfig.json
// type-check the import() calls. What is used from them is checked when they load (tui.ts's loadTuiRuntime).
declare module 'solid-js'
declare module '@opentui/solid'
