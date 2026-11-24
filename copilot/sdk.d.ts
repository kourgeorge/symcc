// The two Copilot SDK modules copilot/entry.ts imports, declared loosely so this folder type-checks with no Copilot
// package installed (Copilot CLI gives them at run time). Their real shapes, the parts symcc uses, are typed by hand in
// hooks/copilot/sdk.ts (CpJoinSession, CpSdk); entry.ts casts to those.
declare module '@microsoft/copilot-sdk/extension' {
  export const joinSession: unknown
}

declare module '@microsoft/copilot-sdk' {
  export const CopilotClient: unknown
  export const RuntimeConnection: unknown
  export const approveAll: unknown
}
