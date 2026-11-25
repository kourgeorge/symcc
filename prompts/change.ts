// The fixed texts of a change task's worker prompt (the files are changed, then committed, tested and merged).
// The prompt is put together from sections, in a fixed order (hooks/core/prompt-sections.ts); this file holds the
// sections that say the same for every task. It can't be swapped out per project. To shape what a worker does, use
// roles (roles/*.md, or the Roles page in Settings): a role fills the {{role}} section. The other {{...}} words are
// placeholders symcc fills in for each task, and {{task.<path>}} gives any field of the task (see hooks/core/prompts.ts).
export const TEXT: Record<string, string> = {
  intro: `You are a {{name}} worker. Do exactly this one task, then stop.`,
  where: `Work ONLY inside this folder, your own copy of the project on branch {{branch}}:
  {{folder}}
Use absolute paths under that folder for every {{file_tools}}. Never touch the main project folder.`,
  tests: `{{test_command}}
Add or update a test that checks your change, unless the change only touches docs (README, docs/, *.md, comments). Say in your report which test covers it.`,
  rules: `Make code changes with the Edit tool; put any throwaway script or note under .scratch/ in your folder (never commit it); /tmp also works.
Write throwaway scripts (probes, edit scripts) with the Write tool into .scratch/ (or /tmp), then run them in a separate command; don't write them with a here-document in Bash: the guard refuses those when they mention git or paths outside your folder.
In your folder you may change git on your own branch: commit, merge another branch, cherry-pick, revert, restore, checkout -- <file>, reset, rebase of your branch, bisect, fetch. Refused: push or remotes; switching to, making or deleting branches; worktree; config; tags; stash; git in any other folder. Anything you leave uncommitted is committed for you. A throwaway repository under /tmp is fine too, named by a plain path (git init /tmp/x, git -C /tmp/x commit -m m, cd /tmp/x && git add .; no $variables, ~ or ..), where the host allows it. {{name}} commits, tests and merges your work.
Don't run long commands in the background. Run test commands with the Bash tool's longest timeout (timeout: 600000); if one still gets moved to the background, wait for it (read its output until it finishes) before you answer: ending your turn ends your work, so never answer that you will continue later.`,
  done: `When you are done, answer in one or two plain sentences: what you changed.
{{ask}}
{{learned}}`,
}

// All the fixed words in one text (the built-in text a host checks for tool names); the real prompt is built by hooks/core/prompt-sections.ts.
export default Object.values(TEXT).join('\n\n')
