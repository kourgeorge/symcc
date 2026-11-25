// The git guard: which git commands only read (gitReadOnly), which ones a Bash command runs that write
// (gitWriteIn), what scratch repositories and merge steps are allowed, and the texts for a refused git command.
import { braceLit, hasBrace, rawWords, REDIRECT, shellPieces, type RawWord, type ShellPiece } from './shell-words'
import { folderList, insideAny, resolvePath, type Folders } from './path-guard'

/** git commands a checker may run as they are: they only read. Anything not listed (and not in gitReadOnly below) is refused. */
const GIT_READ = new Set(['diff', 'log', 'show', 'status', 'blame', 'grep', 'rev-parse', 'ls-files', 'ls-tree', 'cat-file', 'rev-list', 'merge-base', 'describe', 'shortlog', 'show-branch', 'whatchanged', 'name-rev', 'diff-tree', 'diff-index', 'diff-files', 'annotate', 'help', 'version', 'count-objects', 'var', 'check-ignore', 'check-attr', 'show-ref'])

/** git's own options (before the command name) that take the next word as their value. */
const GIT_GLOBAL_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix'])

/** git's own options a checker may not use: `-c` and `--config-env` set any setting (core.pager, diff.external, alias.*...) and `--exec-path` picks where git finds its programs, so each can make git run another program. */
const GIT_GLOBAL_REFUSED = /^(-c|--config-env|--exec-path)/

/**
 * Long options of read-only git commands that write a file or run another program: `--output` (log, diff, show...),
 * `--ext-diff`, `--textconv`, `--open-files-in-pager` (grep), `--exec-path`. git takes any unique start of a long
 * option name (`--outp`), so a start of these names is refused too, except the exact names in LONG_OK.
 */
const LONG_REFUSED = ['output', 'ext-diff', 'textconv', 'open-files-in-pager', 'exec-path', 'exec']

/** Long options that start like one in LONG_REFUSED but are a different, harmless option of their own. */
const LONG_OK = new Set(['text'])

/** git commands that take diff options, where `-o <file>` writes the output to a file. */
const DIFF_LIKE = new Set(['diff', 'log', 'show', 'reflog', 'whatchanged', 'diff-tree', 'diff-index', 'diff-files', 'format-patch', 'rev-list', 'shortlog'])

/** `git branch` options that change branches. */
const BRANCH_WRITE = /^(-[a-zA-Z]*[dDfmMcCu]|--(delete|force|move|copy|set-upstream-to|unset-upstream|edit-description|track|no-track|create-reflog|recurse-submodules)(=|$))/

/** `git branch` options that take the next word as their value. */
const BRANCH_VALUE = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--format', '--sort', '--column'])

/**
 * Settings that make git run another program, use another repository or settings file, or write a file
 * (GIT_EXTERNAL_DIFF, GIT_PAGER, GIT_SSH_COMMAND, GIT_DIR, GIT_CONFIG*, GIT_TRACE...: every GIT_ name), set as
 * `NAME=value` (alone, after `env` or `export`) in a command that also runs git.
 */
const GIT_ENV_REFUSED = /^(GIT_\w*|PAGER|EDITOR|VISUAL|LESS\w*|SSH_ASKPASS|BROWSER|HOME|XDG_CONFIG_HOME)=/

/** Short options of git grep that take a value right after them (`-e<pattern>`, `-A3`). */
const GREP_VALUE = 'efABCmO'
/** Short options of diff-like git commands that take a value right after them (`-S<text>`, `-G<regex>`, `-L<range>`, `-n3`); shortlog's -n takes none. */
const DIFF_VALUE = 'SGLOInUlMCBX'

/** The option letters of short option word `a` (`-nSfoo` gives `nS`): stops after the first letter that takes a value. */
function shortFlags(a: string, value: string): string {
  let out = ''
  for (const c of a.slice(1)) {
    out += c
    if (value.includes(c)) break
  }
  return out
}

/** The option of git `args` (the words after read-only command `sub`) that writes a file or runs another program, or undefined. */
function gitBadOption(sub: string, args: string[]): string | undefined {
  for (const a of args) {
    const long = /^--([^=]+)/.exec(a)?.[1]
    // cat-file --filters runs the repository's filter programs (any unique start of it: --fi, --filter)
    if (sub === 'cat-file' && long && long.length > 1 && 'filters'.startsWith(long)) return a.split('=')[0]
    if (long && !LONG_OK.has(long) && !long.startsWith('no-') && LONG_REFUSED.some(n => n.startsWith(long))) return a.split('=')[0]
    // short options may be put together (`-nO`); -O runs its value as a command in grep, -o writes a file in diff-like
    // commands. The letters after an option that takes a value are that value (`-Sfoo`, `-G"checkout"`), not options.
    const flag = sub === 'grep' ? 'O' : DIFF_LIKE.has(sub) ? 'o' : undefined
    if (flag && /^-[^-]/.test(a) && shortFlags(a, sub === 'grep' ? GREP_VALUE : sub === 'shortlog' ? DIFF_VALUE.replace('n', '') : DIFF_VALUE).includes(flag)) return `-${flag}`
  }
  return undefined
}

/** `git config` options that only pick where to read or how to show it; any other option (--add, --unset, --edit, --file...) is refused. */
const CONFIG_SHOW = /^(--(global|local|system|worktree|show-origin|show-scope|name-only|null|includes|no-includes|bool|int|bool-or-int|path|expiry-date|type=[\w-]+)|-z)$/

/** `git config` options (or, in newer git, first words) that read a setting; one of them is needed. */
const CONFIG_GET = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'])

/** Whether `git config args` only reads: one of CONFIG_GET (or `get`/`list` first), and else only CONFIG_SHOW options. */
function configReadOnly(args: string[]): boolean {
  let get = args[0] === 'get' || args[0] === 'list'
  for (const a of get ? args.slice(1) : args) {
    if (CONFIG_GET.has(a)) get = true
    else if (a.startsWith('-') && !CONFIG_SHOW.test(a)) return false
  }
  return get
}

