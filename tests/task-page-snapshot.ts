// Written by snapshot-format.ts (one drawn row per line, T-705). To re-capture a page, print
// `snapshotEntry(key, drawnData(await ui.drawn()))` from a short probe test and put its lines in place of that entry.
// The task page's drawn trees for the rich tasks of task-page-fixture.ts on the terminal and the desktop, captured
// from the code before the VS Code task page (T-414). The VS Code work must leave these exactly as they are. They are
// drawn at T0, the fixture's fixed clock (T-504's running try has run 5 minutes then), whenever the tests run (T-437). Updated on purpose for:
// - T-587: the badge names the step, the Stage row
// - T-651: the answer choices as numbered lines
// - T-647: the Status row names the state
// - T-693: no status badge under the title
// - T-701: an answered investigation's Status row says "answered: read it"
// - T-751: the 4-line page header (where you are, title, state, buttons in groups) and its heavy rule; no Status, Stage or Now rows
// - T-774: the Runs heading sums the task's own tries
// - T-775: every header button "[Label]" in one style, Back "‹ [Tasks]"; the try buttons "[Try 1]", their keys hidden (on desktop and mobile native Buttons "Try 1" and Back "Tasks", no brackets)
// - T-914: the header's id always the board orange ("claude"), whatever the status
// - T-917: on the terminal the "asks: …" question comes cut into lines that fit inside the answer box
// - T-954: the Run now button (key e) on to do, paused, failed, dropped and backlog tasks
// - T-966: the Order row (the run order, and a to do task's place in line) after Added
export const TASK_BEFORE: Record<string, unknown> = {
  "desktop T-501": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-501 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 2 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-501"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (review)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"warning","weight":"semibold"},"children":["◆ ready for review"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"approve","label":"Approve","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"show-changes","label":"Show changes","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"reject","label":"Reject","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"approve-key","label":"a","hotkey":"a"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"show-changes-key","label":"d","hotkey":"d"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"reject-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Steps:    "]},
              {"type":"Text","props":{"color":"success"},"children":["worker ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["prep ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["queue ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["test ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["●"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["review"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → merge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Changes (0 files, against main)"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  folder: ",".symcc","/worktrees/","T-501"," · edit files there, then approve (the tests run again)"]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["  no changes"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Enter on a file shows its diff · d all files"]}
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" approve"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" show changes"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reject"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-501": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-501 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 2 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-501"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (review)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"warning"},"children":["◆ ready for review"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"approve","label":"Approve","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Approve]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"show-changes","label":"Show changes","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Show changes]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"reject","label":"Reject","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Reject]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"approve-key","label":"a","hotkey":"a"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"show-changes-key","label":"d","hotkey":"d"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"reject-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Steps:    "]},
              {"type":"Text","props":{"color":"success"},"children":["worker ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["prep ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["queue ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["test ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["●"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["review"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → merge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Changes (0 files, against main)"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  folder: ",".symcc","/worktrees/","T-501"," · edit files there, then approve (the tests run again)"]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["  no changes"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Enter on a file shows its diff · d all files"]}
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["a"]},{"type":"Text","props":{"color":"inactive"},"children":[" approve"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" show changes"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reject"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-502": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-502 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 5 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-502"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (failed)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ failed"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"italic":true,"color":"inactive"},"children":["tests failed"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [{"type":"Button","props":{"key":"retry","label":"Retry","variant":"secondary"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"stash","label":"Stash to backlog","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role","label":"Role","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"already-merged","label":"Already merged","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-2","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"retry-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"stash-key","label":"z","hotkey":"z"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-key","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Why it failed"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["The tests failed."]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["Next: Retry to let a new worker fix the failing"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tests, ask the lead in the chat to change the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task if the tests show it asks for the wrong"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"inactive"},"children":["thing, or Drop it."]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" retry"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["z"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" stash to backlog"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" role"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-502": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-502 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 5 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-502"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (failed)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ failed"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"italic":true,"color":"inactive"},"children":["tests failed"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"retry","label":"Retry","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Retry]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"stash","label":"Stash to backlog","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Stash to backlog]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"role","label":"Role","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Role]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"already-merged","label":"Already merged","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Already merged]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-2","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"retry-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"stash-key","label":"z","hotkey":"z"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-key","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Why it failed"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["The tests failed."]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["Next: Retry to let a new worker fix the failing"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tests, ask the lead in the chat to change the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task if the tests show it asks for the wrong"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"inactive"},"children":["thing, or Drop it."]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},{"type":"Text","props":{"color":"inactive"},"children":[" retry"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["z"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" stash to backlog"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["l"]},{"type":"Text","props":{"color":"inactive"},"children":[" role"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" drop"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-503": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-503 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 4 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-503"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (waiting)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"warning","weight":"semibold"},"children":["? waiting for you"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"already-merged","label":"Already merged","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column","borderStyle":"round","borderColor":"warning","paddingX":1},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"warning","weight":"semibold"},"children":["asks: "]},
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": ["Should the report show all of its lines at once, or only the first part with a button to show the rest?"]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"answer-choices","flexDirection":"column"},
            "children": [
              {
                "type": "Box",
                "props": {"key":"choice-row-1","flexDirection":"column"},
                "children": [{"type":"Button","props":{"key":"choice-1","label":"1. Only the first part","autoFocus":true},"press":{"plugin":"symcc"}}]
              },
              {
                "type": "Box",
                "props": {"key":"choice-row-2","flexDirection":"column"},
                "children": [{"type":"Button","props":{"key":"choice-2","label":"2. All of it"},"press":{"plugin":"symcc"}}]
              },
              {
                "type": "Box",
                "props": {"key":"choice-row-3","flexDirection":"column"},
                "children": [{"type":"Button","props":{"key":"choice-3","label":"3. Answer…"},"press":{"plugin":"symcc"}}]
              },
              {
                "type": "Box",
                "props": {"key":"choice-keys","display":"none"},
                "children": [
                  {"type":"Button","props":{"key":"choice-key-1","label":"Only the first part","hotkey":"1"},"press":{"plugin":"symcc"}},
                  {"type":"Button","props":{"key":"choice-key-2","label":"All of it","hotkey":"2"},"press":{"plugin":"symcc"}},
                  {"type":"Button","props":{"key":"choice-key-3","label":"Answer…","hotkey":"3"},"press":{"plugin":"symcc"}}
                ]
              }
            ]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["keys 1-3 pick a choice"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-503": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-503 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 4 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-503"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (waiting)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"warning"},"children":["? waiting for you"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"already-merged","label":"Already merged","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Already merged]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column","borderStyle":"round","borderColor":"warning","paddingX":1},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"warning"},"children":["asks: "]},
              {"type":"Text","props":{"color":"text"},"children":["Should the report show all of its lines"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["at once, or only the first part with a button"]}]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["to show the rest?"]}]},
          {
            "type": "Box",
            "props": {"key":"answer-choices","flexDirection":"column"},
            "children": [
              {
                "type": "Box",
                "props": {"key":"choice-row-1","flexDirection":"column"},
                "children": [
                  {
                    "type": "Button",
                    "props": {"key":"choice-1","label":"Only the first part","plain":true,"autoFocus":true},
                    "press": {"plugin":"symcc"},
                    "hover": {"inverse":true},
                    "children": [{"type":"Text","props":{"color":"text"},"children":["1. Only the first part"]}]
                  }
                ]
              },
              {
                "type": "Box",
                "props": {"key":"choice-row-2","flexDirection":"column"},
                "children": [
                  {
                    "type": "Button",
                    "props": {"key":"choice-2","label":"All of it","plain":true},
                    "press": {"plugin":"symcc"},
                    "hover": {"inverse":true},
                    "children": [{"type":"Text","props":{"color":"text"},"children":["2. All of it"]}]
                  }
                ]
              },
              {
                "type": "Box",
                "props": {"key":"choice-row-3","flexDirection":"column"},
                "children": [
                  {
                    "type": "Button",
                    "props": {"key":"choice-3","label":"Answer…","plain":true},
                    "press": {"plugin":"symcc"},
                    "hover": {"inverse":true},
                    "children": [{"type":"Text","props":{"color":"inactive"},"children":["3. Answer…"]}]
                  }
                ]
              },
              {
                "type": "Box",
                "props": {"key":"choice-keys","display":"none"},
                "children": [
                  {"type":"Button","props":{"key":"choice-key-1","label":"Only the first part","hotkey":"1"},"press":{"plugin":"symcc"}},
                  {"type":"Button","props":{"key":"choice-key-2","label":"All of it","hotkey":"2"},"press":{"plugin":"symcc"}},
                  {"type":"Button","props":{"key":"choice-key-3","label":"Answer…","hotkey":"3"},"press":{"plugin":"symcc"}}
                ]
              }
            ]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["keys 1-3 pick a choice"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" drop"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-504": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-504 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 6 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-504"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (doing)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["▶ doing"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"text"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["⏱ 25m"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Steps:    "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["● worker"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → prep → queue → test → merge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 5m (running) · all: 25m · 4.6k"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 25m · 4.6k tokens (0.4× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  ● try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {"type":"Text","props":{"color":"success"},"children":["  try 2: 5m (running)"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 25m · 4.6k tokens in all · ~$0.42"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 1 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-1.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["First try: the tests failed."]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-504": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-504 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 6 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-504"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (doing)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"ide"},"children":["▶ doing"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"text"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["⏱ 25m"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"pause","label":"Pause","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Pause]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Steps:    "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["● worker"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → prep → queue → test → merge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 5m (running) · all: 25m · 4.6k"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["tokens"]}]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 25m · 4.6k tokens (0.4× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  ● try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {"type":"Text","props":{"color":"success"},"children":["  try 2: 5m (running)"]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 25m · 4.6k tokens in all · ~$0.42"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 1 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-1.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["First try: the tests failed."]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},{"type":"Text","props":{"color":"inactive"},"children":[" pause"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" drop"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-505": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-505 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 9 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-505"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (paused)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["‖ paused"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [{"type":"Button","props":{"key":"resume","label":"Resume","variant":"secondary"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"stash","label":"Stash to backlog","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role","label":"Role","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"already-merged","label":"Already merged","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-2","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"resume-key","label":"u","hotkey":"u"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"stash-key","label":"z","hotkey":"z"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-key","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["u"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" resume"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["z"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" stash to backlog"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" role"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-505": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-505 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 9 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-505"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (paused)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["‖ paused"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"resume","label":"Resume","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Resume]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"stash","label":"Stash to backlog","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Stash to backlog]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"role","label":"Role","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Role]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"already-merged","label":"Already merged","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Already merged]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-2","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"resume-key","label":"u","hotkey":"u"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"stash-key","label":"z","hotkey":"z"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-key","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["u"]},{"type":"Text","props":{"color":"inactive"},"children":[" resume"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["z"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" stash to backlog"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["l"]},{"type":"Text","props":{"color":"inactive"},"children":[" role"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" drop"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-506": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-506 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 8 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-506"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (todo)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["○ to do"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"run-now","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"stash","label":"Stash to backlog","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role","label":"Role","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"run-now-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"stash-key","label":"z","hotkey":"z"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-key","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["0"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · waits on T-498 first"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["z"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" stash to backlog"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" role"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-506": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-506 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 8 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-506"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (todo)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["○ to do"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"pause","label":"Pause","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Pause]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"run-now","label":"Run now","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Run now]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"stash","label":"Stash to backlog","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Stash to backlog]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"role","label":"Role","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Role]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"run-now-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"stash-key","label":"z","hotkey":"z"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-key","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["0"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · waits on T-498 first"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},{"type":"Text","props":{"color":"inactive"},"children":[" pause"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["z"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" stash to backlog"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["l"]},{"type":"Text","props":{"color":"inactive"},"children":[" role"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" drop"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},{"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-507": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-507 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 10 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-507"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (backlog)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["◇ backlog"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"to-todo","label":"Move to todo","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role","label":"Role","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"to-todo-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-key","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["0"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move to todo"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" role"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-507": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-507 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 10 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-507"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (backlog)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["◇ backlog"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"to-todo","label":"Move to todo","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Move to todo]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"role","label":"Role","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Role]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"to-todo-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-key","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["0"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move to todo"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["l"]},{"type":"Text","props":{"color":"inactive"},"children":[" role"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" drop"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-508": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-508 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 12 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-508"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (done)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ done"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [{"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Steps:    "]},
              {"type":"Text","props":{"color":"success"},"children":["worker ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["prep ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["queue ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["test ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" →"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"success"},"children":["merge ✓"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-508": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-508 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 12 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-508"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (done)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ done"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Steps:    "]},
              {"type":"Text","props":{"color":"success"},"children":["worker ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["prep ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["queue ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" → "]},
              {"type":"Text","props":{"color":"success"},"children":["test ✓"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" →"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"success"},"children":["merge ✓"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-509": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-509 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 13 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-509"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (dropped)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["– dropped"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"retry","label":"Retry","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"already-merged","label":"Already merged","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"retry-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" retry"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-509": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-509 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 13 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-509"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (dropped)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["– dropped"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"retry","label":"Retry","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Retry]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"already-merged","label":"Already merged","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Already merged]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"retry-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},{"type":"Text","props":{"color":"inactive"},"children":[" retry"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-510": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-510 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 1 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-510"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (review)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["◆ answered: read it"]}]},
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"suggestion"},"children":["investigation"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"italic":true,"color":"inactive"},"children":["answered; waiting for you to read it"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"done","label":"Done","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"keep-note","label":"Keep as a note","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"ask-more","label":"Ask more","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"ask-more-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Answer (try 2)"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Type:     "]},
              {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["investigation"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" — nothing is merged"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" ask more"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-510": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-510 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 1 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-510"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (review)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"success"},"children":["◆ answered: read it"]}]},
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"suggestion"},"children":["investigation"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"italic":true,"color":"inactive"},"children":["answered; waiting for you to read it"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"done","label":"Done","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Done]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"keep-note","label":"Keep as a note","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Keep as a note]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"ask-more","label":"Ask more","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Ask more]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"ask-more-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Answer (try 2)"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Type:     "]},
              {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["investigation"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" — nothing is merged"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"report-try-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"report-try-1-key","label":"1","hotkey":"1"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"report-try-2-key","label":"2","hotkey":"2"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" ask more"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["1-2"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" a try's report"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop T-511": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"back","label":"Tasks","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-511 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 3 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-511"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["shown whole (waiting)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"warning","weight":"semibold"},"children":["? waiting for you"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"already-merged","label":"Already merged","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"drop","label":"Drop","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"needs-review","label":"☐ Needs review","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"copy","label":"Copy","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column","borderStyle":"round","borderColor":"warning","paddingX":1},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"warning","weight":"semibold"},"children":["asks: "]},
              {"type":"Text","props":{"color":"text"},"children":["it waits for your answer"]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"answer-choices","flexDirection":"column"},
            "children": [
              {
                "type": "Box",
                "props": {"key":"choice-row-1","flexDirection":"column"},
                "children": [{"type":"Button","props":{"key":"choice-1","label":"1. Allow","autoFocus":true},"press":{"plugin":"symcc"}}]
              },
              {
                "type": "Box",
                "props": {"key":"choice-row-2","flexDirection":"column"},
                "children": [{"type":"Button","props":{"key":"choice-2","label":"2. Don't allow"},"press":{"plugin":"symcc"}}]
              },
              {
                "type": "Box",
                "props": {"key":"choice-row-3","flexDirection":"column"},
                "children": [{"type":"Button","props":{"key":"choice-3","label":"3. Answer…"},"press":{"plugin":"symcc"}}]
              },
              {
                "type": "Box",
                "props": {"key":"choice-keys","display":"none"},
                "children": [
                  {"type":"Button","props":{"key":"choice-key-1","label":"Allow","hotkey":"1"},"press":{"plugin":"symcc"}},
                  {"type":"Button","props":{"key":"choice-key-2","label":"Don't allow","hotkey":"2"},"press":{"plugin":"symcc"}},
                  {"type":"Button","props":{"key":"choice-key-3","label":"Answer…","hotkey":"3"},"press":{"plugin":"symcc"}}
                ]
              }
            ]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["keys 1-3 pick a choice"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["for"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Priority: "]},
              {"type":"Text","props":{"color":"text"},"children":["0"]}
            ]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"bold":true,"color":"suggestion","weight":"semibold"},
            "children": ["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]
          },
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["y"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" copy"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["b"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" back"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal T-511": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"back","label":"Tasks","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Tasks]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["T-511 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 3 of 13 "]},
              {
                "type": "Button",
                "props": {"key":"next","label":"Next","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["›"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-title","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-511"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the task page in the editor side panel"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["wide and readable, with the full title, the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["details, the history and the latest report"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["shown whole (waiting)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"bold":true,"color":"warning"},"children":["? waiting for you"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"suggestion"},"children":["change"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"ide"},"children":["worker"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["try 2/4"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"claude"},"children":["♟ from you"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"already-merged","label":"Already merged","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Already merged]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"drop","label":"Drop","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Drop]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-1","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"needs-review","label":"☐ Needs review","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[☐ Needs review]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"copy","label":"Copy","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Copy]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"already-merged-key","label":"h","hotkey":"h"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"drop-key","label":"x","hotkey":"x"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"needs-review-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"copy-key","label":"y","hotkey":"y"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column","borderStyle":"round","borderColor":"warning","paddingX":1},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"warning"},"children":["asks: "]},
              {"type":"Text","props":{"color":"text"},"children":["it waits for your answer"]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"answer-choices","flexDirection":"column"},
            "children": [
              {
                "type": "Box",
                "props": {"key":"choice-row-1","flexDirection":"column"},
                "children": [
                  {
                    "type": "Button",
                    "props": {"key":"choice-1","label":"Allow","plain":true,"autoFocus":true},
                    "press": {"plugin":"symcc"},
                    "hover": {"inverse":true},
                    "children": [{"type":"Text","props":{"color":"text"},"children":["1. Allow"]}]
                  }
                ]
              },
              {
                "type": "Box",
                "props": {"key":"choice-row-2","flexDirection":"column"},
                "children": [
                  {
                    "type": "Button",
                    "props": {"key":"choice-2","label":"Don't allow","plain":true},
                    "press": {"plugin":"symcc"},
                    "hover": {"inverse":true},
                    "children": [{"type":"Text","props":{"color":"text"},"children":["2. Don't allow"]}]
                  }
                ]
              },
              {
                "type": "Box",
                "props": {"key":"choice-row-3","flexDirection":"column"},
                "children": [
                  {
                    "type": "Button",
                    "props": {"key":"choice-3","label":"Answer…","plain":true},
                    "press": {"plugin":"symcc"},
                    "hover": {"inverse":true},
                    "children": [{"type":"Text","props":{"color":"inactive"},"children":["3. Answer…"]}]
                  }
                ]
              },
              {
                "type": "Box",
                "props": {"key":"choice-keys","display":"none"},
                "children": [
                  {"type":"Button","props":{"key":"choice-key-1","label":"Allow","hotkey":"1"},"press":{"plugin":"symcc"}},
                  {"type":"Button","props":{"key":"choice-key-2","label":"Don't allow","hotkey":"2"},"press":{"plugin":"symcc"}},
                  {"type":"Button","props":{"key":"choice-key-3","label":"Answer…","hotkey":"3"},"press":{"plugin":"symcc"}}
                ]
              }
            ]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["keys 1-3 pick a choice"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Details"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Added:    "]},
              {"type":"Text","props":{"color":"text"},"children":["Nov 17 at 02:00 PM"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · changed Nov 18 at"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["01:59 PM"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Role:     "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["worker"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},
              {"type":"Text","props":{"color":"claude"},"children":["♟ "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["owner"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Why:      "]},
              {"type":"Text","props":{"color":"text"},"children":["the owner finds the task page in the"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["editor side panel too narrow, and its"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"text"},"children":["lines are cut at the edge"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Request:  "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["“also the task details looks to narrow"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"italic":true,"color":"text"},"children":["and cut. need an entire work on that”"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["hooks/plugin/ui/task-page.tsx"]},
              {"type":"Text","props":{"color":"subtle"},"children":[", "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["tests/"]},
              {"type":"Text","props":{"color":"subtle"},"children":[","]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Into:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["merges into: "]},
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["main"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["After:    "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-499"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"success"},"children":["✓ done"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · The first VS Code board"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["task"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-498"]},
              {"type":"Text","props":{"color":"text"},"children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["○ to do · Another task it waits"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},{"type":"Text","props":{"color":"inactive"},"children":["for"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["2"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · last: 20m · 7k tokens · all: 40m ·"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["          "]},
              {"type":"Text","props":{"color":"inactive"},"children":["11.6k tokens"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["Priority: "]},{"type":"Text","props":{"color":"text"},"children":["0"]}]
          }
        ]
      },
      "",
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","What to do"]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Goal"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": [
                  "The task page must use the full width of the panel and never" +
                    " cut a line with an ellipsis, even when the text is very lon" +
                    "g and goes on and on past the edge of the panel."
                ]
              }
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Show the **status** line first, then the title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["•"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Group the details under clear headings"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["1."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Write the test first against the old code"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"color":"claude"},"children":["2."]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["Then change "]},
              {"type":"Text","props":{"color":"ide"},"children":["hooks/plugin/ui/task-page.tsx"]}
            ]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Done when",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["the tests show it."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Timeline (2, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"success"},"children":["✓ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 2: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["fixed the headings and wrapped"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["│ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["every line to the panel width"]},
              {"type":"Text","props":{"color":"success"},"children":[" → merged into main"]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["│"]}]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"error"},"children":["✗ "]},
              {"type":"Text","props":{"color":"inactive"},"children":["worker: "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["started the change of the task"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"inactive"},"children":["page in the editor side panel"]},
              {"type":"Text","props":{"color":"error"},"children":[" → tests failed:"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["  "]},
              {"type":"Text","props":{"color":"error"},"children":["two tests did not find the new section headings"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs   2 tries · 40m · 11.6k tokens (1× the usual task)"]},
          {
            "type": "Button",
            "props": {"key":"run-0","label":"  try 1: 20m · 4.6k tokens in all · ~$0.42","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  try 1: 20m · 4.6k tokens in all · ~$0.42"]}]
          },
          {
            "type": "Button",
            "props": {"key":"run-1","label":"  ● try 2: 20m · 7k tokens in all · ~$0.80","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"color":"inactive"},"children":["  ● try 2: 20m · 7k tokens in all · ~$0.80"]}]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["  total: 40m · 11.6k tokens in all · ~$1.22"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Report · try 2 · worker"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  ",".symcc/reports/T-501-try-2.md"]},
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["# Report"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Changed the task page so that every section"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["wraps to the width of the panel instead of being"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["cut at the edge."]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 1 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 2 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 3 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 4 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 5 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 6 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 7 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 8 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 9 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 10 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 11 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 12 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 13 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["- line 14 of the long report, with enough words"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"color":"text"},"children":["  "]},{"type":"Text","props":{"color":"text"},"children":["to wrap at fifty columns"]}]
          },
          {"type":"Text","children":[" "]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["  "]},
              {"type":"Text","props":{"color":"text"},"children":["Tests: claude plugin test . passed."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"task-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["h"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" already merged"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" drop"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" needs review"]}
                ]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" on a Runs line: its report"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["y"]},{"type":"Text","props":{"color":"inactive"},"children":[" copy"]}]
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": [
                  "",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["k j"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" prev/next"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" scroll"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
}
