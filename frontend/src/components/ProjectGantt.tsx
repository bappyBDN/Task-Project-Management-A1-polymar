import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { GanttData, GanttTask, Project, Task, User } from '../types'
import { fmtDate as formatDate, label } from '../constants'

// Optional Gantt chart of a project (see backend app/gantt.py). Off: this renders nothing
// (or only the switch, for whoever may turn it on) and the page is exactly as before.
// On: the tasks on a timeline with their dependencies, and what is extending the schedule.

interface Props {
  project: Project
  /** the page's task list: the chart is reloaded whenever a task changes */
  tasks: Task[]
  users: User[]
  canToggle: boolean
  onProject: (p: Project) => void
  /** the schedule moved forecast dates: reload the project and its tasks */
  onChanged: () => void
}

const ROW = 34
const NAMES = 250
const MS_DAY = 86400000
const DONE = ['completed', 'closed']

const day = (d: string) => Math.round(Date.parse(d) / MS_DAY)
const fmtDate = (d?: string | null) => formatDate(d ?? undefined)

// bar colour by where the task stands
function tone(t: GanttTask): string {
  if (t.status === 'cancelled') return 'cancelled'
  if (DONE.includes(t.status)) return 'done'
  if (t.status === 'in_review') return 'review'
  if (t.status === 'blocked' || t.status === 'on_hold') return 'held'
  if (t.status === 'in_progress' || t.progress_pct > 0) return 'active'
  return 'todo'
}

const LEGEND: [string, string][] = [
  ['todo', 'Not started'], ['active', 'In progress'], ['review', 'In review'],
  ['held', 'Blocked / on hold'], ['done', 'Completed'], ['late', 'Extension beyond due date'],
]

