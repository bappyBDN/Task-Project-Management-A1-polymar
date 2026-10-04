import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Comment, Company, Department, Function, Project, ProjectKpi, Task, TaskKpi, User } from '../types'
import { HEALTH_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'
import { mergeSbuRows } from '../org'
import { sbuKey } from '../components/SbuSelect'
import ProfileForm from '../components/ProfileForm'
import { CommentReplies, REPLY_CSS, addReply, commenterLabel, fmtDateTime } from '../components/CommentsPanel'

/* Dashboard wired to the FastAPI backend (app/routers/dashboards.py + /tasks).
   Renders page content only — sidebar/topbar come from the app Layout. Scoped under .dsb-root.
   The classes must NOT start with "ad-": ad blockers (uBlock, AdBlock, Brave, Opera...) hide
   elements named .ad-body / .ad-card / .ad-row as adverts, which left this whole page blank
   for everyone using one. */
const CSS = `
.dsb-root{--navy:#0b1f3a;--blue:#1d6bff;--green:#12a150;--red:#ef4444;--amber:#f59e0b;--ink:#0f1b33;--mut:#6b7a90;--line:#e6ebf2;
color:var(--ink);font-family:inherit;font-size:13px}
.dsb-root *{box-sizing:border-box}
.dsb-body{max-width:1280px}
.dsb-hello{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:6px 16px;margin-bottom:18px}
.dsb-err{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff5f5;border:1px solid #fbd2d2;color:#b42318;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px}
.dsb-hello h1{margin:0;font-size:25px;color:var(--navy);display:flex;gap:10px;align-items:center}
.dsb-hello p{margin:2px 0 0 44px;color:var(--mut);font-size:14px}
.dsb-me{display:flex;align-items:center;gap:14px;min-width:0}
.dsb-me .dsb-me-pic{position:relative;width:56px;height:56px;border-radius:50%;border:0;padding:0;flex:none;cursor:pointer;background:linear-gradient(135deg,#1d6bff,#0b1f3a);color:#fff;font-size:20px;font-weight:700;display:grid;place-items:center;box-shadow:0 2px 8px rgba(11,31,58,.18)}
.dsb-me .dsb-me-pic:hover{box-shadow:0 0 0 3px #cfe0ff,0 2px 8px rgba(11,31,58,.18)}
.dsb-me .dsb-me-pic b{position:absolute;right:-2px;bottom:-2px;width:22px;height:22px;border-radius:50%;background:#fff;color:#1d6bff;border:1px solid var(--line);display:grid;place-items:center;font-size:12px;font-weight:400;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.dsb-me .dsb-me-edit{border:0;background:none;padding:0;margin-top:4px;color:#1d6bff;font-size:12.5px;cursor:pointer}
.dsb-me .dsb-me-edit:hover{text-decoration:underline}
.dsb-me p{margin-left:0!important}
.dsb-okmsg{background:#effaf3;border:1px solid #bfe8cf;color:#12a150;border-radius:10px;padding:8px 14px;margin-bottom:14px;font-size:13px}
.dsb-date{flex-wrap:wrap}
.dsb-row{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.dsb-row .dsb-leg{flex:1;min-width:140px}
.dsb-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px}
.dsb-date{display:flex;align-items:center;gap:10px;color:#334;margin-top:14px;font-size:13.5px}
.dsb-live{border:1px solid #bfe8cf;background:#effaf3;color:#12a150;border-radius:99px;padding:3px 10px;font-size:12px;display:flex;align-items:center;gap:6px}
.dsb-live i{width:8px;height:8px;border:2px solid #12a150;border-radius:50%}
.dsb-kpis{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:14px;margin-bottom:22px}
.dsb-kpi .hb{display:flex;height:8px;border-radius:9px;overflow:hidden;background:#e3e9f2;flex:1;min-width:40px;max-width:120px}
.dsb-kpi .hb i{display:block;height:100%}
.dsb-seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;flex:none}
.dsb-seg button{border:0;background:#fff;font-size:12.5px;padding:6px 14px;cursor:pointer;color:#334;display:inline-flex;align-items:center;gap:6px}
.dsb-seg button+button{border-left:1px solid var(--line)}
.dsb-seg .on{background:var(--navy);color:#fff;font-weight:600}
.dsb-pj td{vertical-align:middle}
.dsb-pj .nm{font-weight:600;color:var(--navy)}
.dsb-pj .hd{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;vertical-align:middle}
.dsb-pj .cnt{display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
.dsb-pj .lnk{border:1px solid var(--line);background:#fff;border-radius:6px;padding:4px 10px;font-size:11.5px;cursor:pointer;color:var(--blue);white-space:nowrap}
.dsb-pj .lnk:hover{background:#eef3ff;border-color:#cfe0ff}
.dsb-pj .pb{width:64px;margin-right:8px}
.dsb-kpi{border-radius:12px;padding:16px 16px 12px;border:1px solid;min-height:136px;display:flex;flex-direction:column;min-width:0;font:inherit;color:inherit;text-align:left;cursor:pointer;transition:box-shadow .15s,transform .15s}
.dsb-kpi:hover{box-shadow:0 4px 14px rgba(11,31,58,.12);transform:translateY(-1px)}
.dsb-kpi:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.dsb-kpi.on{box-shadow:0 0 0 2px var(--navy)}
.dsb-kpi .h{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#3a475c;min-width:0}
.dsb-kpi .ib{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}
.dsb-kpi .v{font-size:30px;font-weight:700;color:var(--navy);margin-top:10px;line-height:1}
.dsb-kpi .f{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:auto;padding-top:8px}
.dsb-kpi .d{font-size:12px;display:block;white-space:nowrap;flex:none}.dsb-kpi .d s{text-decoration:none;color:var(--mut);display:block;margin-top:2px;font-size:11.5px}
.dsb-kpi svg.sp{display:block;flex:0 1 100px;min-width:40px;max-width:100px;height:40px}
.dsb-cols{display:grid;grid-template-columns:minmax(0,1fr) 366px;gap:16px;align-items:start}
.dsb-stack{display:flex;flex-direction:column;gap:16px;min-width:0}
.dsb-cmts{max-height:420px;overflow-y:auto;margin:0 -4px}
.dsb-cmt{border-top:1px solid var(--line);padding:10px 4px}
.dsb-cmt-open{display:block;width:100%;text-align:left;background:none;border:0;padding:0;cursor:pointer;font:inherit;color:inherit;border-radius:6px}
.dsb-cmt-open:hover{background:#f7f9fd}
.dsb-cmt .role{font-size:10.5px;font-weight:600;border-radius:999px;padding:1px 7px;margin-left:6px}
.dsb-cmt .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.dsb-cmt .when{font-size:11px;color:var(--mut);white-space:nowrap}
.dsb-cmt .ref{font-size:12px;color:#334;margin-top:5px;overflow-wrap:anywhere}
.dsb-cmt .txt{font-size:12.5px;margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}
.dsb-cmt .by{font-size:11.5px;color:var(--mut);margin-top:5px;overflow-wrap:anywhere}
.dsb-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:16px}
.dsb-scroll{overflow-x:auto}
.dsb-card{min-width:0;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 16px;box-shadow:0 1px 2px rgba(16,30,54,.03)}
.dsb-card h3{margin:0 0 12px;font-size:15.5px;color:var(--navy);display:flex;align-items:center;gap:8px}
.dsb-card h3 svg{color:var(--blue)}
.dsb-sel{border:1px solid var(--line);background:#fff;border-radius:6px;padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:8px;color:#334}
.dsb-leg div{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}
.dsb-leg div:last-child{border:0}.dsb-leg i{width:9px;height:9px;border-radius:3px}.dsb-leg b{margin-left:auto}
table.dsb-t{width:100%;border-collapse:collapse}
.dsb-t th.srt{cursor:pointer;user-select:none;white-space:nowrap}.dsb-t th.srt:hover{color:var(--navy)}
.dsb-t td .sub{display:block;font-size:11px;color:var(--mut);margin-top:2px}
.dsb-t td a{color:var(--navy);font-weight:600;text-decoration:none}.dsb-t td a:hover{text-decoration:underline}
.dsb-mine-f{border:1px solid var(--line);background:#fff;border-radius:6px;padding:6px 8px;font-size:12px;color:#334;max-width:220px}
.dsb-t th{font-size:11px;color:var(--mut);font-weight:500;text-align:left;padding:8px 6px;letter-spacing:.03em}
.dsb-t td{padding:11px 6px;border-top:1px solid var(--line);font-size:12.5px}
.dsb-t td:first-child,.dsb-t td:last-child{white-space:nowrap}
.dsb-t tbody tr{cursor:pointer}.dsb-t tbody tr:hover{background:#f7f9fd}
.pill{display:inline-flex;align-items:center;gap:5px;border-radius:6px;padding:3px 9px;font-size:11.5px;white-space:nowrap}
.pb{height:5px;border-radius:9px;background:#e8edf4;width:100px;display:inline-block;vertical-align:middle;overflow:hidden;margin-right:12px}.pb span{display:block;height:100%;border-radius:9px}
.dsb-btn{border:1px solid var(--line);background:#fff;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;color:#334}
.dsb-port{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.dsb-p{border:1px solid var(--line);border-radius:8px;padding:11px 12px;min-height:88px;min-width:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#fff,#f5f9ff)}
.dsb-p small{font-size:11px;color:#3a475c;letter-spacing:.02em}
.dsb-p .pv{display:flex;align-items:flex-end;justify-content:space-between;gap:6px;margin-top:auto;padding-top:6px}.dsb-p b{font-size:24px;line-height:1;min-width:0;overflow-wrap:anywhere}
.dsb-p svg{flex:none}
.dsb-tabs{display:inline-flex;max-width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin-bottom:14px}
.dsb-tabs button{border:0;background:#fff;font-size:14px;padding:10px 20px;cursor:pointer;color:#334;white-space:nowrap}.dsb-tabs .on{background:#eef3ff;color:var(--navy);font-weight:700;box-shadow:inset 0 -2px 0 var(--blue)}
.dsb-mini th{font-size:12px;padding:14px 12px;letter-spacing:.05em}
.dsb-mini td{font-size:15px;padding:16px 12px}
.dsb-mini td:first-child{font-weight:600;color:var(--navy)}
.dsb-bk .num{text-align:right;white-space:nowrap}
.dsb-bk th.bk-s{cursor:pointer;user-select:none;white-space:nowrap}.dsb-bk th.bk-s:hover{color:var(--navy)}
.dsb-bk tbody tr{cursor:default}
.bk-name{border:0;background:none;padding:0;font:inherit;font-weight:600;color:var(--navy);cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-align:left}
.bk-name:hover span{text-decoration:underline}.bk-name i{font-style:normal;font-size:11px;color:var(--blue);width:12px}
.dsb-bk tr.bk-open td{background:#f4f8ff}
.dsb-bk tr.bk-drill>td{padding:0 12px 14px;background:#f4f8ff;font-weight:400;white-space:normal}
.bk-proj{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.bk-proj th{font-size:11px;color:var(--mut);font-weight:600;text-align:left;padding:8px 10px;background:#fafcff;letter-spacing:.03em;white-space:nowrap}
.bk-proj td{font-size:12.5px!important;padding:8px 10px!important;border-top:1px solid var(--line);color:var(--ink)!important;font-weight:400!important;white-space:nowrap;background:#fff!important}
.bk-proj td.t{white-space:normal;min-width:180px}.bk-proj a{color:var(--navy);font-weight:600;text-decoration:none}.bk-proj a:hover{text-decoration:underline}
.dsb-bk tfoot td{border-top:2px solid var(--line);font-weight:700;color:var(--navy);font-size:15px;padding:14px 12px}
.bk-bar{display:inline-block;vertical-align:middle;width:80px;height:6px;border-radius:9px;background:#e8edf4;margin-right:10px;overflow:hidden}.bk-bar span{display:block;height:100%;background:#1d6bff;border-radius:9px}
.bk-overlay{position:fixed;inset:0;z-index:1000;background:rgba(16,30,54,.45);padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px));display:flex}
.bk-overlay>div{flex:1;min-width:0;display:flex}
.dsb-bk.full{flex:1;display:flex;flex-direction:column;min-height:0}
.dsb-bk.full .bk-body{flex:1;overflow:auto}
.dsb-bk.full thead th{position:sticky;top:0;background:#fff;z-index:1}
.cal{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;row-gap:2px}
.cal .w{font-size:11px;color:var(--mut);padding:8px 0}
.cal button{border:0;background:none;height:39px;font-size:13px;position:relative;cursor:pointer;color:var(--ink);border-radius:50%;width:39px;margin:auto}
.cal button:hover{background:#eef3ff}.cal .o{color:#b5bfcd}
.cal .t{background:#1d6bff!important;color:#fff;font-weight:700}
.cal .p{outline:2px solid var(--amber);outline-offset:-3px}
.cal button u{position:absolute;bottom:2px;left:50%;width:5px;height:5px;border-radius:50%;margin-left:-2.5px}
.dsb-hint{display:flex;gap:10px;align-items:center;background:#f3f7ff;border-radius:8px;padding:10px 12px;color:var(--mut);font-size:11px;margin-top:6px}
@media(max-width:1440px){.dsb-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.dsb-kpi.proj{grid-column:span 2}}
@media(max-width:1200px){.dsb-cols{grid-template-columns:minmax(0,1fr)}}
@media(max-width:860px){.dsb-2{grid-template-columns:minmax(0,1fr)}.dsb-port{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.dsb-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dsb-kpi{padding:12px;min-height:0}.dsb-kpi .v{font-size:24px}.dsb-kpi svg.sp{display:none}.dsb-hello h1{font-size:20px}.dsb-hello p{margin-left:0}}
${REPLY_CSS}
`

// ---------------------------------------------------------------- types / helpers
interface OrgRow { name: string; total: number; open: number; completed: number; overdue: number; projects: number }
interface Trends { dates: string[]; series: Record<string, number[]>; chart: { date: string; completed: number; in_progress: number }[] }
const MON =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = (s?: string | null) => { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}` }
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const isoOf = (d: Date) => iso(d.getFullYear(), d.getMonth(), d.getDate())
const REFRESH_MS = 60000 // "Live": reload data every minute while the tab is visible
const DONE = ['completed', 'closed'], DOING = ['in_progress', 'in_review']
const dueOf = (t: Task) => t.approved_due_date || t.baseline_due_date || ''
const PR: Record<string, [string, string]> = { critical: ['#fdeaea', '#c62828'], high: ['#fdeaea', '#e23b3b'], medium: ['#fff4de', '#e59a0c'], low: ['#e6f8ee', '#12a150'] }
const stTone = (s: string): [string, string] => DONE.includes(s) ? ['#e6f8ee', '#12a150'] : s === 'blocked' ? ['#fdeaea', '#e23b3b'] : ['#eaf2ff', '#1d6bff']
const HEALTH_HEX: Record<string, string> = { green: '#12a150', amber: '#f59e0b', red: '#ef4444', black: '#1a1a1a' }
// key = field on TaskKpi and series in /trends; bad = a rise is bad news
type KpiKey = 'total' | 'open' | 'due_today' | 'overdue' | 'critical' | 'blocked'
const OPEN = ['backlog', 'ready', 'in_progress', 'in_review', 'blocked', 'on_hold']
// Which of my tasks a KPI card counts - the same rules as /dashboards/individual on the server.
const KPI_MATCH: Record<KpiKey, (t: Task, today: string) => boolean> = {
  total: () => true,
  open: (t) => OPEN.includes(t.status),
  due_today: (t, today) => t.approved_due_date === today,
  overdue: (t, today) => OPEN.includes(t.status) && !!t.approved_due_date && t.approved_due_date < today,
  critical: (t) => t.priority === 'critical' && OPEN.includes(t.status),
  blocked: (t) => t.blocker && OPEN.includes(t.status),
}
const KPIS: { l: string; k: KpiKey; c: string; bg: string; bd: string; ic: string; bad?: boolean }[] = [
  { l: 'TOTAL TASKS', k: 'total', c: '#1d6bff', bg: '#eef4ff', bd: '#cfe0ff', ic: 'check' },
  { l: 'OPEN', k: 'open', c: '#12a150', bg: '#eefaf3', bd: '#c9ecd8', ic: 'box' },
  { l: 'DUE TODAY', k: 'due_today', c: '#7c4dff', bg: '#f5f1ff', bd: '#ddd2fb', ic: 'cal' },
  { l: 'OVERDUE', k: 'overdue', c: '#f59e0b', bg: '#fff5ee', bd: '#fbdcc8', ic: 'warn', bad: true },
  { l: 'CRITICAL', k: 'critical', c: '#ef4444', bg: '#fff1f1', bd: '#fbd2d2', ic: 'alert', bad: true },
  { l: 'BLOCKED', k: 'blocked', c: '#5b6b82', bg: '#f4f6f9', bd: '#dfe4ec', ic: 'ban', bad: true },
]

// My Tasks table: click a column heading to sort
type TaskSort = 'code' | 'title' | 'project' | 'responsible' | 'priority' | 'status' | 'progress' | 'due'
const TASK_COLS: [TaskSort, string][] = [['code', 'CODE'], ['title', 'TASK'], ['project', 'PROJECT'], ['responsible', 'RESPONSIBLE'],
  ['priority', 'PRIORITY'], ['status', 'STATUS'], ['progress', 'PROGRESS'], ['due', 'DUE']]
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// ---------------------------------------------------------------- icons
const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', check: 'M9 12l2 2 4-4M4 4h16v16H4z', kanban: 'M4 4h16v16H4zM9 8v8M15 8v5',
  folder: 'M3 6h6l2 2h10v11H3z', list: 'M4 7h16M4 12h10M4 17h16', gavel: 'M14 4l6 6-3 3-6-6zM11 9L4 16l4 4 7-7', grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM9 12l2 2 4-4', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  bell: 'M6 9a6 6 0 0112 0c0 6 3 8 3 8H3s3-2 3-8M10 21h4', sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  chat: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5', chev: 'M6 9l6 6 6-6', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', warn: 'M12 4l9 16H3zM12 10v4M12 17v.5', ban: 'M12 3a9 9 0 100 18 9 9 0 000-18zM6 6l12 12',
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

function Spark({ pts: raw, c, id }: { pts: number[]; c: string; id: string }) {
  // Needs at least 2 numeric points; 0 or 1 would divide by zero and draw NaN.
  const clean = (Array.isArray(raw) ? raw : []).map((v) => (Number.isFinite(v) ? v : 0))
  const pts = clean.length >= 2 ? clean : [clean[0] ?? 0, clean[0] ?? 0]
  const W = 100, H = 40, mx = Math.max(...pts), mn = Math.min(...pts)
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 4 - ((v - mn) / (mx - mn || 1)) * (H - 10)] as [number, number])
  const d = smooth(xy)
  return (
    <svg className="sp" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".25" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${W},${H} L0,${H}Z`} fill={`url(#${id})`} /><path d={d} fill="none" stroke={c} strokeWidth="1.6" />
    </svg>
  )
}

