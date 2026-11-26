// The git guard (T-1062): one deny list, read from a command's plain text (no shell parsing), used both by the hook
// guard (gitWriteIn, gitPlaceOk) and by the Node host's Claude Code rules (gitDeniedRules). It stops honest
// mistakes; a script that builds its git command at run time still gets through (the merge-time scope check over
// every commit of a try is the backstop for files, T-1053).
import { folderList, insideAny, joinLines, resolvePath, type Folders } from './path-guard'

/** Every git command (`git --list-cmds=main` of git 2.55, and lfs), so none is missed (`send-pack` is a push by another name). */
const GIT_ALL = `add am annotate apply archimport archive backfill bisect blame branch bugreport bundle cat-file check-attr
check-ignore check-mailmap check-ref-format checkout checkout--worker checkout-index cherry cherry-pick clean
clone column commit commit-graph commit-tree config count-objects credential credential-cache
credential-cache--daemon credential-netrc credential-osxkeychain credential-store cvsexportcommit cvsimport
cvsserver daemon describe diagnose diff diff-files diff-index diff-pairs diff-tree difftool difftool--helper
fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref for-each-repo format-patch
format-rev fsck fsck-objects fsmonitor--daemon gc get-tar-commit-id grep hash-object help history hook
http-backend http-fetch http-push imap-send index-pack init init-db instaweb interpret-trailers jump
last-modified log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file
merge-index merge-octopus merge-one-file merge-ours merge-recursive merge-recursive-ours
merge-recursive-theirs merge-resolve merge-subtree merge-tree mergetool mktag mktree multi-pack-index mv
name-rev notes p4 pack-objects pack-redundant pack-refs patch-id pickaxe prune prune-packed pull push
quiltimport range-diff read-tree rebase receive-pack reflog refs remote remote-ext remote-fd remote-ftp
remote-ftps remote-http remote-https repack replace replay repo request-pull rerere reset restore rev-list
rev-parse revert rm send-email send-pack sh-i18n--envsubst shell shortlog show show-branch show-index
show-ref sparse-checkout stage stash status stripspace submodule submodule--helper subtree switch
symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info upload-archive
upload-archive--writer upload-pack url-parse var verify-commit verify-pack verify-tag version web--browse
whatchanged worktree write-tree lfs`.split(/\s+/)

/** The git commands that only read (and write no file, run no program, reach no other repository). */
const GIT_READS = new Set(`annotate blame cat-file check-attr check-ignore check-mailmap check-ref-format cherry column
count-objects describe diff diff-files diff-index diff-pairs diff-tree fmt-merge-msg for-each-ref get-tar-commit-id grep
help last-modified log ls-files ls-tree merge-base name-rev patch-id range-diff rev-list rev-parse shortlog show
show-branch show-index show-ref status stripspace var verify-commit verify-pack verify-tag version whatchanged`.split(/\s+/))

/** Every other git command: it may write a commit, a ref, the index, the config, the stash, a file, or another repository. Scouts and checkers may run none. */
const GIT_WRITES = new Set(GIT_ALL.filter(c => !GIT_READS.has(c)))

/**
 * The writes a worker may run on its own branch (T-1053). Everything else in GIT_WRITES stays refused: push, fetch,
 * pull, remote, tag, config, stash (shared with the owner's folder), update-ref, symbolic-ref, branch, switch,
 * worktree... each changes what the owner's folder shares.
 */
const WORKER_GIT = new Set(['commit', 'merge', 'cherry-pick', 'revert', 'restore', 'reset', 'add', 'stage', 'rm', 'mv', 'clean', 'am', 'apply', 'bisect', 'rebase', 'checkout'])

/**
 * The one `git init` a worker may run: a new scratch repository at a plain full path under /tmp (`git init /tmp/x`).
 * No options (`--separate-git-dir` would move the owner's .git, `--template` adds hooks) and no init of the folder it is in.
 */
