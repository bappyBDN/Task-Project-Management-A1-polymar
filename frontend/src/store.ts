// Client-side persistence store (localStorage). Mirrors the backend API surface so the
// app runs standalone today and can be pointed at a database later without UI changes.

import type {
  Approval, AuditEntry, BacklogItem, Company, Decision, DelayRca, Department, Function, Issue,
  ManagementAction, Meeting, Milestone, Notification, ProgressUpdate, Project, ProjectKpi,
  RaciEntry, Risk, Task, TaskKpi, User,
} from './types'

const KEY = 'anwar_task_manager_v8'

function label(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface DB {
  companies: Company[]
  functions: Function[]
  departments: Department[]
  users: User[]
  projects: Project[]
  milestones: Milestone[]
  tasks: Task[]
  progress: ProgressUpdate[]
  delays: DelayRca[]
  approvals: Approval[]
  backlog: BacklogItem[]
  meetings: Meeting[]
  decisions: Decision[]
  actions: ManagementAction[]
  risks: Risk[]
  issues: Issue[]
  raci: RaciEntry[]
  notifications: Notification[]
  audit: AuditEntry[]
  listOptions: { kind: string; value: string }[]
  privilegedRoles: string[]
  seq: number
}

const OPEN_STATUSES = ['backlog', 'ready', 'in_progress', 'in_review', 'blocked', 'on_hold']
const DONE_STATUSES = ['completed', 'closed']

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

let db: DB = load()

function load(): DB {
  try {
    // Remove any legacy storage from older versions to avoid schema conflicts
    try {
      for (const oldKey of ['anwar_task_manager_v1', 'anwar_task_manager_v2', 'anwar_task_manager_v3', 'anwar_task_manager_v4', 'anwar_task_manager_v5', 'anwar_task_manager_v6', 'anwar_task_manager_v7']) {
        if (localStorage.getItem(oldKey)) localStorage.removeItem(oldKey)
      }
    } catch {}
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.tasks && parsed.users && parsed.listOptions) return parsed
      // stale/partial schema — fall through to reseed
    }
  } catch {}
  const fresh = seed()
  persist(fresh)
  return fresh
}

function persist(d: DB = db) {
  // Runs while the app is starting up. If the browser blocks site storage (or it
  // is full) this used to throw and leave a blank page; now it keeps data in memory.
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* storage blocked or full */ }
}

function nextId(d: DB): number {
  d.seq += 1
  return d.seq
}

