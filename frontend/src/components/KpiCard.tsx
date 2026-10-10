import { UserKpi } from '../types'
import { label } from '../constants'

// One person's KPI (see backend app/routers/kpi.py): the total score and the rates behind it.
// Used on My Dashboard (your own) and in User KPI (anyone's, for admin / privileged roles).

export const RATING: Record<string, { text: string; tone: string; hex: string }> = {
  excellent: { text: 'Excellent', tone: 'green', hex: '#1e9e5a' },
  good: { text: 'Good', tone: 'green', hex: '#3aa76d' },
  fair: { text: 'Fair', tone: 'amber', hex: '#d9a514' },
  needs_attention: { text: 'Needs attention', tone: 'red', hex: '#d64545' },
  no_tasks: { text: 'No tasks yet', tone: 'gray', hex: '#b9c2d0' },
}

export const ROLE_NAME: Record<string, string> = {
  responsible: 'Responsible', accountable: 'Accountable', reviewer: 'Reviewer', project_manager: 'Project Manager',
}
export const ROLE_SHORT: Record<string, string> = { responsible: 'R', accountable: 'A', reviewer: 'C', project_manager: 'PM' }

export const pct = (v?: number | null) => (v === null || v === undefined ? '—' : `${Number(v.toFixed(1))}%`)

const toneOf = (v: number) => (v >= 70 ? '#1e9e5a' : v >= 50 ? '#d9a514' : '#d64545')

function Rate({ name, short, value, detail, weight, hint }: {
  name: string; short: string; value?: number | null; detail: string; weight?: string; hint: string
}) {
  const known = value !== null && value !== undefined
  return (
    <div className="kpic-rate" title={hint}>
      <div className="kpic-rate-head">
        <span><strong>{name}</strong> <span className="muted">({short})</span></span>
        <span className="kpic-rate-val">{pct(value)}</span>
      </div>
      <div className="kpic-bar"><i style={{ width: `${known ? Math.max(0, Math.min(100, value!)) : 0}%`, background: known ? toneOf(value!) : '#b9c2d0' }} /></div>
      <div className="small muted">{detail}{weight && <span className="kpic-weight">{weight}</span>}</div>
    </div>
  )
}

export default function KpiCard({ kpi, title = 'My KPI', showPerson = false }: { kpi: UserKpi; title?: string; showPerson?: boolean }) {
  const r = RATING[kpi.rating] ?? RATING.no_tasks
  const score = kpi.total_kpi ?? null
  const deg = score === null ? 0 : Math.max(0, Math.min(100, score)) * 3.6
  return (
    <div className="card kpic">
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
        <span className={`badge ${r.tone}`}>{r.text}</span>
      </div>

      <div className="kpic-body">
        <div className="kpic-score" title="Total KPI = Task Completion Rate × 60% + On-Time Delivery Rate × 40%">
          <div className="kpic-ring" style={{ background: `conic-gradient(${r.hex} ${deg}deg, #e3e8f0 0)` }}>
            <div><strong>{score === null ? '—' : Number(score.toFixed(1))}</strong><span>out of 100</span></div>
          </div>
          <div className="small muted">Total KPI</div>
        </div>

        <div className="kpic-rates">
          <Rate name="Task Completion Rate" short="TCR" value={kpi.assigned ? kpi.tcr : null} weight="60% of the score"
            detail={`${kpi.completed} of ${kpi.assigned} task${kpi.assigned === 1 ? '' : 's'} completed`}
            hint="Completed tasks ÷ all the tasks this person answers for as Responsible, Accountable, Reviewer or the project's Manager (each task once; cancelled tasks are left out)" />
          <Rate name="On-Time Delivery Rate" short="OTR" value={kpi.completed ? kpi.otr : null} weight="40% of the score"
            detail={`${kpi.completed_on_time} of ${kpi.completed} completed task${kpi.completed === 1 ? '' : 's'} finished on time`}
            hint="Tasks completed on or before the approved (or baseline) due date ÷ total completed tasks" />
          <Rate name="On-Time Start Rate" short="OTSR" value={kpi.otsr}
            detail={kpi.start_judged ? `${kpi.started_on_time} of ${kpi.start_judged} task${kpi.start_judged === 1 ? '' : 's'} started on time` : 'No task with a planned start to judge yet'}
            hint="Tasks started on or before the planned start date ÷ tasks with a planned start that have started or should have. Shown for information; not part of the score." />
        </div>
      </div>

      {!!kpi.roles?.length && (
        <div className="kpic-roles">
          {kpi.roles.map((r) => {
            const has = r.kpi !== null && r.kpi !== undefined
            return (
              <div key={r.role} className={`kpic-role${has ? '' : ' none'}`}
                title={has ? `As ${ROLE_NAME[r.role]}: TCR ${pct(r.tcr)} × 60% + OTR ${pct(r.completed ? r.otr : null)} × 40%` : `No tasks as ${ROLE_NAME[r.role]}`}>
                <div className="small muted">As {ROLE_NAME[r.role]}</div>
                <strong style={has ? { color: toneOf(r.kpi!) } : undefined}>{has ? Number(r.kpi!.toFixed(1)) : '—'}</strong>
                <div className="small muted">{has ? `${r.completed} of ${r.assigned} done · ${r.completed_on_time} on time` : 'No tasks'}</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="kpic-foot small muted">
        <span>{kpi.open} open</span>
        <span style={kpi.overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{kpi.overdue} overdue</span>
        <span>Total KPI = TCR × 60% + OTR × 40%</span>
      </div>
    </div>
  )
}
