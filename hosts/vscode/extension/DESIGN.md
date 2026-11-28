---
name: symcc board in Cursor
description: The symcc board drawn as part of the VS Code workbench; the theme's colours, the editor's fonts, vscode-elements and codicons, nothing of its own.
colors:
  # Every value is the Dark Modern value of the --vscode-* variable named beside it; the live colour always comes
  # from the host theme (dark, light, high contrast). The product owns no colour.
  focus: "#0078d4" # --vscode-focusBorder
  button: "#0078d4" # --vscode-button-background
  button-hover: "#026ec1" # --vscode-button-hoverBackground
  button-fg: "#ffffff" # --vscode-button-foreground
  button-secondary: "#313131" # --vscode-button-secondaryBackground (vscode-elements)
  button-secondary-hover: "#3c3c3c" # --vscode-button-secondaryHoverBackground (vscode-elements)
  button-secondary-fg: "#cccccc" # --vscode-button-secondaryForeground (vscode-elements)
  menu-selection: "#0078d4" # --vscode-menu-selectionBackground
  menu-selection-fg: "#ffffff" # --vscode-menu-selectionForeground
  activity-badge: "#0078d4" # --vscode-activityBarBadge-background (vscode-elements)
  activity-badge-fg: "#ffffff" # --vscode-activityBarBadge-foreground (vscode-elements)
  link: "#4daafc" # --vscode-textLink-foreground
  link-hover: "#4daafc" # --vscode-textLink-activeForeground
  run: "#0078d4" # --vscode-progressBar-background
  good: "#73c991" # --vscode-testing-iconPassed
  bad: "#f85149" # --vscode-errorForeground
  warn: "#cca700" # --vscode-editorWarning-foreground
  ask: "#3794ff" # --vscode-charts-blue
  review: "#b180d7" # --vscode-charts-purple
  add: "#81b88b" # --vscode-gitDecoration-addedResourceForeground
  del: "#c74e39" # --vscode-gitDecoration-deletedResourceForeground
  modified: "#e2c08d" # --vscode-gitDecoration-modifiedResourceForeground
  diff-inserted: "rgba(155, 185, 85, 0.2)" # --vscode-diffEditor-insertedLineBackground
  diff-removed: "rgba(255, 0, 0, 0.2)" # --vscode-diffEditor-removedLineBackground
  editor: "#1f1f1f" # --vscode-editor-background, drawn by the host behind the page
  fg: "#cccccc" # --vscode-foreground
  dim: "#9d9d9d" # --vscode-descriptionForeground
  icon: "#cccccc" # --vscode-icon-foreground
  side: "#181818" # --vscode-sideBar-background
  line: "#2b2b2b" # --vscode-panel-border, then --vscode-widget-border
  widget-border: "#313131" # --vscode-widget-border
  hover: "#2a2d2e" # --vscode-list-hoverBackground
  inactive-selection: "#37373d" # --vscode-list-inactiveSelectionBackground
  selection: "#264f78" # --vscode-editor-selectionBackground
  input: "#313131" # --vscode-input-background
  input-fg: "#cccccc" # --vscode-input-foreground
  input-line: "#3c3c3c" # --vscode-input-border
  placeholder: "#989898" # --vscode-input-placeholderForeground
  dropdown: "#313131" # --vscode-dropdown-background
  dropdown-fg: "#cccccc" # --vscode-dropdown-foreground
  dropdown-border: "#3c3c3c" # --vscode-dropdown-border
  tool-hover: "rgba(90, 93, 94, 0.31)" # --vscode-toolbar-hoverBackground
  tool-active: "rgba(99, 102, 103, 0.31)" # --vscode-toolbar-activeBackground
  badge: "#616161" # --vscode-badge-background
  badge-fg: "#f8f8f8" # --vscode-badge-foreground
  menu: "#1f1f1f" # --vscode-menu-background
  menu-border: "#454545" # --vscode-menu-border
  widget: "#202020" # --vscode-editorWidget-background
  notifications: "#1f1f1f" # --vscode-notifications-background
  notifications-border: "#2b2b2b" # --vscode-notifications-border
  widget-shadow: "rgba(0, 0, 0, 0.36)" # --vscode-widget-shadow
  scroll-shadow: "#000000" # --vscode-scrollbar-shadow
  slider: "rgba(121, 121, 121, 0.4)" # --vscode-scrollbarSlider-background
  slider-hover: "rgba(100, 100, 100, 0.7)" # --vscode-scrollbarSlider-hoverBackground
  slider-active: "rgba(191, 191, 191, 0.4)" # --vscode-scrollbarSlider-activeBackground
  preformat: "#3c3c3c" # --vscode-textPreformat-background
  preformat-fg: "#d0d0d0" # --vscode-textPreformat-foreground
  code-block: "rgba(10, 10, 10, 0.4)" # --vscode-textCodeBlock-background
  quote: "#2b2b2b" # --vscode-textBlockQuote-background
  quote-border: "#616161" # --vscode-textBlockQuote-border
  key-label: "rgba(128, 128, 128, 0.17)" # --vscode-keybindingLabel-background
  key-label-fg: "#cccccc" # --vscode-keybindingLabel-foreground
  key-label-border: "rgba(51, 51, 51, 0.6)" # --vscode-keybindingLabel-border
  key-label-bottom: "rgba(68, 68, 68, 0.6)" # --vscode-keybindingLabel-bottomBorder
