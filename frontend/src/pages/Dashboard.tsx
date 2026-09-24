import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { ProjectKpi, Task, TaskKpi } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'

// ---------------------------------------------------------------- scoped visual polish
// Additive only, scoped under .dash-root so nothing here leaks onto other pages.
// Values below are pulled from the real index.css tokens (--navy, --gold, --line,
// the .card/.kpi/.btn/select rules) rather than guessed.
const DASHBOARD_STYLES = `
  .dash-root .btn {
    transition: background .15s ease, border-color .15s ease, transform .15s ease, box-shadow .15s ease, color .15s ease;
  }
  .dash-kpi-card { transition: box-shadow .15s ease, border-color .15s ease; }
  .dash-kpi-card:hover { box-shadow: 0 3px 12px rgba(16,30,54,.10); border-color: #c8d2e0; }
  .dash-panel { transition: box-shadow .15s ease, border-color .15s ease; }
  .dash-panel:hover { box-shadow: 0 4px 16px rgba(16,30,54,.10); border-color: #c8d2e0; }
  .dash-cal-select {
    width: auto;
    font-size: 12px;
    padding: 3px 6px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: #fff;
    color: var(--navy);
    cursor: pointer;
  }
  .dash-cal-select:hover { border-color: var(--gold); }
  .dash-cal-day:hover { background: #eef1f5 !important; }
  .dash-cal-nav .btn.sm { min-width: 26px; }
  .dash-health-chip {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
    line-height: 1.4;
  }
`

