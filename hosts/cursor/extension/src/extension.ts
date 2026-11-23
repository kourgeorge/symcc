// symcc in Cursor: one engine process per window (./engine.ts) for the first workspace folder, the board panel (a
// webview tab, ../webview/) and a status bar item that says what needs you. The panel only draws what the engine
// sends; every press goes back to the engine as the owner's own command.
import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { Engine } from './engine'
import type { ChatItem, EngineState, FromWebview, LeadSettings, ModelInfo, NetworkProblem, PanelStep, PanelView, SlashItem, ToWebview } from '../../protocol'
import { LEAD_AGENT, addStep, readSteps, sessionMarkdown, sessionPath, turnSteps } from '../../steps'

/** A lead error that means the engine could not reach Cursor's servers. */
const NETWORK_ERROR = /network request failed|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|getaddrinfo|socket hang up|proxy/i

/** How many chat lines are kept (per project, in the workspace state). */
const CHAT_KEPT = 300
const CHAT_KEY = 'symcc.chat'
const LEAD_KEY = 'symcc.lead'
const SESSION_SCHEME = 'symcc-session'
/** A lead answer keeps its turn's newest steps, each at most this long; only the newest answers keep them when saved. */
const TURN_STEPS_KEPT = 120
const STEP_TEXT_KEPT = 4000
const ANSWERS_WITH_STEPS = 40

/** The chat as it is saved: no pictures (only how many), the steps of the newest answers only. */
function savedChat(chat: readonly ChatItem[]): ChatItem[] {
  let withSteps = 0
  return chat
    .slice()
    .reverse()
    .map(c => {
      const { images, steps, ...rest } = c
      const keep = steps && withSteps++ < ANSWERS_WITH_STEPS
      return { ...rest, ...(images?.length ? { pictures: images.length } : {}), ...(keep ? { steps } : {}) }
    })
    .reverse()
}

