import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { ProjectKpi, Task, TaskKpi } from '../types'
import { label } from '../constants'

/* Dashboard wired to the FastAPI backend (app/routers/dashboards.py + /tasks).
   Renders page content only — sidebar/topbar come from the app Layout. Scoped under .ad-root. */
const CSS = `
.ad-root{--navy:#0b1f3a;--blue:#1d6bff;--green:#12a150;--red:#ef4444;--amber:#f59e0b;--ink:#0f1b33;--mut:#6b7a90;--line:#e6ebf2;
color:var(--ink);font-family:inherit;font-size:13px}
.ad-root *{box-sizing:border-box}
.ad-body{max-width:1280px}
.ad-hello{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px}
.ad-hello h1{margin:0;font-size:25px;color:var(--navy);display:flex;gap:10px;align-items:center}
.ad-hello p{margin:2px 0 0 44px;color:var(--mut);font-size:14px}
.ad-date{display:flex;align-items:center;gap:10px;color:#334;margin-top:14px;font-size:13.5px}
.ad-live{border:1px solid #bfe8cf;background:#effaf3;color:#12a150;border-radius:99px;padding:3px 10px;font-size:12px;display:flex;align-items:center;gap:6px}
.ad-live i{width:8px;height:8px;border:2px solid #12a150;border-radius:50%}
.ad-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:16px;margin-bottom:22px}
.ad-kpi{border-radius:12px;padding:16px 16px 12px;border:1px solid;position:relative;min-height:136px}
.ad-kpi .h{display:flex;align-items:center;gap:12px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#3a475c}
.ad-kpi .ib{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}
.ad-kpi .v{font-size:30px;font-weight:700;color:var(--navy);margin-top:10px;line-height:1}
.ad-kpi .d{font-size:12px;margin-top:8px;display:block}.ad-kpi .d s{text-decoration:none;color:var(--mut);display:block;margin-top:2px;font-size:11.5px}
.ad-kpi svg.sp{position:absolute;right:12px;bottom:14px}
.ad-cols{display:grid;grid-template-columns:minmax(0,1fr) 366px;gap:16px;align-items:start}
.ad-stack{display:flex;flex-direction:column;gap:16px;min-width:0}
.ad-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:16px}
.ad-scroll{overflow-x:auto}
.ad-card{min-width:0;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 16px;box-shadow:0 1px 2px rgba(16,30,54,.03)}
.ad-card h3{margin:0 0 12px;font-size:15.5px;color:var(--navy);display:flex;align-items:center;gap:8px}
.ad-card h3 svg{color:var(--blue)}
.ad-sel{border:1px solid var(--line);background:#fff;border-radius:6px;padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:8px;color:#334}
.ad-leg div{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}
.ad-leg div:last-child{border:0}.ad-leg i{width:9px;height:9px;border-radius:3px}.ad-leg b{margin-left:auto}
table.ad-t{width:100%;border-collapse:collapse}
.ad-t th{font-size:11px;color:var(--mut);font-weight:500;text-align:left;padding:8px 6px;letter-spacing:.03em}
.ad-t td{padding:11px 6px;border-top:1px solid var(--line);font-size:12.5px}
.ad-t tbody tr{cursor:pointer}.ad-t tbody tr:hover{background:#f7f9fd}
.pill{display:inline-flex;align-items:center;gap:5px;border-radius:6px;padding:3px 9px;font-size:11.5px}
.pb{height:5px;border-radius:9px;background:#e8edf4;width:100px;display:inline-block;vertical-align:middle;overflow:hidden;margin-right:12px}.pb span{display:block;height:100%;border-radius:9px}
.ad-btn{border:1px solid var(--line);background:#fff;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;color:#334}
.ad-port{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px}
.ad-p{border:1px solid var(--line);border-radius:8px;padding:11px 12px;min-height:88px;position:relative;background:linear-gradient(180deg,#fff,#f5f9ff)}
.ad-p small{font-size:11px;color:#3a475c;letter-spacing:.02em}.ad-p b{display:block;font-size:24px;margin-top:6px}
.ad-p svg{position:absolute;right:10px;bottom:10px}
.ad-tabs{display:inline-flex;max-width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin-bottom:14px}
.ad-tabs button{border:0;background:#fff;font-size:14px;padding:10px 20px;cursor:pointer;color:#334;white-space:nowrap}.ad-tabs .on{background:#eef3ff;color:var(--navy);font-weight:700;box-shadow:inset 0 -2px 0 var(--blue)}
.ad-mini th{font-size:12px;padding:14px 12px;letter-spacing:.05em}
.ad-mini td{font-size:15px;padding:16px 12px}
.ad-mini td:first-child{font-weight:600;color:var(--navy)}
.cal{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;row-gap:2px}
.cal .w{font-size:11px;color:var(--mut);padding:8px 0}
.cal button{border:0;background:none;height:39px;font-size:13px;position:relative;cursor:pointer;color:var(--ink);border-radius:50%;width:39px;margin:auto}
.cal button:hover{background:#eef3ff}.cal .o{color:#b5bfcd}
.cal .t{background:#1d6bff!important;color:#fff;font-weight:700}
.cal .p{outline:2px solid var(--amber);outline-offset:-3px}
.cal button u{position:absolute;bottom:2px;left:50%;width:5px;height:5px;border-radius:50%;margin-left:-2.5px}
.ad-hint{display:flex;gap:10px;align-items:center;background:#f3f7ff;border-radius:8px;padding:10px 12px;color:var(--mut);font-size:11px;margin-top:6px}
@media(max-width:1200px){.ad-cols{grid-template-columns:1fr}.ad-kpis{grid-template-columns:repeat(3,1fr)}}
@media(max-width:860px){.ad-side{display:none}.ad-2{grid-template-columns:1fr}.ad-port{grid-template-columns:repeat(2,1fr)}.ad-kpis{grid-template-columns:repeat(2,1fr)}}
`

