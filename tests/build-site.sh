#!/bin/sh
# Checks scripts/build-site.ts and .github/workflows/pages.yml (T-593). Not a `claude plugin test` file:
# that runtime can't run processes. Run: sh tests/build-site.sh
# 1. Building the real repo gives index.html, guide.html, reference.html ..., every internal link points to a
#    file that exists (and to an anchor on that page), no internal link still ends in .md.
# 2. A copy with HTML and a .md link added to the guide: the HTML comes out escaped, the link as guide.html.
# 3. The workflow file is valid YAML with the Pages permissions.
# (T-601) llms.txt lists every page with a working .md link, and each .md copy links only to files on the
#    site or in the repo (on GitHub); the small copy checks how links in the .md copies are rewritten.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fails=0
bad() { echo "FAIL: $1"; fails=$((fails + 1)); }

if ! bun "$here/scripts/build-site.ts" --root "$here" --out "$tmp/real" >"$tmp/log" 2>&1; then
  bad "build failed: $(cat "$tmp/log")"
fi
bun "$here/tests/build-site-check.mjs" "$tmp/real" "$here/.github/workflows/pages.yml" "$here" || bad "checks on the real build failed (see above)"
# (T-749) the home page: the playing hero demo with its 4 tabs and still frame, the sections, install commands, nav links
bun "$here/tests/home-page-check.mjs" "$tmp/real" "$here" || bad "checks on the home page failed (see above)"

# a small copy with tricky text in the guide
mkdir -p "$tmp/src/docs/research"
cp -R "$here/site" "$tmp/src/site"
cp "$here/README.md" "$tmp/src/README.md"
cp "$here/docs/reference.md" "$here/docs/engine-and-clients.md" "$tmp/src/docs/"
cp "$here/docs/"*.svg "$here/docs/"*.jpg "$tmp/src/docs/" 2>/dev/null
cat > "$tmp/src/docs/guide.md" <<'EOF'
# Guide

Text with <script>alert(1)</script> and a & b, and `<b>code</b>`.