function nextCode(prefix: string, existing: string[]): string {
  let max = 0
  for (const c of existing) {
    const m = c.match(new RegExp(`^${prefix}-(\\d+)$`))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

function computeTaskHealth(t: Task): string {
  if (['completed', 'closed', 'cancelled'].includes(t.status)) return 'green'
  if (t.blocker) return 'red'
  const due = t.approved_due_date || t.baseline_due_date
  if (due) {
    const t0 = today()
    if (due < t0) return 'red'
    const days = (new Date(due).getTime() - new Date(t0).getTime()) / 86400000
    if (days <= 1) return t.progress_pct >= 50 ? 'amber' : 'red'
  }
  return 'green'
}

function recalcProjectHealth(p: Project, d: DB = db) {
  const tasks = d.tasks.filter((t) => t.project_id === p.id && !(t as any).is_deleted)
  if (tasks.length === 0) { p.health = 'green'; p.completion_pct = 0; return }
  if (tasks.some((t) => t.health === 'black')) p.health = 'black'
  else if (tasks.some((t) => t.health === 'red')) p.health = 'red'
  else if (tasks.some((t) => t.health === 'amber')) p.health = 'amber'
  else p.health = 'green'
  p.completion_pct = Math.round(tasks.reduce((s, t) => s + t.progress_pct, 0) / tasks.length)
}

function audit(action: string, entity_type: string, entity_id?: number, previous?: string, next?: string, reason?: string) {
  db.audit.unshift({
    id: nextId(db), actor: 'local', entity_type, entity_id, action,
    previous_value: previous, new_value: next, reason,
    happened_at: new Date().toISOString(),
  })
}

// ------------------------------------------------------------------ seed
function seed(): DB {
  const d: DB = {
    companies: [], functions: [], departments: [], users: [], projects: [], milestones: [], tasks: [],
    progress: [], delays: [], approvals: [], backlog: [], meetings: [], decisions: [],
    actions: [], risks: [], issues: [], raci: [], notifications: [], audit: [],
    listOptions: [], privilegedRoles: ['admin', 'group_executive', 'pmo', 'auditor'], seq: 0,
  }

  d.companies = [
    { id: 1, name: 'Anwar Group', code: 'ANW', is_active: true },
    { id: 2, name: 'Anwar Cement', code: 'ACL', is_active: true },
    { id: 3, name: 'Anwar Cement Sheet', code: 'ACS', is_active: true },
    { id: 4, name: 'A-One Polymer', code: 'AOP', is_active: true },
    { id: 5, name: 'Anwar Steel', code: 'ASL', is_active: true },
    { id: 6, name: 'Anwar Galvanizing', code: 'AGL', is_active: true },
  ]
  d.functions = [
    { id: 1, name: 'Operations', code: 'OPS' },
    { id: 2, name: 'Finance & Accounts', code: 'FIN' },
    { id: 3, name: 'Sales & Marketing', code: 'S&M' },
    { id: 4, name: 'IT & Digital', code: 'ITD' },
    { id: 5, name: 'Supply Chain', code: 'SCM' },
    { id: 6, name: 'Human Resources', code: 'HR' },
    { id: 7, name: 'Procurement', code: 'PRC' },
    { id: 8, name: 'Quality Assurance', code: 'QA' },
    { id: 9, name: 'Production', code: 'PRD' },
    { id: 10, name: 'Legal & Compliance', code: 'LGL' },
  ]
  d.departments = [
    { id: 1, name: 'Plant Operations', function_id: 1 },
    { id: 2, name: 'Kiln & Grinding', function_id: 1 },
    { id: 3, name: 'Accounts Payable', function_id: 2 },
    { id: 4, name: 'Treasury', function_id: 2 },
    { id: 5, name: 'Field Sales', function_id: 3 },
    { id: 6, name: 'Brand & Marketing', function_id: 3 },
    { id: 7, name: 'Software Development', function_id: 4 },
    { id: 8, name: 'IT Infrastructure', function_id: 4 },
    { id: 9, name: 'Logistics', function_id: 5 },
    { id: 10, name: 'Warehouse', function_id: 5 },
    { id: 11, name: 'Recruitment', function_id: 6 },
    { id: 12, name: 'Payroll', function_id: 6 },
    { id: 13, name: 'Vendor Management', function_id: 7 },
    { id: 14, name: 'QC Lab', function_id: 8 },
    { id: 15, name: 'Production Planning', function_id: 9 },
    { id: 16, name: 'Legal Affairs', function_id: 10 },
  ]
  d.users = [
    { id: 1, employee_id: 'E001', name: 'Rahim Uddin', email: 'rahim@anwargroup.com', designation: 'Group CEO', role: 'group_executive', company_id: 1, function_id: 1, reports_to_id: undefined, is_active: true },
    { id: 2, employee_id: 'E002', name: 'Karim Ahmed', email: 'karim@anwarcement.com', designation: 'Business Head', role: 'business_head', company_id: 2, function_id: 1, reports_to_id: 1, is_active: true },
    { id: 3, employee_id: 'E003', name: 'Shahin Alam', email: 'shahin@anwargroup.com', designation: 'CFO', role: 'functional_head', company_id: 1, function_id: 2, reports_to_id: 1, is_active: true },
    { id: 4, employee_id: 'E004', name: 'Farida Khan', email: 'farida@anwargroup.com', designation: 'PMO Lead', role: 'pmo', company_id: 1, function_id: 4, reports_to_id: 1, is_active: true },
    { id: 5, employee_id: 'E005', name: 'Tanvir Hasan', email: 'tanvir@anwarcement.com', designation: 'Project Manager', role: 'pm', company_id: 2, function_id: 1, reports_to_id: 2, is_active: true },
    { id: 6, employee_id: 'E006', name: 'Nusrat Jahan', email: 'nusrat@anwarcement.com', designation: 'Engineer', role: 'employee', company_id: 2, function_id: 1, reports_to_id: 5, is_active: true },
    { id: 7, employee_id: 'E007', name: 'Imran Kabir', email: 'imran@anwarcement.com', designation: 'Sales Lead', role: 'team_lead', company_id: 2, function_id: 3, reports_to_id: 2, is_active: true },
    { id: 8, employee_id: 'E008', name: 'Sadia Rahman', email: 'sadia@anwargroup.com', designation: 'Auditor', role: 'auditor', company_id: 1, function_id: 2, reports_to_id: 1, is_active: true },
    { id: 9, employee_id: 'E009', name: 'System Administrator', email: 'admin@anwargroup.com', designation: 'Platform Admin', role: 'admin', company_id: 1, function_id: 4, reports_to_id: 1, is_active: true },
    { id: 10, employee_id: 'E010', name: 'Ayesha Siddiqua', email: 'ayesha@anwarcement.com', designation: 'Plant Engineer', role: 'employee', company_id: 2, function_id: 1, reports_to_id: 11, is_active: true },
    { id: 11, employee_id: 'E011', name: 'Mahmudul Hasan', email: 'mahmud@anwarcement.com', designation: 'Maintenance Lead', role: 'team_lead', company_id: 2, function_id: 1, reports_to_id: 5, is_active: true },
    { id: 12, employee_id: 'E012', name: 'Rashida Akter', email: 'rashida@anwargroup.com', designation: 'Financial Analyst', role: 'employee', company_id: 1, function_id: 2, reports_to_id: 3, is_active: true },
    { id: 13, employee_id: 'E013', name: 'Shafiqul Islam', email: 'shafiqul@anwargroup.com', designation: 'IT Manager', role: 'pm', company_id: 1, function_id: 4, reports_to_id: 3, is_active: true },
    { id: 14, employee_id: 'E014', name: 'Nasrin Sultana', email: 'nasrin@anwargroup.com', designation: 'HRBP', role: 'employee', company_id: 1, function_id: 6, reports_to_id: 3, is_active: true },
    { id: 15, employee_id: 'E015', name: 'Kazi Rafiq', email: 'rafiq@anwarcementsheet.com', designation: 'Supply Chain Head', role: 'functional_head', company_id: 3, function_id: 5, reports_to_id: 1, is_active: true },
    { id: 16, employee_id: 'E016', name: 'Sumaiya Akter', email: 'sumaiya@anwarcement.com', designation: 'Sales Executive', role: 'employee', company_id: 2, function_id: 3, reports_to_id: 7, is_active: true },
    { id: 17, employee_id: 'E017', name: 'Arif Chowdhury', email: 'arif@aonepolymer.com', designation: 'Production Manager', role: 'pm', company_id: 4, function_id: 9, reports_to_id: 1, is_active: true },
    { id: 18, employee_id: 'E018', name: 'Farzana Haque', email: 'farzana@anwarsteel.com', designation: 'QA Head', role: 'functional_head', company_id: 5, function_id: 8, reports_to_id: 1, is_active: true },
    { id: 19, employee_id: 'E019', name: 'Rafiqul Islam', email: 'rafiqul@anwarcementsheet.com', designation: 'Operations Lead', role: 'team_lead', company_id: 3, function_id: 1, reports_to_id: 15, is_active: true },
    { id: 20, employee_id: 'E020', name: 'Nadia Rahman', email: 'nadia@aonepolymer.com', designation: 'Procurement Officer', role: 'employee', company_id: 4, function_id: 7, reports_to_id: 17, is_active: true },
  ]
  d.listOptions = [
    ...['strategic', 'project', 'operational', 'management_action', 'compliance', 'audit', 'digital_transformation', 'process_improvement', 'technology', 'finance', 'procurement', 'hr', 'sales', 'marketing', 'supply_chain', 'manufacturing', 'maintenance', 'commercial', 'legal', 'administration', 'risk', 'sustainability', 'other'].map((v) => ({ kind: 'category', value: v })),
    ...['task', 'subtask', 'action', 'issue', 'change', 'bug', 'approval', 'review', 'decision_followup', 'compliance_action'].map((v) => ({ kind: 'task_type', value: v })),
    ...['low', 'medium', 'high', 'critical'].map((v) => ({ kind: 'priority', value: v })),
    ...['draft', 'backlog', 'ready', 'in_progress', 'in_review', 'completed', 'closed', 'blocked', 'on_hold', 'cancelled'].map((v) => ({ kind: 'status', value: v })),
  ]

  const p1 = { id: 1, code: 'PRJ-0001', name: 'Cement Plant Digital Transformation', company_id: 2, function_id: 4, program_id: undefined, sponsor_id: 2, manager_id: 5, owner_id: 5, strategic_objective: 'Digitalize plant operations.', objective: 'IoT monitoring across production.', expected_outcome: '15% downtime reduction.', project_type: 'transformation', priority: 'high', methodology: 'hybrid', start_date: addDays(-60), baseline_due_date: addDays(90), approved_due_date: addDays(90), forecast_due_date: addDays(105), actual_due_date: undefined, completion_pct: 40, status: 'active', health: 'amber', budget: 12000000, criticality: 'high' } as Project
  const p2 = { id: 2, code: 'PRJ-0002', name: 'Route-to-Market Expansion', company_id: 2, function_id: 3, program_id: undefined, sponsor_id: 2, manager_id: 7, owner_id: 7, strategic_objective: 'Expand distribution.', objective: 'Add 200 retail points.', expected_outcome: '12% revenue growth.', project_type: 'strategic', priority: 'high', methodology: 'kanban', start_date: addDays(-30), baseline_due_date: addDays(180), approved_due_date: addDays(180), forecast_due_date: undefined, actual_due_date: undefined, completion_pct: 25, status: 'active', health: 'green', budget: 5000000, criticality: 'medium' } as Project
  const p3 = { id: 3, code: 'PRJ-0003', name: 'ERP Implementation', company_id: 1, function_id: 4, program_id: undefined, sponsor_id: 1, manager_id: 13, owner_id: 13, strategic_objective: 'Group-wide ERP.', objective: 'Roll out ERP.', expected_outcome: 'Unified finance.', project_type: 'transformation', priority: 'high', methodology: 'waterfall', start_date: addDays(-90), baseline_due_date: addDays(300), approved_due_date: addDays(300), forecast_due_date: addDays(330), actual_due_date: undefined, completion_pct: 22, status: 'active', health: 'amber', budget: 45000000, criticality: 'high' } as Project
  const p4 = { id: 4, code: 'PRJ-0004', name: 'Cost Optimization Program', company_id: 2, function_id: 2, program_id: undefined, sponsor_id: 2, manager_id: 3, owner_id: 3, strategic_objective: 'Reduce opex 10%.', objective: 'Cost reduction.', expected_outcome: '10% opex saving.', project_type: 'strategic', priority: 'high', methodology: 'kanban', start_date: addDays(-45), baseline_due_date: addDays(150), approved_due_date: addDays(150), forecast_due_date: undefined, actual_due_date: undefined, completion_pct: 55, status: 'active', health: 'green', budget: undefined, criticality: 'medium' } as Project
  const p5 = { id: 5, code: 'PRJ-0005', name: 'Galvanizing Line Upgrade', company_id: 6, function_id: 1, program_id: undefined, sponsor_id: 1, manager_id: 15, owner_id: 15, strategic_objective: 'Capacity upgrade.', objective: 'Upgrade line capacity.', expected_outcome: '+25% capacity.', project_type: 'project', priority: 'high', methodology: 'agile', start_date: addDays(-200), baseline_due_date: addDays(30), approved_due_date: addDays(30), forecast_due_date: addDays(55), actual_due_date: undefined, completion_pct: 70, status: 'active', health: 'red', budget: 20000000, criticality: 'high' } as Project
  const p6 = { id: 6, code: 'PRJ-0006', name: 'Sales Force Automation', company_id: 2, function_id: 3, program_id: undefined, sponsor_id: 2, manager_id: 7, owner_id: 7, strategic_objective: 'Automate field sales.', objective: 'Field reporting automation.', expected_outcome: 'Faster reporting.', project_type: 'project', priority: 'medium', methodology: 'agile', start_date: addDays(-30), baseline_due_date: addDays(120), approved_due_date: addDays(120), forecast_due_date: undefined, actual_due_date: undefined, completion_pct: 40, status: 'active', health: 'green', budget: 3000000, criticality: 'medium' } as Project
  const p7 = { id: 7, code: 'PRJ-0007', name: 'HR Digital Onboarding', company_id: 1, function_id: 6, program_id: undefined, sponsor_id: 1, manager_id: 14, owner_id: 14, strategic_objective: 'Paperless onboarding.', objective: 'Digitize onboarding.', expected_outcome: 'Faster onboarding.', project_type: 'project', priority: 'medium', methodology: 'agile', start_date: addDays(-15), baseline_due_date: addDays(90), approved_due_date: addDays(90), forecast_due_date: undefined, actual_due_date: undefined, completion_pct: 15, status: 'planning', health: 'green', budget: undefined, criticality: 'medium' } as Project
  const p8 = { id: 8, code: 'PRJ-0008', name: 'Cement Sheet Capacity Expansion', company_id: 3, function_id: 9, program_id: undefined, sponsor_id: 1, manager_id: 15, owner_id: 15, strategic_objective: 'Double sheet production capacity.', objective: 'Install second production line.', expected_outcome: '+100% capacity.', project_type: 'project', priority: 'high', methodology: 'waterfall', start_date: addDays(-45), baseline_due_date: addDays(200), approved_due_date: addDays(200), forecast_due_date: undefined, actual_due_date: undefined, completion_pct: 30, status: 'active', health: 'amber', budget: 30000000, criticality: 'high' } as Project
  const p9 = { id: 9, code: 'PRJ-0009', name: 'A-One Polymer Recycling Line', company_id: 4, function_id: 9, program_id: undefined, sponsor_id: 1, manager_id: 17, owner_id: 17, strategic_objective: 'Sustainable recycling.', objective: 'Commission polymer recycling line.', expected_outcome: '20% material cost reduction.', project_type: 'project', priority: 'high', methodology: 'agile', start_date: addDays(-90), baseline_due_date: addDays(120), approved_due_date: addDays(120), forecast_due_date: addDays(140), actual_due_date: undefined, completion_pct: 45, status: 'active', health: 'green', budget: 15000000, criticality: 'medium' } as Project
  const p10 = { id: 10, code: 'PRJ-0010', name: 'Anwar Steel QC Automation', company_id: 5, function_id: 8, program_id: undefined, sponsor_id: 1, manager_id: 18, owner_id: 18, strategic_objective: 'Improve steel quality consistency.', objective: 'Automate quality testing.', expected_outcome: '40% faster QC cycle.', project_type: 'project', priority: 'medium', methodology: 'hybrid', start_date: addDays(-20), baseline_due_date: addDays(180), approved_due_date: addDays(180), forecast_due_date: undefined, actual_due_date: undefined, completion_pct: 15, status: 'planning', health: 'green', budget: 8000000, criticality: 'medium' } as Project
  d.projects = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10]

  d.milestones = [
    { id: 1, project_id: 1, name: 'Sensor Installation', due_date: addDays(30), status: 'in_progress', completion_pct: 50 },
    { id: 2, project_id: 1, name: 'Dashboard Go-Live', due_date: addDays(90), status: 'not_started', completion_pct: 0 },
    { id: 3, project_id: 3, name: 'Requirements Gathering', due_date: addDays(-20), status: 'completed', completion_pct: 100 },
    { id: 4, project_id: 3, name: 'Configuration', due_date: addDays(60), status: 'in_progress', completion_pct: 40 },
    { id: 5, project_id: 5, name: 'Mechanical Installation', due_date: addDays(10), status: 'in_progress', completion_pct: 80 },
    { id: 6, project_id: 5, name: 'Commissioning', due_date: addDays(30), status: 'not_started', completion_pct: 0 },
  ]

  const mk = (code: string, o: Partial<Task>): Task => ({ id: 0, code, title: '', description: undefined, expected_deliverable: undefined, category: 'operational', task_type: 'task', priority: 'medium', progress_pct: 0, status: 'backlog', health: 'green', blocker: false, created_at: new Date().toISOString(), ...o } as Task)

  const tasks = [
    mk('TSK-0001', { project_id: 1, milestone_id: 1, company_id: 2, function_id: 4, department_id: 7, title: 'Install vibration sensors on Kiln 2', description: 'Mount and calibrate 40 sensors.', expected_deliverable: 'Sensors streaming data.', category: 'digital_transformation', task_type: 'task', priority: 'high', responsible_id: 6, accountable_id: 5, reviewer_id: 5, planned_start_date: addDays(-20), baseline_due_date: addDays(10), approved_due_date: addDays(10), progress_pct: 70, status: 'in_progress' }),
    mk('TSK-0002', { project_id: 1, milestone_id: 1, company_id: 2, function_id: 4, department_id: 8, title: 'Provision cloud telemetry pipeline', description: 'Set up ingestion and storage.', expected_deliverable: 'Working pipeline.', category: 'digital_transformation', task_type: 'task', priority: 'critical', responsible_id: 6, accountable_id: 5, reviewer_id: 5, planned_start_date: addDays(-40), baseline_due_date: addDays(-2), approved_due_date: addDays(-2), progress_pct: 55, status: 'in_progress', blocker: true, blocker_details: 'Cloud vendor credential approval pending.' }),
    mk('TSK-0003', { project_id: 1, company_id: 2, function_id: 4, department_id: 7, title: 'Train plant operators', description: 'IoT dashboard training.', expected_deliverable: 'Trained operators.', category: 'digital_transformation', task_type: 'task', priority: 'medium', responsible_id: 7, accountable_id: 5, planned_start_date: addDays(5), baseline_due_date: addDays(60), approved_due_date: addDays(60), progress_pct: 0, status: 'backlog' }),
    mk('TSK-0004', { project_id: 2, company_id: 2, function_id: 3, department_id: 5, title: 'Appoint 3 new distributors', description: 'Finalize agreements.', expected_deliverable: 'Signed agreements.', category: 'sales', task_type: 'task', priority: 'high', responsible_id: 7, accountable_id: 2, planned_start_date: addDays(-10), baseline_due_date: addDays(20), approved_due_date: addDays(20), progress_pct: 60, status: 'in_progress' }),
    mk('TSK-0005', { project_id: 2, company_id: 2, function_id: 3, department_id: 5, title: 'Retail coverage survey', description: 'Survey retail density.', expected_deliverable: 'Survey report.', category: 'sales', task_type: 'task', priority: 'medium', responsible_id: 7, accountable_id: 2, planned_start_date: addDays(-5), baseline_due_date: addDays(3), approved_due_date: addDays(3), progress_pct: 30, status: 'in_progress' }),
    mk('TSK-0006', { project_id: 3, company_id: 1, function_id: 4, department_id: 7, title: 'Finalize ERP vendor contract', category: 'procurement', task_type: 'task', priority: 'high', responsible_id: 13, accountable_id: 1, reviewer_id: 4, baseline_due_date: addDays(-3), approved_due_date: addDays(-3), progress_pct: 80, status: 'in_progress', blocker: true, blocker_details: 'Legal review pending' }),
    mk('TSK-0007', { project_id: 3, company_id: 1, function_id: 2, department_id: 3, title: 'Map chart of accounts', category: 'finance', task_type: 'task', priority: 'medium', responsible_id: 12, accountable_id: 3, baseline_due_date: addDays(15), approved_due_date: addDays(15), progress_pct: 50, status: 'in_progress' }),
    mk('TSK-0008', { project_id: 3, company_id: 1, function_id: 4, department_id: 7, title: 'Data migration scripts', category: 'technology', task_type: 'subtask', priority: 'high', responsible_id: 13, accountable_id: 13, baseline_due_date: addDays(45), approved_due_date: addDays(45), progress_pct: 10, status: 'backlog' }),
    mk('TSK-0009', { project_id: 4, company_id: 2, function_id: 2, department_id: 3, title: 'Renegotiate fuel supplier rates', category: 'procurement', task_type: 'action', priority: 'critical', responsible_id: 2, accountable_id: 3, baseline_due_date: addDays(2), approved_due_date: addDays(2), progress_pct: 60, status: 'in_progress' }),
    mk('TSK-0010', { project_id: 4, company_id: 2, function_id: 2, department_id: 4, title: 'Electricity tariff review', category: 'finance', task_type: 'task', priority: 'high', responsible_id: 12, accountable_id: 3, baseline_due_date: addDays(10), approved_due_date: addDays(10), progress_pct: 30, status: 'in_progress' }),
    mk('TSK-0011', { project_id: 5, company_id: 6, function_id: 1, department_id: 1, title: 'Install new zinc bath', category: 'manufacturing', task_type: 'task', priority: 'critical', responsible_id: 11, accountable_id: 15, baseline_due_date: addDays(-1), approved_due_date: addDays(-1), progress_pct: 85, status: 'in_progress', blocker: true, blocker_details: 'Imported equipment held at customs' }),
    mk('TSK-0012', { project_id: 5, company_id: 6, function_id: 1, department_id: 1, title: 'Commissioning test run', category: 'manufacturing', task_type: 'task', priority: 'high', responsible_id: 11, accountable_id: 15, baseline_due_date: addDays(15), approved_due_date: addDays(15), progress_pct: 0, status: 'backlog' }),
    mk('TSK-0013', { project_id: 6, company_id: 2, function_id: 3, department_id: 5, title: 'Build sales dashboard MVP', category: 'technology', task_type: 'task', priority: 'high', responsible_id: 7, accountable_id: 2, baseline_due_date: addDays(20), approved_due_date: addDays(20), progress_pct: 45, status: 'in_progress' }),
    mk('TSK-0014', { project_id: 7, company_id: 1, function_id: 6, department_id: 11, title: 'Digitize offer letter workflow', category: 'hr', task_type: 'task', priority: 'medium', responsible_id: 14, accountable_id: 14, baseline_due_date: addDays(14), approved_due_date: addDays(14), progress_pct: 20, status: 'in_progress' }),
    mk('TSK-0015', { company_id: 1, function_id: 2, department_id: 3, title: 'Prepare monthly MIS report', category: 'finance', task_type: 'task', priority: 'high', responsible_id: 12, accountable_id: 3, baseline_due_date: addDays(1), approved_due_date: addDays(1), progress_pct: 70, status: 'in_progress' }),
    mk('TSK-0016', { company_id: 1, function_id: 2, department_id: 4, title: 'Supplier payment reconciliation', category: 'finance', task_type: 'task', priority: 'medium', responsible_id: 12, accountable_id: 3, baseline_due_date: addDays(-2), approved_due_date: addDays(-2), progress_pct: 90, status: 'in_review' }),
    mk('TSK-0017', { company_id: 1, function_id: 10, department_id: 16, title: 'Quarterly compliance filing', category: 'compliance', task_type: 'compliance_action', priority: 'high', responsible_id: 3, accountable_id: 1, baseline_due_date: addDays(7), approved_due_date: addDays(7), progress_pct: 0, status: 'ready' }),
    mk('TSK-0018', { company_id: 1, function_id: 4, department_id: 8, title: 'Server patch and backup', category: 'technology', task_type: 'change', priority: 'medium', responsible_id: 13, accountable_id: 13, baseline_due_date: addDays(-1), approved_due_date: addDays(-1), progress_pct: 100, status: 'completed', actual_due_date: addDays(-1) }),
    mk('TSK-0019', { company_id: 1, function_id: 7, department_id: 13, title: 'Vendor onboarding for IoT', category: 'procurement', task_type: 'approval', priority: 'high', responsible_id: 13, accountable_id: 3, baseline_due_date: addDays(3), approved_due_date: addDays(3), progress_pct: 15, status: 'blocked', blocker: true, blocker_details: 'Awaiting budget approval' }),
    // new SBU tasks
    mk('TSK-0020', { project_id: 8, company_id: 3, function_id: 9, department_id: 15, title: 'Install second sheet production line', category: 'manufacturing', task_type: 'task', priority: 'high', responsible_id: 19, accountable_id: 15, baseline_due_date: addDays(40), approved_due_date: addDays(40), progress_pct: 35, status: 'in_progress' }),
    mk('TSK-0021', { project_id: 8, company_id: 3, function_id: 9, department_id: 15, title: 'Sheet line QC calibration', category: 'quality_assurance', task_type: 'task', priority: 'medium', responsible_id: 19, accountable_id: 15, baseline_due_date: addDays(60), approved_due_date: addDays(60), progress_pct: 10, status: 'backlog' }),
    mk('TSK-0022', { project_id: 9, company_id: 4, function_id: 9, department_id: 15, title: 'Commission polymer recycling line', category: 'manufacturing', task_type: 'task', priority: 'high', responsible_id: 17, accountable_id: 17, baseline_due_date: addDays(30), approved_due_date: addDays(30), progress_pct: 50, status: 'in_progress' }),
    mk('TSK-0023', { project_id: 9, company_id: 4, function_id: 7, department_id: 13, title: 'Source recycled polymer feedstock', category: 'procurement', task_type: 'task', priority: 'medium', responsible_id: 20, accountable_id: 17, baseline_due_date: addDays(20), approved_due_date: addDays(20), progress_pct: 25, status: 'in_progress' }),
    mk('TSK-0024', { project_id: 10, company_id: 5, function_id: 8, department_id: 14, title: 'Automate steel QC testing', category: 'quality_assurance', task_type: 'task', priority: 'high', responsible_id: 18, accountable_id: 18, baseline_due_date: addDays(50), approved_due_date: addDays(50), progress_pct: 20, status: 'in_progress' }),
    mk('TSK-0025', { project_id: 10, company_id: 5, function_id: 8, department_id: 14, title: 'QC lab equipment procurement', category: 'procurement', task_type: 'task', priority: 'medium', responsible_id: 18, accountable_id: 18, baseline_due_date: addDays(15), approved_due_date: addDays(15), progress_pct: 0, status: 'backlog' }),
  ]
  tasks.forEach((t) => { t.id = nextId(d); t.health = computeTaskHealth(t) })
  d.tasks = tasks
  d.seq = 10000

  d.backlog = [
    { id: 1, code: 'BLG-0001', project_id: 1, company_id: 2, function_id: 4, department_id: 7, requirement: 'Predictive maintenance model', business_value: 'high', priority: 'high', status: 'grooming', requested_by_id: 5 },
    { id: 2, code: 'BLG-0002', project_id: 1, company_id: 2, function_id: 4, department_id: 8, requirement: 'Mobile alerts for downtime', business_value: 'medium', priority: 'medium', status: 'new', requested_by_id: 5 },
    { id: 3, code: 'BLG-0003', project_id: 3, company_id: 1, function_id: 4, department_id: 7, requirement: 'Mobile expense approval', business_value: 'high', priority: 'high', status: 'grooming', requested_by_id: 3 },
    { id: 4, code: 'BLG-0004', project_id: 6, company_id: 2, function_id: 3, department_id: 5, requirement: 'Geo-fencing for field visits', business_value: 'high', priority: 'high', status: 'prioritized', requested_by_id: 7 },
    { id: 5, code: 'BLG-0005', project_id: 6, company_id: 2, function_id: 3, department_id: 5, requirement: 'Offline order capture', business_value: 'high', priority: 'critical', status: 'ready', requested_by_id: 7 },
    { id: 6, code: 'BLG-0006', project_id: 8, company_id: 3, function_id: 9, department_id: 15, requirement: 'Sheet line automation', business_value: 'high', priority: 'high', status: 'review', requested_by_id: 15 },
    { id: 7, code: 'BLG-0007', project_id: 9, company_id: 4, function_id: 9, department_id: 15, requirement: 'Polymer recycling QC module', business_value: 'medium', priority: 'medium', status: 'new', requested_by_id: 17 },
    { id: 8, code: 'BLG-0008', project_id: 10, company_id: 5, function_id: 8, department_id: 14, requirement: 'Steel QC report automation', business_value: 'high', priority: 'high', status: 'grooming', requested_by_id: 18 },
  ]

  d.meetings = [
    { id: 1, title: 'Executive Committee — Mar', meeting_type: 'executive_committee', meeting_date: addDays(-10) },
    { id: 2, title: 'Business Review — Cement', meeting_type: 'business_review', meeting_date: addDays(-5) },
    { id: 3, title: 'Project Steering — ERP', meeting_type: 'steering_committee', meeting_date: addDays(-3) },
  ]
  d.decisions = [
    { id: 1, code: 'DEC-0001', meeting_id: 1, statement: 'Approve ERP budget of BDT 45M.', owner_id: 1, decision_date: addDays(-10), status: 'closed' },
    { id: 2, code: 'DEC-0002', meeting_id: 2, statement: 'Fast-track galvanizing line upgrade.', owner_id: 2, decision_date: addDays(-5), status: 'open' },
    { id: 3, code: 'DEC-0003', meeting_id: 3, statement: 'Extend UAT window by 2 weeks.', owner_id: 13, project_id: 3, decision_date: addDays(-3), status: 'open' },
  ]
  d.actions = [
    { id: 1, code: 'ACT-0001', meeting_id: 1, decision_id: 1, action: 'CFO to release ERP budget tranche.', responsible_id: 3, accountable_id: 1, due_date: addDays(5), status: 'open' },
    { id: 2, code: 'ACT-0002', meeting_id: 2, decision_id: 2, action: 'Clear customs for imported zinc bath equipment.', responsible_id: 15, accountable_id: 2, due_date: addDays(2), status: 'open' },
    { id: 3, code: 'ACT-0003', meeting_id: 3, decision_id: 3, action: 'Update project plan with new UAT dates.', responsible_id: 13, accountable_id: 13, due_date: addDays(4), status: 'open' },
  ]
  d.risks = [
    { id: 1, project_id: 3, description: 'Key vendor may miss configuration deadline.', category: 'vendor', likelihood: 'high', impact: 'high', mitigation: 'Assign internal backup.', owner_id: 13, status: 'open' },
    { id: 2, project_id: 5, description: 'Currency fluctuation increases equipment cost.', category: 'financial', likelihood: 'medium', impact: 'medium', mitigation: 'Hedging via forward contract.', owner_id: 15, status: 'open' },
  ]
  d.issues = [
    { id: 1, project_id: 5, description: 'Customs clearance delayed for zinc bath.', category: 'regulatory', severity: 'high', resolution: 'Escalated to business head.', owner_id: 15, status: 'open' },
    { id: 2, project_id: 3, description: 'Data quality issues in legacy master data.', category: 'data', severity: 'medium', resolution: 'Data cleansing initiated.', owner_id: 13, status: 'open' },
  ]
  d.raci = [
    { id: 1, task_id: 1, user_id: 6, raci_type: 'R' },
    { id: 2, task_id: 1, user_id: 5, raci_type: 'A' },
    { id: 3, task_id: 2, user_id: 6, raci_type: 'R' },
    { id: 4, task_id: 2, user_id: 5, raci_type: 'A' },
    { id: 5, task_id: 3, user_id: 7, raci_type: 'R' },
    { id: 6, task_id: 3, user_id: 5, raci_type: 'A' },
  ]
  d.delays = [
    { id: 1, task_id: 2, delay_category: 'vendor_delay', delay_reason: 'Cloud credentials not issued.', root_cause: 'Procurement approval queue bottleneck.', is_internal: true, dependency_related: false, responsible_party: 'IT Procurement', business_impact: 'Delays dashboard go-live.', schedule_impact_days: 7, recovery_action: 'Escalate to CFO.', recovery_owner_id: 5, revised_due_date: addDays(5), management_intervention: true, preventive_action: 'Pre-approve vendor onboarding.', approval_status: 'pending' },
    { id: 2, task_id: 6, delay_category: 'approval_pending', delay_reason: 'Legal review pending on vendor contract.', root_cause: 'Single legal reviewer overloaded.', is_internal: true, dependency_related: false, business_impact: 'Delays ERP sign-off.', schedule_impact_days: 5, recovery_action: 'Assign second reviewer.', recovery_owner_id: 4, revised_due_date: addDays(5), management_intervention: false, approval_status: 'pending' },
  ]

  recalcProjectHealth(p1, d); recalcProjectHealth(p2, d); recalcProjectHealth(p3, d); recalcProjectHealth(p4, d); recalcProjectHealth(p5, d); recalcProjectHealth(p6, d); recalcProjectHealth(p7, d); recalcProjectHealth(p8, d); recalcProjectHealth(p9, d); recalcProjectHealth(p10, d)

  return d
}

// ------------------------------------------------------------------ public API
export const store = {
  // organizations
  companies: () => db.companies,
  functions: () => db.functions,
  departments: () => db.departments,
  users: () => db.users,
  userById: (id: number) => db.users.find((u) => u.id === id),
  createCompany: (p: any): Company => {
    const c = { ...p, id: nextId(db) } as Company
    db.companies.push(c); persist(); return c
  },
  removeCompany: (id: number) => {
    db.companies = db.companies.filter((c) => c.id !== id)
    db.projects.forEach((p) => { if (p.company_id === id) p.company_id = undefined })
    db.tasks.forEach((t) => { if (t.company_id === id) t.company_id = undefined })
    db.users.forEach((u) => { if (u.company_id === id) u.company_id = undefined })
    persist()
  },
  createFunction: (p: any): Function => {
    const f = { ...p, id: nextId(db) } as Function
    db.functions.push(f); persist(); return f
  },
  removeFunction: (id: number) => {
    db.functions = db.functions.filter((f) => f.id !== id)
    db.projects.forEach((p) => { if (p.function_id === id) p.function_id = undefined })
    db.tasks.forEach((t) => { if (t.function_id === id) t.function_id = undefined })
    db.users.forEach((u) => { if (u.function_id === id) u.function_id = undefined })
    db.departments.forEach((dp) => { if (dp.function_id === id) dp.function_id = undefined })
    persist()
  },
  createDepartment: (p: any): Department => {
    const dp = { ...p, id: nextId(db) } as Department
    db.departments.push(dp); persist(); return dp
  },
  removeDepartment: (id: number) => {
    db.departments = db.departments.filter((dp) => dp.id !== id)
    db.tasks.forEach((t) => { if (t.department_id === id) t.department_id = undefined })
    db.users.forEach((u) => { if (u.department_id === id) u.department_id = undefined })
    persist()
  },
  createUser: (p: any): User => {
    const u = { ...p, id: nextId(db), is_active: true }
    db.users.push(u); persist(); return u
  },
  updateUser: (id: number, p: any): User => {
    const u = db.users.find((x) => x.id === id)!
    Object.assign(u, p); persist(); return u
  },
  deactivateUser: (id: number) => { const u = db.users.find((x) => x.id === id)!; u.is_active = false; persist() },
  deleteUser: (id: number) => {
    db.users = db.users.filter((x) => x.id !== id)
    const nullRefs = (arr: any[], keys: string[]) => arr.forEach((o) => keys.forEach((k) => { if (o[k] === id) o[k] = undefined }))
    nullRefs(db.projects, ['sponsor_id', 'manager_id', 'owner_id'])
    nullRefs(db.tasks, ['responsible_id', 'accountable_id', 'reviewer_id'])
    nullRefs(db.delays, ['recovery_owner_id'])
    nullRefs(db.backlog, ['requested_by_id'])
    nullRefs(db.approvals, ['requested_by_id', 'approver_id'])
    nullRefs(db.decisions, ['owner_id'])
    nullRefs(db.actions, ['responsible_id', 'accountable_id'])
    nullRefs(db.risks, ['owner_id'])
    nullRefs(db.issues, ['owner_id'])
    db.raci = db.raci.filter((r) => r.user_id !== id)
    db.notifications = db.notifications.filter((n) => n.user_id !== id)
    persist()
  },

  // projects
  projects: () => db.projects,
  projectById: (id: number) => db.projects.find((p) => p.id === id),
  createProject: (p: any): Project => {
    const code = p.code || nextCode('PRJ', db.projects.map((x) => x.code))
    const proj = { ...p, id: nextId(db), code, completion_pct: 0, health: 'green', status: p.status || 'planning' } as Project
    db.projects.push(proj); persist(); audit('created', 'project', proj.id, undefined, proj.name); return proj
  },
  updateProject: (id: number, p: any): Project => {
    const proj = db.projects.find((x) => x.id === id)!
    Object.assign(proj, p); persist(); return proj
  },
  deleteProject: (id: number) => {
    db.projects = db.projects.filter((p) => p.id !== id)
    db.milestones = db.milestones.filter((m) => m.project_id !== id)
    db.tasks.forEach((t) => { if (t.project_id === id) (t as any).is_deleted = true })
    db.backlog.forEach((b) => { if (b.project_id === id) b.project_id = undefined })
    db.raci = db.raci.filter((r) => r.project_id !== id)
    persist()
  },
  milestones: (projectId: number) => db.milestones.filter((m) => m.project_id === projectId),
  createMilestone: (projectId: number, m: any): Milestone => {
    const ms = { ...m, id: nextId(db), project_id: projectId }
    db.milestones.push(ms); persist(); return ms
  },

  // tasks
  tasks: (filter?: { project_id?: number; responsible_id?: number; accountable_id?: number; status?: string; priority?: string; health?: string; overdue?: boolean; blocker?: boolean }) => {
    let list = db.tasks.filter((t) => !(t as any).is_deleted)
    if (!filter) return list
    if (filter.project_id) list = list.filter((t) => t.project_id === filter.project_id)
    if (filter.responsible_id) list = list.filter((t) => t.responsible_id === filter.responsible_id)
    if (filter.accountable_id) list = list.filter((t) => t.accountable_id === filter.accountable_id)
    if (filter.status) list = list.filter((t) => t.status === filter.status)
    if (filter.priority) list = list.filter((t) => t.priority === filter.priority)
    if (filter.health) list = list.filter((t) => t.health === filter.health)
    if (filter.blocker !== undefined) list = list.filter((t) => t.blocker === filter.blocker)
    if (filter.overdue === true) {
      const t0 = today()
      list = list.filter((t) => !DONE_STATUSES.includes(t.status) && (t.approved_due_date || t.baseline_due_date) && (t.approved_due_date || t.baseline_due_date)! < t0)
    }
    return list
  },
  taskById: (id: number) => db.tasks.find((t) => t.id === id),
  createTask: (p: any): Task => {
    const code = p.code || nextCode('TSK', db.tasks.map((x) => x.code))
    const t = { ...p, id: nextId(db), code, created_at: new Date().toISOString() } as Task
    t.health = computeTaskHealth(t)
    db.tasks.push(t)
    if (t.project_id) { const proj = db.projects.find((x) => x.id === t.project_id); if (proj) recalcProjectHealth(proj) }
    audit('created', 'task', t.id, undefined, t.title)
    persist(); return t
  },
  updateTask: (id: number, p: any): Task => {
    const t = db.tasks.find((x) => x.id === id)!
    Object.assign(t, p)
    t.health = computeTaskHealth(t)
    if (t.project_id) { const proj = db.projects.find((x) => x.id === t.project_id); if (proj) recalcProjectHealth(proj) }
    persist(); return t
  },
  deleteTask: (id: number) => { const t = db.tasks.find((x) => x.id === id)!; (t as any).is_deleted = true; persist() },
  permanentDeleteTask: (id: number) => {
    db.tasks = db.tasks.filter((t) => t.id !== id)
    db.progress = db.progress.filter((p) => p.task_id !== id)
    db.delays = db.delays.filter((d) => d.task_id !== id)
    db.approvals = db.approvals.filter((a) => !(a.entity_type === 'task' && a.entity_id === id))
    db.raci = db.raci.filter((r) => r.task_id !== id)
    audit('permanent_deleted', 'task', id)
    persist()
  },
  addProgress: (taskId: number, p: any): ProgressUpdate => {
    const t = db.tasks.find((x) => x.id === taskId)!
    const u = { ...p, id: nextId(db), task_id: taskId, created_at: new Date().toISOString() } as ProgressUpdate
    db.progress.unshift(u)
    t.progress_pct = p.progress_pct
    if (p.status) t.status = p.status
    if (p.blocker) { t.blocker = true; if (p.blocker_details) t.blocker_details = p.blocker_details }
    if (p.forecast_due_date) t.forecast_due_date = p.forecast_due_date
    t.health = computeTaskHealth(t)
    if (t.project_id) { const proj = db.projects.find((x) => x.id === t.project_id); if (proj) recalcProjectHealth(proj) }
    persist(); return u
  },
  progressList: (taskId: number) => db.progress.filter((p) => p.task_id === taskId),

  // delays
  delays: (taskId?: number) => taskId ? db.delays.filter((d) => d.task_id === taskId) : db.delays,
  createDelay: (p: any): DelayRca => {
    const d = { ...p, id: nextId(db) } as DelayRca
    db.delays.unshift(d)
    const t = db.tasks.find((x) => x.id === p.task_id)
    if (t) {
      t.health = 'amber'
      if (p.revised_due_date) t.forecast_due_date = p.revised_due_date
      // notify accountable owner about the delay
      if (t.accountable_id) {
        db.notifications.unshift({ id: nextId(db), user_id: t.accountable_id, title: `Delay logged: ${t.code}`, body: `${d.delay_reason ?? 'Delay'} — proposed ${d.revised_due_date ?? 'no revised date'}.`, kind: 'warning', is_read: false, created_at: new Date().toISOString() })
      }
    }
    audit('delay_rca_submitted', 'task', p.task_id, undefined, p.delay_category, p.delay_reason)
    persist(); return d
  },

  // approvals
  approvals: () => db.approvals,
  createApproval: (p: any): Approval => {
    const a = { ...p, id: nextId(db), status: 'pending', created_at: new Date().toISOString() } as Approval
    db.approvals.unshift(a)
    // notify the approver
    if (a.approver_id) {
      db.notifications.unshift({ id: nextId(db), user_id: a.approver_id, title: `Approval requested: ${label(a.approval_type)}`, body: a.reason ?? `A ${a.approval_type} approval is awaiting your decision.`, kind: 'approval', is_read: false, created_at: new Date().toISOString() })
    }
    persist(); return a
  },
  decideApproval: (id: number, status: string, reason?: string): Approval => {
    const a = db.approvals.find((x) => x.id === id)!
    a.status = status; a.reason = reason; a.decided_at = new Date().toISOString()
    if (a.entity_type === 'task') {
      const t = db.tasks.find((x) => x.id === a.entity_id)
      if (t) {
        if (a.approval_type === 'completion' && status === 'approved') { t.status = 'completed'; t.actual_due_date = today(); t.progress_pct = 100 }
        if (a.approval_type === 'revised_date' && status === 'approved') {
          const rca = db.delays.filter((d) => d.task_id === t.id).sort((x, y) => y.id - x.id)[0]
          if (rca?.revised_due_date) { t.approved_due_date = rca.revised_due_date; rca.approval_status = 'approved' }
        }
        t.health = computeTaskHealth(t)
        if (t.project_id) { const proj = db.projects.find((x) => x.id === t.project_id); if (proj) recalcProjectHealth(proj) }
        // notify the requester and responsible owner
        const recipients = new Set<number>([a.requested_by_id, t.responsible_id, t.accountable_id].filter(Boolean) as number[])
        recipients.forEach((uid) => {
          db.notifications.unshift({ id: nextId(db), user_id: uid, title: `${label(a.approval_type)} ${status} — ${t.code}`, body: reason ?? `${label(a.approval_type)} was ${status}.`, kind: 'approval', is_read: false, created_at: new Date().toISOString() })
        })
      }
    }
    audit(`approval_${status}`, a.entity_type, a.entity_id, undefined, undefined, reason)
    persist(); return a
  },

  // backlog
  backlog: (projectId?: number, status?: string) => {
    let list = db.backlog
    if (projectId) list = list.filter((b) => b.project_id === projectId)
    if (status) list = list.filter((b) => b.status === status)
    return list
  },
  createBacklog: (p: any): BacklogItem => {
    const code = p.code || nextCode('BLG', db.backlog.map((x) => x.code))
    const b = { ...p, id: nextId(db), code } as BacklogItem
    db.backlog.push(b); persist(); return b
  },
  updateBacklog: (id: number, p: any): BacklogItem => {
    const b = db.backlog.find((x) => x.id === id)!
    Object.assign(b, p); persist(); return b
  },

  // governance
  meetings: () => db.meetings,
  decisions: () => db.decisions,
  actions: () => db.actions,
  risks: () => db.risks,
  issues: () => db.issues,
  updateDecision: (id: number, p: any) => { const d = db.decisions.find((x) => x.id === id)!; Object.assign(d, p); persist(); return d },
  createAction: (p: any): ManagementAction => {
    const a = { ...p, id: nextId(db), code: p.code || nextCode('ACT', db.actions.map((x) => x.code)) } as ManagementAction
    db.actions.push(a); persist(); return a
  },
  updateAction: (id: number, p: any) => { const a = db.actions.find((x) => x.id === id)!; Object.assign(a, p); persist(); return a },
  convertAction: (id: number, responsible_id?: number): Task => {
    const a = db.actions.find((x) => x.id === id)!
    if (a.converted_task_id) return db.tasks.find((t) => t.id === a.converted_task_id)!
    const t = store.createTask({ title: a.action, description: a.action, category: 'management_action', task_type: 'action', responsible_id: a.responsible_id || responsible_id, accountable_id: a.accountable_id, baseline_due_date: a.due_date, approved_due_date: a.due_date, status: 'backlog', progress_pct: 0 })
    a.converted_task_id = t.id; persist(); return t
  },

  // raci
  raciEntries: (projectId?: number) => projectId ? db.raci.filter((r) => r.project_id === projectId) : db.raci,
  raciMatrix: (projectId?: number, filter?: { company_id?: number; function_id?: number; department_id?: number }) => {
    let tasks = db.tasks.filter((t) => !(t as any).is_deleted)
    if (projectId) tasks = tasks.filter((t) => t.project_id === projectId)
    if (filter?.company_id) tasks = tasks.filter((t) => t.company_id === filter.company_id)
    if (filter?.function_id) tasks = tasks.filter((t) => t.function_id === filter.function_id)
    if (filter?.department_id) tasks = tasks.filter((t) => t.department_id === filter.department_id)
    const taskIds = new Set(tasks.map((t) => t.id))
    const entries = db.raci.filter((r) => r.task_id != null && taskIds.has(r.task_id))
    const userIds = new Set<number>()
    tasks.forEach((t) => { [t.responsible_id, t.accountable_id, t.reviewer_id].forEach((id) => id && userIds.add(id)) })
    entries.forEach((e) => userIds.add(e.user_id))
    const users = db.users.filter((u) => userIds.has(u.id))
    const cells: Record<string, string[]> = {}
    tasks.forEach((t) => {
      if (t.responsible_id) { (cells[`${t.id}:${t.responsible_id}`] ||= []).push('R') }
      if (t.accountable_id) { (cells[`${t.id}:${t.accountable_id}`] ||= []).push('A') }
      if (t.reviewer_id) { (cells[`${t.id}:${t.reviewer_id}`] ||= []).push('C') }
    })
    entries.forEach((e) => { if (e.task_id != null) (cells[`${e.task_id}:${e.user_id}`] ||= []).push(e.raci_type) })
    const rows = tasks.map((t) => ({
      task_id: t.id, code: t.code, title: t.title, project_id: t.project_id,
      cells: users.map((u) => ({ user_id: u.id, value: [...new Set(cells[`${t.id}:${u.id}`] || [])].join('') })),
    }))
    return {
      project_id: projectId ?? null,
      users: users.map((u) => ({ id: u.id, name: u.name })),
      tasks: tasks.map((t) => ({ id: t.id, code: t.code, title: t.title, project_id: t.project_id })),
      rows,
      gaps: tasks.filter((t) => !t.responsible_id || !t.accountable_id).map((t) => t.id),
    }
  },

  // list options
  listOptions: (kind: string) => db.listOptions.filter((o) => o.kind === kind).map((o) => o.value),
  addListOption: (kind: string, value: string) => {
    if (!db.listOptions.some((o) => o.kind === kind && o.value === value)) db.listOptions.push({ kind, value })
    persist()
  },
  removeListOption: (kind: string, value: string) => {
    db.listOptions = db.listOptions.filter((o) => !(o.kind === kind && o.value === value))
    persist()
  },

  // privileged roles configuration
  privilegedRoles: () => [...db.privilegedRoles],
  addPrivilegedRole: (role: string) => {
    if (!db.privilegedRoles.includes(role)) db.privilegedRoles.push(role)
    persist()
  },
  removePrivilegedRole: (role: string) => {
    if (role === 'admin') return // admin is always privileged
    db.privilegedRoles = db.privilegedRoles.filter((r) => r !== role)
    persist()
  },
  privilegedUsers: () => db.users.filter((u) => db.privilegedRoles.includes(u.role)),
  isPrivileged: (role: string) => db.privilegedRoles.includes(role),
  allRoles: () => {
    const base = ['group_executive', 'business_head', 'functional_head', 'sponsor', 'pmo', 'pm', 'team_lead', 'employee', 'reviewer', 'auditor', 'admin']
    const merged = new Set([...base, ...db.privilegedRoles])
    return [...merged]
  },

  // resolve approver for a task using the user hierarchy
  // Order: reviewer → accountable → responsible's manager (reports_to_id chain) → privileged user
  approverFor: (task: Task) => {
    if (task.reviewer_id) return db.users.find((u) => u.id === task.reviewer_id)
    if (task.accountable_id) return db.users.find((u) => u.id === task.accountable_id)

    // walk up the reporting line from the responsible person
    const responsible = db.users.find((u) => u.id === task.responsible_id)
    let current: User | undefined = responsible
    const seen = new Set<number>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      const manager = current.reports_to_id ? db.users.find((u) => u.id === current!.reports_to_id) : undefined
      if (!manager) break
      // first privileged role in the chain becomes the approver
      if (db.privilegedRoles.includes(manager.role)) return manager
      current = manager
    }

    // fallback: any privileged user who is not the responsible
    return db.users.find((u) => db.privilegedRoles.includes(u.role) && u.id !== task.responsible_id)
  },

  // build the full reporting chain for a user (for display / hierarchy mapping)
  reportingChain: (userId: number): User[] => {
    const chain: User[] = []
    let current: User | undefined = db.users.find((u) => u.id === userId)
    const seen = new Set<number>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      chain.push(current)
      current = current.reports_to_id ? db.users.find((u) => u.id === current!.reports_to_id) : undefined
    }
    return chain
  },

  // dashboards
  individualKpi: (userId: number): TaskKpi => {
    const t0 = today()
    const base = db.tasks.filter((t) => !(t as any).is_deleted && (t.responsible_id === userId || t.accountable_id === userId))
    const total = base.length
    const open = base.filter((t) => OPEN_STATUSES.includes(t.status)).length
    const completed = base.filter((t) => DONE_STATUSES.includes(t.status)).length
    const overdue = base.filter((t) => OPEN_STATUSES.includes(t.status) && (t.approved_due_date || t.baseline_due_date) && (t.approved_due_date || t.baseline_due_date)! < t0).length
    const critical = base.filter((t) => t.priority === 'critical' && OPEN_STATUSES.includes(t.status)).length
    const blocked = base.filter((t) => t.blocker && OPEN_STATUSES.includes(t.status)).length
    const due_today = base.filter((t) => (t.approved_due_date || t.baseline_due_date) === t0).length
    const completion_pct = total ? Math.round(completed / total * 1000) / 10 : 0
    const onTime = base.filter((t) => DONE_STATUSES.includes(t.status) && t.actual_due_date && (t.approved_due_date || t.baseline_due_date) && t.actual_due_date <= (t.approved_due_date || t.baseline_due_date)!).length
    const on_time_pct = completed ? Math.round(onTime / completed * 1000) / 10 : 100
    return { total, open, completed, overdue, critical, blocked, due_today, completion_pct, on_time_pct }
  },
  executiveKpi: (): ProjectKpi => {
    const total = db.projects.length
    const active = db.projects.filter((p) => ['planning', 'active'].includes(p.status)).length
    const green = db.projects.filter((p) => p.health === 'green').length
    const amber = db.projects.filter((p) => p.health === 'amber').length
    const red = db.projects.filter((p) => p.health === 'red').length
    const black = db.projects.filter((p) => p.health === 'black').length
    const forecast_miss = db.projects.filter((p) => p.forecast_due_date && p.approved_due_date && p.forecast_due_date > p.approved_due_date && !['completed', 'closed', 'cancelled'].includes(p.status)).length
    return { total, active, green, amber, red, black, forecast_miss }
  },
  healthDistribution: () => {
    const m: Record<string, number> = {}
    db.projects.forEach((p) => { m[p.health] = (m[p.health] || 0) + 1 })
    return m
  },
  delayCauses: () => {
    const m: Record<string, number> = {}
    db.delays.forEach((d) => { const c = d.delay_category || 'Other'; m[c] = (m[c] || 0) + 1 })
    return Object.entries(m).map(([category, count]) => ({ category, count }))
  },

  // organizational intelligence: roll up tasks & projects by SBU / Function / Department
  orgIntelligence: () => {
    const tasks = db.tasks.filter((t) => !(t as any).is_deleted)
    const companyName = (id?: number) => db.companies.find((c) => c.id === id)?.name ?? 'Unassigned'
    const functionName = (id?: number) => db.functions.find((f) => f.id === id)?.name ?? 'Unassigned'
    const departmentName = (id?: number) => db.departments.find((dp) => dp.id === id)?.name ?? 'Unassigned'

    const bySbu: Record<string, { total: number; open: number; completed: number; overdue: number; projects: number }> = {}
    const byFunction: Record<string, { total: number; open: number; completed: number; overdue: number; projects: number }> = {}
    const byDepartment: Record<string, { total: number; open: number; completed: number; overdue: number; projects: number }> = {}

    const t0 = today()
    tasks.forEach((t) => {
      const overdue = OPEN_STATUSES.includes(t.status) && (t.approved_due_date || t.baseline_due_date) && (t.approved_due_date || t.baseline_due_date)! < t0
      const sbuKey = companyName(t.company_id)
      const fnKey = functionName(t.function_id)
      const dpKey = departmentName(t.department_id)
      for (const [map, key] of [[bySbu, sbuKey], [byFunction, fnKey], [byDepartment, dpKey]] as any[]) {
        map[key] = map[key] || { total: 0, open: 0, completed: 0, overdue: 0, projects: 0 }
        map[key].total++
        if (OPEN_STATUSES.includes(t.status)) map[key].open++
        if (DONE_STATUSES.includes(t.status)) map[key].completed++
        if (overdue) map[key].overdue++
      }
    })

    db.projects.forEach((p) => {
      const sbuKey = companyName(p.company_id)
      const fnKey = functionName(p.function_id)
      bySbu[sbuKey] = bySbu[sbuKey] || { total: 0, open: 0, completed: 0, overdue: 0, projects: 0 }
      bySbu[sbuKey].projects++
      byFunction[fnKey] = byFunction[fnKey] || { total: 0, open: 0, completed: 0, overdue: 0, projects: 0 }
      byFunction[fnKey].projects++
    })

    const fmt = (m: Record<string, any>) => Object.entries(m).map(([name, v]) => ({ name, ...v }))
    return { bySbu: fmt(bySbu), byFunction: fmt(byFunction), byDepartment: fmt(byDepartment) }
  },

  // audit / notifications
  audit: () => db.audit,
  notifications: (userId?: number) => userId ? db.notifications.filter((n) => n.user_id === userId) : db.notifications,
  markRead: (id: number) => { const n = db.notifications.find((x) => x.id === id)!; n.is_read = true; persist(); return n },
  scanEscalations: () => {
    const events: any[] = []
    const t0 = today()
    db.tasks.filter((t) => !(t as any).is_deleted && OPEN_STATUSES.includes(t.status)).forEach((t) => {
      const due = t.approved_due_date || t.baseline_due_date
      if (!due) return
      const delta = Math.round((new Date(due).getTime() - new Date(t0).getTime()) / 86400000)
      let title: string | null = null
      let kind = 'info'
      if (delta < 0) {
        const od = Math.abs(delta)
        if (od >= 7 || t.priority === 'critical') { title = `Executive escalation: ${t.code}`; kind = 'escalation' }
        else if (od >= 5) { title = `PM/Business Head escalation: ${t.code}`; kind = 'escalation' }
        else if (od >= 3) { title = `Functional Head escalation: ${t.code}`; kind = 'warning' }
        else { title = `Delay RCA required: ${t.code}`; kind = 'warning' }
      } else if (delta === 0) { title = `Due today: ${t.code}`; kind = 'reminder' }
      else if (delta === 1) { title = `Due tomorrow: ${t.code}`; kind = 'reminder' }
      else if (delta <= 3) { title = `Due in ${delta} days: ${t.code}`; kind = 'reminder' }
      if (title) {
        ;[t.accountable_id, t.responsible_id].forEach((uid) => {
          if (uid) db.notifications.unshift({ id: nextId(db), user_id: uid, title, body: `'${t.title}' — ${kind}`, kind, is_read: false, created_at: new Date().toISOString() })
        })
        events.push({ task_id: t.id, code: t.code, kind, title })
      }
    })
    persist(); return events
  },

  reset: () => {
    try { localStorage.removeItem(KEY) } catch { /* storage blocked */ }
    db = seed()
    persist()
  },
}