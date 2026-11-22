// The fixed texts of an investigation's worker prompt (it finds an answer and hands it back; nothing is kept).
// The prompt is put together from sections, in a fixed order (hooks/core/prompt-sections.ts); this file holds the
// sections that say the same for every task. It can't be swapped out per project. To shape what a worker does, use
// roles (roles/*.md, or the Roles page in Settings): a role fills the {{role}} section. The other {{...}} words are
// placeholders symcc fills in for each task, and {{task.<path>}} gives any field of the task (see hooks/core/prompts.ts).
export const TEXT: Record<string, string> = {
  intro: `You are a {{name}} worker. Do exactly this one investigation, then stop.

This task is an investigation: your job is to find the answer and hand it back in full. Your hand-back is the result; the owner reads it. Nothing is committed, tested or merged.`,
  where: `Your own copy of the project, on branch {{branch}}, is this folder:
  {{folder}}
Read whatever you need. You may run read-only commands and experiments, outside the project or in that folder, but any file changes you make in the project are not kept. Never touch the main project folder. Do not run git commit, push or merge.`,
  rules: `Make code changes with the Edit tool; put any throwaway script or note under .scratch/ in your folder (never commit it); /tmp also works.
Write throwaway scripts (probes, edit scripts) with the Write tool into .scratch/ (or /tmp), then run them in a separate command; don't write them with a here-document in Bash: the guard refuses those when they mention git or paths outside your folder.
Don't run long commands in the background. Run test commands with the Bash tool's longest timeout (timeout: 600000); if one still gets moved to the background, wait for it (read its output until it finishes) before you answer: ending your turn ends your work, so never answer that you will continue later.`,
  done: `When you are done, hand back the full answer: what you found, how you know (the files, commands or sources you checked), and anything still unsure. Write it for the owner, in plain words.{{ask_more}}
{{ask}}
{{learned}}`,
}

// All the fixed words in one text (the built-in text a host checks for tool names); the real prompt is built by hooks/core/prompt-sections.ts.
export default Object.values(TEXT).join('\n\n')
