// symcc in Cursor: one engine process per window (./engine.ts) for the first workspace folder, the board panel (a
// webview tab, ../webview/) and a status bar item that says what needs you. The panel only draws what the engine
// sends; every press goes back to the engine as the owner's own command.
import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { Engine } from './engine'
import type { ChatItem, EngineState, FromWebview, PanelView, ToWebview } from '../../protocol'

/** How many chat lines are kept (per project, in the workspace state). */
const CHAT_KEPT = 300
const CHAT_KEY = 'symcc.chat'

export function activate(ctx: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.[0]
  const out = vscode.window.createOutputChannel('symcc')
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50)
  status.command = 'symcc.open'
  ctx.subscriptions.push(out, status)

  const conf = () => vscode.workspace.getConfiguration('symcc')
  const enginePath = () => conf().get<string>('enginePath') || path.join(ctx.extensionPath, '..', 'dist', 'engine.mjs')

  let view: PanelView | undefined
  let chat: ChatItem[] = ctx.workspaceState.get<ChatItem[]>(CHAT_KEY) ?? []
  let busy = false
  let panel: vscode.WebviewPanel | undefined
  const seenNeeds = new Set<string>()
  let firstView = true

  const post = (m: ToWebview) => void panel?.webview.postMessage(m)
  const addChat = (who: ChatItem['who'], text: string) => {
    const atMs = Date.now()
    chat = [...chat, { key: `${atMs}-${chat.length}`, who, text, atMs }].slice(-CHAT_KEPT)
    void ctx.workspaceState.update(CHAT_KEY, chat)
    post({ type: 'chat', items: chat, busy })
  }

  const drawStatus = (s: EngineState) => {
    status.show()
    status.backgroundColor = undefined
    if (!folder) return void status.hide()
    if (s.state === 'starting') return void ((status.text = '$(loading~spin) symcc'), (status.tooltip = 'symcc is starting'))
    if (s.state === 'failed') return void ((status.text = '$(error) symcc'), (status.tooltip = s.text ?? 'symcc stopped'), (status.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')))
    if (s.state === 'stopped' || !view) return void ((status.text = 'symcc'), (status.tooltip = 'Open the symcc board'))
    if (!view.on) return void ((status.text = 'symcc: off'), (status.tooltip = view.off ?? 'symcc is off in this project'))
    const n = view.counts.needs
    if (n) {
      status.text = `$(bell-dot) symcc: ${n} need${n === 1 ? 's' : ''} you`
      status.tooltip = new vscode.MarkdownString(view.needs.map(x => `**${x.id}** ${x.title}`).join('  \n'))
      status.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
      return
    }
    const r = view.counts.running
    status.text = r ? `$(pulse) symcc: ${r} running` : 'symcc'
    status.tooltip = r ? view.lanes.map(l => `${l.id} ${l.title}`).join('\n') : 'Nothing needs you. Open the board'
  }

  const notifyNew = (v: PanelView) => {
    const fresh = v.needs.filter(x => !seenNeeds.has(x.id))
    for (const x of v.needs) seenNeeds.add(x.id)
    for (const id of [...seenNeeds]) if (!v.needs.some(x => x.id === id)) seenNeeds.delete(id)
    // the needs there at the start were seen on the board's first draw; a board in view needs no notice
    if (firstView || !fresh.length || !conf().get<boolean>('notify') || (panel?.visible && panel.active)) return
    const first = fresh[0]!
    const text = fresh.length === 1 ? `${first.id} needs you: ${first.title}` : `${fresh.length} things need you, first ${first.id}: ${first.title}`
    void vscode.window.showInformationMessage(text, 'Open board').then(pick => pick && openPanel())
  }

  const engine = new Engine(
    { root: folder?.uri.fsPath ?? '', engine: enginePath(), node: conf().get<string>('nodePath') || undefined, leadModel: conf().get<string>('leadModel') || undefined, workerModel: conf().get<string>('workerModel') || undefined },
    {
      state: s => {
        drawStatus(s)
        post({ type: 'engine', engine: s })
        if (s.state === 'ready') void engine.request({ op: 'view' }).then(a => onView(a.view as PanelView), () => undefined)
      },
      view: v => onView(v),
      lead: e => {
        if (e.type === 'busy') return void ((busy = e.busy), post({ type: 'chat', items: chat, busy }))
        if (e.type === 'message') return e.from === 'owner' ? addChat('owner', e.text) : undefined
        addChat(e.type === 'answer' ? 'lead' : 'error', e.text)
      },
      toast: text => void vscode.window.setStatusBarMessage(text, 6000),
      open: () => openPanel(true),
      log: line => out.appendLine(line),
    },
  )
  function onView(v: PanelView) {
    view = v
    notifyNew(v)
    firstView = false
    drawStatus(engine.state)
    post({ type: 'view', view: v })
  }

  /** Answers the webview's request `m` (its reply carries the engine's text, or the error). */
  async function handle(m: FromWebview) {
    if (m.type === 'ready') {
      post({ type: 'engine', engine: engine.state })
      post({ type: 'chat', items: chat, busy })
      if (view) post({ type: 'view', view })
      return
    }
    if (m.type === 'restart') return void engine.restart()
    const reply = (ok: boolean, text: string) => post({ type: 'reply', id: m.id, ok, text })
    try {
      if (m.type === 'send') return reply(true, await engine.text({ op: 'message', text: m.text }))
      if (m.type === 'answer') return reply(true, await engine.text({ op: 'answer', need: m.need, text: m.text }))
      if (m.type === 'mode') return reply(true, await engine.text({ op: 'mode', mode: m.mode }))
      if (m.type === 'scout') return reply(true, await engine.text({ op: 'scout', name: m.name }))
      if (m.type === 'command') return reply(true, await engine.text({ op: 'command', name: m.name, args: m.args ?? '' }))
      if (m.type === 'act') {
        const text = await engine.text({ op: 'act', task: m.task, action: m.action, ...(m.text ? { text: m.text } : {}) })
        if (m.action === 'show-changes') {
          const doc = await vscode.workspace.openTextDocument({ language: 'diff', content: text })
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true })
          return reply(true, '')
        }
        return reply(true, text)
      }
    } catch (err) {
      reply(false, (err as Error).message)
    }
  }

  function openPanel(quiet = false) {
    if (panel) return panel.reveal(undefined, quiet)
    panel = vscode.window.createWebviewPanel('symcc.board', 'symcc', { viewColumn: vscode.ViewColumn.Active, preserveFocus: quiet }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(path.join(ctx.extensionPath, 'dist'))] })
    panel.iconPath = vscode.Uri.file(path.join(ctx.extensionPath, 'media', 'symcc.svg'))
    panel.webview.html = boardHtml(panel.webview, ctx.extensionPath)
    panel.webview.onDidReceiveMessage((m: FromWebview) => void handle(m))
    panel.onDidDispose(() => (panel = undefined))
    if (engine.state.state === 'stopped') engine.start()
  }

  ctx.subscriptions.push(
    vscode.commands.registerCommand('symcc.open', () => openPanel()),
    vscode.commands.registerCommand('symcc.message', async () => {
      const text = await vscode.window.showInputBox({ prompt: 'Message the symcc lead', placeHolder: 'What do you want done next?' })
      if (text?.trim()) await engine.text({ op: 'message', text }).catch(err => vscode.window.showErrorMessage((err as Error).message))
    }),
    vscode.commands.registerCommand('symcc.init', async () => {
      openPanel()
      const said = await engine.text({ op: 'command', name: 'symcc-init', args: '' }).catch(err => (err as Error).message)
      void vscode.window.showInformationMessage(said.split('\n')[0] ?? said)
    }),
    vscode.commands.registerCommand('symcc.restart', () => engine.restart()),
    vscode.commands.registerCommand('symcc.showLog', () => out.show()),
    { dispose: () => void engine.stop() },
  )

  drawStatus(engine.state)
  // a project where symcc was set up starts its engine with the window; elsewhere it starts when the board opens
  if (folder && fs.existsSync(path.join(folder.uri.fsPath, '.symcc'))) engine.start()
}

export function deactivate() {}

/** The webview's page: the built script and styles, codicons, and a content policy that allows nothing else. */
function boardHtml(webview: vscode.Webview, root: string): string {
  const uri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.file(path.join(root, 'dist', ...p)))
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
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${uri('webview.js')}"></script>
</body>
</html>`
}
