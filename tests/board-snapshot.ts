// Written by snapshot-format.ts (one drawn row per line, T-705). To re-capture a page, print
// `snapshotEntry(key, drawnData(await ui.drawn()))` from a short probe test and put its lines in place of that entry.
// The board panel's drawn trees for BOARD_VIEW (board-fixture.ts) on the terminal, the desktop and mobile, captured from the code
// before the VS Code layout (T-413). The VS Code work must leave these exactly as they are. They are drawn at T0, the
// fixture's fixed clock (T-401 has run 2 minutes then: "▶ 2m"), so they don't depend on when the tests run (T-437).
// T-751: the task page ("terminal task", "desktop task", "mobile task") starts with the 4-line page header and its heavy rule.
// T-775: every header button "[Label]" in one style, Back "‹ [Tasks]".
export const BEFORE: Record<string, unknown> = {
  "terminal 50": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {"type":"Text","props":{"bold":true,"color":"text"},"children":["NEEDS YOU"]},
      {
        "type": "Button",
        "props": {"key":"T-420","label":"T-420 ◆ answer   Research how other…   [investiga…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-420"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ answer   "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Research how other…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   [investiga…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-403","label":"T-403 ◆ review   Make the settings p…  Enter to r…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-403"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ review   "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the settings p…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Enter to r…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-404","label":"T-404 ? waiting  Pick the colors for…   Yellow or…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-404"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ? waiting  "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Pick the colors for…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   Yellow or…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-405","label":"T-405 ✗ failed   Rename the scouts p…   The tests…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-405"]},
          {"type":"Text","props":{"color":"error"},"children":[" ✗ failed   "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Rename the scouts p…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   The tests…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"T-402","label":"T-402 ▶          Keep the search box open while t…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-402"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Keep the search box open while t…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-401","label":"T-401 ▶ 2m       Show the plugin version…   [docs]","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-401"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶ 2m       "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show the plugin version…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   [docs]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-406","label":"T-406 ○          Write the guide section about ad…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-406"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Write the guide section about ad…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-407","label":"T-407 ○          Let the lead read t…   waits for…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-407"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Let the lead read t…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   waits for…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-408","label":"T-408 ○          Add a short CHANGELOG line for e…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-408"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Add a short CHANGELOG line for e…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-410","label":"T-410 ○          Show which branch a task merges…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-410"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show which branch a task merges…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-419","label":"T-419 ○          Clean up the old stage engine na…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-419"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Clean up the old stage engine na…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-409","label":"T-409 ‖ paused   Stop a worker that runs past its…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-409"]},
          {"type":"Text","props":{"color":"permission"},"children":[" ‖ paused   "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Stop a worker that runs past its…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:backlog","label":"▸ Backlog  3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Backlog  3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:done","label":"▸ Done     3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Done     3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"text"},"children":["⏵ auto"]}," "]},
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},{"type":"Text","props":{"color":"inactive"},"children":[" open"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},{"type":"Text","props":{"color":"inactive"},"children":[" move"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal 90": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45 min"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 retries"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 failed"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 paused"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["5 to do"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 in b"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]: Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide"},"children":["[t]: Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]: Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]: Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]: Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]: Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]: Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]: Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate","color":"ide"},
        "children": ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
      },
      {"type":"Text","props":{"bold":true,"color":"text"},"children":["NEEDS YOU"]},
      {
        "type": "Button",
        "props": {"key":"T-420","label":"T-420 ◆ answer   Research how other tools draw a task board in an editor…  [investigation]","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-420"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ answer   "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Research how other tools draw a task board in an editor…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  [investigation]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-403","label":"T-403 ◆ review   Make the settings page show every group with its own sh…  Enter to review","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-403"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ review   "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Make the settings page show every group with its own sh…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Enter to review"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-404","label":"T-404 ? waiting  Pick the colors for the review mark on light…  Yellow or blue for review?","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-404"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ? waiting  "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Pick the colors for the review mark on light…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Yellow or blue for review?"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-405","label":"T-405 ✗ failed   Rename the scouts page heading and move its buttons u…  The tests failed.","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-405"]},
          {"type":"Text","props":{"color":"error"},"children":[" ✗ failed   "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Rename the scouts page heading and move its buttons u…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  The tests failed."]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"T-402","label":"T-402 ▶          Keep the search box open while typing several words in a row","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-402"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Keep the search box open while typing several words in a row"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-401","label":"T-401 ▶ 2m       Show the plugin version in the board title and the band above th…  [docs]","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-401"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶ 2m       "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show the plugin version in the board title and the band above th…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  [docs]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-406","label":"T-406 ○          Write the guide section about adding a new scout from the board panel","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-406"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Write the guide section about adding a new scout from the board panel"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-407","label":"T-407 ○          Let the lead read the archived tasks when the owner ask…  waits for T-406","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-407"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Let the lead read the archived tasks when the owner ask…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  waits for T-406"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-408","label":"T-408 ○          Add a short CHANGELOG line for every merged task automatically","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-408"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Add a short CHANGELOG line for every merged task automatically"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-410","label":"T-410 ○          Show which branch a task merges into when it is not the current one","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-410"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show which branch a task merges into when it is not the current one"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-419","label":"T-419 ○          Clean up the old stage engine names left in the comments of the hooks","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-419"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Clean up the old stage engine names left in the comments of the hooks"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-409","label":"T-409 ‖ paused   Stop a worker that runs past its time limit and ask the owner first","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["T-409"]},
          {"type":"Text","props":{"color":"permission"},"children":[" ‖ paused   "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Stop a worker that runs past its time limit and ask the owner first"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:backlog","label":"▸ Backlog  3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Backlog  3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:done","label":"▸ Done     3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Done     3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"wrap":"truncate","color":"subtle"},
            "children": ["──────────────────────────────────────────────────────────────────────────────────────────"]
          },
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"text"},"children":["⏵ auto"]}," "]},
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},{"type":"Text","props":{"color":"inactive"},"children":[" open"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},{"type":"Text","props":{"color":"inactive"},"children":[" move"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop 50": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["NEEDS YOU"]},
      {
        "type": "Button",
        "props": {"key":"T-420","label":"T-420 ◆ answer   Research how other…   [investiga…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-420"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ answer   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Research how other…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   [investiga…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-403","label":"T-403 ◆ review   Make the settings p…  Enter to r…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-403"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ review   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the settings p…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Enter to r…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-404","label":"T-404 ? waiting  Pick the colors for…   Yellow or…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-404"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ? waiting  "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Pick the colors for…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   Yellow or…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-405","label":"T-405 ✗ failed   Rename the scouts p…   The tests…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-405"]},
          {"type":"Text","props":{"color":"error"},"children":[" ✗ failed   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Rename the scouts p…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   The tests…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"T-402","label":"T-402 ▶          Keep the search box open while t…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-402"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Keep the search box open while t…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-401","label":"T-401 ▶ 2m       Show the plugin version…   [docs]","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-401"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶ 2m       "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show the plugin version…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   [docs]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-406","label":"T-406 ○          Write the guide section about ad…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-406"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Write the guide section about ad…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-407","label":"T-407 ○          Let the lead read t…   waits for…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-407"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Let the lead read t…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   waits for…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-408","label":"T-408 ○          Add a short CHANGELOG line for e…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-408"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Add a short CHANGELOG line for e…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-410","label":"T-410 ○          Show which branch a task merges…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-410"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show which branch a task merges…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-419","label":"T-419 ○          Clean up the old stage engine na…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-419"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Clean up the old stage engine na…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-409","label":"T-409 ‖ paused   Stop a worker that runs past its…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-409"]},
          {"type":"Text","props":{"color":"permission"},"children":[" ‖ paused   "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Stop a worker that runs past its…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:backlog","label":"▸ Backlog  3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Backlog  3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:done","label":"▸ Done     3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Done     3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {
                "type": "Text",
                "props": {"wrap":"truncate"},
                "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["⏵ auto"]}," "]
              },
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop 90": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45 min"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 retries"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 failed"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 paused"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["5 to do"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 in b"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]: Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[t]: Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]: Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]: Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]: Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]: Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]: Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]: Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate","color":"ide"},
        "children": ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
      },
      {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["NEEDS YOU"]},
      {
        "type": "Button",
        "props": {"key":"T-420","label":"T-420 ◆ answer   Research how other tools draw a task board in an editor…  [investigation]","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-420"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ answer   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Research how other tools draw a task board in an editor…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  [investigation]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-403","label":"T-403 ◆ review   Make the settings page show every group with its own sh…  Enter to review","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-403"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ review   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the settings page show every group with its own sh…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Enter to review"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-404","label":"T-404 ? waiting  Pick the colors for the review mark on light…  Yellow or blue for review?","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-404"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ? waiting  "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Pick the colors for the review mark on light…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Yellow or blue for review?"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-405","label":"T-405 ✗ failed   Rename the scouts page heading and move its buttons u…  The tests failed.","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-405"]},
          {"type":"Text","props":{"color":"error"},"children":[" ✗ failed   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Rename the scouts page heading and move its buttons u…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  The tests failed."]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"T-402","label":"T-402 ▶          Keep the search box open while typing several words in a row","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-402"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Keep the search box open while typing several words in a row"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-401","label":"T-401 ▶ 2m       Show the plugin version in the board title and the band above th…  [docs]","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-401"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶ 2m       "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show the plugin version in the board title and the band above th…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  [docs]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-406","label":"T-406 ○          Write the guide section about adding a new scout from the board panel","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-406"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Write the guide section about adding a new scout from the board panel"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-407","label":"T-407 ○          Let the lead read the archived tasks when the owner ask…  waits for T-406","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-407"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Let the lead read the archived tasks when the owner ask…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  waits for T-406"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-408","label":"T-408 ○          Add a short CHANGELOG line for every merged task automatically","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-408"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Add a short CHANGELOG line for every merged task automatically"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-410","label":"T-410 ○          Show which branch a task merges into when it is not the current one","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-410"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show which branch a task merges into when it is not the current one"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-419","label":"T-419 ○          Clean up the old stage engine names left in the comments of the hooks","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-419"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Clean up the old stage engine names left in the comments of the hooks"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-409","label":"T-409 ‖ paused   Stop a worker that runs past its time limit and ask the owner first","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-409"]},
          {"type":"Text","props":{"color":"permission"},"children":[" ‖ paused   "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Stop a worker that runs past its time limit and ask the owner first"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:backlog","label":"▸ Backlog  3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Backlog  3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:done","label":"▸ Done     3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Done     3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"wrap":"truncate","color":"subtle"},
            "children": ["──────────────────────────────────────────────────────────────────────────────────────────"]
          },
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {
                "type": "Text",
                "props": {"wrap":"truncate"},
                "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["⏵ auto"]}," "]
              },
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal task": {
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
              {"type":"Text","props":{"color":"inactive"},"children":["T-405 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 4 of 20 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"error"},"children":["T-405"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Rename the scouts page heading and move its"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["buttons under the list"]}
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
                  {"type":"Text","props":{"color":"ide"},"children":["general"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"italic":true,"color":"inactive"},"children":["tests failed"]}
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
              {"type":"Text","children":["   "]},
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
              {"type":"Button","props":{"key":"retry-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
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
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]}]
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
              {"type":"Text","props":{"color":"text"},"children":["Nov 18 at 01:00 PM"]},
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
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["general"]}
            ]
          },
          {
            "type": "Text",
            "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["From:     "]},{"type":"Text","props":{"color":"inactive"},"children":["unknown"]}]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"inactive"},"children":["anywhere in the project"]}
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
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["0"]}
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
          {"type":"Text","props":{"color":"inactive"},"children":["(no details)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","History (1, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["● "]},
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tests failed"]}
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
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["x"]},{"type":"Text","props":{"color":"inactive"},"children":[" drop"]}]
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
  "terminal scouts": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"scout-new","label":"+ New scout","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New scout"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"scout:tests","label":"tests: waiting","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tests"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  every 30 min"]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":["  never ran"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"scouts-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"scouts-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},{"type":"Text","props":{"color":"inactive"},"children":[" open"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},{"type":"Text","props":{"color":"inactive"},"children":[" move"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
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
  "terminal settings": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▸ Work · auto · 3 at once · 45 min · 2 retries","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["▸ Work"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · auto · 3 at once · 45 min · 2 retries"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▸ Checks before merging · 2 test commands · tes…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["▸ Checks before merging"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · 2 test commands · tes…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▸ Workers · 0 roles · 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["▸ Workers"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · 0 roles · 6 kinds"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▸ Scouts · findings: auto","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["▸ Scouts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · findings: auto"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▸ Board and alerts · notify voice · open on sta…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["▸ Board and alerts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · notify voice · open on sta…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Text",
        "props": {"color":"inactive"},
        "children": [
          "Enter on a heading opens or closes its group · Enter changes a setting (on/off flips) or opens a page · /",
          "symcc",
          "-settings NAME VALUE · or tell the lead"
        ]
      },
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"settings-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"settings-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" change"]}
                ]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},{"type":"Text","props":{"color":"inactive"},"children":[" move"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
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
  "desktop task": {
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
              {"type":"Text","props":{"color":"inactive"},"children":["T-405 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 4 of 20 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["T-405"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Rename the scouts page heading and move its"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["buttons under the list"]}
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
                  {"type":"Text","props":{"color":"ide"},"children":["general"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"italic":true,"color":"inactive"},"children":["tests failed"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"retry","label":"Retry","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"stash","label":"Stash to backlog","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
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
              {"type":"Button","props":{"key":"retry-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
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
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]}]
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
              {"type":"Text","props":{"color":"text"},"children":["Nov 18 at 01:00 PM"]},
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
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["general"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["unknown"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"inactive"},"children":["anywhere in the project"]}
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
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["0"]}
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
          {"type":"Text","props":{"color":"inactive"},"children":["(no details)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","History (1, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["● "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tests failed"]}
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
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
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
  "desktop scouts": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"scout-new","label":"+ New scout","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New scout"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"scout:tests","label":"tests: waiting","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  every 30 min"]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":["  never ran"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"scouts-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"scouts-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
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
  "desktop settings": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▸ Work · auto · 3 at once · 45 min · 2 retries","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Work"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · auto · 3 at once · 45 min · 2 retries"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▸ Checks before merging · 2 test commands · tes…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Checks before merging"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · 2 test commands · tes…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▸ Workers · 0 roles · 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Workers"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · 0 roles · 6 kinds"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▸ Scouts · findings: auto","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Scouts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · findings: auto"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▸ Board and alerts · notify voice · open on sta…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Board and alerts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · notify voice · open on sta…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Text",
        "props": {"color":"inactive"},
        "children": [
          "Enter on a heading opens or closes its group · Enter changes a setting (on/off flips) or opens a page · /",
          "symcc",
          "-settings NAME VALUE · or tell the lead"
        ]
      },
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"settings-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"settings-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" change"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
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
  "mobile 50": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["NEEDS YOU"]},
      {
        "type": "Button",
        "props": {"key":"T-420","label":"T-420 ◆ answer   Research how other…   [investiga…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-420"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ answer   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Research how other…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   [investiga…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-403","label":"T-403 ◆ review   Make the settings p…  Enter to r…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-403"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ review   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the settings p…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Enter to r…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-404","label":"T-404 ? waiting  Pick the colors for…   Yellow or…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-404"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ? waiting  "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Pick the colors for…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   Yellow or…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-405","label":"T-405 ✗ failed   Rename the scouts p…   The tests…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-405"]},
          {"type":"Text","props":{"color":"error"},"children":[" ✗ failed   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Rename the scouts p…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   The tests…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"T-402","label":"T-402 ▶          Keep the search box open while t…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-402"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Keep the search box open while t…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-401","label":"T-401 ▶ 2m       Show the plugin version…   [docs]","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-401"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶ 2m       "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show the plugin version…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   [docs]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-406","label":"T-406 ○          Write the guide section about ad…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-406"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Write the guide section about ad…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-407","label":"T-407 ○          Let the lead read t…   waits for…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-407"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Let the lead read t…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["   waits for…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-408","label":"T-408 ○          Add a short CHANGELOG line for e…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-408"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Add a short CHANGELOG line for e…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-410","label":"T-410 ○          Show which branch a task merges…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-410"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show which branch a task merges…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-419","label":"T-419 ○          Clean up the old stage engine na…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-419"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Clean up the old stage engine na…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-409","label":"T-409 ‖ paused   Stop a worker that runs past its…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-409"]},
          {"type":"Text","props":{"color":"permission"},"children":[" ‖ paused   "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Stop a worker that runs past its…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:backlog","label":"▸ Backlog  3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Backlog  3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:done","label":"▸ Done     3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Done     3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {
                "type": "Text",
                "props": {"wrap":"truncate"},
                "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["⏵ auto"]}," "]
              },
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "mobile 90": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45 min"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 retries"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 failed"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 paused"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["5 to do"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 in b"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]: Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[t]: Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]: Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]: Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]: Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]: Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]: Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]: Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate","color":"ide"},
        "children": ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
      },
      {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["NEEDS YOU"]},
      {
        "type": "Button",
        "props": {"key":"T-420","label":"T-420 ◆ answer   Research how other tools draw a task board in an editor…  [investigation]","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-420"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ answer   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Research how other tools draw a task board in an editor…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  [investigation]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-403","label":"T-403 ◆ review   Make the settings page show every group with its own sh…  Enter to review","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-403"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ◆ review   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Make the settings page show every group with its own sh…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Enter to review"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-404","label":"T-404 ? waiting  Pick the colors for the review mark on light…  Yellow or blue for review?","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-404"]},
          {"type":"Text","props":{"color":"warning"},"children":[" ? waiting  "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Pick the colors for the review mark on light…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  Yellow or blue for review?"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-405","label":"T-405 ✗ failed   Rename the scouts page heading and move its buttons u…  The tests failed.","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-405"]},
          {"type":"Text","props":{"color":"error"},"children":[" ✗ failed   "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Rename the scouts page heading and move its buttons u…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  The tests failed."]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"T-402","label":"T-402 ▶          Keep the search box open while typing several words in a row","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-402"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Keep the search box open while typing several words in a row"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-401","label":"T-401 ▶ 2m       Show the plugin version in the board title and the band above th…  [docs]","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-401"]},
          {"type":"Text","props":{"color":"ide"},"children":[" ▶ 2m       "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show the plugin version in the board title and the band above th…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  [docs]"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-406","label":"T-406 ○          Write the guide section about adding a new scout from the board panel","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-406"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Write the guide section about adding a new scout from the board panel"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-407","label":"T-407 ○          Let the lead read the archived tasks when the owner ask…  waits for T-406","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-407"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Let the lead read the archived tasks when the owner ask…"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  waits for T-406"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-408","label":"T-408 ○          Add a short CHANGELOG line for every merged task automatically","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-408"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Add a short CHANGELOG line for every merged task automatically"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-410","label":"T-410 ○          Show which branch a task merges into when it is not the current one","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-410"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Show which branch a task merges into when it is not the current one"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-419","label":"T-419 ○          Clean up the old stage engine names left in the comments of the hooks","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-419"]},
          {"type":"Text","props":{"color":"text"},"children":[" ○          "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Clean up the old stage engine names left in the comments of the hooks"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"T-409","label":"T-409 ‖ paused   Stop a worker that runs past its time limit and ask the owner first","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["T-409"]},
          {"type":"Text","props":{"color":"permission"},"children":[" ‖ paused   "]},
          {"type":"Text","props":{"bold":false,"color":"text"},"children":["Stop a worker that runs past its time limit and ask the owner first"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:backlog","label":"▸ Backlog  3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Backlog  3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:done","label":"▸ Done     3","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Done     3"]}]
      },
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"wrap":"truncate","color":"subtle"},
            "children": ["──────────────────────────────────────────────────────────────────────────────────────────"]
          },
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {
                "type": "Text",
                "props": {"wrap":"truncate"},
                "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["⏵ auto"]}," "]
              },
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "mobile task": {
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
              {"type":"Text","props":{"color":"inactive"},"children":["T-405 · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 4 of 20 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"error","weight":"semibold"},"children":["T-405"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Rename the scouts page heading and move its"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["       "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["buttons under the list"]}
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
                  {"type":"Text","props":{"color":"ide"},"children":["general"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"italic":true,"color":"inactive"},"children":["tests failed"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"retry","label":"Retry","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"stash","label":"Stash to backlog","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
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
              {"type":"Button","props":{"key":"retry-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
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
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]}]
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
              {"type":"Text","props":{"color":"text"},"children":["Nov 18 at 01:00 PM"]},
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
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["general"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["From:     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["unknown"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Files:    "]},
              {"type":"Text","props":{"color":"inactive"},"children":["anywhere in the project"]}
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
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Tries:    "]},
              {"type":"Text","props":{"bold":false,"color":"text"},"children":["0"]}
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
          {"type":"Text","props":{"color":"inactive"},"children":["(no details)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","History (1, newest first)"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["● "]},
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["try 1: "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tests failed"]}
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
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["x"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" drop"]}
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
  "mobile scouts": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"scout-new","label":"+ New scout","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New scout"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"scout:tests","label":"tests: waiting","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  every 30 min"]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":["  never ran"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"scouts-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"scouts-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
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
  "mobile settings": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["2 doing"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 ready for review"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["1 waiting for you"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" "]},
          {"type":"Text","props":{"color":"subtle"},"children":["…"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[c]Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▸ Work · auto · 3 at once · 45 min · 2 retries","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Work"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · auto · 3 at once · 45 min · 2 retries"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▸ Checks before merging · 2 test commands · tes…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Checks before merging"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · 2 test commands · tes…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▸ Workers · 0 roles · 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Workers"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · 0 roles · 6 kinds"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▸ Scouts · findings: auto","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Scouts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · findings: auto"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▸ Board and alerts · notify voice · open on sta…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Board and alerts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · notify voice · open on sta…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Text",
        "props": {"color":"inactive"},
        "children": [
          "Enter on a heading opens or closes its group · Enter changes a setting (on/off flips) or opens a page · /",
          "symcc",
          "-settings NAME VALUE · or tell the lead"
        ]
      },
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"settings-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"settings-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Enter"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" change"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
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
}

// The same panel for a board with only dropped tasks (BOARD_TASKS' two, nothing run), captured from the code before T-442:
// its banner ends with an empty counts line, which must stay.
export const BEFORE_DROPPED: Record<string, unknown> = {
  "terminal 50": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide"},"children":["  ┗┛    "]}]},
      {"type":"Text","props":{"wrap":"truncate"}},
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t] Tasks (2)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide"},"children":["[t] Tasks (2)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l] Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l] Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s] Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s] Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c] Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c] Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["All clear. Nothing running or waiting."]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["Tell the lead what you want next."]},
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"text"},"children":["⏵ auto"]}," "]},
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},{"type":"Text","props":{"color":"inactive"},"children":[" open"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},{"type":"Text","props":{"color":"inactive"},"children":[" move"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "terminal 90": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45 min"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 retries"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide"},"children":["  ┗┛    "]}]},
      {"type":"Text","props":{"wrap":"truncate"}},
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]: Tasks (2)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide"},"children":["[t]: Tasks (2)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]: Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]: Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]: Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]: Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]: Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]: Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate","color":"ide"},
        "children": ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["All clear. Nothing running or waiting."]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["Tell the lead what you want next."]},
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"wrap":"truncate","color":"subtle"},
            "children": ["──────────────────────────────────────────────────────────────────────────────────────────"]
          },
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"text"},"children":["⏵ auto"]}," "]},
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["Enter"]},{"type":"Text","props":{"color":"inactive"},"children":[" open"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["↑↓"]},{"type":"Text","props":{"color":"inactive"},"children":[" move"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop 50": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {"type":"Text","props":{"wrap":"truncate"}},
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t] Tasks (2)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[t] Tasks (2)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l] Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l] Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s] Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s] Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c] Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c] Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["All clear. Nothing running or waiting."]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["Tell the lead what you want next."]},
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {
                "type": "Text",
                "props": {"wrap":"truncate"},
                "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["⏵ auto"]}," "]
              },
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop 90": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45 min"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 retries"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {"type":"Text","props":{"wrap":"truncate"}},
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]: Tasks (2)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[t]: Tasks (2)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]: Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]: Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]: Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]: Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]: Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]: Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate","color":"ide"},
        "children": ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["All clear. Nothing running or waiting."]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["Tell the lead what you want next."]},
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"wrap":"truncate","color":"subtle"},
            "children": ["──────────────────────────────────────────────────────────────────────────────────────────"]
          },
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {
                "type": "Text",
                "props": {"wrap":"truncate"},
                "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["⏵ auto"]}," "]
              },
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "mobile 50": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45"]},
          {"type":"Text","props":{"color":"inactive"},"children":["…"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {"type":"Text","props":{"wrap":"truncate"}},
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t] Tasks (2)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[t] Tasks (2)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l] Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l] Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s] Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s] Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c] Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c] Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["All clear. Nothing running or waiting."]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["Tell the lead what you want next."]},
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {
                "type": "Text",
                "props": {"wrap":"truncate"},
                "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["⏵ auto"]}," "]
              },
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "mobile 90": {
    "type": "Box",
    "props": {"flexDirection":"column"},
    "children": [
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["   ┏┓   "]},
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["symcc board"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · proj"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┏━╋┛   "]},
          {"type":"Text","props":{"color":"inactive"},"children":["/proj"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["main"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["this session drives"]}
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":[" ┗━╋━┛  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["tests: claude, typecheck"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["3 at once"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["45 min"]},
          {"type":"Text","props":{"color":"subtle"},"children":[" · "]},
          {"type":"Text","props":{"color":"inactive"},"children":["2 retries"]}
        ]
      },
      {"type":"Text","props":{"wrap":"truncate"},"children":[{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  ┗┛    "]}]},
      {"type":"Text","props":{"wrap":"truncate"}},
      {
        "type": "Box",
        "props": {"key":"tabs","flexDirection":"row"},
        "children": [
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]: Tasks (2)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[t]: Tasks (2)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-live","label":"[l]: Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]: Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]: Scouts (1)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]: Scouts (1)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":[" │ "]},
          {
            "type": "Button",
            "props": {"key":"tab-settings","label":"[c]: Settings","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[c]: Settings"]}]
          },
          {
            "type": "Box",
            "props": {"key":"tab-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Text",
        "props": {"wrap":"truncate","color":"ide"},
        "children": ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["All clear. Nothing running or waiting."]},
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["Tell the lead what you want next."]},
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"day:dropped","label":"▸ Dropped  2","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["","▸ Dropped  2"]}]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Box",
        "props": {"key":"list-hint-footer","flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "props": {"wrap":"truncate","color":"subtle"},
            "children": ["──────────────────────────────────────────────────────────────────────────────────────────"]
          },
          {
            "type": "Box",
            "props": {"key":"footer-mode","flexDirection":"row"},
            "children": [
              {
                "type": "Text",
                "props": {"wrap":"truncate"},
                "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["⏵ auto"]}," "]
              },
              {"type":"Button","props":{"key":"mode","label":"[m] review merge","hotkey":"m","dimColor":true},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["  "]},
              {"type":"Button","props":{"key":"search-open","label":"[f] search","hotkey":"f","dimColor":true},"press":{"plugin":"symcc"}}
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" open"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["↑↓"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" move"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["t l s c"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" views"]}
                ]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
}
