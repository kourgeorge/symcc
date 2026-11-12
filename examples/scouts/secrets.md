---
every_minutes: 240
---
Find secrets that are, or could end up, in git: API keys, tokens, passwords, private keys,
connection strings with passwords, cookies or session ids, .env-style files.

Where to look:
- Tracked files: `git ls-files`, then search them with `git grep -nIE` for common key
  patterns, for example `sk-[A-Za-z0-9]{20,}`, `ghp_[A-Za-z0-9]{30,}`, `github_pat_`,
  `xox[abp]-`, `AKIA[0-9A-Z]{16}`, `BEGIN [A-Z ]*PRIVATE KEY`, `://[^/:@ ]+:[^/@ ]+@` and
  `(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][^'"]{8,}`. Also look for file
  names like `.env*`, `*.pem`, `*.key`, `id_rsa*`, `*.p12`, `credentials*`, and database
  files (`*.sqlite`, `*.db`) holding user data.
- Untracked files that git would pick up: `git status --porcelain --untracked-files=all`,
  then `git check-ignore -v <file>` to confirm a file is NOT ignored. A secret-looking file
  here is one `git add .` away from a commit.
- `.gitignore`: check it covers `.env`, `.env.*`, keys and the local config the code reads
  (look at what the code loads: environment variables, config files, token caches). Report
  a missing rule only together with a real file or code path it should cover.
- Git history, recent part only: `git log -p -n 30` for secrets that were committed and
  later deleted (they are still in history).
- Places the code writes logs, prompts or reports (the tool's own files, debug output, test
  output, snapshots): could a token from the environment end up in a tracked file?

Rules:
- NEVER print a full secret. Show only file:line, the kind of secret, and its first 4
  characters followed by "…".
- Test fixtures, examples and obvious placeholders (`xxx`, `your-key-here`, `changeme`, fake
  values under tests/) are not findings unless they look real.
- For each finding, say whether it is tracked, untracked-not-ignored, or history-only, and
  the fix: remove it and rotate the key, add an ignore rule, or move it to an environment
  variable.
- If you find nothing, answer `NOTHING`.
