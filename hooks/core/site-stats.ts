// T-1145: the numbers for the website's "Built with symcc" page: aggregates of a project's own board, made from the
// stats code (statsData). Only counts, times, tokens, day names, role names and scout names go out: never a task
// title, detail, owner request, report text or path. Pure; scripts/site-stats.ts reads the files and writes the JSON,
// scripts/build-site.ts (siteStatsHtml in scripts/site-stats-html.ts) draws it.
import type { SymccTask } from '../../types'
import { dayOf } from './days'
import { billedTokens, tokenCount } from './runs'
import { doneAtMs, median, mean, originKey, statsData, taskFigures, type StatsData, type TeamInput } from './stats'
import { isInvestigation } from './board-file'

export type SiteCount = { key: string; label: string; n: number }
export type SiteStats = {
  /** the first commit's day and the day the script ran */
  from: string
  to: string
  days: number
  tasks: { done: number; dropped: number; answered: number; errands: number; total: number }
  tries: { total: number; firstTry: number; changeTasksWithData: number; firstTryRate: number | null }
  endedHow: SiteCount[]
  failedTries: SiteCount[]
  workMs: number
  tokens: { workers: SiteTokens; lead: SiteTokens | null; scouts: SiteTokens; total: SiteTokens }
  perDone: { medianMs: number | null; avgMs: number | null; medianTokens: number | null; avgTokens: number | null; medianBilled: number | null; avgBilled: number | null }
  stages: { stage: string; label: string; avgMs: number }[]
  roles: { role: string; n: number }[]
  origins: { key: string; label: string; n: number }[]
  scouts: { name: string; found: number; merged: number; dropped: number; open: number; tokens: number }[]
  perDay: { day: string; done: number }[]
}
export type SiteTokens = { all: number; billed: number }

const tok = (t: Parameters<typeof tokenCount>[0]): SiteTokens => ({ all: tokenCount(t), billed: Math.round(billedTokens(t)) })
const num = (x: number | undefined): number | null => (x === undefined || !Number.isFinite(x) ? null : Math.round(x))
const clean = (s: string) => s.replace(/[^\w .-]/g, '').slice(0, 40)

/** The site numbers for `tasks` (the board's and the archived ones, finished tasks whole), as of `nowMs`. */
export function siteStats(input: { tasks: SymccTask[]; archived?: SymccTask[]; nowMs: number; from: string; team?: TeamInput; offsetMin?: number }): SiteStats {
  const off = input.offsetMin ?? 0
  const d: StatsData = statsData({ tasks: input.tasks, archived: input.archived, nowMs: input.nowMs, offsetMin: off, team: input.team ?? {} })
  const onBoard = new Set(input.tasks.map(t => t.id))
  const every = [...input.tasks, ...(input.archived ?? []).filter(t => !onBoard.has(t.id))]
  const to = dayOf(input.nowMs, off)
  const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
  const team = d.team?.data
  const workers = tok(d.tokens)
  const scouts = tok(team?.scouts.tokens)
  const lead = team?.lead ? tok(team.lead.tokens) : null
  const total = tok(team?.total ?? d.tokens)
  const doneChange = every.filter(t => t.status === 'done' && !isInvestigation(t as { kind?: unknown }))
  const billed = doneChange.map(t => taskFigures(t, input.nowMs)).filter(f => f.hasData && f.tokens !== undefined).map(f => billedTokens(f.tokens))
  const perDay = new Map<string, number>()
  for (const t of every) {
    if (t.status !== 'done' || isInvestigation(t as { kind?: unknown })) continue
    const day = dayOf(doneAtMs(t) ?? Date.parse(t.updated_at || ''), off)
    if (day) perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  const tasksOf = (key: string) => every.filter(t => originKey(t) === key || (key === 'scout' && originKey(t).startsWith('scout')))
  const scoutRows = (d.origins.find(o => o.key === 'scout')?.scouts ?? []).map(s => ({ name: clean(s.key), found: s.results.tasks, merged: s.results.merged, dropped: s.results.dropped, open: s.results.open, tokens: s.results.scoutTokens }))
  return {
    from: input.from,
    to,
    days: Math.max(1, Math.round((dayMs(to) - dayMs(input.from)) / 86_400_000) + 1),
    tasks: { done: d.done, dropped: d.states.find(s => s.status === 'dropped')?.n ?? 0, answered: d.answered, errands: d.errandsDone, total: d.total },
    tries: { total: d.perTry.n, firstTry: d.first, changeTasksWithData: d.doneWithData, firstTryRate: d.doneWithData ? Math.round((d.first / d.doneWithData) * 1000) / 10 : null },
    endedHow: d.ended.map(e => ({ key: e.label.replace(/\W+/g, '-'), label: e.label, n: e.n })),
    failedTries: d.failed.map(f => ({ key: f.key, label: f.label, n: f.n })),
    workMs: Math.round(d.workMs),
    tokens: { workers, lead, scouts, total },
    perDone: { medianMs: num(d.perDone.medianMs), avgMs: num(d.perDone.avgMs), medianTokens: num(d.perDone.medianTok), avgTokens: num(d.perDone.avgTok), medianBilled: num(median(billed)), avgBilled: num(mean(billed)) },
    stages: d.stages.stages.map(s => ({ stage: s.stage, label: s.label, avgMs: Math.round(s.avgMs) })),
    roles: d.roles.map(r => ({ role: clean(r.key), n: r.n })),
    origins: d.origins.map(o => ({ key: o.key, label: o.key === 'scout' ? 'scouts' : o.key === 'owner' ? 'the owner' : o.key === 'worker' ? 'workers' : o.key === 'lead' ? 'the lead' : 'unknown', n: tasksOf(o.key).length })),
    scouts: scoutRows,
    perDay: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, done]) => ({ day, done })),
  }
}
