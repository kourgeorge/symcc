# Engine and clients

For people who change symcc's code. symcc is split into two sides: the **engine** (the part that does the work) and the **clients** (the parts that plug the engine into one program). This page says where the line is, the rule that keeps it, and which checks watch it. The plan behind it is section 12 of [the standalone app note](research/standalone-app.md).

## The boundary

| Side | What it is | Where it lives |
|---|---|---|
| Engine | Board logic, prompts, the entry functions, the `Host` interface, the process runner, and the screen helpers that need no host | `hooks/core/`, `hooks/app/`, `hooks/process/`, `hooks/host.ts`, `hooks/board.ts`, `hooks/name.ts`, `prompts/`, `kinds/`, `types/`, `hooks/opencode/board-view.ts`, and `hooks/engine.ts` |
| Client (host adapter) | Code that knows one program: its tools, screens, hooks and plugin files | `hooks/claude/`, `hooks/register.tsx`, `hooks/opencode/` (except `board-view.ts`), `opencode/`, `hosts/node/` |

`hooks/opencode/board-view.ts` holds no OpenCode code, so it counts as engine, even though it sits in an OpenCode folder. Moving it is left for later (see "What is done and what is next").

## The rule

- The engine never imports a host. No import of `hooks/claude/`, `hooks/opencode/` (the one exception is `board-view.ts`, which `hooks/engine.ts` may re-export), `hosts/node/`, `hooks/register.tsx`, `claude-code`, OpenCode, a Node built-in or Bun. Comments that only name a host are fine. Only imports count.
- Hosts should reach the engine through `hooks/engine.ts` only. Today they still import the engine files directly. Switching them is a later step.

## hooks/engine.ts

`hooks/engine.ts` is a list: it only re-exports names, it holds no code. It lists what the hosts use from the engine. Nothing imports it yet. The list may lag behind the hosts: a host can start using a name before it is added here. It gets brought up to date when the split starts.

## The checks

- `tests/host-free.sh` (run by `sh scripts/typecheck.sh`) fails when the engine imports a host. This is the check that fails.
- `tests/engine-names.mjs` (run by `tests/host-free.sh`) compares the list with the names the hosts import. A difference is reported as a note and never fails the tests.
- `tests/engine.test.ts` checks that each name in `hooks/engine.ts` is the same value as in its source file.

Run the first one alone with `sh tests/host-free.sh`.

## What is done and what is next

Done now (no code moves, nothing the owner sees changes): the `host-free` check also covers `hooks/process/`, `board-view.ts` and `hooks/engine.ts`, and `hooks/engine.ts` exists as a list.

Next, for when the separate app is built:

- Move the screen helpers out of `hooks/opencode/` (S1 in the note).
- Point the three hosts at `hooks/engine.ts` (S4).
- Add a check that hosts import the engine only through `hooks/engine.ts` (S5).

## The export list

This is the list in `hooks/engine.ts`, by the file each name comes from (paths are relative to the project folder; `hooks/app/ask` means `hooks/app/ask.ts`). A name marked `type` is a type only.

**`hooks/app/ask`**: `ASK_TOOL_DEF`, `hookFailed`, `listedKind`

**`hooks/app/board-mode`**: `setBoardMode`, `stopForQuit`

**`hooks/app/git`**: `setupGit`

**`hooks/app/kinds`**: `changeKind`, `kindDraftOf`, `kindLists`, `kindView`, `loadKinds`, `newKindFile`, `saveKindDraft`

**`hooks/app/logo`**: `logoNow`, `noteLogoWidth`

**`hooks/app/open`**: `openPane`, `paneArgs`, `type PaneTab`, `resetPane`

**`hooks/app/org-mem`**: `deleteOrgMem`, `orgMemNow`, `orgMemView`, `resetOrgMemView`

**`hooks/app/plan`**: `seePlan`

**`hooks/app/questions`**: `answerOnBoard`, `boardAnswered`, `popupCall`

**`hooks/app/review`**: `changedFiles`, `folderDiff`

**`hooks/app/roles`**: `changeRole`, `loadRoles`, `newRoleFile`, `roleDraftOf`, `roleLists`, `roleView`, `saveRoleDraft`

**`hooks/app/scouts`**: `cancelScoutEdit`, `editScout`, `loadScoutResults`, `loadScoutRunHistory`, `newScout`, `readScoutRunReport`, `runScoutNow`, `saveScout`, `scoutPlace`, `scoutPlaceValue`, `setScoutPaused`