const scratchInit = (args: string[]) => args.length === 1 && /^\/(?:private\/)?tmp\/[\w.@+,-]+(?:\/[\w.@+,-]+)*\/?$/.test(args[0]!) && !args[0]!.split('/').includes('..')

/** Whether option word `a` is `--<name>` or a start of it (git takes `--upd` for `--update-refs`). */
const longStart = (a: string, name: string) => {
  const long = /^--([^=]+)/.exec(a)?.[1]
  return !!long && long.length > 1 && name.startsWith(long)
}

/**
 * The words that still refuse an allowed worker command (`bad`: what is refused, or undefined), and the same limit as
 * Claude Code rules for the Node host (`node`, after `git `). Claude Code only matches how a command starts, so there
 * checkout is refused whole (use `git restore <file>`) and rebase takes one word at most.
 */
const WORKER_LIMITS: Record<string, { bad: (w: string[]) => string | undefined; node: string[] }> = {
  // files only: `git checkout -- a.ts` or `git checkout main -- a.ts`; `git checkout main` switches branch
  checkout: {
    bad: w => {
      const d = w.indexOf('--')
      return d >= 0 && d < w.length - 1 && !w.slice(0, d).some(a => /^-[a-zA-Z]*[bB]/.test(a) || longStart(a, 'orphan') || longStart(a, 'detach')) ? undefined : 'git checkout <branch>'
    },
    node: ['checkout:*'],
  },
  // the current branch only (`git rebase main other` moves other), and nothing that runs a program or moves other refs
  rebase: {
    bad: w => {
      let names = 0
      for (let i = 0; i < w.length; i++) {
        const a = w[i]!
        if (/^-[a-zA-Z]*x/.test(a) || ['exec', 'update-refs', 'autostash', 'quit'].some(n => longStart(a, n))) return `git rebase ${a.split('=')[0]}`
        if (['--onto', '-s', '--strategy', '-X', '--strategy-option'].includes(a)) i++
        else if (!a.startsWith('-')) names++
      }
      return names > (w.some(a => longStart(a, 'root')) ? 0 : 1) ? 'git rebase <other branch>' : undefined
    },
    node: ['rebase * *', 'rebase -*x*', 'rebase --e*', 'rebase --u*', 'rebase --au*', 'rebase --q*'],
  },
  // `bisect run` runs a program; `bisect reset <commit>` ends on another branch
  bisect: { bad: w => (w[0] === 'run' ? 'git bisect run' : w[0] === 'reset' && w.length > 1 ? 'git bisect reset <commit>' : undefined), node: ['bisect run:*', 'bisect reset *'] },
  // --autostash uses the stash, shared with the owner's folder
  merge: { bad: w => (w.some(a => longStart(a, 'autostash')) ? 'git merge --autostash' : undefined), node: ['merge *--au*'] },
}

