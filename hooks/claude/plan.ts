// Claude Code's plan mode signals. Claude Code has no call for the mode and no event when it changes, so
// symcc learns it from fields on some events (see docs/research/plan-mode.md):
//   classic.* events (not classic.PreToolUse): e.permission_mode
//   agent.spawn: e.permissionMode
//   prompt.attachment of type plan_mode / plan_mode_reentry (on) and plan_mode_exit (off)
// core/plan.ts and plugin/plan.ts work on plain on (true) / off (false) / says nothing (null).
// planFromMode and planFromAttachment are still defined in core/plan.ts because register.tsx imports them from
// ./board (it may not change in T-242); take them from here. They move here with T-243.
export { planFromMode, planFromAttachment } from '../core/plan'