**`hooks/app/starts`**: `drainStarts`, `leadTurn`, `StartCancelled`

**`hooks/app/state`**: `approving`, `changesCache`, `checkerRuns`, `finishing`, `openDays`, `type PaneView`, `queuedWorkers`, `S`, `scoutRuns`, `starting`, `toolName`, `useName`, `workers`

**`hooks/app/store`**: `findRoot`, `isAbsolute`, `isWorkerFolder`, `load`, `mainRoot`, `normalPath`, `path`, `safeWrite`

**`hooks/app/symcc`**: `agentFinished`, `type AgentRunEnd`, `BOARD_OPENED`, `type CommandAnswer`, `COMMANDS`, `guardStart`, `leadGuideText`, `leadUpdate`, `otherToolDone`, `ownerTyped`, `runCommand`, `sessionCleared`, `sessionEnd`, `sessionStart`, `sessionStarting`, `toolCall`, `toolCallFailed`, `toolCheck`, `toolCheckFailed`

**`hooks/app/tell`**: `brief`, `noteForLead`, `tellLead`

**`hooks/app/tools`**: `allowAskedFiles`, `ownerSettings`, `refuseAskedFiles`, `runTool`, `TOOLS`

**`hooks/app/workers`**: `agentOnBoard`, `mergeOutcome`, `mergingNow`, `pump`, `type TurnEnd`

**`hooks/board`**: `actionButtonLabel`, `ALL_CLEAR`, `ALWAYS_ON_KINDS`, `answerChoices`, `answeredLeadLine`, `answerText`, `archivedNote`, `archivedOf`, `BACKLOG_SHOWN`, `backlogMoreLabel`, `BAD_EVERY_STATE`, `bandBrand`, `bandLeads`, `bandNote`, `bandWhere`, `bannerCounts`, `bannerLines`, `bannerRule`, `type BannerTone`, `type BoardTask`, `boxHint`, `canMarkMerged`, `canPickRole`, `cantPlayNotify`, `checkerOn`, `copyToast`, `crossBranchNotes`, `cutDiff`, `DEFAULT_ROLE`, `type DetailRow`, `detailRows`, `DIFF_COLOR`, `DIFF_LINES`, `type DiffFile`, `diffKeys`, `diffKinds`, `emptyBoard`, `everyMinutesOf`, `everyText`, `failAsks`, `failNext`, `fileWaitText`, `findKind`, `findRole`, `fitRow`, `fmtDuration`, `fmtRun`, `fmtTotal`, `foldedRow`, `folderName`, `footerRule`, `groupLabel`, `groupSummaryParts`, `hintLines`, `intoOf`, `isAnswered`, `isCheckerRole`, `isInvestigation`, `isNothing`, `isScoutRunReport`, `isSettingPage`, `type KeyHint`, `type KindDef`, `kindMark`, `kindNameError`, `kindsKeys`, `kindTag`, `listKeys`, `localOffset`, `mergeKinds`, `mergeRoles`, `MODE_MEANING`, `MODE_NAME`, `modeButton`, `modeLabel`, `modeOf`, `needsYou`, `newestFirst`, `nextMode`, `offStatusParts`, `originOf`, `originSegs`, `type OwnerQuestion`, `ownersTurn`, `packRows`, `panelSections`, `parseScoutRuns`, `parseSettingValue`, `pickHint`, `planBandText`, `promptsOfRole`, `questionsForYou`, `questionsLabel`, `ROLE_PLACEHOLDERS`, `ROLE_PROMPTS`, `ROLE_SLOT`, `roleChoices`, `type RoleDef`, `roleEditKeys`, `roleKeys`, `roleMark`, `roleNameError`, `roleOf`, `rolePromptKeys`, `type RolePromptKind`, `rolesKeys`, `roleTag`, `rowCell`, `rowEndText`, `rowExtra`, `rowMark`, `rowStates`, `safeScoutFile`, `type ScoutEditField`, `scoutEditKeys`, `scoutFile`, `scoutHowTo`, `scoutIcon`, `scoutKeys`, `scoutLastRunProblem`, `scoutLastText`, `scoutListKeys`, `scoutListRows`, `scoutOutcomeTone`, `scoutRow`, `scoutRunLine`, `scoutRunsFile`, `scoutRunTasks`, `scoutTone`, `SEARCH_WORDS`, `searchBoxHint`, `searchLine`, `searchTasks`, `SECTION_LABEL`, `type Seg`, `SETTING_GROUPS`, `settingChoices`, `settingInfo`, `type SettingName`, `type SettingPage`, `SETTINGS`, `type SettingsInput`, `settingsKeys`, `settingValue`, `shownStatus`, `showsAnswer`, `sortScouts`, `type StageMark`, `stageSegs`, `STATE_LABEL`, `stateText`, `STATUS_BADGE`, `STATUS_MARK`, `STATUS_WORD`, `statusBadge`, `statusCell`, `statusCounts`, `statusMark`, `sumRuns`, `type TaskAction`, `type TaskActionId`, `taskActions`, `taskAsks`, `taskCopyText`, `taskKeys`, `taskPhase`, `taskReports`, `taskStage`, `testsShort`, `TITLE_ROOM`, `versionMark`, `whyFailed`, `withCrew`, `wrapSegs`, `YOUR_EDITS`

