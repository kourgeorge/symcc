// The Worktrees page: every folder the work happens in. Each task's worker builds in its own git worktree
// (<dir>/worktrees/<task>, on its own branch), so this is where each piece of work physically is: which branch, how
// far it is from the branch it merges into, what changed and what isn't committed, and what its agent does there now.
// The project itself and the owner's other checkouts of the repo close the list.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PanelLane, PanelStep, PanelTask, PanelView, PanelWorktree, WorktreeAction } from '../../protocol'
import { ask, tell } from './bridge'
import { Icon, STATION_WORD, Staff, ago, duration, useNow } from './parts'
import { latestStep, stepIcon, stepWords } from './session'

export type WorktreeList = { list: PanelWorktree[]; atMs: number; error?: string }
type Say = (text: string, bad?: boolean) => void

/** How often the page reads the worktrees again while it is open. */
const REREAD_MS = 5000
const FILES_SHOWN = 12

type Group = 'work' | 'you' | 'idle' | 'left' | 'mine'
const GROUPS: { key: Group; title: string; empty?: string }[] = [
  { key: 'work', title: 'At work' },
  { key: 'you', title: 'Waiting for you' },
  { key: 'idle', title: 'Paused or up next' },
  { key: 'left', title: 'Left over' },
  { key: 'mine', title: 'Your checkouts' },
]

type Row = { w: PanelWorktree; group: Group; task?: PanelTask; lane?: PanelLane }

