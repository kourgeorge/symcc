---
name: symcc board in Cursor
description: The symcc panel inside the editor; the host theme's ground, a navy-to-plum rail, and coral only for what needs the owner.
colors:
  coral: "#d97757"
  coral-soft: "#f2a58a"
  coral-text-dark: "#f2a58a"
  coral-text-light: "#a8482a"
  coral-ink: "#1b1f2a"
  coral-wash: "color-mix(in srgb, #d97757 8%, #1f1f1f)"
  coral-edge: "color-mix(in srgb, #d97757 45%, #2b2b2b)"
  rail-navy: "#1b1f2a"
  rail-plum: "#2a2233"
  rail-fg: "#c8ccda"
  host-ground: "#1f1f1f"
  host-ink: "#cccccc"
  host-muted: "#9d9d9d"
  host-line: "#2b2b2b"
  raised: "color-mix(in srgb, #cccccc 4%, #1f1f1f)"
  raised-2: "color-mix(in srgb, #cccccc 7%, #1f1f1f)"
  host-input: "#313131"
  host-input-line: "#3c3c3c"
  host-focus: "#0078d4"
  host-link: "#4daafc"
  good: "#57ab5a"
  bad: "#e5534b"
  wait: "#d7a54a"
  run: "#539bf5"
typography:
  headline:
    fontFamily: "var(--vscode-font-family), system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
  title:
    fontFamily: "var(--vscode-font-family), system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
  card-title:
    fontFamily: "var(--vscode-font-family), system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "var(--vscode-font-family), system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "var(--vscode-font-family), system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  label:
    fontFamily: "var(--vscode-font-family), system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
  caption:
    fontFamily: "var(--vscode-font-family), system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
  micro:
    fontFamily: "var(--vscode-font-family), system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "10.5px"
    fontWeight: 400
  mono:
    fontFamily: "var(--vscode-editor-font-family), ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  full: "50%"
spacing:
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "20": "20px"
  "24": "24px"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.coral-ink}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
    height: "28px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, #d97757 88%, #fff)"
    textColor: "{colors.coral-ink}"
  button-secondary:
    backgroundColor: "{colors.raised-2}"
    textColor: "{colors.host-ink}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
    height: "28px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.host-muted}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.host-ink}"
  decision-card:
    backgroundColor: "{colors.coral-wash}"
    textColor: "{colors.host-ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  lane:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.host-ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px 8px"
  scout:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.host-ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  input-field:
    backgroundColor: "{colors.host-input}"
    textColor: "{colors.host-ink}"
    rounded: "{rounded.sm}"
    padding: "7px 9px"
  composer:
    backgroundColor: "{colors.host-input}"
    textColor: "{colors.host-ink}"
    rounded: "{rounded.lg}"
    padding: "8px"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.rail-fg}"
    width: "46px"
    padding: "7px 0 6px"
  rail-item-active:
    backgroundColor: "#ffffff17"
    textColor: "#ffffff"
  rail-count:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.coral-ink}"
    rounded: "{rounded.md}"
    height: "16px"
  mode-active:
    backgroundColor: "{colors.raised-2}"
    textColor: "{colors.host-ink}"
    padding: "4px 11px"
  news-row:
    backgroundColor: "color-mix(in srgb, #cccccc 3%, transparent)"
    textColor: "{colors.host-muted}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  tag:
    textColor: "{colors.host-muted}"
    rounded: "{rounded.xs}"
    padding: "0 6px"
---

# Design System: symcc board in Cursor

## Overview

**Creative North Star: "The Lead Sheet"**

The panel is a lead sheet pinned beside the editor: the melody (what needs the owner) is written large and in coral at the top, the accompaniment (the lead's conversation and the board's news) runs underneath as one quiet timeline, and each running task is read like a bar of music on a single staff line. Everything that is not the melody belongs to the host editor. Ground, text, borders, inputs, focus rings, links, scrollbars and selection are the editor theme's own `--vscode-*` values, so the panel looks native in dark, light and high-contrast themes and only the symcc layer is fixed.

That layer is small and deliberate: a deep navy-to-plum rail carrying the treble-clef mark on its coral tile, coral reserved for what needs the owner and the one primary action on each card, and a green / amber / red / blue state vocabulary borrowed from the host's chart colors. Density is editor density (13px body, 28px controls, 8 to 20px gaps), calm and scannable rather than spacious. Depth is tonal, built by mixing a few percent of the foreground into the ground.

