import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { ProjectKpi, Task, TaskKpi } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'

// ---------------------------------------------------------------- small building blocks

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`card kpi${tone ? ' kpi-' + tone : ''}`} style={tone ? { borderLeft: `4px solid var(--${tone})` } : undefined}>
      <div className="label">{label}</div>
      <div className={`value${tone ? ' ' + tone : ''}`}>{value}</div>
    </div>
  )
}

const HEALTH_HEX: Record<string, string> = { green: '#22a06b', amber: '#e0a800', red: '#d9534f', black: '#1f2430' }

/** Pure-SVG donut chart — no chart library needed. */
function DonutChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (total === 0) return <div className="empty small">No data</div>

  const size = 160
  const r = 60
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="row" style={{ gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f5" strokeWidth={18} />
          {entries.map(([key, val]) => {
            const frac = val / total
            const dash = frac * circumference
            const circle = (
              <circle
                key={key}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={HEALTH_HEX[key] ?? '#999'}
                strokeWidth={18}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += dash
            return circle
          })}
        </g>
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={22} fontWeight={700} fill="var(--navy)">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#8891a1">projects</text>
      </svg>
      <div style={{ flex: 1, minWidth: 140 }}>
        {entries.map(([key, val]) => (
          <div key={key} className="row spread" style={{ padding: '4px 0' }}>
            <span className="row" style={{ gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: HEALTH_HEX[key] ?? '#999', display: 'inline-block' }} />
              <span className="small">{label(key)}</span>
            </span>
            <strong className="small">{val} · {Math.round((val / total) * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Simple horizontal bar chart, no library — scales bar width to the max value in the set. */
function BarList({ rows, valueKey = 'total' }: { rows: { name: string; total: number; overdue: number }[]; valueKey?: 'total' }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]))
  return (
    <div>
      {rows.map((r) => (
        <div key={r.name} style={{ marginBottom: 10 }}>
          <div className="row spread small" style={{ marginBottom: 3 }}>
            <span>{r.name}</span>
            <span className="muted">{r.total} tasks{r.overdue ? ` · ${r.overdue} overdue` : ''}</span>
          </div>
          <div style={{ background: '#eef1f5', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${(r.total / max) * 100}%`, height: '100%', background: 'var(--gold)', borderRadius: 6 }} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="empty small">No data</div>}
    </div>
  )
}

/** Mini month calendar — highlights days that have one of the user's tasks due (personal tracking). */
function MiniCalendar({ tasks, onPickDay }: { tasks: Task[]; onPickDay: (iso: string | null) => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [picked, setPicked] = useState<string | null>(null)

  const dueByDay = useMemo(() => {
    const m = new Map<string, number>()
    tasks.forEach((t) => {
      const d = t.approved_due_date || t.baseline_due_date
      if (!d) return
      m.set(d, (m.get(d) ?? 0) + 1)
    })
    return m
  }, [tasks])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayIso = new Date().toISOString().slice(0, 10)
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const pick = (day: number) => {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const next = picked === iso ? null : iso
    setPicked(next)
    onPickDay(next)
  }

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 8 }}>
        <button className="btn sm" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
        <strong className="small">{cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <button className="btn sm" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, fontSize: 10, color: '#8891a1', textAlign: 'center', marginBottom: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const has = dueByDay.get(iso)
          const isToday = iso === todayIso
          const isPicked = iso === picked
          return (
            <button
              key={i}
              onClick={() => pick(day)}
              className="btn sm"
              style={{
                padding: '4px 0',
                fontSize: 11,
                position: 'relative',
                background: isPicked ? 'var(--navy)' : isToday ? '#eef1f5' : 'transparent',
                color: isPicked ? '#fff' : 'inherit',
                border: has ? '1px solid var(--gold)' : '1px solid transparent',
              }}
            >
              {day}
              {has && <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: isPicked ? '#fff' : 'var(--red)' }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface OrgRow {
  name: string
  total: number
  open: number
  completed: number
  overdue: number
  projects: number
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [taskKpi, setTaskKpi] = useState<TaskKpi | null>(null)
  const [projKpi, setProjKpi] = useState<ProjectKpi | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [healthDist, setHealthDist] = useState<Record<string, number>>({})
  const [delayCauses, setDelayCauses] = useState<{ category: string; count: number }[]>([])
  const [orgIntel, setOrgIntel] = useState<{ bySbu: OrgRow[]; byFunction: OrgRow[]; byDepartment: OrgRow[] } | null>(null)
  const [orgTab, setOrgTab] = useState<'bySbu' | 'byFunction' | 'byDepartment'>('bySbu')
  const [pickedDay, setPickedDay] = useState<string | null>(null)

  useEffect(() => {
    api.get<ProjectKpi>('/dashboards/executive').then(setProjKpi)
    api.get<Record<string, number>>('/dashboards/health-distribution').then(setHealthDist)
    api.get<{ category: string; count: number }[]>('/dashboards/delay-causes').then(setDelayCauses)
    api.get<{ bySbu: OrgRow[]; byFunction: OrgRow[]; byDepartment: OrgRow[] }>('/dashboards/org-intelligence').then(setOrgIntel)
  }, [])

  useEffect(() => {
    if (!user) return
    api.get<TaskKpi>(`/dashboards/individual/${user.id}`).then(setTaskKpi)
    api.get<Task[]>(`/tasks?responsible_id=${user.id}`).then(setMyTasks)
  }, [user])

  const shownTasks = useMemo(() => {
    if (!pickedDay) return myTasks
    return myTasks.filter((t) => (t.approved_due_date || t.baseline_due_date) === pickedDay)
  }, [myTasks, pickedDay])

  const orgRows = orgIntel ? orgIntel[orgTab] : []
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>My Dashboard</h1>
          <div className="crumb">Welcome back, {user?.name} — {label(user?.role ?? '')} · {today}</div>
        </div>
      </div>

      {/* ---------------------------------------------------- KPI strip */}
      {taskKpi && (
        <div className="grid cards">
          <KpiCard label="Total Tasks" value={taskKpi.total} />
          <KpiCard label="Open" value={taskKpi.open} tone="gold" />
          <KpiCard label="Due Today" value={taskKpi.due_today} tone="amber" />
          <KpiCard label="Overdue" value={taskKpi.overdue} tone="red" />
          <KpiCard label="Critical" value={taskKpi.critical} tone="red" />
          <KpiCard label="Blocked" value={taskKpi.blocked} tone="red" />
          <KpiCard label="Completed" value={taskKpi.completed} tone="green" />
          <KpiCard label="Completion %" value={`${taskKpi.completion_pct}%`} tone="green" />
          <KpiCard label="On-Time %" value={`${taskKpi.on_time_pct}%`} tone="green" />
        </div>
      )}

      {/* ---------------------------------------------------- Main two-column layout */}
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
        {/* LEFT: My tasks */}
        <div>
          <div className="card" style={{ padding: 0 }}>
            <div className="section-title" style={{ margin: '14px 14px 8px' }}>
              My Tasks {pickedDay ? `— due ${fmtDate(pickedDay)}` : ''}
              {pickedDay && <button className="btn sm" style={{ marginLeft: 10 }} onClick={() => setPickedDay(null)}>Clear date filter</button>}
            </div>
            <table>
              <thead>
                <tr><th>Code</th><th>Task</th><th>Priority</th><th>Status</th><th>Progress</th><th>Due</th></tr>
              </thead>
              <tbody>
                {shownTasks.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="muted small">{t.code}</td>
                    <td>{t.title}{t.blocker && <span className="badge red" style={{ marginLeft: 8 }}>Blocked</span>}</td>
                    <td><span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{label(t.priority)}</span></td>
                    <td><span className={`badge ${STATUS_COLORS[t.status]}`}>{label(t.status)}</span></td>
                    <td style={{ minWidth: 100 }}>
                      <div className="progress"><span style={{ width: `${t.progress_pct}%` }} /></div>
                      <span className="small muted">{t.progress_pct}%</span>
                    </td>
                    <td className="small">{fmtDate(t.approved_due_date || t.baseline_due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shownTasks.length === 0 && <div className="empty">{pickedDay ? 'No tasks due on this date.' : 'No tasks assigned to you.'}</div>}
          </div>

          <div className="section-title">Group Portfolio</div>
          <div className="grid cards">
            <KpiCard label="Total Projects" value={projKpi?.total ?? '—'} />
            <KpiCard label="Active Projects" value={projKpi?.active ?? '—'} tone="gold" />
            <KpiCard label="Green" value={projKpi?.green ?? '—'} tone="green" />
            <KpiCard label="Amber" value={projKpi?.amber ?? '—'} tone="amber" />
            <KpiCard label="Red" value={projKpi?.red ?? '—'} tone="red" />
            <KpiCard label="Black" value={projKpi?.black ?? '—'} />
            <KpiCard label="Forecast to Miss" value={projKpi?.forecast_miss ?? '—'} tone="red" />
          </div>

          <div className="section-title">Team &amp; Portfolio Breakdown</div>
          <div className="card">
            <div className="row" style={{ marginBottom: 12 }}>
              <button className={`btn sm ${orgTab === 'bySbu' ? 'primary' : ''}`} onClick={() => setOrgTab('bySbu')}>By SBU</button>
              <button className={`btn sm ${orgTab === 'byFunction' ? 'primary' : ''}`} onClick={() => setOrgTab('byFunction')}>By Function</button>
              <button className={`btn sm ${orgTab === 'byDepartment' ? 'primary' : ''}`} onClick={() => setOrgTab('byDepartment')}>By Department</button>
            </div>
            <BarList rows={orgRows} />
          </div>
        </div>

        {/* RIGHT: visuals + personal calendar */}
        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>My Calendar</div>
            <MiniCalendar tasks={myTasks} onPickDay={setPickedDay} />
            <div className="small muted" style={{ marginTop: 8 }}>Gold outline = a task of yours is due that day. Click a day to filter the list on the left.</div>
          </div>

          <div className="card mt">
            <div className="section-title" style={{ marginTop: 0 }}>Project Health Distribution</div>
            <DonutChart data={healthDist} />
          </div>

          <div className="card mt">
            <div className="section-title" style={{ marginTop: 0 }}>Top Delay Causes</div>
            {delayCauses.map((d) => (
              <div key={d.category} className="row spread" style={{ padding: '6px 0' }}>
                <span className="small">{label(d.category)}</span>
                <strong className="small">{d.count}</strong>
              </div>
            ))}
            {delayCauses.length === 0 && <div className="empty small">No delays recorded</div>}
          </div>
        </div>
      </div>
    </div>
  )
}