typography:
  title:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  prose:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  secondary:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  view-header:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "22px"
  code:
    fontFamily: "var(--vscode-editor-font-family), ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\""
  icon:
    fontFamily: "codicon"
    fontSize: "16px"
  icon-row:
    fontFamily: "codicon"
    fontSize: "14px"
rounded:
  input: "2px"
  inline: "3px"
  item: "4px"
  toolbar: "5px"
  surface: "6px"
  tag: "9px"
  pill: "11px"
spacing:
  hair: "2px"
  tight: "4px"
  gap: "6px"
  pad: "8px"
  pad-wide: "10px"
  inset: "12px"
  indent: "16px"
  gutter: "20px"
  row: "22px"
  sub-indent: "36px"
  chat-max: "860px"
components:
  button-primary:
    backgroundColor: "{colors.button}"
    textColor: "{colors.button-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.item}"
    padding: "1px 13px"
  button-primary-hover:
    backgroundColor: "{colors.button-hover}"
  button-secondary:
    backgroundColor: "{colors.button-secondary}"
    textColor: "{colors.button-secondary-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.item}"
    padding: "1px 13px"
  button-secondary-hover:
    backgroundColor: "{colors.button-secondary-hover}"
  icon-button:
    textColor: "{colors.icon}"
    rounded: "{rounded.toolbar}"
    size: "22px"
  icon-button-hover:
    backgroundColor: "{colors.tool-hover}"
  icon-button-active:
    backgroundColor: "{colors.tool-active}"
  text-field:
    backgroundColor: "{colors.input}"
    textColor: "{colors.input-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
  dropdown:
    backgroundColor: "{colors.dropdown}"
    textColor: "{colors.dropdown-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    height: "24px"
    padding: "0 6px"
  panel-tab:
    textColor: "{colors.dim}"
    typography: "{typography.label}"
  panel-tab-active:
    textColor: "{colors.fg}"
  view-header:
    textColor: "{colors.fg}"
    typography: "{typography.view-header}"
    height: "{spacing.row}"
  list-row:
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    height: "{spacing.row}"
    padding: "0 12px 0 16px"
  list-row-hover:
    backgroundColor: "{colors.hover}"
  list-row-open:
    backgroundColor: "{colors.inactive-selection}"
  counter-badge:
    backgroundColor: "{colors.badge}"
    textColor: "{colors.badge-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
  needs-badge:
    backgroundColor: "{colors.activity-badge}"
    textColor: "{colors.activity-badge-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
  tag:
    backgroundColor: "{colors.badge}"
    textColor: "{colors.badge-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "0 5px"
  filter-chip:
    textColor: "{colors.fg}"
    typography: "{typography.secondary}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  filter-chip-on:
    backgroundColor: "{colors.button}"
    textColor: "{colors.button-fg}"
  menu:
    backgroundColor: "{colors.menu}"
    textColor: "{colors.fg}"
    rounded: "{rounded.surface}"
    padding: "4px"
    width: "240px"
  menu-item:
    textColor: "{colors.fg}"
    rounded: "{rounded.item}"
    padding: "4px 8px"
  menu-item-active:
    backgroundColor: "{colors.menu-selection}"
    textColor: "{colors.menu-selection-fg}"
  owner-bubble:
    backgroundColor: "{colors.input}"
    textColor: "{colors.input-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    padding: "8px 10px"
  fold-head:
    textColor: "{colors.dim}"
    typography: "{typography.secondary}"
    rounded: "{rounded.item}"
    height: "{spacing.row}"
    padding: "0 6px 0 2px"
  fold-head-hover:
    backgroundColor: "{colors.tool-hover}"
    textColor: "{colors.fg}"
  composer:
    backgroundColor: "{colors.input}"
    textColor: "{colors.input-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    padding: "6px 6px 4px 10px"
  composer-chip:
    textColor: "{colors.dim}"
    typography: "{typography.secondary}"
    rounded: "{rounded.item}"
    height: "{spacing.row}"
    padding: "0 6px"
  composer-chip-hover:
    backgroundColor: "{colors.tool-hover}"
    textColor: "{colors.fg}"
  send-button:
    backgroundColor: "{colors.button}"
    textColor: "{colors.button-fg}"
    rounded: "{rounded.item}"
    size: "24px"
  send-button-hover:
    backgroundColor: "{colors.button-hover}"
  key-label:
    backgroundColor: "{colors.key-label}"
    textColor: "{colors.key-label-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.inline}"
    padding: "0 4px"
  inline-code:
    backgroundColor: "{colors.preformat}"
    textColor: "{colors.preformat-fg}"
    typography: "{typography.code}"
    rounded: "{rounded.inline}"
    padding: "1px 4px"
  code-block:
    backgroundColor: "{colors.code-block}"
    typography: "{typography.code}"
    rounded: "{rounded.item}"
    padding: "8px 10px"
  banner:
    backgroundColor: "{colors.widget}"
    textColor: "{colors.fg}"
    padding: "8px 16px"
  toast:
    backgroundColor: "{colors.notifications}"
    textColor: "{colors.fg}"
    rounded: "{rounded.item}"
    padding: "10px 12px"
