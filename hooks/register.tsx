// symcc (the name comes from plugin.json, see name.ts): the overview is at the top of app/symcc.ts.
//
// This file only wires Claude Code's events to symcc's entry points in app/symcc.ts (which any host can call), with
// claudeHost($) (claude/host.ts) as the Host. What only Claude Code has stays here: its event shapes, its agent
// types (claude/registration.ts), plan mode (claude/plan.ts) and the board panel's render hooks (claude/ui/).
import type { Register } from 'claude-code'
import { claudeNames, isWorkerType } from './claude/agent-types'
import { claudeHost } from './claude/host'
import { seeMainMode, seeSpawnMode, seeAttachment } from './claude/plan'
import { registerAll } from './claude/registration'
import { editTouch, fileTouch } from './claude/tools'
import type { $ } from './claude/panel'
import { usageTokens, turnEnd } from './claude/usage'
import { noteBackground, stopSeen, takeBackground } from './claude/background'
import { sessionStarting, sessionStart, sessionCleared, sessionEnd, leadGuideText, ownerTyped, toolCall, otherToolDone, toolCallFailed, toolCheck, toolCheckFailed, agentFinished, runCommand } from './app/symcc'
import { S, useName } from './app/state'
import { hookFailed } from './app/ask'
import { popupCall } from './app/questions'
import { spawnFailedText, shellCwd } from './core/path-guard'
import { DEFAULT_NAME, cleanName } from './name'
import { drainStarts, leadTurn } from './app/starts'
import { findRoot } from './app/store'
import { renderAbovePrompt } from './claude/ui/above-prompt'
import { arrowMove, noteFocus } from './claude/ui/arrows'
import { paneClosing } from './claude/ui/esc'
import { renderPane } from './claude/ui/pane'

export { BOARD_OPENED } from './app/symcc'
export { registerAll } from './claude/registration'

/** The plan mode a main session event carries (see seeMainMode). */
function mainMode($: $, e: { permission_mode?: string; agent_id?: string }) {
  useName(claudeHost($))
  seeMainMode(claudeHost($), e)
}

/**
 * Whether agent type `agent` is one of the plugin's own (a worker or scout type). Checked under every name the
 * plugin may go by (the one in use, the one in plugin.json, the default), so a hook that failed still knows them.
 */
export function symccAgentType($: $, agent: unknown): boolean {
  const names = new Set([DEFAULT_NAME])
  names.add(nameNow())
  try {
    names.add(cleanName($.plugin.name))
  } catch {
    // no plugin name to read
  }
  const type = typeof agent === 'string' ? agent : ''
  return [...names].some(n => isWorkerType(type, n) || type === claudeNames(n).scout)
}

/** The plugin's name in use, or the default one when even that can't be read. */
function nameNow(): string {
  try {
    return S.N.name
  } catch {
    return DEFAULT_NAME
  }
}

/** Logs once that hook `hook` failed and what was done instead (see hookFailed); answers the short reason. Never throws. */
function failed($: $, hook: string, error: { kind?: string; message?: string } | undefined, outcome: string): string {
  try {
    return hookFailed(claudeHost($), hook, error, outcome)
  } catch {
    return 'it failed'
  }
}

/** What the .catch of hook `hook`, whose failure must change nothing, answers: the event goes on as if the plugin weren't there. */
function passOn<E, R>($: $, hook: string, e: E, next: ((e: E) => R) & { readonly error: { kind?: string; message?: string } }): R {
  failed($, hook, next.error, "it was passed on as if symcc weren't there")
  return next(e)
}

