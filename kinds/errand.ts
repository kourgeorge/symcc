// The built-in "errand" kind (see hooks/core/kinds.ts). To change it for your project, don't edit this file: use the Task types page
// (Settings) or the lead's kinds tool, which copy it to .symcc/kinds/errand.md, and that file is used instead.
export default `---
description: work outside the project or with nothing to merge (make or tidy files elsewhere such as ~/Desktop, gather, write, run something); ends done with a report
---
This is an errand, not an investigation: do the work the task asks for (for example tidy a folder outside the project, gather files, write something outside the project), then hand back a short report of what you did and where (paths, results). You may write outside the project where the task says (for example a folder on ~/Desktop). Changes inside your project copy are thrown away; nothing is committed, tested or merged. The task ends done on its own with your report kept.
`
