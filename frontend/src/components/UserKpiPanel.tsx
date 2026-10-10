import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { UserKpi, UserKpiDetail } from '../types'
import { STATUS_COLORS, fmtDate, label } from '../constants'
import KpiCard, { RATING, pct } from './KpiCard'

// User KPI: everyone's KPI in one list, with a search box to find a person and open their
// KPI card and the tasks behind it. For admin and the privileged roles (the server checks).

const yesNo = (v: boolean | null | undefined, yes: string, no: string) =>
  v === null || v === undefined ? <span className="muted">—</span>
    : <span className={`badge ${v ? 'green' : 'red'}`}>{v ? yes : no}</span>

export default function UserKpiPanel() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<UserKpi[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [detail, setDetail] = useState<UserKpiDetail | null>(null)
  const [detailErr, setDetailErr] = useState('')

  useEffect(() => {
    api.get<UserKpi[]>('/kpi/users').then(setRows).catch((e) => setErr(e.message || 'Could not load the KPI list.'))
  }, [])

  useEffect(() => {
    setDetail(null)
    setDetailErr('')
    if (openId === null) return
    let stale = false
    api.get<UserKpiDetail>(`/kpi/users/${openId}`)
      .then((d) => { if (!stale) setDetail(d) })
      .catch((e) => { if (!stale) setDetailErr(e.message || 'Could not load this KPI.') })
    return () => { stale = true }
  }, [openId])

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return rows ?? []
    return (rows ?? []).filter((r) => {
      const hay = [r.name, r.employee_id, r.designation, r.role && label(r.role), r.company, r.department].filter(Boolean).join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [rows, q])

  // the only match of a search opens by itself
  useEffect(() => {
    if (q.trim() && shown.length === 1) setOpenId(shown[0].user_id)
  }, [q, shown])

  const scored = (rows ?? []).filter((r) => r.total_kpi !== null && r.total_kpi !== undefined)
  const average = scored.length ? scored.reduce((s, r) => s + (r.total_kpi ?? 0), 0) / scored.length : null

  return (
    <div>
      {err && <div className="alert error" role="alert">{err}</div>}

      <div className="card mb">
        <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="section-title" style={{ margin: 0 }}>User KPI</div>
            <div className="small muted">
              {rows ? `${rows.length} people · ${scored.length} with tasks · average KPI ${average === null ? '—' : Number(average.toFixed(1))}` : 'Loading…'}
            </div>
          </div>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a user"
            placeholder="Search a user: name, employee ID, SBU, department…" style={{ width: 340, maxWidth: '100%' }} />
        </div>
      </div>

      {openId !== null && (
        <div className="mb">
          {detailErr && <div className="alert error" role="alert">{detailErr}</div>}
          {!detail && !detailErr && <div className="card small muted">Loading the KPI…</div>}
          {detail && (
            <>
              <KpiCard kpi={detail} title="KPI Card" showPerson />
              <div className="card mt" style={{ padding: 0 }}>
                <div className="spread" style={{ padding: '12px 14px 0' }}>
                  <div className="section-title" style={{ margin: 0 }}>Tasks behind this KPI ({detail.tasks.length})</div>
                  <button className="btn sm" onClick={() => setOpenId(null)}>Close</button>
                </div>
                {detail.tasks.length === 0 ? (
                  <div className="empty">No tasks are assigned to this person as Responsible.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr><th>Task</th><th>Status</th><th>Planned Start</th><th>Actual Start</th><th>Start</th><th>Due</th><th>Completed</th><th>Delivery</th></tr>
                      </thead>
                      <tbody>
                        {detail.tasks.map((t) => (
                          <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                            <td><span className="muted small">{t.code}</span> {t.title}</td>
                            <td><span className={`badge ${STATUS_COLORS[t.status] ?? 'gray'}`}>{label(t.status)}</span></td>
                            <td className="small">{fmtDate(t.planned_start_date ?? undefined)}</td>
                            <td className="small">{fmtDate(t.actual_start_date ?? undefined)}</td>
                            <td>{yesNo(t.started_on_time, 'On time', 'Late')}</td>
                            <td className="small">{fmtDate(t.due_date ?? undefined)}</td>
                            <td className="small">{fmtDate(t.actual_due_date ?? undefined)}</td>
                            <td>{yesNo(t.on_time, 'On time', 'Late')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {rows && shown.length === 0 ? (
          <div className="empty">{q.trim() ? 'No user matches this search.' : 'No users.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>User</th><th>SBU / Department</th><th>Assigned</th><th>Completed</th>
                  <th title="Task Completion Rate">TCR</th><th title="On-Time Delivery Rate">OTR</th><th title="On-Time Start Rate">OTSR</th>
                  <th>Total KPI</th><th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const rating = RATING[r.rating] ?? RATING.no_tasks
                  return (
                    <tr key={r.user_id} onClick={() => setOpenId(r.user_id)} title="Open this person's KPI card"
                      style={{ cursor: 'pointer', background: openId === r.user_id ? '#f3f7ff' : undefined }}>
                      <td className="small muted">{r.total_kpi === null || r.total_kpi === undefined ? '—' : (rows ?? []).indexOf(r) + 1}</td>
                      <td>
                        <strong>{r.name}</strong>
                        <div className="small muted">{[r.employee_id, r.designation].filter(Boolean).join(' · ') || '—'}</div>
                      </td>
                      <td className="small">{r.company || '—'}<div className="muted">{r.department || ''}</div></td>
                      <td>{r.assigned}</td>
                      <td>{r.completed}{r.overdue > 0 && <div className="small" style={{ color: 'var(--red)' }}>{r.overdue} overdue</div>}</td>
                      <td>{r.assigned ? pct(r.tcr) : '—'}</td>
                      <td>{r.completed ? pct(r.otr) : '—'}</td>
                      <td>{pct(r.otsr)}</td>
                      <td><strong style={{ fontSize: 15, color: 'var(--navy)' }}>{r.total_kpi === null || r.total_kpi === undefined ? '—' : Number(r.total_kpi.toFixed(1))}</strong></td>
                      <td><span className={`badge ${rating.tone}`}>{rating.text}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