---

# Design System: symcc board in Cursor

## Overview

**Creative North Star: "Part of the Workbench"**

The board is not an app inside the editor; it is more of the editor. The lead's chat holds the main area the way Cursor's own chat does, and the work sits beside it as side-bar views: Needs you, Running, Up next, then folded Just merged, Backlog and Organizational memory. Everything visible is something VS Code already draws: panel tabs, collapsible views with uppercase headers and counter badges, 22px list rows that light up in the list hover colour, menus in the menu colours, blue primary buttons, thin scrollbar sliders, codicons. A user who switches themes sees the board switch with the rest of the window, because the board has no colours of its own to keep.

Density is the workbench's: 13px text, 22px rows, 12px and 11px secondary lines, 4 to 8px gaps. Hierarchy comes from position (the chat in the middle, the views on the right), from the uppercase view headers, and from the dim description colour, never from size or brand colour. Routine progress is quiet (a dim line, a spinning codicon); the things that ask for the owner (a question, a review, a failure) carry their colour on the icon and sit first in the first view.

This system replaces an earlier, rejected direction that gave the board a coral accent, a navy-to-plum rail and a staff-line graphic. None of it carries over: no brand colour, no cards, no custom scrollbars, no gradients.

**Key Characteristics:**
- Every colour is a `--vscode-*` theme variable; Dark Modern's value is only the fallback.
- The editor's UI font at the editor's size; monospace only for ids, paths, code and tool arguments.
- vscode-elements for tabs, views, buttons, fields, text areas, badges and toolbar buttons; codicons for every icon.
- A Cursor-like chat: the owner's messages in a bubble, the lead's replies plain, its thinking and tool runs folded to one dim line.
- Flat surfaces divided by 1px panel borders; shadows only under things that float.

