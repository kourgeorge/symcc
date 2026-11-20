// The one sync Node file call the OpenCode plugin uses (host.ts's stderrSay, T-586), declared by hand as
// hosts/node/env.d.ts does for the rest, so hooks/opencode/tsconfig.json type-checks with no @types/node.
declare module 'node:fs' {
  export function writeSync(fd: number, text: string): number
}