function rowOf(w: PanelWorktree, view: PanelView): Row {
  if (w.kind !== 'task') return { w, group: 'mine' }
  const task = view.tasks.find(t => t.id === w.task)
  const lane = view.lanes.find(l => l.id === w.task && l.doneMs === undefined)
  const at = lane?.stations[lane.at]
  const finished = !lane && (!task || task.status === 'done' || task.status === 'dropped')
  const group: Group = w.missing || finished ? 'left' : task?.needsYou || at === 'you' ? 'you' : lane || task?.status === 'doing' ? 'work' : 'idle'
  return { w, group, ...(task ? { task } : {}), ...(lane ? { lane } : {}) }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function Worktrees({ view, steps, trees, onSay, onTask }: { view: PanelView; steps: Record<string, PanelStep[]>; trees: WorktreeList | null; onSay: Say; onTask: (id: string) => void }) {
  const now = useNow(1000)
  const [filter, setFilter] = useState('')
  const [asked, setAsked] = useState(0)
  // read again a while after each answer (so a slow disk never piles reads up), when the panel shows again, and when
  // the board moves a lane on (a merge, a new try)
  const moved = view.lanes.map(l => `${l.id}:${l.at}:${l.tryNo}:${l.doneMs ?? ''}`).join() + view.tasks.map(t => t.status).join()
  const read = () => {
    if (document.visibilityState !== 'visible') return
    setAsked(Date.now())
    tell({ type: 'worktrees' })
  }
  useEffect(read, [moved])
  useEffect(() => {
    if (!trees) return
    const t = setTimeout(read, REREAD_MS)
    return () => clearTimeout(t)
  }, [trees?.atMs])
  useEffect(() => {
    document.addEventListener('visibilitychange', read)
    return () => document.removeEventListener('visibilitychange', read)
  }, [])
  const reading = !trees || asked > trees.atMs
  const rows = useMemo(() => (trees?.list ?? []).map(w => rowOf(w, view)), [trees, view])
  const f = filter.trim().toLowerCase()
  const shown = f ? rows.filter(r => `${r.w.task ?? ''} ${r.task?.title ?? ''} ${r.w.branch} ${r.w.where}`.toLowerCase().includes(f)) : rows
  const atWork = rows.filter(r => r.group === 'work').length
  const left = rows.filter(r => r.group === 'left').length
  const workers = rows.filter(r => r.w.kind === 'task').length
  return (
    <div className="page trees">
      <div className="page-head">
        <h2>Worktrees</h2>
        <p className="trees-sum">
          {trees ? (
            <>
              <span>{plural(workers, "worker's folder", "workers' folders")}</span>
              {!!atWork && <span className="run">{atWork} at work</span>}
              {!!left && <span>{left} left over</span>}
              <span className="quiet">
                {reading ? 'reading…' : `read ${ago(trees.atMs, now) === 'now' ? 'just now' : `${ago(trees.atMs, now)} ago`}`}
              </span>
            </>
          ) : (
            <span className="quiet">Reading the worktrees…</span>
          )}
        </p>
        <label className="filter">
          <Icon name="search" />
          <span className="sr">Filter worktrees</span>
          <input type="search" placeholder="Filter by task, title, branch or folder" value={filter} onChange={e => setFilter(e.target.value)} />
        </label>
        <p className="quiet">
          Each task gets its own folder under <code>{view.dir}/worktrees</code> on its own branch, so workers never touch your checkout. Open one to look, test or edit before you approve.
        </p>
      </div>
      {trees?.error && (
        <p className="trees-error bad" role="alert">
          <Icon name="error" /> Couldn't read the worktrees: {trees.error}
          <button type="button" className="btn" onClick={() => tell({ type: 'worktrees' })}>
            Try again
          </button>
        </p>
      )}
      {trees && !trees.error && !workers && !f && <p className="quiet trees-none">No worker has a folder right now. One is made when a worker starts on a task, and removed once the task merges.</p>}
      {f && !shown.length && <p className="quiet">No worktree matches “{filter}”.</p>}
      {GROUPS.map(g => {
        const xs = shown.filter(r => r.group === g.key)
        if (!xs.length) return null
        return (
          <section key={g.key} className={`tree-group is-${g.key}`} aria-label={g.title}>
            <h3>
              {g.title} <span className="count">{xs.length}</span>
            </h3>
            <ul>
              {xs.map(r => (
                <TreeRow key={r.w.path} row={r} step={r.lane?.agentId ? latestStep(steps[r.lane.agentId]) : undefined} now={now} onSay={onSay} onTask={onTask} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function TreeRow({ row, step, now, onSay, onTask }: { row: Row; step?: PanelStep; now: number; onSay: Say; onTask: (id: string) => void }) {
  const { w, task, lane, group } = row
  const [open, setOpen] = useState(false)
  const [doing, setDoing] = useState<WorktreeAction | null>(null)
  const head = useRef<HTMLButtonElement>(null)
  const act = (action: WorktreeAction, file?: string) => {
    setDoing(action)
    ask({ type: 'worktree', path: w.path, action, ...(file ? { file } : {}) })
      .then(t => t && onSay(t), (e: Error) => onSay(e.message, true))
      .finally(() => setDoing(null))
  }
  const added = w.files.reduce((n, f) => n + f.added, 0)
  const removed = w.files.reduce((n, f) => n + f.removed, 0)
  const station = lane ? lane.stations[lane.at] : undefined
  const title = w.kind === 'main' ? 'This project' : w.kind === 'other' ? (w.branch || 'Detached checkout') : (task?.title ?? lane?.title ?? 'A task no longer on the board')
  const state = w.missing ? 'folder gone' : w.kind !== 'task' ? (w.dirty ? `${plural(w.dirty, 'file')} not committed` : 'clean') : lane && station ? (station === 'you' ? 'waits for you' : `${STATION_WORD[station]}${lane.sinceMs !== undefined ? ` · ${duration(now - lane.sinceMs)}` : ''}`) : (task?.word ?? 'not on the board')
  const tone = w.missing || w.error ? 'bad' : group === 'work' ? 'run' : group === 'you' ? 'you' : task?.status === 'failed' ? 'bad' : 'other'
  return (
    <li className={`tree${open ? ' open' : ''}${w.missing ? ' gone' : ''}`}>
      <div className="tree-line">
        <button ref={head} type="button" className="tree-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} />
          <span className="tree-name">
            {w.task ? <span className="id">{w.task}</span> : <Icon name={w.kind === 'main' ? 'home' : 'repo-forked'} />}
            <span className="title">{title}</span>
          </span>
          <span className={`state ${tone}`}>{state}</span>
          <span className="tree-facts">
            <span className="tree-branch" title={w.base ? `${w.branch || w.head} is compared with ${w.base}` : undefined}>
              <Icon name="git-branch" />
              <span>{w.branch || `detached at ${w.head}`}</span>
              {w.base && (
                <>
                  <Icon name="arrow-right" />
                  <span>{w.base}</span>
                </>
              )}
            </span>
            {(!!w.ahead || !!w.behind) && (
              <span className="tree-apart" title={`${plural(w.ahead, 'commit')} that ${w.base} doesn't have; ${w.base} has ${plural(w.behind, 'commit')} this doesn't`}>
                {!!w.ahead && (
                  <span>
                    <Icon name="arrow-up" />
                    {w.ahead}
                  </span>
                )}
                {!!w.behind && (
                  <span className="behind">
                    <Icon name="arrow-down" />
                    {w.behind}
                  </span>
                )}
              </span>
            )}
            {!!w.files.length && (
              <span className="tree-lines">
                <span className="add">+{added}</span> <span className="del">−{removed}</span> <span className="quiet">in {plural(w.files.length, 'file')}</span>
              </span>
            )}
            {!!w.dirty && w.kind === 'task' && (
              <span className="tree-dirty" title={w.untracked ? `${plural(w.untracked, 'new file')} among them` : undefined}>
                <Icon name="circle-filled" />
                {w.dirty} not committed
              </span>
            )}
          </span>
        </button>
        <span className="tree-actions">
          <IconAction icon="empty-window" label="Open in a new window" busy={doing === 'window'} disabled={!!w.missing} onClick={() => act('window')} />
          <IconAction icon="terminal" label="Open a terminal here" busy={doing === 'terminal'} disabled={!!w.missing} onClick={() => act('terminal')} />
          <IconAction icon="git-compare" label={w.kind === 'task' ? 'Show its changes' : "Show what isn't committed"} busy={doing === 'changes'} disabled={!!w.missing || (!w.files.length && !w.untracked)} onClick={() => act('changes')} />
        </span>
      </div>
      {step && group === 'work' && (
        <p className="tree-step" title={stepWords(step)}>
          <Icon name={step.kind === 'tool' && step.status === 'running' ? 'loading' : stepIcon(step)} />
          <span>{stepWords(step)}</span>
        </p>
      )}
      {open && (
        <div className="tree-body">
          {lane && <Staff lane={lane} />}
          <dl className="tree-dl">
            <dt>Folder</dt>
            <dd>
              <code className="tree-path">{w.path}</code>
              <button type="button" className="icon-btn" title="Copy the path" aria-label="Copy the path" onClick={() => act('copy')}>
                <Icon name="copy" />
              </button>
              <button type="button" className="icon-btn" title="Show it in the file manager" aria-label="Show it in the file manager" disabled={!!w.missing} onClick={() => act('reveal')}>
                <Icon name="folder-opened" />
              </button>
            </dd>
            <dt>Branch</dt>
            <dd>
              <code>{w.branch || '(detached)'}</code> <span className="quiet">at</span> <code>{w.head}</code>
              {w.locked && <span className="tag">locked</span>}
            </dd>
            {w.base && (
              <>
                <dt>Against {w.base}</dt>
                <dd>{apartWords(w)}</dd>
              </>
            )}
            <dt>Not committed</dt>
            <dd>{w.dirty ? `${plural(w.dirty, 'file')}${w.untracked ? `, ${w.untracked} of them new` : ''}` : 'nothing'}</dd>
            {w.lastCommitMs && (
              <>
                <dt>Last commit</dt>
                <dd>{ago(w.lastCommitMs, now) === 'now' ? 'just now' : `${ago(w.lastCommitMs, now)} ago`}</dd>
              </>
            )}
            {w.task && (
              <>
                <dt>Task</dt>
                <dd className="tree-task">
                  <button type="button" className="task-ref" onClick={() => onTask(w.task!)}>
                    {w.task}
                  </button>
                  <span>{task?.word ?? (lane ? 'running' : 'not on the board any more')}</span>
                  {lane && lane.tries > 1 && <span className="quiet">try {lane.tryNo} of {lane.tries}</span>}
                  {lane?.agentId && (
                    <button type="button" className="link" onClick={() => tell({ type: 'session', agent: lane.agentId!, title: `${w.task} ${task?.title ?? ''}: try ${lane.tryNo}`.trim() })}>
                      Open its agent's session
                    </button>
                  )}
                </dd>
              </>
            )}
            {w.error && (
              <>
                <dt>Problem</dt>
                <dd className="bad">{w.error}</dd>
              </>
            )}
          </dl>
          {!!w.commits.length && (
            <div className="tree-part">
              <h4>
                Commits {w.base ? `${w.base} doesn't have` : ''} <span className="count">{w.commits.length}</span>
              </h4>
              <ol className="tree-commits">
                {w.commits.map(c => (
                  <li key={c.sha}>
                    <code>{c.sha}</code>
                    <span className="title">{c.subject}</span>
                    <time>{ago(c.atMs, now) === 'now' ? 'just now' : `${ago(c.atMs, now)} ago`}</time>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {!!w.files.length && (
            <div className="tree-part">
              <h4>
                {w.kind === 'task' ? 'Changed files' : 'Files not committed'} <span className="count">{w.files.length}</span>
              </h4>
              <ul className="tree-files">
                {w.files.slice(0, FILES_SHOWN).map(f => (
                  <li key={f.file}>
                    <button type="button" className="tree-file" title={`Compare ${f.file} with its base`} onClick={() => act('file', f.file)}>
                      <span className="file">{f.file}</span>
                      <span className="add">+{f.added}</span>
                      <span className="del">−{f.removed}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {w.files.length > FILES_SHOWN && (
                <button type="button" className="link" onClick={() => act('changes')}>
                  and {w.files.length - FILES_SHOWN} more: show all the changes
                </button>
              )}
            </div>
          )}
          <div className="card-actions">
            <button type="button" className="btn" disabled={!!w.missing} onClick={() => act('window')}>
              <Icon name="empty-window" /> Open in a new window
            </button>
            <button type="button" className="btn" disabled={!!w.missing} onClick={() => act('terminal')}>
              <Icon name="terminal" /> Terminal here
            </button>
            <button type="button" className="btn" disabled={!!w.missing || (!w.files.length && !w.untracked)} onClick={() => act('changes')}>
              <Icon name="git-compare" /> {w.kind === 'task' ? 'All its changes' : "What isn't committed"}
            </button>
            {group === 'left' && w.kind === 'task' && (
              <button type="button" className="btn danger" disabled={doing === 'remove'} onClick={() => act('remove')}>
                {doing === 'remove' ? <Icon name="loading" /> : <Icon name="trash" />} Remove the folder
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

/** "2 commits ahead, 1 behind: main moved on since it started" in the owner's words. */
function apartWords(w: PanelWorktree): string {
  if (!w.ahead && !w.behind) return `level with ${w.base}`
  const parts = [w.ahead ? `${plural(w.ahead, 'commit')} ahead` : '', w.behind ? `${w.behind} behind` : ''].filter(Boolean).join(', ')
  return w.behind && w.kind === 'task' ? `${parts}: ${w.base} moved on since it started; the task is brought up to date before it merges` : parts
}

function IconAction({ icon, label, busy, disabled, onClick }: { icon: string; label: string; busy: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn" title={label} aria-label={label} disabled={disabled || busy} onClick={onClick}>
      <Icon name={busy ? 'loading' : icon} />
    </button>
  )
}
