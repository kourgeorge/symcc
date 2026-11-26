// TEST ONLY (T-1116): compares the new git guard with main's old regex guard (tests/git-guard-old.ts) on random
// wrapper, option, shell, redirect and quote mixes. The new guard must refuse everything the old one refused, except
// for a short named list of shapes that never run git (ALLOWED), where the old guard read the shell wrongly.
import { gitWriteIn } from '../hooks/core/git-guard'
import { gitWriteIn as oldGitWriteIn } from './git-guard-old'

type Who = 'reader' | 'worker'

/** A shell or eval word, also by a path or with a backslash (`/bin/bash`, `\sh`). */
const SHELL_WORD = /^\\?(?:\/[\w.-]+)*\/?(?:sh|bash|zsh|dash|ksh|fish|eval)$/
const SEPARATORS = new Set([';', '&&', '||', '|', '&'])

/** The words of `w`'s command that holds word `k` (between separators), before `k`. */
const before = (w: string[], k: number) => {
  let s = k
  while (s > 0 && !SEPARATORS.has(w[s - 1]!)) s--
  return w.slice(s, k)
}

/** Whether words `b` (before a word) read the words after them as a script: eval, env -S, sh -c. */
const readsScript = (b: string[]) =>
  b.some((y, k) => /(^|\/)eval$/.test(y) ||(/^-[a-zA-Z]*S|^--split/.test(y) && b.slice(0, k).some(z => /(^|\/)env$/.test(z))) ||
    (SHELL_WORD.test(y) && b.slice(k + 1).some(z => /^['"]?-[a-zA-Z]*c/.test(z))))

/** Whether word `x` is an option, also in quotes (`'-i git push'`), but not a lone `--`. */
const option = (x: string | undefined) => !!x && /^['"]?-/.test(x) && x !== '--'

/** A word that stands for a removed one: no command and no git command name. */
const GONE = 'x.ts'

/** The words of `w` without word `k` and the rest of its command (up to a separator). */
const cut = (w: string[], k: number) => {
  let e = k
  while (e < w.length && !SEPARATORS.has(w[e]!)) e++
  return [...w.slice(0, k), ...w.slice(e)]
}

/**
 * The shapes where the old guard refused but no git runs, each a rewrite of the words that takes the shape away; a
 * command the new guard lets through must, after all of them, be let through by the old guard too. Each one is
 * narrow, so a real hole is not hidden; the first one asks the new guard whether a command starts there.
 */
export const ALLOWED: [name: string, rewrite: (w: string[], who: Who) => string[]][] = [
  // `echo &>x git push` is echo with a redirect: git push is echo's words
  ['&> after a word is a redirect (echo &>x git push runs echo)', w => w.map(x => (x.startsWith('&>') ? '>' + x.slice(2) : x))],
  // `time > git commit` writes a file named git; the old guard could take `>` as an option's value
  ['the word after a lone > or < is its file (time > git commit)', w => w.map((x, k) => (k > 0 && /^\d*[<>]$/.test(w[k - 1]!) && !SEPARATORS.has(x) ? GONE : x))],
  // the old guard took sh, bash or eval anywhere as a command start (`grep sh git push`, `nice root watch bash git
  // push`): it counts only where the new guard sees no command start either (`git push` put there is let through)
  ['a shell or eval word where no command starts (grep sh git push)', (w, who) =>
    w.map((x, k) => (k > 0 && SHELL_WORD.test(x) && gitWriteIn([...w.slice(0, k), '/usr/bin/git', 'push'].join(' '), who) === undefined ? GONE : x))],
  // a program reads a quoted option with a space as one option word, never as more words (`watch '-i git push'` and
  // `bash -c '-i git push'` fail); only env -S splits it
  ["a quoted option with a space is one word (watch '-i git push' fails)", w =>
    w.map((x, k) => (/^(['"])-[^-].* .*\1$/.test(x) && !before(w, k).some((y, j, b) => /^-[a-zA-Z]*S|^--split/.test(y) && b.slice(0, j).some(z => /(^|\/)env$/.test(z))) ? '-q' : x))],
  // a shell's lone `-` or `--` ends its options: the next word is a script file (`bash - -i git push` runs file -i)
  ["after a shell's lone - or -- comes a script file (bash -- -c git push)", w => {
    for (let k = 0; k < w.length; k++) {
      if (!SHELL_WORD.test(w[k]!) || w[k]!.endsWith('eval')) continue
      for (let j = k + 1; j < w.length && /^[-+]|^\d*[<>]/.test(w[j]!); j++) {
        if (/^-[a-zA-Z]*c/.test(w[j]!)) break
        if (w[j] === '-' || w[j] === '--') return cut(w, k + 1)
      }
    }
    return w
  }],
  // watch and eval join their words with spaces and run the text: `watch sh -c 'git push'` runs `sh -c git push`
  ["watch and eval join their words, so quotes are lost (watch sh -c 'git push' runs plain git)", w =>
    w.flatMap((x, k) => (/^(['"]).*\1$/.test(x) && before(w, k).some(y => /(^|\/)(watch|eval)$/.test(y)) ? x.slice(1, -1).split(' ') : [x]))],
  // `bash -c git commit` runs `git` with $0 set to commit (zsh -exec is -e -x -e -c)
  ['after sh -c only the script word runs (bash -c git commit runs plain git)', w => {
    const drop = new Set<number>()
    for (let k = 0; k < w.length; k++) {
      if (!SHELL_WORD.test(w[k]!) || w[k]!.endsWith('eval')) continue
      let j = k + 1
      let c = false
      for (; j < w.length && /^['"]?[-+]|^\d*[<>]/.test(w[j]!); j++) if (/^['"]?-[a-zA-Z]*c/.test(w[j]!)) c = true
      if (c) for (let e = j + 1; e < w.length && !SEPARATORS.has(w[e]!); e++) drop.add(e)
    }
    return w.filter((_, k) => !drop.has(k))
  }],
  // the old guard took -exec anywhere as a command start; only find runs the words after it
  ['-exec runs a command only after find (echo -exec git push)', w => w.map((x, k) => (/^-exec|^-ok/.test(x) && !before(w, k).some(y => /(^|\/)find$/.test(y)) ? GONE : x))],
  // bash and sh refuse `eval -E ...`; after `eval --` or a number the next word is the command (`eval 5 git push` runs 5)
  ['an option or number after eval (eval -E fails, eval -- -s runs -s)', w => {
    for (let k = 0; k < w.length; k++) {
      if (!/(^|\/)eval$/.test(w[k]!)) continue
      const n = w[k + 1] === '--' ? w[k + 2] : w[k + 1]
      if (option(n) || /^\d[\w.]*$/.test(n ?? '')) return cut(w, k)
    }
    return w
  }],
  // `env -S root git push` and `env -Si git push` run root and i: -S's text is env's own words
  ["env -S's text is env's own words (env -S root git push runs root)", w =>
    w.map((x, k) => (/(^|\/)env$/.test(x) && w.slice(k + 1).some(y => /^-[a-zA-Z]*S/.test(y) || y.startsWith('--split-string')) ? GONE : x))],
  // the old guard took quotes out first, so `'git push'` was git push; the shell runs a command named "git push"
  // (none). Not where the words are read as a script (sh -c, eval, env -S, find -exec).
  ["a quoted word with a space is one word ('git push' runs no git)", w =>
    w.map((x, k) => (/^(['"]).* .*\1$/.test(x) && !readsScript(before(w, k)) ? GONE : x))],
]

/** The word groups random commands are made of; wrappers and options come up most. */
const GROUPS = [
  ['sudo', 'env', 'xargs', 'nice', 'timeout', 'watch', 'eval', 'command', 'exec', '-', 'doas', 'time', 'nohup', '/usr/bin/env', 'noglob'],
  ['-u', '-i', '-n', '-0', '-s', '-E', '--', '-S', '-iu', '--user', '-c', '-l', '-I', '-r', '-R', '-T', '-x', '-5', '-lc', '-C', '-g', '-k'],
  ['root', '5', 'KILL', 'X', '/tmp', 'A=1', 'grep', 'echo', 'find', '-exec', 'x.ts'],
  ['sh', 'bash', 'zsh', 'fish', 'dash', '\\sh', '/bin/bash'],
  ['>x', '2>x', '>', '<x', '&>x', '>&2', '2>&1'],
  ["'-i'", '"-u"', "'git push'", '"git push"', "'-i git push'", "'-u root git push'", '\\git', '/usr/bin/git', '"git"'],
  ['git', 'push', 'commit', ';', '&&', '||', '|', '&'],
]
const WEIGHTS = [4, 4, 2, 2, 1, 1, 1]

/** `count` random commands (a fixed seed, so every run is the same) of 1 to 8 words, most ending in a git call. */
export function randomCommands(count: number, seed = 11): string[][] {
  // mulberry32: 32-bit steps only, so the numbers never lose precision and repeat soon
  const rnd = (n: number) => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
  const total = WEIGHTS.reduce((a, b) => a + b)
  const pick = () => {
    let r = rnd(total)
    let g = 0
    while (r >= WEIGHTS[g]!) r -= WEIGHTS[g++]!
    const words = GROUPS[g]!
    return words[rnd(words.length)]!
  }
  const out: string[][] = []
  for (let k = 0; k < count; k++) {
    const w: string[] = []
    for (let j = 1 + rnd(8); j > 0; j--) w.push(pick())
    if (rnd(4)) w.push('git', rnd(2) ? 'push' : 'commit')
    out.push(w)
  }
  return out
}

/**
 * The commands in `commands` (each as its words) the old guard refuses and the new one lets through, for `who`, that
 * no ALLOWED shape explains; and how often each ALLOWED shape was used.
 */
export function newGuardMisses(commands: string[][], who: Who): { misses: string[]; used: Record<string, number> } {
  const misses: string[] = []
  const used: Record<string, number> = {}
  for (const w of commands) {
    const c = w.join(' ')
    if (oldGitWriteIn(c, who) === undefined || gitWriteIn(c, who) !== undefined) continue
    let words = w
    const names: string[] = []
    for (const [name, rewrite] of ALLOWED) {
      const next = rewrite(words, who)
      if (next.join(' ') !== words.join(' ')) names.push(name)
      words = next
    }
    if (oldGitWriteIn(words.join(' '), who) !== undefined) misses.push(c)
    else for (const n of names) used[n] = (used[n] ?? 0) + 1
  }
  return { misses, used }
}

export { oldGitWriteIn }
