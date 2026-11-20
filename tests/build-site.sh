#!/bin/sh
# Checks scripts/build-site.ts and .github/workflows/pages.yml (T-593). Not a `claude plugin test` file:
# that runtime can't run processes. Run: sh tests/build-site.sh
# 1. Building the real repo gives index.html, guide.html, reference.html ..., every internal link points to a
#    file that exists (and to an anchor on that page), no internal link still ends in .md.
# 2. A copy with HTML and a .md link added to the guide: the HTML comes out escaped, the link as guide.html.
# 3. The workflow file is valid YAML with the Pages permissions.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fails=0
bad() { echo "FAIL: $1"; fails=$((fails + 1)); }

if ! bun "$here/scripts/build-site.ts" --root "$here" --out "$tmp/real" >"$tmp/log" 2>&1; then
  bad "build failed: $(cat "$tmp/log")"
fi
bun "$here/tests/build-site-check.mjs" "$tmp/real" "$here/.github/workflows/pages.yml" || bad "checks on the real build failed (see above)"

# a small copy with tricky text in the guide
mkdir -p "$tmp/src/docs/research"
cp -R "$here/site" "$tmp/src/site"
cp "$here/README.md" "$tmp/src/README.md"
cp "$here/docs/reference.md" "$tmp/src/docs/reference.md"
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
printf '# A note\n\nBack to the [guide](../guide.md).\n' > "$tmp/src/docs/research/note.md"
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
fi

if [ "$fails" -eq 0 ]; then echo "build-site: all checks passed"; else echo "build-site: $fails check(s) failed"; exit 1; fi
