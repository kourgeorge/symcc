// The answer box shared by a waiting task's page and a question's page: the question, its choices as numbered lines
// ("1. Yes", T-651; number keys 1-9 pick one, told in a dim line under them), and the "Your answer" box once Answer… is pressed (or when there are no choices).
import { boxHint, choiceLines } from '../../board'
import { wrapSegs, type Seg } from '../../core/details'
import type { PaneParts } from './parts'

/** What is typed in an answer box, by task or question id (T-917): kept over redraws (a resize redraws the page, and
 *  a field drawn without a value would come back empty) until it is sent or cancelled. */
export const answerDrafts = new Map<string, string>()

/** The most rows a typing box grows to; a longer text scrolls inside it, the cursor still in view. */
export const MAX_FIELD_ROWS = 12

/** How many rows a typing box needs to show all of `text` in a pane `width` columns wide, its `label` drawn before
 *  the field on the terminal: one while it fits on a line, then one more per wrapped line, at most MAX_FIELD_ROWS. A
 *  field of 2 rows or more wraps its text (a one-row field would slide it sideways, out of sight). */
export function fieldRows(text: string, width: number, label = ''): number {
  const room = Math.max(8, answerRoom(width) - label.length - 2)
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil((l.length + 1) / room)), 0)
  return Math.min(MAX_FIELD_ROWS, Math.max(1, lines))
}

/** The "asks: …" question as lines that fit `room` columns (T-917: one long line ran past the box's border on the
 *  terminal): "asks: " starts the first line, the question's own line breaks are kept. */
export function questionLines(question: string, room: number): Seg[][] {
  return question.split('\n').flatMap((p, i) => {
    const segs: Seg[] = i ? [{ text: p, color: 'text' }] : [{ text: 'asks: ', color: 'warning', bold: true }, { text: p, color: 'text' }]
    const lines = wrapSegs(segs, room)
    return lines.length ? lines : [[]]
  })
}

export type AnswerBox = {
  /** the task's or question's id: its typed answer is kept under it (answerDrafts) */
  id: string
  /** draws the page again (the field grows as the answer gets longer) */
  redraw: () => void
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
  /** [Cancel] (key c): back to the buttons */
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
  const label = 'Your answer'
  const draft = answerDrafts.get(a.id) ?? ''
  const onInput = (value: string) => {
    const before = fieldRows(answerDrafts.get(a.id) ?? '', width, label)
    answerDrafts.set(a.id, value)
    if (fieldRows(value, width, label) !== before) a.redraw()
  }
  const onSubmit = (value: string) => {
    answerDrafts.delete(a.id)
    a.onSubmit(value)
  }
  const onCancel = () => {
    answerDrafts.delete(a.id)
    a.onCancel()
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
      {terminal ? (
        // the terminal gets the question already cut into lines that fit inside the box
        questionLines(a.question, room).map(l => (
          <Text>
            {l.map(s => (
              <Text bold={s.bold || undefined} color={C(s.color)}>
                {s.text}
              </Text>
            ))}
          </Text>
        ))
      ) : (
        // desktop and mobile wrap a Text inside its box themselves
        <Text>
          <Text bold color={C('warning')}>asks: </Text>
          <Text color={C('text')}>{a.question}</Text>
        </Text>
      )}
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
      {a.typing && (
        // the field keeps what was typed (value) and grows with it (rows), so a long answer wraps in sight, and a
        // redraw at another width shows the same text again
        <Input key="answer" label={label} placeholder="type and press Enter" value={draft} rows={fieldRows(draft, width, label)} autoFocus onInput={onInput} onSubmit={onSubmit} />
      )}
      {a.typing && a.choices.length > 0 && (
        <Box key="answer-cancel-row" flexDirection="column">
          {terminal ? (
            <Button key="answer-cancel" plain label="Cancel" onPress={onCancel}>
              <Text color={C('text')}>[Cancel]</Text>
            </Button>
          ) : (
            <Button key="answer-cancel" label="Cancel" variant="secondary" onPress={onCancel} />
          )}
          {/* the c key sits on a hidden Button: a plain Button with a hotkey would draw "c: " before [Cancel] */}
          <Box key="answer-cancel-keys" display="none">
            <Button key="answer-cancel-key" label="Cancel" hotkey="c" onPress={onCancel} />
          </Box>
        </Box>
      )}
      {a.typing && <Text color={C('inactive')}>{boxHint('Enter sends', a.choices.length ? 'cancels' : 'goes back', a.choices.length ? 'c' : undefined)}</Text>}
    </Box>
  )
}
