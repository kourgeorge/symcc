// One symcc session on Cursor: the Node host's files, commands and timers (hosts/node/host.ts), with the agents and the
// lead chat on the Cursor SDK, or on GitHub Copilot's (./agents.ts, ./lead.ts, ./copilot.ts). It calls the same entry
// points in the same order as the Node host's session (hosts/node/session.ts) and holds no logic of its own. Unlike the
// Node CLI it stays open: agents start any time, and a board update reaches the lead at once (wakeLead 'now'), so an
// idle lead wakes up for it.
import type { SymccView } from '../../types'
import type { Host, HostFeatures, PanelValues } from '../../hooks/host'
import { noUi } from '../../hooks/host'
import { sessionStarting, sessionStart, sessionEnd, toolCall, runCommand, agentFinished, ownerTyped, leadGuideText, meanwhileForPrompt, COMMANDS } from '../../hooks/app/symcc'
import { S, useName, toolName, workers, starting, finishing, approving, queuedWorkers, scoutRuns, checkerRuns, type PaneView } from '../../hooks/app/state'
import { stopForQuit } from '../../hooks/app/board-mode'
import { TOOLS } from '../../hooks/app/tools'
import { ANSWER_COMMAND, answerCommand } from '../../hooks/app/answer'
import { changedFiles } from '../../hooks/app/review'
import { orgMemNow } from '../../hooks/app/org-mem'
import { type DiffFile, intoOf, isAnswered, type BoardTask } from '../../hooks/board'
import { nodeHost } from '../node/host'
import { sdkAgents, type SdkAgents } from './agents'
import { leadChat, type LeadChat, type LeadChoice, type LeadEvent } from './lead'
import type { Sdk, SdkImage, SdkModelInfo, SdkStep, SdkTool } from './sdk'
import { checkerOf, panelView } from './view'
import { LEAD_AGENT, addStep, isWords, sessionPath } from './steps'
import { listSkills, skillMessage } from './skills'
import { projectWorktrees, type Worktrees } from './worktrees'
import type { PanelActionId, PanelMode, PanelStep, PanelView, SlashItem } from './protocol'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** What this host can do: it runs the lead chat itself, so updates wake it at once; the extension's webview is its
 *  board panel (the engine hands it every published view). */
export const CURSOR_FEATURES: HostFeatures = { panel: true, band: false, wakeLead: 'now', planMode: false, leadUsage: false, startQueue: false }

/** How each panel action is sent: as the owner's own slash command (/<name>-approve, -reject, -diff, or a verb of
 *  /<name>-task), the same ones OpenCode's panel sends (hooks/opencode/board-view.ts TASK_ACTION_COMMANDS). */
const ACTION_COMMANDS: Record<PanelActionId, { word: 'approve' | 'reject' | 'diff' | 'task'; verb?: string }> = {
  approve: { word: 'approve' },
  done: { word: 'approve' },
  reject: { word: 'reject' },
  'ask-more': { word: 'reject' },
  'show-changes': { word: 'diff' },
  'keep-note': { word: 'task', verb: 'note' },
  pause: { word: 'task', verb: 'pause' },
  resume: { word: 'task', verb: 'resume' },
  retry: { word: 'task', verb: 'retry' },
  'merge-now': { word: 'task', verb: 'retry' },
  'run-now': { word: 'task', verb: 'run' },
  'to-todo': { word: 'task', verb: 'todo' },
  drop: { word: 'task', verb: 'drop' },
}

/** The command name and words that send panel action `action` on task `task` (`text`: the reason or question; for
 *  run-now, "anyway" starts it without waiting for the tasks it waits on). */
export function actionCommand(name: string, task: string, action: PanelActionId, text = ''): { command: string; args: string } {
  const c = ACTION_COMMANDS[action]
  const extra = (action === 'drop' && text.trim()) || (action === 'run-now' && text.trim() === 'anyway' ? 'anyway' : '')
  const words = c.word === 'task' ? [task, c.verb!, ...(extra ? [extra] : [])] : [task, ...(c.word === 'reject' ? [text.trim()] : [])]
  return { command: `${name}-${c.word}`, args: words.join(' ') }
}

/** The empty view, as a panel starts with. */
const emptyView = (): SymccView => ({ tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] })

export type CursorSessionOptions = {
  /** the project folder */
  root: string
  sdk: Sdk
  workerModel?: string
  leadModel?: string
  /** symcc's own folder (roles/, kinds/, examples/, .claude-plugin/plugin.json) */
  pluginRoot?: string
  sessionId?: string
  /** the lead chat's messages, answers and errors */
  onLead?: (e: LeadEvent) => void
  /** a short notice for the owner */
  onToast?: (text: string) => void
  /** the line that says what needs the owner (undefined clears it) */
  onStatus?: (text: string | undefined) => void
  /** the board panel's view, after each publish */
  onView?: (view: PanelView) => void
  /** symcc asks for the board panel to be shown (a session start with open_on_start, /<name>) */
  onOpen?: () => void
  /** a step of an agent's turn (`agent` is its id, or "lead" for the lead chat) */
  onStep?: (agent: string, step: PanelStep) => void
  /** debug lines */
  log?: (line: string) => void
  /** the user's home folder, for the user's skills (the process's when absent) */
  home?: string
}

