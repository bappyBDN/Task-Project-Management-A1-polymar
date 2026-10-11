import { ReactNode } from 'react'
import { RoleKpi, UserKpi } from '../types'
import { label } from '../constants'

// KPI gauge cards (see backend app/routers/kpi.py for how the score is worked out).
// KpiCard = one person's KPI: the total and a card per role. Used on My Dashboard and the
// KPI page; GaugeCard / Gauge are also used there for SBU, department and people cards.

export const RATING: Record<string, { text: string; tone: string }> = {
  excellent: { text: 'Excellent', tone: 'green' },
  good: { text: 'Good', tone: 'green' },
  fair: { text: 'Fair', tone: 'amber' },
  needs_attention: { text: 'Needs attention', tone: 'red' },
  no_tasks: { text: 'Nothing to score yet', tone: 'gray' },
}

export const TARGET = 85
// the gauge's bands = the ratings (same limits as the server's)
const ZONES = [
  { from: 0, to: 50, color: '#d64545', name: 'Needs attention: below 50' },
  { from: 50, to: 70, color: '#e39a00', name: 'Fair: 50 to 69' },
  { from: 70, to: 85, color: '#6cbf5a', name: 'Good: 70 to 84' },
  { from: 85, to: 100, color: '#00869b', name: 'Excellent: 85 and above' },
]

export const ROLE_NAME: Record<string, string> = {
  responsible: 'Responsible', accountable: 'Accountable', reviewer: 'Reviewer', project_manager: 'Project Manager',
}
export const ROLE_SHORT: Record<string, string> = { responsible: 'R', accountable: 'A', reviewer: 'Rv', project_manager: 'PM' }

export const known = (v?: number | null): v is number => v !== null && v !== undefined
export const num = (v?: number | null) => (known(v) ? String(Number(v.toFixed(1))) : '—')
export const pct = (v?: number | null) => (known(v) ? `${Number(v.toFixed(1))}%` : '—')
export const ratingOf = (v?: number | null) =>
  !known(v) ? 'no_tasks' : v >= 85 ? 'excellent' : v >= 70 ? 'good' : v >= 50 ? 'fair' : 'needs_attention'
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Half-circle gauge, 0 to 100, with a pointer at the value. */
export function Gauge({ value }: { value?: number | null }) {
  const R = 80, CX = 100, CY = 100
  const at = (v: number) => {
    const a = Math.PI * (1 - v / 100)
    return `${(CX + R * Math.cos(a)).toFixed(2)} ${(CY - R * Math.sin(a)).toFixed(2)}`
  }
  const arc = (from: number, to: number) => `M ${at(from)} A ${R} ${R} 0 0 1 ${at(to)}`
  const has = known(value)
  const v = has ? Math.max(0, Math.min(100, value)) : 0
  return (
    <svg className="kg-gauge" viewBox="0 0 200 110" role="img"
      aria-label={has ? `${num(value)} out of 100, ${RATING[ratingOf(value)].text}` : 'Nothing to score yet'}>
      {has ? ZONES.map((z) => (
        // a small gap between the bands, so they are told apart without relying on colour
        <path key={z.from} d={arc(z.from + (z.from ? 0.7 : 0), z.to - (z.to < 100 ? 0.7 : 0))} stroke={z.color} strokeWidth="18" fill="none">
          <title>{z.name}</title>
        </path>
      )) : <path d={arc(0, 100)} stroke="#e3e8f0" strokeWidth="18" fill="none" />}
      {has && <polygon points="100,34 93,52 107,52" fill="#3a475c" transform={`rotate(${v * 1.8 - 90} ${CX} ${CY})`} />}
      <text x="20" y="109" className="kg-tick" textAnchor="middle">0</text>
      <text x="180" y="109" className="kg-tick" textAnchor="middle">100</text>
    </svg>
  )
}

export function GaugeCard({ title, sub, value, children, foot, onClick, active, hint }: {
  title: ReactNode; sub?: ReactNode; value?: number | null; children?: ReactNode; foot?: ReactNode
  onClick?: () => void; active?: boolean; hint?: string
}) {
  const r = RATING[ratingOf(value)]
  const body = (
    <>
      <div className="kg-title">{title}</div>
      {sub && <div className="kg-sub small muted">{sub}</div>}
      <div className="kg-top">
        <strong className="kg-val">{num(value)}</strong>
        <span className="small muted">Target: {TARGET}</span>
      </div>
      <Gauge value={value} />
      <div className="kg-pill"><span className={`badge ${r.tone}`}>{r.text}</span></div>
      {children && <div className="kg-lines small muted">{children}</div>}
      {foot && <div className="kg-foot small muted">{foot}</div>}
    </>
  )
  return onClick
    ? <button type="button" className={`card kg click${active ? ' on' : ''}`} onClick={onClick} title={hint} aria-pressed={active}>{body}</button>
    : <div className="card kg" title={hint}>{body}</div>
}