**`hooks/core/ask`**: `ASK_TOOL`

**`hooks/core/banner`**: `shortHome`

**`hooks/core/board-file`**: `normId`

**`hooks/core/days`**: `when`

**`hooks/core/def-files`**: `type BrokenDef`, `brokenLabel`, `brokenNamed`, `defNamed`, `defSource`, `type DefSource`, `sourceLabel`

**`hooks/core/history`**: `HISTORY_COLOR`, `historyEvent`, `historyTime`

**`hooks/core/org-mem`**: `ORG_MEM_EMPTY`, `ORG_MEM_TITLE`, `orgMemAbout`, `orgMemCount`, `orgMemDeleteAsk`, `orgMemFile`, `orgMemKeys`, `type OrgMemNote`, `orgMemNoteHead`, `orgMemNoteKey`, `orgMemSummary`

**`hooks/core/path-guard`**: `spawnFailedText`

**`hooks/core/prompts`**: `basePromptFor`, `SCOUT_BASE`, `WORKER_BASE`

**`hooks/core/questions`**: `normQid`

**`hooks/core/roles`**: `ROLE_TOOL_WORDS`

**`hooks/core/runs`**: `cleanTokens`, `fmtTokens`, `sumTokens`, `TOKEN_KINDS`, `tokenCount`

**`hooks/core/scouts`**: `SCOUT_BOARD_TOOLS`

**`hooks/core/stats`**: `type LeadCall`, `rangeSpan`, `type StatsRange`

**`hooks/core/task-sections`**: `type SectionLine`, `type TaskSection`, `taskSections`

**`hooks/core/text`**: `jsonObj`, `squash`

**`hooks/host`**: `ALL_FEATURES`, `type FileTouch`, `type Host`, `type HostAgent`, `type HostAgentKind`, `type HostAgentStart`, `type HostFeatures`, `type HostFileEntry`, `type HostFileStat`, `type HostLead`, `type HostRunResult`, `type HostWords`, `type LeadSend`, `type LeadUsage`, `manifestVersion`, `noUi`, `type PanelValues`, `SYMCC_WORDS`

**`hooks/name`**: `cleanName`, `dataDir`, `DEFAULT_NAME`, `ICON`, `namesFor`

**`hooks/opencode/board-view`**: `actionCommand`, `answerOptions`, `approveInProgress`, `approveSent`, `type ApproveSent`, `bandDraw`, `type BandHit`, `CHOICE_KEYS`, `type ChoiceKey`, `groupId`, `groupOf`, `GROUPS_OPEN`, `hasPage`, `LETTER_KEYS`, `type LetterKey`, `type Line`, `moveCursor`, `orgMemNoteOf`, `OWN_ANSWER`, `PANEL_TABS`, `type PanelAction`, `type PanelGroup`, `type PanelHit`, `type PanelKey`, `panelKeys`, `panelLines`, `panelRoleChoices`, `type PanelTab`, `panelTaskActions`, `parseViewFile`, `type ScoutRuns`, `scoutRunsIn`, `settingGroupId`, `settingGroupOf`, `SETTINGS_OPEN`, `settingsPlace`, `TASK_ACTION_COMMANDS`, `VIEW_FILE`, `VIEW_RUNS_KEPT`, `type ViewChanges`, `type ViewDef`, `viewDefs`, `type ViewFile`, `viewFileText`

**`hooks/process/agents`**: `type AgentRunner`, `processAgents`, `type ProcessAgents`

**`hooks/process/claude-runner`**: `claudeRunner`

**`hooks/process/record`**: `PROCESSES_FILE`

**`hooks/process/system`**: `type ProcessSystem`

**`types`**: `type SymccMode`, `type SymccScout`, `type SymccStatus`, `type SymccTask`, `type SymccTokens`, `type SymccView`

