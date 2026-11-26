// The git guard (T-1062): one deny list, read from a command's plain text (no shell parsing), used both by the hook
// guard (gitWriteIn, gitPlaceOk) and by the Node host's Claude Code rules (gitDeniedRules). It stops honest
// mistakes; a script that builds its git command at run time still gets through (the merge-time scope check over
// every commit of a try is the backstop for files, T-1053).
import { folderList, insideAny, joinLines, resolvePath, type Folders } from './path-guard'

/** git commands that write a commit, a ref, the index, the config, the stash, the files, or a repository. Scouts and checkers may run none. */
const GIT_WRITES = new Set([
  'commit', 'merge', 'init', 'clone', 'push', 'pull', 'fetch', 'reset', 'checkout', 'switch', 'restore', 'branch',
  'tag', 'stash', 'rebase', 'cherry-pick', 'revert', 'am', 'apply', 'add', 'rm', 'mv', 'clean', 'update-ref',
  'symbolic-ref', 'update-index', 'read-tree', 'write-tree', 'commit-tree', 'hash-object', 'mktag', 'mktree',
  'fast-import', 'worktree', 'config', 'remote', 'submodule', 'notes', 'replace', 'reflog', 'gc', 'prune', 'repack',
  'pack-refs', 'maintenance', 'filter-branch', 'bisect', 'sparse-checkout', 'merge-file', 'merge-tree', 'lfs',
])

/**
 * The writes a worker may run on its own branch (T-1053). Everything else in GIT_WRITES stays refused: push, fetch,
 * pull, remote, tag, config, stash (shared with the owner's folder), update-ref, symbolic-ref, branch, switch,
 * worktree... each changes what the owner's folder shares.
 */
const WORKER_GIT = new Set(['commit', 'merge', 'cherry-pick', 'revert', 'restore', 'reset', 'add', 'rm', 'mv', 'clean', 'am', 'apply', 'bisect', 'rebase', 'checkout', 'init'])

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

/** `git branch` words that only list branches. */
const BRANCH_LIST = new Set(['--list', '-l', '-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose', '--show-current'])

/** git's own options (before the command name) that change nothing; any other (-C, -c, --git-dir, --work-tree, --exec-path, --config-env...) is refused. */
const GIT_OPTION_OK = new Set(['--no-pager', '-P', '-p', '--paginate', '--no-optional-locks', '--version', '--help'])

/** A git call in a command's text: `git` (or `/usr/bin/git`) as a word, or a git program by its own name (`git-push`). */
const GIT_AT = /(?<![\w.-])git(?:-([a-z][\w-]*))?(?=$|[\s'"`;&|()<>\\])/gi

/**
 * The first git command in Bash `command` that `who` may not run, as `git <command>` (or the option or setting that
 * refuses it), or undefined. Plain text: every `git` word counts, also inside quotes (`sh -c 'git push'`,
 * `rebase -x 'git push'`, a commit message that names `git push`); its words run up to the next `;`, `&`, `|`,
 * bracket, backquote, redirection or line end. Refused for everyone: a GIT_ setting, core.hooksPath, a look-up of
 * git's own folder (--git-dir, --git-common-dir...), any git option before the command but GIT_OPTION_OK. 'reader' (a scout, a checker, an investigation): every command in GIT_WRITES
 * (`git branch` only listing is fine). 'worker': GIT_WRITES but WORKER_GIT, within WORKER_LIMITS.
 */
export function gitWriteIn(text: unknown, who: 'reader' | 'worker' = 'reader'): string | undefined {
  if (typeof text !== 'string') return undefined
  // the shell joins a backslash at a line's end with the next line (`git \` + newline + `push` runs `git push`)
  const command = joinLines(text)
  if (/(?<![\w])GIT_\w*=/.test(command)) return 'a GIT_ setting'
  if (/core\.hookspath/i.test(command)) return 'core.hooksPath'
  // git's own folder holds every branch as a file (`--output=$(git rev-parse --git-common-dir)/refs/heads/main`)
  if (/--(?:git-common-dir|absolute-git-dir|git-path|git-dir)(?![\w-])/.test(command)) return "git's own folder"
  for (const m of command.matchAll(GIT_AT)) {
    const rest = command.slice(m.index + m[0].length).split(/\d*[<>]|[;&|()`\n]/)[0]!
    const words = rest.split(/\s+/).map(w => w.replace(/["'\\]/g, '')).filter(Boolean)
    let i = 0
    if (!m[1]) for (; words[i]?.startsWith('-'); i++) if (!GIT_OPTION_OK.has(words[i]!)) return `git ${words[i]!.split('=')[0]}`
    const sub = (m[1] ?? words[i++])?.toLowerCase()
    if (!sub || !GIT_WRITES.has(sub)) continue
    const args = words.slice(i)
    if (sub === 'branch' && args.every(a => BRANCH_LIST.has(a))) continue
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
const GIT_WRAPPERS = ['env', 'command', 'exec', 'xargs', 'nohup', 'time']

/**
 * The same deny list as Claude Code rules for every `claude -p` agent (the Node host has no symcc hook; a deny rule
 * beats any allow rule). A worker (`worker` true) is not denied WORKER_GIT, within WORKER_LIMITS' rules. Every git
 * call that starts with an option (`git -C`, `git -c`...), git after the usual wrappers, and GIT_ settings at the
 * start stay denied for everyone.
 */
export function gitDeniedRules(worker = false): string[] {
  const subs = [...GIT_WRITES].filter(c => !(worker && WORKER_GIT.has(c)))
  const limits = worker ? Object.values(WORKER_LIMITS).flatMap(l => l.node) : []
  return [
    ...[...subs.map(c => `${c}:*`), ...limits].map(r => `Bash(git ${r})`),
    'Bash(git -*)',
    ...['-C', '-c', '--git-dir', '--work-tree', '--exec-path', '--config-env'].map(o => `Bash(git ${o}:*)`),
    ...GIT_WRAPPERS.map(w => `Bash(${w} git:*)`),
    'Bash(GIT_*)',
    'Bash(git rev-parse *--git-*)', 'Bash(git rev-parse *--absolute-git-dir*)',
  ]
}

/** What every git refusal adds: how the text is read. */
const PLAIN_TEXT = 'A git command named anywhere in the command counts, even inside quotes; search for git text with the Grep tool.'

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