**Key Characteristics:**
- Host-themed ground and controls; symcc owns only the rail, the mark, coral and the staff.
- Coral is scarce: decisions waiting, the primary action per card, the current note, the rail count.
- One timeline: messages and board news share a single stream, newest at the bottom, composer pinned below.
- The staff line is the signature: stations as notes, passed notes green, the current note coral and breathing.
- Codicons for every icon, in the host's icon font.

## Colors

A borrowed neutral world (the editor theme) with one owned warm accent and a fixed dark rail.

### Primary
- **Clef Coral** (`coral`): the fill of the mark tile, the primary button, the rail count badge, the current note on the staff and its breathing ring, and the nudge outline on an unanswered field. It is a fill color; it never sets body text.
- **Coral Text** (`coral-text-dark` in dark themes, `coral-text-light` in light themes): coral as type and small glyphs. The "Needs you" heading and its count, the first Board group heading, card meta icons, "you" states and the current station's word on the staff. Switched by `body.vscode-light` so it holds contrast on both grounds.
- **Coral Soft** (`coral-soft`): the active rail item's icon, read against the dark rail.
- **Clef Ink** (`coral-ink`): text and strokes laid on coral (primary button label, rail count, the clef stroke). The same navy as the rail top, so coral always sits on symcc's own dark.
- **Coral Wash / Coral Edge** (`coral-wash`, `coral-edge`): the decision card's tinted ground (8% coral, 9% in light) and its border (45% coral into the host line). The focused task row on the Board also takes the wash.

### Secondary
- **Rail Navy to Plum** (`rail-navy` to `rail-plum`): the rail's vertical gradient (180deg). Fixed in every theme; it is symcc's frame, not the host's.
- **Rail Mist** (`rail-fg`): rail labels at 78% strength; hover and active lift them to white.

### Tertiary (state)
- **Merged Green** (`good`, from `--vscode-charts-green`): passed notes and the passed segment of the staff, merged news, added line counts, success notices, "Nothing needs you".
- **Waiting Amber** (`wait`, `--vscode-charts-yellow`): the current note when the station is "you", header notes, task notes, warnings.
- **Failed Red** (`bad`, `--vscode-charts-red`): failed news, errors, removed line counts.
- **Running Blue** (`run`, `--vscode-charts-blue`): the running state word on the Board.

### Neutral
All neutrals are the host theme's values; the hex shown is the fallback when a variable is missing.
- **Editor Ground** (`host-ground`, `--vscode-editor-background`): the panel background.
- **Editor Ink** (`host-ink`, `--vscode-editor-foreground`): body text and titles.
- **Description Gray** (`host-muted`, `--vscode-descriptionForeground`): meta lines, counts, timestamps, hints.
- **Panel Line** (`host-line`, `--vscode-panel-border`): every divider and container border. High contrast swaps in `--vscode-contrastBorder`.
- **Raised / Raised-2** (`raised`, `raised-2`): 4% and 7% foreground into the ground (3% and 6% in light). Hover fills, lanes, scouts, the pressed mode, secondary buttons.
- **Input Ground / Input Line** (`host-input`, `host-input-line`): fields, the composer, the mode switch frame, button borders.
- **Focus Blue** (`host-focus`, `--vscode-focusBorder`): every focus ring.
- **Link Blue** (`host-link`, `--vscode-textLink-foreground`): links in the lead's Markdown.

### Named Rules
**The Coral Means You Rule.** Coral marks only what needs the owner and the single primary action on a card. Running work, progress and success are never coral.

**The Borrowed Ground Rule.** Ground, text, borders, inputs, focus, links, selection and scrollbars come from `--vscode-*` variables with a fallback. symcc hard-codes only coral, the rail and the mark.

**The Two Corals Rule.** Coral as a fill uses `coral`; coral as text uses the theme-switched coral text value. Never set text in the fill coral.

## Typography

**Body Font:** the editor's UI font (`--vscode-font-family`, with system-ui, -apple-system, Segoe UI)
**Label/Mono Font:** the editor's code font (`--vscode-editor-font-family`, with ui-monospace, SF Mono, Menlo)

