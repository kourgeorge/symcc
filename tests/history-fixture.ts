// Test helper (T-522): history entries from lines, as the one-time conversion of an old board makes them
// (the kind guessed from the text, no time), so a fixture can be written as plain lines.
import type { HistoryEntry } from '../hooks/core/history'
import { oldHistoryEntry } from '../hooks/core/old-data'

/** History entries for `lines`, oldest first (kinds guessed from the text, no times). */
export const hist = (...lines: string[]): HistoryEntry[] => lines.map(l => oldHistoryEntry(l))