export type CursorSession = {
  host: Host
  agents: SdkAgents
  lead: LeadChat
  /** runs one of the lead's tools (in symcc's plain words, e.g. "add") as the lead and answers its text */
  tool: (name: string, input: Record<string, unknown>) => Promise<string>
  /** runs a slash command (without the slash, e.g. "symcc-init") and answers its text */
  command: (name: string, args?: string) => Promise<string>
  /**
   * the owner typed a message to the lead, with pictures. A /command of symcc's runs: its answer for the owner comes
   * back as `said` (nothing goes to the lead), any other goes to the lead; /<skill> tells the lead to use the skill.
   */
  message: (text: string, images?: readonly SdkImage[]) => Promise<{ said?: string }>
  /** the slash commands the lead chat offers: symcc's and the skills */
  slash: () => Promise<SlashItem[]>
  /** the models the account can use (none where the SDK can't list them) */
  models: () => Promise<SdkModelInfo[]>
  /** the board panel's view now */
  view: () => PanelView
  /** the newest steps of each agent this session ran (the lead's under "lead") */
  steps: () => Record<string, PanelStep[]>
  /** the owner pressed a task action on the panel; answers what happened (for Show changes: the diff) */
  act: (task: string, action: PanelActionId, text?: string) => Promise<string>
  /** the owner answered a waiting task (T-5) or a board question (Q-3) on the panel */
  answer: (id: string, text: string) => Promise<string>
  /** the owner switched the board's mode */
  mode: (mode: PanelMode) => Promise<string>
  /** the owner ran a scout now */
  runScout: (name: string) => Promise<string>
  /** the owner deleted org-mem note `n` (its place in the file), `key` its check word (PanelOrgNote) */
  forget: (n: number, key: string) => Promise<string>
  /** the project's git worktrees: the workers' folders, the project itself and the owner's other checkouts */
  worktrees: Worktrees
  /** whether nothing of symcc's runs or waits now (no agent, start, check or merge; the lead's turn done) */
  quiet: () => boolean
  close: (why?: string) => Promise<void>
}

/** A tool call's answer as the text a chat or a screen shows. */
function answerText(tool: string, r: { deny: string } | { result: string } | null): string {
  if (!r) return `${tool} is not one of ${S.N.name}'s tools`
  return 'deny' in r ? `Refused: ${r.deny}` : r.result
}