See [the reference](reference.md#modes) and [this guide](guide.md) and [the readme](../README.md#install).

| a | b |
|---|---|
| <i>x</i> | `y \| z` |

- one <img src=x onerror=alert(2)>
- two
EOF
printf '# A note\n\nBack to the [guide](../guide.md) for the whole story.\n' > "$tmp/src/docs/research/note.md"
if ! bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/small" >"$tmp/log" 2>&1; then
  bad "small build failed: $(cat "$tmp/log")"
else
  g="$tmp/small/guide.html"
  grep -q '&lt;script&gt;alert(1)&lt;/script&gt;' "$g" || bad "HTML in text not escaped"
  grep -q '<script>alert' "$g" && bad "raw <script> in output"
  grep -q '<img src=x' "$g" && bad "raw <img> from the text in output"
  grep -q '&lt;i&gt;x&lt;/i&gt;' "$g" || bad "HTML in a table cell not escaped"
  grep -q '<code>&lt;b&gt;code&lt;/b&gt;</code>' "$g" || bad "inline code not escaped"
  grep -q 'a &amp; b' "$g" || bad "& not escaped"
  grep -q 'href="reference.html#modes"' "$g" || bad "reference.md#modes not rewritten"
  grep -q 'href="overview.html#install"' "$g" || bad "../README.md#install not rewritten to overview.html"
  grep -q '<code>y | z</code>' "$g" || bad "escaped pipe in a table cell"
  grep -q 'href="../guide.html"' "$tmp/small/research/note.html" || bad "research note link not rewritten"
  grep -q 'href="note.html"' "$tmp/small/research/index.html" || bad "research index does not list the note"
  grep -q 'href="../style.css"' "$tmp/small/research/note.html" || bad "research page style.css path"
  grep -q 'href="../guide.html">Guide' "$tmp/small/research/note.html" || bad "research page nav not relinked"
  # (T-601) the .md copies, llms.txt and the footer link
  m="$tmp/small/guide.md"
  grep -q '\[the reference\](reference.md#modes)' "$m" || bad "guide.md copy: reference.md#modes link wrong"
  grep -q '\[the readme\](overview.md#install)' "$m" || bad "guide.md copy: ../README.md#install not rewritten to overview.md"
  grep -q '<script>alert(1)</script>' "$m" || bad "guide.md copy is not the source Markdown"
  grep -q '\[guide\](../guide.md)' "$tmp/small/research/note.md" || bad "research note .md copy: link not ../guide.md"
  grep -q '^- \[A note\](https://kourgeorge.github.io/symcc/research/note.md): Back to the guide for the whole story.$' "$tmp/small/llms.txt" || bad "llms.txt: no line for the research note: $(cat "$tmp/small/llms.txt")"
  grep -q 'href="../llms.txt"' "$tmp/small/research/note.html" || bad "footer of a research page has no llms.txt link"
  grep -q 'href="llms.txt"' "$tmp/small/index.html" || bad "footer of the landing page has no llms.txt link"
fi

# (T-1087) the blog: no posts = no Blog link and no blog pages; with posts: list (newest first), one page per
# post with date and prev/next links, a valid RSS feed, the Blog link on every page
[ -e "$tmp/small/blog" ] && bad "blog pages built with no docs/blog posts"
grep -q 'blog/index.html' "$tmp/small/index.html" "$tmp/small/guide.html" && bad "Blog link with no posts"
mkdir -p "$tmp/src/docs/blog"
printf '# Old one\n\nThe first summary & more.\n\nBody.\n' > "$tmp/src/docs/blog/2026-01-05-old-one.md"
printf '# Middle\n\nBody only <b>x</b>.\n' > "$tmp/src/docs/blog/2026-03-09-middle.md"
printf '# New one\n\nThe newest summary.\n' > "$tmp/src/docs/blog/2026-11-26-new-one.md"
if ! bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/blog" >"$tmp/log" 2>&1; then
  bad "blog build failed: $(cat "$tmp/log")"
else
  b="$tmp/blog/blog"
  for f in index.html rss.xml old-one.html middle.html new-one.html old-one.md; do [ -f "$b/$f" ] || bad "blog: missing $f"; done
  for p in index.html guide.html research/index.html blog/new-one.html; do
    grep -q 'href="[./]*blog/index.html">Blog</a>' "$tmp/blog/$p" || bad "blog: no Blog link in $p"
  done
  grep -q 'href="blog/index.html">Blog</a>' "$tmp/blog/index.html" || bad "blog: no Blog link on the home page"
  order="$(grep -o '"\(new-one\|middle\|old-one\)\.html"' "$b/index.html" | tr -d '\n')"
  [ "$order" = '"new-one.html""middle.html""old-one.html"' ] || bad "blog index not newest first: $order"
  grep -q '26 Nov 2026' "$b/index.html" || bad "blog index: no date"
  grep -q 'The first summary &amp; more.' "$b/index.html" || bad "blog index: no summary"
  grep -q 'rel="alternate" type="application/rss+xml"' "$b/index.html" "$b/new-one.html" || bad "blog: no RSS link in head"
  grep -q '5 Jan 2026' "$b/old-one.html" || bad "post page: no date"
  grep -q 'Next: Middle' "$b/old-one.html" || bad "oldest post: no next link"
  grep -q 'Previous' "$b/old-one.html" && bad "oldest post has a previous link"
  grep -q 'Previous: Old one' "$b/middle.html" && grep -q 'Next: New one' "$b/middle.html" || bad "middle post: prev/next links wrong"
  grep -q 'Previous: Middle' "$b/new-one.html" || bad "newest post: no previous link"
  grep -q 'Next' "$b/new-one.html" && bad "newest post has a next link"
  bun -e '
    const x = require("fs").readFileSync(process.argv[1], "utf8")
    const items = x.match(/<item>[\s\S]*?<\/item>/g) ?? []
    const ok = x.startsWith("<?xml") && x.includes("<rss version=\"2.0\">") && x.trim().endsWith("</rss>") && items.length === 3 &&
      items.every(i => /<title>.+<\/title>/.test(i) && /<link>https:\/\/kourgeorge\.github\.io\/symcc\/blog\/[a-z-]+\.html<\/link>/.test(i) && /<pubDate>.+GMT<\/pubDate>/.test(i) && i.includes("<description>")) &&
      x.indexOf("New one") < x.indexOf("Middle") && x.includes("summary &amp; more")
    process.exit(ok ? 0 : 1)' "$b/rss.xml" || bad "blog: rss.xml is not a valid feed with all posts"
  grep -q 'blog/new-one.md' "$tmp/blog/llms.txt" || bad "llms.txt does not list the blog posts"
fi

# 4. (T-594) a dangerous --out is refused and nothing is deleted; an earlier build is rebuilt fine
for o in . site docs scripts ..; do
  if (cd "$tmp/src" && bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$o") >"$tmp/log" 2>&1; then
    bad "--out $o was not refused"
  else
    grep -q 'Nothing was deleted' "$tmp/log" || bad "--out $o: no clear refusal message: $(cat "$tmp/log")"
  fi
done
[ -f "$tmp/src/README.md" ] && [ -f "$tmp/src/site/index.html" ] && [ -f "$tmp/src/docs/guide.md" ] || bad "a refused --out still deleted files"
mkdir -p "$tmp/other" && echo keep > "$tmp/other/keep.txt"
bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/other" >"$tmp/log" 2>&1 && bad "a non-empty folder without the marker was not refused"
[ -f "$tmp/other/keep.txt" ] || bad "a refused non-empty folder lost its file"
[ -f "$tmp/small/.symcc-site" ] || bad "the build does not write its .symcc-site marker"
bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/small" >"$tmp/log" 2>&1 || bad "rebuilding into an earlier build failed: $(cat "$tmp/log")"
bun "$here/scripts/build-site.ts" --root "$tmp/src" >"$tmp/log" 2>&1 || bad "default build (--out _site) failed: $(cat "$tmp/log")"
[ -f "$tmp/src/_site/guide.html" ] || bad "default build did not write _site/guide.html"

# 5. (T-934) the dropped commands are named nowhere: /symcc-scouts (/symcc-scout with no name does it) and
#    /symcc-enable here (the same as /symcc-enable). Tests may name them, to check they are gone.
for old in 'symcc-scouts' 'symcc-enable here' 'name}-scouts' 'enable here'; do
  left="$(grep -rnF -e "$old" "$here/hooks" "$here/docs" "$here/site" "$here/README.md" | grep -v '/hooks/opencode/tests/')"
  [ -z "$left" ] || bad "\"$old\" is still named: $left"
done

if [ "$fails" -eq 0 ]; then echo "build-site: all checks passed"; else echo "build-site: $fails check(s) failed"; exit 1; fi
