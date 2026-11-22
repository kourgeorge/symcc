// How a task's test_output says it holds a checker's report (see checkerOutput in checker.ts). Kept apart so the prompt sections can read it.

/** The first line of a task's test_output when it holds a checker's report rather than test output. */
export const CHECKER_MARK = 'The checker found these problems:'

/** Whether test_output `s` holds a checker's report (see checkerOutput). */
export const isCheckerOutput = (s: string | undefined): boolean => typeof s === 'string' && s.startsWith(CHECKER_MARK)
