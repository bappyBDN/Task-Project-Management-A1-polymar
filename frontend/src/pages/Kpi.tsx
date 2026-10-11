import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { KpiOverview, KpiPerson, UserKpiDetail } from '../types'
import { STATUS_COLORS, fmtDate, label } from '../constants'
import { sbuLabel } from '../org'
import KpiCard, { GaugeCard, RATING, ROLE_NAME, RoleChips, known, num, pct, ratingOf } from '../components/KpiCard'

// KPI: your own KPI cards, and the KPI of the people you may see - your team (everyone who
// reports to you), the department / function / SBU you head, or everyone for admin, the
// privileged roles and Group Executive. The server decides who is in the list
// (backend app/routers/kpi.py); this page groups, filters and searches it.

const ROLES = ['responsible', 'accountable', 'reviewer', 'project_manager'] as const
const PAGE = 24
const NONE = '\u0000none' // filter value: people with no SBU / department on their record

const yesNo = (v: boolean | null | undefined, yes: string, no: string) =>
  v === null || v === undefined ? <span className="muted">—</span>
    : <span className={`badge ${v ? 'green' : 'red'}`}>{v ? yes : no}</span>

const STATE: Record<string, { text: string; tone: string; hint: string }> = {
  completed: { text: 'Completed', tone: 'green', hint: 'Completed: 100 points' },
  overdue: { text: 'Past due', tone: 'red', hint: 'Past its due date and still open: counted for as much as it is done, and as late' },
  running: { text: 'Running', tone: 'gold', hint: 'Open, inside its dates: 100 points minus the points it is behind its plan' },
  not_due: { text: 'Not counted', tone: 'gray', hint: 'Its planned start is still ahead, or it has no due date: not counted yet' },
}
const stateBadge = (s?: string) => {
  const x = STATE[s ?? ''] ?? STATE.running
  return <span className={`badge ${x.tone}`} title={x.hint}>{x.text}</span>
}

