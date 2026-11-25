// The owner's answer from a board panel that runs apart from the engine (OpenCode's TUI part, Cursor's webview): a
// waiting task's answer, its Allow / Don't allow for the files it asked for, or a board question's answer.
import type { Host } from '../host'
import { toolCall, type CommandAnswer } from './symcc'
import { S, toolName } from './state'
import { allowAskedFiles, refuseAskedFiles } from './tools'
import { answerOnBoard } from './questions'
import { noteForLead, brief } from './tell'
import { findRoot, load } from './store'
import { normId } from '../core/board-file'
import { normQid } from '../core/questions'
import { answerChoices } from '../core/panel'
import { answeredLeadLine } from '../core/commands'

/**
 * The slash command for a board panel's answers (T-466): a panel that runs apart from the engine sends what the owner
 * chose as "/<name>-answer <T-id or Q-id> <answer>". Claude Code's panel calls the same handlers directly
 * (task-page.tsx's sendAnswer and choicePress, question-page.tsx).
 */
export const ANSWER_COMMAND = () => ({ name: `${S.N.name}-answer`, description: `Answer a waiting task or a question for you: /${S.N.name}-answer T-5 <answer> (what the board panel sends)` })

/**
 * Runs /<name>-answer: a question (Q-3) is answered on the board (answerOnBoard: the lead is told at once); a waiting
 * task's Allow or Don't allow (for the files it asked for, see answerChoices) allows or refuses them; any other answer
 * goes to the task through the change tool, and the lead reads it next turn, as the Claude panel's answer does.
 */
export async function answerCommand(host: Host, _command: string, args: string): Promise<CommandAnswer> {
  const say = (text: string) => ({ text: S.N.toast(text), isTextDisplayOnly: true as const })
  const m = /^(\S+)\s+([\s\S]+)$/.exec(args.trim())
  const use = `use /${S.N.name}-answer T-5 <answer> (or Q-3 <answer>)`
  if (!m) return say(use)
  const rawId = m[1]!
  const text = m[2]!.trim()
  if (!(await findRoot(host)) || S.guardOnly) return say(`answer from the session in the project's main folder`)
  if (/^q-?\d+$/i.test(rawId)) return say(await answerOnBoard(host, normQid(rawId), text).catch((err: Error) => err.message))
  if (!/^t-?\d+$/i.test(rawId)) return say(use)
  const id = normId(rawId)
  const t = (await load(host)).tasks.find(x => x.id === id)
  if (!t) return say(`there is no ${id} on the board`)
  const [allow, refuse] = answerChoices(t.ask?.files, undefined)
  if (t.status === 'waiting' && t.ask?.files?.length && (text === allow || text === refuse)) return say(await (text === allow ? allowAskedFiles(host, id, true) : refuseAskedFiles(host, id, true)).catch((err: Error) => err.message))
  const r = await toolCall(host, toolName('change'), undefined, { task: id, answer: text })
  if (!r || 'deny' in r) return say(r ? r.deny : `couldn't answer ${id}`)
  // the lead hears of it only when the call really answered something: the task was waiting (or had a "more time?"
  // question) and isn't any more; the change tool's plain "already answered … nothing changed" texts change nothing
  const after = (await load(host)).tasks.find(x => x.id === id) as typeof t | undefined
  const answered = (t.status === 'waiting' && after?.status !== 'waiting') || (!!t.live?.time_ask && !after?.live?.time_ask)
  if (answered && !r.result.startsWith('error')) noteForLead(t.live?.time_ask ? `The owner answered ${id}'s "more time?" question: "${brief(text)}".` : answeredLeadLine(t, text, brief))
  return say(r.result)
}
