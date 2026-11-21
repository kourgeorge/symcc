// Written by snapshot-format.ts (one drawn row per line, T-705). To re-capture a page, print
// `snapshotEntry(key, drawnData(await ui.drawn()))` from a short probe test and put its lines in place of that entry.
// The Roles and Kinds pages' drawn trees (and one role's and one kind's page) for ROLE_KIND_SCENES of scouts-settings-scenes.ts
// on the terminal, the desktop and mobile, captured from the code before their VS Code pages (T-460). That work must leave
// these exactly as they are (compared exactly in vscode-scouts-settings.test.tsx).
export const ROLES_KINDS_BEFORE: Record<string, unknown> = {
  "terminal roles list": {
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
      {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Roles"]},
      {
        "type": "Button",
        "props": {"key":"roleRow:general","label":"general: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  general                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · a plain worker for any task; use it when no other role fits"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:checker","label":"checker: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  checker                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · checks a finished change before it merges and tries to break it (used only by the checker setting, never for a task)"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:docs","label":"docs: replaced, off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["  docs                              "]},
          {"type":"Text","props":{"color":"warning"},"children":[" replaced, off"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · writes the docs"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:mobile-apps-and-tablets-everywhere","label":"mobile-apps-and-tablets-everywhere: added","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  mobile-apps-and-tablets-everywhere"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" added"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · builds and fixes phone and tablet apps, on every platform, with the shop listings and screenshots too"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:tester","label":"tester: replaced","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  tester                            "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" replaced"]},
          {"type":"Text","props":{"color":"text"},"children":[" · writes tests that try hard to break the change, with every edge case found"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:bad","label":"bad — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["  bad                               "]},
          {
            "type": "Text",
            "props": {"color":"error"},
            "children": [" — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"role-new","label":"+ New role","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New role"]}]
      },
      {"type":"Text","props":{"color":"inactive"},"children":["Enter opens a role · n makes a new one · or tell the lead"]},
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"roles-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"roles-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" new role"]}
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
  "desktop roles list": {
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
      {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Roles"]},
      {
        "type": "Button",
        "props": {"key":"roleRow:general","label":"general: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  general                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · a plain worker for any task; use it when no other role fits"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:checker","label":"checker: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  checker                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · checks a finished change before it merges and tries to break it (used only by the checker setting, never for a task)"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:docs","label":"docs: replaced, off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["  docs                              "]},
          {"type":"Text","props":{"color":"warning"},"children":[" replaced, off"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · writes the docs"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:mobile-apps-and-tablets-everywhere","label":"mobile-apps-and-tablets-everywhere: added","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  mobile-apps-and-tablets-everywhere"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" added"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · builds and fixes phone and tablet apps, on every platform, with the shop listings and screenshots too"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:tester","label":"tester: replaced","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  tester                            "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" replaced"]},
          {"type":"Text","props":{"color":"text"},"children":[" · writes tests that try hard to break the change, with every edge case found"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:bad","label":"bad — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["  bad                               "]},
          {
            "type": "Text",
            "props": {"color":"error"},
            "children": [" — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"role-new","label":"+ New role","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New role"]}]
      },
      {"type":"Text","props":{"color":"inactive"},"children":["Enter opens a role · n makes a new one · or tell the lead"]},
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"roles-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"roles-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" new role"]}
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
  "mobile roles list": {
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
      {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Roles"]},
      {
        "type": "Button",
        "props": {"key":"roleRow:general","label":"general: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  general                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · a plain worker for any task; use it when no other role fits"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:checker","label":"checker: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  checker                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · checks a finished change before it merges and tries to break it (used only by the checker setting, never for a task)"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:docs","label":"docs: replaced, off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["  docs                              "]},
          {"type":"Text","props":{"color":"warning"},"children":[" replaced, off"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · writes the docs"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:mobile-apps-and-tablets-everywhere","label":"mobile-apps-and-tablets-everywhere: added","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  mobile-apps-and-tablets-everywhere"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" added"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · builds and fixes phone and tablet apps, on every platform, with the shop listings and screenshots too"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:tester","label":"tester: replaced","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  tester                            "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" replaced"]},
          {"type":"Text","props":{"color":"text"},"children":[" · writes tests that try hard to break the change, with every edge case found"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:bad","label":"bad — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["  bad                               "]},
          {
            "type": "Text",
            "props": {"color":"error"},
            "children": [" — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"role-new","label":"+ New role","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New role"]}]
      },
      {"type":"Text","props":{"color":"inactive"},"children":["Enter opens a role · n makes a new one · or tell the lead"]},
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"roles-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"roles-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" new role"]}
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
  "terminal role general": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["general"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["a plain worker for any task; use it when no other role fits"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Checklist"]},
          {"type":"Text","props":{"color":"inactive"},"children":["(none: a plain worker)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["roles/general.md (in the plugin; Edit copies it to .symcc/roles/general.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
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
  "desktop role general": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["general"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a plain worker for any task; use it when no other role fits"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {"type":"Text","props":{"color":"inactive"},"children":["(none: a plain worker)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["roles/general.md (in the plugin; Edit copies it to .symcc/roles/general.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
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
  "mobile role general": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["general"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a plain worker for any task; use it when no other role fits"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {"type":"Text","props":{"color":"inactive"},"children":["(none: a plain worker)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["roles/general.md (in the plugin; Edit copies it to .symcc/roles/general.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
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
  "terminal role tester": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tester"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","replaced"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["writes tests that try hard to break the change, with every edge case found"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"role-buttons-1","flexDirection":"row","gap":1},
            "children": [{"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [{"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Model"]},{"type":"Text","props":{"color":"text"},"children":["  sonnet"]}]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"text"},"children":["  testing, review"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["cover errors"]}]
          },
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["cover empty input"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/tester.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "desktop role tester": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tester"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","replaced"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text","weight":"semibold"},
            "children": ["writes tests that try hard to break the change, with every edge case found"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"role-buttons-1","flexDirection":"row","gap":1},
            "children": [{"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"text"},"children":["  sonnet"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"text"},"children":["  testing, review"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["cover errors"]}]
          },
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["cover empty input"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/tester.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "mobile role tester": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tester"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","replaced"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text","weight":"semibold"},
            "children": ["writes tests that try hard to break the change, with every edge case found"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"role-buttons-1","flexDirection":"row","gap":1},
            "children": [{"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"text"},"children":["  sonnet"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"text"},"children":["  testing, review"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["cover errors"]}]
          },
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["cover empty input"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/tester.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "terminal role docs": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["docs"]},
              {"type":"Text","props":{"color":"warning"},"children":[" · ","replaced, off"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["writes the docs"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn on","hotkey":"o"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"role-buttons-1","flexDirection":"row","gap":1},
            "children": [{"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["plain words"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/docs.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn on"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "desktop role docs": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["docs"]},
              {"type":"Text","props":{"color":"warning"},"children":[" · ","replaced, off"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["writes the docs"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn on","hotkey":"o"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"role-buttons-1","flexDirection":"row","gap":1},
            "children": [{"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["plain words"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/docs.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn on"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "mobile role docs": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["docs"]},
              {"type":"Text","props":{"color":"warning"},"children":[" · ","replaced, off"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["writes the docs"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn on","hotkey":"o"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"role-buttons-1","flexDirection":"row","gap":1},
            "children": [{"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["plain words"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/docs.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn on"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "terminal role mobile-apps-and-tablets-everywhere": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["mobile-apps-and-tablets-everywhere"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","added"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text"},
            "children": ["builds and fixes phone and tablet apps, on every platform, with the shop listings and screenshots too"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["test on a small screen"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/mobile-apps-and-tablets-everywhere.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
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
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["d"]},{"type":"Text","props":{"color":"inactive"},"children":[" remove"]}]
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
  "desktop role mobile-apps-and-tablets-everywhere": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mobile-apps-and-tablets-everywhere"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","added"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text","weight":"semibold"},
            "children": ["builds and fixes phone and tablet apps, on every platform, with the shop listings and screenshots too"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["test on a small screen"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/mobile-apps-and-tablets-everywhere.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" remove"]}
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
  "mobile role mobile-apps-and-tablets-everywhere": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mobile-apps-and-tablets-everywhere"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","added"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text","weight":"semibold"},
            "children": ["builds and fixes phone and tablet apps, on every platform, with the shop listings and screenshots too"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["test on a small screen"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/mobile-apps-and-tablets-everywhere.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" remove"]}
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
  "terminal role checker": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["checker"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text"},
            "children": ["checks a finished change before it merges and tries to break it (used only by the checker setting, never for a task)"]
          },
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now off)"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["read the whole diff"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["roles/checker.md (in the plugin; Edit copies it to .symcc/roles/checker.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["p"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
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
  "desktop role checker": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text","weight":"semibold"},
            "children": ["checks a finished change before it merges and tries to break it (used only by the checker setting, never for a task)"]
          },
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now off)"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["read the whole diff"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["roles/checker.md (in the plugin; Edit copies it to .symcc/roles/checker.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
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
  "mobile role checker": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text","weight":"semibold"},
            "children": ["checks a finished change before it merges and tries to break it (used only by the checker setting, never for a task)"]
          },
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now off)"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt","label":"See the prompt","hotkey":"p"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Model"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the session's model)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Skills"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Tools"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  (none: the base tools only)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Checklist"]},
          {
            "type": "Text",
            "children": ["",{"type":"Text","props":{"color":"claude"},"children":["•"]}," ",{"type":"Text","props":{"color":"text"},"children":["read the whole diff"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Placeholders"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["  the checklist may use these; each is filled in for the task (any other ","{{word}}"," is left as written)"]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task_id}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's id, e.g. T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{title}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the task's title"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{files}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"Files you may change\" lines (the task's files, or \"whatever the task needs\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{test_command}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the \"these must pass\" line with the test commands (or \"There is no test command\")"]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{folder}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's own folder (its copy of the project)"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{branch}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the worker's branch, e.g. symcc/T-12"]}
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{kind}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [" ","the task's kind and what it is for, e.g. \"Kind of task: bug (something that works wrongly).\""]
              }
            ]
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{name}}"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" ","the plugin's name (symcc)"]}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["roles/checker.md (in the plugin; Edit copies it to .symcc/roles/checker.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" the prompt it goes in"]}
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
  "terminal role bad": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["bad"]},
              {
                "type": "Text",
                "props": {"color":"error"},
                "children": [" · ","your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)"]
              }
            ]
          },
          {"type":"Text","props":{"color":"text"},"children":["Fix the file by hand: ",".symcc/roles/bad.md","; or Remove deletes it","."]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/bad.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"wrap":"truncate","color":"subtle"},"children":["──────────────────────────────────────────────────"]},
          {
            "type": "Text",
            "props": {"color":"subtle"},
            "children": [
              {
                "type": "Text",
                "children": ["",{"type":"Text","props":{"bold":true,"color":"text"},"children":["d"]},{"type":"Text","props":{"color":"inactive"},"children":[" remove"]}]
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
  "desktop role bad": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["bad"]},
              {
                "type": "Text",
                "props": {"color":"error"},
                "children": [" · ","your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)"]
              }
            ]
          },
          {"type":"Text","props":{"color":"text"},"children":["Fix the file by hand: ",".symcc/roles/bad.md","; or Remove deletes it","."]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/bad.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" remove"]}
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
  "mobile role bad": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["bad"]},
              {
                "type": "Text",
                "props": {"color":"error"},
                "children": [" · ","your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)"]
              }
            ]
          },
          {"type":"Text","props":{"color":"text"},"children":["Fix the file by hand: ",".symcc/roles/bad.md","; or Remove deletes it","."]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"role-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"role-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/roles/bad.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"role-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" remove"]}
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
  "terminal kinds list": {
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
      {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Kinds"]},
      {
        "type": "Button",
        "props": {"key":"kindRow:change","label":"change: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  change                       "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · a general change when no other kind fits (the default)"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:bug","label":"bug: replaced, off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["  bug                          "]},
          {"type":"Text","props":{"color":"warning"},"children":[" replaced, off"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · something that works wrongly"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:feature","label":"feature: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  feature                      "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · new behavior for the owner"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:refactor","label":"refactor: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  refactor                     "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · cleaning up code without changing what it does"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:docs","label":"docs: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  docs                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · documentation only"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:investigation","label":"investigation: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  investigation                "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · find an answer and hand it back; nothing is merged"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:chore-and-upkeep-of-the-build","label":"chore-and-upkeep-of-the-build: added","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["  chore-and-upkeep-of-the-build"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" added"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · small upkeep: bumping versions, tidying the build, moving files, nothing the user sees at all"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kind-new","label":"+ New kind","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New kind"]}]
      },
      {"type":"Text","props":{"color":"inactive"},"children":["Enter opens a kind · n makes a new one · or tell the lead"]},
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"kinds-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"kinds-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" new kind"]}
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
  "desktop kinds list": {
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
      {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Kinds"]},
      {
        "type": "Button",
        "props": {"key":"kindRow:change","label":"change: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  change                       "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · a general change when no other kind fits (the default)"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:bug","label":"bug: replaced, off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["  bug                          "]},
          {"type":"Text","props":{"color":"warning"},"children":[" replaced, off"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · something that works wrongly"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:feature","label":"feature: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  feature                      "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · new behavior for the owner"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:refactor","label":"refactor: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  refactor                     "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · cleaning up code without changing what it does"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:docs","label":"docs: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  docs                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · documentation only"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:investigation","label":"investigation: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  investigation                "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · find an answer and hand it back; nothing is merged"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:chore-and-upkeep-of-the-build","label":"chore-and-upkeep-of-the-build: added","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  chore-and-upkeep-of-the-build"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" added"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · small upkeep: bumping versions, tidying the build, moving files, nothing the user sees at all"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kind-new","label":"+ New kind","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New kind"]}]
      },
      {"type":"Text","props":{"color":"inactive"},"children":["Enter opens a kind · n makes a new one · or tell the lead"]},
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"kinds-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"kinds-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" new kind"]}
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
  "mobile kinds list": {
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
      {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Kinds"]},
      {
        "type": "Button",
        "props": {"key":"kindRow:change","label":"change: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  change                       "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · a general change when no other kind fits (the default)"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:bug","label":"bug: replaced, off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":false,"color":"inactive"},"children":["  bug                          "]},
          {"type":"Text","props":{"color":"warning"},"children":[" replaced, off"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" · something that works wrongly"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:feature","label":"feature: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  feature                      "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · new behavior for the owner"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:refactor","label":"refactor: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  refactor                     "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · cleaning up code without changing what it does"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:docs","label":"docs: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  docs                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · documentation only"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:investigation","label":"investigation: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  investigation                "]},
          {"type":"Text","props":{"color":"inactive"},"children":[" built-in"]},
          {"type":"Text","props":{"color":"text"},"children":[" · find an answer and hand it back; nothing is merged"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:chore-and-upkeep-of-the-build","label":"chore-and-upkeep-of-the-build: added","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["  chore-and-upkeep-of-the-build"]},
          {"type":"Text","props":{"color":"inactive"},"children":[" added"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": [" · small upkeep: bumping versions, tidying the build, moving files, nothing the user sees at all"]
          }
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kind-new","label":"+ New kind","hotkey":"n"},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New kind"]}]
      },
      {"type":"Text","props":{"color":"inactive"},"children":["Enter opens a kind · n makes a new one · or tell the lead"]},
      {"type":"Text","children":[" "]},
      {"type":"Button","props":{"key":"kinds-back","label":"Back (b)","hotkey":"b"},"press":{"plugin":"symcc"}},
      {
        "type": "Box",
        "props": {"key":"kinds-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["n"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" new kind"]}
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
  "terminal kind bug": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["bug"]},
              {"type":"Text","props":{"color":"warning"},"children":[" · ","replaced, off"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["something that works wrongly"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-off","label":"Turn on","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [{"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Body"]},{"type":"Text","props":{"color":"inactive"},"children":["(none)"]}]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/kinds/bug.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn on"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "desktop kind bug": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["bug"]},
              {"type":"Text","props":{"color":"warning"},"children":[" · ","replaced, off"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["something that works wrongly"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-off","label":"Turn on","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Body"]},
          {"type":"Text","props":{"color":"inactive"},"children":["(none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/kinds/bug.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn on"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "mobile kind bug": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["bug"]},
              {"type":"Text","props":{"color":"warning"},"children":[" · ","replaced, off"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["something that works wrongly"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-off","label":"Turn on","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-reset","label":"Reset to built-in","hotkey":"r"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Body"]},
          {"type":"Text","props":{"color":"inactive"},"children":["(none)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/kinds/bug.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn on"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["r"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" reset to built-in"]}
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
  "terminal kind change": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["change"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["a general change when no other kind fits (the default)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Body"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["The worker changes files, which are committed, tested and merged."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["kinds/change.ts (in the plugin; Edit copies it to .symcc/kinds/change.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
                "children": [" · ",{"type":"Text","props":{"bold":true,"color":"text"},"children":["b"]},{"type":"Text","props":{"color":"inactive"},"children":[" back"]}]
              }
            ]
          }
        ]
      }
    ],
    "part": {"plugin":"symcc"}
  },
  "desktop kind change": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["change"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a general change when no other kind fits (the default)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Body"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["The worker changes files, which are committed, tested and merged."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["kinds/change.ts (in the plugin; Edit copies it to .symcc/kinds/change.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
  "mobile kind change": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["change"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","built-in"]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a general change when no other kind fits (the default)"]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Body"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["The worker changes files, which are committed, tested and merged."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {
            "type": "Text",
            "children": ["  ",{"type":"Text","props":{"color":"autoAccept"},"children":["kinds/change.ts (in the plugin; Edit copies it to .symcc/kinds/change.md)"]}]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
  "terminal kind chore-and-upkeep-of-the-build": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude"},"children":["chore-and-upkeep-of-the-build"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","added"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text"},
            "children": ["small upkeep: bumping versions, tidying the build, moving files, nothing the user sees at all"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Body"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["Keep it small."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/kinds/chore-and-upkeep-of-the-build.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" remove"]}
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
  "desktop kind chore-and-upkeep-of-the-build": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["chore-and-upkeep-of-the-build"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","added"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text","weight":"semibold"},
            "children": ["small upkeep: bumping versions, tidying the build, moving files, nothing the user sees at all"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Body"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["Keep it small."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/kinds/chore-and-upkeep-of-the-build.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" remove"]}
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
  "mobile kind chore-and-upkeep-of-the-build": {
    "type": "Box",
    "props": {"flexDirection":"column","gap":1},
    "children": [
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {
            "type": "Text",
            "children": [
              {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["chore-and-upkeep-of-the-build"]},
              {"type":"Text","props":{"color":"inactive"},"children":[" · ","added"]}
            ]
          },
          {
            "type": "Text",
            "props": {"bold":true,"color":"text","weight":"semibold"},
            "children": ["small upkeep: bumping versions, tidying the build, moving files, nothing the user sees at all"]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-buttons","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"kind-buttons-0","flexDirection":"row","gap":1},
            "children": [
              {"type":"Button","props":{"key":"kind-back","label":"Back","hotkey":"b","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-edit","label":"Edit","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-off","label":"Turn off","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"kind-remove","label":"Remove","hotkey":"d"},"press":{"plugin":"symcc"}}
            ]
          }
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Body"]},
          {"type":"Text","children":[{"type":"Text","props":{"color":"text"},"children":["Keep it small."]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","File"]},
          {"type":"Text","children":["  ",{"type":"Text","props":{"color":"autoAccept"},"children":[".symcc/kinds/chore-and-upkeep-of-the-build.md"]}]}
        ]
      },
      {
        "type": "Box",
        "props": {"key":"kind-keys-footer","flexDirection":"column"},
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
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["o"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" turn off"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  " · ",
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["d"]},
                  {"type":"Text","props":{"color":"inactive"},"children":[" remove"]}
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
