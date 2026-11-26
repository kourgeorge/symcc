#!/bin/sh
# Checks scripts/build-site.ts and .github/workflows/pages.yml (T-593). Not a `claude plugin test` file:
# that runtime can't run processes. Run: sh tests/build-site.sh
# 1. Building the real repo gives index.html, get-started.html, tasks.html, reference.html ..., every internal link points to a
#    file that exists (and to an anchor on that page), no internal link still ends in .md; (T-1143) the top bar is
#    Overview · Get started · How it works · Blog · GitHub, and the doc pages have the documentation list.
# 2. A copy with HTML and a .md link put in docs/tasks.md: the HTML comes out escaped, the link as tasks.html.
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
# (T-1145) the numbers of docs/data/symcc-stats.json are on the home page and on the Built with symcc page (and its .md copy)
done_n="$(bun -e 'const s = JSON.parse(await Bun.file(process.argv[1]).text()); console.log(String(s.tasks.done).replace(/\B(?=(\d{3})+(?!\d))/g, ","))' "$here/docs/data/symcc-stats.json")"
grep -q "<strong>$done_n</strong><span>tasks merged" "$tmp/real/index.html" || bad "home page does not show $done_n tasks merged from the stats JSON"
grep -q "{{stat" "$tmp/real/index.html" && bad "home page still has a {{stat marker"
grep -q "<strong>$done_n</strong>" "$tmp/real/built-with-symcc.html" || bad "built-with-symcc.html does not show $done_n tasks merged"
grep -q "{{stats" "$tmp/real/built-with-symcc.html" "$tmp/real/built-with-symcc.md" && bad "built-with-symcc has a {{stats marker left"
grep -q 'href="built-with-symcc.html">Built with symcc' "$tmp/real/index.html" || bad "home page footer does not link Built with symcc"
# (T-749) the home page: the playing hero demo with its 4 tabs and still frame, the sections, install commands, nav links
bun "$here/tests/home-page-check.mjs" "$tmp/real" "$here" || bad "checks on the home page failed (see above)"

# a small copy with tricky text in docs/tasks.md
mkdir -p "$tmp/src/docs/research"
cp -R "$here/site" "$tmp/src/site"
cp "$here/README.md" "$tmp/src/README.md"
cp "$here/docs/"*.md "$tmp/src/docs/"
mkdir -p "$tmp/src/docs/data" && cp "$here/docs/data/"*.json "$tmp/src/docs/data/"
cp "$here/docs/"*.svg "$here/docs/"*.jpg "$tmp/src/docs/" 2>/dev/null
cat > "$tmp/src/docs/tasks.md" <<'EOF'
# Tasks

Text with <script>alert(1)</script> and a & b, and `<b>code</b>`.

