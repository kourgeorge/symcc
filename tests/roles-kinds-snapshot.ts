// Written by snapshot-format.ts (one drawn row per line, T-705). To re-capture a page, print
// `snapshotEntry(key, drawnData(await ui.drawn()))` from a short probe test and put its lines in place of that entry.
// The Roles and Task types pages' drawn trees (and one role's and one kind's page) for ROLE_KIND_SCENES of scouts-settings-scenes.ts
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
                "props": {"key":"roles-back","label":"Settings","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Settings]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":[""]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":["6 roles · 3 changed by you · 1 off"]},
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [{"type":"Button","props":{"key":"roles-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["  NAME                                FROM"]},
      {
        "type": "Button",
        "props": {"key":"roleRow:general","label":"general: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["❯ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["general                             "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:checker","label":"checker: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["checker                             "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:docs","label":"docs: off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["docs                                "]},
          {"type":"Text","props":{"color":"inactive"},"children":["off"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:mobile-apps-and-tablets-everywhere","label":"mobile-apps-and-tablets-everywhere: added by you","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["mobile-apps-and-tablets-everywhere  "]},
          {"type":"Text","props":{"color":"success"},"children":["added by you"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:tester","label":"tester: changed","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tester                              "]},
          {"type":"Text","props":{"color":"suggestion"},"children":["changed"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:bad","label":"bad — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["bad                                 "]},
          {"type":"Text","props":{"color":"error"},"children":["— your file…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"role-new","label":"+ New role (n)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New role (n)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"roles-hidden-keys","display":"none"},
        "children": [{"type":"Button","props":{"key":"role-new-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}}]
      },
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
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"roles-back","label":"Settings","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":[""]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":["6 roles · 3 changed by you · 1 off"]},
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [{"type":"Button","props":{"key":"roles-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["  NAME                                FROM"]},
      {
        "type": "Button",
        "props": {"key":"roleRow:general","label":"general: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["❯ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["general                             "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:checker","label":"checker: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker                             "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:docs","label":"docs: off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["docs                                "]},
          {"type":"Text","props":{"color":"inactive"},"children":["off"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:mobile-apps-and-tablets-everywhere","label":"mobile-apps-and-tablets-everywhere: added by you","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mobile-apps-and-tablets-everywhere  "]},
          {"type":"Text","props":{"color":"success"},"children":["added by you"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:tester","label":"tester: changed","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tester                              "]},
          {"type":"Text","props":{"color":"suggestion"},"children":["changed"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:bad","label":"bad — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["bad                                 "]},
          {"type":"Text","props":{"color":"error"},"children":["— your file…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"role-new","label":"+ New role (n)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New role (n)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"roles-hidden-keys","display":"none"},
        "children": [{"type":"Button","props":{"key":"role-new-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}}]
      },
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
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"roles-back","label":"Settings","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":[""]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Roles"]},
          {"type":"Text","props":{"color":"inactive"},"children":["6 roles · 3 changed by you · 1 off"]},
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [{"type":"Button","props":{"key":"roles-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["  NAME                                FROM"]},
      {
        "type": "Button",
        "props": {"key":"roleRow:general","label":"general: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["❯ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["general                             "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:checker","label":"checker: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker                             "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:docs","label":"docs: off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["docs                                "]},
          {"type":"Text","props":{"color":"inactive"},"children":["off"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:mobile-apps-and-tablets-everywhere","label":"mobile-apps-and-tablets-everywhere: added by you","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mobile-apps-and-tablets-everywhere  "]},
          {"type":"Text","props":{"color":"success"},"children":["added by you"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:tester","label":"tester: changed","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tester                              "]},
          {"type":"Text","props":{"color":"suggestion"},"children":["changed"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"roleRow:bad","label":"bad — your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["bad                                 "]},
          {"type":"Text","props":{"color":"error"},"children":["— your file…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"role-new","label":"+ New role (n)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New role (n)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"roles-hidden-keys","display":"none"},
        "children": [{"type":"Button","props":{"key":"role-new-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}}]
      },
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"role-back","label":"Roles","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Roles]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["general · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["general"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["a plain worker for any task; use it when"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["no other role fits"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"inactive"},"children":["built-in"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"role-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"role-prompt","label":"Prompt","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Prompt]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["general · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["general"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a plain worker for any task; use it when"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["no other role fits"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["built-in"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["general · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["general"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a plain worker for any task; use it when"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["no other role fits"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["built-in"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"role-back","label":"Roles","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Roles]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tester · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["tester"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["writes tests that try hard to break the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["        "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["change, with every edge case found"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["replaced · 3 changes"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"role-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"role-prompt","label":"Prompt","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Prompt]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"role-reset","label":"Reset to built-in","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Reset to built-in]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"role-off","label":"Turn off","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Turn off]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-reset-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Changed from built-in"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": ["  description: writes tests → writes tests that try hard to break the change, with every edge case found"]
          },
          {"type":"Text","props":{"color":"text"},"children":["  skills: (none) → testing, review"]},
          {"type":"Text","props":{"color":"text"},"children":["  checklist: 1 line changed"]},
          {"type":"Text","props":{"color":"success"},"children":["    + - cover empty input"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tester · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tester"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["writes tests that try hard to break the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["        "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["change, with every edge case found"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["replaced · 3 changes"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-reset-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Changed from built-in"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": ["  description: writes tests → writes tests that try hard to break the change, with every edge case found"]
          },
          {"type":"Text","props":{"color":"text"},"children":["  skills: (none) → testing, review"]},
          {"type":"Text","props":{"color":"text"},"children":["  checklist: 1 line changed"]},
          {"type":"Text","props":{"color":"success"},"children":["    + - cover empty input"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":["tester · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["tester"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["writes tests that try hard to break the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["        "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["change, with every edge case found"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["replaced · 3 changes"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-reset-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Changed from built-in"]},
          {
            "type": "Text",
            "props": {"color":"text"},
            "children": ["  description: writes tests → writes tests that try hard to break the change, with every edge case found"]
          },
          {"type":"Text","props":{"color":"text"},"children":["  skills: (none) → testing, review"]},
          {"type":"Text","props":{"color":"text"},"children":["  checklist: 1 line changed"]},
          {"type":"Text","props":{"color":"success"},"children":["    + - cover empty input"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"role-back","label":"Roles","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Roles]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                        "]},
              {"type":"Text","props":{"color":"inactive"},"children":["docs · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"inactive"},"children":["docs"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["writes the docs"]}
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
                  {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["replaced · 1 change"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"bold":true,"color":"warning"},"children":["off"]}
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
                "props": {"key":"role-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"role-prompt","label":"Prompt","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Prompt]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"role-reset","label":"Reset to built-in","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Reset to built-in]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"role-off","label":"Turn on","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Turn on]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-reset-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Changed from built-in"]},
          {"type":"Text","props":{"color":"text"},"children":["  off: on → off"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                        "]},
              {"type":"Text","props":{"color":"inactive"},"children":["docs · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["docs"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["writes the docs"]}
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
                  {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["replaced · 1 change"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"bold":true,"color":"warning","weight":"semibold"},"children":["off"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-off","label":"Turn on","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-reset-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Changed from built-in"]},
          {"type":"Text","props":{"color":"text"},"children":["  off: on → off"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                        "]},
              {"type":"Text","props":{"color":"inactive"},"children":["docs · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["docs"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["writes the docs"]}
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
                  {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["replaced · 1 change"]},
                  {"type":"Text","props":{"color":"text"},"children":["   "]},
                  {"type":"Text","props":{"bold":true,"color":"warning","weight":"semibold"},"children":["off"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-reset","label":"Reset to built-in","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-off","label":"Turn on","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-reset-key","label":"r","hotkey":"r"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Changed from built-in"]},
          {"type":"Text","props":{"color":"text"},"children":["  off: on → off"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"role-back","label":"Roles","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Roles]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                               "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["mobile-apps-and-tablets-everywhere"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["builds and"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["fixes phone"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["and tablet"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["apps, on every"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["platform, with"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["the shop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["listings and"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["screenshots"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["too"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"success"},"children":["added"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"role-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"role-prompt","label":"Prompt","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Prompt]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"role-remove","label":"Remove","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Remove]"]}]
              },
              {"type":"Text","children":["   "]},
              {
                "type": "Button",
                "props": {"key":"role-off","label":"Turn off","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Turn off]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove-key","label":"d","hotkey":"d"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion"},"children":["▍","Changed from built-in"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  added: no built-in to compare"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                               "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mobile-apps-and-tablets-everywhere"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["builds and"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["fixes phone"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["and tablet"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["apps, on every"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["platform, with"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["the shop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["listings and"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["screenshots"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["too"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["added"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-remove","label":"Remove","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove-key","label":"d","hotkey":"d"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Changed from built-in"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  added: no built-in to compare"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                               "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["mobile-apps-and-tablets-everywhere"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["builds and"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["fixes phone"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["and tablet"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["apps, on every"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["platform, with"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["the shop"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["listings and"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["screenshots"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["                                    "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["too"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"success","weight":"semibold"},"children":["added"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-remove","label":"Remove","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":["   "]},
              {"type":"Button","props":{"key":"role-off","label":"Turn off","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-off-key","label":"o","hotkey":"o"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-remove-key","label":"d","hotkey":"d"},"press":{"plugin":"symcc"}}
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
        "children": [{"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"role-changes","flexDirection":"column"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"suggestion","weight":"semibold"},"children":["▍","Changed from built-in"]},
          {"type":"Text","props":{"color":"inactive"},"children":["  added: no built-in to compare"]}
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {
                "type": "Button",
                "props": {"key":"role-back","label":"Roles","plain":true,"autoFocus":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Roles]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["checker · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude"},"children":["checker"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["checks a finished change before it merges"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["and tries to break it (used only by the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text"},"children":["checker setting, never for a task)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"inactive"},"children":["built-in"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {
                "type": "Button",
                "props": {"key":"role-edit","label":"Edit","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Edit]"]}]
              },
              {"type":"Text","children":[" "]},
              {
                "type": "Button",
                "props": {"key":"role-prompt","label":"Prompt","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Prompt]"]}]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now off)"]
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["checker · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["checks a finished change before it merges"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["and tries to break it (used only by the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["checker setting, never for a task)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["built-in"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now off)"]
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"role-back","label":"Roles","variant":"secondary","autoFocus":true},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                     "]},
              {"type":"Text","props":{"color":"inactive"},"children":["checker · "]},
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
                  {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["checker"]},
                  {"type":"Text","props":{"color":"text"},"children":["  "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["checks a finished change before it merges"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["and tries to break it (used only by the"]}
                ]
              },
              {
                "type": "Text",
                "children": [
                  {"type":"Text","props":{"color":"text"},"children":["         "]},
                  {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["checker setting, never for a task)"]}
                ]
              }
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-state","flexDirection":"column"},
            "children": [{"type":"Text","children":[{"type":"Text","props":{"bold":true,"color":"inactive","weight":"semibold"},"children":["built-in"]}]}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-buttons-0","flexDirection":"row"},
            "children": [
              {"type":"Button","props":{"key":"role-edit","label":"Edit","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","children":[" "]},
              {"type":"Button","props":{"key":"role-prompt","label":"Prompt","variant":"secondary"},"press":{"plugin":"symcc"}}
            ]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [
              {"type":"Button","props":{"key":"role-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"prev-key","label":"k","hotkey":"k"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"next-key","label":"j","hotkey":"j"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-edit-key","label":"e","hotkey":"e"},"press":{"plugin":"symcc"}},
              {"type":"Button","props":{"key":"role-prompt-key","label":"p","hotkey":"p"},"press":{"plugin":"symcc"}}
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
          {"type":"Text","props":{"color":"text"},"children":["Writes: code (tests run before merging)"]},
          {
            "type": "Text",
            "props": {"color":"inactive"},
            "children": ["never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now off)"]
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
                "children": [" ","the task's type and what it is for, e.g. \"The task type is bug (something that works wrongly).\""]
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
          },
          {
            "type": "Text",
            "children": [
              "  ",
              {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["{{task.<path>}}"]},
              {
                "type": "Text",
                "props": {"color":"inactive"},
                "children": [
                  " ",
                  "any field of the task, by its path (e.g. {{task.origin.reque" +
                    "st}}, {{task.files}}): text as it is, a list one item per li" +
                    "ne, an object as \"key: value\" lines, a missing one as nothin" +
                    "g"
                ]
              }
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
                "props": {"key":"kinds-back","label":"Settings","plain":true},
                "press": {"plugin":"symcc"},
                "children": [{"type":"Text","props":{"color":"text"},"children":["[Settings]"]}]
              },
              {"type":"Text","props":{"color":"inactive"},"children":["                                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":[""]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["Task types"]},
          {"type":"Text","props":{"color":"inactive"},"children":["8 task types · 2 changed by you · 1 off"]},
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [{"type":"Button","props":{"key":"kinds-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["  NAME                           FROM          WH…"]},
      {
        "type": "Button",
        "props": {"key":"kindRow:change","label":"change: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["❯ "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["change                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["a …"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:bug","label":"bug: off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["bug                            "]},
          {"type":"Text","props":{"color":"inactive"},"children":["off           "]},
          {"type":"Text","props":{"color":"inactive"},"children":["so…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:feature","label":"feature: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["feature                        "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["ne…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:refactor","label":"refactor: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["refactor                       "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["cl…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:docs","label":"docs: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["docs                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["do…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:investigation","label":"investigation: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["investigation                  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["fi…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:errand","label":"errand: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["errand                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["ge…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:chore-and-upkeep-of-the-build","label":"chore-and-upkeep-of-the-build: added by you","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude"},"children":["chore-and-upkeep-of-the-build  "]},
          {"type":"Text","props":{"color":"success"},"children":["added by you  "]},
          {"type":"Text","props":{"color":"text"},"children":["sm…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"kind-new","label":"+ New task type (n)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New task type (n)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"kinds-hidden-keys","display":"none"},
        "children": [{"type":"Button","props":{"key":"kind-new-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}}]
      },
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" new type"]}
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
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"kinds-back","label":"Settings","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":[""]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Task types"]},
          {"type":"Text","props":{"color":"inactive"},"children":["8 task types · 2 changed by you · 1 off"]},
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [{"type":"Button","props":{"key":"kinds-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["  NAME                           FROM          WH…"]},
      {
        "type": "Button",
        "props": {"key":"kindRow:change","label":"change: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["❯ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["change                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["a …"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:bug","label":"bug: off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["bug                            "]},
          {"type":"Text","props":{"color":"inactive"},"children":["off           "]},
          {"type":"Text","props":{"color":"inactive"},"children":["so…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:feature","label":"feature: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["feature                        "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["ne…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:refactor","label":"refactor: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["refactor                       "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["cl…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:docs","label":"docs: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["docs                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["do…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:investigation","label":"investigation: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["investigation                  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["fi…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:errand","label":"errand: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["errand                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["ge…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:chore-and-upkeep-of-the-build","label":"chore-and-upkeep-of-the-build: added by you","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["chore-and-upkeep-of-the-build  "]},
          {"type":"Text","props":{"color":"success"},"children":["added by you  "]},
          {"type":"Text","props":{"color":"text"},"children":["sm…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"kind-new","label":"+ New task type (n)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New task type (n)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"kinds-hidden-keys","display":"none"},
        "children": [{"type":"Button","props":{"key":"kind-new-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}}]
      },
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" new type"]}
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
      {
        "type": "Box",
        "props": {"key":"page-header","flexDirection":"column"},
        "children": [
          {
            "type": "Box",
            "props": {"key":"hdr-where","flexDirection":"row"},
            "children": [
              {"type":"Text","props":{"color":"inactive"},"children":["‹ "]},
              {"type":"Button","props":{"key":"kinds-back","label":"Settings","variant":"secondary"},"press":{"plugin":"symcc"}},
              {"type":"Text","props":{"color":"inactive"},"children":["                                      "]},
              {"type":"Text","props":{"color":"inactive"},"children":[""]}
            ]
          },
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["Task types"]},
          {"type":"Text","props":{"color":"inactive"},"children":["8 task types · 2 changed by you · 1 off"]},
          {
            "type": "Box",
            "props": {"key":"hdr-keys","display":"none"},
            "children": [{"type":"Button","props":{"key":"kinds-back-key","label":"b","hotkey":"b"},"press":{"plugin":"symcc"}}]
          },
          {
            "type": "Box",
            "props": {"key":"hdr-rule","flexDirection":"column"},
            "children": [{"type":"Text","props":{"wrap":"truncate","color":"ide"},"children":["──────────────────────────────────────────────────"]}]
          }
        ]
      },
      {"type":"Text","props":{"wrap":"truncate","color":"inactive"},"children":["  NAME                           FROM          WH…"]},
      {
        "type": "Button",
        "props": {"key":"kindRow:change","label":"change: built-in","plain":true,"autoFocus":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["❯ "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["change                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["a …"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:bug","label":"bug: off","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["bug                            "]},
          {"type":"Text","props":{"color":"inactive"},"children":["off           "]},
          {"type":"Text","props":{"color":"inactive"},"children":["so…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:feature","label":"feature: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["feature                        "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["ne…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:refactor","label":"refactor: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["refactor                       "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["cl…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:docs","label":"docs: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["docs                           "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["do…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:investigation","label":"investigation: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["investigation                  "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["fi…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:errand","label":"errand: built-in","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["errand                         "]},
          {"type":"Text","props":{"color":"inactive"},"children":["built-in      "]},
          {"type":"Text","props":{"color":"text"},"children":["ge…"]}
        ]
      },
      {
        "type": "Button",
        "props": {"key":"kindRow:chore-and-upkeep-of-the-build","label":"chore-and-upkeep-of-the-build: added by you","plain":true},
        "press": {"plugin":"symcc"},
        "children": [
          {"type":"Text","props":{"bold":true,"color":"ide","weight":"semibold"},"children":["  "]},
          {"type":"Text","props":{"bold":true,"color":"claude","weight":"semibold"},"children":["chore-and-upkeep-of-the-build  "]},
          {"type":"Text","props":{"color":"success"},"children":["added by you  "]},
          {"type":"Text","props":{"color":"text"},"children":["sm…"]}
        ]
      },
      {"type":"Text","children":[" "]},
      {
        "type": "Button",
        "props": {"key":"kind-new","label":"+ New task type (n)","plain":true},
        "press": {"plugin":"symcc"},
        "children": [{"type":"Text","props":{"color":"text"},"children":["  + New task type (n)"]}]
      },
      {
        "type": "Box",
        "props": {"key":"kinds-hidden-keys","display":"none"},
        "children": [{"type":"Button","props":{"key":"kind-new-key","label":"n","hotkey":"n"},"press":{"plugin":"symcc"}}]
      },
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
                  {"type":"Text","props":{"color":"inactive"},"children":[" new type"]}
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
          {"type":"Text","props":{"bold":true,"color":"text"},"children":["a general change when no other task type fits (the default)"]}
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
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a general change when no other task type fits (the default)"]}
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
          {"type":"Text","props":{"bold":true,"color":"text","weight":"semibold"},"children":["a general change when no other task type fits (the default)"]}
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
