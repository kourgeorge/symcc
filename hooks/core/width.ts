// Screen-width text helpers: how many terminal columns a text takes, padding and cutting it to a width, and
// wrapping a line at spaces. Pure; used by the stats report, the band, the live lines and the task pages.

/** The text split into whole characters (graphemes where the runtime knows them, else code points), never half of one. */
const chars = (s: string): string[] => {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter
  return Seg ? Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), x => x.segment) : Array.from(s)
}
/** Wide characters (CJK, full-width forms, emoji) take two screen columns. */
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]|\p{Extended_Pictographic}️|\p{Emoji_Presentation}/u
/** Marks that take no column of their own (combining marks, joiners, variation selectors). */
const ZERO = /^[\p{M}​-‏︀-️]+$/u
const charWidth = (c: string) => (ZERO.test(c) ? 0 : WIDE.test(c) ? 2 : 1)
/** How many screen columns the text takes. */
export const textWidth = (s: string) => chars(s).reduce((w, c) => w + charWidth(c), 0)
/** The text padded with spaces on the right to `n` screen columns. */
export const padWidth = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - textWidth(s)))
/** The text cut to at most `n` screen columns, ending in "…" when cut; whole characters only. */
export function cutTitle(s: string, n = 35): string {
  if (textWidth(s) <= n) return s
  let out = ''
  let w = 0
  for (const c of chars(s)) {
    const cw = charWidth(c)
    if (w + cw > n - 1) break
    out += c
    w += cw
  }
  return `${out}…`
}

/** The widest a line of the stats report may be (wrapLine's default width). */
export const STATS_WIDTH = 80

/** Line `l` cut into lines of at most `width` columns at spaces; the next lines start under its text (after a label), else 4 further in. */
export function wrapLine(l: string, width = STATS_WIDTH): string[] {
  if (l.length <= width || textWidth(l) <= width) return [l]
  const gap = /^ *\S.*?\S {2,}(?=\S)/.exec(l)?.[0].length ?? 0
  const pad = ' '.repeat(gap && gap <= 30 ? gap : Math.min(20, (/^ */.exec(l)?.[0].length ?? 0) + 4))
  const out: string[] = []
  let rest = l
  while (rest.length > width) {
    const cut = rest.lastIndexOf(' ', width)
    if (cut <= pad.length) break
    out.push(rest.slice(0, cut).trimEnd())
    rest = pad + rest.slice(cut + 1).trimStart()
  }
  return [...out, rest]
}
