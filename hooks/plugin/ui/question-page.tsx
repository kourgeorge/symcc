// The board panel's page for one question for the owner (see core/questions.ts): the question, one button per
// option and "Answer…" for their own words (the same answer box as a waiting task's page). An answer closes it,
// the lead hears it in its next board update, and the page goes back to the list.
import { answerChoices, answerKeys, type OwnerQuestion, type KeyHint } from '../../board'
import { S } from '../state'
import { type $, panelValues } from '../../claude/panel'
import { when } from '../tools'
import { answerOnBoard } from '../questions'
import type { PaneParts } from './parts'
import { answerBox } from './answer-box'
import { claudeHost } from '../../claude/host'

/** The keys at the bottom of a question's page: the answer keys, then b back. */
export const questionKeys = (options: readonly string[]): KeyHint[] => [...answerKeys(undefined, options), { key: 'b', word: 'back' }]

/** One question for the owner opened: what the lead asks, with a button per option and Answer…. */
export function questionPage($: $, pane: PaneParts, q: OwnerQuestion) {
  const { Box, Text, Button, act, C, footer, buttonRows } = pane
  const choices = answerChoices(undefined, q.options)
  if (S.answering !== null && S.answering !== q.id) S.answering = null
  const typing = !choices.length || S.answering === q.id
  const back = act(async () => ((S.answering = null), await panelValues($).updateOpened(() => '')))
  const cancelAnswer = () => ((S.answering = null), $.ui.invalidate('ui.render'))
  const send = (text: string) =>
    act(async () => {
      if (!text.trim()) return choices.length ? cancelAnswer() : back()
      S.answering = null
      $.ui.toast(S.N.toast(await answerOnBoard(claudeHost($), q.id, text)))
      await panelValues($).updateOpened(() => '')
    })
  const choicePress = (i: number) => (i === choices.length - 1 ? () => ((S.answering = q.id), $.ui.invalidate('ui.render')) : send(choices[i]!))
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text wrap="wrap">
          <Text bold color={C('claude')}>{q.id}</Text>
          <Text bold color={C('text')}>  Question for you</Text>
        </Text>
        <Text color={C('inactive')}>{`asked by the lead · ${when(q.asked_at)}`}</Text>
      </Box>
      {buttonRows([<Button key="back" label="Back" hotkey="b" onPress={back} />], 'question-actions')}
      {answerBox(pane, { question: q.text, choices, typing, onChoice: choicePress, onSubmit: value => send(value)(), onCancel: cancelAnswer })}
      {footer(questionKeys(q.options), 'question-keys')}
    </Box>
  )
}