function Ring({ size, sw, segs: allSegs, children }: { size: number; sw: number; segs: { f: number; c: string }[]; children: ReactNode }) {
  // Skip empty segments: with rounded line caps a 0-length segment still draws a coloured dot.
  const segs = allSegs.filter((s) => Number.isFinite(s.f) && s.f > 0)
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
  const X = (i: number) => L + 16 + (i * (W - L - 40)) / (n - 1), Y = (v: number) => B - (v / mx) * (B - T)
  const g = data.map((d, i) => [X(i), Y(d.completed)] as [number, number])
  const b = data.map((d, i) => [X(i), Y(d.in_progress)] as [number, number])
  const hi = data.reduce((m, d, i) => (d.completed > data[m].completed ? i : m), 0)
  const [hov, setHov] = useState<number | null>(null) // day under the mouse (or tapped)
  if (data.length < 2) return <div style={{ color: 'var(--mut)', padding: 30, textAlign: 'center' }}>No activity yet</div>
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setHov(null)}>
      <defs>
        <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#12a150" stopOpacity=".18" /><stop offset="1" stopColor="#12a150" stopOpacity="0" /></linearGradient>
        <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d6bff" stopOpacity=".15" /><stop offset="1" stopColor="#1d6bff" stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((q) => { const v = (mx / 4) * q; return <g key={q}><line x1={L} x2={W} y1={Y(v)} y2={Y(v)} stroke="#edf1f6" strokeDasharray="3 3" /><text x={L - 8} y={Y(v) + 3} fontSize="9" fill="#6b7a90" textAnchor="end">{v}</text></g> })}
      <path d={`${smooth(g)} L${X(n - 1)},${B} L${X(0)},${B}Z`} fill="url(#gg)" /><path d={`${smooth(b)} L${X(n - 1)},${B} L${X(0)},${B}Z`} fill="url(#gb)" />
      <path d={smooth(g)} fill="none" stroke="#12a150" strokeWidth="1.8" /><path d={smooth(b)} fill="none" stroke="#1d6bff" strokeWidth="1.6" />
      {hov !== null && <line x1={X(hov)} x2={X(hov)} y1={T} y2={B} stroke="#9fb0c8" strokeDasharray="3 3" />}
      {g.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={hov === i ? 4.5 : 3} fill={hov === i ? '#12a150' : '#fff'} stroke="#12a150" strokeWidth="1.5" />)}
      {b.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={hov === i ? 4.5 : 3} fill={hov === i ? '#1d6bff' : '#fff'} stroke="#1d6bff" strokeWidth="1.5" />)}
      {hov === null && data[hi].completed > 0 && <g transform={`translate(${Math.min(Math.max(X(hi) - 33, L), W - 66)},${Math.max(Y(data[hi].completed) - 46, 0)})`}><rect width="66" height="34" rx="5" fill="#0b1f3a" /><text x="33" y="14" textAnchor="middle" fontSize="10" fill="#fff">{data[hi].completed} task{data[hi].completed > 1 ? 's' : ''}</text><text x="33" y="27" textAnchor="middle" fontSize="10" fill="#fff">Completed</text></g>}
      {data.map((d, i) => <text key={d.date} x={X(i)} y={B + 16} fontSize="9" fill={hov === i ? '#0b1f3a' : '#6b7a90'} fontWeight={hov === i ? 700 : 400} textAnchor="middle">{fmt(d.date).slice(0, 6)}</text>)}
      {hov !== null && (() => {
        const d = data[hov], w = 104, h = 50
        const x = Math.min(Math.max(X(hov) - w / 2, 0), W - w)
        const y = Math.max(Math.min(Y(d.completed), Y(d.in_progress)) - h - 10, 0)
        return (
          <g transform={`translate(${x},${y})`} pointerEvents="none">
            <rect width={w} height={h} rx="6" fill="#0b1f3a" />
            <text x="10" y="15" fontSize="10" fontWeight="700" fill="#fff">{fmt(d.date)}</text>
            <circle cx="13" cy="27" r="3.5" fill="#12a150" /><text x="21" y="30" fontSize="10" fill="#fff">Completed: {d.completed}</text>
            <circle cx="13" cy="40" r="3.5" fill="#1d6bff" /><text x="21" y="43" fontSize="10" fill="#fff">In Progress: {d.in_progress}</text>
          </g>
        )
      })()}
      {/* invisible hover / tap columns, one per day */}
      {data.map((d, i) => {
        const half = (W - L - 40) / (n - 1) / 2
        return <rect key={`h${d.date}`} x={X(i) - half} y={0} width={half * 2} height={H} fill="transparent" style={{ cursor: 'pointer' }}
          onMouseEnter={() => setHov(i)} onClick={() => setHov((v) => (v === i ? null : i))} />
      })}
    </svg>
  )
}

