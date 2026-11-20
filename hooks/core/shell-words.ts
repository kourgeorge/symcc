// Reading shell text the way the guards need it: splitting a command into pieces and words (shellPieces,
// shellWords, rawWords), and telling which words are only text to a command (sed scripts, grep patterns,
// dropTextWords). A best effort, not a shell parser. Used by the path guard (path-guard.ts) and the git
// guard (git-guard.ts); it depends on neither.

/** Characters that split a shell command into the words checked by bashOutsideFolder: spaces, quotes, operators, `$(...)`, `=` and `:`. */
const SHELL_SPLIT = /[\s'"`;&|<>(){}$=:,]+/

/** Characters (besides spaces outside quotes) that end a word in shellWords. */
const WORD_END = /[;&|<>(){}$=:,`]/

/** A word of a shell command, and whether any of it was inside quotes (or a here-document's text). */
type ShellWord = { w: string; q: boolean }

/**
 * The words of simple command `text` as the shell reads them, so a path with a space in it stays whole: quotes are
 * dropped and what is inside them kept together, and a backslash keeps the next character (a space too) in the word.
 * Unlike the shell, `WORD_END` characters end a word even inside quotes, so `"--out=/x"` and `"$(cat /x)"` still give
 * `/x`. A best effort, not a shell parser.
 */
export function shellWords(text: string): ShellWord[] {
  const out: ShellWord[] = []
  let w = ''
  let q = false
  let quote = ''
  const cut = () => {
    if (w) out.push({ w, q })
    w = ''
    q = false
  }
  for (let i = 0; i < text.length; i++) {
    let c = text[i]!
    if (c === '\\' && quote !== "'") {
      c = text[++i] ?? ''
      if (c === '\n' || c === "'" || c === '"') continue
      if (/\s/.test(c)) {
        w += c
        continue
      }
    } else if (quote) {
      if (c === quote) {
        quote = ''
        continue
      }
    } else if (c === "'" || c === '"') {
      quote = c
      continue
    } else if (/\s/.test(c)) {
      cut()
      continue
    }
    if (WORD_END.test(c)) cut()
    else (w += c), (q ||= !!quote)
  }
  cut()
  return out
}

/** For each character of `text`, whether it is inside quotes (the quote marks themselves are not). */
function quoteMask(text: string): boolean[] {
  const mask: boolean[] = []
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\' && quote !== "'") {
      mask[i] = mask[i + 1] = !!quote
      i++
    } else if (quote) {
      if (c === quote) quote = ''
      else mask[i] = true
    } else if (c === "'" || c === '"') quote = c
  }
  return mask
}

/**
 * The words bashOutsideFolder checks in piece `p`: those of shellWords and those cut at every quote and operator
 * (SHELL_SPLIT), with backslashes dropped. A word counts as quoted only when every time it shows up it is inside
 * quotes, or it is a here-document's text.
 */
export function pieceWords(p: { text: string; doc?: boolean }): Map<string, boolean> {
  const words = new Map<string, boolean>()
  const add = (word: string, q: boolean) => {
    const w = word.replace(/\\/g, '')
    if (w) words.set(w, (words.get(w) ?? true) && (q || !!p.doc))
  }
  const mask = quoteMask(p.text)
  let at = 0
  for (const part of p.text.split(SHELL_SPLIT_KEEP)) {
    if (part && !SHELL_SPLIT_KEEP.test(part)) add(part, mask[at] === true)
    at += part.length
  }
  for (const { w, q } of shellWords(p.text)) add(w, q)
  return words
}

/** SHELL_SPLIT, keeping the separators when splitting (so where each word starts can be counted). */
const SHELL_SPLIT_KEEP = new RegExp(`(${SHELL_SPLIT.source})`)

/** `s` with every character that means something in a regular expression escaped. */
export const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

/**
 * A piece of a shell command as bashOutsideFolder walks it: a simple command's text (`doc`: a here-document's text), or
 * the operator between two. An opening "(" is a subshell (`sub`) for "(", "$(" and "`", and not for "{".
 */
export type ShellPiece = { text: string; doc?: boolean; by?: number; lit?: boolean } | { op: '&&' | '||' | ';' | '|' | '&' | ')' } | { op: '('; sub: boolean }

/** Where a here-document starts (`<<EOF`, `<<-'EOF'`, `<< "EOF"`, `<<\EOF`): its end word and whether tabs before it are dropped. */
const HEREDOC = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|<>()'"`]+))/

/**
 * `command` cut into simple commands and the operators between them (&&, ||, ;, newline as ";", |, a lone "&", and
 * "(", "{", "`" as opening and ")", "}", "`" as closing a group; "{" and "}" only as a word of their own at a command's start). Nothing is cut inside quotes or after a backslash, and
 * the "&" of a redirect (`2>&1`, `&>`) is no operator. The lines of a here-document (`cat > f <<'EOF'` ... `EOF`) come
 * as pieces marked `doc`, cut the same way but with quotes read as plain characters (an apostrophe in a here-document
 * opens no quote). A best effort, not a shell parser.
 */
export function shellPieces(command: string, doc = false): ShellPiece[] {
  const out: ShellPiece[] = []
  let text = ''
  let quote = ''
  let tick = false
  // `by`: where in `out` the command that started the here-document goes; `lit`: its end word is quoted, so its text is
  // taken as it is (no `$(...)` or "`" runs in it)
  const docs: { end: string; tabs: boolean; by: number; lit: boolean }[] = []
  const op = (o: '&&' | '||' | ';' | '|' | '&' | ')' | '(', sub = true) => {
    out.push(doc ? { text, doc } : { text }, o === '(' ? { op: o, sub } : { op: o })
    text = ''
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    const n = command[i + 1]
    // "<<<" is a here-string, not a here-document
    const hereString = !doc && !quote && c === '<' && n === '<' && command[i + 2] === '<'
    const here = !doc && !quote && !hereString && c === '<' && n === '<' ? HEREDOC.exec(command.slice(i)) : null
    if (hereString) (text += '<<<'), (i += 2)
    else if (quote) {
      if (c === '\\' && quote === '"') text += c + (n ?? ''), i++
      else {
        text += c
        if (c === quote) quote = ''
      }
    } else if (c === '\\') text += c + (n ?? ''), i++
    else if (!doc && (c === "'" || c === '"')) (quote = c), (text += c)
    else if (here) {
      docs.push({ end: here[2] ?? here[3] ?? here[4]!, tabs: here[1] === '-', by: out.length, lit: here[4] === undefined || here[0].includes('\\') })
      text += here[0]
      i += here[0].length - 1
    } else if ((c === '&' || c === '|') && n === c) op(c === '&' ? '&&' : '||'), i++
    else if (c === '|') op('|'), n === '&' && i++
    else if (c === '&' && n !== '>' && !/[<>]$/.test(text)) op('&')
    else if (c === '\n' && docs.length) {
      // the here-documents started on this line: their lines, up to each one's end word
      op(';')
      let j = i + 1
      for (const d of docs.splice(0)) {
        const lines: string[] = []
        while (j < command.length) {
          const e = command.indexOf('\n', j)
          const line = command.slice(j, e < 0 ? command.length : e)
          j = e < 0 ? command.length : e + 1
          if ((d.tabs ? line.replace(/^\t+/, '') : line) === d.end) break
          lines.push(line)
        }
        const body = lines.join('\n')
        const lit = d.lit || !/\$\(|`/.test(body)
        out.push(...shellPieces(body, true).map(x => ('op' in x ? x : { ...x, by: d.by, lit })), { op: ';' })
      }
      i = j - 1
    } else if (c === ';' || c === '\n') op(';')
    // a "{" or "}" opens or closes a `{ ...; }` group only as a word of its own at the start of a command; inside a
    // word (`git {stash,}`, `HEAD@{1}`, `find -exec ... {} +`) it is part of that word, as bash reads it (T-446)
    else if (c === '{' && !text.trim() && (n === undefined || /\s/.test(n))) op('(', false)
    else if (c === '}' && !text.trim() && (n === undefined || /[\s;&|)<>]/.test(n))) op(')')
    else if (c === '(') op('(')
    else if (c === ')') op(')')
    else if (c === '`') (tick = !tick) ? op('(') : op(')')
    else text += c
  }
  out.push(doc ? { text, doc } : { text })
  return out
}

/**
 * A word of a simple command as written (`raw`, quotes kept), what it is without quotes (`w`), whether the shell would
 * expand anything in it (`$` or "`" outside single quotes), and whether it holds a shell sign outside quotes (`sign`:
 * `<`, `>`, `|`, `&`, `;`, `(`, `)`, `{` or `}`), so that `a.ts>../../x` counts as a redirect stuck to a word and
 * `{a,../../x}` as a brace expansion, not only text (T-481).
 */
export type RawWord = { raw: string; w: string; expands: boolean; sign?: boolean }

/**
 * The words of simple command `text` as written, split at spaces outside quotes (see RawWord); in `w` quotes are dropped
 * and a backslash keeps the next character. A best effort, not a shell parser. `lit` maps each quoted or backslashed
 * character in `w` (braceLit).
 */
export function rawWords(text: string, lit = (c: string) => c): RawWord[] {
  const out: RawWord[] = []
  let cur: RawWord | undefined
  let quote = ''
  const add = (raw: string, w: string, expands = false) => {
    cur ??= { raw: '', w: '', expands: false }
    cur.raw += raw
    cur.w += w
    cur.expands ||= expands
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quote === "'") c === "'" ? ((quote = ''), add(c, '')) : add(c, lit(c))
    else if (c === '\\') add(c + (text[i + 1] ?? ''), lit(text[i + 1] ?? '')), i++
    else if (quote === '"') c === '"' ? ((quote = ''), add(c, '')) : add(c, lit(c), c === '$' || c === '`')
    else if (c === "'" || c === '"') (quote = c), add(c, '')
    else if (/\s/.test(c)) {
      if (cur) out.push(cur)
      cur = undefined
    } else {
      add(c, c, c === '$' || c === '`')
      // `{` and `}` too: `grep x {a,../../f}` expands to the path ../../f, which grep opens
      if (/[<>|&;(){}]/.test(c)) cur!.sign = true
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Text in a command that may make a plain command name run something else: a function or alias of that name, `hash`,
 * `enable`, a changed PATH, a file read into the shell (`source`, "."), `eval`. When it shows up, no word of the
 * command is taken as only text (T-481).
 */
export const SHADOWS = /\b(alias|function|hash|enable|eval|source|PATH|BASH_ENV|ENV|exec)\b|(^|[\s;&|(){}])\.\s/

/** A function defined with the name of a command whose words may be taken as only text (`cat() { bash; }`), looked for in the whole command (SHADOWS). */
export const SHADOW_FUNCTION = /\b(cat|tee|echo|printf|sed|gsed|grep|egrep|fgrep)\s*\(\s*\)/

/** A word that redirects (`>`, `2>&1`, `<`, `<<'EOF'`, `>f`): its operator part, and the target in the same word ('' when it is the next word). */
export const REDIRECT = /^(\d*|&)(>>?|>\||<<<|<<-?|<>|<)(&?)(.*)$/

/**
 * Whether simple command `words` sends what it prints (its standard output) only to files: at least one `>`, `>>` or
 * `1>` redirect, each to a plain path that is not `/dev/...` (but /dev/null) or `/proc/...`, and no `>&` or `&>` that could send it on to a pipe.
 */
function printsToFile(words: RawWord[]): boolean {
  let file = false
  for (let i = 0; i < words.length; i++) {
    const m = REDIRECT.exec(words[i]!.raw)
    // a redirect stuck after other text (`b>&2`, `b>x`) is not judged here: then it is not only to files
    if (!m && words[i]!.sign) return false
    if (!m) continue
    const [, fd, op, amp, rest] = m
    if (amp || fd === '&') return false
    if (!op!.startsWith('>')) continue
    if (fd && fd !== '1') continue
    const target = rest ? { ...words[i]!, w: rest, raw: rest } : words[i + 1]
    if (!target || target.expands || !target.w || /^[&<>]/.test(target.raw)) return false
    if (/^\/(dev|proc)\//i.test(target.w) && target.w !== '/dev/null') return false
    file = true
  }
  return file
}

/** Command `words` with any leading `NAME=value` settings dropped, and its command name (undefined when there is none). */
function commandOf(words: RawWord[]): { name: string | undefined; args: RawWord[] } {
  let i = 0
  while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i]!.raw)) i++
  return { name: words[i]?.raw, args: words.slice(i + 1) }
}

/** Whether a here-document's text, sent to simple command `text`, is only written to a file and never run: `cat` or `tee` that print only to files (printsToFile, T-481). */
export function docOnlyWritten(text: string): boolean {
  const words = rawWords(text)
  const { name } = commandOf(words)
  return (name === 'cat' || name === 'tee') && printsToFile(words)
}

/** Whether `s` is a sed script of `s`, `y` and plain one-letter commands only (with line or /regex/ addresses): nothing in it reads, writes or runs a file (no `r`, `R`, `w`, `W`, `e` command or flag). */
export function sedScriptSafe(s: string): boolean {
  let i = 0
  // a part ending at delimiter `d` (a backslash keeps the next character); false when it never ends
  const part = (d: string) => {
    for (; i < s.length; i++) {
      if (s[i] === '\\') i++
      else if (s[i] === d) return ++i, true
    }
    return false
  }
  const addr = () => {
    if (/\d/.test(s[i] ?? '')) while (/\d/.test(s[i] ?? '')) i++
    else if (s[i] === '$') i++
    else if (s[i] === '/' || s[i] === '\\') {
      const d = s[i] === '\\' ? s[++i] : '/'
      i++
      if (!d || d === '\n' || !part(d)) return false
      while (s[i] === 'I' || s[i] === 'M') i++
    }
    return true
  }
  while (i < s.length) {
    if (/[\s;]/.test(s[i]!)) {
      i++
      continue
    }
    if (!addr()) return false
    if (s[i] === ',') {
      i++
      if (!addr()) return false
    }
    while (s[i] === ' ' || s[i] === '!') i++
    const c = s[i++]
    if (c === 's' || c === 'y') {
      const d = s[i++]
      if (!d || d === '\\' || d === '\n' || !part(d) || !part(d)) return false
      if (c === 's') while (/[gpiImM\d]/.test(s[i] ?? '')) i++
    } else if (!c || !'dDpPgGhHxnNz={}'.includes(c)) return false
    if (i < s.length && !/[\s;}]/.test(s[i]!)) return false
  }
  return true
}

/**
 * Simple command `text` with the words that are only text to it taken out (T-481), and those words (`whole`), to be
 * checked each as one path, whole, the way a program that opens it would read it. That is what sed, grep, echo and
 * printf do with a word they are given: none of them finds a path inside its text and opens that (a sed script only
 * counts when sedScriptSafe passes it: no `r`, `w` or `e`), so `sed -i '' "s|'../../x'|'./x'|" f` is checked as
 * the one path `s|'..`/`..`/`x'|'.`/... inside the worker's folder, not as `../../x`. echo and printf only count when
 * they print to files (printsToFile), not to a shell (`echo 'cat ../../x' | sh`). Only words with nothing for the shell
 * to expand (`$`, "`") and not options or redirects count; the rest of `text`, and all of it for any other command,
 * stays as it is (perl, bun and node code may open any path written in it).
 */
export function dropTextWords(text: string): { text: string; whole: string[] } {
  const words = rawWords(text)
  const { name, args } = commandOf(words)
  const sed = name === 'sed' || name === 'gsed'
  const grep = name === 'grep' || name === 'egrep' || name === 'fgrep'
  const print = (name === 'echo' || name === 'printf') && printsToFile(words)
  if (!sed && !grep && !print) return { text, whole: [] }
  const skip = new Set<RawWord>()
  args.forEach((a, j) => {
    const after = j > 0 && REDIRECT.exec(args[j - 1]!.raw)?.[4] === ''
    // a word with a shell sign outside quotes (`a.ts>../../x`, `x<../../f`) may hold a redirect: it stays as it is
    if (a.expands || a.sign || after || REDIRECT.test(a.raw) || a.w.startsWith('-') || !a.w) return
    if (sed && !sedScriptSafe(a.w)) return
    skip.add(a)
  })
  if (!skip.size) return { text, whole: [] }
  return { text: words.map(w => (skip.has(w) ? "''" : w.raw)).join(' '), whole: [...skip].map(w => w.w) }
}

/**
 * Turns a quoted or backslashed "{", "}" and "," into "_" for rawWords, so what is left of them is what bash's brace
 * expansion may read (`'{"h":"%h"}'` is text, `{git,stash}` is not).
 */
export const braceLit = (c: string) => (/[{},]/.test(c) ? '_' : c)

/**
 * Whether word `w` (from rawWords with braceLit, so quoted braces are gone) has a "{" that bash's brace expansion may read: not a
 * git revision's `@{...}` (`HEAD@{1}`), not a `${...}` setting and not an empty `{}` (bash keeps it as text, as in
 * `find -exec git log {} +`).
 */
export const hasBrace = (w: string) =>
  w.replace(/[@$]\{[^{}]*\}/g, '').replace(/\{\}/g, '').includes('{')
