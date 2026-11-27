// Test helper (T-522): timeline entries from lines, as the one-time conversion of an old board makes them
// (the kind guessed from the text, no time), so a fixture can be written as plain lines.
import type { TimelineEntry } from '../hooks/core/timeline'
import { oldTimelineEntry } from '../hooks/core/old-data'

/** Timeline entries for `lines`, oldest first (kinds guessed from the text, no times). */
export const hist = (...lines: string[]): TimelineEntry[] => lines.map(l => oldTimelineEntry(l))