// ---------------------------------------------------------------- calendar
function Calendar({ onPick, picked, dots, today }: { onPick: (d: string | null) => void; picked: string | null; dots: Record<string, string>; today: Date }) {
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1).getDay(), out = []
    for (let i = 0; i < 42; i++) out.push(new Date(ym.y, ym.m, 1 - first + i))
    return out
  }, [ym])
  const go = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  return (
    <div className="dsb-card" style={{ padding: 16 }}>
      <h3><Ic n="cal" />Calendar</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <button className="dsb-btn" onClick={() => go(-1)} style={{ padding: '6px 9px' }}><Ic n="l" s={13} /></button>
        <select className="dsb-btn" style={{ flex: 1, textAlign: 'left' }} value={ym.m} onChange={(e) => setYm({ ...ym, m: +e.target.value })}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m} {ym.y}</option>)}
        </select>
        <button className="dsb-btn" onClick={() => go(1)} style={{ padding: '6px 9px' }}><Ic n="r" s={13} /></button>
        <button className="dsb-btn" onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })}>Today</button>
      </div>
      <div className="cal">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="w">{d}</div>)}
        {cells.map((d) => {
          const k = iso(d.getFullYear(), d.getMonth(), d.getDate()), out = d.getMonth() !== ym.m
          const isT = d.toDateString() === today.toDateString()
          return <button key={k} className={`${out ? 'o' : ''} ${isT ? 't' : ''} ${picked === k ? 'p' : ''}`} onClick={() => onPick(picked === k ? null : k)}>{d.getDate()}{dots[k] && !isT && <u style={{ background: dots[k] }} />}</button>
        })}
      </div>
      <div className="dsb-hint"><Ic n="cal" s={20} c="#1d6bff" /><span>Dots = tasks of yours due that day (red = overdue).<br />Click a day to filter My Tasks.</span></div>
    </div>
  )
}