export async function openCursorSession(o: CursorSessionOptions): Promise<CursorSession> {
  const log = o.log ?? (() => undefined)
  const ref: { host?: Host } = {}
  // each agent's steps: the newest in memory for the board, every one in <dir>/sessions/<agent>.jsonl (written once a second)
  const steps = new Map<string, PanelStep[]>()
  const unwritten = new Map<string, PanelStep[]>()
  const unsent = new Map<string, PanelStep[]>()
  let writing: Promise<void> = Promise.resolve()
  let writeTimer: ReturnType<typeof setTimeout> | undefined
  let sendTimer: ReturnType<typeof setTimeout> | undefined
  const sessionFile = (agent: string) => `${o.root}/${sessionPath(S.N.dir, agent)}`
  const writeSteps = () => {
    writeTimer = undefined
    const batch = [...unwritten]
    unwritten.clear()
    writing = writing
      .then(async () => {
        for (const [agent, list] of batch) {
          const file = sessionFile(agent)
          await mkdir(dirname(file), { recursive: true })
          await appendFile(file, list.map(x => `${JSON.stringify(x)}\n`).join(''))
        }
      })
      .catch(err => log(`couldn't write an agent's session: ${(err as Error).message}`))
  }
  // words go out joined, a few times a second; any other step goes at once, after the words before it
  const sendWords = (only?: string) => {
    for (const [agent, list] of [...unsent]) {
      if (only !== undefined && agent !== only) continue
      unsent.delete(agent)
      for (const x of list) o.onStep?.(agent, x)
    }
    if (!unsent.size && sendTimer) (clearTimeout(sendTimer), (sendTimer = undefined))
  }
  const onStep = (agent: string, s: SdkStep) => {
    const step: PanelStep = { ...s, atMs: Date.now() }
    steps.set(agent, addStep(steps.get(agent) ?? [], step))
    unwritten.set(agent, addStep(unwritten.get(agent) ?? [], step))
    writeTimer ??= setTimeout(writeSteps, 1000)
    if (isWords(step)) {
      unsent.set(agent, addStep(unsent.get(agent) ?? [], step))
      sendTimer ??= setTimeout(() => ((sendTimer = undefined), sendWords()), 300)
      return
    }
    sendWords(agent)
    o.onStep?.(agent, step)
  }
  const guard = o.sdk.guard
  const agents = sdkAgents({
    sdk: o.sdk,
    model: o.workerModel ?? o.sdk.defaultModel,
    onEnd: (agentId, end) => agentFinished(ref.host!, agentId, end),
    onTool: async (agentId, tool, input) => answerText(tool, await toolCall(ref.host!, toolName(tool), agentId, input)),
    onStep,
    log,
    ...(guard ? { guard: (agentId: string, dir: string) => guard({ host: ref.host!, dir, agentId }) } : {}),
  })
  const leadTools = (): Record<string, SdkTool> =>
    Object.fromEntries(
      TOOLS().map(d => [
        d.name,
        {
          description: d.description,
          inputSchema: d.inputSchema as Record<string, unknown>,
          execute: async (input: Record<string, unknown>) => {
            const said = answerText(d.name, await toolCall(ref.host!, toolName(d.name), undefined, input))
            // org-mem is a file of its own, not in the published view: the panel reads it again on a redraw
            if (d.name === 'orgmem') redraw()
            return said
          },
        },
      ]),
    )
  // the lead loads the project's settings (AGENTS.md, rules, skills, MCP servers) and the plugins', never the user's
  // own: the user's hooks are for their editor's agents and don't run on it
  const lead = leadChat({
    sdk: o.sdk,
    cwd: o.root,
    model: o.leadModel ?? o.sdk.defaultModel,
    tools: leadTools,
    guide: () => leadGuideText(ref.host!),
    meanwhile: meanwhileForPrompt,
    onEvent: e => o.onLead?.(e),
    onStep: s => onStep(LEAD_AGENT, s),
    settings: ['project', 'plugins'],
    ...(guard ? { guard: call => guard({ host: ref.host!, dir: o.root })(call) } : {}),
  })
  const base = nodeHost({ root: o.root, agents, say: line => log(line), ...(o.sessionId ? { sessionId: o.sessionId } : {}), ...(o.pluginRoot ? { pluginRoot: o.pluginRoot } : {}) })
  // the board panel: the published view in memory, and the panel's view of it handed on after each publish; the
  // changed files of each task in review are read with git once per change of the task, and a checker's saved
  // report once (it doesn't change after)
  const project = o.root.split('/').filter(Boolean).pop() ?? o.root
  let published: SymccView = emptyView()
  let shown = panelView(published as PaneView, { project, dir: S.N.dir, name: S.N.name, nowMs: Date.now() })
  const changes = new Map<string, { at: string; files: DiffFile[] }>()
  const checkers = new Map<string, string>()
  const draw = async () => {
    const v = published as PaneView
    for (const t of v.tasks ?? []) {
      if (t.status !== 'review' || isAnswered(t as BoardTask) || changes.get(t.id)?.at === t.updated_at) continue
      changes.set(t.id, { at: t.updated_at, files: await changedFiles(ref.host!, intoOf(t), t).catch(() => []) })
    }
    for (const t of v.tasks ?? []) {
      const c = checkerOf(t)
      if (!c || checkers.has(c.file)) continue
      const text = await ref.host!.fs.read(join(o.root, c.file)).catch(() => null)
      if (text !== null) checkers.set(c.file, text)
    }
    const orgMem = await orgMemNow(ref.host!).catch(() => undefined)
    shown = panelView(v, { project, dir: S.N.dir, name: S.N.name, nowMs: Date.now(), changes: Object.fromEntries([...changes].map(([id, c]) => [id, c.files])), ...(orgMem ? { orgMem } : {}), checkers: Object.fromEntries(checkers) })
    o.onView?.(shown)
  }
  let drawing: Promise<void> = Promise.resolve()
  const redraw = () => void (drawing = drawing.then(draw).catch(err => log(`couldn't draw the board panel: ${(err as Error).message}`)))
  const memo = { opened: '', tab: '', scout: '' }
  const panel: PanelValues = {
    readOpened: async () => memo.opened,
    updateOpened: async change => (memo.opened = change(memo.opened)),
    readTab: async () => memo.tab,
    updateTab: async change => (memo.tab = change(memo.tab)),
    readScoutOpen: async () => memo.scout,
    updateScoutOpen: async change => (memo.scout = change(memo.scout)),
    readView: async () => published,
    updateView: async change => {
      published = change(published)
      redraw()
    },
  }
  const host: Host = {
    ...base,
    features: CURSOR_FEATURES,
    lead: { send: (text, how) => lead.send(text, 'symcc', how), usage: async () => ({}) },
    ui: {
      ...noUi,
      toast: text => o.onToast?.(text),
      status: text => o.onStatus?.(text),
      log: text => log(text),
      refresh: redraw,
      open: async () => (o.onOpen?.(), { isPlaced: true }),
      panel,
    },
  }
  // what a waiting task shows depends on the time too (a merge that just ended, a lane that has been merged a while)
  const ticks = host.clock.every(30_000, redraw)
  const command = async (name: string, args = '') => (await runCommand(host, name, args))?.text ?? `/${name} is not one of ${S.N.name}'s commands`
  const skills = () => listSkills(o.root, o.home ?? homedir())
  const worktrees = projectWorktrees(host, o.root, () => published.tasks ?? [], () => (published as PaneView).home_branch ?? '')
  let models: Promise<SdkModelInfo[]> | undefined
  ref.host = host
  useName(host)
  sessionStarting()
  await sessionStart(host)
  let closing: Promise<void> | undefined
  return {
    host,
    agents,
    lead,
    tool: async (name, input) => answerText(name, await toolCall(host, toolName(name), undefined, input)),
    command,
    async message(text, images) {
      const how = images?.length ? { images } : undefined
      const slash = /^\/([\w.:-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
      if (slash) {
        const [, name, rest = ''] = slash as unknown as [string, string, string | undefined]
        if (name === ANSWER_COMMAND().name) return { said: (await answerCommand(host, name, rest)).text }
        const answer = await runCommand(host, name, rest)
        if (answer?.isTextDisplayOnly) return { said: answer.text }
        const skill = answer ? undefined : (await skills()).find(s => s.name === name)
        if (answer || skill) {
          ownerTyped(text)
          await lead.send(answer ? answer.text : skillMessage(skill!, rest.trim()), 'owner', how)
          return {}
        }
      }
      ownerTyped(text)
      await lead.send(text, 'owner', how)
      return {}
    },
    async slash() {
      const listed: { name: string; description: string; argumentHint?: string }[] = [...COMMANDS(host.features), ANSWER_COMMAND()]
      const own = listed.map((c): SlashItem => ({ name: c.name, description: c.description, kind: 'symcc', ...(c.argumentHint ? { hint: c.argumentHint } : {}) }))
      const taken = new Set(own.map(c => c.name))
      const mine = (await skills()).filter(k => !taken.has(k.name)).map((k): SlashItem => ({ name: k.name, description: k.description, kind: 'skill', scope: k.scope, ...(k.argumentHint ? { hint: k.argumentHint } : {}) }))
      return [...own, ...mine]
    },
    models: () =>
      (models ??= (o.sdk.models?.() ?? Promise.resolve([])).catch(err => {
        models = undefined
        throw err
      })),
    view: () => shown,
    steps: () => Object.fromEntries(steps),
    act: async (task, action, text) => {
      const c = actionCommand(S.N.name, task, action, text)
      const said = await command(c.command, c.args)
      if (action !== 'show-changes') return said
      // the summary, then each changed file's own diff, as one text the extension opens beside the board
      const files = changes.get(task)?.files ?? []
      const each = await Promise.all(files.map(f => command(c.command, `${task} ${f.file}`)))
      return [said, ...each].join('\n\n')
    },
    answer: async (id, text) => (await answerCommand(host, `${S.N.name}-answer`, `${id} ${text}`)).text,
    mode: mode => command(`${S.N.name}-mode`, mode),
    runScout: name => command(`${S.N.name}-scout`, name),
    forget: (n, key) => command(`${S.N.name}-settings`, `orgmem delete ${n} ${key}`),
    worktrees,
    quiet: () =>
      (S.startupDone || S.guardOnly) && agents.running() === 0 && !lead.busy() && workers.size === 0 && starting.size === 0 && queuedWorkers.size === 0 && finishing.size === 0 && approving.size === 0 && scoutRuns.size === 0 && checkerRuns.size === 0,
    close: why =>
      (closing ??= (async () => {
        ticks.cancel()
        // a worker start still on its way is waited for, so its task goes back to "todo" instead of staying "doing" (T-652)
        for (const until = Date.now() + 60_000; starting.size > 0 && Date.now() < until; ) await host.clock.sleep(50)
        await stopForQuit(host, why ?? `the ${o.sdk.name} session ended`).catch(() => [] as string[])
        await agents.stopAll()
        await lead.close()
        await o.sdk.close?.().catch(err => log(`couldn't stop ${o.sdk.name}'s agents: ${(err as Error).message}`))
        sendWords()
        if (writeTimer) clearTimeout(writeTimer)
        writeSteps()
        await writing
        await sessionEnd(host)
      })()),
  }
}
