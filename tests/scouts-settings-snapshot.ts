// Written by snapshot-format.ts (one drawn row per line, T-705). To re-capture a page, print
// `snapshotEntry(key, drawnData(await ui.drawn()))` from a short probe test and put its lines in place of that entry.
// The Scouts and Settings pages' drawn trees for the scenes of scouts-settings-scenes.ts on the terminal, the desktop
// and mobile, captured from the code before the VS Code Scouts and Settings pages (T-415). That work must leave these
// exactly as they are (compared exactly in vscode-scouts-settings.test.tsx; the scouts' times come from the fixed clock T0).
// T-516 took the "Last report" section off the scout pages (a Runs section with "(no runs yet)" in its place).
// T-619 added the Org-mem row under Workers (after Kinds) on the Settings pages; T-687 took it out again (org-mem moved to the Live tab).
// T-650 added the sound_set row under Board and alerts (after notify) on the Settings pages; T-695 took it out again
// (notify holds the sound set: voice / sound 1 / sound 2 / sound 3 / off).
// T-686 took the instructions' first line off the scout pages' header (a scout without a summary shows none).
// T-751 gave the scout pages the 4-line page header (‹ Scouts and its place, name and summary, state, buttons) and its heavy rule.
// T-775 drew every header button "[Label]" in one style, and Back "‹ [Scouts]".
export const SCOUTS_SETTINGS_BEFORE: Record<string, unknown> = {
  "terminal scouts list": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
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
        "props": {"key":"scout:dependency-updates","label":"dependency-updates: running now…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"ide"},"children":["  ◉ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["dependency-updates"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"ide"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:security-advisories-for-node-packages","label":"security-advisories-for-node-packages: next in 3h 00m","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["security-advisories-for-node-packages"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:broken","label":"broken: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["broken"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:on-demand-check","label":"on-demand-check: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["on-demand-check"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:docs-drift","label":"docs-drift: paused","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["  ○ "]},
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["docs-drift"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["l t s c"]},
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
  "desktop scouts list": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
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
        "props": {"key":"scout:dependency-updates","label":"dependency-updates: running now…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"ide"},"children":["  ◉ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["dependency-updates"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"ide"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:security-advisories-for-node-packages","label":"security-advisories-for-node-packages: next in 3h 00m","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["security-advisories-for-node-packages"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:broken","label":"broken: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["broken"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:on-demand-check","label":"on-demand-check: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["on-demand-check"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:docs-drift","label":"docs-drift: paused","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["  ○ "]},
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["docs-drift"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "mobile scouts list": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
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
        "props": {"key":"scout:dependency-updates","label":"dependency-updates: running now…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"ide"},"children":["  ◉ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["dependency-updates"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"ide"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:security-advisories-for-node-packages","label":"security-advisories-for-node-packages: next in 3h 00m","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["security-advisories-for-node-packages"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:broken","label":"broken: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["broken"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:on-demand-check","label":"on-demand-check: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["on-demand-check"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:docs-drift","label":"docs-drift: paused","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["  ○ "]},
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["docs-drift"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "terminal scouts new": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Input",
            "props": {"key":"scout-new-name","label":"New scout's name","placeholder":"letters, digits, - and _","value":"","submitLabel":"next","autoFocus":true},
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"scout-new-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter goes on · Enter on empty cancels"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"scout:dependency-updates","label":"dependency-updates: running now…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"ide"},"children":["  ◉ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["dependency-updates"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"ide"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:security-advisories-for-node-packages","label":"security-advisories-for-node-packages: next in 3h 00m","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["security-advisories-for-node-packages"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:broken","label":"broken: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["broken"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:on-demand-check","label":"on-demand-check: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["on-demand-check"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:docs-drift","label":"docs-drift: paused","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["  ○ "]},
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["docs-drift"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["l t s c"]},
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
  "desktop scouts new": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Input",
            "props": {"key":"scout-new-name","label":"New scout's name","placeholder":"letters, digits, - and _","value":"","submitLabel":"next","autoFocus":true},
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"scout-new-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter goes on · Enter on empty cancels"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"scout:dependency-updates","label":"dependency-updates: running now…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"ide"},"children":["  ◉ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["dependency-updates"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"ide"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:security-advisories-for-node-packages","label":"security-advisories-for-node-packages: next in 3h 00m","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["security-advisories-for-node-packages"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:broken","label":"broken: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["broken"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:on-demand-check","label":"on-demand-check: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["on-demand-check"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:docs-drift","label":"docs-drift: paused","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["  ○ "]},
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["docs-drift"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "mobile scouts new": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"underline":true,"color":"ide","weight":"semibold"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Input",
            "props": {"key":"scout-new-name","label":"New scout's name","placeholder":"letters, digits, - and _","value":"","submitLabel":"next","autoFocus":true},
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"scout-new-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter goes on · Enter on empty cancels"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"scout:dependency-updates","label":"dependency-updates: running now…","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"ide"},"children":["  ◉ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["dependency-updates"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"ide"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:security-advisories-for-node-packages","label":"security-advisories-for-node-packages: next in 3h 00m","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["security-advisories-for-node-packages"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:broken","label":"broken: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["broken"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"warning"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:on-demand-check","label":"on-demand-check: waiting","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"text"},"children":["  ◎ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["on-demand-check"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"text"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"scout:docs-drift","label":"docs-drift: paused","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"color":"inactive"},"children":["  ○ "]},
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["docs-drift"]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
          {"type":"Text","props":{"color":"inactive"},"children":[""]},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "terminal scout dependency-updates": {
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
                "props": {"key":"scout-back","label":"Scouts","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Scouts]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["         "]},
              {"type":"Text","props":{"color":"inactive"},"children":["dependency-updates · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 1 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["dependency-updates"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Looks for packages with a"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["newer version and says which"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["ones are safe to update today"]}
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
                  {"type":"Text","props":{"bold":true,"color":"ide"},"children":["◉ running now"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"text"},"children":["every 30 min"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["haiku"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["last ran 40m ago"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"scout-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-pause","label":"Pause","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Pause]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["Look at "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["package.json"]},
              {"type":"Text","props":{"color":"text"},"children":[" and the lock file."]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["Say which packages have a newer version."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/dependency-updates.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["e"]},{"type":"Text","props":{"color":"inactive"},"children":[" edit"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},{"type":"Text","props":{"color":"inactive"},"children":[" pause"]}]
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
              }
            ]
          },
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop scout dependency-updates": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["         "]},
              {"type":"Text","props":{"color":"inactive"},"children":["dependency-updates · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 1 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["dependency-updates"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Looks for packages with a"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["newer version and says which"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["ones are safe to update today"]}
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
                  {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["◉ running now"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"text"},"children":["every 30 min"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["haiku"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["last ran 40m ago"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["Look at "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["package.json"]},
              {"type":"Text","props":{"color":"text"},"children":[" and the lock file."]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["Say which packages have a newer version."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/dependency-updates.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
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
  "mobile scout dependency-updates": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["         "]},
              {"type":"Text","props":{"color":"inactive"},"children":["dependency-updates · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 1 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["dependency-updates"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Looks for packages with a"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["newer version and says which"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["ones are safe to update today"]}
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
                  {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["◉ running now"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"text"},"children":["every 30 min"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["haiku"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["last ran 40m ago"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["Look at "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["package.json"]},
              {"type":"Text","props":{"color":"text"},"children":[" and the lock file."]}
            ]
          },
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["Say which packages have a newer version."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/dependency-updates.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
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
  "terminal scout security-advisories-for-node-packages": {
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
                "props": {"key":"scout-back","label":"Scouts","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Scouts]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                              "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 2 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["security-advisories-for-node-packages"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ every day"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["next in 3h 00m"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["last ran 21h 00m ago"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"scout-run","label":"Run now","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Run now]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-pause","label":"Pause","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Pause]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": ["Check the security advisories for every package the project uses, and say which ones need a fix soon."]
              }
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/security-advisories-for-node-packages.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},{"type":"Text","props":{"color":"inactive"},"children":[" run now"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["e"]},{"type":"Text","props":{"color":"inactive"},"children":[" edit"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},{"type":"Text","props":{"color":"inactive"},"children":[" pause"]}]
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
  "desktop scout security-advisories-for-node-packages": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                              "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 2 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["security-advisories-for-node-packages"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ every day"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["next in 3h 00m"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["last ran 21h 00m ago"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-run","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": ["Check the security advisories for every package the project uses, and say which ones need a fix soon."]
              }
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/security-advisories-for-node-packages.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
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
  "mobile scout security-advisories-for-node-packages": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                              "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 2 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["security-advisories-for-node-packages"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ every day"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" · "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["next in 3h 00m"]}
                ]
              },
              {"type":"Text","children":[{"type":"Text","props":{"color":"inactive"},"children":["last ran 21h 00m ago"]}]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-run","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {
                "type": "Text",
                "props": {"color":"text"},
                "children": ["Check the security advisories for every package the project uses, and say which ones need a fix soon."]
              }
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/security-advisories-for-node-packages.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
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
  "terminal scout docs-drift": {
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
                "props": {"key":"scout-back","label":"Scouts","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Scouts]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                 "]},
              {"type":"Text","props":{"color":"inactive"},"children":["docs-drift · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 5 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["docs-drift"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["Finds places where the guide no longer"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["            "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["matches what the code does"]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ every hour"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["last ran 1h 30m ago"]}
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
                "props": {"key":"scout-run","label":"Run now","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Run now]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-pause","label":"Resume","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Resume]"]}]
              },
              {"type":"Text","children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["⏸ paused"]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["Compare "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]},
              {"type":"Text","props":{"color":"text"},"children":[" with the code."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/docs-drift.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},{"type":"Text","props":{"color":"inactive"},"children":[" run now"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["e"]},{"type":"Text","props":{"color":"inactive"},"children":[" edit"]}]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" resume"]}
                ]
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
  "desktop scout docs-drift": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                 "]},
              {"type":"Text","props":{"color":"inactive"},"children":["docs-drift · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 5 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["docs-drift"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Finds places where the guide no longer"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["            "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["matches what the code does"]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ every hour"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["last ran 1h 30m ago"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-run","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Resume","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["⏸ paused"]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["Compare "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]},
              {"type":"Text","props":{"color":"text"},"children":[" with the code."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/docs-drift.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" resume"]}
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
  "mobile scout docs-drift": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                 "]},
              {"type":"Text","props":{"color":"inactive"},"children":["docs-drift · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 5 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["docs-drift"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Finds places where the guide no longer"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["            "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["matches what the code does"]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ every hour"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["last ran 1h 30m ago"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-run","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Resume","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Text","props":{"color":"inactive"},"children":["⏸ paused"]}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"color":"text"},"children":["Compare "]},
              {"type":"Text","props":{"color":"autoAccept"},"children":["docs/guide.md"]},
              {"type":"Text","props":{"color":"text"},"children":[" with the code."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/docs-drift.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" resume"]}
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
  "terminal scout on-demand-check": {
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
                "props": {"key":"scout-back","label":"Scouts","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Scouts]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["            "]},
              {"type":"Text","props":{"color":"inactive"},"children":["on-demand-check · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 4 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["on-demand-check"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ on demand"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["never ran"]}
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
                "props": {"key":"scout-run","label":"Run now","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Run now]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-pause","label":"Pause","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Pause]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text"},"children":["Run only when asked",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["look for files nobody has changed in a year."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/on-demand-check.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},{"type":"Text","props":{"color":"inactive"},"children":[" run now"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["e"]},{"type":"Text","props":{"color":"inactive"},"children":[" edit"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},{"type":"Text","props":{"color":"inactive"},"children":[" pause"]}]
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
  "desktop scout on-demand-check": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["            "]},
              {"type":"Text","props":{"color":"inactive"},"children":["on-demand-check · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 4 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["on-demand-check"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ on demand"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["never ran"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-run","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Run only when asked",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["look for files nobody has changed in a year."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/on-demand-check.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
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
  "mobile scout on-demand-check": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["            "]},
              {"type":"Text","props":{"color":"inactive"},"children":["on-demand-check · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 4 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["on-demand-check"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ on demand"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["never ran"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-run","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {
            "type": "Text",
            "children": [
              "",
              {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Run only when asked",":"]},
              " ",
              {"type":"Text","props":{"color":"text"},"children":["look for files nobody has changed in a year."]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/on-demand-check.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
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
  "terminal scout broken": {
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
                "props": {"key":"scout-back","label":"Scouts","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Scouts]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["broken · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 3 of 5 "]},
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
                "children": [{"type":"Text","props":{"bold":true,"color":"claude"},"children":["broken"]},{"type":"Text","props":{"color":"text"},"children":["  "]}]
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ on demand"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["never ran"]}
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
                "props": {"key":"scout-run","label":"Run now","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Run now]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"scout-pause","label":"Pause","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Pause]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"warning"},"children":["every_minutes \"-5\" is not valid: runs only on demand until fixed"]}]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Instructions"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["A scout whose file has a bad number."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/broken.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},{"type":"Text","props":{"color":"inactive"},"children":[" run now"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["e"]},{"type":"Text","props":{"color":"inactive"},"children":[" edit"]}]
              },
              {
                "type": "Text",
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},{"type":"Text","props":{"color":"inactive"},"children":[" pause"]}]
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
  "desktop scout broken": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["broken · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 3 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["broken"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ on demand"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["never ran"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-run","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"warning"},"children":["every_minutes \"-5\" is not valid: runs only on demand until fixed"]}]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["A scout whose file has a bad number."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/broken.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
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
  "mobile scout broken": {
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
              {"type":"Button","props":{"key":"scout-back","label":"Scouts","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["broken · "]},
              {
                "type": "Button",
                "props": {"key":"prev","label":"Previous","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"inactive"},"children":["‹"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":[" 3 of 5 "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["broken"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]}
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
                  {"type":"Text","props":{"color":"text"},"children":["◷ on demand"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"color":"inactive"},"children":["never ran"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"scout-run","label":"Run now","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"scout-pause","label":"Pause","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"scout-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-run-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"scout-pause-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"warning"},"children":["every_minutes \"-5\" is not valid: runs only on demand until fixed"]}]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Instructions"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["A scout whose file has a bad number."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-runs","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Runs"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (no runs yet)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/scouts/broken.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"scout-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" run now"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["e"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" edit"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" pause"]}
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
  "terminal settings closed": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▸ Work · auto · 2 at once · 45 min · 2 retries","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["▸ Work"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · auto · 2 at once · 45 min · 2 retries"]}
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
        "props": {"key":"group:Scouts","label":"▸ Scouts · findings: backlog","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["▸ Scouts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · findings: backlog"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▸ Board and alerts · notify sound 2 · open on s…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["▸ Board and alerts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · notify sound 2 · open on s…"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["l t s c"]},
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
  "desktop settings closed": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▸ Work · auto · 2 at once · 45 min · 2 retries","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Work"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · auto · 2 at once · 45 min · 2 retries"]}
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
        "props": {"key":"group:Scouts","label":"▸ Scouts · findings: backlog","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Scouts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · findings: backlog"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▸ Board and alerts · notify sound 2 · open on s…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Board and alerts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · notify sound 2 · open on s…"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "mobile settings closed": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▸ Work · auto · 2 at once · 45 min · 2 retries","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Work"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · auto · 2 at once · 45 min · 2 retries"]}
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
        "props": {"key":"group:Scouts","label":"▸ Scouts · findings: backlog","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Scouts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · findings: backlog"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▸ Board and alerts · notify sound 2 · open on s…","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▸ Board and alerts"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · notify sound 2 · open on s…"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "terminal settings open": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["l t s c"]},
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
  "desktop settings open": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "mobile settings open": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "terminal settings pick mode": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-pick-mode","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Button",
            "props": {"key":"pick:paused","label":"○ paused"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ paused"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:review","label":"○ review"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ review"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:auto","label":"● auto","autoFocus":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"color":"ide"},"children":["● auto"]}]
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter picks · x cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["l t s c"]},
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
  "desktop settings pick mode": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-pick-mode","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Button",
            "props": {"key":"pick:paused","label":"○ paused"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ paused"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:review","label":"○ review"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ review"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:auto","label":"● auto","autoFocus":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["● auto"]}]
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter picks · x cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "mobile settings pick mode": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-pick-mode","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Button",
            "props": {"key":"pick:paused","label":"○ paused"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ paused"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:review","label":"○ review"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ review"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:auto","label":"● auto","autoFocus":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["● auto"]}]
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter picks · x cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "terminal settings pick notify": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-pick-notify","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Button",
            "props": {"key":"pick:voice","label":"○ voice"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ voice"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 1","label":"○ sound 1"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ sound 1"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 2","label":"● sound 2","autoFocus":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"color":"ide"},"children":["● sound 2"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 3","label":"○ sound 3"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ sound 3"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:off","label":"○ off"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ off"]}]
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter picks · x cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["l t s c"]},
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
  "desktop settings pick notify": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-pick-notify","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Button",
            "props": {"key":"pick:voice","label":"○ voice"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ voice"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 1","label":"○ sound 1"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ sound 1"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 2","label":"● sound 2","autoFocus":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["● sound 2"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 3","label":"○ sound 3"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ sound 3"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:off","label":"○ off"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ off"]}]
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter picks · x cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "mobile settings pick notify": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-pick-notify","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Button",
            "props": {"key":"pick:voice","label":"○ voice"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ voice"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 1","label":"○ sound 1"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ sound 1"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 2","label":"● sound 2","autoFocus":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["● sound 2"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:sound 3","label":"○ sound 3"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ sound 3"]}]
          },
          {
            "type": "Button",
            "props": {"key":"pick:off","label":"○ off"},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"color":"text"},"children":["○ off"]}]
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter picks · x cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "terminal settings edit max_parallel": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-box-max_parallel","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Input",
            "props": {"key":"setting-edit","label":"max_parallel","placeholder":"a whole number, 1-8","value":"2","autoFocus":true},
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter saves · Enter on empty cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["l t s c"]},
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
  "desktop settings edit max_parallel": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-box-max_parallel","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Input",
            "props": {"key":"setting-edit","label":"max_parallel","placeholder":"a whole number, 1-8","value":"2","autoFocus":true},
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter saves · Enter on empty cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "mobile settings edit max_parallel": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-box-max_parallel","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Input",
            "props": {"key":"setting-edit","label":"max_parallel","placeholder":"a whole number, 1-8","value":"2","autoFocus":true},
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {"type":"Text","props":{"color":"inactive"},"children":["Enter saves · Enter on empty cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "terminal settings edit test_commands": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-box-test_commands","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Input",
            "props": {
              "key": "setting-edit",
              "label": "test_commands",
              "placeholder": "e.g. cd web && npm test, or none",
              "value": "[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]",
              "autoFocus": true
            },
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["the line runs as one shell command · several: [\"npm test\", \"npm run lint\"] · none clears them"]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["Enter saves · Enter on empty cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["l t s c"]},
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
  "desktop settings edit test_commands": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-box-test_commands","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Input",
            "props": {
              "key": "setting-edit",
              "label": "test_commands",
              "placeholder": "e.g. cd web && npm test, or none",
              "value": "[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]",
              "autoFocus": true
            },
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["the line runs as one shell command · several: [\"npm test\", \"npm run lint\"] · none clears them"]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["Enter saves · Enter on empty cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
  "mobile settings edit test_commands": {
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
          {"type":"Text","props":{"color":"inactive"},"children":["2 at once"]},
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
            "props": {"key":"tab-live","label":"[l]Live","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[l]Live"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-tasks","label":"[t]Tasks (20)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[t]Tasks (20)"]}]
          },
          {"type":"Text","props":{"color":"subtle"},"children":["│"]},
          {
            "type": "Button",
            "props": {"key":"tab-scouts","label":"[s]Scouts (5)","plain":true},
            "press": {"plugin":"symcc"},
            "children": [{"type":"Text","props":{"bold":false,"underline":false,"color":"inactive"},"children":["[s]Scouts (5)"]}]
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
              {"type":"Button","props":{"key":"tab-key-live","label":"l","hotkey":"l"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-tasks","label":"t","hotkey":"t"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-scouts","label":"s","hotkey":"s"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"tab-key-settings","label":"c","hotkey":"c"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]},
      {
        "type": "Button",
        "props": {"key":"group:Work","label":"▾ Work","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Work"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:mode",
          "label": "mode               auto · default auto · paused / review / a" +
            "uto · paused: nothing runs; review: finished work waits for " +
            "you; auto: it merges on its own",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mode              "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","auto"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","auto"," · ","paused / review / auto"," · ","paused: nothing runs; review: finished work waits for you; auto: it merges on its own"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:max_parallel","label":"max_parallel       2 · default 3 · 1-8 · how many workers run at once","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_parallel      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","3"," · ","1-8"," · ","how many workers run at once"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:max_minutes",
          "label": "max_minutes        45 · default 45 · 5-600 · a worker running longer makes symcc ask the owner for more time",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["max_minutes       "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","45"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","45"," · ","5-600"," · ","a worker running longer makes symcc ask the owner for more time"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:auto_retries","label":"auto_retries       2 · default 2 · 0-10 · new tries on their own after failing tests","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["auto_retries      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","2"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","2"," · ","0-10"," · ","new tries on their own after failing tests"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:enabled","label":"enabled            on · default on · on / off · off: the whole plugin rests and Claude works as normal","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["enabled           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","on"," · ","on / off"," · ","off: the whole plugin rests and Claude works as normal"]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Checks before merging","label":"▾ Checks before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Checks before merging"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:test_commands",
          "label": "test_commands      [\"claude plugin test .\",\"sh scripts/typec" +
            "heck.sh\"] · default none · one shell line, or a list of up t" +
            "o 5 lines · must all pass before work is merged",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_commands     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","none"," · ","one shell line, or a list of up to 5 lines"," · ","must all pass before work is merged"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"setting-box-test_commands","flexDirection":"column","borderStyle":"round","borderColor":"ide","paddingX":1},
        "children": [
          {
            "type": "Input",
            "props": {
              "key": "setting-edit",
              "label": "test_commands",
              "placeholder": "e.g. cd web && npm test, or none",
              "value": "[\"claude plugin test .\",\"sh scripts/typecheck.sh\"]",
              "autoFocus": true
            },
            "press": {"plugin":"symcc"}
          },
          {"type":"Button","props":{"key":"setting-cancel","label":"Cancel (x)","hotkey":"x"},"press":{"plugin":"symcc"}},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["the line runs as one shell command · several: [\"npm test\", \"npm run lint\"] · none clears them"]
          },
          {"type":"Text","props":{"color":"inactive"},"children":["Enter saves · Enter on empty cancels"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:test_minutes","label":"test_minutes       10 · default 10 · 1-120 · how long each test command may run before merging","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["test_minutes      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","10"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","10"," · ","1-120"," · ","how long each test command may run before merging"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:tests_with_changes",
          "label": "tests_with_changes ask · default ask · off / ask / review · " +
            "a change task that edits code but no test file: ask: it merg" +
            "es and the lead is told \"T-3 changed code but no test\"; revi" +
            "ew: it waits for your review instead; off: nothing (test fil" +
            "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
            " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
            ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
            "md files, images and non-code files under docs/ are never fl" +
            "agged)",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tests_with_changes"]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","ask"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "ask",
              " · ",
              "off / ask / review",
              " · ",
              "a change task that edits code but no test file: ask: it merg" +
                "es and the lead is told \"T-3 changed code but no test\"; revi" +
                "ew: it waits for your review instead; off: nothing (test fil" +
                "es are in test/, tests/, __tests__/, spec/, e2e/ or cypress/" +
                " folders or have a test name like a.test.ts, a-test.ts, a.cy" +
                ".ts, login.e2e.ts, FooTest.java; docs-only changes such as ." +
                "md files, images and non-code files under docs/ are never fl" +
                "agged)"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:checker",
          "label": "checker            off · default off · off / on · on: after " +
            "the prep step and before a change joins the merge queue (whe" +
            "re its tests run), a fresh checker tries to break it; OK goe" +
            "s on, a list of problems sends it back to its worker (counts" +
            " as a retry); investigations and docs-only changes skip it",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker           "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","off"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "off",
              " · ",
              "off / on",
              " · ",
              "on: after the prep step and before a change joins the merge " +
                "queue (where its tests run), a fresh checker tries to break " +
                "it; OK goes on, a list of problems sends it back to its work" +
                "er (counts as a retry); investigations and docs-only changes" +
                " skip it"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Workers","label":"▾ Workers","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Workers"]}]
      },
      {
        "type": "Button",
        "props": {"key":"settings-roles","label":"Roles: 0 roles","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Roles             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","0 roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Roles page: the worker roles, to open, edit, turn off or add"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"settings-kinds","label":"Kinds: 6 kinds","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["Kinds             "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","6 kinds"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · Enter opens the Kinds page: the task kinds, to open, edit, turn off or add"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Scouts","label":"▾ Scouts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Scouts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:scout_findings",
          "label": "scout_findings     backlog · default auto · auto / backlog ·" +
            " auto: the lead decides, a scout finding it adds goes to tod" +
            "o and runs; backlog: every task added from a scout finding g" +
            "oes to the backlog and waits for you",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["scout_findings    "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","backlog"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "auto",
              " · ",
              "auto / backlog",
              " · ",
              "auto: the lead decides, a scout finding it adds goes to todo" +
                " and runs; backlog: every task added from a scout finding go" +
                "es to the backlog and waits for you"
            ]
          }
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"group:Board and alerts","label":"▾ Board and alerts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["▾ Board and alerts"]}]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:notify",
          "label": "notify             sound 2 · default voice (else sound N, N " +
            "picked from the project name, else off) · voice / sound 1 / " +
            "sound 2 / sound 3 / off · when a task is merged or a worker " +
            "asks you something: \"symcc: T-3 done\" / \"symcc: T-5 needs yo" +
            "u\" out loud, the project name first (voice), or a chime from" +
            " sound set N, so you can tell which project chimed (on macOS" +
            " sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Su" +
            "bmarine and Funk; the second one when a question waits); pic" +
            "king a sound plays its chime",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["notify            "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","sound 2"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [
              " · default ",
              "voice (else sound N, N picked from the project name, else off)",
              " · ",
              "voice / sound 1 / sound 2 / sound 3 / off",
              " · ",
              "when a task is merged or a worker asks you something: \"symcc" +
                ": T-3 done\" / \"symcc: T-5 needs you\" out loud, the project n" +
                "ame first (voice), or a chime from sound set N, so you can t" +
                "ell which project chimed (on macOS sound 1: Glass and Ping, " +
                "sound 2: Hero and Pop, sound 3: Submarine and Funk; the seco" +
                "nd one when a question waits); picking a sound plays its chi" +
                "me"
            ]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"setting:open_on_start","label":"open_on_start      on · default on · on / off · open the board panel when a session starts","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["open_on_start     "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","on"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · default ","on"," · ","on / off"," · ","open the board panel when a session starts"]}
        ]
      },
      {
        "type": "Button",
        "props": {
          "key": "setting:archive_days",
          "label": "archive_days       14 · default 14 · 0-3650 (0 = never) · done and dropped tasks older than this move to archive.json",
          "plain": true
        },
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["archive_days      "]},
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":[" ","14"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": [" · default ","14"," · ","0-3650 (0 = never)"," · ","done and dropped tasks older than this move to archive.json"]
          }
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["l t s c"]},
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