export const register: Register = on => {
  // Every hook starts with useName(host), so S.N (the plugin's name) and S.W (Claude Code's words, claude/host.ts) are right everywhere.
  on('session.start', async ($, e, next) => {
    const host = claudeHost($)
    useName(host)
    sessionStarting()
    // Register the agent types, tools and commands first, before anything that can wait or throw.
    await registerAll($)
    const result = await next(e)
    await sessionStart(host)
    // agents start only inside session.start, the main loop's turn.start and turn.complete (see app/starts.ts)
    await drainStarts(host)
    return result
  })

  on('session.end', async ($, e, next) => {
    const host = claudeHost($)
    useName(host)
    // /clear ends the session, but the process goes on under a new session id (see sessionCleared).
    if ((e as { reason?: string }).reason === 'clear') {
      const result = await next(e)
      await sessionCleared(host)
      return result
    }
    await sessionEnd(host)
    return next(e)
  })

  // The lead's guide, appended to the system prompt (prompt.compose is not cached: read on every render).
  on('prompt.compose', async ($, e, next) => {
    const host = claudeHost($)
    useName(host)
    const r = await next(e)
    const text = await leadGuideText(host)
    return text === undefined ? r : { sections: [...r.sections, { id: `${S.N.name}:lead`, text, scope: 'session' as const }] }
  })

  // The owner's typed prompt (terminal or phone/web bridge); slash commands, hidden prompts and symcc's own board updates are left out.
  on('prompt.submit', async ($, e, next) => {
    useName(claudeHost($))
    const r = await next(e)
    const kind = e.origin?.kind
    if ((kind === 'composer' || kind === 'bridge') && !e.command && !e.isMeta && 'text' in r && typeof r.text === 'string') ownerTyped(r.text)
    return r
  }).catch(($, e, next) => passOn($, 'prompt.submit', e, next))

  // Workers and scouts only reach the agents through the plugin itself (the name is only known once a hook runs).
  on('agent.offer', ($, e, next) => {
    useName(claudeHost($))
    return isWorkerType(e.agent, S.N.name) || e.agent === claudeNames(S.N.name).scout ? { isOffered: false } : next(e)
  }).catch(($, e, next) => {
    // Failed: symcc's types are still hidden (else the lead's model could start a "worker" itself); any other is offered as usual.
    const ours = symccAgentType($, e?.agent)
    failed($, 'agent.offer', next.error, ours ? "symcc's agent type was hidden" : 'the agent type was offered as usual')
    return ours ? { isOffered: false } : next(e)
  })

  // One tool.call hook for every tool: symcc's own run in toolCall; any other runs, then otherToolDone looks at what it changed.
  on('tool.call', async ($, e, next) => {
    const host = claudeHost($)
    useName(host)
    const call = e as unknown as Record<string, unknown>
    const ours = await toolCall(host, e.tool, e.agentId, call)
    if (ours) return ours
    // T-579: the lead's AskUserQuestion also goes on the board; whichever the owner answers first closes the other (see popupCall)
    if (!e.agentId && e.tool === S.W.askPopup) {
      const notice = (text: string | undefined) => {
        try {
          if (e.tool_use_id) $.ui.notice(e.tool_use_id, text)
        } catch {
          // no line under the dialog: the board still takes the answer
        }
      }
      return (await popupCall(host, e.agentId, call, () => next(e), notice)) as Awaited<ReturnType<typeof next>>
    }
    const r = await next(e)
    // a Bash command an agent sent to the background: noted as its own (see claude/background.ts)
    noteBackground(e.agentId, call, r)
    otherToolDone(host, fileTouch(call))
    return r
  }).catch(($, e, next) => {
    // The hook threw or ran out of time. Once it had passed the call on (next), that answer stands.
    if (next.called) return next(e)
    useName(claudeHost($))
    return toolCallFailed(claudeHost($), e.tool, e.agentId, next.error) ?? next(e)
  })

  // A worker's edit outside its files, or reaching the owner's copy, is refused (see toolCheck); everything else is decided as usual.
  on('tool.check', async ($, e, next) => {
    const host = claudeHost($)
    useName(host)
    // read inside the hook, $.session.cwd() is the calling agent's own folder, which follows its shell's cd; when it
    // can't be read, nothing earlier is trusted: ".." words are judged from deeper folders too (shellCwd, T-671)
    const cwd = e.agentId && e.tool === 'Bash' ? shellCwd(await Promise.resolve().then(() => $.session.cwd()).catch(() => undefined)) : undefined
    // an error in toolCheck is not swallowed here: the .catch below refuses the call of symcc's own agents
    const deny = await toolCheck(host, e.agentId, editTouch(e.tool, e.input), cwd)
    return deny ? { decision: 'deny', reason: deny } : next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    useName(claudeHost($))
    const deny = toolCheckFailed(claudeHost($), e.agentId, next.error)
    return deny ? { decision: 'deny', reason: deny } : next(e)
  })

  // The main loop's turn starts (the owner's prompt, or symcc's own board update that woke the lead): queued agents start here.
  on('turn.start', async ($, e, next) => {
    const host = claudeHost($)
    useName(host)
    const r = await next(e)
    if (!e.agentId) {
      leadTurn(true)
      await drainStarts(host)
    }
    return r
  })

  // An agent's run ended: its final answer arrives here, with why it ended (e.reason).
  on('turn.complete', async ($, e, next) => {
    const host = claudeHost($)
    useName(host)
    const r = await next(e)
    agentFinished(host, e.agentId, { answer: e.answer, end: turnEnd(e, takeBackground(e.agentId)), isAborted: e.isAborted, tokens: usageTokens(e.usage) })
    if (!e.agentId) leadTurn(false)
    // any turn's end (the lead's or an agent's) starts the queued agents (see app/starts.ts)
    await drainStarts(host)
    return r
  })

  // symcc's slash commands are registered under the plugin's name, so matched in runCommand.
  on('command.run', async ($, e, next) => {
    const host = claudeHost($)
    useName(host)
    return (await runCommand(host, e.command, e.args)) ?? next(e)
  }).catch(($, e, next) => passOn($, 'command.run', e, next))

  // Plan mode (see core/plan.ts): Claude Code has no call for the mode and no event when it changes, so it is
  // read from these events of the main session (never a worker's or scout's). Each passes the event on unchanged.
  on('classic.UserPromptSubmit', async ($, e, next) => (mainMode($, e), next(e))).catch(($, e, next) => passOn($, 'classic.UserPromptSubmit', e, next))
  on('classic.Stop', async ($, e, next) => (mainMode($, e), next(e))).catch(($, e, next) => passOn($, 'classic.Stop', e, next))
  on('classic.SessionStart', async ($, e, next) => (mainMode($, e), next(e))).catch(($, e, next) => passOn($, 'classic.SessionStart', e, next))
  // A subagent stops: its own background commands still running (of the session's list) are kept for its turn.complete.
  on('classic.SubagentStop', async ($, e, next) => (stopSeen(e.agent_id, e.background_tasks), next(e))).catch(($, e, next) => passOn($, 'classic.SubagentStop', e, next))
  on('agent.spawn', async ($, e, next) => (useName(claudeHost($)), seeSpawnMode(claudeHost($), e), next(e))).catch(($, e, next) => {
    // Failed before passing it on: the start of one of symcc's own agent types is refused, any other goes on.
    if (next.called) return next(e)
    const ours = symccAgentType($, e?.subagentType)
    const reason = failed($, 'agent.spawn', next.error, ours ? "the start of symcc's agent type was refused" : 'the agent started as usual')
    return ours ? { deny: spawnFailedText(nameNow(), reason) } : next(e)
  })
  on('prompt.attachment', async ($, e, next) => (useName(claudeHost($)), seeAttachment(claudeHost($), e), next(e)))

  // The band above the prompt: the board, always in view inside Claude Code's own screen.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    useName(claudeHost($))
    await findRoot(claudeHost($))
    return renderAbovePrompt($, e, next)
  })

  // The board panel closing: Esc goes one step back and keeps it open (see paneClosing).
  on('ui.close', async ($, e, next) => {
    useName(claudeHost($))
    if (e.id !== S.N.pane) return next(e)
    return (await paneClosing($, e.origin.kind)) ? { value: undefined } : next(e)
  }).catch(($, e, next) => passOn($, 'ui.close', e, next))

  // The board panel: the list (each task a button), or one task with its actions.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    useName(claudeHost($))
    await findRoot(claudeHost($))
    return renderPane($, e, next)
  })

  // ↑↓ on the board panel's lists move the focus to the row above or below; see ui/arrows.ts.
  on('ui.focus', { component: 'Pane' }, async ($, e, next) => {
    useName(claudeHost($))
    return noteFocus($, e, next)
  }).catch(($, e, next) => passOn($, 'ui.focus', e, next))
  on('ui.scroll', { component: 'Pane' }, async ($, e, next) => {
    useName(claudeHost($))
    return arrowMove($, e, next)
  }).catch(($, e, next) => passOn($, 'ui.scroll', e, next))
}
