// The task board: plain data, kept in <project>/.<name>/board.json (see name.ts). Every function
// here is pure (takes a board, returns a new one) so it can be tested without Claude.
// The code lives in core/, one module per topic; this file only re-exports it (core/text.ts holds
// small shared helpers and is not re-exported).

export * from './core/board-file'
export * from './core/origin'
export * from './core/task'
export * from './core/review'
export * from './core/commands'
export * from './core/git-setup'
export * from './core/settings'
export * from './core/days'
export * from './core/panel'
export * from './core/runs'
export * from './core/commits'
export * from './core/banner'
export * from './core/scouts'
export * from './core/roles'
export * from './core/lead'
export * from './core/agents'
export * from './core/details'
export * from './core/archive'
export * from './core/history'
export * from './core/reports'
