// T-922: symcc from Slack through DAM. DAM runs a Claude Code session per Slack thread (headless, through ACP) and
// only sends to Slack what the agent posts with DAM's own tools (reply / post / start_thread); a plain reply is
// dropped. DAM's guard may also skip symcc's prompt.compose hook, so the lead may not have its guide. In such a
// session every board update carries a short core of the guide and ends with a line telling the lead to post its
// reply to Slack.

import { DEFAULT_NAME } from '../name'

/** The environment variable DAM sets in the sessions it runs, and its value there. */
export const DAM_ENV = 'PLATFORM_HARNESS'
export const DAM_ENV_VALUE = 'claude-code'

/** Whether an environment value of DAM_ENV marks a DAM session. */
export const isDamValue = (value: string | undefined) => (value ?? '').trim() === DAM_ENV_VALUE

/**
 * T-929: DAM_ENV is set for DAM's whole image (terminal windows too); only DAM's Slack (chat) path runs Claude Code
 * through this program, so its path marks a DAM chat session.
 */
export const DAM_EXE_ENV = 'CLAUDE_CODE_EXECUTABLE'

/** Whether a DAM_EXE_ENV value is DAM's chat program (…/harness-claude). */
export const isDamChatExe = (value: string | undefined) => /(^|[/\\])harness-claude$/.test((value ?? '').trim())

/** The last line of every board update in a DAM session: plain replies never reach Slack, so post it there. */
export const DAM_POST_LINE = "Slack (DAM): plain replies never reach Slack. Post your short reply (same shape as above) to this Slack thread with DAM's reply tool; use DAM's post tool if there is no thread."

/** T-1098: the last line of a board update in a chat-app session (chat = 'dam', or a channel server's name): post the reply to the chat. */
export const chatPostLine = (chat: string) =>
  chat === 'dam' ? DAM_POST_LINE : `Chat (${chat}): plain replies never reach the chat. Post your short reply (same shape as above) to it with the ${chat} server's reply tool.`

/** The short core of the lead's guide (the reply shape and the main rules), for a DAM session, where the full guide may be missing. */
export const damGuideCore = (name: string = DEFAULT_NAME) =>
  [
    `Lead guide (short; the full ${name} guide may be missing in this session):`,
    `- You are the lead of the ${name} board: turn the owner's wishes into small tasks with ${name} add (why, origin_by, request = the owner's exact words, files incl. tests, after = tasks that share files); don't do the tasks' work yourself; talk about tasks by id (T-3).`,
    `- Mode review: ask the owner before each ${name} add. Put the owner's answer to a waiting task into it with ${name} change answer: their words.`,
    `- Reply shape: news first, no lead-in. One line per task: "<mark> T-n  <what happened>   <what it means, ≤ 8 words>" (✓ merged, ✗ failed, ↺ retrying, ▶ started, ◐ needs your review); a routine update is one short line at most.`,
    `- A question: the question in one sentence, then the choices numbered, then "(reply with the number or your own words)".`,
  ].join('\n')

/** The lead guide line for a window with the board on but not driving (T-922, T-999): tasks still work here; the driving window runs the work. */
export const notDrivingText = (name: string = DEFAULT_NAME) => `This window does not drive the board, but you still add, change, drop, approve and answer tasks here as usual; the window that drives runs the workers, scouts and merges. Mention /${name}-drive only when the owner wants this window to run the work itself.`