// ---------------------------------------------------------------- small building blocks

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div
      className={`card kpi dash-kpi-card${tone ? ' kpi-' + tone : ''}`}
      style={{ padding: '12px 14px', ...(tone ? { borderLeft: `4px solid var(--${tone})` } : {}) }}
    >
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div className={`value${tone ? ' ' + tone : ''}`} style={{ fontSize: 22, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

// Exact brand hex (matches --green/--amber/--red/--black in index.css) — kept as
// literal hex, not var(), because the health chips below append an alpha suffix
// to make translucent fills, which only works on hex strings.
const HEALTH_HEX: Record<string, string> = { green: '#1e9e5a', amber: '#d9a514', red: '#d64545', black: '#1a1a1a' }
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: 'drop-shadow(0 2px 6px rgba(16,30,54,.14))' }}>
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
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="var(--muted)">projects</text>
      </svg>
      <div style={{ flex: 1, minWidth: 140 }}>
        {entries.map(([key, val]) => (
          <div key={key} className="row spread" style={{ padding: '4px 0' }}>
            <span className="row" style={{ gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: HEALTH_HEX[key] ?? '#999', display: 'inline-block' }} />
              <span className="small">{label(key)}</span>
            </span>
            <strong className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{val} · {Math.round((val / total) * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Dense data table for the org breakdown — shows every count the API already
 * returns (total / open / completed / overdue / projects), not just one bar. */
function OrgTable({ rows }: { rows: { name: string; total: number; open: number; completed: number; overdue: number; projects: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Total</th>
            <th>Open</th>
            <th>Completed</th>
            <th>Overdue</th>
            <th>Projects</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                {r.name}
                <div style={{ background: '#e8ecf3', borderRadius: 4, height: 4, marginTop: 4, overflow: 'hidden', maxWidth: 160 }}>
                  <div style={{ width: `${(r.total / max) * 100}%`, height: '100%', background: 'var(--gold)', borderRadius: 4 }} />
                </div>
              </td>
              <td className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.total}</td>
              <td className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.open}</td>
              <td className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.completed}</td>
              <td className="small" style={{ fontVariantNumeric: 'tabular-nums', ...(r.overdue ? { color: 'var(--red)', fontWeight: 600 } : {}) }}>{r.overdue}</td>
              <td className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.projects}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

  const goToday = () => { const d = new Date(); d.setDate(1); setCursor(d) }
  // 11-year window centered on whichever year is currently in view, so it
  // recenters as the user navigates instead of being stuck at a fixed range.
  const yearOptions = Array.from({ length: 11 }, (_, i) => year - 5 + i)

  return (
    <div>
      <div className="row spread dash-cal-nav" style={{ marginBottom: 8, gap: 6, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm" title="Previous year" onClick={() => setCursor(new Date(year - 1, month, 1))}>«</button>
          <button className="btn sm" title="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <select
            className="dash-cal-select"
            value={month}
            onChange={(e) => setCursor(new Date(year, Number(e.target.value), 1))}
            aria-label="Month"
          >
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            className="dash-cal-select"
            value={year}
            onChange={(e) => setCursor(new Date(Number(e.target.value), month, 1))}
            aria-label="Year"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm" title="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
          <button className="btn sm" title="Next year" onClick={() => setCursor(new Date(year + 1, month, 1))}>»</button>
        </div>
      </div>
      <div className="row spread" style={{ marginBottom: 6 }}>
        <strong className="small">{cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <button className="btn sm" onClick={goToday}>Today</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginBottom: 4 }}>
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
              className="btn sm dash-cal-day"
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
    api.get<ProjectKpi>('/dashboards/executive').then(setProjKpi).catch(() => {})
    api.get<Record<string, number>>('/dashboards/health-distribution').then(setHealthDist).catch(() => {})
    api.get<{ category: string; count: number }[]>('/dashboards/delay-causes').then(setDelayCauses).catch(() => {})
    api.get<{ bySbu: OrgRow[]; byFunction: OrgRow[]; byDepartment: OrgRow[] }>('/dashboards/org-intelligence')
      .then(setOrgIntel)
      .catch(() => setOrgIntel({ bySbu: [], byFunction: [], byDepartment: [] }))
  }, [])

  useEffect(() => {
    if (!user) return
    api.get<TaskKpi>(`/dashboards/individual/${user.id}`).then(setTaskKpi).catch(() => {})
    api.get<Task[]>(`/tasks?responsible_id=${user.id}`).then(setMyTasks).catch(() => {})
  }, [user])

  const shownTasks = useMemo(() => {
    if (!pickedDay) return myTasks
    return myTasks.filter((t) => (t.approved_due_date || t.baseline_due_date) === pickedDay)
  }, [myTasks, pickedDay])

  const orgRows = orgIntel ? orgIntel[orgTab] : []
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const maxDelay = Math.max(1, ...delayCauses.map((d) => d.count))
  const denseGrid = { gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 12 } as const

  return (
    <div className="dash-root">
      <style>{DASHBOARD_STYLES}</style>
      <div className="topbar">
        <div>
          <h1>My Dashboard</h1>
          <div className="crumb">Welcome back, {user?.name} — {label(user?.role ?? '')} · {today}</div>
          {projKpi && (
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {(['green', 'amber', 'red', 'black'] as const).map((h) => (
                projKpi[h] > 0 && (
                  <span
                    key={h}
                    className="dash-health-chip"
                    style={{ background: `${HEALTH_HEX[h]}1a`, color: HEALTH_HEX[h], border: `1px solid ${HEALTH_HEX[h]}40` }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: HEALTH_HEX[h], display: 'inline-block', marginRight: 5 }} />
                    {projKpi[h]} {label(h)}
                  </span>
                )
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- KPI strip */}
      {taskKpi && (
        <div className="grid cards" style={denseGrid}>
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
          <div className="card dash-panel" style={{ padding: 0 }}>
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
                      <span className="small muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{t.progress_pct}%</span>
                    </td>
                    <td className="small">{fmtDate(t.approved_due_date || t.baseline_due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shownTasks.length === 0 && <div className="empty">{pickedDay ? 'No tasks due on this date.' : 'No tasks assigned to you.'}</div>}
          </div>

          <div className="section-title" style={{ margin: '18px 0 10px' }}>Group Portfolio</div>
          <div className="grid cards" style={denseGrid}>
            <KpiCard label="Total Projects" value={projKpi?.total ?? '—'} />
            <KpiCard label="Active Projects" value={projKpi?.active ?? '—'} tone="gold" />
            <KpiCard label="Green" value={projKpi?.green ?? '—'} tone="green" />
            <KpiCard label="Amber" value={projKpi?.amber ?? '—'} tone="amber" />
            <KpiCard label="Red" value={projKpi?.red ?? '—'} tone="red" />
            <KpiCard label="Black" value={projKpi?.black ?? '—'} />
            <KpiCard label="Forecast to Miss" value={projKpi?.forecast_miss ?? '—'} tone="red" />
          </div>

          <div className="section-title" style={{ margin: '18px 0 10px' }}>Team &amp; Portfolio Breakdown</div>
          <div className="card dash-panel">
            <div className="row" style={{ marginBottom: 12 }}>
              <button className={`btn sm ${orgTab === 'bySbu' ? 'primary' : ''}`} onClick={() => setOrgTab('bySbu')}>By SBU</button>
              <button className={`btn sm ${orgTab === 'byFunction' ? 'primary' : ''}`} onClick={() => setOrgTab('byFunction')}>By Function</button>
              <button className={`btn sm ${orgTab === 'byDepartment' ? 'primary' : ''}`} onClick={() => setOrgTab('byDepartment')}>By Department</button>
            </div>
            {orgIntel === null ? <div className="empty small">Loading…</div> : <OrgTable rows={orgRows} />}
          </div>
        </div>

        {/* RIGHT: visuals + personal calendar */}
        <div>
          <div className="card dash-panel">
            <div className="section-title" style={{ marginTop: 0 }}>My Calendar</div>
            <MiniCalendar tasks={myTasks} onPickDay={setPickedDay} />
            <div className="small muted" style={{ marginTop: 8 }}>Gold outline = a task of yours is due that day. Click a day to filter the list on the left.</div>
          </div>

          <div className="card mt dash-panel">
            <div className="section-title" style={{ marginTop: 0 }}>Project Health Distribution</div>
            <DonutChart data={healthDist} />
          </div>

          <div className="card mt dash-panel">
            <div className="section-title" style={{ marginTop: 0 }}>Top Delay Causes</div>
            {delayCauses.map((d) => (
              <div key={d.category} style={{ padding: '6px 0' }}>
                <div className="row spread">
                  <span className="small">{label(d.category)}</span>
                  <strong className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{d.count}</strong>
                </div>
                <div style={{ background: '#e8ecf3', borderRadius: 4, height: 4, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${(d.count / maxDelay) * 100}%`, height: '100%', background: 'var(--red)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
            {delayCauses.length === 0 && <div className="empty small">No delays recorded</div>}
          </div>
        </div>
      </div>
    </div>
  )
}