export default function ProjectGantt({ project, tasks, users, canToggle, onProject, onChanged }: Props) {
  const navigate = useNavigate()
  const enabled = !!project.gantt_enabled
  const [data, setData] = useState<GanttData | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // anything that moves the schedule
  const signature = tasks.map((t) => [t.id, t.status, t.progress_pct, t.planned_start_date, t.baseline_due_date,
    t.approved_due_date, t.forecast_due_date, t.actual_due_date].join(':')).join('|')

  useEffect(() => {
    if (!enabled) { setData(null); return }
    let stale = false
    api.get<GanttData>(`/projects/${project.id}/gantt`).then((g) => {
      if (stale) return
      setData(g)
      setErr('')
      // the schedule just stored a new project forecast: show it on the rest of the page too
      if (g.enabled && (g.project?.forecast ?? null) !== (project.forecast_due_date ?? null)) onChanged()
    }).catch((e) => { if (!stale) setErr(e.message || 'Could not load the Gantt chart.') })
    return () => { stale = true }
  }, [project.id, enabled, signature])

  // a long project opens around today instead of at its first month
  const scroller = useRef<HTMLDivElement>(null)
  const loaded = !!data?.tasks?.length
  useEffect(() => {
    const mark = scroller.current?.querySelector<HTMLElement>('.gantt-mark.today')
    if (scroller.current && mark) scroller.current.scrollLeft = Math.max(0, mark.offsetLeft - scroller.current.clientWidth / 2)
  }, [loaded, project.id])

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      onProject(await api.put<Project>(`/projects/${project.id}/gantt`, { enabled: !enabled }))
      onChanged()
    } catch (e: any) {
      setErr(e.message || 'Could not change the Gantt chart option.')
    } finally {
      setBusy(false)
    }
  }

  if (!enabled && !canToggle) return null

  const head = (
    <div className="spread">
      <div className="section-title" style={{ marginTop: 0, marginBottom: enabled ? 12 : 0 }}>
        Gantt Chart <span className="badge gray" style={{ marginLeft: 6 }}>Optional</span>
      </div>
      {canToggle && (
        <button className={`gantt-switch ${enabled ? 'on' : ''}`} onClick={toggle} disabled={busy} role="switch" aria-checked={enabled}
          title={enabled ? 'Turn the Gantt chart off - nothing is deleted' : 'Turn the Gantt chart on for this project'}>
          <i /> {enabled ? 'On' : 'Off'}
        </button>
      )}
    </div>
  )

  if (!enabled) {
    return (
      <div className="card mt">
        {head}
        <div className="small muted" style={{ marginTop: 6 }}>
          Turn on to plan this project's tasks on a timeline: a task can depend on other tasks, and the forecast dates of the
          tasks and of the project follow automatically. Turning it off again changes nothing and deletes nothing.
        </div>
        {err && <div className="alert error" style={{ marginTop: 10, marginBottom: 0 }}>{err}</div>}
      </div>
    )
  }

  const rows = [...(data?.tasks ?? [])].sort((a, b) =>
    (a.start ?? '9999').localeCompare(b.start ?? '9999') || (a.finish ?? '9999').localeCompare(b.finish ?? '9999') || a.id - b.id)
  const byId = new Map(rows.map((t) => [t.id, t]))
  const rowOf = new Map(rows.map((t, i) => [t.id, i]))
  const userName = (uid?: number | null) => users.find((u) => u.id === uid)?.name ?? '—'
  const info = data?.project
  const today = data?.today

  // ---- time axis
  const dates = rows.flatMap((t) => [t.plan_start, t.plan_finish, t.start, t.finish])
    .concat([info?.start, info?.planned_due, info?.forecast, today]).filter((d): d is string => !!d)
  const first = dates.length ? Math.min(...dates.map(day)) - 2 : 0
  const last = dates.length ? Math.max(...dates.map(day)) + 4 : 0
  const span = last - first + 1
  const DAY = span <= 45 ? 26 : span <= 100 ? 14 : span <= 200 ? 8 : span <= 400 ? 5 : 3
  const x = (d: string) => (day(d) - first) * DAY
  const width = span * DAY

  const months: { left: number; width: number; text: string }[] = []
  const weeks: { left: number; text: string }[] = []
  for (let n = first; n <= last; n++) {
    const dt = new Date(n * MS_DAY)
    if (n === first || dt.getUTCDate() === 1) {
      months.push({ left: (n - first) * DAY, width: 0, text: dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) })
    }
    months[months.length - 1].width += DAY
    if (DAY >= 20 || dt.getUTCDay() === 1) weeks.push({ left: (n - first) * DAY, text: String(dt.getUTCDate()) })
  }

  const why = (t: GanttTask) => {
    const driver = t.driver_id != null ? byId.get(t.driver_id) : undefined
    if (t.cause === 'dependency') return driver ? `Waiting for ${driver.code} — ${driver.title} (finishes ${fmtDate(driver.finish)})` : 'Waiting for a task it depends on'
    if (t.cause === 'overdue') return 'Past its due date and not finished yet'
    if (t.cause === 'forecast') return 'Its own forecast is later than the due date'
    if (t.cause === 'late_finish') return `Finished late, on ${fmtDate(t.finish)}`
    return ''
  }
  const tip = (t: GanttTask) => [
    `${t.code} — ${t.title}`,
    `${label(t.status)} · ${t.progress_pct}% · ${userName(t.responsible_id)}`,
    `Planned: ${fmtDate(t.plan_start)} → ${fmtDate(t.plan_finish)}`,
    `Scheduled: ${fmtDate(t.start)} → ${fmtDate(t.finish)}${t.slip_days ? ` (+${t.slip_days} day${t.slip_days === 1 ? '' : 's'})` : ''}`,
    t.depends_on.length ? `Depends on: ${t.depends_on.map((i) => byId.get(i)?.code ?? `#${i}`).join(', ')}` : '',
    why(t), t.critical ? 'On the critical path' : '',
  ].filter(Boolean).join('\n')

  // ---- dependency arrows (finish of one task -> start of the task that depends on it)
  const links = rows.flatMap((t) => t.depends_on.map((p) => ({ from: byId.get(p), to: t })))
    .filter((l): l is { from: GanttTask; to: GanttTask } => !!l.from?.finish && !!l.to.start && l.from.status !== 'cancelled')
    .map(({ from, to }) => {
      const x1 = x(from.finish!) + DAY, y1 = rowOf.get(from.id)! * ROW + ROW / 2
      const x2 = x(to.start!), y2 = rowOf.get(to.id)! * ROW + ROW / 2
      const down = y2 > y1 ? 1 : -1
      const d = x2 >= x1 + 10
        ? `M${x1},${y1} H${x1 + 5} V${y2} H${x2 - 1}`
        : `M${x1},${y1} H${x1 + 5} V${y1 + down * ROW / 2} H${x2 - 9} V${y2} H${x2 - 1}`
      return { key: `${from.id}-${to.id}`, d, critical: from.critical && to.critical }
    })

  const late = rows.filter((t) => t.slip_days > 0).sort((a, b) =>
    Number(b.extends_project) - Number(a.extends_project) || Number(a.cause === 'dependency') - Number(b.cause === 'dependency') || b.slip_days - a.slip_days)
  const sources = late.filter((t) => t.cause !== 'dependency').length
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

  return (
    <div className="card mt">
      {head}
      {err && <div className="alert error">{err}</div>}
      {!data && !err && <div className="small muted">Loading the schedule…</div>}

      {data && rows.length === 0 && <div className="small muted">No tasks to schedule yet. Add a task to see it on the timeline.</div>}

      {data && rows.length > 0 && (
        <>
          <div className="gantt">
            <div className="gantt-names" style={{ width: NAMES }}>
              <div className="gantt-head">Task</div>
              {rows.map((t) => (
                <div key={t.id} className="gantt-name" style={{ height: ROW }} title={tip(t)} onClick={() => navigate(`/tasks/${t.id}`)}>
                  <span className="muted small">{t.code}</span> {t.title}
                </div>
              ))}
            </div>
            <div className="gantt-scroll" ref={scroller}>
              <div style={{ width, position: 'relative' }}>
                <div className="gantt-head" style={{ position: 'relative' }}>
                  {months.map((m) => <div key={m.left} className="gantt-month" style={{ left: m.left, width: m.width }}>{m.width > 46 ? m.text : ''}</div>)}
                  {weeks.map((w) => <div key={w.left} className="gantt-tick" style={{ left: w.left, width: DAY >= 20 ? DAY : undefined }}>{w.text}</div>)}
                </div>
                <div style={{ position: 'relative', height: rows.length * ROW }}>
                  {weeks.map((w) => <div key={w.left} className="gantt-grid" style={{ left: w.left }} />)}
                  {rows.map((t, i) => <div key={t.id} className="gantt-rowline" style={{ top: (i + 1) * ROW - 1 }} />)}
                  {info?.planned_due && <div className="gantt-mark due" style={{ left: x(info.planned_due) + DAY }} title={`Project due date: ${fmtDate(info.planned_due)}`} />}
                  {today && <div className="gantt-mark today" style={{ left: x(today) + DAY / 2 }} title={`Today: ${fmtDate(today)}`} />}

                  <svg width={width} height={rows.length * ROW} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                    <defs>
                      <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#7d8aa0" /></marker>
                      <marker id="gantt-arrow-crit" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#0b1f3a" /></marker>
                    </defs>
                    {links.map((l) => (
                      <path key={l.key} d={l.d} fill="none" stroke={l.critical ? '#0b1f3a' : '#7d8aa0'} strokeWidth={l.critical ? 1.6 : 1.2}
                        markerEnd={`url(#${l.critical ? 'gantt-arrow-crit' : 'gantt-arrow'})`} />
                    ))}
                  </svg>

                  {rows.map((t, i) => {
                    if (!t.start || !t.finish) {
                      return <div key={t.id} className="gantt-nodate small muted" style={{ top: i * ROW, height: ROW }}>No dates set</div>
                    }
                    const left = x(t.start), w = (day(t.finish) - day(t.start) + 1) * DAY
                    // the part of the bar past the due date
                    const lateFrom = t.slip_days && t.plan_finish ? Math.max(day(t.plan_finish) + 1, day(t.start)) : null
                    const lateW = lateFrom !== null ? (day(t.finish) - lateFrom + 1) * DAY : 0
                    const moved = t.plan_start && t.plan_finish && (t.plan_start !== t.start || t.plan_finish !== t.finish)
                    return (
                      <div key={t.id}>
                        {moved && <div className="gantt-plan" style={{ top: i * ROW + ROW - 8, left: x(t.plan_start!), width: (day(t.plan_finish!) - day(t.plan_start!) + 1) * DAY }} />}
                        <div className={`gantt-bar ${tone(t)} ${t.critical ? 'critical' : ''}`} style={{ top: i * ROW + 7, left, width: w, height: ROW - 18 }}
                          title={tip(t)} onClick={() => navigate(`/tasks/${t.id}`)}>
                          <span className="gantt-progress" style={{ width: `${Math.max(0, Math.min(100, t.progress_pct))}%` }} />
                          {lateW > 0 && <span className="gantt-late" style={{ width: Math.min(lateW, w) }} />}
                        </div>
                        <div className="gantt-label small" style={{ top: i * ROW + 7, left: left + w + 6, lineHeight: `${ROW - 18}px` }}>
                          {Math.round(t.progress_pct)}%{t.slip_days > 0 && <strong style={{ color: 'var(--red)' }}> +{t.slip_days}d</strong>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="gantt-legend small muted">
            {LEGEND.map(([k, text]) => <span key={k}><i className={`gantt-key ${k}`} /> {text}</span>)}
            <span><i className="gantt-key critical" /> Critical path</span>
            <span><i className="gantt-key plan" /> Original plan</span>
            <span><i className="gantt-key today" /> Today</span>
            <span><i className="gantt-key due" /> Project due</span>
          </div>

          <div className="section-title">Schedule Impact</div>
          {info && (info.slip_days > 0 ? (
            <div className="alert error">
              The project is forecast to finish on <strong>{fmtDate(info.forecast)}</strong> — <strong>{days(info.slip_days)} later</strong> than
              its due date ({fmtDate(info.planned_due)}).
            </div>
          ) : info.planned_due && info.forecast ? (
            <div className="alert success">
              On schedule: the last task is forecast to finish on <strong>{fmtDate(info.forecast)}</strong>, the project is due
              on {fmtDate(info.planned_due)}.
            </div>
          ) : (
            <div className="alert info">
              Forecast finish of the last task: <strong>{fmtDate(info.forecast)}</strong>. Set a due date on the project to see whether it is extended.
            </div>
          ))}

          {late.length === 0 ? (
            <div className="small muted">No task is running past its due date.</div>
          ) : (
            <>
              <div className="small muted" style={{ marginBottom: 6 }}>
                {late.length} task{late.length === 1 ? ' is' : 's are'} running past the due date — {sources} started the delay
                {late.length - sources > 0 && `, ${late.length - sources} pushed by a task they depend on`}.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Task</th><th>Responsible</th><th>Due</th><th>Forecast</th><th>Extension</th><th>Why</th><th>Effect on project</th></tr>
                  </thead>
                  <tbody>
                    {late.map((t) => (
                      <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                        <td><span className="muted small">{t.code}</span> {t.title}</td>
                        <td className="small">{userName(t.responsible_id)}</td>
                        <td className="small">{fmtDate(t.plan_finish)}</td>
                        <td className="small">{fmtDate(t.finish)}</td>
                        <td><span className="badge red">+{days(t.slip_days)}</span></td>
                        <td className="small">
                          <span className={`badge ${t.cause === 'dependency' ? 'gray' : 'amber'}`} style={{ marginRight: 6 }}>{t.cause === 'dependency' ? 'Pushed' : 'Source'}</span>
                          {why(t)}
                        </td>
                        <td>{t.extends_project ? <span className="badge red">Extends the project</span> : <span className="badge gray">This task only</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
