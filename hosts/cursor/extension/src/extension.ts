// symcc in VS Code and Cursor: a client of the symcc you installed with a harness. It finds that copy (./find.ts), runs
// its serve (./engine.ts) for the first workspace folder, and shows its board webview twice: as a panel (an editor tab)
// and in the sidebar. It passes the webview's messages to serve and back without reading them, and does what only the
// editor can (../../contract.ts EditorAction): files, diffs, terminals, windows, confirms, notices, the status bar and
// the badge. With no copy that fits, the sidebar shows how to install or update symcc instead.
import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { Engine } from './engine'
import { NODE_NEEDED, SETTING, choose, describe, devCopy, editorRipgrep, nodeFits, places, type Copy } from './find'
import { PROTOCOL, type BoardPage, type EditorAction, type EngineState, type ExtensionToWebview, type Surface } from '../../contract'

/** Text serve shows read-only (a diff, an agent's session): closing it never asks to save. */
const TEXT_SCHEME = 'symcc-text'
/** A file as it was where a worktree is compared from (the left side of its diff). */
const BASE_SCHEME = 'symcc-base'
/** The contracts this extension speaks. */
const SPEAKS = { low: 1, high: PROTOCOL }

/** Why serve can't run, for the setup view (package.json viewsWelcome) and the message. */
type Problem = { kind: 'none' | 'old' | 'new' | 'node' | 'path'; text: string }