/** The score in each role, as small chips: R 82 · A 90 · Rv — · PM 70 */
export function RoleChips({ roles }: { roles?: { role: string; kpi?: number | null }[] }) {
  return (
    <div className="kg-chips">
      {(roles ?? []).map((r) => (
        <span key={r.role} className={`badge ${RATING[ratingOf(r.kpi)].tone}`} title={`As ${ROLE_NAME[r.role]}: ${known(r.kpi) ? `${num(r.kpi)} out of 100` : 'nothing to score'}`}>
          {ROLE_SHORT[r.role]} {num(r.kpi)}
        </span>
      ))}
    </div>
  )
}

function RoleCard({ r }: { r: RoleKpi }) {
  const projects = r.unit === 'projects'
  const unit = projects ? 'project' : 'task'
  const has = known(r.kpi)
  const waiting = r.not_counted ?? 0
  return (
    <GaugeCard title={`As ${ROLE_NAME[r.role]}`} value={r.kpi}
      hint={projects
        ? 'Scored on the projects managed. Each project counts by its progress against its plan: completed = 100; open = 100 minus the points it is behind where it should be today (a project past its due date that is 90% done scores 90).'
        : `Scored on the tasks where this person is the ${ROLE_NAME[r.role]}, each measured against its own plan.`}
      foot={has && (known(r.on_time)
        ? <>Delivery {pct(r.delivery)} × 60% + On-Time {pct(r.on_time)} × 40%</>
        : <>Delivery {pct(r.delivery)} · nothing completed or past due yet</>)}>
      {has ? (
        <>
          <div>{r.completed} of {plural(r.assigned, unit)} completed · {r.completed_on_time} on time</div>
          <div>
            <span style={r.overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{r.overdue ?? 0} past due</span>
            {' · '}{r.running ?? 0} running
          </div>
          {waiting > 0 && <div>{plural(waiting, unit)} not due to start yet — not counted</div>}
        </>
      ) : (
        <div>{waiting > 0 ? `${plural(waiting, unit)} not due to start yet — not counted` : projects ? 'No projects managed' : 'No tasks in this role'}</div>
      )}
    </GaugeCard>
  )
}

export default function KpiCard({ kpi, title = 'My KPI', showPerson = false, action }: {
  kpi: UserKpi; title?: string; showPerson?: boolean; action?: ReactNode
}) {
  const both = known(kpi.task_kpi) && known(kpi.project_kpi)
  return (
    <div className="kpic">
      <div className="kpic-top">
        <div>
          <div className="section-title" style={{ margin: 0 }}>{title}</div>
          {showPerson && (
            <div className="small muted" style={{ marginTop: 2 }}>
              <strong style={{ color: 'var(--navy)' }}>{kpi.name}</strong>
              {[kpi.employee_id, kpi.designation, kpi.role && label(kpi.role), kpi.company, kpi.department].filter(Boolean).map((x) => ` · ${x}`).join('')}
            </div>
          )}
        </div>
        {action}
      </div>
      <div className="kg-grid">
        <GaugeCard title="Total KPI" value={kpi.total_kpi}
          hint="Total KPI = the Task KPI (all the person's tasks, each once), the Project KPI (the projects they manage), or their average when they have both."
          foot={both ? 'Average of the Task KPI and the Project KPI' : known(kpi.project_kpi) ? 'Total KPI = Project KPI' : known(kpi.task_kpi) ? 'Total KPI = Task KPI' : undefined}>
          <div>Task KPI {num(kpi.task_kpi)} · Project KPI {num(kpi.project_kpi)}</div>
          <div>
            {plural(kpi.open, 'open task')}{' · '}
            <span style={kpi.overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{kpi.overdue} past due</span>
          </div>
          <div title="Tasks started on or before the planned start ÷ tasks whose start can be judged. Shown for information; not part of the score.">
            Started on time: {kpi.start_judged ? `${kpi.started_on_time} of ${kpi.start_judged} (${pct(kpi.otsr)})` : '—'}
          </div>
        </GaugeCard>
        {(kpi.roles ?? []).map((r) => <RoleCard key={r.role} r={r} />)}
      </div>
    </div>
  )
}
