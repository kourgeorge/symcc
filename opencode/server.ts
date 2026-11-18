// symcc's OpenCode 2.x server plugin entry (T-462). OpenCode loads a plugin folder's server.ts and tui.ts by name
// (no "exports" in package.json), and wants a default export { id, setup }: the copy for a project's main folder runs
// symcc's board, the copies in workers' folders only guard their edits. See hooks/opencode/plugin.ts.
import { symccServer } from '../hooks/opencode/plugin'

export default symccServer()