export function activate(ctx: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.[0]
  const out = vscode.window.createOutputChannel('symcc', { log: true })
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50)
  status.command = 'symcc.open'
  ctx.subscriptions.push(out, status)

  const conf = () => vscode.workspace.getConfiguration('symcc')
  // serve is a separate Node process, so the editor's own proxy handling never reaches it
  const http = () => vscode.workspace.getConfiguration('http')
  const proxy = () => conf().get<string>('proxy')?.trim() || http().get<string>('proxy')?.trim() || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || ''
  const serveEnv = (): Record<string, string> => {
    const p = proxy()
    out.appendLine(`proxy: ${p ? p.replace(/\/\/[^@/]*@/, '//***@') : 'none'}`)
    const rg = process.env.CURSOR_RIPGREP_PATH ? undefined : editorRipgrep(vscode.env.appRoot, process.platform, process.arch)
    const no = (http().get<string[]>('noProxy') ?? []).join(',') || process.env.NO_PROXY || process.env.no_proxy || ''
    return { ...(rg ? { CURSOR_RIPGREP_PATH: rg } : {}), ...(p ? { HTTPS_PROXY: p, https_proxy: p, HTTP_PROXY: p, http_proxy: p, ...(no ? { NO_PROXY: no, no_proxy: no } : {}) } : {}) }
  }
  const serveArgs = (): string[] => {
    const agents = conf().get<string>('agents')?.trim()
    const lead = conf().get<string>('leadModel')
    const worker = conf().get<string>('workerModel')
    const state = ctx.storageUri?.fsPath
    return [...(agents ? ['--agents', agents] : []), ...(lead ? ['--lead-model', lead] : []), ...(worker ? ['--worker-model', worker] : []), ...(state ? ['--state-dir', state] : [])]
  }

  // the symcc copy serve runs from, or why there is none
  let copy: Copy | undefined
  let problem: Problem | undefined
  const find = () => {
    const setting = conf().get<string>('pluginPath')?.trim()
    const dev = !setting && ctx.extensionMode === vscode.ExtensionMode.Development ? devCopy(ctx.extensionPath, PROTOCOL) : undefined
    const copies = setting ? [describe(setting, SETTING)].flatMap(c => c ?? []) : dev ? [dev] : places(process.env, homedir()).flatMap(p => describe(p.root, p.from) ?? [])
    for (const c of copies) out.appendLine(`found symcc ${c.version} from ${c.from} (${c.protocol === undefined ? 'no editor files' : `protocol ${c.protocol}`}): ${c.root}`)
    const chosen = choose(copies, SPEAKS)
    copy = chosen.copy
    problem = chosen.problem
    if (setting && !copies.length) problem = { kind: 'path', text: `symcc.pluginPath is ${setting}, which holds no symcc (no .claude-plugin/plugin.json there).` }
    else if (!copy && !problem) problem = { kind: 'none', text: 'symcc is not installed on this machine yet: install it with Claude Code, Copilot CLI or OpenCode, then look again.' }
    else if (copy && !conf().get<string>('nodePath') && !nodeFits(process.versions.node))
      problem = { kind: 'node', text: `symcc needs Node ${NODE_NEEDED} or newer, and this editor runs Node ${process.versions.node}. Update the editor, or set symcc.nodePath to a newer Node.` }
    out.appendLine(copy && !problem ? `using symcc ${copy.version} from ${copy.from}: ${copy.root}` : `not starting symcc: ${problem?.text}`)
    void vscode.commands.executeCommand('setContext', 'symcc.found', !!copy && !problem)
    void vscode.commands.executeCommand('setContext', 'symcc.problem', problem?.kind ?? '')
    return { copy, problem }
  }
  /** Says once why serve can't run (no copy at all shows in the sidebar instead). */
  const tellProblem = () => {
    if (!problem) return
    if (problem.kind === 'none') return void vscode.commands.executeCommand('symcc.setup.focus')
    void vscode.window.showWarningMessage(problem.text, 'Show the log').then(pick => pick && out.show())
  }
  const fromWhere = () => (copy ? `symcc ${copy.version} from ${copy.from}` : '')

  let panel: vscode.WebviewPanel | undefined
  let side: vscode.WebviewView | undefined
  // where the board panel goes once its page is up (the sidebar or serve opened it at a page)
  let panelGo: ExtensionToWebview | undefined
  // the status bar item and badge serve asked for, shown while it runs
  let served: Extract<EditorAction, { do: 'status' }> | undefined
  let waiting: (() => void)[] = []

  const surfaces = (): [Surface, vscode.Webview | undefined][] => [
    ['panel', panel?.webview],
    ['side', side?.webview],
  ]
  const post = (m: unknown, surface?: Surface) => {
    for (const [s, w] of surfaces()) if (!surface || surface === s) void w?.postMessage(m)
  }

  const drawStatus = (s: EngineState) => {
    status.backgroundColor = undefined
    if (!folder) return void status.hide()
    status.show()
    const where = fromWhere()
    const tip = (text: string) => new vscode.MarkdownString(where ? `${text}\n\n---\n\n${where}` : text)
    if (problem) return void ((status.text = '$(warning) symcc'), (status.tooltip = tip(problem.text)))
    if (s.state === 'starting') return void ((status.text = '$(loading~spin) symcc'), (status.tooltip = tip('symcc is starting')))
    if (s.state === 'failed') return void ((status.text = '$(error) symcc'), (status.tooltip = tip(s.text ?? 'symcc stopped')), (status.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')))
    if (s.state === 'stopped' || !served) return void ((status.text = 'symcc'), (status.tooltip = tip('Open the symcc board')))
    status.text = served.text
    status.tooltip = tip(served.tooltip)
    if (served.tone === 'warning') status.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
  }
  const drawBadge = () => {
    const n = engine.state.state === 'ready' ? (served?.needs ?? 0) : 0
    if (side) side.badge = n ? { value: n, tooltip: `${n} thing${n === 1 ? ' needs' : 's need'} you` } : undefined
  }
  const boardInView = () => (panel?.visible && panel.active) || side?.visible

  // read-only text from serve, by its tab's path
  const texts = new Map<string, string>()
  const textChanged = new vscode.EventEmitter<vscode.Uri>()

  /** Does what serve asked of the editor. */
  async function editor(a: EditorAction) {
    if (a.do === 'open-file') {
      const uri = vscode.Uri.file(a.path)
      if (a.folder) return void (await vscode.commands.executeCommand('revealInExplorer', uri))
      const at = a.line ? new vscode.Position(a.line - 1, 0) : undefined
      return void (await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true, ...(at ? { selection: new vscode.Range(at, at) } : {}) }))
    }
    if (a.do === 'show-text') {
      const uri = vscode.Uri.from({ scheme: TEXT_SCHEME, path: `/${a.name}` })
      texts.set(uri.path, a.content)
      textChanged.fire(uri)
      let doc = await vscode.workspace.openTextDocument(uri)
      if (doc.languageId !== a.language) doc = await vscode.languages.setTextDocumentLanguage(doc, a.language)
      return void (await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true }))
    }
    if (a.do === 'diff') {
      const base = vscode.Uri.from({ scheme: BASE_SCHEME, path: `/${a.file}`, query: JSON.stringify({ dir: a.dir }) })
      if (a.gone) return void (await vscode.window.showTextDocument(base, { viewColumn: vscode.ViewColumn.Beside, preview: true }))
      return void (await vscode.commands.executeCommand('vscode.diff', base, vscode.Uri.file(path.join(a.dir, a.file)), a.title, { viewColumn: vscode.ViewColumn.Beside, preview: true }))
    }
    if (a.do === 'terminal') return vscode.window.createTerminal({ name: a.name, cwd: a.cwd }).show()
    if (a.do === 'open-folder') return void (await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(a.path), { forceNewWindow: true }))
    if (a.do === 'reveal') return void (await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(a.path)))
    if (a.do === 'copy') return vscode.env.clipboard.writeText(a.text)
    if (a.do === 'toast') return void vscode.window.setStatusBarMessage(a.text, 6000)
    if (a.do === 'status') {
      served = a
      drawStatus(engine.state)
      return drawBadge()
    }
    if (a.do === 'open-board') return openBoard(a.page, a.task, a.quiet)
    if (a.do === 'notify') {
      if (a.board) {
        // a board in view shows it already
        if (!conf().get<boolean>('notify') || boardInView()) return
        const pick = await vscode.window.showInformationMessage(a.text, 'Open board')
        return pick && openBoard(a.board.page, a.board.task)
      }
      return void (a.level === 'warning' ? vscode.window.showWarningMessage(a.text) : vscode.window.showInformationMessage(a.text))
    }
    if (a.do === 'confirm') {
      const pick = await vscode.window.showWarningMessage(a.text, { modal: true, ...(a.detail ? { detail: a.detail } : {}) }, a.button)
      return engine.send({ op: 'confirmed', id: a.id, ok: pick === a.button })
    }
    if (a.do === 'setting') {
      // a changed setting restarts serve (onDidChangeConfiguration below); the same one restarts it here
      if (a.value === (conf().get<string>(a.key) ?? '').trim()) return void engine.restart()
      return void (await conf().update(a.key, a.value, vscode.ConfigurationTarget.Global))
    }
  }

  const engine = new Engine(
    { root: folder?.uri.fsPath ?? '', serve: () => copy?.serve ?? '', node: () => conf().get<string>('nodePath') || undefined, args: serveArgs, env: serveEnv },
    {
      state: s => {
        if (s.state !== 'ready') served = undefined
        drawStatus(s)
        drawBadge()
        post({ type: 'engine', engine: s } satisfies ExtensionToWebview)
        if (s.state === 'ready') for (const w of waiting.splice(0)) w()
      },
      ready: r => out.appendLine(`symcc ${r.version} is up, speaking protocol ${r.protocol}`),
      webview: (m, surface) => post(m, surface),
      editor: a => void editor(a).catch(err => out.appendLine(`couldn't ${a.do}: ${(err as Error).message}`)),
      log: line => out.appendLine(line),
    },
  )
  /** Starts serve when there is a project and a copy to run (else says why not, when `tell`). */
  const start = (tell = false) => {
    if (!folder || engine.state.state !== 'stopped') return
    if (!copy || problem) return void (tell && tellProblem())
    engine.start()
  }
  /** Resolves once serve is up (starting it if it isn't); rejects when it can't start. */
  const up = () =>
    new Promise<void>((resolve, reject) => {
      if (engine.state.state === 'ready') return resolve()
      if (!copy || problem) return reject(new Error(problem?.text ?? 'symcc is not installed'))
      waiting = [...waiting, resolve]
      start()
    })

  /** A message from webview `surface`: the few that are the editor's are done here, the rest go to serve unread. */
  function fromWebview(m: { type?: unknown; page?: BoardPage; task?: string }, surface: Surface, from: vscode.Webview) {
    if (m.type === 'restart') return void restart()
    if (m.type === 'log') return out.show()
    if (m.type === 'open-board') return openBoard(m.page ?? 'now', m.task)
    if (m.type === 'ready') {
      void from.postMessage({ type: 'engine', engine: engine.state } satisfies ExtensionToWebview)
      if (panelGo && surface === 'panel') void from.postMessage(panelGo)
      if (surface === 'panel') panelGo = undefined
    }
    engine.send({ op: 'webview', surface, message: m })
  }

  ctx.subscriptions.push(
    textChanged,
    vscode.workspace.registerTextDocumentContentProvider(TEXT_SCHEME, { onDidChange: textChanged.event, provideTextDocumentContent: uri => texts.get(uri.path) ?? '' }),
    vscode.workspace.registerTextDocumentContentProvider(BASE_SCHEME, {
      provideTextDocumentContent: async uri => {
        const { dir } = JSON.parse(uri.query) as { dir: string }
        const a = await engine.request({ op: 'worktree-base', path: dir, file: uri.path.slice(1) })
        return typeof a.text === 'string' ? a.text : ''
      },
    }),
  )

  /** The copy's webview folder, which is all a page may load from. */
  const pageRoot = () => vscode.Uri.file(copy?.webview ?? path.join(ctx.extensionPath, 'dist'))
  const showPage = (webview: vscode.Webview, surface: Surface) => {
    webview.options = { enableScripts: true, localResourceRoots: [pageRoot()] }
    webview.html = boardHtml(webview, pageRoot(), surface)
  }

  function openPanel(quiet = false) {
    if (!copy || problem) return tellProblem()
    if (panel) return panel.reveal(undefined, quiet)
    panel = vscode.window.createWebviewPanel('symcc.board', 'symcc', { viewColumn: vscode.ViewColumn.Active, preserveFocus: quiet }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [pageRoot()] })
    panel.iconPath = vscode.Uri.file(path.join(ctx.extensionPath, 'media', 'symcc.svg'))
    const webview = panel.webview
    showPage(webview, 'panel')
    webview.onDidReceiveMessage(m => fromWebview(m as { type?: unknown }, 'panel', webview))
    panel.onDidDispose(() => (panel = undefined))
    start()
  }
  /** Opens the board panel at `page` (the board at task `task`); a panel still loading goes there once it's up. */
  function openBoard(page?: BoardPage, task?: string, quiet = false) {
    if (page) {
      const go: ExtensionToWebview = { type: 'go', page, ...(task ? { task } : {}) }
      if (panel) void panel.webview.postMessage(go)
      else panelGo = go
    }
    openPanel(quiet)
  }

  /** Looks for the copy again and restarts serve from it; open pages load from the new copy. */
  async function restart(tell = true) {
    const was = copy?.webview
    await engine.stop()
    find()
    if (copy?.webview !== was) {
      if (panel) showPage(panel.webview, 'panel')
      if (side) showPage(side.webview, 'side')
    }
    drawStatus(engine.state)
    start(tell)
  }

  // the sidebar while no copy fits: package.json's viewsWelcome says what to do
  const setup: vscode.TreeDataProvider<never> = { getTreeItem: () => new vscode.TreeItem(''), getChildren: () => [] }
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('symcc.setup', setup),
    vscode.window.registerWebviewViewProvider(
      'symcc.side',
      {
        resolveWebviewView(v) {
          side = v
          showPage(v.webview, 'side')
          v.webview.onDidReceiveMessage(m => fromWebview(m as { type?: unknown }, 'side', v.webview))
          v.onDidDispose(() => side === v && (side = undefined))
          drawBadge()
          start()
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('symcc.open', () => openPanel()),
    vscode.commands.registerCommand('symcc.message', async () => {
      if (!copy || problem) return tellProblem()
      const text = await vscode.window.showInputBox({ prompt: 'Message the symcc lead', placeHolder: 'What do you want done next?' })
      if (!text?.trim()) return
      start()
      engine.send({ op: 'say', text })
    }),
    vscode.commands.registerCommand('symcc.init', async () => {
      if (!copy || problem) return tellProblem()
      openPanel()
      const said = await up()
        .then(() => engine.request({ op: 'command', name: 'symcc-init', args: '' }))
        .then(
          a => (typeof a.text === 'string' ? a.text : ''),
          err => (err as Error).message,
        )
      void vscode.window.showInformationMessage(said.split('\n')[0] ?? said)
    }),
    vscode.commands.registerCommand('symcc.restart', () => restart()),
    vscode.commands.registerCommand('symcc.showLog', () => out.show()),
    vscode.commands.registerCommand('symcc.findPlugin', async () => {
      await restart(false)
      if (copy && !problem) void vscode.window.showInformationMessage(`Using ${fromWhere()}.`)
      else tellProblem()
    }),
    vscode.commands.registerCommand('symcc.choosePlugin', async () => {
      const [picked] = (await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Use this symcc', title: 'The symcc folder (a clone, or an installed copy)' })) ?? []
      if (!picked) return
      const c = describe(picked.fsPath, SETTING)
      if (!c) return void vscode.window.showErrorMessage(`${picked.fsPath} holds no symcc (no .claude-plugin/plugin.json there).`)
      await conf().update('pluginPath', picked.fsPath, vscode.ConfigurationTarget.Global)
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (['symcc.pluginPath', 'symcc.nodePath'].some(k => e.affectsConfiguration(k))) return void restart()
      const again = ['symcc.agents', 'symcc.leadModel', 'symcc.workerModel', 'symcc.proxy', 'http.proxy'].some(k => e.affectsConfiguration(k))
      if (again && engine.state.state !== 'stopped') void engine.restart()
    }),
    { dispose: () => void engine.stop() },
  )

  find()
  drawStatus(engine.state)
  if (problem && problem.kind !== 'none') tellProblem()
  // a project where symcc was set up starts serve with the window; elsewhere it starts when the board opens
  if (folder && fs.existsSync(path.join(folder.uri.fsPath, '.symcc'))) start()
}

export function deactivate() {}

/** The webview's page: the copy's built script and styles, codicons, and a content policy that allows nothing else. */
function boardHtml(webview: vscode.Webview, root: vscode.Uri, surface: Surface): string {
  const uri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(root, ...p))
  const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('')
  const csp = [`default-src 'none'`, `img-src ${webview.cspSource} data:`, `style-src ${webview.cspSource}`, `font-src ${webview.cspSource}`, `script-src 'nonce-${nonce}'`].join('; ')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${uri('codicons', 'codicon.css')}">
<link rel="stylesheet" href="${uri('webview.css')}">
<title>symcc</title>
</head>
<body data-surface="${surface}">
<div id="root"></div>
<script nonce="${nonce}" src="${uri('webview.js')}"></script>
</body>
</html>`
}
