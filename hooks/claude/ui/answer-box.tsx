// The answer box shared by a waiting task's page and a question's page: the question, one button per choice
// (with number keys), and the "Your answer" box once Answer… is pressed (or when there are no choices).
import { boxHint } from '../../board'
import type { PaneParts } from './parts'

export type AnswerBox = {
  /** the question shown after "asks: " */
  question: string
  /** the buttons, Answer… last (see answerChoices); [] for a plain question: only the box */
  choices: string[]
  /** the "Your answer" box is open */
  typing: boolean
  /** what button `i` does */
  onChoice: (i: number) => () => void
  /** Enter in the box (an empty one leaves it) */
  onSubmit: (value: string) => void
  /** Cancel (c): back to the buttons */
  onCancel: () => void
}

/** The answer box: the question, its choice buttons and the "Your answer" box. */
export function answerBox(pane: PaneParts, a: AnswerBox) {
  const { Box, Text, Button, Input, C, buttonRows } = pane
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
      <Text>
        <Text bold color={C('warning')}>asks: </Text>
        <Text color={C('text')}>{a.question}</Text>
      </Text>
      {a.choices.length > 0 &&
        buttonRows(
          a.choices.map((c, i) => <Button key={`choice-${i + 1}`} label={`${i + 1} ${c}`} hotkey={i < 9 ? String(i + 1) : undefined} autoFocus={i === 0 && !a.typing ? true : undefined} onPress={a.onChoice(i)} />),
          'answer-buttons',
        )}
      {a.typing && <Input key="answer" label="Your answer" placeholder="type and press Enter" autoFocus onSubmit={value => a.onSubmit(value)} />}
      {a.typing && a.choices.length > 0 && <Button key="answer-cancel" label="Cancel (c)" hotkey="c" onPress={a.onCancel} />}
      {a.typing && <Text color={C('inactive')}>{boxHint('Enter sends', a.choices.length ? 'cancels' : 'goes back')}</Text>}
    </Box>
  )
}
