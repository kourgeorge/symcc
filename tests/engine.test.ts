// T-635: hooks/engine.ts re-exports the engine names the hosts use, and each one must be the very same value as in
// the file it comes from. tests/engine-names.mjs (run by tests/host-free.sh) checks the list against the hosts'
// import lines; this test checks the values: every value name below (one row per `export { ... } from` line of
// hooks/engine.ts, types left out) is exported by hooks/engine.ts and is the same value as in its source file, and
// hooks/engine.ts exports no value this table does not name. Add a row here when a line is added to hooks/engine.ts.
import { expect, test } from 'claude-code/testing'
import * as engine from '../hooks/engine'
import * as m_app_ask from '../hooks/app/ask'
import * as m_app_board_mode from '../hooks/app/board-mode'
import * as m_app_git from '../hooks/app/git'
import * as m_app_kinds from '../hooks/app/kinds'
import * as m_app_logo from '../hooks/app/logo'
import * as m_app_open from '../hooks/app/open'
import * as m_app_org_mem from '../hooks/app/org-mem'
import * as m_app_plan from '../hooks/app/plan'
import * as m_app_questions from '../hooks/app/questions'
import * as m_app_review from '../hooks/app/review'
import * as m_app_roles from '../hooks/app/roles'
import * as m_app_scouts from '../hooks/app/scouts'
import * as m_app_starts from '../hooks/app/starts'
import * as m_app_state from '../hooks/app/state'
import * as m_app_store from '../hooks/app/store'
import * as m_app_symcc from '../hooks/app/symcc'
import * as m_app_tell from '../hooks/app/tell'
import * as m_app_tools from '../hooks/app/tools'
import * as m_app_workers from '../hooks/app/workers'
import * as m_board from '../hooks/board'
import * as m_core_ask from '../hooks/core/ask'
import * as m_core_banner from '../hooks/core/banner'
import * as m_core_board_file from '../hooks/core/board-file'
import * as m_core_days from '../hooks/core/days'
import * as m_core_def_files from '../hooks/core/def-files'
import * as m_core_history from '../hooks/core/history'
import * as m_core_org_mem from '../hooks/core/org-mem'
import * as m_core_path_guard from '../hooks/core/path-guard'
import * as m_core_prompts from '../hooks/core/prompts'
import * as m_core_questions from '../hooks/core/questions'
import * as m_core_roles from '../hooks/core/roles'
import * as m_core_runs from '../hooks/core/runs'
import * as m_core_scouts from '../hooks/core/scouts'
import * as m_core_stats from '../hooks/core/stats'
import * as m_core_task_sections from '../hooks/core/task-sections'
import * as m_core_text from '../hooks/core/text'
import * as m_host from '../hooks/host'
import * as m_name from '../hooks/name'
import * as m_opencode_board_view from '../hooks/opencode/board-view'
import * as m_process_agents from '../hooks/process/agents'
import * as m_process_claude_runner from '../hooks/process/claude-runner'
import * as m_process_record from '../hooks/process/record'
const SOURCES: [string, Record<string, unknown>, string[]][] = [
  ['./app/ask', m_app_ask, ["ASK_TOOL_DEF","hookFailed","listedKind"]],
  ['./app/board-mode', m_app_board_mode, ["setBoardMode","stopForQuit"]],
  ['./app/git', m_app_git, ["setupGit"]],
  ['./app/kinds', m_app_kinds, ["changeKind","kindDraftOf","kindLists","kindView","loadKinds","newKindFile","saveKindDraft"]],
  ['./app/logo', m_app_logo, ["logoNow","noteLogoWidth"]],
  ['./app/open', m_app_open, ["openPane","paneArgs","resetPane"]],
  ['./app/org-mem', m_app_org_mem, ["deleteOrgMem","orgMemNow","orgMemView","resetOrgMemView"]],
  ['./app/plan', m_app_plan, ["seePlan"]],
  ['./app/questions', m_app_questions, ["answerOnBoard","boardAnswered","popupCall"]],
  ['./app/review', m_app_review, ["changedFiles","folderDiff"]],
  ['./app/roles', m_app_roles, ["changeRole","loadRoles","newRoleFile","roleDraftOf","roleLists","roleView","saveRoleDraft"]],
  ['./app/scouts', m_app_scouts, ["cancelScoutEdit","editScout","loadScoutResults","loadScoutRunHistory","newScout","readScoutRunReport","runScoutNow","saveScout","scoutPlace","scoutPlaceValue","setScoutPaused"]],
  ['./app/starts', m_app_starts, ["drainStarts","leadTurn","StartCancelled"]],
  ['./app/state', m_app_state, ["approving","changesCache","checkerRuns","finishing","openDays","queuedWorkers","S","scoutRuns","starting","toolName","useName","workers"]],
  ['./app/store', m_app_store, ["findRoot","isAbsolute","isWorkerFolder","load","mainRoot","normalPath","path","safeWrite"]],
  ['./app/symcc', m_app_symcc, ["agentFinished","BOARD_OPENED","COMMANDS","guardStart","leadGuideText","leadUpdate","otherToolDone","ownerTyped","runCommand","sessionCleared","sessionEnd","sessionStart","sessionStarting","toolCall","toolCallFailed","toolCheck","toolCheckFailed"]],
  ['./app/tell', m_app_tell, ["brief","noteForLead","tellLead"]],
  ['./app/tools', m_app_tools, ["allowAskedFiles","ownerSettings","refuseAskedFiles","runTool","TOOLS"]],
  ['./app/workers', m_app_workers, ["agentOnBoard","mergeOutcome","mergingNow","pump"]],
  ['./board', m_board, ["actionButtonLabel","ALL_CLEAR","ALWAYS_ON_KINDS","answerChoices","answeredLeadLine","answerText","archivedNote","archivedOf","BACKLOG_SHOWN","backlogMoreLabel","BAD_EVERY_STATE","bandBrand","bandLeads","bandNote","bandWhere","bannerCounts","bannerLines","bannerRule","boxHint","canMarkMerged","canPickRole","cantPlayNotify","checkerOn","copyToast","crossBranchNotes","cutDiff","DEFAULT_ROLE","detailRows","DIFF_COLOR","DIFF_LINES","diffKeys","diffKinds","emptyBoard","everyMinutesOf","everyText","failAsks","failNext","fileWaitText","findKind","findRole","fitRow","fmtDuration","fmtRun","fmtTotal","foldedRow","folderName","footerRule","groupLabel","groupSummaryParts","hintLines","intoOf","isAnswered","isCheckerRole","isInvestigation","isNothing","isScoutRunReport","isSettingPage","kindMark","kindNameError","kindsKeys","kindTag","listKeys","localOffset","mergeKinds","mergeRoles","MODE_MEANING","MODE_NAME","modeButton","modeLabel","modeOf","needsYou","newestFirst","nextMode","offStatusParts","originOf","originSegs","ownersTurn","packRows","panelSections","parseScoutRuns","parseSettingValue","pickHint","planBandText","promptsOfRole","questionsForYou","questionsLabel","ROLE_PLACEHOLDERS","ROLE_PROMPTS","ROLE_SLOT","roleChoices","roleEditKeys","roleKeys","roleMark","roleNameError","roleOf","rolePromptKeys","rolesKeys","roleTag","rowCell","rowEndText","rowExtra","rowMark","rowStates","safeScoutFile","scoutEditKeys","scoutFile","scoutHowTo","scoutIcon","scoutKeys","scoutLastRunProblem","scoutLastText","scoutListKeys","scoutListRows","scoutOutcomeTone","scoutRow","scoutRunLine","scoutRunsFile","scoutRunTasks","scoutTone","SEARCH_WORDS","searchBoxHint","searchLine","searchTasks","SECTION_LABEL","SETTING_GROUPS","settingChoices","settingInfo","SETTINGS","settingsKeys","settingValue","shownStatus","showsAnswer","sortScouts","stageSegs","STATE_LABEL","stateText","STATUS_BADGE","STATUS_MARK","STATUS_WORD","statusBadge","statusCell","statusCounts","statusMark","sumRuns","taskActions","taskAsks","taskCopyText","taskKeys","taskPhase","taskReports","taskStage","testsShort","TITLE_ROOM","versionMark","whyFailed","withCrew","wrapSegs","YOUR_EDITS"]],
  ['./core/ask', m_core_ask, ["ASK_TOOL"]],
  ['./core/banner', m_core_banner, ["shortHome"]],
  ['./core/board-file', m_core_board_file, ["normId"]],
  ['./core/days', m_core_days, ["when"]],
  ['./core/def-files', m_core_def_files, ["brokenLabel","brokenNamed","defNamed","defSource","sourceLabel"]],
  ['./core/history', m_core_history, ["HISTORY_COLOR","historyEvent","historyTime"]],
  ['./core/org-mem', m_core_org_mem, ["ORG_MEM_EMPTY","ORG_MEM_TITLE","orgMemAbout","orgMemCount","orgMemDeleteAsk","orgMemFile","orgMemKeys","orgMemNoteHead","orgMemNoteKey","orgMemSummary"]],
  ['./core/path-guard', m_core_path_guard, ["spawnFailedText"]],
  ['./core/prompts', m_core_prompts, ["basePromptFor","SCOUT_BASE","WORKER_BASE"]],
  ['./core/questions', m_core_questions, ["normQid"]],
  ['./core/roles', m_core_roles, ["ROLE_TOOL_WORDS"]],
  ['./core/runs', m_core_runs, ["cleanTokens","fmtTokens","sumTokens","TOKEN_KINDS","tokenCount"]],
  ['./core/scouts', m_core_scouts, ["SCOUT_BOARD_TOOLS"]],
  ['./core/stats', m_core_stats, ["rangeSpan"]],
  ['./core/task-sections', m_core_task_sections, ["taskSections"]],
  ['./core/text', m_core_text, ["jsonObj","squash"]],
  ['./host', m_host, ["ALL_FEATURES","manifestVersion","noUi","SYMCC_WORDS"]],
  ['./name', m_name, ["cleanName","dataDir","DEFAULT_NAME","ICON","namesFor"]],
  ['./opencode/board-view', m_opencode_board_view, ["actionCommand","answerOptions","approveInProgress","approveSent","bandDraw","CHOICE_KEYS","groupId","groupOf","GROUPS_OPEN","hasPage","LETTER_KEYS","moveCursor","orgMemNoteOf","OWN_ANSWER","PANEL_TABS","panelKeys","panelLines","panelRoleChoices","panelTaskActions","parseViewFile","scoutRunsIn","settingGroupId","settingGroupOf","SETTINGS_OPEN","settingsPlace","TASK_ACTION_COMMANDS","VIEW_FILE","VIEW_RUNS_KEPT","viewDefs","viewFileText"]],
  ['./process/agents', m_process_agents, ["processAgents"]],
  ['./process/claude-runner', m_process_claude_runner, ["claudeRunner"]],
  ['./process/record', m_process_record, ["PROCESSES_FILE"]],
]

const E = engine as Record<string, unknown>

test('every value hooks/engine.ts re-exports is defined and the same value as in its source file', () => {
  const wrong: string[] = []
  for (const [from, src, names] of SOURCES) {
    for (const name of names) {
      if (!(name in src) || src[name] === undefined) wrong.push(`${name}: not a value in ${from}`)
      else if (E[name] !== src[name]) wrong.push(`${name}: hooks/engine.ts differs from ${from}`)
    }
  }
  expect(wrong).toEqual([])
})

test('hooks/engine.ts exports no value the table above leaves out, and each name once', () => {
  const named = SOURCES.flatMap(([, , names]) => names)
  expect(named.length).toBe(new Set(named).size)
  expect(Object.keys(engine).filter(k => !named.includes(k)).sort()).toEqual([])
  expect(named.filter(k => !(k in E)).sort()).toEqual([])
})