// ---------------------------------------------------------------- types / helpers
interface OrgRow { name: string; total: number; open: number; completed: number; overdue: number; projects: number }
interface Trends { dates: string[]; series: Record<string, number[]>; chart: { date: string; completed: number; in_progress: number }[] }
const TODAY = new Date()
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = (s?: string | null) => { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}` }
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const TODAY_ISO = iso(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())
const DONE = ['completed', 'closed'], DOING = ['in_progress', 'in_review']
const dueOf = (t: Task) => t.approved_due_date || t.baseline_due_date || ''
const PR: Record<string, [string, string]> = { critical: ['#fdeaea', '#c62828'], high: ['#fdeaea', '#e23b3b'], medium: ['#fff4de', '#e59a0c'], low: ['#e6f8ee', '#12a150'] }
const stTone = (s: string): [string, string] => DONE.includes(s) ? ['#e6f8ee', '#12a150'] : s === 'blocked' ? ['#fdeaea', '#e23b3b'] : ['#eaf2ff', '#1d6bff']
const HEALTH_HEX: Record<string, string> = { green: '#12a150', amber: '#f59e0b', red: '#ef4444', black: '#1a1a1a' }
// key = field on TaskKpi and series in /trends; bad = a rise is bad news
const KPIS = [
  { l: 'TOTAL TASKS', k: 'total', c: '#1d6bff', bg: '#eef4ff', bd: '#cfe0ff', ic: 'check' },
  { l: 'OPEN', k: 'open', c: '#12a150', bg: '#eefaf3', bd: '#c9ecd8', ic: 'box' },
  { l: 'DUE TODAY', k: 'due_today', c: '#7c4dff', bg: '#f5f1ff', bd: '#ddd2fb', ic: 'cal' },
  { l: 'OVERDUE', k: 'overdue', c: '#f59e0b', bg: '#fff5ee', bd: '#fbdcc8', ic: 'warn', bad: true },
  { l: 'CRITICAL', k: 'critical', c: '#ef4444', bg: '#fff1f1', bd: '#fbd2d2', ic: 'alert', bad: true },
  { l: 'BLOCKED', k: 'blocked', c: '#5b6b82', bg: '#f4f6f9', bd: '#dfe4ec', ic: 'ban', bad: true },
] as const

// ---------------------------------------------------------------- icons
const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', check: 'M9 12l2 2 4-4M4 4h16v16H4z', kanban: 'M4 4h16v16H4zM9 8v8M15 8v5',
  folder: 'M3 6h6l2 2h10v11H3z', list: 'M4 7h16M4 12h10M4 17h16', gavel: 'M14 4l6 6-3 3-6-6zM11 9L4 16l4 4 7-7', grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM9 12l2 2 4-4', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  bell: 'M6 9a6 6 0 0112 0c0 6 3 8 3 8H3s3-2 3-8M10 21h4', sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  chev: 'M6 9l6 6 6-6', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', warn: 'M12 4l9 16H3zM12 10v4M12 17v.5', ban: 'M12 3a9 9 0 100 18 9 9 0 000-18zM6 6l12 12',
  alert: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v5M12 16v.5', box: 'M4 4h16v16H4zM9 4v16', bars: 'M6 20V10M12 20V4M18 20v-7',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-4 3-6 6-6s6 2 6 6M17 11a3 3 0 100-6M21 20c0-3-2-5-4-5.5', target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 12h.01',
  out: 'M4 8h13l-3-3M20 16H7l3 3', refresh: 'M20 12a8 8 0 11-3-6.2M20 4v5h-5', l: 'M15 6l-6 6 6 6', r: 'M9 6l6 6-6 6', star: 'M12 4l2.5 5 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8z',
  play: 'M7 5l12 7-12 7z', leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15zM5 19l7-7', pulse: 'M3 12h4l3-7 4 14 3-7h4', proj: 'M4 20V9l8-5 8 5v11zM9 20v-6h6v6', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 20c0-4 3-6 7-6s7 2 7 6', hand: 'M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-3 7-6 7-3 0-5-2-6-5l-1-3a1.5 1.5 0 012.5-1z',
}
function Ic({ n, s = 18, c = 'currentColor', w = 1.8 }: { n: string; s?: number; c?: string; w?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"><path d={P[n]} /></svg>
}

// ---------------------------------------------------------------- charts
const smooth = (p: [number, number][]) => p.reduce((d, [x, y], i) => {
  if (!i) return `M${x},${y}`
  const [px, py] = p[i - 1], cx = (px + x) / 2
  return `${d} C${cx},${py} ${cx},${y} ${x},${y}`
}, '')

function Spark({ pts, c, id }: { pts: number[]; c: string; id: string }) {
  const W = 100, H = 40, mx = Math.max(...pts), mn = Math.min(...pts)
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 4 - ((v - mn) / (mx - mn || 1)) * (H - 10)] as [number, number])
  const d = smooth(xy)
  return (
    <svg className="sp" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".25" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${W},${H} L0,${H}Z`} fill={`url(#${id})`} /><path d={d} fill="none" stroke={c} strokeWidth="1.6" />
    </svg>
  )
}

