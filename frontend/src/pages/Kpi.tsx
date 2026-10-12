import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { KpiOverview, KpiPerson, UserKpiDetail } from '../types'
import { STATUS_COLORS, fmtDate, label } from '../constants'
import { sbuLabel } from '../org'
import KpiCard, { GaugeCard, KpiPick, RATING, ROLE_NAME, RoleChips, TARGET, initialsOf, known, num, pct, ratingOf } from '../components/KpiCard'

// KPI: your own KPI cards (My KPI tab), and the KPI of the people you may see - your team (everyone who
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

type TaskRow = UserKpiDetail['tasks'][number]

/** The tasks of one project (or of none), as the project list shows them. */
function projectsOf(tasks: TaskRow[]) {
  const map = new Map<number, { id: number; code: string; name: string; tasks: TaskRow[] }>()
  for (const t of tasks) {
    const id = t.project_id ?? 0 // 0 = tasks outside any project
    if (!map.has(id)) map.set(id, { id, code: t.project_code ?? '', name: id ? (t.project_name ?? 'Project') : 'No project', tasks: [] })
    map.get(id)!.tasks.push(t)
  }
  // tasks outside any project last
  return [...map.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.name.localeCompare(b.name))
}

function Detail({ userId, role = 'all', onClose }: { userId: number; role?: KpiPick; onClose: () => void }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<UserKpiDetail | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<KpiPick>(role)
  const [openProject, setOpenProject] = useState<number | null>(null)
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

  // the role picked on the card: its tasks only (Project Manager has projects, not tasks)
  const tasks = useMemo(() => (!detail || pick === 'project_manager' ? []
    : pick === 'all' ? detail.tasks : detail.tasks.filter((t) => t.roles?.includes(pick))), [detail, pick])
  const groups = useMemo(() => projectsOf(tasks), [tasks])
  const open = groups.find((g) => g.id === openProject)
  const managed = detail?.projects ?? []
  const managedIds = new Set(managed.map((p) => p.id))
  const asRole = pick === 'all' ? 'Responsible, Accountable or Reviewer' : ROLE_NAME[pick]
  const choose = (p: KpiPick) => { setPick(p); setOpenProject(null) }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 1180 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="KPI card">
        {err && <div className="alert error" role="alert">{err}</div>}
        {!detail && !err && <div className="small muted">Loading the KPI…</div>}
        {detail && (
          <>
            <KpiCard kpi={detail} title="KPI Card" showPerson picked={pick} onPick={choose}
              action={<button className="btn sm" onClick={onClose}>Close</button>} />

            {pick !== 'project_manager' && (
              <>
                <div className="section-title">
                  {pick === 'all' ? 'Projects behind the score' : `Projects with tasks as ${asRole}`} ({groups.length} · {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'})
                </div>
                {groups.length === 0 ? (
                  <div className="small muted">No tasks as {asRole}.</div>
                ) : !open ? (
                  <div className="kpi-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Project</th><th title={`Tasks as ${asRole}`}>Tasks</th><th>Completed</th><th>Past due</th><th>Running</th>
                          <th title="Planned start still ahead, or no due date">Not counted</th>
                          <th title="Average progress of these tasks">Progress</th>
                          <th title="Average points of the counted tasks: 100 minus the points a task is behind its plan">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g) => {
                          const count = (s: string) => g.tasks.filter((t) => (t.state ?? 'running') === s).length
                          const overdue = count('overdue')
                          return (
                            <tr key={g.id} onClick={() => setOpenProject(g.id)} style={{ cursor: 'pointer' }} title="Show the tasks of this project">
                              <td>
                                {g.code && <span className="muted small">{g.code} </span>}<strong>{g.name}</strong>
                                {managedIds.has(g.id) && <span className="badge gold" style={{ marginLeft: 6 }} title="This person manages the project">Project Manager</span>}
                              </td>
                              <td><strong>{g.tasks.length}</strong></td>
                              <td>{count('completed')}</td>
                              <td style={overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{overdue}</td>
                              <td>{count('running')}</td>
                              <td>{count('not_due')}</td>
                              <td className="small">{pct(average(g.tasks.map((t) => t.progress_pct)))}</td>
                              <td><strong>{num(average(g.tasks.map((t) => t.achievement)))}</strong></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>
                    <div className="spread mb" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <div className="kpi-path" aria-label="Showing">
                        <button type="button" onClick={() => setOpenProject(null)}>All projects ({groups.length})</button>
                        <span aria-hidden>›</span>
                        <button type="button" disabled>{[open.code, open.name].filter(Boolean).join(' ')} — {open.tasks.length} {open.tasks.length === 1 ? 'task' : 'tasks'} as {asRole}</button>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn sm" onClick={() => setOpenProject(null)}>← Back to the projects</button>
                        {open.id > 0 && <button className="btn sm" onClick={() => navigate(`/projects/${open.id}`)}>Open the project</button>}
                      </div>
                    </div>
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
                          {open.tasks.map((t) => (
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
                  </>
                )}
              </>
            )}

            {pick === 'project_manager' && managed.length === 0 && (
              <>
                <div className="section-title">Projects managed (0)</div>
                <div className="small muted">This person is not the Project Manager of any project.</div>
              </>
            )}
            {(pick === 'all' || pick === 'project_manager') && managed.length > 0 && (
              <>
                <div className="section-title">Projects managed — behind the Project Manager score ({managed.length})</div>
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
                      {managed.map((p) => (
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

const RATING_ORDER = ['excellent', 'good', 'fair', 'needs_attention', 'no_tasks'] as const
const RATING_COLOR: Record<string, string> = {
  excellent: '#00869b', good: '#6cbf5a', fair: '#e39a00', needs_attention: '#d64545', no_tasks: '#c3cad6',
}

/** How many people are in each rating: one bar, and a button per rating that lists them. */
function RatingStrip({ rows, picked, onPick }: { rows: KpiPerson[]; picked?: string; onPick: (rating: string) => void }) {
  const counts = RATING_ORDER.map((r) => ({ r, n: rows.filter((p) => ratingOf(p.total_kpi) === r).length }))
  const total = rows.length
  if (!total) return null
  return (
    <div className="card kpi-dist">
      <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ color: 'var(--navy)' }}>Where the {total} {total === 1 ? 'person stands' : 'people stand'}</strong>
        <span className="small muted">Click a rating to list its people</span>
      </div>
      <div className="kpi-dist-bar" role="img" aria-label={counts.map((c) => `${RATING[c.r].text}: ${c.n}`).join(', ')}>
        {counts.filter((c) => c.n > 0).map((c) => (
          <i key={c.r} style={{ flexGrow: c.n, background: RATING_COLOR[c.r] }} title={`${RATING[c.r].text}: ${c.n} of ${total}`} />
        ))}
      </div>
      <div className="kpi-dist-keys">
        {counts.map((c) => (
          <button key={c.r} type="button" className={`kpi-dist-key${picked === c.r ? ' on' : ''}`} disabled={!c.n}
            aria-pressed={picked === c.r} onClick={() => onPick(c.r)}>
            <i style={{ background: RATING_COLOR[c.r] }} />
            <strong>{c.n}</strong>
            <span>{RATING[c.r].text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function RankList({ title, rows, onOpen, empty }: { title: string; rows: KpiPerson[]; onOpen: (id: number) => void; empty: string }) {
  return (
    <div className="card kpi-rank">
      <strong style={{ color: 'var(--navy)' }}>{title}</strong>
      {rows.length === 0 ? <div className="small muted" style={{ marginTop: 8 }}>{empty}</div> : rows.map((p) => (
        <button key={p.user_id} type="button" className="kpi-rank-row" onClick={() => onOpen(p.user_id)} title="Open this person's KPI card">
          <span className="kg-avatar" aria-hidden>{initialsOf(p.name)}</span>
          <span className="kpi-rank-name">
            <strong>{p.name}</strong>
            <span className="small muted">{[p.department, sbusOf(p)[0]].filter(Boolean).join(' · ') || '—'}</span>
          </span>
          <span className={`badge ${RATING[ratingOf(p.total_kpi)].tone}`}>{num(p.total_kpi)}</span>
        </button>
      ))}
    </div>
  )
}

export default function Kpi() {
  const [data, setData] = useState<KpiOverview | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'me' | 'overview' | 'people'>('me')
  const [q, setQ] = useState('')
  const [who, setWho] = useState<'all' | 'team'>('all')
  const [sbu, setSbu] = useState('')
  const [dept, setDept] = useState('')
  const [rating, setRating] = useState('')
  const [sort, setSort] = useState<'high' | 'low' | 'name'>('high')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [limit, setLimit] = useState(PAGE)
  // the KPI card opened, and the role its list starts on (a role card clicked on the page)
  const [opened, setOpened] = useState<{ id: number; role?: KpiPick } | null>(null)
  const setOpenId = (id: number, role?: KpiPick) => setOpened({ id, role })

  useEffect(() => {
    api.get<KpiOverview>('/kpi/overview').then((d) => {
      setData(d)
      // someone who sees other people lands on them, not on their own (often empty) cards
      if (d.people.some((p) => !p.relation?.includes('self'))) setTab('overview')
    }).catch((e) => setErr(e.message || 'Could not load the KPI.'))
  }, [])

  const scope = data?.scope
  const me = data?.people.find((p) => p.relation?.includes('self'))
  const others = useMemo(() => (data?.people ?? []).filter((p) => !p.relation?.includes('self')), [data])
  const isTeam = (p: KpiPerson) => !!p.relation?.some((r) => r === 'direct_report' || r === 'team')
  const hasTeam = others.some(isTeam)
  const widerThanTeam = others.some((p) => !isTeam(p))

  // who / SBU / department: what the group cards are about
  const inWho = useMemo(() => (who === 'team' ? others.filter(isTeam) : others), [others, who])
  const sbuNames = useMemo(() => Array.from(new Set(inWho.flatMap(sbusOf))).sort(), [inWho])
  const inSbu = useMemo(() => (!sbu ? inWho : inWho.filter((p) => (sbu === NONE ? !sbusOf(p).length : sbusOf(p).includes(sbu)))), [inWho, sbu])
  const deptNames = useMemo(() => Array.from(new Set(inSbu.map((p) => p.department).filter(Boolean) as string[])).sort(), [inSbu])
  const group = useMemo(() => (!dept ? inSbu : inSbu.filter((p) => (dept === NONE ? !p.department : p.department === dept))), [inSbu, dept])

  const searching = !!q.trim()
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    // a search looks through everyone the viewer may see, whatever SBU / department is picked
    const rows = words.length ? others.filter((r) => {
      const hay = [r.name, r.employee_id, r.designation, r.role && label(r.role), ...sbusOf(r), r.function, r.department]
        .filter(Boolean).join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    }) : group.filter((r) => !rating || ratingOf(r.total_kpi) === rating)
    const score = (r: KpiPerson) => r.total_kpi ?? -1
    return [...rows].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
      // people with nothing to score always last
      : (known(a.total_kpi) ? 0 : 1) - (known(b.total_kpi) ? 0 : 1) || (sort === 'high' ? score(b) - score(a) : score(a) - score(b)) || a.name.localeCompare(b.name))
  }, [others, group, q, rating, sort])

  useEffect(() => { setLimit(PAGE) }, [q, who, sbu, dept, rating, sort, view])
  // a department picked in one SBU may not exist in the next
  useEffect(() => { if (dept && dept !== NONE && !deptNames.includes(dept)) setDept('') }, [dept, deptNames])

  const peopleWord = scope?.level === 'team' ? 'team members' : 'employees'
  const rootTitle = who === 'team' ? 'My team' : scope?.level === 'all' ? 'All SBUs' : scope?.level === 'sbu' ? (scope.sbus ?? []).join(', ')
    : scope?.level === 'department' || scope?.level === 'function' ? (scope.unit ?? 'My people') : 'My team'
  const groupTitle = dept ? (dept === NONE ? 'No department' : dept) : sbu ? (sbu === NONE ? 'No SBU' : sbu) : rootTitle
  const overviewLabel = scope?.level === 'team' ? 'Team KPI' : scope?.level === 'department' || scope?.level === 'function' ? `${label(scope.level)} KPI` : 'SBU & Department KPI'
  const peopleLabel = scope?.level === 'all' ? 'All Employees' : scope?.level === 'team' ? 'My Team' : 'Employees'
  const scopeText = !scope ? '' : scope.level === 'all' ? 'You can see the KPI of every SBU, department and employee.'
    : scope.level === 'sbu' ? `As head of ${(scope.sbus ?? []).join(', ')} you can see everyone in ${(scope.sbus ?? []).length > 1 ? 'those SBUs' : 'that SBU'}.`
      : scope.level === 'department' || scope.level === 'function' ? `As head of ${scope.unit} (${(scope.sbus ?? []).join(', ')}) you can see the people of that ${scope.level}.`
        : scope.level === 'team' ? `You can see the ${scope.team_size} ${scope.team_size === 1 ? 'person' : 'people'} who report to you${scope.team_size !== scope.direct_reports ? ` (${scope.direct_reports} directly)` : ''}.`
          : 'This is your own KPI. A manager also sees their team; a department or SBU head sees their people.'

  // the next level down: SBUs first, then the departments inside the one chosen
  const breakdown: { kind: 'sbu' | 'dept'; name: string; rows: KpiPerson[] }[] =
    !sbu && sbuNames.length > 1 ? sbuNames.map((n) => ({ kind: 'sbu' as const, name: n, rows: inWho.filter((p) => sbusOf(p).includes(n)) }))
      : !dept && deptNames.length > 1 ? deptNames.map((n) => ({ kind: 'dept' as const, name: n, rows: inSbu.filter((p) => p.department === n) }))
        : []
  breakdown.sort((a, b) => (groupOf(b.rows).total ?? -1) - (groupOf(a.rows).total ?? -1) || a.name.localeCompare(b.name))
  const scored = group.filter((p) => known(p.total_kpi))
  const top = [...scored].sort((a, b) => b.total_kpi! - a.total_kpi! || a.name.localeCompare(b.name)).slice(0, 5)
  const low = [...scored].filter((p) => p.total_kpi! < 70).sort((a, b) => a.total_kpi! - b.total_kpi! || a.name.localeCompare(b.name)).slice(0, 5)
  const all = groupOf(others)
  const allSbus = new Set(others.flatMap(sbusOf)).size
  const allDepts = new Set(others.map((p) => p.department).filter(Boolean)).size
  const needAttention = others.filter((p) => ratingOf(p.total_kpi) === 'needs_attention').length

  const search = (text: string) => { setQ(text); if (text.trim()) setTab('people') }
  const showPeople = (r = '') => { setQ(''); setRating(r); setTab('people') }
  const showEveryone = (r = '') => { setWho('all'); setSbu(''); setDept(''); showPeople(r) }
  const filtered = !!(sbu || dept || rating || who !== 'all')
  const only = searching && shown.length === 1 ? shown[0] : null

  // who / SBU / department, the same on both tabs: a path to click back up, and the pickers
  const scopeBar = (
    <div className="card mb kpi-filters">
      {hasTeam && widerThanTeam && (
        <div className="row" style={{ gap: 6 }}>
          <button className={`btn sm ${who === 'all' ? 'primary' : ''}`} onClick={() => setWho('all')}>Everyone I can see</button>
          <button className={`btn sm ${who === 'team' ? 'primary' : ''}`} onClick={() => setWho('team')}>My team</button>
        </div>
      )}
      <div className="kpi-path" aria-label="Showing">
        <button type="button" disabled={!sbu && !dept} onClick={() => { setSbu(''); setDept('') }}>{rootTitle}</button>
        {sbu && <><span aria-hidden>›</span><button type="button" disabled={!dept} onClick={() => setDept('')}>{sbu === NONE ? 'No SBU' : sbu}</button></>}
        {dept && <><span aria-hidden>›</span><button type="button" disabled>{dept === NONE ? 'No department' : dept}</button></>}
      </div>
      <span style={{ flex: 1 }} />
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
      {filtered && <button className="btn sm" onClick={() => { setSbu(''); setDept(''); setRating(''); setWho('all') }}>Clear</button>}
    </div>
  )

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

      {data && others.length > 0 && (
        <>
          <div className="small muted mb">{scopeText}</div>
          <div className="kpi-stats mb">
            <button type="button" className="card kpi-stat" onClick={() => showEveryone()} title={`List all ${others.length} ${peopleWord}`}>
              <span className="label">{label(peopleWord)} you can see</span>
              <span className="value">{others.length}</span>
              <span className="hint">{all.scored} with a score · click to list them</span>
            </button>
            <button type="button" className="card kpi-stat" onClick={() => setTab('overview')} title="Open the group KPI">
              <span className="label">Average KPI</span>
              <span className="value">{num(all.total)}</span>
              <span className="hint">{RATING[ratingOf(all.total)].text} · target {TARGET}</span>
            </button>
            {allSbus > 1 && (
              <button type="button" className="card kpi-stat" onClick={() => { setSbu(''); setDept(''); setTab('overview') }} title="Open the KPI of each SBU">
                <span className="label">SBUs</span>
                <span className="value">{allSbus}</span>
                <span className="hint">click to compare them</span>
              </button>
            )}
            {allDepts > 1 && (
              <button type="button" className="card kpi-stat" onClick={() => setTab('overview')} title="Open the group KPI">
                <span className="label">Departments</span>
                <span className="value">{allDepts}</span>
                <span className="hint">{allSbus > 1 ? 'open an SBU to see its departments' : 'click to compare them'}</span>
              </button>
            )}
            <button type="button" className="card kpi-stat" onClick={() => showEveryone('needs_attention')} disabled={!needAttention} title="List the people who need attention">
              <span className="label">Need attention</span>
              <span className="value" style={needAttention ? { color: 'var(--red)' } : undefined}>{needAttention}</span>
              <span className="hint">score below 50{needAttention ? ' · click to list them' : ''}</span>
            </button>
          </div>

          <div className="kpi-tabs mb">
            <div className="kpi-tablist" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>{overviewLabel}</button>
              <button type="button" role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>
                {peopleLabel} <span className="kpi-count">{others.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={tab === 'me'} className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>My KPI</button>
            </div>
            <input type="search" value={q} onChange={(e) => search(e.target.value)} aria-label="Search an employee"
              placeholder="Search an employee: name, employee ID, designation…" />
          </div>
        </>
      )}

      {me && tab === 'me' && (
        <KpiCard kpi={me} title="My KPI" onPick={(role) => setOpenId(me.user_id, role)} action={
          <button className="btn sm" onClick={() => setOpenId(me.user_id)}>See the projects and tasks behind it</button>
        } />
      )}
      {data && tab === 'me' && others.length === 0 && <div className="small muted mt">{scopeText}</div>}

      {data && others.length > 0 && tab === 'overview' && (
        <>
          {scopeBar}
          <RatingStrip rows={group} onPick={(r) => showPeople(r)} />
          <div className="kg-grid mt mb">
            <GroupCard title={groupTitle} sub="Overall · click to list its people" rows={group} onClick={() => showPeople()} hint={`List the ${group.length} people of ${groupTitle}`} />
            {breakdown.map((b) => (
              <GroupCard key={b.kind + b.name} title={b.name} sub={b.kind === 'sbu' ? 'SBU · click to open' : 'Department · click to open'} rows={b.rows}
                onClick={() => (b.kind === 'sbu' ? (setSbu(b.name), setDept('')) : setDept(b.name))}
                hint={b.kind === 'sbu' ? `Open ${b.name}: its departments and people` : `Open ${b.name}`} />
            ))}
          </div>
          <div className="kpi-ranks mb">
            <RankList title={`Top performers — ${groupTitle}`} rows={top} onOpen={setOpenId} empty="No one has a score yet." />
            <RankList title={`Lowest scores — ${groupTitle}`} rows={low} onOpen={setOpenId} empty="No one is below 70." />
          </div>
          <div style={{ textAlign: 'center' }}>
            <button className="btn primary" onClick={() => showPeople()}>See the KPI card of all {group.length} people of {groupTitle} →</button>
          </div>
        </>
      )}

      {data && others.length > 0 && tab === 'people' && (
        <>
          {/* a search looks through everyone, so the SBU / department pickers step aside */}
          {!searching && scopeBar}
          {!searching && <RatingStrip rows={group} picked={rating} onPick={(r) => setRating(rating === r ? '' : r)} />}
          <div className="spread mt mb" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>
              {searching ? `${shown.length} ${shown.length === 1 ? 'person' : 'people'} matching “${q.trim()}”`
                : `${groupTitle}${rating ? ` · ${RATING[rating].text}` : ''} — ${shown.length} ${shown.length === 1 ? 'person' : 'people'}`}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {searching && <button className="btn sm" onClick={() => setQ('')}>Clear the search</button>}
              {!only && (
                <>
                  <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort" style={{ width: 'auto' }}>
                    <option value="high">Highest score first</option>
                    <option value="low">Lowest score first</option>
                    <option value="name">Name A–Z</option>
                  </select>
                  <button className={`btn sm ${view === 'cards' ? 'primary' : ''}`} onClick={() => setView('cards')}>Cards</button>
                  <button className={`btn sm ${view === 'table' ? 'primary' : ''}`} onClick={() => setView('table')}>Table</button>
                </>
              )}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="card empty">{searching ? 'No employee matches this search.' : 'No one matches these filters.'}</div>
          ) : only ? (
            // the one person searched for: their whole KPI card
            <KpiCard kpi={only} title="KPI Card" showPerson onPick={(role) => setOpenId(only.user_id, role)} action={
              <button className="btn sm" onClick={() => setOpenId(only.user_id)}>See the projects and tasks behind it</button>
            } />
          ) : view === 'cards' ? (
            <div className="kg-grid">
              {shown.slice(0, limit).map((p) => (
                <GaugeCard key={p.user_id} person title={p.name} value={p.total_kpi} onClick={() => setOpenId(p.user_id)}
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
                    const r = RATING[ratingOf(p.total_kpi)]
                    return (
                      <tr key={p.user_id} onClick={() => setOpenId(p.user_id)} title="Open this person's KPI card" style={{ cursor: 'pointer' }}>
                        <td className="kpi-name-cell"><strong>{p.name}</strong><div className="small muted">{[p.employee_id, p.designation].filter(Boolean).join(' · ') || '—'}</div></td>
                        <td><strong style={{ fontSize: 15, color: 'var(--navy)' }}>{num(p.total_kpi)}</strong></td>
                        <td><span className={`badge ${r.tone}`}>{r.text}</span></td>
                        <td className="small">{sbusOf(p).join(', ') || '—'}<div className="muted">{p.department || ''}</div></td>
                        <td className="small">{p.manager || '—'}</td>
                        <td>{p.assigned}</td>
                        <td>{p.completed}</td>
                        <td style={p.overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{p.overdue}</td>
                        <td>{pct(p.delivery)}</td>
                        <td>{pct(p.on_time)}</td>
                        {ROLES.map((role) => <td key={role}>{num(p.roles?.find((x) => x.role === role)?.kpi)}</td>)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!only && shown.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button className="btn" onClick={() => setLimit((n) => n + PAGE)}>Show more ({shown.length - limit} left)</button>
            </div>
          )}
        </>
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

      {opened && <Detail userId={opened.id} role={opened.role} onClose={() => setOpened(null)} />}
    </>
  )
}