See [the reference](reference.md#modes) and [this page](tasks.md) and [the readme](../README.md#install).

| a | b |
|---|---|
| <i>x</i> | `y \| z` |

- one <img src=x onerror=alert(2)>
- two
EOF
printf '# A note\n\nBack to the [tasks](../tasks.md) for the whole story.\n' > "$tmp/src/docs/research/note.md"
printf '# Research notes\n\nNewest first.\n\n- [A note](note.md): the whole story.\n' > "$tmp/src/docs/research/index.md"
# (T-1144) a new note not yet in the hand-written index: the build adds it at the top, with its first paragraph
printf '# A newer note\n\nWhy the sky looks blue at noon.\n' > "$tmp/src/docs/research/newer.md"
# (T-1148) a note with only a heading and a table gets its title as summary; a note linked with #anchor is not added twice
printf '# Table note\n\n| a | b |\n|---|---|\n| 1 | 2 |\n' > "$tmp/src/docs/research/tabled.md"
printf '# Anchored note\n\nSome words that make a long enough paragraph.\n' > "$tmp/src/docs/research/anchored.md"
printf -- '- [Anchored note](anchored.md#top): already listed.\n' >> "$tmp/src/docs/research/index.md"
if ! bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/small" >"$tmp/log" 2>&1; then
  bad "small build failed: $(cat "$tmp/log")"
else
  g="$tmp/small/tasks.html"
  grep -q '&lt;script&gt;alert(1)&lt;/script&gt;' "$g" || bad "HTML in text not escaped"
  grep -q '<script>alert' "$g" && bad "raw <script> in output"
  grep -q '<img src=x' "$g" && bad "raw <img> from the text in output"
  grep -q '&lt;i&gt;x&lt;/i&gt;' "$g" || bad "HTML in a table cell not escaped"
  grep -q '<code>&lt;b&gt;code&lt;/b&gt;</code>' "$g" || bad "inline code not escaped"
  grep -q 'a &amp; b' "$g" || bad "& not escaped"
  grep -q 'href="reference.html#modes"' "$g" || bad "reference.md#modes not rewritten"
  grep -q 'href="https://github.com/kourgeorge/symcc/blob/main/README.md#install"' "$g" || bad "../README.md#install not rewritten to GitHub"
  grep -q '<code>y | z</code>' "$g" || bad "escaped pipe in a table cell"
  grep -q 'href="../tasks.html"' "$tmp/small/research/note.html" || bad "research note link not rewritten"
  grep -q 'href="note.html"' "$tmp/small/research/index.html" || bad "research index does not list the note"
  grep -q '<li><a href="newer.html">A newer note</a>: Why the sky looks blue at noon.</li>' "$tmp/small/research/index.html" || bad "research index: a note missing from index.md was not added with its summary"
  grep -q '<li><a href="tabled.html">Table note</a>: Table note</li>' "$tmp/small/research/index.html" || bad "research index: a note with no paragraph has no title summary"
  [ "$(grep -o 'href="anchored.html' "$tmp/small/research/index.html" | wc -l)" -eq 1 ] || bad "research index: a note linked with #anchor was added again"
  tr '\n' ' ' < "$tmp/small/research/index.html" | grep -q 'href="newer.html".*href="note.html"' || bad "research index: the added note is not at the top"
  grep -q 'href="research/index.html">Research notes</a>: answers' "$tmp/small/docs.html" || bad "docs index: research/index.md link not rewritten to research/index.html"
  grep -q 'href="../style.css"' "$tmp/small/research/note.html" || bad "research page style.css path"
  grep -q 'href="../get-started.html">Get started' "$tmp/small/research/note.html" || bad "research page nav not relinked"
  grep -q '<aside class="docs-side">' "$tmp/small/research/note.html" || bad "research note has no documentation list"
  # (T-601) the .md copies, llms.txt and the footer link
  m="$tmp/small/tasks.md"
  grep -q '\[the reference\](reference.md#modes)' "$m" || bad "tasks.md copy: reference.md#modes link wrong"
  grep -q '\[the readme\](https://github.com/kourgeorge/symcc/blob/main/README.md#install)' "$m" || bad "tasks.md copy: ../README.md#install not rewritten to GitHub"
  grep -q '<script>alert(1)</script>' "$m" || bad "tasks.md copy is not the source Markdown"
  grep -q '\[tasks\](../tasks.md)' "$tmp/small/research/note.md" || bad "research note .md copy: link not ../tasks.md"
  grep -q '^- \[A note\](https://kourgeorge.github.io/symcc/research/note.md): Back to the tasks for the whole story.$' "$tmp/small/llms.txt" || bad "llms.txt: no line for the research note: $(cat "$tmp/small/llms.txt")"
  grep -q 'href="../llms.txt"' "$tmp/small/research/note.html" || bad "footer of a research page has no llms.txt link"
  grep -q 'href="llms.txt"' "$tmp/small/index.html" || bad "footer of the landing page has no llms.txt link"
fi

# (T-1087) the blog: with posts: list (newest first), one page per post with date and prev/next links, a valid
# RSS feed, the Blog link on every page; (T-1143) no posts: the Blog link stays and the blog list says so
grep -q 'No posts yet.' "$tmp/small/blog/index.html" || bad "no posts: the blog list does not say 'No posts yet.'"
grep -q 'href="blog/index.html">Blog</a>' "$tmp/small/index.html" "$tmp/small/tasks.html" || bad "no posts: no Blog link in the top bar"
mkdir -p "$tmp/src/docs/blog"
printf '# Old one\n\nThe first summary & more.\n\nBody.\n' > "$tmp/src/docs/blog/2026-01-05-old-one.md"
printf '# Middle\n\nBody only <b>x</b>.\n' > "$tmp/src/docs/blog/2026-03-09-middle.md"
printf '# New one\n\nThe newest summary.\n' > "$tmp/src/docs/blog/2026-11-26-new-one.md"
if ! bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/blog" >"$tmp/log" 2>&1; then
  bad "blog build failed: $(cat "$tmp/log")"
else
  b="$tmp/blog/blog"
  for f in index.html rss.xml old-one.html middle.html new-one.html old-one.md; do [ -f "$b/$f" ] || bad "blog: missing $f"; done
  for p in index.html tasks.html research/index.html blog/new-one.html; do
    grep -q 'href="[./]*blog/index.html"[^>]*>Blog</a>' "$tmp/blog/$p" || bad "blog: no Blog link in $p"
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
[ -f "$tmp/src/README.md" ] && [ -f "$tmp/src/site/index.html" ] && [ -f "$tmp/src/docs/tasks.md" ] || bad "a refused --out still deleted files"
mkdir -p "$tmp/other" && echo keep > "$tmp/other/keep.txt"
bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/other" >"$tmp/log" 2>&1 && bad "a non-empty folder without the marker was not refused"
[ -f "$tmp/other/keep.txt" ] || bad "a refused non-empty folder lost its file"
[ -f "$tmp/small/.symcc-site" ] || bad "the build does not write its .symcc-site marker"
bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/small" >"$tmp/log" 2>&1 || bad "rebuilding into an earlier build failed: $(cat "$tmp/log")"
bun "$here/scripts/build-site.ts" --root "$tmp/src" >"$tmp/log" 2>&1 || bad "default build (--out _site) failed: $(cat "$tmp/log")"
[ -f "$tmp/src/_site/tasks.html" ] || bad "default build did not write _site/tasks.html"

# (T-1093) bad blog posts fail the build and name the file
mkdir -p "$tmp/src/docs/blog"
printf '# Ok\n\nHello.\n' > "$tmp/src/docs/blog/2026-01-02-ok.md"
bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/blogok" >"$tmp/log" 2>&1 || bad "a good blog post failed the build: $(cat "$tmp/log")"
for bp in 2026-13-40-x.md 2026-02-30-x.md 2026-03-04-index.md 2026-03-05-ok.md; do
  printf '# Bad\n\nText.\n' > "$tmp/src/docs/blog/$bp"
  if bun "$here/scripts/build-site.ts" --root "$tmp/src" --out "$tmp/blogbad" >"$tmp/log" 2>&1; then
    bad "blog post $bp was not refused"
  else
    grep -q "$bp" "$tmp/log" || bad "blog post $bp: the message does not name it: $(cat "$tmp/log")"
    [ "$bp" != 2026-03-05-ok.md ] || grep -q '2026-01-02-ok.md' "$tmp/log" || bad "duplicate slug message does not name both files"
  fi
  rm -f "$tmp/src/docs/blog/$bp"
done

# 5. (T-934) the dropped commands are named nowhere: /symcc-scouts (/symcc-scout with no name does it) and
#    /symcc-enable here (the same as /symcc-enable). Tests may name them, to check they are gone.
for old in 'symcc-scouts' 'symcc-enable here' 'name}-scouts' 'enable here'; do
  left="$(grep -rnF -e "$old" "$here/hooks" "$here/docs" "$here/site" "$here/README.md" | grep -v '/hooks/opencode/tests/')"
  [ -z "$left" ] || bad "\"$old\" is still named: $left"
done

if [ "$fails" -eq 0 ]; then echo "build-site: all checks passed"; else echo "build-site: $fails check(s) failed"; exit 1; fi
