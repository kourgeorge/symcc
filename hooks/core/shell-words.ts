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

/** A word of a simple command as unresolvedTarget reads it: as written, and whether the shell expands something in it. */
type XWord = { raw: string; expands: boolean }

/** A word or a redirect operator (`>`, `>>`, `&>`, `<`, `<<`, ...) of a simple command, for unresolvedTarget. */
type XToken = XWord | { redir: string }

/**
 * Where the `close` matching an `open` (already passed) is in `s`, from `from` on; s.length when none. Quotes,
 * backslashes, backticks, nested `$(...)` / `${...}` and (inside `(...)`) comments are passed over, so a `)` in
 * `"..."` or after `#` doesn't end it early (T-963).
 */
function closeAt(s: string, from: number, open: string, close: string): number {
  let depth = 1
  for (let i = from; i < s.length; i++) {
    const c = s[i]!
    const n = s[i + 1]
    if (c === '\\') i++
    else if (c === "'") {
      const e = s.indexOf("'", i + 1)
      i = e < 0 ? s.length : e
    } else if (c === '"') i = dquoteEnd(s, i + 1)
    else if (c === '`') i = tickEnd(s, i + 1)
    else if (c === '$' && (n === '(' || n === '{')) i = closeAt(s, i + 2, n, n === '(' ? ')' : '}')
    else if (c === '#' && open === '(' && (i === from || /[\s;&|()]/.test(s[i - 1]!))) {
      const e = s.indexOf('\n', i)
      i = e < 0 ? s.length : e
    } else if (c === open) depth++
    else if (c === close && --depth === 0) return i
  }
  return s.length
}

/** Where the `"` closing one opened before `from` is (backslashes, backticks, `$(...)` and `${...}` passed over); s.length when none. */
function dquoteEnd(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    const c = s[i]!
    const n = s[i + 1]
    if (c === '\\') i++
    else if (c === '"') return i
    else if (c === '`') i = tickEnd(s, i + 1)
    else if (c === '$' && (n === '(' || n === '{')) i = closeAt(s, i + 2, n, n === '(' ? ')' : '}')
  }
  return s.length
}

/** Where the `]]` ending a `[[ ... ]]` test (its text starting at `from`) is; s.length when none. */
function testEnd(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    const c = s[i]!
    const n = s[i + 1]
    if (c === '\\') i++
    else if (c === "'") {
      const e = s.indexOf("'", i + 1)
      i = e < 0 ? s.length : e
    } else if (c === '"') i = dquoteEnd(s, i + 1)
    else if (c === '`') i = tickEnd(s, i + 1)
    else if (c === '$' && (n === '(' || n === '{')) i = closeAt(s, i + 2, n, n === '(' ? ')' : '}')
    else if (c === ']' && n === ']' && /\s/.test(s[i - 1]!) && !/[^\s;&|)]/.test(s[i + 2] ?? '')) return i
  }
  return s.length
}

/**
 * The commands run inside text the shell only expands (arithmetic `((...))`, a `[[ ... ]]` test, `${...}`): those of its
 * `$(...)` and backticks, added to `out`. Its `<` and `>` are comparisons, not redirects.
 */
function substCommands(s: string, out: XToken[][], bad: string[]): void {
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    const n = s[i + 1]
    if (c === '\\') i++
    else if (c === "'") {
      const e = s.indexOf("'", i + 1)
      i = e < 0 ? s.length : e
    } else if (c === '`') {
      const e = tickEnd(s, i + 1)
      expandCommands(s.slice(i + 1, e), out, bad)
      i = e
    } else if (c === '$' && (n === '(' || n === '{')) {
      const e = closeAt(s, i + 2, n, n === '(' ? ')' : '}')
      const inner = s.slice(i + 2, e)
      if (n === '(' && s[i + 2] !== '(') expandCommands(inner, out, bad)
      else substCommands(inner, out, bad)
      i = e
    }
  }
}