// ---------------------------------------------------------------- Team & Portfolio Breakdown
type OrgTab = 'bySbu' | 'byFunction' | 'byDepartment'
type SortKey = 'name' | 'projects' | 'total' | 'open' | 'completed' | 'overdue' | 'pct'
const BK_TABS: [OrgTab, string, string][] = [['bySbu', 'By SBU', 'SBU'], ['byFunction', 'By Function', 'FUNCTION'], ['byDepartment', 'By Department', 'DEPARTMENT']]
const BK_COLS: [SortKey, string][] = [['projects', 'PROJECTS'], ['total', 'TASKS'], ['open', 'OPEN'], ['completed', 'COMPLETED'], ['overdue', 'OVERDUE'], ['pct', 'COMPLETION']]
const BK_SORT_NAME: Record<SortKey, string> = { name: 'name', projects: 'projects', total: 'tasks', open: 'open tasks', completed: 'completed tasks', overdue: 'overdue tasks', pct: 'completion' }
const pctOf = (r: OrgRow) => (r.total ? Math.round((r.completed / r.total) * 100) : 0)

type OrgLists = { companies: Company[]; functions: Function[]; departments: Department[]; tasks: Task[] }

// which projects a Breakdown row counts: grouped the same way as the server (name, case ignored;
// "Unassigned" = no SBU / function / department) and SBU copies merged like mergeSbuRows.
// Projects have no department: a department's projects are those with at least one of its tasks.
function projectsOf(tab: OrgTab, rowName: string, projects: Project[], org: OrgLists): Project[] {
  const key = (n: string) => (tab === 'bySbu' ? sbuKey(n) : n.trim().toLowerCase())
  const matches = (list: { id: number; name: string }[], id?: number | null) => {
    const name = list.find((x) => x.id === id)?.name?.trim()
    return rowName === 'Unassigned' ? !name : !!name && key(name) === key(rowName)
  }
  let keep: (p: Project) => boolean
  if (tab === 'bySbu') keep = (p) => matches(org.companies, p.company_id)
  else if (tab === 'byFunction') keep = (p) => matches(org.functions, p.function_id)
  else {
    const ids = new Set(org.tasks.filter((t) => t.project_id && matches(org.departments, t.department_id)).map((t) => t.project_id))
    keep = (p) => ids.has(p.id)
  }
  return projects.filter(keep).sort((a, b) => a.name.localeCompare(b.name))
}