## Colors

The palette is the host theme's, used through about twenty local aliases on `:root` (`--fg`, `--dim`, `--line`, `--side`, `--hover`, `--focus`, `--link`, `--input`, `--run`, `--good`, `--bad`, `--warn`, `--ask`, `--review`, `--add`, `--del` and a few more); each is written as `var(--vscode-<role>, <Dark Modern value>)`. The values below are Dark Modern's, the theme the fallbacks are written against. Light Modern, high contrast and every other theme supply their own values through the same variables; this file holds no light palette.

### Primary
- **Theme Blue** (focus, button, menu selection, activity badge, progress): VS Code's primary action colour, not symcc's. Primary buttons and the Send/Stop button fill with it, a focused field or the composer takes it as a 1px border, the highlighted menu or slash-command item fills with it under white text, the Needs you counter wears it (vscode-elements' activity-bar counter), and the running spinner is drawn in the progress-bar colour.
- **Theme Blue Hover** (button-hover): the hover fill of primary buttons and Send.
- **Link Blue** (link, link-hover): task references (`T-42`), file links in the lead's Markdown, and text actions; underlined on hover only.
- **Secondary Button Grey** (button-secondary and its hover and foreground): answer choices, Cancel, Open in terminal and every non-primary action, drawn by vscode-elements.

### Tertiary (status)
- **Passed Green** (good): merged lanes, passed stages, the "nothing waiting" check.
- **Error Red** (bad): failed tasks and steps, error banners and toasts, the word "failed" in board news.
- **Warning Amber** (warn): time and file-scope needs, worktrees behind their base, the fallback for the banner icon.
- **Question Blue** (ask, from `--vscode-charts-blue`): a question waiting for the owner, waiting tasks, the info icon of a toast.
- **Review Purple** (review, from `--vscode-charts-purple`): work ready for the owner's review.
- **Git Added / Deleted / Modified** (add, del, modified): `+12 −4` line counts and the modified-file dot, in the git decoration colours the Explorer uses.
- **Diff Lines** (diff-inserted, diff-removed): line backgrounds in diff code blocks, the diff editor's own.

### Neutral
- **Editor Ground** (editor): drawn by the host behind the board panel; the page itself is transparent.
- **Side Bar** (side): the right-hand views column on the Now page, and the whole sidebar view.
- **Foreground** (fg) and **Description** (dim): text and secondary text. Dim carries timestamps, counts, row ends, meta lines, fold heads and empty states.
- **Panel Border** (line, widget-border): every 1px divider: under the tabs, between views, around code blocks, tables and step logs.
- **List Hover** (hover) and **Inactive Selection** (inactive-selection): row hover, and the open row of an expanded need or task.
- **Input** (input, input-fg, input-line, placeholder): text fields, the composer, the owner's chat bubble (through `--vscode-chat-requestBackground` when the host sets it).
- **Dropdown** (dropdown, dropdown-fg, dropdown-border): the board-mode dropdown in the tab bar.
- **Toolbar Hover / Active** (tool-hover, tool-active): icon buttons, fold heads and composer chips under the pointer.
- **Badge** (badge, badge-fg): counters on views and tags on task rows.
- **Menu** (menu, menu-border) and **Editor Widget** (widget): menus and the slash-command pop-up; banners fall back to the widget colour.
- **Notifications** (notifications, notifications-border): the toast.
- **Shadows** (widget-shadow, scroll-shadow): see Elevation & Depth.
- **Scrollbar Slider** (slider, slider-hover, slider-active): the 10px thumb.
- **Text Blocks** (preformat, preformat-fg, code-block, quote, quote-border, selection): inline code, fenced code, blockquotes and the thought block, text selection.
- **Key Label** (key-label and its foreground and borders): `Enter`, `Shift+Enter`, `/` in the composer hint.

### Named Rules
**The Borrowed Palette Rule.** Every colour is `var(--vscode-<role>, <Dark Modern value>)`. A literal colour outside such a fallback is drift. Before adding an alias, check whether one of the existing ones already names the role.

**The No Brand Rule.** symcc has no colour on the board. The theme blue is VS Code's, and the logo appears only as a monochrome mark in `currentColor` (at 0.4 opacity in an empty chat). The coral of the logo file stays out of this surface.

**The Colour on the Icon Rule.** Status colour sits on the codicon and, at most, on a one-word state ("failed", "work · 4m 14s"). Rows, views and messages are never filled with a status colour. The only tinted boxes are VS Code's own: the input-validation warning box around a stop or drop confirmation, and the diff editor's line backgrounds.

## Typography

**Body Font:** the editor's UI font, `--vscode-font-family` (with `system-ui, sans-serif`)
**Label/Mono Font:** the editor's font, `--vscode-editor-font-family` (with `ui-monospace, monospace`)

**Character:** whatever the user's editor uses, at the size the editor uses: the board reads like the Explorer, not like a web page. There is no display face and no type choice of the product's own.

### Hierarchy
- **Title** (600, 15px): welcome and set-up screens only; the largest text on the board.
- **Body** (400, 13px, 1.4): rows, chat messages, buttons, fields. Takes `--vscode-font-size` when the host sets it.
- **Prose** (400, 13px, 1.55): the lead's Markdown. Its headings stay at 1.2em, 1.1em and 1em, 600.
- **Secondary** (400, 12px): row ends, sub-rows, meta and facts lines, fold heads ("Thought for 3s", "Ran 3 commands"), tool steps, board news, message footers, menu descriptions.
- **Label** (400, 11px): the composer hint, the day separator, menu group names, key labels, tags and counters. Panel tabs use it in uppercase.
- **View Header** (700, 11px, uppercase, 22px line): collapsible view headers, as vscode-elements draws them. Headings inside an expanded task (Session, Timeline, Files) use the same 11px uppercase in 600 and the description colour.
- **Code** (400, 12px, 1.45, tabular numbers): task ids, branch and file names, tool arguments, code blocks (at `--vscode-editor-font-size`), inline code at 0.92em.
- **Icons** (codicon, 16px default; 14px in rows, menus, links and buttons; 13px in tool steps, chips and message footers; 12px in sub-rows and stage lines): codicons are a font, so their size is set by `font-size`.

### Named Rules
**The Editor's Voice Rule.** One family at one base size. Hierarchy comes from 600 weight, the description colour and the 12px and 11px steps, never from a larger size; nothing outside a welcome screen goes above 13px, and Markdown headings stop at 1.2em.

**The Mono for Machines Rule.** Monospace marks what a machine reads: task ids, paths, branches, code, tool arguments, file lists. Every count, time and line number uses tabular figures.

## Layout

**Board panel.** vscode-elements panel tabs (Now, Board, Worktrees, Scouts, Memory) run across the top, with the project name (600), the branch, the counts and the board-mode dropdown on their right. A 1px panel border separates them from the page.

**Now page.** A two-column grid: the chat in `minmax(0, 1fr)` and the views in `clamp(260px, 26%, 320px)` on the side-bar background behind a 1px side-bar border. The chat stream and the composer share one centred column of at most 860px with 20px gutters; the stream scrolls, the composer stays pinned at the bottom. Under 720px the grid becomes one column: the views move above the chat, cap at 28vh with a scroll shadow under them, and Running and Up next start folded.

**Other pages.** A toolbar with a filter field (at most 420px) and counts, an optional intro paragraph (80ch), then collapsible views inset 12px from the panel edges, each a list of rows. An expanded task or worktree opens beneath its row, indented 30px, at most 900px wide.

**Sidebar.** The same views in the activity bar's side bar, plus a Lead view: the lead's latest reply cut at 9.5em with a fade, and a small composer.

**Rows and rhythm.** List rows are 22px, inset 16px left and 12px right; sub-lines are 18px and indented 36px so they sit under the title, past the icon. Gaps run 2, 4, 6, 8, 10, 12, 16 and 20px; 6px between an icon and its label, 8px between groups.

**Responsive steps.** The tab bar drops its counts under 900px and the project name under 620px; a worktree row drops its facts when its page is narrower than 760px.

### Named Rules
**The 22px Row Rule.** Every list item is a 22px row: chevron or codicon, mono id, title (ellipsis), and a dim 12px end column. A new list is a new view of rows, not a new layout.

## Elevation & Depth

Flat by default. Surfaces are told apart by the theme's own backgrounds (editor ground, side bar, input) and 1px panel borders, never by shadow. Shadow appears only under things that float over content, and as VS Code's scroll shadow when the views stack above the chat.

### Shadow Vocabulary
- **Widget Shadow** (`box-shadow: 0 2px 8px var(--vscode-widget-shadow)`): menus, the slash-command pop-up, the toast.
- **Scroll Shadow** (`box-shadow: 0 3px 4px -3px var(--vscode-scrollbar-shadow)`): the stacked views under 720px, where they sit over the chat.

### Named Rules
**The Flat Workbench Rule.** If it does not float above other content, it has no shadow.

## Shapes

VS Code's small radii, chosen by what the element is: 2px for text fields, the mode dropdown and the menu's filter field; 3px for inline code, key labels, the segmented control and file rows; 4px for buttons (vscode-elements), menu items, chips, Send, fold heads, code blocks, step logs, thumbnails and the toast; 5px for icon buttons; 6px for the composer, the owner's bubble and menus; pills for tags (9px) and filter chips and counters (11px). List rows and views have no radius. Borders are 1px; focus is a 1px `--vscode-focusBorder` outline drawn inside the element (offset −1px), as in VS Code's lists.

## Components

### Buttons
VS Code's own, from vscode-elements.
- **Shape:** gently rounded (4px), padding 1px 13px, the body size.
- **Primary:** theme blue under white text. One per decision: Answer, Approve, Save; a busy primary shows the spinning `loading` codicon in place of its icon.
- **Secondary:** the secondary button grey; answer choices, Cancel, Retry, Open in terminal.
- **Icon buttons:** 22px square, 5px radius, transparent, the icon foreground; the toolbar hover and active fills under the pointer and on press; 0.4 opacity when disabled. Row actions (pause, stop) appear at the row's end.
- **Hover / Focus:** hover changes the fill only, with no transition; focus is the 1px focus outline.

### Chips
- **Composer chips** (Agent, model, picture): transparent, dim, 22px tall, 4px radius, 12px text with a 13px codicon; the toolbar hover fill and the foreground colour on hover or while their menu is open.
- **Tags** (bug, docs): badge colours, a 9px pill, 11px text, at a row's end.
- **Filter chips** (Scouts, Memory): an 11px pill outlined in the input border, 12px text; pressed, they fill with the button colours.
- **Counters:** vscode-elements badges in the view headers and the Now tab; grey `counter` everywhere except Needs you, which uses the blue `activity-bar-counter`.

### Cards / Containers
There are no cards. Content is grouped into collapsible views and rows, divided by 1px panel borders. The few bordered boxes are functional: code blocks (4px, code-block background, an 11px header with the language and a copy button), step logs (4px, panel border), and the stop or drop confirmation (4px, the input-validation warning border and background).

### Inputs / Fields
- **Style:** vscode-elements text fields and text areas in the input colours with the input border, 2px radius.
- **Focus:** the border turns to the focus blue.
- **Composer:** see the signature component below.

### Navigation
- **Panel tabs:** 11px uppercase; inactive in the description colour, active in the foreground with the theme blue underline that vscode-elements' panel style draws.
- **Mode dropdown:** 24px tall, 2px radius, dropdown colours, a codicon for the current mode; the border turns blue on hover. It opens a menu.
- **Menus:** menu colours, 6px radius, 4px padding, at least 240px wide, the widget shadow. Group names are 11px dim; each item is a 4px-radius row with a 14px codicon, a title and a 12px dim description; the highlighted item fills with the menu selection colours; a check marks the current choice. The slash-command pop-up is the same menu above the composer.

### The Chat (signature)
The owner's messages sit in a bubble in the chat-request colours (the input colours by default), 6px, 8px 10px padding. The lead's replies are plain Markdown on the ground, with a 12px dim footer (time, model) and a Copy icon button that appears on hover. Each run of the lead's work folds to one dim 12px line, closed by default: "Thought for 3s" opens to the thought on the quote background; "Ran 3 commands" or "Used 3 board tools, read 1 file" opens to a step list, one 20px line per step with a 13px codicon, the tool name in bold and its argument in dim mono. Board events between turns ("T-42 CSV export for invoices added") are 12px dim news lines with a status codicon and the time at the right. A centred 11px dim day label separates days.

### The Composer (signature)
Like Cursor's: an input-coloured box, 6px, that takes a 1px focus border while anything inside it has focus. A borderless text area grows from one line; under it a bar of composer chips and, at the right end, the 24px Send button in the button colours (an arrow, or a square that stops the lead while it works; 0.4 opacity when empty). Under the box an 11px dim hint with key labels: `Enter` sends · `Shift+Enter` new line · `/` commands and skills. Attached pictures show as 52px thumbnails above the text.

### Views and Rows (signature)
vscode-elements collapsible views with 22px uppercase 11px headers, a counter badge in the header's decorations, and 1px side-bar section borders between them. Inside, 22px rows: a chevron where the row expands, a status codicon (14px, coloured by the Colour on the Icon Rule), the mono id, the title, a dim end column. A sub-row of 12px dim text shows what a running task is doing. Hover is the list hover; an open need or task keeps the inactive selection.

### Banners, Toast and Key Labels
- **Banner:** full width under the tabs, the banner colours (the editor widget colour by default), a 1px bottom border, a codicon in the banner icon colour (red for errors) and buttons at the end.
- **Toast:** bottom right, at most 440px, the notification colours and border, 4px, the widget shadow, an info or error codicon.
- **Key labels:** 11px in the body font, 3px, the keybinding-label colours with the heavier bottom border, as in VS Code's keyboard shortcut labels.

### Scrollbars
VS Code's: a 10px thumb in the scrollbar slider colours on a transparent track. The stylesheet resets `scrollbar-color` and `scrollbar-width` to `auto` on `:root`, because the webview sets `scrollbar-color` and Chromium would otherwise ignore the slider rules and draw the system's classic scrollbars.

### Motion
None beyond VS Code's own: the `loading` codicon spins (1.5s, 30 steps), slowed to 6s under reduced motion. Hover, open and selection change instantly, as in the workbench's lists.

## Do's and Don'ts

### Do:
- **Do** write every colour as `var(--vscode-<role>, <Dark Modern value>)`, through an existing alias (`--fg`, `--dim`, `--line`, `--side`, `--hover`, `--focus`, `--link`, `--input`, `--run`, `--good`, `--bad`, `--warn`, `--ask`, `--review`, `--add`, `--del`) when one names the role.
- **Do** use vscode-elements for tabs, views, buttons, text fields, text areas, badges and toolbar buttons, and write CSS only for what it lacks: list rows, menus, banners, the toast, the chat and the composer.
- **Do** use a codicon for every icon: 16px by default, 14px in rows, menus and buttons.
- **Do** build every list from 22px rows inside a collapsible view, with the status colour on the row's codicon.
- **Do** fold the lead's thinking and tool runs into one dim 12px line that opens to the steps.
- **Do** keep the composer pinned under the chat in the same 860px column, with Send/Stop in the button colours.

### Don't:
- **Don't** give the board a brand colour: no coral, no accent of symcc's own; the logo mark is drawn in `currentColor`.
- **Don't** put content in cards or tiles; group it with views, rows and 1px panel borders. Bordered boxes are for code blocks, step logs and confirmations only.
- **Don't** design scrollbars: no widths, colours or thumbs beyond VS Code's 10px slider, and keep the `scrollbar-color: auto` reset.
- **Don't** use gradients as fills or decoration; the one gradient is the mask that fades a cut-off lead reply in the sidebar.
- **Don't** write a colour that is not the fallback of a `--vscode-*` variable.
- **Don't** use display type: nothing above 15px, and Markdown headings no larger than 1.2em.
- **Don't** add shadows to anything that does not float over other content.