/** Whether git `args` (the words after the command name `sub`) only read. */
function gitReadOnly(sub: string, args: string[]): boolean {
  if (GIT_READ.has(sub)) return true
  // `git remote` and `-v` list the remotes, get-url shows one; show, prune, update and the rest may reach the network or change them
  if (sub === 'remote') return args.length === 0 || args.every(a => a === '-v' || a === '--verbose') || args[0] === 'get-url'
  if (sub === 'config') return configReadOnly(args)
  // only `git reflog` (options alone) and `git reflog show ...` show; every other subcommand (expire, delete, drop,
  // write, and any git adds later) may change it, and a plain ref (`git reflog HEAD`) can't be told from one
  if (sub === 'reflog') return args[0] === 'show' || args.every(a => a.startsWith('-'))
  if (sub === 'stash' || sub === 'worktree') return args[0] === 'list' || (sub === 'stash' && args[0] === 'show')
  if (sub !== 'branch') return false
  let list = false
  let named = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--list' || a === '-l' || a === '--show-current') list = true
    else if (BRANCH_WRITE.test(a)) return false
    else if (BRANCH_VALUE.has(a)) i++
    else if (!a.startsWith('-')) named = true
  }
  // `git branch <name>` makes a branch; with --list the names are patterns to show
  return list || !named
}

/** Whether word `w` names the git program (`git`, `/usr/bin/git`; any letter case, since macOS finds `GIT` too). */
const isGit = (w: string) => /(^|\/)git$/i.test(w)

/**
 * The first git command in Bash `command` that may change anything or run another program (a commit, a branch, the
 * stash, the index, a tag, a push, `--output=<file>`, `grep -O<cmd>`, `-c core.pager=...`, `GIT_EXTERNAL_DIFF=...`), as
 * `git <command>` (or `git <command> <option>`, or the setting's name), or undefined when every git command in it only
 * reads (diff, log, show, status, branch --list, stash list, remote -v, config --get, reflog...). Looks inside compound
 * commands (&&, ;, |, `$(...)`), past git's own options (`git -C <dir>`), and inside any word that has `git` in it
 * (quoted text run by `sh -c`, a `VAR=` value, an option value like `-O"git stash"`). Any word `git` (or ending in
 * `/git`, or `git-xyz`) counts, so an odd read may be refused too; that is the safe side. Two exceptions (T-439): a
 * command run by a read-only text tool (grep, rg, cat, ls, find without -exec... see TEXT_TOOLS), where `git` is only
 * a pattern or a name (`grep -n "git stash" docs`), and a read-only git command, whose words aren't read again
 * (`git log --grep="git stash"`). They hold only when every command in the whole line is one of them, so
 * `grep -h git notes | sh` and `grep -h git notes > s; $SHELL s` are refused, and never in a line with a newline, a
 * `#` comment, `$'` or a backslash outside quotes (`grep x #'` + newline + `git stash`, `grep x a\>& git stash`). git run by xargs is
 * refused.
 *
 * A best effort on the command's text, not a sandbox: a git run through a variable, a script file, a settings file the
 * checker wrote, or other shell tricks gets through. Closing those is the sandbox's job (T-365), not this check's.
 * `cwd`: the folder the shell is in, which a git command with no `-C` and no `cd` before it acts in (see GitPlace).
 */
export function gitWriteIn(command: unknown, allow?: GitAllow, cwd?: string): string | undefined {
  if (typeof command !== 'string') return undefined
  const { bad, git, env } = gitScan(command, 0, allow, false, cwd)
  return bad ?? (git && env ? env : undefined)
}

/**
 * Where a git command that starts a simple command of the line itself (not one inside `sh -c '...'`, after `sudo`,
 * and so on) runs: `pre`, its own options before the command name as written (quotes kept, `-C /tmp/x`); `args`, the
 * words after the command name as written; `dir`, the folder the shell is in when it runs, when that can be told
 * (the shell's folder, or the plain literal folder of a `cd` joined to it by `&&` only, see gitFolders).
 */
export type GitPlace = { pre: RawWord[]; args: RawWord[]; dir?: string }

/** A git command (`sub`, and the words after it; `place` when known, see GitPlace) that gitWriteIn lets through although it writes. */
export type GitAllow = (sub: string, args: string[], place?: GitPlace) => boolean

/** A git command that either of `a` and `b` lets through. */
export const eitherAllow =
  (a: GitAllow, b: GitAllow): GitAllow =>
  (sub, args, place) =>
    a(sub, args, place) || b(sub, args, place)

/**
 * Plain literal absolute path `raw` as written (quotes kept), cleaned, or undefined when it isn't one: it starts with
 * "/", has only letters, digits and `._@%+,=-/` (spaces too inside whole-word "..." or '...'), so no `$`, backquote,
 * `~`, glob or other quotes, and no `..` piece.
 */
export function literalPath(raw: string): string | undefined {
  const q = /^"([^"]*)"$/.exec(raw) ?? /^'([^']*)'$/.exec(raw)
  const p = q ? q[1]! : raw
  if (!(q ? /^\/[\w./@%+,= -]*$/ : /^\/[\w./@%+,=-]*$/).test(p)) return undefined
  if (p.split('/').includes('..')) return undefined
  return resolvePath('/', p)
}

/** Whether clean absolute path `abs` is strictly inside one of the scratch folders `temps` and in none of `keep` (letter case ignored). */
const inScratchTemp = (abs: string, temps: Folders, keep: Folders) => {
  const rel = insideAny(abs, folderList(temps), true)
  return !!rel && insideAny(abs, folderList(keep), false) === undefined
}

/**
 * The folders git writes are allowed in for workers and checkers (T-591): /tmp (and /private/tmp), and the system
 * temp folder `tmpdir` (from TMPDIR) when it is a plain literal path under macOS's /var/folders; anything else
 * (unset, or a folder elsewhere) adds nothing, so a TMPDIR set to the home or project folder opens nothing.
 */
export function scratchTemps(tmpdir?: string): string[] {
  const t = tmpdir ? literalPath(tmpdir.replace(/\/+$/, '')) : undefined
  return t && /^(\/private)?\/var\/folders\/[^/]+\//.test(t) ? ['/tmp', t] : ['/tmp']
}

/** The git commands whose `-m <text>` is a message, not looked at by scratchGitAllow (`rebase -m` is --merge). */
const MESSAGE_SUBS = new Set(['commit', 'tag', 'merge', 'notes', 'stash'])

/** Options of `git init` a scratch repository may have (see scratchGitAllow); `-b` and `--initial-branch` take a branch name. */
const SCRATCH_INIT_OPTIONS = /^(-q|--quiet|--bare|--initial-branch=[\w./-]+)$/