**Character:** no display face. The panel speaks in the host's UI voice so it reads as part of the editor; hierarchy comes from weight 600 and a short step of sizes, never from a second family.

### Hierarchy
- **Headline** (600, 18px): the empty and setup screens' heading only.
- **Title** (600, 15px): the project name in the header and the Board and Scouts page headings.
- **Card Title** (600, 13.5px, 1.4): decision card and scout headings, clamped to three lines with `text-wrap: pretty`.
- **Body** (400, 13px, 1.5): the stream, lane titles, everything by default. Message text holds to 72ch, empty states to 60ch.
- **Body Small** (400, 12.5px): card text, buttons, header counts, news rows, side lists.
- **Label** (600, 12px): section headings in the side column, "Needs you", Board group headings. Sentence case, no tracking.
- **Caption** (400, 11px): timestamps, day dividers, the composer hint, tags.
- **Micro** (400, 10.5px): rail labels and the words under the staff.
- **Mono** (400, 12px; 11.5px in file lists): task ids, file paths, inline and fenced code. Code and data only.

### Named Rules
**The Host Voice Rule.** Use the editor's UI font for all prose and controls and the editor's code font for ids, paths and code. Do not load a web font.

**The Tabular Count Rule.** Every number that updates or lines up (counts, times, line deltas, lane meta) is set with tabular numerals.

## Layout

A two-column frame: a 56px rail, then the page. On Now the page splits into a centre column and a 300px side column divided by a host line. The centre stacks the header, the Needs you row (capped at 52% of the height, scrolling inside), the stream (fills the rest, newest at the bottom) and the composer pinned to the bottom with 20px side margins. Decision cards tile in an auto-fill grid with a 270px minimum and 10px gaps. Board and Scouts are a single scrolling page with 18px 24px 32px padding.

Spacing runs on small editor steps: 4 and 6px inside controls and rows, 8 to 10px between siblings, 12 to 14px card padding, 20px column gutters and section gaps, 24px page gutters. Headings carry more space below the previous block than above their content (10px under "Needs you", 8px under side headings).

Responsive behavior (as built): at 980px and below the side column folds into a horizontal Running strip above the stream (lanes 240px wide, staff words hidden, Up next hidden) and the whole Now page scrolls as one column with the composer sticky at the bottom. At 640px and below the rail turns into a 44px top bar with inline icon-plus-label items, cards stack to one column and gutters tighten to 14px.

## Elevation & Depth

Flat and tonal. Surfaces separate by a 1px host line and by mixing 3 to 7% of the foreground into the ground; nothing lifts at rest. The single real shadow belongs to the transient notice, which floats over the page for a few seconds.

### Shadow Vocabulary
- **Notice float** (`box-shadow: 0 6px 20px #0000004d`): the toast that rises under the header. Nothing else.

### Named Rules
**The Tonal Step Rule.** To raise a surface, mix more foreground into the ground (`raised`, then `raised-2`) and give it the host line; do not add a shadow.

## Shapes

Gently rounded, editor-scale corners. 4px for tags and code, 6px for buttons, fields and news rows, 8px for cards, lanes, scouts, the notice and the mark tile, 10px for the composer, the one container that frames a field. Notes on the staff are full circles (9px; the current note 11px with a ring 4px out). The staff line itself is a 1px hairline. Borders are always full and 1px; skipped notes take a dashed border.

## Components

### Buttons
Quiet host buttons with one coral voice per card.
- **Shape:** gently rounded (6px), 28px minimum height, 6px gap between icon and label.
- **Primary:** coral fill, coral border, clef-ink label at weight 600. One per card at most; also the composer's Send.
- **Hover / Focus:** primary lightens to 88% coral mixed with white; secondary takes `--vscode-button-secondaryHoverBackground`; 0.15s background transition. Focus is the global 1px focus-blue outline offset 2px. Disabled drops to 55% opacity; a busy button swaps its icon for the spinning `loading` codicon.
- **Secondary:** the host's secondary button colors with an input-line border.
- **Ghost:** no fill or border, muted text; hover raises to `raised` and full ink.

### Chips
- **Tag:** 11px muted text, 1px host line, 4px corners, no fill.
- **State words:** plain 12px text colored by state (blue running, coral text "you", green done, amber waiting, red failed). Never a filled pill.

