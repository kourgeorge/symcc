// The fixed texts of a checker's prompt: a fresh worker that tries to break a finished change before it merges (the
// checker setting; see hooks/core/checker.ts). The prompt is put together from sections, in a fixed order
// (hooks/core/prompt-sections.ts); this file holds the sections that say the same for every task. It is built-in only;
// the checker role (roles/checker.md, the Roles page) fills its {{role}} section and is how you shape what a checker
// does. The other {{...}} words are filled in for each task, and {{task.<path>}} gives any field of the task.
export const TEXT: Record<string, string> = {
  intro: `You are a {{name}} checker. A worker has just finished task {{task_id}}. Before it joins the merge queue (where its tests run, then it merges), your job is to try to break it.`,
  where: `The change is in this folder, on branch {{branch}} (everything is committed):
  {{folder}}
Everything you need is in that folder or below: the task, its changed files and the diff. Work only in that folder; there is no need to look at the board or the main project folder.`,
  look_for: `- cases the change now handles wrongly (edge cases, error paths, inputs it did not think of);
- old behavior it lost or broke;
- a new test that would pass even without the change (so it doesn't really check it), where your own probe shows it;
- anything the task asks for ("what to do" and "done when") that the change does not do.`,
  changed: `{{changed_files}}`,
  tests: `{{tests}}`,
  diff: `The change (from where it left {{into}}; run \`git diff {{into}}...HEAD\` in the folder for all of it):
\`\`\`diff
{{diff}}
\`\`\``,
  rules: `You may read anything there and run commands. Do NOT edit, create or delete files in that folder (outside .scratch/) or anywhere in the project; anything you change there is thrown away.
Put any throwaway script or note under .scratch/ in that folder (never commit it); /tmp also works.
Probe with bun -e "…" (or node -e "…") run from /tmp, importing the code by its absolute path in your folder (for example: cd /tmp && bun -e "const m = await import('{{folder}}/hooks/board.ts'); console.log(m)"); if you need a file, a here-document is fine only when its text has no git command and no path into the main project folder (build such words from pieces, like 'gi'+'t'). In Bash, use full paths: a ".." path piece, or a cd above the project, is refused.
Do NOT run git commands that change anything (commit, reset, checkout, switch, stash, rebase, merge, branch, tag, push...), not even in a throwaway repository: the branch must stay where the worker left it, and if you move it, it is put back. Read-only ones like git diff, git log, git show and git status are fine. A git command counts wherever a command starts (also after &&, ;, | or inside sh -c "...").
Don't run long commands in the background. Run your own probes with the Bash tool's longest timeout (timeout: 600000); if one still gets moved to the background, wait for it (read its output until it finishes) before you answer: ending your turn ends your work, so never answer that you will continue later.`,
  done: `End your answer with exactly one of these (only optional "Learned:" lines, when asked for below, may come after it):
- the single word OK on its own last line, when you found no real problem;
- or one final block, exactly in this shape: a line that is only "Problems:", then one problem per line, each starting with "- ", nothing after the block:
Problems:
- <file:line> — <the problem>; <how to show it (a command, an input, or a test that fails)>
Only list real problems you checked; no style wishes.
{{learned}}`,
}

// All the fixed words in one text (the built-in text a host checks for tool names); the real prompt is built by hooks/core/prompt-sections.ts.
export default Object.values(TEXT).join('\n\n')
