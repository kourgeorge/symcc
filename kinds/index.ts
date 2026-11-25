// The built-in task types' texts, by name (one module each, like the worker prompts in prompts/).
import change from './change'
import bug from './bug'
import feature from './feature'
import refactor from './refactor'
import docs from './docs'
import investigation from './investigation'
import errand from './errand'

export const BUILT_IN_KIND_TEXTS: Readonly<Record<string, string>> = { change, bug, feature, refactor, docs, investigation, errand }
