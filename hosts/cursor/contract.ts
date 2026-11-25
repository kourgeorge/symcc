// The contract between serve (editor/serve.mjs, built from ./main.ts) and an editor extension that runs it. It is all
// the extension may rely on: the command line, the lines on stdin and stdout, and the few webview messages the
// extension handles itself. What else passes between the board's webview and serve goes through the extension unread
// (./protocol.ts, internal: serve and the webview ship together).
//
// A change an extension speaking the old PROTOCOL couldn't follow raises PROTOCOL. tests/editor-bundle.sh fails when
// this file changes while contract.sha256 still holds the old hash: reconsider the number, then record the new hash.
//
// Command line: node serve.mjs --root <project> [--agents <name>] [--lead-model <id>] [--worker-model <id>]
//               [--state-dir <folder>] [--plugin-root <symcc>]
//   --agents      whose agents run the lead and the workers ("cursor" when absent); serve lists the choices (AgentChoice)
//   --state-dir   where serve keeps the window's chat and the lead's settings (the editor's storage for the workspace)
// Environment:  HTTPS_PROXY, HTTP_PROXY, NO_PROXY (and lower case): the proxy serve's network calls go through.
//               CURSOR_RIPGREP_PATH: the editor's ripgrep, for the Cursor agents' search tool.
//               COPILOT_CLI_PATH: the GitHub Copilot CLI to run Copilot's agents with (else copilot on the PATH).
//               SYMCC_DEBUG: debug lines on stderr. stderr is the log; stdout carries only JSON lines.

/** The number of this contract. */
export const PROTOCOL = 1

/** The board's two surfaces: the panel (an editor tab) and the sidebar in the activity bar. */
export type Surface = 'panel' | 'side'

/** A page of the board panel. */
export type BoardPage = 'now' | 'board' | 'trees' | 'scouts' | 'memory'

/** serve's first line on stdout: which symcc it is and which contract it speaks. */
export type ReadyEvent = { event: 'ready'; version: string; protocol: number }

/** What serve asks the editor to do. */
export type EditorAction =
  /** open a file beside the board, at `line` (from 1); a folder shows in the file explorer */
  | { do: 'open-file'; path: string; line?: number; folder?: boolean }
  /** show text in a read-only tab named `name`: a diff, or an agent's session */
  | { do: 'show-text'; name: string; language: 'diff' | 'markdown'; content: string }
  /** compare `file` in worktree `dir` with its base (the extension asks for it with worktree-base); only the base when the file is gone */
  | { do: 'diff'; dir: string; file: string; title: string; gone?: boolean }
  /** a terminal named `name` in folder `cwd` */
  | { do: 'terminal'; cwd: string; name: string }
  /** a folder in a new window */
  | { do: 'open-folder'; path: string }
  /** a file or folder in the system's file manager */
  | { do: 'reveal'; path: string }
  | { do: 'copy'; text: string }
  /** a notice; with `board` it says something needs the owner: shown only while no board is in view and symcc.notify is on, with a button that opens the board */
  | { do: 'notify'; text: string; level?: 'info' | 'warning'; board?: { page?: BoardPage; task?: string } }
  /** a few seconds in the status bar */
  | { do: 'toast'; text: string }
  /** the status bar item (`text` may hold $(icon) names, `tooltip` is Markdown) and the sidebar's badge (`needs`, none at 0) */
  | { do: 'status'; text: string; tooltip: string; tone?: 'warning'; needs: number }
  /** show the board panel at `page` (`quiet`: without taking the focus) */
  | { do: 'open-board'; page?: BoardPage; task?: string; quiet?: boolean }
  /** a modal question with one button besides Cancel; the extension answers {"op":"confirmed","id":…,"ok":…} */
  | { do: 'confirm'; id: number; text: string; detail?: string; button: string }
  /** change one of symcc's settings (symcc.proxy, symcc.agents): serve restarts with it */
  | { do: 'setting'; key: 'proxy' | 'agents'; value: string }

/** A line serve writes on stdout. */
export type ServeLine =
  | ReadyEvent
  /** a message for the board's webview: only to `surface`, else to both */
  | { event: 'webview'; message: unknown; surface?: Surface }
  | { event: 'editor'; action: EditorAction }
  /** the answer to a request with an id */
  | { id: number; ok: true; text: string; ref?: string }
  | { id: number; ok: false; error: string }

/** A line the extension writes on serve's stdin. */
export type ExtensionLine =
  /** a message from the board's webview `surface`, passed on unread */
  | { op: 'webview'; surface: Surface; message: unknown }
  /** the owner's answer to a confirm */
  | { op: 'confirmed'; id: number; ok: boolean }
  /** the owner's message to the lead from an editor command */
  | { op: 'say'; text: string }
  /** file `file` as it was where worktree `path` is compared from (a diff's left side); answers text and ref */
  | { id: number; op: 'worktree-base'; path: string; file: string }
  /** a slash command of symcc's (without the slash, e.g. symcc-init); answers its text */
  | { id: number; op: 'command'; name: string; args?: string }
  | { op: 'stop' }

/** Where serve is, as the extension tells the webview (it can't tell before serve is up). */
export type EngineState = { state: 'starting' | 'ready' | 'stopped' | 'failed'; text?: string }

/** The webview messages the extension handles itself (ready also goes on to serve, which answers with what to show). */
export type WebviewToExtension = { type: 'ready' } | { type: 'restart' } | { type: 'log' } | { type: 'open-board'; page?: BoardPage; task?: string }

/** What the extension sends the webview itself: where serve is, and the page to show after the panel opened. */
export type ExtensionToWebview = { type: 'engine'; engine: EngineState } | { type: 'go'; page: BoardPage; task?: string }