const sbusOf = (p: KpiPerson) => Array.from(new Set((p.companies ?? []).map(sbuLabel)))
const average = (values: (number | null | undefined)[]) => {
  const v = values.filter(known)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

/** The KPI of a group of people: the average of the scores of those who have one. */
function groupOf(rows: KpiPerson[]) {
  return {
    people: rows.length,
    scored: rows.filter((r) => known(r.total_kpi)).length,
    total: average(rows.map((r) => r.total_kpi)),
    roles: ROLES.map((role) => ({ role, kpi: average(rows.map((r) => r.roles?.find((x) => x.role === role)?.kpi)) })),
    overdue: rows.reduce((s, r) => s + r.overdue, 0),
    open: rows.reduce((s, r) => s + r.open, 0),
  }
}

function GroupCard({ title, sub, rows, onClick, active, hint }: {
  title: string; sub?: string; rows: KpiPerson[]; onClick?: () => void; active?: boolean; hint?: string
}) {
  const g = groupOf(rows)
  return (
    <GaugeCard title={title} sub={sub} value={g.total} onClick={onClick} active={active}
      hint={hint ?? 'The average Total KPI of the people in it who have a score'}
      foot={<RoleChips roles={g.roles} />}>
      <div>{g.people} {g.people === 1 ? 'person' : 'people'} · {g.scored} with a score</div>
      <div>{g.open} open tasks · <span style={g.overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{g.overdue} past due</span></div>
    </GaugeCard>
  )
}

function Detail({ userId, onClose }: { userId: number; onClose: () => void }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<UserKpiDetail | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let stale = false
    setDetail(null)
    setErr('')
    api.get<UserKpiDetail>(`/kpi/users/${userId}`)
      .then((d) => { if (!stale) setDetail(d) })
      .catch((e) => { if (!stale) setErr(e.message || 'Could not load this KPI.') })
    return () => { stale = true }
  }, [userId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 1180 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="KPI card">
        {err && <div className="alert error" role="alert">{err}</div>}
        {!detail && !err && <div className="small muted">Loading the KPI…</div>}
        {detail && (
          <>
            <KpiCard kpi={detail} title="KPI Card" showPerson action={<button className="btn sm" onClick={onClose}>Close</button>} />

            <div className="section-title">Tasks behind the score ({detail.tasks.length})</div>
            {detail.tasks.length === 0 ? (
              <div className="small muted">No tasks as Responsible, Accountable or Reviewer.</div>
            ) : (
              <div className="kpi-table">
                <table>
                  <thead>
                    <tr>
                      <th>Task</th><th>Role</th><th>Status</th><th>In the score</th>
                      <th title="How far the task is">Progress</th><th title="How far its plan says it should be today">Expected</th>
                      <th title="Its points in Delivery: 100 minus the points it is behind its plan">Points</th>
                      <th>Due</th><th>Completed</th><th>Delivery</th><th title="Started on or before the planned start">Start</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.tasks.map((t) => (
                      <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                        <td><span className="muted small">{t.code}</span> {t.title}</td>
                        <td className="small" style={{ whiteSpace: 'nowrap' }}>{(t.roles ?? []).map((r) => ROLE_NAME[r] ?? r).join(', ') || '—'}</td>
                        <td><span className={`badge ${STATUS_COLORS[t.status] ?? 'gray'}`}>{label(t.status)}</span></td>
                        <td>{stateBadge(t.state)}</td>
                        <td className="small">{pct(t.progress_pct)}</td>
                        <td className="small">{pct(t.expected_pct)}</td>
                        <td><strong>{num(t.achievement)}</strong></td>
                        <td className="small">{fmtDate(t.due_date ?? undefined)}</td>
                        <td className="small">{fmtDate(t.actual_due_date ?? undefined)}</td>
                        <td>{t.state === 'overdue' ? <span className="badge red">Late</span> : yesNo(t.on_time, 'On time', 'Late')}</td>
                        <td>{yesNo(t.started_on_time, 'On time', 'Late')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!!detail.projects?.length && (
              <>
                <div className="section-title">Projects managed — behind the Project Manager score ({detail.projects.length})</div>
                <div className="kpi-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Project</th><th>Status</th><th>In the score</th><th>Progress</th>
                        <th title="How far its plan says it should be today">Expected</th>
                        <th title="Its points in Delivery: 100 minus the points it is behind its plan">Points</th>
                        <th>Start</th><th>Due</th><th>Completed</th><th>Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.projects.map((p) => (
                        <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} style={{ cursor: 'pointer' }}>
                          <td><span className="muted small">{p.code}</span> {p.name}</td>
                          <td><span className="badge gray">{label(p.status)}</span></td>
                          <td>{stateBadge(p.state)}</td>
                          <td className="small">{pct(p.progress_pct)}</td>
                          <td className="small">{pct(p.expected_pct)}</td>
                          <td><strong>{num(p.achievement)}</strong></td>
                          <td className="small">{fmtDate(p.start_date ?? undefined)}</td>
                          <td className="small">{fmtDate(p.due_date ?? undefined)}</td>
                          <td className="small">{fmtDate(p.completed_date ?? undefined)}</td>
                          <td>{p.state === 'overdue' ? <span className="badge red">Late</span> : yesNo(p.on_time, 'On time', 'Late')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
        {!detail && <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>}
      </div>
    </div>
  )
}

export default function Kpi() {
  const [data, setData] = useState<KpiOverview | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [who, setWho] = useState<'all' | 'team'>('all')
  const [sbu, setSbu] = useState('')
  const [dept, setDept] = useState('')
  const [sort, setSort] = useState<'high' | 'low' | 'name'>('high')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [limit, setLimit] = useState(PAGE)
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    api.get<KpiOverview>('/kpi/overview').then(setData).catch((e) => setErr(e.message || 'Could not load the KPI.'))
  }, [])

  const scope = data?.scope
  const me = data?.people.find((p) => p.relation?.includes('self'))
  const others = useMemo(() => (data?.people ?? []).filter((p) => !p.relation?.includes('self')), [data])
  const isTeam = (p: KpiPerson) => !!p.relation?.some((r) => r === 'direct_report' || r === 'team')
  const hasTeam = others.some(isTeam)
  const widerThanTeam = others.some((p) => !isTeam(p))

  // every filter but the search: what the summary cards are about
  const inWho = useMemo(() => (who === 'team' ? others.filter(isTeam) : others), [others, who])
  const sbuNames = useMemo(() => Array.from(new Set(inWho.flatMap(sbusOf))).sort(), [inWho])
  const inSbu = useMemo(() => (!sbu ? inWho : inWho.filter((p) => (sbu === NONE ? !sbusOf(p).length : sbusOf(p).includes(sbu)))), [inWho, sbu])
  const deptNames = useMemo(() => Array.from(new Set(inSbu.map((p) => p.department).filter(Boolean) as string[])).sort(), [inSbu])
  const group = useMemo(() => (!dept ? inSbu : inSbu.filter((p) => (dept === NONE ? !p.department : p.department === dept))), [inSbu, dept])

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const rows = !words.length ? group : group.filter((r) => {
      const hay = [r.name, r.employee_id, r.designation, r.role && label(r.role), ...sbusOf(r), r.function, r.department]
        .filter(Boolean).join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    const score = (r: KpiPerson) => r.total_kpi ?? -1
    return [...rows].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
      // people with nothing to score always last
      : (known(a.total_kpi) ? 0 : 1) - (known(b.total_kpi) ? 0 : 1) || (sort === 'high' ? score(b) - score(a) : score(a) - score(b)) || a.name.localeCompare(b.name))
  }, [group, q, sort])

  useEffect(() => { setLimit(PAGE) }, [q, who, sbu, dept, sort, view])
  // a department picked in one SBU may not exist in the next
  useEffect(() => { if (dept && dept !== NONE && !deptNames.includes(dept)) setDept('') }, [dept, deptNames])

  const scopeText = !scope ? '' : scope.level === 'all' ? 'You can see the KPI of every SBU, department and employee.'
    : scope.level === 'sbu' ? `As head of ${(scope.sbus ?? []).join(', ')} you can see everyone in ${(scope.sbus ?? []).length > 1 ? 'those SBUs' : 'that SBU'}.`
      : scope.level === 'department' || scope.level === 'function' ? `As head of ${scope.unit} (${(scope.sbus ?? []).join(', ')}) you can see the people of that ${scope.level}.`
        : scope.level === 'team' ? `You can see the ${scope.team_size} ${scope.team_size === 1 ? 'person' : 'people'} who report to you${scope.team_size !== scope.direct_reports ? ` (${scope.direct_reports} directly)` : ''}.`
          : 'This is your own KPI. A manager also sees their team; a department or SBU head sees their people.'

  const groupTitle = dept ? (dept === NONE ? 'No department' : dept) : sbu ? (sbu === NONE ? 'No SBU' : sbu)
    : who === 'team' ? 'My team' : scope?.level === 'all' ? 'All SBUs' : scope?.level === 'sbu' ? (scope.sbus ?? []).join(', ')
      : scope?.level === 'department' || scope?.level === 'function' ? (scope.unit ?? 'My people') : 'My team'
  // the next level down: SBUs first, then the departments inside the one chosen
  const breakdown: { kind: 'sbu' | 'dept'; name: string; rows: KpiPerson[] }[] =
    !sbu && sbuNames.length > 1 ? sbuNames.map((n) => ({ kind: 'sbu' as const, name: n, rows: inWho.filter((p) => sbusOf(p).includes(n)) }))
      : !dept && deptNames.length > 1 ? deptNames.map((n) => ({ kind: 'dept' as const, name: n, rows: inSbu.filter((p) => p.department === n) }))
        : []
  // the group cards follow the same order as the people below them
  const groupScore = (rows: KpiPerson[]) => groupOf(rows).total
  breakdown.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    const x = groupScore(a.rows), y = groupScore(b.rows)
    return (known(x) ? 0 : 1) - (known(y) ? 0 : 1) || (sort === 'high' ? (y ?? 0) - (x ?? 0) : (x ?? 0) - (y ?? 0)) || a.name.localeCompare(b.name)
  })
  const searching = !!q.trim()
  const filtered = !!(q.trim() || sbu || dept || who !== 'all')

  return (
    <>
      <div className="topbar">
        <div>
          <h1>KPI</h1>
          <div className="crumb">How the work each person answers for is delivered — as Responsible, Accountable, Reviewer and Project Manager</div>
        </div>
      </div>

      {err && <div className="alert error" role="alert">{err}</div>}
      {!data && !err && <div className="card small muted">Loading the KPI…</div>}

      {me && (
        <KpiCard kpi={me} title="My KPI" action={
          <button className="btn sm" onClick={() => setOpenId(me.user_id)}>See the tasks and projects behind it</button>
        } />
      )}

      {data && (
        <details className="card kpi-how">
          <summary>How the KPI is calculated</summary>
          <div className="small">
            <p>Every task and project is measured against its own plan. <strong>Expected progress</strong> is where it should be today: 0% on its planned start, 100% on its due date, in a straight line between.</p>
            <ul>
              <li><strong>Points of one task / project:</strong> completed = 100. Still open = 100 minus the points it is behind its expected progress. On or ahead of plan = 100; past its due date and 90% done = 90.</li>
              <li><strong>Not counted yet:</strong> an open task or project whose planned start is still ahead, or that has no due date. Cancelled and deleted ones are left out.</li>
              <li><strong>Delivery</strong> = the average points of the counted tasks / projects.</li>
              <li><strong>On-Time</strong> = finished on or before the due date ÷ (completed + still open past the due date).</li>
              <li><strong>Score of a role</strong> = Delivery × 60% + On-Time × 40% (Delivery alone while nothing is completed or past due yet).</li>
              <li><strong>Roles:</strong> Responsible, Accountable and Reviewer are scored on their tasks; Project Manager on the projects managed, by each project's overall progress.</li>
              <li><strong>Total KPI</strong> = the Task KPI (all the person's tasks, each counted once), the Project KPI, or their average when the person has both.</li>
              <li><strong>SBU / department / team KPI</strong> = the average Total KPI of its people who have a score.</li>
              <li><strong>Rating:</strong> 85 and above Excellent (the target) · 70–84 Good · 50–69 Fair · below 50 Needs attention.</li>
            </ul>
          </div>
        </details>
      )}

      {data && (
        <>
          <div className="section-title">{scope?.level === 'self' ? 'Other people' : 'People'}</div>
          <div className="small muted mb">{scopeText}</div>
        </>
      )}

      {data && others.length > 0 && (
        <>
          <div className="card mb kpi-filters">
            {hasTeam && widerThanTeam && (
              <div className="row" style={{ gap: 6 }}>
                <button className={`btn sm ${who === 'all' ? 'primary' : ''}`} onClick={() => setWho('all')}>Everyone I can see</button>
                <button className={`btn sm ${who === 'team' ? 'primary' : ''}`} onClick={() => setWho('team')}>My team</button>
              </div>
            )}
            {sbuNames.length > 1 && (
              <select value={sbu} onChange={(e) => { setSbu(e.target.value); setDept('') }} aria-label="SBU">
                <option value="">All SBUs</option>
                {sbuNames.map((n) => <option key={n} value={n}>{n}</option>)}
                {inWho.some((p) => !sbusOf(p).length) && <option value={NONE}>No SBU</option>}
              </select>
            )}
            {deptNames.length > 1 && (
              <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
                <option value="">All departments</option>
                {deptNames.map((n) => <option key={n} value={n}>{n}</option>)}
                {inSbu.some((p) => !p.department) && <option value={NONE}>No department</option>}
              </select>
            )}
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a person"
              placeholder="Search: name, employee ID, designation, SBU, department…" />
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              <option value="high">Highest score first</option>
              <option value="low">Lowest score first</option>
              <option value="name">Name A–Z</option>
            </select>
            <div className="row" style={{ gap: 6 }}>
              <button className={`btn sm ${view === 'cards' ? 'primary' : ''}`} onClick={() => setView('cards')}>Cards</button>
              <button className={`btn sm ${view === 'table' ? 'primary' : ''}`} onClick={() => setView('table')}>Table</button>
            </div>
            {filtered && <button className="btn sm" onClick={() => { setQ(''); setSbu(''); setDept(''); setWho('all') }}>Clear</button>}
          </div>

          {/* while searching, the people found come straight under the search box */}
          {!searching && (
            <div className="kg-grid mb">
              <GroupCard title={groupTitle} sub="Overall" rows={group} />
              {breakdown.map((b) => (
                <GroupCard key={b.kind + b.name} title={b.name} sub={b.kind === 'sbu' ? 'SBU' : 'Department'} rows={b.rows}
                  onClick={() => (b.kind === 'sbu' ? (setSbu(b.name), setDept('')) : setDept(b.name))}
                  hint={`Show the people of ${b.name}`} />
              ))}
            </div>
          )}

          <div className="section-title" style={{ marginTop: 8 }}>
            {groupTitle} — {shown.length} {shown.length === 1 ? 'person' : 'people'}{searching ? ` matching “${q.trim()}”` : ''}
            <span className="small muted" style={{ fontWeight: 400 }}> · {sort === 'high' ? 'highest score first' : sort === 'low' ? 'lowest score first' : 'by name'}</span>
          </div>
          {shown.length === 0 ? (
            <div className="card empty">No one matches these filters.</div>
          ) : view === 'cards' ? (
            <div className="kg-grid">
              {shown.slice(0, limit).map((p) => (
                <GaugeCard key={p.user_id} title={p.name} value={p.total_kpi} onClick={() => setOpenId(p.user_id)}
                  hint="Open this person's KPI card"
                  sub={[p.designation, p.department].filter(Boolean).join(' · ') || (p.role ? label(p.role) : undefined)}
                  foot={<RoleChips roles={p.roles} />}>
                  <div>{sbusOf(p).join(', ') || 'No SBU'}{p.manager ? ` · reports to ${p.manager}` : ''}</div>
                  <div>{p.completed} of {p.assigned} tasks completed · <span style={p.overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{p.overdue} past due</span></div>
                </GaugeCard>
              ))}
            </div>
          ) : (
            <div className="card kpi-table" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Person</th><th>Total KPI</th><th>Rating</th><th>SBU / Department</th><th>Reports to</th><th title="Counted tasks as Responsible, Accountable or Reviewer">Tasks</th>
                    <th>Completed</th><th>Past due</th><th title="Average points of the tasks against their plan">Delivery</th><th>On-Time</th>
                    {ROLES.map((r) => <th key={r} title={`Score as ${ROLE_NAME[r]}`}>{ROLE_NAME[r]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, limit).map((p) => {
                    const rating = RATING[p.rating] ?? RATING[ratingOf(p.total_kpi)]
                    return (
                      <tr key={p.user_id} onClick={() => setOpenId(p.user_id)} title="Open this person's KPI card" style={{ cursor: 'pointer' }}>
                        <td><strong>{p.name}</strong><div className="small muted">{[p.employee_id, p.designation].filter(Boolean).join(' · ') || '—'}</div></td>
                        <td><strong style={{ fontSize: 15, color: 'var(--navy)' }}>{num(p.total_kpi)}</strong></td>
                        <td><span className={`badge ${rating.tone}`}>{rating.text}</span></td>
                        <td className="small">{sbusOf(p).join(', ') || '—'}<div className="muted">{p.department || ''}</div></td>
                        <td className="small">{p.manager || '—'}</td>
                        <td>{p.assigned}</td>
                        <td>{p.completed}</td>
                        <td style={p.overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{p.overdue}</td>
                        <td>{pct(p.delivery)}</td>
                        <td>{pct(p.on_time)}</td>
                        {ROLES.map((r) => <td key={r}>{num(p.roles?.find((x) => x.role === r)?.kpi)}</td>)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {shown.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button className="btn" onClick={() => setLimit((n) => n + PAGE)}>Show more ({shown.length - limit} left)</button>
            </div>
          )}
        </>
      )}

      {openId !== null && <Detail userId={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
