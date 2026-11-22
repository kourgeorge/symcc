// The heading over kept test output in a worker's prompt. Kept apart (no imports) so the prompt sections can read it.

/** The worker prompt's heading over kept test output (testTail), saying what follows: the failing tests and the end, only the end, or all of it. */
export function testOutputHeading(kept: string): string {
  const lines = kept.split('\n')
  const head = lines[0]?.startsWith('$ ') ? lines[1] : lines[0]
  if (head && /^\d+ failed tests?, each "\(fail\)" line/.test(head)) return 'The failing tests and the end of the test output:'
  return kept.startsWith('…') ? 'The end of the test output:' : 'The test output:'
}