function Ring({ size, sw, segs, children }: { size: number; sw: number; segs: { f: number; c: string }[]; children: React.ReactNode }) {
  const r = (size - sw) / 2, C = 2 * Math.PI * r; let off = 0
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8edf4" strokeWidth={sw} />
        {segs.map((s, i) => { const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.c} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${Math.max(0, s.f * C - 4)} ${C}`} strokeDashoffset={-off * C - 2} />; off += s.f; return el })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  )
}

function Progress({ data }: { data: Trends['chart'] }) {
  const W = 400, H = 175, L = 22, B = 152, T = 12, n = Math.max(data.length, 2)
  const peak = Math.max(...data.map((d) => Math.max(d.completed, d.in_progress)), 1)
  const mx = Math.max(4, Math.ceil(peak / 4) * 4)
  const X = (i: number) => L + 10 + (i * (W - L - 20)) / (n - 1), Y = (v: number) => B - (v / mx) * (B - T)
  const g = data.map((d, i) => [X(i), Y(d.completed)] as [number, number])
  const b = data.map((d, i) => [X(i), Y(d.in_progress)] as [number, number])
  const hi = data.reduce((m, d, i) => (d.completed > data[m].completed ? i : m), 0)
  if (data.length < 2) return <div style={{ color: 'var(--mut)', padding: 30, textAlign: 'center' }}>No activity yet</div>
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#12a150" stopOpacity=".18" /><stop offset="1" stopColor="#12a150" stopOpacity="0" /></linearGradient>
        <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d6bff" stopOpacity=".15" /><stop offset="1" stopColor="#1d6bff" stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((q) => { const v = (mx / 4) * q; return <g key={q}><line x1={L} x2={W} y1={Y(v)} y2={Y(v)} stroke="#edf1f6" strokeDasharray="3 3" /><text x={L - 8} y={Y(v) + 3} fontSize="9" fill="#6b7a90" textAnchor="end">{v}</text></g> })}
      <path d={`${smooth(g)} L${X(n - 1)},${B} L${X(0)},${B}Z`} fill="url(#gg)" /><path d={`${smooth(b)} L${X(n - 1)},${B} L${X(0)},${B}Z`} fill="url(#gb)" />
      <path d={smooth(g)} fill="none" stroke="#12a150" strokeWidth="1.8" /><path d={smooth(b)} fill="none" stroke="#1d6bff" strokeWidth="1.6" />
      {g.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#fff" stroke="#12a150" strokeWidth="1.5" />)}
      {b.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#fff" stroke="#1d6bff" strokeWidth="1.5" />)}
      {data[hi].completed > 0 && <g transform={`translate(${Math.min(Math.max(X(hi) - 33, L), W - 66)},${Math.max(Y(data[hi].completed) - 46, 0)})`}><rect width="66" height="34" rx="5" fill="#0b1f3a" /><text x="33" y="14" textAnchor="middle" fontSize="10" fill="#fff">{data[hi].completed} task{data[hi].completed > 1 ? 's' : ''}</text><text x="33" y="27" textAnchor="middle" fontSize="10" fill="#fff">Completed</text></g>}
      {data.map((d, i) => <text key={d.date} x={X(i)} y={B + 16} fontSize="9" fill="#6b7a90" textAnchor="middle">{fmt(d.date).slice(0, 6)}</text>)}
    </svg>
  )
}

// ---------------------------------------------------------------- calendar
function Calendar({ onPick, picked, dots }: { onPick: (d: string | null) => void; picked: string | null; dots: Record<string, string> }) {
  const [ym, setYm] = useState({ y: TODAY.getFullYear(), m: TODAY.getMonth() })
  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1).getDay(), out = []
    for (let i = 0; i < 42; i++) out.push(new Date(ym.y, ym.m, 1 - first + i))
    return out
  }, [ym])
  const go = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  return (
    <div className="ad-card" style={{ padding: 16 }}>
      <h3><Ic n="cal" />Calendar</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <button className="ad-btn" onClick={() => go(-1)} style={{ padding: '6px 9px' }}><Ic n="l" s={13} /></button>
        <select className="ad-btn" style={{ flex: 1, textAlign: 'left' }} value={ym.m} onChange={(e) => setYm({ ...ym, m: +e.target.value })}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m} {ym.y}</option>)}
        </select>
        <button className="ad-btn" onClick={() => go(1)} style={{ padding: '6px 9px' }}><Ic n="r" s={13} /></button>
        <button className="ad-btn" onClick={() => setYm({ y: TODAY.getFullYear(), m: TODAY.getMonth() })}>Today</button>
      </div>
      <div className="cal">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="w">{d}</div>)}
        {cells.map((d) => {
          const k = iso(d.getFullYear(), d.getMonth(), d.getDate()), out = d.getMonth() !== ym.m
          const isT = d.toDateString() === TODAY.toDateString()
          return <button key={k} className={`${out ? 'o' : ''} ${isT ? 't' : ''} ${picked === k ? 'p' : ''}`} onClick={() => onPick(picked === k ? null : k)}>{d.getDate()}{dots[k] && !isT && <u style={{ background: dots[k] }} />}</button>
        })}
      </div>
      <div className="ad-hint"><Ic n="cal" s={20} c="#1d6bff" /><span>Dots = tasks of yours due that day (red = overdue).<br />Click a day to filter My Tasks.</span></div>
    </div>
  )
}


// ---------------------------------------------------------------- page
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [taskKpi, setTaskKpi] = useState<TaskKpi | null>(null)
  const [projKpi, setProjKpi] = useState<ProjectKpi | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [healthDist, setHealthDist] = useState<Record<string, number>>({})
  const [delayCauses, setDelayCauses] = useState<{ category: string; count: number }[]>([])
  const [orgIntel, setOrgIntel] = useState<{ bySbu: OrgRow[]; byFunction: OrgRow[]; byDepartment: OrgRow[] } | null>(null)
  const [trends, setTrends] = useState<Trends | null>(null)
  const [tab, setTab] = useState<'bySbu' | 'byFunction' | 'byDepartment'>('bySbu')
  const [picked, setPicked] = useState<string | null>(null)

  // org-wide widgets
  useEffect(() => {
    api.get<ProjectKpi>('/dashboards/executive').then(setProjKpi).catch(() => {})
    api.get<Record<string, number>>('/dashboards/health-distribution').then(setHealthDist).catch(() => {})
    api.get<{ category: string; count: number }[]>('/dashboards/delay-causes').then(setDelayCauses).catch(() => {})
    api.get<{ bySbu: OrgRow[]; byFunction: OrgRow[]; byDepartment: OrgRow[] }>('/dashboards/org-intelligence')
      .then(setOrgIntel).catch(() => setOrgIntel({ bySbu: [], byFunction: [], byDepartment: [] }))
  }, [])

  // per-user widgets
  useEffect(() => {
    if (!user) return
    api.get<TaskKpi>(`/dashboards/individual/${user.id}`).then(setTaskKpi).catch(() => {})
    api.get<Trends>(`/dashboards/individual/${user.id}/trends?days=7`).then(setTrends).catch(() => {})
    api.get<Task[]>(`/tasks?responsible_id=${user.id}`).then(setMyTasks).catch(() => {})
  }, [user])

  const rows = useMemo(() => (picked ? myTasks.filter((t) => dueOf(t) === picked) : myTasks), [myTasks, picked])
  const dots = useMemo(() => {
    const m: Record<string, string> = {}
    myTasks.forEach((t) => { const d = dueOf(t); if (d) m[d] = !DONE.includes(t.status) && d < TODAY_ISO ? '#ef4444' : m[d] ?? '#f59e0b' })
    return m
  }, [myTasks])

  // Task Completion Overview — derived from the user's own tasks
  const cnt = useMemo(() => {
    const c = { done: 0, doing: 0, blocked: 0, todo: 0 }
    myTasks.forEach((t) => { if (DONE.includes(t.status)) c.done++; else if (t.blocker || t.status === 'blocked') c.blocked++; else if (DOING.includes(t.status)) c.doing++; else c.todo++ })
    return c
  }, [myTasks])
  const nT = myTasks.length || 1
  const donePct = Math.round((cnt.done / nT) * 1000) / 10

  const delta = (k: string, bad?: boolean) => {
    const s = trends?.series[k]
    if (!s) return { t: '→ 0%', c: '#6b7a90' }
    const a = s[0], b = s[s.length - 1], p = a ? Math.round(((b - a) / a) * 100) : b ? 100 : 0
    return { t: `${p > 0 ? '↑' : p < 0 ? '↓' : '→'} ${Math.abs(p)}%`, c: p === 0 ? '#6b7a90' : (p > 0) !== !!bad ? '#12a150' : '#ef4444' }
  }

  const hTotal = Object.values(healthDist).reduce((s, v) => s + v, 0)
  const hEntries = (['green', 'amber', 'red', 'black'] as const).filter((h) => healthDist[h] > 0)
  const maxDelay = Math.max(1, ...delayCauses.map((d) => d.count))
  const first = (user?.name ?? '').split(' ')[0]

  return (
    <div className="ad-root">
      <style>{CSS}</style>
      <div className="ad-body">
        <div className="ad-hello">
          <div><h1><Ic n="hand" s={34} c="#f5b31b" w={1.6} />Welcome back, {first}!</h1><p>Here's what's happening with your tasks and projects today.</p></div>
          <div className="ad-date"><Ic n="cal" s={18} c="#1d6bff" />{TODAY.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}<span className="ad-live"><i />Live</span></div>
        </div>

        <div className="ad-kpis">
          {KPIS.map((k, i) => {
            const d = delta(k.k, 'bad' in k ? k.bad : false)
            const pts = trends?.series[k.k] ?? [0, 0]
            return (
              <div key={k.l} className="ad-kpi" style={{ background: `linear-gradient(160deg,${k.bg},#fff)`, borderColor: k.bd }}>
                <div className="h"><span className="ib" style={{ background: k.c }}><Ic n={k.ic} s={17} c="#fff" /></span>{k.l}</div>
                <div className="v">{taskKpi ? taskKpi[k.k as keyof TaskKpi] : '—'}</div>
                <span className="d"><span style={{ color: d.c }}>{d.t}</span><s>vs. last week</s></span>
                <Spark pts={pts} c={k.c} id={`sp${i}`} />
              </div>
            )
          })}
        </div>

        <div className="ad-cols">
          <div className="ad-stack">
            <div className="ad-2">
              <div className="ad-card">
                <h3>Task Completion Overview</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                  <Ring size={152} sw={16} segs={[{ f: cnt.done / nT, c: '#12a150' }, { f: cnt.doing / nT, c: '#1d6bff' }, { f: cnt.todo / nT, c: '#6b7a90' }, { f: cnt.blocked / nT, c: '#ef4444' }]}>
                    <div><div style={{ fontSize: 26, fontWeight: 700, color: 'var(--navy)' }}>{donePct}%</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>Completed</div></div>
                  </Ring>
                  <div className="ad-leg" style={{ flex: 1 }}>
                    {[['Completed', cnt.done, '#12a150'], ['In Progress', cnt.doing, '#1d6bff'], ['Not Started', cnt.todo, '#6b7a90'], ['Blocked', cnt.blocked, '#ef4444']].map(([l, v, c]) => <div key={l as string}><i style={{ background: c as string }} />{l}<b>{v}</b></div>)}
                  </div>
                </div>
              </div>
              <div className="ad-card"><h3><Ic n="bars" s={17} />Task Progress</h3><Progress data={trends?.chart ?? []} /></div>
            </div>

            <div className="ad-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0 }}><Ic n="cal" />My Tasks{picked && <span style={{ fontWeight: 400 }}>— due {fmt(picked)}</span>}</h3>
                {picked && <button className="ad-btn" onClick={() => setPicked(null)}>Clear date filter</button>}
              </div>
              <div className="ad-scroll"><table className="ad-t">
                <thead><tr>{['CODE', 'TASK', 'PRIORITY', 'STATUS', 'PROGRESS', 'DUE'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((t) => {
                    const p = PR[t.priority] ?? PR.medium, s = stTone(t.status), d = dueOf(t), done = DONE.includes(t.status)
                    return (
                      <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
                        <td>{t.code}</td>
                        <td>{t.title}{t.blocker && <span className="pill" style={{ background: '#fdeaea', color: '#e23b3b', marginLeft: 8 }}>Blocked</span>}</td>
                        <td><span className="pill" style={{ background: p[0], color: p[1] }}><Ic n="star" s={10} />{label(t.priority)}</span></td>
                        <td><span className="pill" style={{ background: s[0], color: s[1] }}>{done ? '✓' : '›'} {label(t.status)}</span></td>
                        <td><span className="pb"><span style={{ width: `${t.progress_pct}%`, background: done || t.progress_pct >= 50 ? '#12a150' : '#1d6bff' }} /></span>{Math.round(t.progress_pct)}%</td>
                        <td style={{ color: done ? '#9aa6b8' : d && d < TODAY_ISO ? '#e23b3b' : undefined, fontWeight: !done && d && d < TODAY_ISO ? 600 : 400 }}>{fmt(d)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
              {!rows.length && <div style={{ textAlign: 'center', color: 'var(--mut)', padding: 20 }}>{picked ? 'No tasks due on this date.' : 'No tasks assigned to you.'}</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 16 }}>
              <div className="ad-card">
                <h3><Ic n="users" s={17} />Group Portfolio</h3>
                <div className="ad-port">
                  {[['TOTAL PROJECTS', projKpi?.total, '#1d6bff', 'proj'], ['ACTIVE PROJECTS', projKpi?.active, '#12a150', 'play'], ['GREEN', projKpi?.green, '#12a150', 'leaf'], ['AMBER', projKpi?.amber, '#f59e0b', 'shield'], ['RED', projKpi?.red, '#ef4444', 'warn']].map(([l, v, c, i]) => (
                    <div key={l as string} className="ad-p"><small>{l}</small><b style={{ color: c as string }}>{(v as number | undefined) ?? '—'}</b><Ic n={i as string} s={20} c={c as string} /></div>
                  ))}
                </div>
              </div>
              <div className="ad-card">
                <h3><Ic n="users" s={17} />Team &amp; Portfolio Breakdown</h3>
                <div className="ad-tabs">{([['bySbu', 'By SBU'], ['byFunction', 'By Function'], ['byDepartment', 'By Department']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
                {orgIntel === null ? <div style={{ color: 'var(--mut)', padding: 10 }}>Loading…</div> : (
                  <div className="ad-scroll"><table className="ad-t ad-mini">
                    <thead><tr>{['NAME', 'TOTAL', 'OPEN', 'COMPLETED', 'OVERDUE', 'PROJECTS'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{orgIntel[tab].map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.total}</td><td>{r.open}</td><td>{r.completed}</td><td style={{ color: r.overdue ? '#ef4444' : undefined }}>{r.overdue}</td><td>{r.projects}</td></tr>)}</tbody>
                  </table></div>
                )}
              </div>
            </div>
          </div>

          <div className="ad-stack">
            <Calendar picked={picked} onPick={setPicked} dots={dots} />
            <div className="ad-card">
              <h3><Ic n="pulse" s={17} />Project Health Distribution</h3>
              {hTotal === 0 ? <div style={{ color: 'var(--mut)' }}>No projects</div> : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
                  <Ring size={112} sw={14} segs={hEntries.map((h) => ({ f: healthDist[h] / hTotal, c: HEALTH_HEX[h] }))}><div><b style={{ fontSize: 18 }}>{hTotal}</b><div style={{ fontSize: 11, color: 'var(--mut)' }}>Projects</div></div></Ring>
                  <div className="ad-leg" style={{ flex: 1 }}>
                    {hEntries.map((h) => <div key={h} style={{ border: 0, padding: '7px 0' }}><i style={{ background: HEALTH_HEX[h], borderRadius: '50%', width: 10, height: 10 }} />{label(h)}<b style={{ fontSize: 12 }}>{healthDist[h]} · {Math.round((healthDist[h] / hTotal) * 100)}%</b></div>)}
                  </div>
                </div>
              )}
            </div>
            <div className="ad-card">
              <h3><Ic n="target" s={17} />Top Delay Causes</h3>
              {delayCauses.map((d) => (
                <div key={d.category} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{label(d.category)}</span><b>{d.count}</b></div>
                  <div style={{ height: 5, borderRadius: 9, background: '#e8edf4', marginTop: 6 }}><div style={{ height: '100%', width: `${(d.count / maxDelay) * 100}%`, borderRadius: 9, background: '#ef4444' }} /></div>
                </div>
              ))}
              {!delayCauses.length && <div style={{ color: 'var(--mut)', fontSize: 12 }}>No delays recorded</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}