function Breakdown({ data }: { data: Record<OrgTab, OrgRow[]> | null }) {
  const [tab, setTab] = useState<OrgTab>('bySbu')
  const [openRow, setOpenRow] = useState<string | null>(null) // row whose projects are listed
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [org, setOrg] = useState<OrgLists>({ companies: [], functions: [], departments: [], tasks: [] })
  const [people, setPeople] = useState<User[]>([])
  const [drillErr, setDrillErr] = useState('')

  // project list for the drill-down, loaded the first time a row is opened
  useEffect(() => {
    if (!openRow || projects) return
    Promise.all([
      api.get<Project[]>('/projects'),
      api.get<Company[]>('/organizations/companies'),
      api.get<Function[]>('/organizations/functions'),
      api.get<Department[]>('/organizations/departments'),
      api.get<Task[]>('/tasks'),
    ]).then(([p, companies, functions, departments, tasks]) => { setOrg({ companies, functions, departments, tasks }); setProjects(p); setDrillErr('') })
      .catch((e: any) => setDrillErr(e?.message || 'Could not load the projects.'))
    api.get<User[]>('/organizations/users').then(setPeople).catch(() => {})
  }, [openRow, projects])
  useEffect(() => { setOpenRow(null) }, [tab])
  // default: most projects first, then most tasks
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'projects', desc: true })
  const [full, setFull] = useState(false)

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden' // the page behind must not scroll
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [full])

  const rows = useMemo(() => {
    const val = (r: OrgRow, k: Exclude<SortKey, 'name'>) => (k === 'pct' ? pctOf(r) : r[k])
    return [...(data?.[tab] ?? [])].sort((a, b) => {
      // "Unassigned" always last; then the chosen column, then projects, tasks and name
      const ua = a.name === 'Unassigned', ub = b.name === 'Unassigned'
      if (ua !== ub) return ua ? 1 : -1
      const dir = sort.desc ? -1 : 1
      if (sort.key === 'name') return dir * a.name.localeCompare(b.name)
      return dir * (val(a, sort.key) - val(b, sort.key)) || b.projects - a.projects || b.total - a.total || a.name.localeCompare(b.name)
    })
  }, [data, tab, sort])

  const sum = rows.reduce((s, r) => ({ projects: s.projects + r.projects, total: s.total + r.total, open: s.open + r.open, completed: s.completed + r.completed, overdue: s.overdue + r.overdue }),
    { projects: 0, total: 0, open: 0, completed: 0, overdue: 0 })
  const sumPct = sum.total ? Math.round((sum.completed / sum.total) * 100) : 0
  const maxTasks = Math.max(1, ...rows.map((r) => r.total))
  const clickSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }))
  const arrow = (key: SortKey) => (sort.key === key ? (sort.desc ? ' ▼' : ' ▲') : '')
  const nameHead = BK_TABS.find(([k]) => k === tab)![2]

  const card = (
    <div className={`dsb-card dsb-bk${full ? ' full' : ''}`}>
      <div className="dsb-head" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}><Ic n="users" s={17} />Team &amp; Portfolio Breakdown</h3>
        <button className="dsb-btn" onClick={() => setFull((f) => !f)}>{full ? '✕ Close full screen' : '⛶ Full screen'}</button>
      </div>
      <div className="dsb-head" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
        <div className="dsb-tabs" style={{ marginBottom: 0 }}>{BK_TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <span style={{ fontSize: 12, color: 'var(--mut)' }}>
          Sorted by {BK_SORT_NAME[sort.key]}{{ name: '', projects: ', then tasks', total: ', then projects' }[sort.key as string] ?? ', then projects and tasks'} · click a column heading to sort
        </span>
      </div>
      {data === null ? <div style={{ color: 'var(--mut)', padding: 10 }}>Loading…</div> : !rows.length ? <div style={{ color: 'var(--mut)', padding: 10 }}>No data yet.</div> : (
        <div className="dsb-scroll bk-body"><table className="dsb-t dsb-mini">
          <thead><tr>
            <th className="bk-s" onClick={() => clickSort('name')}>{nameHead}{arrow('name')}</th>
            {BK_COLS.map(([k, l]) => <th key={k} className="bk-s num" onClick={() => clickSort(k)}>{l}{arrow(k)}</th>)}
          </tr></thead>
          <tbody>{rows.map((r) => {
            const p = pctOf(r)
            return (
              <Fragment key={r.name}>
              <tr className={openRow === r.name ? 'bk-open' : undefined} style={{ opacity: !r.total && !r.projects ? 0.5 : 1 }}>
                <td>
                  <button className="bk-name" onClick={() => setOpenRow(openRow === r.name ? null : r.name)} aria-expanded={openRow === r.name}
                    title={openRow === r.name ? 'Hide projects' : `Show the projects of ${r.name}`}>
                    <i>{openRow === r.name ? '▾' : '▸'}</i><span>{r.name}</span>
                  </button>
                </td>
                <td className="num"><b>{r.projects}</b></td>
                <td className="num"><span className="bk-bar"><span style={{ width: `${(r.total / maxTasks) * 100}%` }} /></span><b>{r.total}</b></td>
                <td className="num">{r.open}</td>
                <td className="num">{r.completed}</td>
                <td className="num" style={{ color: r.overdue ? '#ef4444' : undefined, fontWeight: r.overdue ? 700 : undefined }}>{r.overdue}</td>
                <td className="num"><span className="pb" style={{ width: 70, marginRight: 8 }}><span style={{ width: `${p}%`, background: p >= 50 ? '#12a150' : '#1d6bff' }} /></span>{r.total ? `${p}%` : '—'}</td>
              </tr>
              {openRow === r.name && (
                <tr className="bk-drill"><td colSpan={7}>
                  {drillErr ? <div style={{ color: '#b42318', padding: '8px 0' }}>{drillErr}</div>
                    : !projects ? <div style={{ color: 'var(--mut)', padding: '8px 0' }}>Loading projects…</div>
                    : (() => {
                      const list = projectsOf(tab, r.name, projects, org)
                      if (!list.length) return <div style={{ color: 'var(--mut)', padding: '8px 0' }}>No projects under {r.name}.</div>
                      return (
                        <div className="dsb-scroll">
                          <table className="bk-proj">
                            <thead><tr><th>CODE</th><th>PROJECT</th><th>STATUS</th><th>HEALTH</th><th>COMPLETION</th><th>DUE</th><th>PROJECT MANAGER</th></tr></thead>
                            <tbody>{list.map((pr) => (
                              <tr key={pr.id}>
                                <td style={{ color: 'var(--mut)' }}>{pr.code}</td>
                                <td className="t"><Link to={`/projects/${pr.id}`}>{pr.name}</Link></td>
                                <td><span className={`badge ${STATUS_COLORS[pr.status] ?? 'gray'}`}>{label(pr.status)}</span></td>
                                <td><span className={`health-dot ${HEALTH_COLORS[pr.health] ?? 'gray'}`} /> {label(pr.health)}</td>
                                <td><span className="pb" style={{ width: 60, marginRight: 8 }}><span style={{ width: `${pr.completion_pct ?? 0}%`, background: (pr.completion_pct ?? 0) >= 50 ? '#12a150' : '#1d6bff' }} /></span>{pr.completion_pct ?? 0}%</td>
                                <td>{fmtDate(pr.approved_due_date || pr.baseline_due_date)}</td>
                                <td>{people.find((u) => u.id === pr.manager_id)?.name ?? '—'}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )
                    })()}
                </td></tr>
              )}
              </Fragment>
            )
          })}</tbody>
          <tfoot><tr>
            <td>Total</td><td className="num">{sum.projects}</td><td className="num">{sum.total}</td><td className="num">{sum.open}</td>
            <td className="num">{sum.completed}</td><td className="num" style={{ color: sum.overdue ? '#ef4444' : undefined }}>{sum.overdue}</td><td className="num">{sum.total ? `${sumPct}%` : '—'}</td>
          </tr></tfoot>
        </table></div>
      )}
    </div>
  )
  if (!full) return <div style={{ marginTop: 16 }}>{card}</div>
  return (
    <>
      <div className="dsb-card" style={{ marginTop: 16, color: 'var(--mut)' }}>Team &amp; Portfolio Breakdown is open in full screen.</div>
      <div className="bk-overlay" onClick={() => setFull(false)}><div onClick={(e) => e.stopPropagation()}>{card}</div></div>
    </>
  )
}

// ---------------------------------------------------------------- comments inbox
// Comment threads on projects you manage and tasks you are Responsible for (received),
// plus the ones you wrote or replied to (sent). Each card shows its replies and a Reply box.
// Shown to Project Managers / Responsible people, or whenever there are threads.
function CommentInbox({ tick }: { tick: number }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData] = useState<{ eligible: boolean; comments: Comment[] } | null>(null)
  const [filter, setFilter] = useState<'all' | 'project' | 'task'>('all')

  useEffect(() => {
    let cancelled = false
    // optional widget: an older backend without /comments just hides it
    api.get<{ eligible: boolean; comments: Comment[] }>('/comments/inbox')
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tick])

  if (!data || (!data.eligible && !data.comments.length)) return null
  const list = filter === 'all' ? data.comments : data.comments.filter((c) => c.entity_type === filter)
  const open = (c: Comment) => {
    if (c.entity_type === 'task' && c.task_id) navigate(`/tasks/${c.task_id}`)
    else if (c.project_id) navigate(`/projects/${c.project_id}`)
  }
  const onReplied = (reply: Comment) => setData((d) => (d ? { ...d, comments: addReply(d.comments, reply) } : d))
  const ref = (code?: string | null, name?: string | null) => (code || name ? <><b>{code}</b>{code && name ? ' · ' : ''}{name}</> : '—')

  return (
    <div className="dsb-card">
      <h3 style={{ marginBottom: 8 }}><Ic n="chat" s={17} />Comments<span style={{ fontWeight: 400, color: 'var(--mut)' }}>({data.comments.length})</span></h3>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['all', 'project', 'task'] as const).map((f) => (
          <button key={f} className="dsb-btn" onClick={() => setFilter(f)}
            style={{ flex: 1, padding: '5px 6px', ...(filter === f ? { background: 'var(--navy)', color: '#fff', borderColor: 'var(--navy)' } : {}) }}>
            {f === 'all' ? 'All' : f === 'project' ? 'Projects' : 'Tasks'}
          </button>
        ))}
      </div>
      <div className="dsb-cmts">
        {list.map((c) => {
          const sent = !!user && c.commenter_id === user.id
          return (
            <div key={c.id} className="dsb-cmt">
              <button className="dsb-cmt-open" onClick={() => open(c)} title="Open">
                <div className="top">
                  <span>
                    <span className="pill" style={c.entity_type === 'task' ? { background: '#e8f0ff', color: '#1d6bff' } : { background: '#fdf3d7', color: '#8a6d1f' }}>{label(c.entity_type)}</span>
                    <span className="role" style={sent ? { background: '#eef2f7', color: '#475569' } : { background: '#e7f6ee', color: '#12a150' }}>{sent ? 'Sent' : 'Received'}</span>
                  </span>
                  <span className="when">{fmtDateTime(c.created_at)}</span>
                </div>
                <div className="ref">Project: {ref(c.project_code, c.project_name)}</div>
                {c.entity_type === 'task' && <div className="ref">Task: {ref(c.task_code, c.task_name)}</div>}
                <div className="txt">{c.comment.length > 240 ? `${c.comment.slice(0, 240)}…` : c.comment}</div>
                <div className="by">— {commenterLabel(c)}{sent && c.recipient_name ? ` → ${c.recipient_name}` : ''}</div>
              </button>
              <CommentReplies comment={c} onReplied={onReplied} />
            </div>
          )
        })}
      </div>
      {!list.length && <div style={{ textAlign: 'center', color: 'var(--mut)', padding: 20 }}>No {filter === 'project' ? 'project ' : filter === 'task' ? 'task ' : ''}comments yet.</div>}
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
  // names for the My Tasks table (project, its manager, the task's Responsible person)
  const [projects, setProjects] = useState<Project[]>([])
  const [people, setPeople] = useState<User[]>([])
  const [sort, setSort] = useState<{ key: TaskSort; desc: boolean }>({ key: 'project', desc: false })
  const [projectFilter, setProjectFilter] = useState('')       // '' = all, 'none' = no project, else project id
  const [responsibleFilter, setResponsibleFilter] = useState('') // '' = all, else user id
  const [healthDist, setHealthDist] = useState<Record<string, number>>({})
  const [delayCauses, setDelayCauses] = useState<{ category: string; count: number }[]>([])
  const [orgIntel, setOrgIntel] = useState<{ bySbu: OrgRow[]; byFunction: OrgRow[]; byDepartment: OrgRow[] } | null>(null)
  const [editProfile, setEditProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [trends, setTrends] = useState<Trends | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [kpi, setKpi] = useState<KpiKey | null>(null) // KPI card clicked: My Tasks shows only those tasks
  const [view, setView] = useState<'tasks' | 'projects'>('tasks') // what the list under the cards shows
  const myTasksRef = useRef<HTMLDivElement>(null)

  // "Live": bump `tick` every minute (and when the user comes back to the tab)
  // so every widget reloads; `now` keeps "today" correct past midnight.
  const [tick, setTick] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [orgFailed, setOrgFailed] = useState(false)
  const [userFailed, setUserFailed] = useState(false)
  const refresh = () => { setNow(new Date()); setTick((t) => t + 1) }

  useEffect(() => {
    const onTimerOrReturn = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(onTimerOrReturn, REFRESH_MS)
    document.addEventListener('visibilitychange', onTimerOrReturn)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onTimerOrReturn) }
  }, [])

  // org-wide widgets. On a failed refresh the last good data stays on screen.
  useEffect(() => {
    let cancelled = false // ignore replies from an older refresh that arrive late
    const ok = <T,>(set: (v: T) => void) => (v: T) => { if (!cancelled) set(v) }
    const fail = () => { if (!cancelled) setOrgFailed(true) }
    setOrgFailed(false)
    api.get<ProjectKpi>('/dashboards/executive').then(ok(setProjKpi)).catch(fail)
    api.get<Record<string, number>>('/dashboards/health-distribution').then(ok(setHealthDist)).catch(fail)
    api.get<{ category: string; count: number }[]>('/dashboards/delay-causes').then(ok(setDelayCauses)).catch(fail)
    api.get<{ bySbu: OrgRow[]; byFunction: OrgRow[]; byDepartment: OrgRow[] }>('/dashboards/org-intelligence')
      // copies of one SBU (e.g. "A1 Polymar" / "A-One Polymer Ltd") count as one row, named as in the forms
      .then(ok((o: { bySbu: OrgRow[]; byFunction: OrgRow[]; byDepartment: OrgRow[] }) => setOrgIntel({ ...o, bySbu: mergeSbuRows(o.bySbu ?? []) })))
      .catch(() => { if (!cancelled) setOrgIntel((prev) => prev ?? { bySbu: [], byFunction: [], byDepartment: [] }); fail() })
    return () => { cancelled = true }
  }, [tick])

  // per-user widgets
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const ok = <T,>(set: (v: T) => void) => (v: T) => { if (!cancelled) set(v) }
    const fail = () => { if (!cancelled) setUserFailed(true) }
    setUserFailed(false)
    api.get<TaskKpi>(`/dashboards/individual/${userId}`)
      .then((k) => { if (!cancelled) { setTaskKpi(k); setUpdatedAt(new Date()) } })
      .catch(fail)
    // Trends are optional: an older backend without this route just shows flat sparklines.
    api.get<Trends>(`/dashboards/individual/${userId}/trends?days=7`).then(ok(setTrends)).catch(() => {})
    // The KPI cards count tasks where you are Responsible, Accountable, Reviewer OR Informed, plus every
    // task of the projects you lead (Manager / Sponsor / Owner), so the list loads all five -
    // otherwise "Total Tasks: 1" could sit next to an empty list.
    api.get<Project[]>('/projects').then(ok(setProjects)).catch(() => {})
    api.get<User[]>('/organizations/users').then(ok(setPeople)).catch(() => {})
    Promise.all([
      api.get<Task[]>(`/tasks?responsible_id=${userId}`),
      api.get<Task[]>(`/tasks?accountable_id=${userId}`),
      api.get<Task[]>(`/tasks?reviewer_id=${userId}`),
      api.get<Task[]>(`/tasks?informed_id=${userId}`),
      api.get<Task[]>(`/tasks?led_by_id=${userId}`),
    ])
      .then((lists) => {
        const byId = new Map<number, Task>()
        lists.forEach((l) => (l ?? []).forEach((t) => byId.set(t.id, t)))
        const list = [...byId.values()].sort((a, b) => (dueOf(a) || '9999').localeCompare(dueOf(b) || '9999'))
        if (!cancelled) setMyTasks(list)
      })
      .catch(fail)
    return () => { cancelled = true }
  }, [userId, tick])

  const todayIso = isoOf(now)
  const projectOf = (t: Task) => projects.find((p) => p.id === t.project_id)
  const personName = (id?: number | null) => people.find((u) => u.id === id)?.name ?? ''
  const rows = useMemo(() => {
    const projName = (t: Task) => projects.find((p) => p.id === t.project_id)?.name ?? ''
    const respName = (t: Task) => people.find((u) => u.id === t.responsible_id)?.name ?? ''
    const text = (a: string, b: string) => (!a !== !b ? (a ? -1 : 1) : a.localeCompare(b)) // blanks last
    const due = (t: Task) => dueOf(t) || '9999'
    const by: Record<TaskSort, (a: Task, b: Task) => number> = {
      code: (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }),
      title: (a, b) => a.title.localeCompare(b.title),
      project: (a, b) => text(projName(a), projName(b)),
      responsible: (a, b) => text(respName(a), respName(b)),
      priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
      status: (a, b) => a.status.localeCompare(b.status),
      progress: (a, b) => a.progress_pct - b.progress_pct,
      due: (a, b) => due(a).localeCompare(due(b)),
    }
    const dir = sort.desc ? -1 : 1
    return myTasks
      .filter((t) => (!picked || dueOf(t) === picked) && (!kpi || KPI_MATCH[kpi](t, todayIso))
        && (!projectFilter || (projectFilter === 'none' ? !t.project_id : String(t.project_id) === projectFilter))
        && (!responsibleFilter || String(t.responsible_id) === responsibleFilter))
      // the chosen column, then project, due date and code so the order is always steady
      .sort((a, b) => dir * by[sort.key](a, b) || by.project(a, b) || by.due(a, b) || by.code(a, b))
  }, [myTasks, picked, kpi, todayIso, sort, projectFilter, responsibleFilter, projects, people])
  const clickSort = (key: TaskSort) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }))
  // filter choices: only the projects / people that appear in my tasks
  const myProjects = useMemo(() => projects.filter((p) => myTasks.some((t) => t.project_id === p.id)).sort((a, b) => a.name.localeCompare(b.name)), [projects, myTasks])
  const myResponsibles = useMemo(() => people.filter((u) => myTasks.some((t) => t.responsible_id === u.id)).sort((a, b) => a.name.localeCompare(b.name)), [people, myTasks])
  const hasStandalone = myTasks.some((t) => !t.project_id)
  const kpiLabel = kpi ? label(KPIS.find((k) => k.k === kpi)!.l.toLowerCase()) : ''
  // click a KPI card: list those tasks in My Tasks (click it again to show all)
  const pickKpi = (k: KpiKey) => {
    setKpi((cur) => (view === 'tasks' && cur === k ? null : k))
    setView('tasks')
    myTasksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ---- Projects card: the projects I lead (Manager / Sponsor / Owner) or have a task in
  const projectRows = useMemo(() => {
    const rank: Record<string, number> = { black: 0, red: 1, amber: 2, green: 3 }
    return projects
      .filter((p) => [p.manager_id, p.sponsor_id, p.owner_id].includes(userId) || myTasks.some((t) => t.project_id === p.id))
      .map((p) => {
        const mine = myTasks.filter((t) => t.project_id === p.id)
        return {
          p,
          due: p.approved_due_date || p.baseline_due_date || '',
          tasks: mine.length,
          open: mine.filter((t) => OPEN.includes(t.status)).length,
          overdue: mine.filter((t) => KPI_MATCH.overdue(t, todayIso)).length,
          closed: ['completed', 'closed', 'cancelled'].includes(p.status),
        }
      })
      // the ones needing attention first: worst health, then the nearest due date
      .sort((a, b) => Number(a.closed) - Number(b.closed) || (rank[a.p.health] ?? 9) - (rank[b.p.health] ?? 9)
        || (a.due || '9999').localeCompare(b.due || '9999') || a.p.name.localeCompare(b.p.name))
  }, [projects, myTasks, userId, todayIso])
  const projHealth = (['green', 'amber', 'red', 'black'] as const).map((h) => ({ h, n: projectRows.filter((r) => r.p.health === h).length })).filter((x) => x.n > 0)
  const projActive = projectRows.filter((r) => !r.closed).length
  const showProjects = () => {
    setView((v) => (v === 'projects' ? 'tasks' : 'projects'))
    myTasksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // from a project row: back to the task list, showing only that project's tasks
  const showProjectTasks = (id: number) => { setKpi(null); setPicked(null); setResponsibleFilter(''); setProjectFilter(String(id)); setView('tasks') }
  const viewToggle = (
    <span className="dsb-seg" role="tablist" aria-label="List">
      <button type="button" role="tab" aria-selected={view === 'tasks'} className={view === 'tasks' ? 'on' : ''} onClick={() => setView('tasks')}><Ic n="check" s={13} />Tasks</button>
      <button type="button" role="tab" aria-selected={view === 'projects'} className={view === 'projects' ? 'on' : ''} onClick={() => setView('projects')}><Ic n="folder" s={13} />Projects</button>
    </span>
  )
  const dots = useMemo(() => {
    const m: Record<string, string> = {}
    myTasks.forEach((t) => { const d = dueOf(t); if (d) m[d] = !DONE.includes(t.status) && d < todayIso ? '#ef4444' : m[d] ?? '#f59e0b' })
    return m
  }, [myTasks, todayIso])

  // Task Completion Overview — derived from the user's own tasks
  const cnt = useMemo(() => {
    const c = { done: 0, doing: 0, blocked: 0, todo: 0 }
    myTasks.forEach((t) => { if (DONE.includes(t.status)) c.done++; else if (t.blocker || t.status === 'blocked') c.blocked++; else if (DOING.includes(t.status)) c.doing++; else c.todo++ })
    return c
  }, [myTasks])
  const nT = myTasks.length || 1
  const donePct = Math.round((cnt.done / nT) * 1000) / 10

  const delta = (k: string, bad?: boolean) => {
    const s = trends?.series?.[k]
    if (!s) return { t: '→ 0%', c: '#6b7a90' }
    const a = s[0], b = s[s.length - 1], p = a ? Math.round(((b - a) / a) * 100) : b ? 100 : 0
    return { t: `${p > 0 ? '↑' : p < 0 ? '↓' : '→'} ${Math.abs(p)}%`, c: p === 0 ? '#6b7a90' : (p > 0) !== !!bad ? '#12a150' : '#ef4444' }
  }

  const hTotal = Object.values(healthDist).reduce((s, v) => s + v, 0)
  const hEntries = (['green', 'amber', 'red', 'black'] as const).filter((h) => healthDist[h] > 0)
  const maxDelay = Math.max(1, ...delayCauses.map((d) => d.count))
  const first = (user?.name ?? '').split(' ')[0]
  const initials = (user?.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

  return (
    <div className="dsb-root">
      <style>{CSS}</style>
      <div className="dsb-body">
        <div className="dsb-hello">
          <div className="dsb-me">
            <button className="dsb-me-pic" onClick={() => { setProfileMsg(''); setEditProfile(true) }} title="Edit my profile" aria-label="Edit my profile">
              {initials}<b aria-hidden>✎</b>
            </button>
            <div style={{ minWidth: 0 }}>
              <h1><Ic n="hand" s={34} c="#f5b31b" w={1.6} />Welcome back, {first}!</h1>
              <p>{[user?.designation, user?.role && label(user.role)].filter(Boolean).join(' · ') || "Here's what's happening with your tasks and projects today."}</p>
              <button className="dsb-me-edit" onClick={() => { setProfileMsg(''); setEditProfile(true) }}>✎ Edit my profile</button>
            </div>
          </div>
          <div className="dsb-date"><Ic n="cal" s={18} c="#1d6bff" />{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}<span className="dsb-live" title={`Refreshes every minute${updatedAt ? ` · last updated ${updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`}><i />Live</span></div>
        </div>

        {profileMsg && <div className="dsb-okmsg" role="status">{profileMsg}</div>}
        {editProfile && <ProfileForm onClose={() => setEditProfile(false)} onSaved={(m) => { setEditProfile(false); setProfileMsg(m) }} />}

        {(orgFailed || userFailed) && (
          <div className="dsb-err" role="alert">
            <span>Some dashboard data couldn't be loaded. What you see may be out of date.</span>
            <button className="dsb-btn" onClick={refresh}>Retry</button>
          </div>
        )}

        <div className="dsb-kpis">
          <button type="button" className={`dsb-kpi proj${view === 'projects' ? ' on' : ''}`} aria-pressed={view === 'projects'} onClick={showProjects}
            title={view === 'projects' ? 'Back to my tasks' : 'Show my projects in the list below'}
            style={{ background: 'linear-gradient(160deg,#e9f8f6,#fff)', borderColor: '#bfe7e1' }}>
            <span className="h"><span className="ib" style={{ background: '#0e9f92' }}><Ic n="folder" s={17} c="#fff" /></span>PROJECTS</span>
            <span className="v">{projectRows.length}</span>
            <span className="f">
              <span className="d"><span style={{ color: '#0e9f92' }}>{projActive} active</span><s>{projectRows.length - projActive} finished</s></span>
              <span className="hb" title={projHealth.map((x) => `${label(x.h)}: ${x.n}`).join(' · ') || 'No projects'}>
                {projHealth.map((x) => <i key={x.h} style={{ width: `${(x.n / projectRows.length) * 100}%`, background: HEALTH_HEX[x.h] }} />)}
              </span>
            </span>
          </button>
          {KPIS.map((k, i) => {
            const d = delta(k.k, k.bad)
            const pts = trends?.series?.[k.k] ?? [0, 0]
            return (
              <button key={k.l} type="button" className={`dsb-kpi${view === 'tasks' && kpi === k.k ? ' on' : ''}`} aria-pressed={view === 'tasks' && kpi === k.k} onClick={() => pickKpi(k.k)}
                title={view === 'tasks' && kpi === k.k ? 'Show all my tasks' : 'Show these tasks in My Tasks'}
                style={{ background: `linear-gradient(160deg,${k.bg},#fff)`, borderColor: k.bd }}>
                <span className="h"><span className="ib" style={{ background: k.c }}><Ic n={k.ic} s={17} c="#fff" /></span>{k.l}</span>
                <span className="v">{taskKpi ? taskKpi[k.k] : '—'}</span>
                <span className="f">
                  <span className="d"><span style={{ color: d.c }}>{d.t}</span><s>vs. last week</s></span>
                  <Spark pts={pts} c={k.c} id={`sp${i}`} />
                </span>
              </button>
            )
          })}
        </div>

        <div className="dsb-cols">
          <div className="dsb-stack">
            <div className="dsb-2">
              <div className="dsb-card">
                <h3>Task Completion Overview</h3>
                <div className="dsb-row">
                  <Ring size={152} sw={16} segs={[{ f: cnt.done / nT, c: '#12a150' }, { f: cnt.doing / nT, c: '#1d6bff' }, { f: cnt.todo / nT, c: '#6b7a90' }, { f: cnt.blocked / nT, c: '#ef4444' }]}>
                    <div><div style={{ fontSize: 26, fontWeight: 700, color: 'var(--navy)' }}>{donePct}%</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>Completed</div></div>
                  </Ring>
                  <div className="dsb-leg">
                    {[['Completed', cnt.done, '#12a150'], ['In Progress', cnt.doing, '#1d6bff'], ['Not Started', cnt.todo, '#6b7a90'], ['Blocked', cnt.blocked, '#ef4444']].map(([l, v, c]) => <div key={l as string}><i style={{ background: c as string }} />{l}<b>{v}</b></div>)}
                  </div>
                </div>
              </div>
              <div className="dsb-card"><h3><Ic n="bars" s={17} />Task Progress</h3><Progress data={trends?.chart ?? []} /></div>
            </div>

            <div ref={myTasksRef} style={{ scrollMarginTop: 12, minWidth: 0 }}>
            {view === 'projects' ? (
              <div className="dsb-card">
                <div className="dsb-head">
                  <h3 style={{ margin: 0, flexWrap: 'wrap' }}><Ic n="folder" />My Projects<span style={{ fontWeight: 400, color: 'var(--mut)' }}>({projectRows.length})</span></h3>
                  {viewToggle}
                </div>
                <div className="dsb-scroll"><table className="dsb-t dsb-pj">
                  <thead><tr>{['PROJECT', 'PROJECT MANAGER', 'STATUS', 'HEALTH', 'COMPLETION', 'MY TASKS', 'DUE'].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>
                    {projectRows.map(({ p, due, tasks, open, overdue, closed }) => {
                      const s = stTone(p.status), pct = Math.round(p.completion_pct ?? 0), late = !closed && !!due && due < todayIso
                      return (
                        <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} title="Open the project">
                          <td style={{ minWidth: 160, whiteSpace: 'normal' }}><span className="nm">{p.name}</span><span className="sub">{p.code}{p.manager_id === userId && ' · you manage this project'}</span></td>
                          <td style={{ whiteSpace: 'nowrap' }}>{personName(p.manager_id) || '—'}</td>
                          <td><span className="pill" style={{ background: s[0], color: s[1] }}>{label(p.status)}</span></td>
                          <td style={{ whiteSpace: 'nowrap' }}><i className="hd" style={{ background: HEALTH_HEX[p.health] ?? '#9aa6b8' }} />{label(p.health)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}><span className="pb"><span style={{ width: `${pct}%`, background: pct >= 50 ? '#12a150' : '#1d6bff' }} /></span>{pct}%</td>
                          <td>
                            <span className="cnt">
                              {tasks > 0
                                ? <button type="button" className="lnk" title={`${open} open of ${tasks} - show these tasks in the list`} onClick={(e) => { e.stopPropagation(); showProjectTasks(p.id) }}>{tasks} task{tasks === 1 ? '' : 's'} ›</button>
                                : <span style={{ color: 'var(--mut)' }}>—</span>}
                              {overdue > 0 && <span className="pill" style={{ background: '#fdeaea', color: '#e23b3b' }}>{overdue} overdue</span>}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', color: closed ? '#9aa6b8' : late ? '#e23b3b' : undefined, fontWeight: late ? 600 : 400 }}>{fmt(due)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table></div>
                {!projectRows.length && <div style={{ textAlign: 'center', color: 'var(--mut)', padding: 20 }}>You are not on any project yet.</div>}
              </div>
            ) : (
            <div className="dsb-card">
              <div className="dsb-head">
                <h3 style={{ margin: 0, flexWrap: 'wrap' }}><Ic n="cal" />My Tasks{kpi && kpi !== 'total' && <span style={{ fontWeight: 400 }}>— {kpiLabel}</span>}{picked && <span style={{ fontWeight: 400 }}>— due {fmt(picked)}</span>}<span style={{ fontWeight: 400, color: 'var(--mut)' }}>({rows.length})</span></h3>
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {viewToggle}
                  <select className="dsb-mine-f" aria-label="Filter by project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                    <option value="">All projects</option>
                    {myProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {hasStandalone && <option value="none">No project</option>}
                  </select>
                  <select className="dsb-mine-f" aria-label="Filter by responsible person" value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)}>
                    <option value="">All responsible</option>
                    {myResponsibles.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  {kpi && <button className="dsb-btn" onClick={() => setKpi(null)}>Show all tasks</button>}
                  {picked && <button className="dsb-btn" onClick={() => setPicked(null)}>Clear date filter</button>}
                </span>
              </div>
              <div className="dsb-scroll"><table className="dsb-t">
                <thead><tr>{TASK_COLS.map(([k, h]) => (
                  <th key={k} className="srt" onClick={() => clickSort(k)} title="Click to sort" aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                    {h}{sort.key === k ? (sort.desc ? ' ▼' : ' ▲') : ''}
                  </th>
                ))}</tr></thead>
                <tbody>
                  {rows.map((t) => {
                    const p = PR[t.priority] ?? PR.medium, s = stTone(t.status), d = dueOf(t), done = DONE.includes(t.status)
                    const proj = projectOf(t), onTask = [t.responsible_id, t.accountable_id, t.reviewer_id, t.informed_id].includes(userId)
                    return (
                      <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
                        <td>{t.code}</td>
                        <td>{t.title}{t.blocker && <span className="pill" style={{ background: '#fdeaea', color: '#e23b3b', marginLeft: 8 }}>Blocked</span>}{t.reviewer_id === userId && t.responsible_id !== userId && t.accountable_id !== userId && <span className="pill" style={{ background: '#f5f1ff', color: '#7c4dff', marginLeft: 8 }}>To review</span>}{t.informed_id === userId && t.responsible_id !== userId && t.accountable_id !== userId && t.reviewer_id !== userId && <span className="pill" style={{ background: '#eef1f5', color: '#5b6577', marginLeft: 8 }}>Informed</span>}{!onTask && <span className="pill" style={{ background: '#fdf3d7', color: '#8a6d1f', marginLeft: 8 }}>My project</span>}</td>
                        <td style={{ minWidth: 140 }}>
                          {proj
                            ? <><Link to={`/projects/${proj.id}`} onClick={(e) => e.stopPropagation()}>{proj.name}</Link><span className="sub">PM: {personName(proj.manager_id) || '—'}</span></>
                            : <span style={{ color: 'var(--mut)' }}>{t.project_id ? '—' : 'No project'}</span>}
                        </td>
                        <td>{personName(t.responsible_id) || '—'}{t.responsible_id === userId && <span className="sub">You</span>}</td>
                        <td><span className="pill" style={{ background: p[0], color: p[1] }}><Ic n="star" s={10} />{label(t.priority)}</span></td>
                        <td><span className="pill" style={{ background: s[0], color: s[1] }}>{done ? '✓' : '›'} {label(t.status)}</span></td>
                        <td><span className="pb"><span style={{ width: `${t.progress_pct}%`, background: done || t.progress_pct >= 50 ? '#12a150' : '#1d6bff' }} /></span>{Math.round(t.progress_pct)}%</td>
                        <td style={{ color: done ? '#9aa6b8' : d && d < todayIso ? '#e23b3b' : undefined, fontWeight: !done && d && d < todayIso ? 600 : 400 }}>{fmt(d)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
              {!rows.length && <div style={{ textAlign: 'center', color: 'var(--mut)', padding: 20 }}>{picked || kpi || projectFilter || responsibleFilter ? 'No tasks match this filter.' : 'No tasks assigned to you.'}</div>}
            </div>
            )}
            </div>


            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 16 }}>
              <div className="dsb-card">
                <h3><Ic n="users" s={17} />Group Portfolio</h3>
                <div className="dsb-port">
                  {[['TOTAL PROJECTS', projKpi?.total, '#1d6bff', 'proj'], ['ACTIVE PROJECTS', projKpi?.active, '#12a150', 'play'], ['GREEN', projKpi?.green, '#12a150', 'leaf'], ['AMBER', projKpi?.amber, '#f59e0b', 'shield'], ['RED', projKpi?.red, '#ef4444', 'warn']].map(([l, v, c, i]) => (
                    <div key={l as string} className="dsb-p"><small>{l}</small><div className="pv"><b style={{ color: c as string }}>{(v as number | undefined) ?? '—'}</b><Ic n={i as string} s={20} c={c as string} /></div></div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="dsb-stack">
            <CommentInbox tick={tick} />
            <Calendar picked={picked} onPick={setPicked} dots={dots} today={now} />
            <div className="dsb-card">
              <h3><Ic n="pulse" s={17} />Project Health Distribution</h3>
              {hTotal === 0 ? <div style={{ color: 'var(--mut)' }}>No projects</div> : (
                <div className="dsb-row" style={{ gap: 28 }}>
                  <Ring size={112} sw={14} segs={hEntries.map((h) => ({ f: healthDist[h] / hTotal, c: HEALTH_HEX[h] }))}><div><b style={{ fontSize: 18 }}>{hTotal}</b><div style={{ fontSize: 11, color: 'var(--mut)' }}>Projects</div></div></Ring>
                  <div className="dsb-leg">
                    {hEntries.map((h) => <div key={h} style={{ border: 0, padding: '7px 0' }}><i style={{ background: HEALTH_HEX[h], borderRadius: '50%', width: 10, height: 10 }} />{label(h)}<b style={{ fontSize: 12 }}>{healthDist[h]} · {Math.round((healthDist[h] / hTotal) * 100)}%</b></div>)}
                  </div>
                </div>
              )}
            </div>
            <div className="dsb-card">
              <h3><Ic n="target" s={17} />Top Delay Causes</h3>
              {delayCauses.map((d) => (
                <div key={d.category} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label(d.category)}</span><b>{d.count}</b></div>
                  <div style={{ height: 5, borderRadius: 9, background: '#e8edf4', marginTop: 6 }}><div style={{ height: '100%', width: `${(d.count / maxDelay) * 100}%`, borderRadius: 9, background: '#ef4444' }} /></div>
                </div>
              ))}
              {!delayCauses.length && <div style={{ color: 'var(--mut)', fontSize: 12 }}>No delays recorded</div>}
            </div>
          </div>
        </div>

        <Breakdown data={orgIntel} />
      </div>
    </div>
  )
}