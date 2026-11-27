// The part of bun:test these tests use, written by hand so the folder type-checks with no bun-types installed.

declare module 'bun:test' {
  export function test(name: string, fn: () => unknown | Promise<unknown>, timeoutMs?: number): void
  export function expect(value: unknown): {
    toBe(v: unknown): void
    toEqual(v: unknown): void
    toContain(v: unknown): void
    toMatch(v: RegExp | string): void
    toBeGreaterThan(v: number): void
    not: { toBe(v: unknown): void; toContain(v: unknown): void; toMatch(v: RegExp | string): void }
  }
}