/** Where the backtick closing one opened before `from` is (a backslash keeps the next character); s.length when none. */
function tickEnd(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') i++
    else if (s[i] === '`') return i
  }
  return s.length
}

/**
 * `command` cut into simple commands of words and redirect operators, keeping `$(...)`, backticks, `${...}`, `$NAME`
 * and `<(...)` inside the word they are in (marked `expands`), and adding the commands inside `$(...)`, backticks and
 * `<(...)` as commands of their own. Here-document text and comments are skipped. A best effort, not a shell parser.
 */
function expandCommands(s: string, out: XToken[][] = [], bad: string[] = []): XToken[][] {
  let cmd: XToken[] = []
  let cur: XWord | undefined
  let quote = false
  let wantDelim = false
  // the end words of the here-documents started on this line; `lit`: quoted, so `$(...)` and backticks in the text don't run
  const pending: { end: string; lit: boolean }[] = []
  const endWord = () => {
    if (cur) {
      if (wantDelim) pending.push({ end: cur.raw.replace(/['"\\]/g, ''), lit: /['"\\]/.test(cur.raw) })
      else cmd.push(cur)
      wantDelim = false
    }
    cur = undefined
  }
  const endCmd = () => {
    endWord()
    if (cmd.length) out.push(cmd)
    cmd = []
  }
  const add = (t: string, x = false) => {
    cur ??= { raw: '', expands: false }
    cur.raw += t
    cur.expands ||= x
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    const n = s[i + 1]
    if (c === '\\') {
      add(c + (n ?? ''))
      i++
      continue
    }
    if (quote) {
      if (c === '"') {
        quote = false
        add(c)
        continue
      }
    } else {
      if (c === "'") {
        const e = s.indexOf("'", i + 1)
        const end = e < 0 ? s.length - 1 : e
        add(s.slice(i, end + 1))
        i = end
        continue
      }
      if (c === '"') {
        quote = true
        add(c)
        continue
      }
      if (c === '#' && !cur) {
        const e = s.indexOf('\n', i)
        i = (e < 0 ? s.length : e) - 1
        continue
      }
      if (c === '\n') {
        endCmd()
        // the here-documents started on this line: their lines are text, up to each one's end word; in an unquoted
        // one (`<<EOF`) the shell still runs `$(...)` and backticks, so such a line is kept in `bad` (T-963)
        let j = i + 1
        for (const d of pending.splice(0)) {
          while (j < s.length) {
            const e = s.indexOf('\n', j)
            const line = s.slice(j, e < 0 ? s.length : e)
            j = e < 0 ? s.length : e + 1
            if (line.replace(/^\t+/, '') === d.end) break
            if (!d.lit && /\$\(|`/.test(line)) bad.push(line.trim())
          }
        }
        i = j - 1
        continue
      }
      if (/\s/.test(c)) {
        endWord()
        continue
      }
      if ((c === '<' || c === '>') && n === '(') {
        const e = closeAt(s, i + 2, '(', ')')
        expandCommands(s.slice(i + 2, e), out, bad)
        add(s.slice(i, e + 1), true)
        i = e
        continue
      }
      if (c === '<' || c === '>' || (c === '&' && n === '>')) {
        // a number just before it is the file descriptor (`2>`), not a word
        if (cur && /^\d+$/.test(cur.raw)) cur = undefined
        else endWord()
        const m = /^(&>>|&>|>>|>\||>&|<<<|<<-|<<|<>|<&|>|<)/.exec(s.slice(i))!
        cmd.push({ redir: m[1]! })
        i += m[1]!.length - 1
        if (m[1] === '<<' || m[1] === '<<-') wantDelim = true
        continue
      }
      // `(( ... ))` arithmetic and a `[[ ... ]]` test: their `<` and `>` compare, so only their `$(...)` are followed;
      // `((` right after a word (`if((`, `while((`) is arithmetic too, never a here-document start (T-963)
      if (c === '(' && n === '(') {
        const e = closeAt(s, i + 2, '(', ')')
        if (s[e + 1] === ')') {
          endWord()
          substCommands(s.slice(i + 2, e), out, bad)
          i = e + 1
          continue
        }
      }
      if (c === '[' && n === '[' && !cur && /\s/.test(s[i + 2] ?? '')) {
        const e = testEnd(s, i + 2)
        substCommands(s.slice(i + 2, e), out, bad)
        i = e + 1
        continue
      }
      if (';&|()'.includes(c)) {
        endCmd()
        continue
      }
    }
    if (c === '`') {
      const e = tickEnd(s, i + 1)
      expandCommands(s.slice(i + 1, e), out, bad)
      add(s.slice(i, e + 1), true)
      i = e
      continue
    }
    if (c === '$') {
      if (n === '(') {
        const e = closeAt(s, i + 2, '(', ')')
        // `$((...))` is arithmetic: only its own `$(...)` and backticks run
        if (s[i + 2] !== '(') expandCommands(s.slice(i + 2, e), out, bad)
        else substCommands(s.slice(i + 2, e), out, bad)
        add(s.slice(i, e + 1), true)
        i = e
        continue
      }
      if (n === '[') {
        // `$[...]` is old-style arithmetic: its `<<` shifts, so only its own `$(...)` and backticks run (T-963)
        const e = closeAt(s, i + 2, '[', ']')
        substCommands(s.slice(i + 2, e), out, bad)
        add(s.slice(i, e + 1), true)
        i = e
        continue
      }
      if (n === '{') {
        const e = closeAt(s, i + 2, '{', '}')
        // `${X:-$(cp a $D)}` runs the command inside
        substCommands(s.slice(i + 2, e), out, bad)
        add(s.slice(i, e + 1), true)
        i = e
        continue
      }
      if (n !== undefined && /[A-Za-z_0-9@*#?$!-]/.test(n)) {
        let j = i + 2
        if (/[A-Za-z_]/.test(n)) while (j < s.length && /\w/.test(s[j]!)) j++
        add(s.slice(i, j), true)
        i = j - 1
        continue
      }
      // `$'...'` and `$"..."` are not followed either
      if (!quote && (n === "'" || n === '"')) {
        add(c, true)
        continue
      }
    }
    add(c)
  }
  endCmd()
  return out
}

/** Redirects that write to (or open for writing) the file named after them. */
const WRITE_REDIRECTS = new Set(['>', '>>', '>|', '>&', '&>', '&>>', '<>'])

/** Words before a command's name that only run it (or are shell words), skipped to find the name. */
const RUNNERS = new Set(['{', '}', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time', 'command', 'builtin', 'exec', 'nohup', 'sudo', 'doas', 'env', 'nice', 'xargs', 'timeout', 'gtimeout', 'setsid', 'stdbuf', 'coproc', 'busybox', 'ionice', 'caffeinate', 'unbuffer', 'noglob', 'nocorrect'])

/** For a runner, its options that take the next word as their value (`sudo -u me`, `nice -n 5`), so that word is no command name. */
const RUNNER_VALUED: Record<string, RegExp> = {
  sudo: /^(-[ugCDhpRrtUT]|--(user|group|close-from|chdir|host|prompt|chroot|role|type|other-user|command-timeout))$/,
  doas: /^-[uC]$/,
  env: /^(-[uCS]|--(unset|chdir|split-string))$/,
  nice: /^(-n|--adjustment)$/,
  timeout: /^(-[sk]|--(signal|kill-after))$/,
  gtimeout: /^(-[sk]|--(signal|kill-after))$/,
  ionice: /^-[cnp]$/,
  caffeinate: /^-[tw]$/,
  xargs: /^(-[ILnPdEsa]|--(replace|max-lines|max-args|max-procs|delimiter|eof|max-chars|arg-file|process-slot-var))$/,
  exec: /^-a$/,
  time: /^(-[fo]|--(format|output))$/,
  stdbuf: /^-[ioe]$/,
}

/** For a runner, its options that set the folder the command runs in (`env -C $X`, `sudo -D $X`): checked like cd. */
const RUNNER_CHDIR: Record<string, { short: RegExp; long: RegExp; joined: RegExp }> = {
  env: { short: /^-[A-Za-z]*C$/, long: /^--chdir$/, joined: /^(-[A-Za-z]*C.|--chdir=)/ },
  sudo: { short: /^-[A-Za-z]*D$/, long: /^--chdir$/, joined: /^(-[A-Za-z]*D.|--chdir=)/ },
}

/** Shells, whose `-c` word is a command line they run. */
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'fish'])

/** Commands that run a command line given with `-c` (`su -c '...'`, `flock f -c '...'`), but don't read one from stdin. */
const C_RUNNERS = new Set(['su', 'runuser', 'script', 'flock'])

/** Commands whose words are a command line they run (like eval). */
const EVALS = new Set(['eval', 'trap', 'watch', 'parallel'])
/** Whether shell word `raw` (as written) holds a `$` or a backtick. */
const hasDollar = (raw: string) => /[$`]/.test(raw)

/** Shell word `raw` with its quotes and backslashes taken away (what the command is given), for a word with no `$` or backtick. */
function unquote(raw: string): string {
  let out = ''
  let quote = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!
    if (quote === "'") {
      if (c === "'") quote = ''
      else out += c
    } else if (c === '\\') out += raw[++i] ?? ''
    else if (c === quote) quote = ''
    else if (!quote && (c === "'" || c === '"')) quote = c
    else out += c
  }
  return out
}

/** How deep unresolvedTarget follows a command line given to a shell (`sh -c`, eval, `env -S`) inside another. */
const NESTED_MAX = 8

/** Commands whose last plain word (and `-t` value) is where they write. */
const COPIES = new Set(['cp', 'ln', 'install', 'rsync', 'scp'])

/** Commands that change every file they are given. */
const CHANGES = new Set(['mv', 'rm', 'rmdir', 'unlink', 'shred', 'touch', 'mkdir', 'truncate', 'tee', 'chmod', 'chown', 'chgrp', 'cd', 'chdir', 'pushd'])

/**
 * The first write target (or cd target) in shell `command` that holds something the shell works out only when it
 * runs (`$X`, `${X}`, `$(...)`, backticks), as written; undefined when there is none (T-963). Write targets are files
 * after `>`, `>>`, `&>`, `<>`..., the target of cp, ln, install, rsync and scp (last plain word, or `-t`), every file of
 * mv, rm, touch, mkdir, tee, chmod... and cd (zsh's chdir) or pushd, the files of `sed -i` and `perl -i`, and dd's `of=`. Commands
 * inside `$(...)` and backticks are checked too. Variables anywhere else (`echo $X`, `ls $DIR`, `cat $F > out`) are
 * not. A best effort, not a shell parser.
 */
export function unresolvedTarget(command: string, depth = 0): string | undefined {
  if (depth > NESTED_MAX) return command
  const bad: string[] = []
  const cmds = expandCommands(command, [], bad)
  // an unquoted here-document's line with `$(...)` or a backtick: the shell runs it, and it may write anywhere
  if (bad.length) return bad[0]
  // a command line given to a shell: refused when it holds `$` or a backtick (expanded only when it runs), else checked
  const nested = (w: XWord) => (hasDollar(w.raw) ? w.raw : unresolvedTarget(unquote(w.raw), depth + 1))
  for (const cmd of cmds) {
    const words: XWord[] = []
    for (let k = 0; k < cmd.length; k++) {
      const t = cmd[k]!
      if ('redir' in t) {
        const target = cmd[k + 1]
        if (target && !('redir' in target)) {
          k++
          if (WRITE_REDIRECTS.has(t.redir) && target.expands) return target.raw
        }
        continue
      }
      words.push(t)
    }
    // skip the words that only run the command (`sudo -u me`, `env X=1`, `timeout 10`, `nice -n 5`) to find its name
    let i = 0
    let runner: string | undefined
    let duration = false
    while (i < words.length) {
      const w = words[i]!
      if (RUNNERS.has(w.raw)) {
        runner = w.raw
        duration = runner === 'timeout' || runner === 'gtimeout'
        i++
        // `coproc NAME { ...; }`: NAME only names it
        if (runner === 'coproc' && words[i + 1]?.raw === '{' && /^[A-Za-z_]\w*$/.test(words[i]?.raw ?? '')) i++
      } else if (/^[A-Za-z_]\w*=/.test(w.raw)) i++
      else if (runner && w.raw.startsWith('-') && w.raw !== '-') {
        const chdir = RUNNER_CHDIR[runner]
        // an option cluster ending in the folder letter (`env -iC $X`) takes the next word as the folder too
        const value = RUNNER_VALUED[runner]?.test(w.raw) || chdir?.short.test(w.raw) ? words[i + 1] : undefined
        // `env -C $X`, `env --chdir=$X`, `sudo -D $X` run the command in that folder, like cd
        if (chdir && (chdir.short.test(w.raw) || chdir.long.test(w.raw) ? value?.expands : chdir.joined.test(w.raw) && w.expands)) return (chdir.joined.test(w.raw) ? w : value!).raw
        // `time -o $F` writes there; `env -S '...'` is a command line
        if (runner === 'time' && (/^(-o|--output)$/.test(w.raw) ? value?.expands : /^--output=/.test(w.raw) && w.expands)) return (value ?? w).raw
        if (runner === 'env' && (/^(-S|--split-string)$/.test(w.raw) || /^(-S.|--split-string=)/.test(w.raw))) {
          const hit = value ? nested(value) : hasDollar(w.raw) ? w.raw : unresolvedTarget(unquote(w.raw).replace(/^(-S|--split-string=)/, ''), depth + 1)
          if (hit !== undefined) return hit
        }
        i += value ? 2 : 1
      } else if (duration) {
        duration = false
        i++
      } else break
    }
    const head = words[i]
    if (!head) continue
    const args = words.slice(i + 1)
    // a command named by a variable may be anything (rm, eval, sh -c), so it may not be given variables too
    if (head.expands) {
      if (args.some(a => hasDollar(a.raw))) return head.raw
      continue
    }
    const name = head.raw.replace(/['"\\]/g, '').replace(/^.*\//, '')
    if (EVALS.has(name)) {
      // eval's words, trap's handler, watch's command: a command line, refused when it holds `$` or a backtick
      const hit = args.find(a => hasDollar(a.raw))
      if (hit) return hit.raw
      const own = name === 'eval' ? args : args.filter(a => !a.raw.startsWith('-'))
      const inner = unresolvedTarget(own.map(a => unquote(a.raw)).join(' '), depth + 1)
      if (inner !== undefined) return inner
      continue
    }
    if (name === 'source' || name === '.') {
      // what it reads is a command line: a file built at run time (`<(...)`, `$F`), or stdin, can't be checked
      const file = args.find(a => a.raw !== '--')
      if (file && (file.expands || /^['"]?(-|\/dev\/(stdin|fd\/)|\/proc\/)/.test(file.raw))) return file.raw
      continue
    }
    if (C_RUNNERS.has(name)) {
      for (let j = 0; j < args.length; j++) {
        const a = args[j]!
        const joined = /^--command=/.test(a.raw)
        if (!joined && !/^(-c|--command)$/.test(a.raw)) continue
        const script = joined ? undefined : args[j + 1]
        const hit = script ? nested(script) : hasDollar(a.raw) ? a.raw : unresolvedTarget(unquote(a.raw).replace(/^--command=/, ''), depth + 1)
        if (hit !== undefined) return hit
      }
      continue
    }
    if (SHELLS.has(name)) {
      const c = args.findIndex(a => /^-[A-Za-z]*c[A-Za-z]*$/.test(a.raw))
      if (c >= 0) {
        // the command line is the first word after -c that is no option (`bash -c -- '...'`, `bash -c -e '...'`); the
        // words after it are its $0, $1...: all are checked, so an option's value (`-o posix`) can't hide the real line
        for (let j = c + 1; j < args.length; j++) {
          const a = args[j]!
          if (a.raw === '--' || a.raw === '-') continue
          if (/^[-+]/.test(a.raw) && !hasDollar(a.raw)) continue
          const hit = nested(a)
          if (hit !== undefined) return hit
        }
      } else if (args.every(a => a.raw.startsWith('-')) || args.some(a => /^-[A-Za-z]*s[A-Za-z]*$/.test(a.raw))) {
        // it runs what it reads (`echo '...' | sh`, `bash <<EOF`): refused when the line has a `$` or a backtick anywhere
        const hit = /[^\s;&|<>()]*[$`][^\s;&|<>()]*/.exec(command)
        if (hit) return hit[0]
      }
      continue
    }
    if (name === 'find') {
      // the commands of -exec, -execdir, -ok and -okdir, up to their `;` or `+`
      for (let j = 0; j < args.length; j++) {
        if (!/^-(exec|execdir|ok|okdir)$/.test(args[j]!.raw)) continue
        let e = j + 1
        while (e < args.length && !/^(\\;|';'|";"|\+)$/.test(args[e]!.raw)) e++
        const inner = unresolvedTarget(args.slice(j + 1, e).map(a => a.raw).join(' '), depth + 1)
        if (inner !== undefined) return inner
        j = e
      }
      continue
    }
    // plain words (not options), and the values of the options named in `valued`
    const split = (valued: RegExp, args = words.slice(i + 1)) => {
      const plain: XWord[] = []
      const values: XWord[] = []
      let ended = false
      for (let j = 0; j < args.length; j++) {
        const a = args[j]!
        if (ended || !a.raw.startsWith('-') || a.raw === '-') plain.push(a)
        else if (a.raw === '--') ended = true
        else if (valued.test(a.raw)) {
          if (args[j + 1]) values.push(args[++j]!)
        } else values.push(a)
      }
      return { plain, values }
    }
    if (COPIES.has(name)) {
      // the target folder named by an option (`-t $D`, `--target-directory=$D`), or the last plain word
      const { plain, values } = split(/^(-t|--target-directory)$/)
      const last = plain[plain.length - 1]
      const hit = values.find(v => v.expands) ?? (plain.length > 1 && last?.expands ? last : undefined)
      if (hit) return hit.raw
    } else if (CHANGES.has(name)) {
      const { plain, values } = split(/^(-t|--target-directory)$/)
      const hit = [...plain, ...values].find(v => v.expands)
      if (hit) return hit.raw
    } else if (name === 'dd') {
      const hit = args.find(a => /^["']?of=/.test(a.raw) && a.expands)
      if (hit) return hit.raw
    } else if (name === 'sed' || name === 'gsed' || name === 'perl') {
      if (!args.some(a => /^-[A-Za-z]*i/.test(a.raw) || a.raw.startsWith('--in-place'))) continue
      // macOS sed's `-i ''` or `-i .bak`: the word after -i is its backup suffix, not a file
      const own = args.filter((a, j) => !(j > 0 && args[j - 1]!.raw === '-i' && /^(''|""|['"]?\.)/.test(a.raw) && name !== 'perl'))
      const { plain } = split(/^(-e|-f|--expression|--file)$/, own)
      const scripted = args.some(a => /^(-e|-f|--expression|--file)/.test(a.raw) || (name === 'perl' && /^-\w*e$/.test(a.raw)))
      const files = scripted ? plain : plain.slice(1)
      const hit = files.find(v => v.expands)
      if (hit) return hit.raw
    }
  }
  return undefined
}
