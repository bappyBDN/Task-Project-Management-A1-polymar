import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { ProjectKpi, Task, TaskKpi } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={`value${tone ? ' ' + tone : ''}`}>{value}</div>
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

  const orgTable = (rows: OrgRow[], unit: 'Total' | 'Open' | 'Overdue' | 'Completed' | 'Projects') => {
    if (!rows || rows.length === 0) return <div className="empty small">No data</div>
    return (
      <table>
        <thead>
          <tr><th>Name</th><th>Tasks</th><th>Open</th><th>Completed</th><th>Overdue</th><th>Projects</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.total}</td>
              <td>{r.open}</td>
              <td>{r.completed}</td>
              <td><span className={r.overdue ? 'badge red' : 'small muted'}>{r.overdue || '0'}</span></td>
              <td>{r.projects}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>My Dashboard</h1>
          <div className="crumb">Welcome back, {user?.name} — {label(user?.role ?? '')}</div>
        </div>
      </div>

      <div className="section-title">My Work</div>
      {taskKpi && (
        <div className="grid cards">
          <KpiCard label="Total Tasks" value={taskKpi.total} />
          <KpiCard label="Open" value={taskKpi.open} />
          <KpiCard label="Due Today" value={taskKpi.due_today} />
          <KpiCard label="Overdue" value={taskKpi.overdue} />
          <KpiCard label="Critical" value={taskKpi.critical} />
          <KpiCard label="Blocked" value={taskKpi.blocked} />
          <KpiCard label="Completed" value={taskKpi.completed} />
          <KpiCard label="Completion %" value={`${taskKpi.completion_pct}%`} />
          <KpiCard label="On-Time %" value={`${taskKpi.on_time_pct}%`} />
        </div>
      )}

      <div className="section-title">My Tasks</div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Code</th><th>Task</th><th>Priority</th><th>Status</th><th>Health</th><th>Due</th></tr>
          </thead>
          <tbody>
            {myTasks.map((t) => (
              <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                <td className="muted small">{t.code}</td>
                <td>{t.title}</td>
                <td><span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{label(t.priority)}</span></td>
                <td><span className={`badge ${STATUS_COLORS[t.status]}`}>{label(t.status)}</span></td>
                <td><span className={`health-dot ${HEALTH_COLORS[t.health]}`} /></td>
                <td className="small">{fmtDate(t.approved_due_date || t.baseline_due_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {myTasks.length === 0 && <div className="empty">No tasks assigned to you.</div>}
      </div>

      <div className="section-title">Group Portfolio</div>
      <div className="grid cards">
        <KpiCard label="Total Projects" value={projKpi?.total ?? '—'} />
        <KpiCard label="Active Projects" value={projKpi?.active ?? '—'} />
        <KpiCard label="Green" value={projKpi?.green ?? '—'} />
        <KpiCard label="Amber" value={projKpi?.amber ?? '—'} />
        <KpiCard label="Red" value={projKpi?.red ?? '—'} />
        <KpiCard label="Black" value={projKpi?.black ?? '—'} />
        <KpiCard label="Forecast to Miss" value={projKpi?.forecast_miss ?? '—'} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '16px' }}>
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Project Health Distribution</div>
          {Object.entries(healthDist).map(([h, c]) => (
            <div key={h} className="row spread" style={{ padding: '6px 0' }}>
              <span className="row">
                <span className={`health-dot ${HEALTH_COLORS[h] ?? 'gray'}`} />&nbsp; {label(h)}
              </span>
              <strong>{c}</strong>
            </div>
          ))}
          {Object.keys(healthDist).length === 0 && <div className="empty small">No data</div>}
        </div>
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Top Delay Causes</div>
          {delayCauses.map((d) => (
            <div key={d.category} className="row spread" style={{ padding: '6px 0' }}>
              <span>{label(d.category)}</span>
              <strong>{d.count}</strong>
            </div>
          ))}
          {delayCauses.length === 0 && <div className="empty small">No delays recorded</div>}
        </div>
      </div>

      {orgIntel && (
        <>
          <div className="section-title">SBU Intelligence</div>
          <div className="card" style={{ padding: 0 }}>{orgTable(orgIntel.bySbu, 'Total')}</div>

          <div className="section-title">Function Intelligence</div>
          <div className="card" style={{ padding: 0 }}>{orgTable(orgIntel.byFunction, 'Total')}</div>

          <div className="section-title">Department Intelligence</div>
          <div className="card" style={{ padding: 0 }}>{orgTable(orgIntel.byDepartment, 'Total')}</div>
        </>
      )}
    </div>
  )
}