### Cards / Containers
- **Decision card:** coral wash ground, coral edge border, 8px corners, 12px 14px padding, 6px internal gap. Title, a meta line (coral-text codicon, who, a middle-dot then the time), clamped text or a file list, then actions pinned to the bottom. While sending it dims to 80%.
- **Lane / Scout:** raised ground, host line, 8px corners. A lane's hover strengthens the border toward the foreground; a finished lane drops to 72% opacity.
- **News row:** a 6px-rounded strip in the stream with a 3% foreground wash; merged rows tint 9% green with a 35% green border, failed rows the same in red. Consecutive rows tuck 4px closer.
- **Shadow Strategy:** none; see Elevation & Depth.

### Inputs / Fields
- **Style:** host input ground and border, 6px corners, 7px 9px padding, placeholder in the host placeholder color.
- **Focus:** the border turns focus blue; the card answer field uses a 1px focus outline inset.
- **Nudge:** an answer field that needs filling takes a coral border and outline and coral-text placeholder.
- **Composer:** a 10px-rounded input-ground frame holding a borderless textarea (up to 200px) and Send; the whole frame turns focus blue on `:focus-within`. An 11px muted hint sits under it.

### Navigation
- **Rail:** navy-to-plum gradient, the 32px mark 14px above the items. Items are 46px wide, codicon 18px over a 10.5px label, 7px corners, labels in rail mist at 78%. Hover fills white at 6% and turns the label white; the current page fills white at 9% with a coral-soft icon. A coral count badge (16px, weight 700, clef ink) sits on the item's top right.
- **Mode switch:** a segmented control in an input-line frame with 7px corners; segments divided by the same line; the pressed segment takes `raised-2`, full ink and weight 600.
- **Mobile:** under 640px the rail is a 44px top bar; items become a 15px icon beside a 12px label and the badge sits inline.

### The Staff (signature)
Each task's stations drawn as notes on one thin line, read left to right: work, checker, queue, tests, you, merge.
- **Line:** a 1px hairline at 22% foreground; the passed segment is a green line that grows to the current station.
- **Notes:** 9px circles on the ground with a 1.5px border at 35% foreground; passed notes fill green; skipped notes are dashed at 60%.
- **Current note:** an 11px coral circle (amber when the station is "you") that slides to its next station over 0.7s on the system ease. While an agent is working it carries a coral ring 4px out that breathes (opacity 0.15 to 0.7, scale 0.85 to 1.1) over 2.4s.
- **Words:** 10.5px muted station words under each note; the current one in coral text at 600. The first and last words align to the line's ends. Compact lanes hide the words.
- **Reduced motion:** no slide, no breathing; the ring holds at 45%.

### The Mark
The treble clef stroked in clef ink (stroke 15 in the 0 to 200 path space, round caps and joins) on a 32px coral tile with 8px corners. It heads the rail (26px in the top bar) and stands in as the lead's avatar in the stream at 22px. The owner's avatar is a 22px `raised-2` tile with the `account` codicon.

## Do's and Don'ts

### Do:
- **Do** take every neutral from a `--vscode-*` variable with a fallback, so dark, light and high-contrast themes all hold.
- **Do** keep coral to what needs the owner: the Needs you heading and cards, one primary button per card, the rail count and the current note.
- **Do** switch coral text between #f2a58a on dark and #a8482a on light; lay text on coral fills in clef ink (#1b1f2a).
- **Do** draw every icon with a codicon (`git-branch`, `pass`, `loading`, `send`, `warning`); a busy control swaps its icon for `loading`.
- **Do** raise surfaces tonally (4% then 7% foreground into the ground) with a 1px host line.
- **Do** show task progress as notes on the staff, green for passed and coral for the current station, with motion turned off under reduced motion.
- **Do** set counts, times and line deltas in tabular numerals, and ids, paths and code in the editor's code font.

### Don't:
- **Don't** color running work, progress or success coral; those are blue and green.
- **Don't** hard-code a ground, text, border or focus color outside the rail and the mark.
- **Don't** load a web font or set prose in the code font.
- **Don't** add shadows to cards, lanes or buttons; the notice float is the only shadow.
- **Don't** put a bar down one side of a card or row to mark state; use the wash, the full border or the state word.
- **Don't** place a label above a heading; headings such as "Needs you" and "Running" stand alone.
