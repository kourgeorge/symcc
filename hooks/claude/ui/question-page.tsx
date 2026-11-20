// The board panel's page for one question for the owner (see core/questions.ts): the question, one button per
// option and "Answer…" for their own words (the same answer box as a waiting task's page). An answer closes it,
// the lead hears it in its next board update, and the page goes back to the list.
import { answerChoices, type OwnerQuestion, type KeyHint } from '../../board'
import { S } from '../../app/state'
import { type $, panelValues } from '../panel'
import { when } from '../../core/days'
import { answerOnBoard } from '../../app/questions'
import type { PaneParts } from './parts'
import { answerBox } from './answer-box'
import { vsCallout, vsFooter, vsHref, vsLink, mdLink } from './vscode'
import { claudeHost } from '../host'

/** The keys at the bottom of a question's page: only b back; the answer keys are told under the buttons (choiceKeysHint). */
export const questionKeys = (): KeyHint[] => [{ key: 'b', word: 'back' }]

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
  if (pane.vscode) return questionPageVs(pane, q, choices.slice(0, -1), back, send)
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
      {footer(questionKeys(), 'question-keys')}
    </Box>
  )
}

/** The question's page in VS Code: a "← Tasks" link back, then the question in a box with its answers as Buttons in a
 *  row that wraps (the first the primary) and a "Your answer" box always there. VS Code draws every Button as a filled
 *  box that never wraps its label, so the terminal's row of "1 Yes  2 No  3 Answer…" ran together there. No key hints. */
function questionPageVs(pane: PaneParts, q: OwnerQuestion, answers: string[], back: () => void, send: (text: string) => () => void) {
  const { Box, Text, Button, Input, C, vs } = pane
  const backHref = vsHref('page', 'back/question-back')
  return (
    <Box flexDirection="column" gap={1}>
      {vsLink(vs, 'question-back', mdLink('← Tasks', backHref), [[backHref, back]])}
      <Box key="vs-question-head" flexDirection="column">
        <Text key="vs-question-title" wrap="wrap">
          <Text bold color={C('claude')}>{q.id}</Text>
          <Text bold color={C('text')}>  Question for you</Text>
        </Text>
        <Text key="vs-question-asked" wrap="wrap" color={C('inactive')}>{`asked by the lead · ${when(q.asked_at)}`}</Text>
      </Box>
      {vsCallout(vs, 'vs-sec-question', '?', 'The lead asks', 'warning', [
        <Text key="vs-question" wrap="wrap" bold color={C('text')}>{q.text}</Text>,
        answers.length ? (
          <Box key="vs-answers" flexDirection="row" flexWrap="wrap" gap={1}>
            {answers.map((c, i) => (
              <Button key={`choice-${i + 1}`} label={c} variant={i === 0 ? 'primary' : 'secondary'} autoFocus={i === 0 ? true : undefined} onPress={send(c)} />
            ))}
          </Box>
        ) : null,
        <Input key="answer" label="Your answer" submitLabel="Send" placeholder={answers.length ? 'or type your own answer' : 'type your answer'} autoFocus={answers.length ? undefined : true} onSubmit={value => send(value)()} />,
      ].filter(Boolean) as never[])}
      {vsFooter(vs, 'question-keys')}
    </Box>
  )
}
