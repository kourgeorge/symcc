// The answer box shared by a waiting task's page and a question's page: the question, its choices as numbered lines
// ("1. Yes", T-651; number keys 1-9 pick one, told in a dim line under them), and the "Your answer" box once Answer… is pressed (or when there are no choices).
import { boxHint, choiceLines } from '../../board'
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

/** The dim line under the choice buttons: "keys 1-5 pick a choice" (only 1-9 have keys). */
export const choiceKeysHint = (n: number): string => {
  const last = Math.min(n, 9)
  return last > 1 ? `keys 1-${last} pick a choice` : 'key 1 picks it'
}

/** The room inside the answer box: the pane's width less its border and padding (one column each side). */
export const answerRoom = (width: number) => Math.max(10, width - 4)

/** The answer box: the question, its choices as numbered lines (like Claude Code's question pop-up) and the "Your answer" box.
 *  Each choice is "1. Invalid: …" wrapped inside the box (choiceLines), every line of it a `plain` Button that picks it, so a
 *  click anywhere on the choice picks it; the first line has the key `choice-1` and the choice as its label. The number keys
 *  belong to hidden Buttons (`choice-key-1`, a Box drawn `display="none"`, as the tab keys): a plain Button with a hotkey
 *  would draw its own "1: " before the line. Desktop and mobile draw every Button as a native button (which wraps its own
 *  label), so there each choice is one Button labelled "1. Invalid: …" instead of one per wrapped line. */
export function answerBox(pane: PaneParts, a: AnswerBox) {
  const { Box, Text, Button, Input, C, width } = pane
  const room = answerRoom(width)
  /** Only the terminal draws the wrapped choice lines as plain rows; desktop and mobile get one native button per choice. */
  const terminal = pane.vs.surface === 'terminal'
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
      <Text>
        <Text bold color={C('warning')}>asks: </Text>
        <Text color={C('text')}>{a.question}</Text>
      </Text>
      {a.choices.length > 0 && (
        <Box key="answer-choices" flexDirection="column">
          {a.choices.map((c, i) => (
            <Box key={`choice-row-${i + 1}`} flexDirection="column">
              {!terminal ? (
                // desktop and mobile draw every Button as a native button, which wraps its own label: one per choice
                <Button key={`choice-${i + 1}`} label={`${i + 1}. ${c}`} autoFocus={i === 0 && !a.typing ? true : undefined} onPress={a.onChoice(i)} />
              ) : choiceLines(c, i + 1, room).map((l, j) => (
                <Button key={j ? `choice-${i + 1}-line-${j + 1}` : `choice-${i + 1}`} plain label={c} autoFocus={i === 0 && j === 0 && !a.typing ? true : undefined} hover={{ inverse: true }} onPress={a.onChoice(i)}>
                  <Text color={C(c === 'Answer…' ? 'inactive' : 'text')}>{l}</Text>
                </Button>
              ))}
            </Box>
          ))}
          <Box key="choice-keys" display="none">
            {a.choices.slice(0, 9).map((c, i) => (
              <Button key={`choice-key-${i + 1}`} label={c} hotkey={String(i + 1)} onPress={a.onChoice(i)} />
            ))}
          </Box>
        </Box>
      )}
      {a.choices.length > 0 && !a.typing && <Text key="answer-keys" color={C('inactive')}>{choiceKeysHint(a.choices.length)}</Text>}
      {a.typing && <Input key="answer" label="Your answer" placeholder="type and press Enter" autoFocus onSubmit={value => a.onSubmit(value)} />}
      {a.typing && a.choices.length > 0 && <Button key="answer-cancel" label="Cancel (c)" hotkey="c" onPress={a.onCancel} />}
      {a.typing && <Text color={C('inactive')}>{boxHint('Enter sends', a.choices.length ? 'cancels' : 'goes back')}</Text>}
    </Box>
  )
}