export function activate(ctx: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.[0]
  const out = vscode.window.createOutputChannel('symcc', { log: true })
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50)
  status.command = 'symcc.open'
  ctx.subscriptions.push(out, status)

  const conf = () => vscode.workspace.getConfiguration('symcc')
  const enginePath = () => conf().get<string>('enginePath') || path.join(ctx.extensionPath, '..', 'dist', 'engine.mjs')
  // the engine is a separate Node process, so the editor's own proxy handling never reaches it
  const http = () => vscode.workspace.getConfiguration('http')
  const proxy = () => conf().get<string>('proxy')?.trim() || http().get<string>('proxy')?.trim() || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || ''
  const proxyEnv = (): Record<string, string> => {
    const p = proxy()
    out.appendLine(`proxy: ${p ? p.replace(/\/\/[^@/]*@/, '//***@') : 'none'}`)
    if (!p) return {}
    const no = (http().get<string[]>('noProxy') ?? []).join(',') || process.env.NO_PROXY || process.env.no_proxy || ''
    return { HTTPS_PROXY: p, https_proxy: p, HTTP_PROXY: p, http_proxy: p, ...(no ? { NO_PROXY: no, no_proxy: no } : {}) }
  }
  let network: NetworkProblem | null = null
  const setNetwork = (n: NetworkProblem | null) => ((network = n), post({ type: 'network', problem: n }))

  let view: PanelView | undefined
  // each agent's newest steps (the lead's agent is "lead"); kept over engine restarts, the whole sessions are on disk
  let steps: Record<string, PanelStep[]> = {}
  let chat: ChatItem[] = ctx.workspaceState.get<ChatItem[]>(CHAT_KEY) ?? []
  let busy = false
  // when the lead's newest turn started, so its answer keeps only that turn's steps
  let turnAtMs = 0
  let lead: LeadSettings = ctx.workspaceState.get<LeadSettings>(LEAD_KEY) ?? { mode: 'agent' }
  let models: ModelInfo[] = []
  let slash: SlashItem[] = []
  let panel: vscode.WebviewPanel | undefined
  const seenNeeds = new Set<string>()
  let firstView = true

  const post = (m: ToWebview) => void panel?.webview.postMessage(m)
  const addChat = (who: ChatItem['who'], text: string, more: Partial<ChatItem> = {}) => {
    const atMs = Date.now()
    chat = [...chat, { key: `${atMs}-${chat.length}`, who, text, atMs, ...more }].slice(-CHAT_KEPT)
    void ctx.workspaceState.update(CHAT_KEY, savedChat(chat))
    post({ type: 'chat', items: chat, busy })
  }
  const leadTurn = (): Partial<ChatItem> => {
    const turn = turnSteps(steps[LEAD_AGENT] ?? [], turnAtMs)
      .slice(-TURN_STEPS_KEPT)
      .map(x => (x.text.length > STEP_TEXT_KEPT ? { ...x, text: `…${x.text.slice(-STEP_TEXT_KEPT)}` } : x))
    return { ...(turn.length ? { steps: turn } : {}), ...(lead.modelLabel ? { model: lead.modelLabel } : {}) }
  }
  /** Sends the owner's message to the lead; a /command that answered the owner itself adds its answer. */
  const sendLead = async (text: string, images: { data: string; mimeType: string }[] = []) => {
    addChat('owner', text, images.length ? { images: images.map(i => `data:${i.mimeType};base64,${i.data}`) } : {})
    const a = await engine.request({ op: 'message', text, ...(images.length ? { images } : {}) })
    if (typeof a.said === 'string') addChat('note', a.said)
    return typeof a.said === 'string' ? a.said : ''
  }
  const setLead = (next: LeadSettings) => {
    lead = next
    void ctx.workspaceState.update(LEAD_KEY, lead)
    post({ type: 'lead', settings: lead })
    if (engine.state.state === 'ready') void engine.request({ op: 'lead-set', model: lead.model ?? null, mode: lead.mode }).catch(err => out.appendLine(`couldn't set the lead's model: ${(err as Error).message}`))
  }
  /** What the engine knows of the lead chat once it is up: its model and mode, the account's models, the slash commands. */
  const leadReady = () => {
    void engine.request({ op: 'lead-set', model: lead.model ?? null, mode: lead.mode }).catch(() => undefined)
    void engine.request({ op: 'models' }).then(
      a => ((models = (a.models as ModelInfo[]) ?? []), post({ type: 'models', models })),
      err => out.appendLine(`couldn't list the models: ${(err as Error).message}`),
    )
    void engine.request({ op: 'slash' }).then(
      a => ((slash = (a.slash as SlashItem[]) ?? []), post({ type: 'slash', items: slash })),
      () => undefined,
    )
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
    { root: folder?.uri.fsPath ?? '', engine: enginePath(), node: conf().get<string>('nodePath') || undefined, leadModel: conf().get<string>('leadModel') || undefined, workerModel: conf().get<string>('workerModel') || undefined, env: proxyEnv },
    {
      state: s => {
        drawStatus(s)
        post({ type: 'engine', engine: s })
        if (s.state === 'ready') {
          void engine.request({ op: 'view' }).then(a => onView(a.view as PanelView), () => undefined)
          void engine.request({ op: 'steps' }).then(a => ((steps = { ...steps, ...(a.steps as Record<string, PanelStep[]>) }), post({ type: 'steps', all: steps })), () => undefined)
          leadReady()
        }
      },
      view: v => onView(v),
      lead: e => {
        if (e.type === 'busy') {
          if (e.busy && !busy) turnAtMs = Date.now()
          return void ((busy = e.busy), post({ type: 'chat', items: chat, busy }))
        }
        // the owner's messages are in the chat from when they were sent; symcc's updates aren't shown
        if (e.type === 'message') return
        if (e.type === 'stopped') return addChat('note', 'You stopped the lead.', leadTurn())
        if (e.type === 'summarized') return addChat('note', 'The lead summarized the chat so far to free its memory. The summary is in its session.')
        if (e.type === 'error' && NETWORK_ERROR.test(e.text)) setNetwork({ text: e.text, proxy: proxy() })
        if (e.type === 'answer' && network) setNetwork(null)
        if (e.type === 'answer') return addChat('lead', e.text, leadTurn())
        addChat('error', e.text, leadTurn())
      },
      toast: text => void vscode.window.setStatusBarMessage(text, 6000),
      open: () => openPanel(true),
      step: (agent, step) => ((steps = { ...steps, [agent]: addStep(steps[agent] ?? [], step) }), post({ type: 'step', agent, step })),
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
      post({ type: 'network', problem: network })
      post({ type: 'steps', all: steps })
      post({ type: 'lead', settings: lead })
      if (models.length) post({ type: 'models', models })
      if (slash.length) post({ type: 'slash', items: slash })
      if (view) post({ type: 'view', view })
      return
    }
    if (m.type === 'lead-set') return setLead(m.settings)
    if (m.type === 'lead-stop') return void engine.request({ op: 'lead-stop' }).catch(() => undefined)
    if (m.type === 'session') return void openSession(m.agent, m.title)
    if (m.type === 'restart') return void engine.restart()
    if (m.type === 'log') return out.show()
    if (m.type === 'open-file') return void openFile(m.path, m.line).catch(err => vscode.window.showWarningMessage((err as Error).message))
    const reply = (ok: boolean, text: string) => post({ type: 'reply', id: m.id, ok, text })
    try {
      if (m.type === 'proxy') {
        const p = m.proxy.trim()
        setNetwork(null)
        // a changed setting restarts the engine (onDidChangeConfiguration below); the same one restarts it here
        if (p === (conf().get<string>('proxy') ?? '').trim()) void engine.restart()
        else await conf().update('proxy', p, vscode.ConfigurationTarget.Global)
        return reply(true, p ? 'symcc restarts with the new proxy.' : 'symcc restarts without a proxy.')
      }
      if (m.type === 'send') return reply(true, await sendLead(m.text, m.images))
      if (m.type === 'summarize') {
        const said = await engine.text({ op: 'summarize' })
        if (said !== 'summarizing') addChat('note', `${said.charAt(0).toUpperCase()}${said.slice(1)}${/[.!?]$/.test(said) ? '' : '.'}`)
        return reply(true, '')
      }
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

  /** Opens a file the lead named: in the project, else in the one worker's folder that has it; at its line. */
  async function openFile(name: string, line?: number) {
    const root = folder?.uri.fsPath ?? ''
    const full = name.startsWith('~/') ? path.join(os.homedir(), name.slice(2)) : path.isAbsolute(name) ? name : path.join(root, name)
    let found = (await fs.promises.stat(full).catch(() => null)) ? full : undefined
    if (!found && !path.isAbsolute(name) && !name.startsWith('~/')) {
      const dir = path.join(root, view?.dir ?? '.symcc', 'worktrees')
      const ids = await fs.promises.readdir(dir).catch(() => [] as string[])
      const there = (await Promise.all(ids.map(async id => ((await fs.promises.stat(path.join(dir, id, name)).catch(() => null)) ? path.join(dir, id, name) : null)))).filter((x): x is string => !!x)
      if (there.length === 1) found = there[0]
    }
    if (!found) throw new Error(`There's no ${name} in this project.`)
    const uri = vscode.Uri.file(found)
    if ((await fs.promises.stat(found)).isDirectory()) {
      await vscode.commands.executeCommand('revealInExplorer', uri)
      return
    }
    const at = line ? new vscode.Position(line - 1, 0) : undefined
    await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true, ...(at ? { selection: new vscode.Range(at, at) } : {}) })
  }

  /** Opens agent `agent`'s whole session as a page beside the board (what the engine saved, else what came here). */
  async function openSession(agent: string, title: string) {
    const file = path.join(folder?.uri.fsPath ?? '', sessionPath(view?.dir ?? '.symcc', agent))
    const saved = await fs.promises.readFile(file, 'utf8').then(readSteps, () => [] as PanelStep[])
    const uri = vscode.Uri.from({ scheme: SESSION_SCHEME, path: `/${agent}.md` })
    sessions.set(uri.path, sessionMarkdown(title, saved.length ? saved : (steps[agent] ?? [])))
    sessionChanged.fire(uri)
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true })
  }
  // sessions open read-only, so closing one never asks to save it
  const sessions = new Map<string, string>()
  const sessionChanged = new vscode.EventEmitter<vscode.Uri>()
  ctx.subscriptions.push(sessionChanged, vscode.workspace.registerTextDocumentContentProvider(SESSION_SCHEME, { onDidChange: sessionChanged.event, provideTextDocumentContent: uri => sessions.get(uri.path) ?? '' }))
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
      if (text?.trim()) await sendLead(text).catch(err => vscode.window.showErrorMessage((err as Error).message))
    }),
    vscode.commands.registerCommand('symcc.init', async () => {
      openPanel()
      const said = await engine.text({ op: 'command', name: 'symcc-init', args: '' }).catch(err => (err as Error).message)
      void vscode.window.showInformationMessage(said.split('\n')[0] ?? said)
    }),
    vscode.commands.registerCommand('symcc.restart', () => engine.restart()),
    vscode.commands.registerCommand('symcc.showLog', () => out.show()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if ((e.affectsConfiguration('symcc.proxy') || e.affectsConfiguration('http.proxy')) && engine.state.state !== 'stopped') void engine.restart()
    }),
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