/**
 * T-591: the git writes a worker or checker may run in a throwaway repository: every folder the command acts in is a
 * plain literal path (literalPath) strictly inside `temps` (scratchTemps) and in none of `keep` (the project, its
 * worktrees). That folder is the last `-C <path>` (no other own option but --no-pager), or else the shell's folder
 * (GitPlace.dir); `git init <path>` acts in `<path>` (absolute, or a plain relative one from that folder). Every word
 * after the command name may not expand (`$`, backquote), start with `~`, have a `..` piece, have a space (a command
 * given as one quoted word, as in `rebase -x '...'` or `alias.z '!...'`; only --author=... may), be --global or
 * --system (the owner's or the system's git settings), or name an absolute path anywhere in it (`--output=/x`, a URL,
 * `-x/x`) outside those folders; a commit message (`-m <text>`) and
 * redirects (checked as paths elsewhere) are not looked at. A simple rule against honest mistakes, not a security
 * boundary: links inside .git, files the same line writes, hooks and settings are not checked.
 */
export const scratchGitAllow =
  (temps: Folders, keep: Folders): GitAllow =>
  (sub, _args, place) => {
    if (!place) return false
    const ok = (abs: string | undefined) => abs !== undefined && inScratchTemp(abs, temps, keep)
    let dir = place.dir
    for (let i = 0; i < place.pre.length; i++) {
      const o = place.pre[i]!.raw
      if (o === '-C') {
        dir = literalPath(place.pre[++i]?.raw ?? '')
        if (dir === undefined) return false
      } else if (o !== '--no-pager') return false
    }
    const args = place.args
    if (sub === 'init') {
      const names: RawWord[] = []
      for (let i = 0; i < args.length; i++) {
        const a = args[i]!
        if (a.raw === '-b' || a.raw === '--initial-branch') {
          if (!/^[\w./-]+$/.test(args[++i]?.raw ?? '')) return false
        } else if (a.raw.startsWith('-')) {
          if (!SCRATCH_INIT_OPTIONS.test(a.raw)) return false
        } else names.push(a)
      }
      if (names.length > 1) return false
      const name = names[0]
      if (name) {
        if (name.raw.startsWith('/') || /^["']\//.test(name.raw)) return ok(literalPath(name.raw))
        // a plain relative name, taken from the folder git is in
        return dir !== undefined && /^[\w.@%+,=-][\w./@%+,=-]*$/.test(name.raw) && !name.raw.split('/').includes('..') && ok(resolvePath(dir, name.raw))
      }
    }
    if (!ok(dir)) return false
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!
      // a message, only for the commands whose -m is one (for rebase -m is --merge, so the next word is checked)
      if (MESSAGE_SUBS.has(sub)) {
        if (a.raw === '--message' || /^-[aqsvnS]*m$/.test(a.raw)) {
          i++
          continue
        }
        if (/^(-[aqsvnS]*m|--message=)/.test(a.raw)) continue
      }
      const redir = REDIRECT.exec(a.raw)
      if (redir) {
        if (!redir[4] && !redir[3]) i++
        continue
      }
      // --global / --system: the owner's ~/.gitconfig or the system's, outside the scratch folder
      // also any unique shortening of these long options (`--glob`, `--syst`), which the parser accepts the same
      const long = a.w.split('=')[0]!
      if (long.length > 2 && long.startsWith('--') && ('--global'.startsWith(long) || '--system'.startsWith(long))) return false
      // `config -f<file>`: the file joined to the option (`-f~/.gitconfig`) must be a plain relative name too
      // (`-f <file>` and `--file=<file>` are checked below as words and paths)
      if (sub === 'config' && /^-f./.test(a.w)) {
        const f = a.w.slice(2)
        const plain = /^[\w.@%+,=-][\w./@%+,=-]*$/.test(f) && !f.split('/').includes('..')
        if (!plain && !ok(literalPath(f))) return false
      }
      // a space: a command or path given as one quoted word (`rebase -x 'git -C /repo ...'`, `alias.z '!cd; git ...'`)
      if (/\s/.test(a.w) && !/^--author=/.test(a.raw)) return false
      if (a.expands || /(^|[=:,])~/.test(a.w) || /(^|[^\w.])\.\.(\/|$)/.test(a.w)) return false
      // every absolute path anywhere in the word (`--output=/x`, `file:///x`, `-x/x`, `'!/usr/bin/git -C/x'`)
      for (const m of a.w.matchAll(/(?:^|^-[A-Za-z]|[^\w.@%+-])(\/[^\s,:;'"|&<>()]*)/g)) if (!ok(literalPath(m[1]!))) return false
    }
    return true
  }

/**
 * T-1053: the git commands that change something which a worker may run in its own folder, on its own branch (see
 * workerGitAllow). Only git's own commands: a name not listed may be an alias or an add-on program (`git p` set to
 * push, `git lfs push`), so it stays refused. Not listed, so refused: push, remote, branch, switch, worktree, config,
 * tag, stash (every form: the stash is shared with the owner's folder), update-ref, symbolic-ref, notes, replace,
 * submodule, gc, prune, init, clone... (each changes what the owner's folder shares: other branches, remotes, settings,
 * tags, the stash, or the whole repository).
 */
const WORKER_GIT = new Set(['add', 'rm', 'mv', 'restore', 'checkout', 'commit', 'merge', 'cherry-pick', 'revert', 'reset', 'rebase', 'bisect', 'fetch', 'pull', 'clean', 'am', 'apply'])

/** `git rebase` options that take the next word as their value. */
const REBASE_VALUE = new Set(['--onto', '-s', '--strategy', '-X', '--strategy-option'])

/** git's own merge strategies; any other `-s <name>` runs a program `git-merge-<name>` found on the PATH. */
const BUILTIN_STRATEGIES = new Set(['ort', 'recursive', 'resolve', 'octopus', 'ours', 'subtree'])
/** The git commands that take a merge strategy. */
const STRATEGY_SUBS = new Set(['merge', 'pull', 'rebase', 'cherry-pick', 'revert'])

/**
 * Whether git command words `args` of `sub` would run another program, outside the Bash guard: `rebase -x/--exec
 * <cmd>`, `bisect run <cmd>`, `fetch`/`pull --upload-pack=<cmd>`, or a merge strategy that is not one of git's own.
 */
function runsProgram(sub: string, args: string[]): boolean {
  if (sub === 'bisect') return args[0] === 'run'
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--') break
    if (sub === 'rebase' && (/^-[a-zA-Z]*x/.test(a) || longStart(a, 'exec'))) return true
    if ((sub === 'fetch' || sub === 'pull') && longStart(a, 'upload-pack')) return true
    if (!STRATEGY_SUBS.has(sub)) continue
    // `-s` is a strategy only for merge, pull and rebase (for cherry-pick and revert it is --signoff)
    const short = sub === 'merge' || sub === 'pull' || sub === 'rebase'
    let strategy: string | undefined
    if (longStart(a, 'strategy')) strategy = a.includes('=') ? a.slice(a.indexOf('=') + 1) : (args[++i] ?? '')
    else if (short && a === '-s') strategy = args[++i] ?? ''
    else if (short && /^-s./.test(a)) strategy = a.slice(2)
    if (strategy !== undefined && !BUILTIN_STRATEGIES.has(strategy)) return true
  }
  return false
}

/** Whether long option word `a` is `--<name>` or a unique start of it (git takes `--upd` for `--update-refs`). */
const longStart = (a: string, name: string) => {
  const long = /^--([^=]+)/.exec(a)?.[1]
  return !!long && long.length > 1 && name.startsWith(long)
}

/**
 * T-1053: the git writes a worker may run in its own folder `own` (both its names), on its own branch: a command of
 * WORKER_GIT run at the top of the line (GitPlace), whose folder (the shell's, a `cd` before it, or `-C <dir>`; no other
 * own option but --no-pager) is inside `own`, and none of whose words expand (`$x`, apart from a `-m` message), so what
 * it does can be told. Then: `checkout` only with `--` (files, as `git checkout -- a.ts` or `git checkout main -- a.ts`)
 * and without -b, -B, --orphan or --detach; `rebase` of the current branch only (at most one name: `git rebase main`,
 * not `git rebase main other`) and without --update-refs, which moves other branches; `fetch` and `pull` without a `:`
 * (a refspec that writes a local branch, `git fetch . HEAD:main`, or a URL); none that runs another program
 * (runsProgram: `rebase --exec`, `bisect run`, `--upload-pack`, a strategy not git's own). Refused, as for every agent: `-c`, --exec-path and GIT_* settings (gitWriteIn checks them first).
 */
export const workerGitAllow =
  (own: Folders): GitAllow =>
  (sub, args, place) => {
    if (!place || !WORKER_GIT.has(sub)) return false
    const mine = folderList(own)
    let dir = place.dir
    for (let i = 0; i < place.pre.length; i++) {
      const o = place.pre[i]!.raw
      if (o === '-C') {
        const to = place.pre[++i]?.raw ?? ''
        // an absolute plain path, or a plain relative one from the folder git is in
        dir = to.startsWith('/') || /^["']\//.test(to) ? literalPath(to) : dir !== undefined && /^[\w.@%+,=-][\w./@%+,=-]*$/.test(to) && !to.split('/').includes('..') ? resolvePath(dir, to) : undefined
      } else if (o !== '--no-pager') return false
    }
    if (dir === undefined || insideAny(resolvePath('/', dir), mine, true) === undefined) return false
    // the command's own words: output redirections (`2>&1`, `> log`) don't change what git does (their target is
    // checked as a path elsewhere)
    const words: string[] = []
    for (let i = 0; i < place.args.length; i++) {
      const a = place.args[i]!
      const redir = REDIRECT.exec(a.raw)
      if (redir) {
        if (!redir[4] && !redir[3]) i++
        continue
      }
      // a message (`-m "$why"`) may expand: it is only text
      if (MESSAGE_SUBS.has(sub) && (a.raw === '--message' || /^-[aqsvnS]*m$/.test(a.raw))) {
        i++
        continue
      }
      if (MESSAGE_SUBS.has(sub) && /^(-[aqsvnS]*m|--message=)/.test(a.raw)) continue
      if (a.expands) return false
      words.push(a.w)
    }
    args = words
    if (runsProgram(sub, args)) return false
    // `git checkout main --` (nothing after the `--`) still switches to main
    if (sub === 'checkout') return args.indexOf('--') >= 0 && args.indexOf('--') < args.length - 1 && !args.slice(0, args.indexOf('--')).some(a => /^-[a-zA-Z]*[bB]/.test(a) || longStart(a, 'orphan') || longStart(a, 'detach'))
    if (sub === 'rebase') {
      let names = 0
      for (let i = 0; i < args.length; i++) {
        const a = args[i]!
        if (longStart(a, 'update-refs')) return false
        if (REBASE_VALUE.has(a)) i++
        else if (!a.startsWith('-')) names++
      }
      return names <= 1
    }
    if (sub === 'fetch' || sub === 'pull') return !args.some(a => a.includes(':'))
    return true
  }

/**
 * Read-only text tools: in a command run by one of these, the word `git` in an argument is only text (a search
 * pattern, a file name), never run. Each value: an option of that tool that runs another program or deletes, which
 * puts the piece back under the broad rule (rg --pre, ag/ack --pager, sort --compress-program, less +!cmd, find -exec).
 */
const TEXT_TOOLS: Record<string, RegExp | undefined> = {
  grep: undefined,
  egrep: undefined,
  fgrep: undefined,
  rg: /^--(p|hostname-bin)/,
  ag: /^--p/,
  ack: /^--p/,
  cat: undefined,
  head: undefined,
  tail: undefined,
  less: /^(\+|-k|--lesskey)/,
  more: /^(\+|-k|--lesskey)/,
  wc: undefined,
  sort: /^--co/,
  uniq: undefined,
  cut: undefined,
  ls: undefined,
  file: undefined,
  stat: undefined,
  diff: undefined,
  find: /^-(exec|execdir|ok|okdir|delete)$/,
}

/** Folders a text tool may be run from by its full path (`/usr/bin/grep`); any other path may be a script of the same name. */
const TOOL_DIR = /^(\/usr\/local\/bin|\/opt\/homebrew\/bin|\/usr\/bin|\/bin)\/[^/]+$/

/** The program name of word `w` (`/usr/bin/sudo` gives `sudo`), in small letters. */
const progName = (w: string) => w.slice(w.lastIndexOf('/') + 1).toLowerCase()

/** Programs that add words from their input to the command they run (`echo stash | xargs git`). */
const ADDS_WORDS = new Set(['xargs', 'parallel'])

/** Whether simple command `words` is a read-only text tool (TEXT_TOOLS), first word and without its refused options. */
function textTool(words: string[]): boolean {
  const w = words[0]
  if (w === undefined || (w.includes('/') && !TOOL_DIR.test(w))) return false
  const name = progName(w)
  if (!Object.hasOwn(TEXT_TOOLS, name)) return false
  const refused = TEXT_TOOLS[name]
  return !refused || !words.slice(1).some(a => refused.test(a))
}

/**
 * Whether simple command `p` is a plain `cd` or `pushd`: no folder, or one plain path (no `$`, quotes, `(`, `<`, `;`,
 * glob, and not an option), so it only changes folder (`cd hooks && grep -n git ask.ts`).
 */
const plainCd = (p: { text: string; words: string[] }) =>
  (p.words[0] === 'cd' || p.words[0] === 'pushd') && p.words.length <= 2 && /^\s*(cd|pushd)(\s+(?!-)[\w./~+,:%-]+)?\s*$/.test(p.text)

/** Whether text holds a command run inside it (`$(...)`, backquotes, `<(...)`, `>(...)`). */
const RUNS_INSIDE = /\$\(|`|<\(|>\(/

/** Programs that run their text words as a new command line (`bash -c '...'`, `eval '...'`). */
const RERUNS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'eval'])

/** What gitWriteIn names for a git command with brace expansion in it. */
const BRACE_WHAT = 'with {braces}'

/** The most words braceExpand makes from one word before it gives up. */
const BRACE_WORDS_MAX = 1024
/** The longest word, and the most "{" in one, braceExpand works on before it gives up, so an odd word stays cheap. */
const BRACE_CHARS_MAX = 2000
const BRACE_OPEN_MAX = 50

/**
 * The words bash's brace expansion makes of word `w` (`{a,b}x` gives `ax bx`, `g{h..i}t` gives `ght git`, nested
 * ones too), or null when that is more than BRACE_WORDS_MAX (or the word is longer than BRACE_CHARS_MAX, or has
 * more than BRACE_OPEN_MAX "{"). A `{...}` with no comma and no range stays as it is.
 * A best effort, not bash: a superset of its words is fine here.
 */
function braceExpand(w: string): string[] | null {
  if (w.length > BRACE_CHARS_MAX || w.split('{').length - 1 > BRACE_OPEN_MAX) return null
  for (let i = w.indexOf('{'); i >= 0; i = w.indexOf('{', i + 1)) {
    let depth = 0
    let j = i
    const cuts: number[] = []
    for (; j < w.length; j++) {
      const c = w[j]
      if (c === '{') depth++
      else if (c === '}' && --depth === 0) break
      else if (c === ',' && depth === 1) cuts.push(j)
    }
    if (j >= w.length) continue
    const body = w.slice(i + 1, j)
    let alts: string[] | undefined
    if (cuts.length) alts = [i, ...cuts].map((at, k) => w.slice(at + 1, cuts[k] ?? j))
    else {
      const num = /^(-?\d+)\.\.(-?\d+)(?:\.\.-?\d+)?$/.exec(body)
      const chr = /^([A-Za-z])\.\.([A-Za-z])(?:\.\.-?\d+)?$/.exec(body)
      if (num) {
        const [a, b] = [Number(num[1]), Number(num[2])]
        if (Math.abs(a - b) >= BRACE_WORDS_MAX) return null
        alts = Array.from({ length: Math.abs(a - b) + 1 }, (_, k) => String(a < b ? a + k : a - k))
      } else if (chr) {
        const [a, b] = [chr[1]!.charCodeAt(0), chr[2]!.charCodeAt(0)]
        alts = Array.from({ length: Math.abs(a - b) + 1 }, (_, k) => String.fromCharCode(Math.min(a, b) + k))
      }
    }
    // zsh makes a range of any two characters (`{*../}` gives `* + , - . /`), so a range that isn't letters or
    // numbers can't be told here (T-450)
    if (!alts && body.includes('..')) return null
    if (!alts) continue
    const out: string[] = []
    for (const a of alts) {
      const more = braceExpand(w.slice(0, i) + a + w.slice(j + 1))
      if (!more || out.push(...more) > BRACE_WORDS_MAX) return null
    }
    return out
  }
  return [w]
}

/**
 * Whether word `w` (from rawWords with braceLit) may become git through brace expansion: with the braces and commas gone it reads git
 * (`{git,} stash`, `g{i,}t stash`), or one of its comma-separated parts, or that part's last path piece, is git or
 * `git-...` (`{git,stash}`, `{/usr/bin/git,stash}`), or one of the words its expansion makes is (`g{i..i}t`,
 * `{g..h}it`, T-436). Too many words to tell counts as git.
 */
const braceGit = (w: string) => {
  if (!hasBrace(w)) return false
  if (/(?:^|[/=])git$/i.test(w.replace(/[{},]/g, '')) || w.split(/[{},]/).some(part => /^git(?:$|-)/i.test(part.split(/[/=]/).pop() ?? ''))) return true
  const words = braceExpand(w)
  return words ? words.some(e => /(?:^|[/=])git(?:$|-)/i.test(e)) : braceLetters(w)
}

/**
 * Whether word `w` has every letter of "git" among its letters and the letters its `{x..y}` letter ranges make, for a
 * brace expansion too big for braceExpand: a number range (`{1..2000}`, `f{1..1100}.txt`) adds no letter, so it can
 * never spell git (T-436).
 */
const braceLetters = (w: string) => {
  const letters = w
    .replace(/\{-?\d+\.\.-?\d+(?:\.\.-?\d+)?\}/g, '')
    .replace(/\{([A-Za-z])\.\.([A-Za-z])(?:\.\.-?\d+)?\}/g, (_, a: string, b: string) => {
      const [x, y] = [a.charCodeAt(0), b.charCodeAt(0)].sort((m, n) => m - n) as [number, number]
      return Array.from({ length: y - x + 1 }, (_, k) => String.fromCharCode(x + k)).join('')
    })
    .toLowerCase()
  // a range left (`{*..h}`) may make any character in zsh (T-450)
  if (/\{[^{}]*\.\.[^{}]*\}/.test(letters)) return true
  return [...'git'].every(c => letters.includes(c))
}

/**
 * Whether every brace group in word `w` is a plain comma list: no `..` range in it (zsh makes a range of any two
 * characters, `{*../}`), and no comma part that starts with "-" (it may make an option). A word may only keep its
 * braces as a path after `--` or as echo, printf or `x=` text when this holds (T-450).
 */
const plainBraces = (w: string) => {
  const v = w.replace(/[@$]\{[^{}]*\}/g, '').replace(/\{\}/g, '')
  // a word too big to look at stays refused, so an odd word stays cheap
  if (v.length > BRACE_CHARS_MAX || v.split('{').length - 1 > BRACE_OPEN_MAX || /[{,]-/.test(v)) return false
  for (let i = v.indexOf('{'); i >= 0; i = v.indexOf('{', i + 1)) {
    let depth = 0
    let j = i
    for (; j < v.length; j++) {
      if (v[j] === '{') depth++
      else if (v[j] === '}' && --depth === 0) break
    }
    if (v.slice(i + 1, j).includes('..')) return false
  }
  return true
}

/**
 * The places in simple command `words` of the words given to a read-only text tool (TEXT_TOOLS) that find runs with
 * -exec, -execdir, -ok or -okdir, up to the ending `;` or `+` (`grep`'s `-l git {}` in `find . -exec grep -l git {} +`).
 * The command find runs is the word right after -exec; when it is a text tool, a `git` among its words is only text.
 */
function findExecTextArgs(words: string[]): Set<number> {
  const out = new Set<number>()
  if (!words.some(w => progName(w) === 'find')) return out
  for (let i = 0; i < words.length; i++) {
    if (!/^-(exec|execdir|ok|okdir)$/.test(words[i]!)) continue
    let end = i + 1
    while (end < words.length && !/^(\\?;|\+)$/.test(words[end]!)) end++
    if (textTool(words.slice(i + 1, end))) for (let k = i + 2; k < end; k++) out.add(k)
    i = end
  }
  return out
}

/** Whether the command splitter may misread `text`: it has a newline, a backslash, `$'` or a `#` that starts a word. */
const unsplit_ = (text: string) => /\n|\\|\$'|(?:^|[\s;&|()<>`])#/.test(text)

/**
 * `text` without the backslashes that are plain text to bash (T-485): each one inside '...', and each one inside
 * "..." before a letter it doesn't escape there (`"a\|b"`, `"\.ts"`). Those can't hide a `&`, `;` or `|` from the
 * command splitter, which reads quotes as bash does. A backslash outside quotes, or one inside "..." before `\`, `"`,
 * `$`, a backquote or a newline, is kept, as is all of an unclosed quote, so unsplit_ still sees it.
 */
function dropQuotedBackslashes(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\') (out += c + (text[i + 1] ?? '')), i++
    else if (c === "'" || c === '"') {
      let j = i + 1
      let inner = ''
      for (; j < text.length && text[j] !== c; j++) {
        const d = text[j]!
        if (d !== '\\') inner += d
        else if (c === '"' && /[\\"$`\n]/.test(text[j + 1] ?? '\n')) (inner += d + (text[j + 1] ?? '')), j++
      }
      if (j >= text.length) return out + text.slice(i)
      out += c + inner + c
      i = j
    } else out += c
  }
  return out
}

/**
 * `text` with each '...' outside double quotes and outside a backslash's reach replaced by `''` (what is in it is
 * plain text to bash). An unclosed one is kept as it is.
 */
function dropSingleQuoted(text: string): string {
  let out = ''
  let dq = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\') (out += c + (text[i + 1] ?? '')), i++
    else if (c === '"') (dq = !dq), (out += c)
    else if (c === "'" && !dq) {
      const end = text.indexOf("'", i + 1)
      if (end < 0) return out + text.slice(i)
      out += "''"
      i = end
    } else out += c
  }
  return out
}

/** Whether word `w` is a shell assignment (`x=...`, `x+=...`). */
const isAssign = (w: string) => /^[A-Za-z_]\w*\+?=/.test(w)

/** Whether word `w` is echo or printf (by name, or by its full path in TOOL_DIR). */
const isPrint = (w: string | undefined) => w !== undefined && (!w.includes('/') || TOOL_DIR.test(w)) && /^(echo|printf)$/.test(progName(w))

/**
 * Whether simple command `p` only sets variables and prints text: leading `x=` words, then nothing or echo/printf,
 * with no command run inside it, no here-document and no redirection (`>`, `<`).
 */
const printOrAssign = (p: { text: string; doc?: boolean; words: string[] }) => {
  if (p.doc || RUNS_INSIDE.test(p.text) || /[<>]/.test(p.text)) return false
  const cmd = p.words.find(w => !isAssign(w))
  return cmd === undefined || isPrint(cmd)
}

/**
 * The places in simple command `p` of words whose braces never spell a command: its leading `x=` words (bash doesn't
 * brace-expand an assignment), and the words given to echo or printf right after them.
 */
function braceTextArgs(p: { words: string[] }): Set<number> {
  const out = new Set<number>()
  let i = 0
  for (; i < p.words.length && isAssign(p.words[i]!); i++) out.add(i)
  if (isPrint(p.words[i])) for (let k = i + 1; k < p.words.length; k++) out.add(k)
  return out
}

/**
 * For each simple command of `pieces` (one command line), the folder it runs in when that can be told (T-591): the
 * shell's folder `cwd` (when it is a plain literal path) until a `cd` or `pushd`; after a `cd <plain literal absolute
 * path>` (literalPath) that folder, but only for the commands joined to that cd by `&&` alone, so a cd that fails
 * stops them (`cd /tmp/x; git commit` would commit in the shell's folder when /tmp/x is missing). A cd after `||`,
 * a cd to anything else (a variable, `$(mktemp -d)`, `~`, a relative path), any other operator after a cd, a
 * here-document, and a pipe, a group or a subshell anywhere in the line leave the folder unknown (no entry); a line
 * with a pipe, group or subshell but no word that may change folder (FOLDER_WORDS, or a command run from a variable)
 * runs every command in the shell's folder (T-1053).
 */
/** Words that may change the shell's folder when they are not the first word of a command (gitFolders). */
const FOLDER_WORDS = new Set(['cd', 'pushd', 'popd', 'eval', 'source', '.'])

function gitFolders(pieces: ShellPiece[], cwd?: string): Map<ShellPiece, string | undefined> {
  const out = new Map<ShellPiece, string | undefined>()
  if (pieces.some(p => !('op' in p) && p.doc)) return out
  if (pieces.some(p => 'op' in p && (p.op === '|' || p.op === '(' || p.op === ')'))) {
    // T-1053: with no word anywhere that may change folder (cd, eval, source... or a command run from a variable),
    // every command of a pipe or group runs in the shell's folder (`git merge main 2>&1 | tail -20`)
    const dir = cwd ? literalPath(cwd) : undefined
    const moves = pieces.some(p => {
      if ('op' in p) return false
      const words = rawWords(p.text)
      return !!words[0]?.expands || words.some(x => FOLDER_WORDS.has(x.w))
    })
    if (!moves && dir !== undefined) for (const p of pieces) if (!('op' in p)) out.set(p, dir)
    return out
  }
  let dir = cwd ? literalPath(cwd) : undefined
  let moved = false
  let prev: string | undefined
  for (const p of pieces) {
    if ('op' in p) {
      if (p.op !== '&&' && moved) dir = undefined
      prev = p.op
      continue
    }
    out.set(p, dir)
    const words = rawWords(p.text)
    const name = words[0]?.raw
    if (name === 'cd' || name === 'pushd' || name === 'popd') {
      moved = true
      dir = name !== 'popd' && prev !== '||' && words.length === 2 ? literalPath(words[1]!.raw) : undefined
    } else if (words[0]?.expands || (!isGit(words[0]?.w ?? '') && words.some(x => FOLDER_WORDS.has(x.w)))) {
      // a cd with a word before it (`builtin cd`, `command cd`, `x=1 cd`, `'cd'`), a command run by name from a
      // variable, or text run again (`eval`, `source`, `.`) may change folder: the folder is unknown from here
      moved = true
      dir = undefined
    }
  }
  return out
}

/** gitWriteIn's walk of `command`: the first git write found (`bad`), whether any git runs, and the first setting from GIT_ENV_REFUSED. */
function gitScan(command: string, depth: number, allow?: GitAllow, broad = false, cwd?: string): { bad?: string; git: boolean; env?: string } {
  const out: { bad?: string; git: boolean; env?: string } = { git: false }
  if (depth > 4) return out
  const pieces = shellPieces(command)
  // only the line itself tells which folder its commands run in; text a shell runs again (depth > 0) never does
  const dirs = depth === 0 ? gitFolders(pieces, cwd) : new Map<ShellPiece, string | undefined>()
  // `adds`: an xargs or parallel comes before it in the line (`xargs -I{} git {}` is cut at the braces)
  let seen = false
  const simple = pieces.flatMap(p => {
    if ('op' in p) return []
    const raws = rawWords(p.text)
    const words = raws.map(x => x.w)
    const adds = seen
    seen ||= words.some(a => ADDS_WORDS.has(progName(a)))
    return [{ ...p, words, raws, top: depth === 0 && !p.doc, dir: dirs.get(p), braces: rawWords(p.text, braceLit).map(x => x.w), adds }]
  })
  /** Where the git command that starts simple command `p` runs (GitPlace), for `allow`; only for one at the line's top. */
  const placeOf = (p: (typeof simple)[number]) => (p.top ? { raws: p.raws, dir: p.dir } : undefined)
  /**
   * The git write of the git command at `words[at]` (`git ...` or `git-xyz ...`), and the word after it, or undefined
   * when it isn't git. `place`: the simple command's words as written and its folder, when `words[at]` starts it.
   */
  const gitAt = (words: string[], at: number, adds: boolean, braces: string[], place?: { raws: RawWord[]; dir?: string }): { bad?: string } | undefined => {
    const w = words[at]!
    // a git program called by its own name, as in git's libexec folder (`.../git-core/git-stash`)
    const dashed = /(?:^|\/)git-([\w-]+)$/i.exec(w)?.[1]
    // an option whose value is git runs it with the words after (`rg --pre=git stash .` runs `git stash`)
    // brace expansion may spell git (`{git,} stash`, `{git,stash}`, `g{i,}t stash`)
    const braced = !dashed && !isGit(w) && braceGit(braces[at] ?? w)
    if (!dashed && !isGit(w) && !/=git$/i.test(w) && !braced) return undefined
    out.git = true
    // xargs and parallel add words from their input (`stash`, `--output=x`), so what that git does can't be known
    if (adds || words.slice(0, at).some(a => ADDS_WORDS.has(progName(a)))) return { bad: 'xargs git' }
    if (braced) return { bad: `git ${BRACE_WHAT}` }
    let j = at + 1
    let sub = dashed
    let refused: string | undefined
    if (!dashed) {
      for (; j < words.length && words[j]!.startsWith('-'); j += GIT_GLOBAL_VALUE.has(words[j]!) ? 2 : 1)
        if (!refused && GIT_GLOBAL_REFUSED.test(words[j]!)) refused = words[j]!.split('=')[0]
      sub = words[j++]
    }
    // bash's brace expansion makes new words (`git {stash,}` runs `git stash`, `git -C {.,} stash` runs `git -C . stash`),
    // so what a git command with a "{" in its words does can't be told from its text (T-446). Only words after a `--`
    // of a read-only command (GIT_READ) may have braces (`git diff -- hooks/{a,b}.ts`): they are paths, and when that
    // `--` is an option's value (`git log --grep -- {--output=x,}`) none of the words they make may start with "-" (T-450).
    const dashes = sub !== undefined && GIT_READ.has(sub) ? words.indexOf('--', j) : -1
    const own = dashes < 0 ? braces.slice(at + 1) : braces.slice(at + 1, dashes)
    const paths = dashes < 0 ? [] : braces.slice(dashes + 1).filter(hasBrace)
    if (own.some(hasBrace) || paths.some(w => !plainBraces(w) || braceExpand(w)?.every(e => !e.startsWith('-')) !== true)) return { bad: `git ${BRACE_WHAT}` }
    if (refused) return { bad: `git ${refused}` }
    if (sub === undefined) return {}
    const args = words.slice(j)
    const where = place && at === 0 && !dashed && isGit(w) ? { pre: place.raws.slice(1, j - 1), args: place.raws.slice(j), dir: place.dir } : undefined
    if (allow?.(sub, args, where)) return {}
    if (!gitReadOnly(sub, args)) return { bad: `git ${sub}` }
    const opt = gitBadOption(sub, args)
    return opt ? { bad: `git ${sub} ${opt}` } : {}
  }
  /**
   * Whether a simple command's `git` words are only text: a TEXT_TOOLS command, or a read-only git command (checked
   * by gitAt), with no command run inside it and not in a here-document.
   */
  const exempt = (p: (typeof simple)[number]): boolean => {
    if (p.words.length === 0) return true
    if (p.doc || RUNS_INSIDE.test(p.text)) return false
    if (textTool(p.words) || plainCd(p)) return true
    const w = p.words[0]!
    // `HEAD@{1}` braces were cut at before T-439's round 6, so a line with `@{` gets no read-only git exception
    if (command.includes('@{')) return false
    return (isGit(w) || /(?:^|\/)git-[\w-]+$/i.test(w)) && gitAt(p.words, 0, p.adds, p.braces, placeOf(p))?.bad === undefined
  }
  // Text one command prints may be run by another (`grep -h git notes | sh`, `grep ... > s; $SHELL s`, `./s`), and a
  // list of programs that run their input or a file can never be complete. So the exceptions hold only when every
  // command in the whole line is exempt; one other command anywhere (sh, $SHELL, ./s, chmod, echo, tee...) keeps
  // main's broad rule for all of it. The command splitter doesn't know `#` comments or `$'...'` quoting, so with a
  // newline, a `#` that starts a word or `$'` in the line (`grep x #'` + newline + `git stash`) no exception holds either.
  // Nor with a backslash outside quotes: an escape like `a\>&` hides a background `&` from the splitter (T-439 round 7).
  /** Adds inner gitScan result `inner` to `out`; the result to return when it found a git write. */
  const fold = (inner: { bad?: string; git: boolean; env?: string }) => {
    out.git ||= inner.git
    out.env ??= inner.env
    return inner.bad ? { ...out, bad: inner.bad } : undefined
  }
  // a backslash inside quotes that is plain text to bash (`grep "a\|b" x`) doesn't count (T-485)
  const unsplit = unsplit_(dropQuotedBackslashes(command))
  // a word anywhere that names a git program (`.../git-core/git-stash`, as an option's value too) keeps main's rule
  const gitProgram = simple.some(p => p.words.some(w => /(?:^|[/=])git-[\w-]+$|git-core\//i.test(w)))
  broad ||= unsplit || gitProgram || !simple.every(exempt)
  // T-450: a brace word in a leading `x=` assignment (bash doesn't brace-expand it) or given to echo or printf is only
  // text, when every other command in the line is exempt or one of these too, so nothing runs that text again
  // (`echo {git,stash} | sh` and `x={git,stash}; eval $x` stay refused)
  // (a backslash inside '...' is plain text to bash and to the splitter, as in `printf '%s\n' {a,b}`)
  const quiet = !unsplit_(dropSingleQuoted(command)) && !gitProgram && simple.every(p => exempt(p) || printOrAssign(p))
  for (const p of simple) {
    const words = p.words
    const textBraces = quiet ? braceTextArgs(p) : new Set<number>()
    for (const w of words) out.env ??= GIT_ENV_REFUSED.exec(w)?.[1]
    if (!broad && exempt(p)) continue
    // text a shell runs again (`bash -c '{git,stash}'`, `eval '{git,stash}'`) is a whole command of its own, with its
    // own brace expansion and splitting, so each word after a shell or eval is checked as one (T-446)
    const shellAt = words.findIndex(w => RERUNS.has(progName(w)))
    if (shellAt >= 0) {
      const rest = words.slice(shellAt + 1)
      const texts = progName(words[shellAt]!) === 'eval' ? [rest.join(' ')] : rest.filter(w => !/^[-+]/.test(w))
      for (const t of texts) {
        const bad = fold(gitScan(t, depth + 1, allow, true))
        if (bad) return bad
      }
    }
    const toolArgs = findExecTextArgs(words)
    // main's broad rule: any word `git` (or ending in `/git`, or `git-xyz`) counts, and text from a `git` on in any
    // word that holds more than one word or command (quoted text run by sh -c, `X='git stash'`, `-O"git stash"`)
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!
      // a word given to a text tool run by find -exec is its text, not a git command (`find . -exec grep -l git {} +`)
      const g = toolArgs.has(i) || (textBraces.has(i) && hasBrace(p.braces[i] ?? '') && plainBraces(p.braces[i] ?? '')) ? undefined : gitAt(words, i, p.adds, p.braces, i === 0 ? placeOf(p) : undefined)
      if (g?.bad) return { ...out, bad: g.bad }
      if (g) continue
      const at = w.search(/git(?!\w)/i)
      if (at >= 0 && /[\s;&|<>()`$]/.test(w.slice(at))) {
        const bad = fold(gitScan(w.slice(at), depth + 1, allow, broad))
        if (bad) return bad
      }
    }
  }
  return out
}

/** The start of each git write reason: `what` may change something, and `who` may only read with git. */
const gitReadOnlyText = (what: string, who: string) =>
  `Refused: ${what} may change the repository or run another program, and ${who} may only read with git (diff, log, show, status, blame, grep, rev-parse, ls-files, branch --list, stash list/show, remote -v, config --get, reflog), without options that write a file or run a program (--output, -O, --ext-diff, -c, GIT_* settings).`

/** The sentence a worker's or checker's git refusal adds: the /tmp scratch way that is allowed (scratchGitAllow, T-591). */
export const SCRATCH_GIT_TEXT = 'A scratch repository under /tmp with a plain path is fine (e.g. git init /tmp/x, git -C /tmp/x commit -m m); no $TMPDIR, $(mktemp), ~ or ..'

/** The reason a checker reads when its Bash command runs git command `what` (from gitWriteIn), which may change something. */
export const gitWriteText = (what: string) =>
  `${gitReadOnlyText(what, 'the checker')} Check the work without changing any branch, commit, tag or the stash. ${SCRATCH_GIT_TEXT}`

/**
 * The reason a worker reads when its Bash command runs git command `what` (from gitWriteIn) that workerGitAllow
 * doesn't let through (T-1053): a worker may change git only in its own folder, on its own branch, since branch
 * names, remotes, settings and tags are shared with the owner's folder (main too).
 */
export const workerGitWriteText = (what: string) =>
  `Refused: ${what} may change more than your own branch. In your own folder you may change git on your own branch (commit, merge, cherry-pick, revert, restore, checkout -- <file>, reset, rebase of your branch, bisect, fetch, pull, add, rm). Not allowed: push or changing remotes; switching to, making or deleting a branch (checkout or switch to a branch, branch -d/-D/-m); worktree; config; tag; stash (it is shared with the owner's folder); a git command that runs another program (rebase --exec, bisect run); a git command in another folder, through a $variable, or with -c or GIT_* settings. ${SCRATCH_GIT_TEXT}`

/**
 * The reason a scout reads when its Bash command runs git command `what` (from gitWriteIn), which may change
 * something: a scout runs in the owner's own folder, so a git write there changes the owner's branch, files or stash.
 */
export const scoutGitWriteText = (what: string) =>
  `${gitReadOnlyText(what, 'a scout')} You run in the owner's own folder: don't commit, push, merge, reset, switch branches, stash or move any branch or tag. Report what you find instead.`