/** `git branch` options that only list branches (and their `=value` forms). */
const BRANCH_LIST = new Set(['--list', '-l', '-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose', '--show-current', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format', '--color', '--no-color', '-i', '--ignore-case', '--column', '--no-column', '--omit-empty', '--abbrev', '--no-abbrev'])

/** The options that make `git branch` list, so its other words are patterns or commits, never new branch names. */
const BRANCH_LIST_MODE = new Set(['--list', '-l', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at'])

/** Whether `git branch` with words `args` only lists: only listing options, and other words only in list mode. */
const branchListOnly = (args: string[]) => {
  const opts = args.filter(a => a.startsWith('-')).map(a => a.split('=')[0]!)
  return opts.every(o => BRANCH_LIST.has(o)) && (opts.length === args.length || opts.some(o => BRANCH_LIST_MODE.has(o)))
}

/** git's own options (before the command name) that change nothing; any other (-C, -c, --git-dir, --work-tree, --exec-path, --config-env...) is refused. */
const GIT_OPTION_OK = new Set(['--no-pager', '-P', '-p', '--paginate', '--no-optional-locks', '--version', '--help'])

/**
 * A git call in a command's text: `git` (or `/usr/bin/git`), or a git program by its own name (`git-push`), where a
 * command starts: at the start, after `&&`, `||`, `;`, `|`, `&`, `(`, `)` (a `case` label), `$(`, `{`, a backquote, a line end or
 * `sh -c` (`bash -lc`, `eval`...), and after leading redirects (`2>/dev/null`, `> out`), `VAR=x` settings or env, sudo, command, exec, time, timeout, nice,
 * nohup, xargs, eval, if, then... with their options, an option's value (`sudo -u root`) and a number (`timeout 5`).
 * gitWriteIn takes out quotes and backslashes first (`"git" push`, `\git push` run git), so
 * `grep "git push" docs/` and `git commit -m "make git simpler"` hold no git call (git is not where a command starts).
 */
const GIT_AT = new RegExp(
  String.raw`(?:^|&&|\|\||[;|&(){\n` + '`' + String.raw`]|\b(?:sh|bash|zsh|dash|ksh|eval)(?:[^\S\n]+-\w+)*[^\S\n]|(?<!\S)-(?:exec|execdir|ok|okdir)[^\S\n])` +
    String.raw`(?:[^\S\n]*(?:(?:(?:/[\w.-]+)*/)?(?:env|sudo|doas|command|exec|time|timeout|gtimeout|nice|ionice|nohup|setsid|xargs|parallel|caffeinate|watch|stdbuf|unbuffer|chronic|eval|if|then|do|else|elif|while|until|!)` +
    String.raw`(?:[^\S\n]+(?:-[a-zA-Z](?:[^\S\n]+(?!-)(?!(?:\S*/)?git(?![\w.]))[^\s;&|]+)?|-[^\s;&|]+|\d[\w.]*))*|\w+=[^\s;&|]*` +
    String.raw`|\d*&?[<>]{1,2}&?[^\S\n]*[^\s;&|<>()]+)(?=\s))*` +
    String.raw`[^\S\n]*(?:(?:/[\w.-]+)*/)?git(?:-([a-z][\w-]*))?(?=$|[\s'"` + '`' + String.raw`;&|()<>\\])`,
  'gi',
)

/**
 * The first git command in Bash `command` that `who` may not run, as `git <command>` (or the option or setting that
 * refuses it), or undefined. Plain text: every git call where a command starts counts (GIT_AT, also
 * `sh -c 'git push'` and `$(git stash)`); its words run up to the next `;`, `&`, `|`,
 * bracket, backquote, redirection or line end. Refused for everyone: a GIT_ setting, core.hooksPath, a look-up of
 * git's own folder (--git-dir, --git-common-dir...), any git option before the command but GIT_OPTION_OK. An allow
 * list: 'reader' (a scout, a checker, an investigation) may run only GIT_READS (and `git branch` only listing);
 * 'worker' also WORKER_GIT, within WORKER_LIMITS. Every other name is refused: writes, aliases (`git co`), add-ons.
 */
export function gitWriteIn(text: unknown, who: 'reader' | 'worker' = 'reader'): string | undefined {
  if (typeof text !== 'string') return undefined
  // the shell joins a backslash at a line's end with the next line (`git \` + newline + `push` runs `git push`)
  // and quotes and backslashes only group words: `"git" push`, `'git' push` and `\git push` run `git push`
  const command = joinLines(text).replace(/["'\\]/g, '')
  if (/(?<![\w])GIT_\w*=/.test(command)) return 'a GIT_ setting'
  if (/core\.hookspath/i.test(command)) return 'core.hooksPath'
  // git's own folder holds every branch as a file (`--output=$(git rev-parse --git-common-dir)/refs/heads/main`)
  if (/--(?:git-common-dir|absolute-git-dir|git-path|git-dir)(?![\w-])/.test(command)) return "git's own folder"
  for (const m of command.matchAll(GIT_AT)) {
    // redirects are taken out first: `git 2>/dev/null push` and `git >out push` run `git push`
    const rest = command.slice(m.index + m[0].length).replace(/\d*&?[<>]{1,2}&?[^\S\n]*[^\s;&|<>()`]*/g, ' ').split(/[;&|()`\n]/)[0]!
    const words = rest.split(/\s+/).map(w => w.replace(/["'\\]/g, '')).filter(Boolean)
    let i = 0
    if (!m[1]) for (; words[i]?.startsWith('-'); i++) if (!GIT_OPTION_OK.has(words[i]!)) return `git ${words[i]!.split('=')[0]}`
    const sub = (m[1] ?? words[i++])?.toLowerCase()
    // an allow list (T-1062): any name but the reads (and a worker's own writes) is refused, aliases and add-ons too;
    // a word that is no command name (`$X`, `a.ts`) is not seen, and `git-x` counts only as one of git's own programs
    if (!sub || !/^[a-z][a-z0-9-]*$/.test(sub) || (m[1] && !GIT_ALL.includes(sub))) continue
    const args = words.slice(i)
    // `git grep -O<program>` runs that program (a hidden `git push`)
    if (sub === 'grep' && args.some(a => /^-[a-zA-Z]*O/.test(a) || longStart(a, 'open-files-in-pager'))) return 'git grep -O'
    if (GIT_READS.has(sub)) continue
    if (sub === 'branch' && branchListOnly(args)) continue
    if (sub === 'init' && who === 'worker' && scratchInit(args)) continue
    if (who === 'reader' || !WORKER_GIT.has(sub)) return `git ${sub}`
    const bad = WORKER_LIMITS[sub]?.bad(args)
    if (bad) return bad
  }
  return undefined
}

/**
 * Whether a worker's Bash `command` runs in one of `places` (its own folder by its names, and /tmp for a scratch
 * repository; T-1062): every cd, chdir, pushd or popd in its text goes to a full path in one of them or to a plain
 * relative path, and either the shell's folder `cwd` is in one or the command starts with such a cd to a full path.
 * A bare `cd`, `cd -`, `cd ~`, `cd $X` and popd count as going elsewhere. So `cd /other/repo && git commit` is refused.
 */
export function gitPlaceOk(command: string, cwd: string | undefined, places: Folders): boolean {
  const list = folderList(places)
  const ok = (p: string) => p.startsWith('/') && insideAny(resolvePath('/', p), list, false) !== undefined
  const flat = joinLines(command).replace(/["'\\]/g, '')
  for (const m of flat.matchAll(/(?<![\w.-])(?:cd|chdir|pushd|popd)(?=$|[\s;&|)])[^\S\n]*([^\s;&|()]*)/g)) {
    const to = m[1]!
    if (!(to.startsWith('/') ? ok(to) : /^(?!-)[\w@%+,.-][\w./@%+,-]*$/.test(to) && !to.split('/').includes('..'))) return false
  }
  const first = /^\s*(?:cd|chdir|pushd)\s+(\/\S*)/.exec(flat)?.[1]
  return (cwd !== undefined && ok(cwd)) || (first !== undefined && ok(first))
}

/** Programs often put in front of git; the Node host's rules refuse git after them. */
const GIT_WRAPPERS = ['env', 'sudo', 'command', 'exec', 'xargs', 'nohup', 'time', 'nice', 'caffeinate', 'watch', 'stdbuf']

/**
 * The same deny list as Claude Code rules for every `claude -p` agent (the Node host has no symcc hook; a deny rule
 * beats any allow rule). A worker (`worker` true) is not denied WORKER_GIT, within WORKER_LIMITS' rules. Every git
 * call that starts with an option (`git -C`, `git -c`...), git after the usual wrappers, and GIT_ settings at the
 * start stay denied for everyone. Claude Code's rules can't say "every git command but these", so the owner's git
 * aliases (`aliases`, see gitAliases) are denied by name; an add-on program (`git foo` running git-foo) is not seen.
 */
export function gitDeniedRules(worker = false, aliases: readonly string[] = []): string[] {
  const subs = [...GIT_WRITES, ...aliases.filter(a => /^[\w-]+$/.test(a) && !GIT_ALL.includes(a))].filter(c => !(worker && WORKER_GIT.has(c)))
  const limits = worker ? Object.values(WORKER_LIMITS).flatMap(l => l.node) : []
  return [
    ...[...subs.map(c => `${c}:*`), ...limits].map(r => `Bash(git ${r})`),
    'Bash(git -*)',
    // a redirect before the command (`git 2>/dev/null push`, `git >out push`)
    ...['>', '<', '&', ...'0123456789'].map(c => `Bash(git ${c}*)`),
    ...['-C', '-c', '--git-dir', '--work-tree', '--exec-path', '--config-env'].map(o => `Bash(git ${o}:*)`),
    // also with the wrapper's options in between (`watch -n1 git push`)
    ...GIT_WRAPPERS.flatMap(w => [`Bash(${w} git:*)`, `Bash(${w} * git *)`]),
    'Bash(GIT_*)',
    'Bash(git rev-parse *--git-*)', 'Bash(git rev-parse *--absolute-git-dir*)',
    // `git grep -O<program>` runs that program; `find -exec git ...` runs git
    'Bash(git grep *-O*)', 'Bash(git grep *--op*)', 'Bash(find * -exec* git *)', 'Bash(find * -ok* git *)',
  ]
}

/** The alias names in `git config --get-regexp ^alias\.` output `out` (lines like `alias.co checkout`). */
export const gitAliases = (out: string): string[] =>
  out.split('\n').map(l => /^alias\.([^\s]+)/i.exec(l.trim())?.[1]?.toLowerCase()).filter((a): a is string => !!a)

/** What every git refusal adds: how the text is read. */
const PLAIN_TEXT = 'Every git call where a command starts counts (also after &&, ;, |, $( and in sh -c "..."), and any git command not on the allowed list (an alias too) is refused.'

/** The reason a checker reads when its Bash command runs git command `what` (from gitWriteIn), which may change something. */
export const gitWriteText = (what: string) =>
  `Refused: ${what} may change the repository, and the checker may only read with git (diff, log, show, status, blame, grep, rev-parse, ls-files, branch --list), without git options before the command (-C, -c...) or GIT_* settings. Check the work without changing any branch, commit, tag or the stash. ${PLAIN_TEXT}`

/**
 * The reason a worker reads when its Bash command runs git command `what` (from gitWriteIn or gitPlaceOk) that changes
 * more than its own branch: branch names, remotes, settings, tags and the stash are shared with the owner's folder.
 */
export const workerGitWriteText = (what: string) =>
  `Refused: ${what} may change more than your own branch. In your own folder (or a scratch repository under /tmp) you may change git on your own branch: commit, merge, cherry-pick, revert, restore, checkout -- <file>, reset, rebase of your branch, bisect, add, rm. Not allowed: push, fetch, pull, remote, tag, config, stash, worktree, update-ref, symbolic-ref, making, switching to or deleting a branch, rebase -x/--exec/--update-refs, bisect run, --autostash, git options before the command (-C, -c, --git-dir...), GIT_* settings, and git in any other folder (cd to your folder or to /tmp/... with a full path). ${PLAIN_TEXT}`

/**
 * The reason a scout reads when its Bash command runs git command `what` (from gitWriteIn), which may change
 * something: a scout runs in the owner's own folder, so a git write there changes the owner's branch, files or stash.
 */
export const scoutGitWriteText = (what: string) =>
  `Refused: ${what} may change the repository, and a scout may only read with git (diff, log, show, status, blame, grep, rev-parse, ls-files, branch --list). You run in the owner's own folder: don't commit, push, merge, reset, switch branches, stash or move any branch or tag. Report what you find instead. ${PLAIN_TEXT}`
