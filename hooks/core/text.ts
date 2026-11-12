// Small helpers shared by the other modules in core/. Not re-exported from board.ts.
/** Reads `{ session, <key> }` JSON: the session a string, the number finite; null if it isn't that. */
export function parseStamp<K extends string>(text: string | null, key: K, emptyOk: boolean): ({ session: string } & Record<K, number>) | null {
  try {
    const l = JSON.parse(text ?? '') as Record<string, unknown>
    const n = l[key]
    if (typeof l.session !== 'string' || (!emptyOk && !l.session) || typeof n !== 'number' || !Number.isFinite(n)) return null
    return { session: l.session, [key]: n } as { session: string } & Record<K, number>
  } catch {
    return null
  }
}

// eslint-disable-next-line no-control-regex
export const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n)

export const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** A task id's number ("T-12" → 12; 0 when there is none), for ordering. */
export const num = (id: string) => Number(id.replace(/\D/g, '')) || 0

/**
 * A file's front matter (the lines between the opening and closing `---`) and the body after it.
 * `lines` is null when the file has no front matter; then the body is the whole text.
 */
export function splitFrontMatter(text: string): { lines: string[] | null; body: string } {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text)
  return m ? { lines: m[1]!.split('\n'), body: text.slice(m[0].length) } : { lines: null, body: text }
}

/** A front matter `key: value` line as its lowercased key and trimmed value, or null for other lines. */
export function frontMatterLine(line: string): { key: string; value: string } | null {
  const kv = /^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i.exec(line)
  return kv ? { key: kv[1]!.toLowerCase(), value: kv[2]! } : null
}
