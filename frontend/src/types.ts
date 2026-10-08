export interface Company {
  id: number
  name: string
  code: string
  is_active: boolean
}

export interface Function {
  id: number
  name: string
  code: string
}

export interface Department {
  id: number
  name: string
  function_id?: number
}

export interface User {
  id: number
  employee_id: string
  name: string
  email: string
  designation?: string
  company_id?: number
  function_id?: number
  department_id?: number
  role: string
  reports_to_id?: number | null
  /** named a manager by Employee ID at sign-up who has no account yet */
  pending_manager_employee_id?: string | null
  /** COO only: the SBUs (company ids) they oversee, set by an admin */
  sbu_ids?: number[]
  /** every SBU the person belongs to, the first one first (it is also company_id) */
  company_ids?: number[]
  is_active: boolean
}

export interface Project {
  id: number
  code: string
  name: string
  company_id?: number
  function_id?: number
  program_id?: number
  sponsor_id?: number
  manager_id?: number
  owner_id?: number
  strategic_objective?: string
  objective?: string
  expected_outcome?: string
  project_type: string
  priority: string
  methodology: string
  start_date?: string
  baseline_due_date?: string
  approved_due_date?: string
  forecast_due_date?: string
  actual_due_date?: string
  completion_pct: number
  status: string
  health: string
  budget?: number
  criticality: string
  /** optional Gantt scheduling of this project's tasks (see ProjectGantt) */
  gantt_enabled?: boolean
  /** every SBU of the project, the first one first (it is also company_id) */
  sbu_ids?: number[]
  created_at?: string
  /** name of whoever created the project */
  created_by?: string | null
}

/** One task on a project's Gantt chart: its planned dates and where the schedule puts it. */
export interface GanttTask {
  id: number
  code: string
  title: string
  status: string
  progress_pct: number
  responsible_id?: number | null
  plan_start?: string | null
  plan_finish?: string | null
  start?: string | null
  finish?: string | null
  /** days the finish is past the due date */
  slip_days: number
  cause?: 'overdue' | 'forecast' | 'late_finish' | 'dependency' | null
  /** cause 'dependency': the task it is waiting for */
  driver_id?: number | null
  depends_on: number[]
  critical: boolean
  extends_project: boolean
}

export interface GanttData {
  enabled: boolean
  today?: string
  project?: { start?: string | null; planned_due?: string | null; forecast?: string | null; slip_days: number }
  tasks?: GanttTask[]
}

/** Someone contributing to a project beyond its tasks (see ProjectContribution). */
export interface ProjectAssociate {
  id: number
  project_id: number
  user_id: number
  contribution: string
  added_by_id?: number | null
  created_at?: string
}

/** A comment on a project or task (see CommentsPanel). Names are stored with the comment. */
export interface Comment {
  id: number
  entity_type: 'project' | 'task'
  comment: string
  commenter_id?: number | null
  commenter_name: string
  commenter_employee_id?: string | null
  project_id?: number | null
  project_code?: string | null
  project_name?: string | null
  task_id?: number | null
  task_code?: string | null
  task_name?: string | null
  recipient_id?: number | null
  recipient_name?: string | null
  email_sent: boolean
  created_at?: string
  /** set on a reply: the comment it answers */
  parent_id?: number | null
  /** on a comment: may the current user reply (Project Manager / the task's Responsible or Accountable) */
  can_reply?: boolean
  /** a comment's replies, oldest first (always empty on a reply) */
  replies?: Comment[]
}

export interface Milestone {
  id: number
  project_id: number
  name: string
  due_date?: string
  status: string
  completion_pct: number
}

export interface Task {
  id: number
  code: string
  parent_id?: number
  project_id?: number
  milestone_id?: number
  company_id?: number
  function_id?: number
  department_id?: number
  title: string
  description?: string
  expected_deliverable?: string
  category: string
  task_type: string
  priority: string
  responsible_id?: number
  accountable_id?: number
  reviewer_id?: number
  informed_id?: number
  planned_start_date?: string
  baseline_due_date?: string
  approved_due_date?: string
  forecast_due_date?: string
  actual_due_date?: string
  progress_pct: number
  status: string
  health: string
  blocker: boolean
  blocker_details?: string
  acceptance_criteria?: string
  completion_evidence?: string
  completion_remarks?: string
  /** every SBU of the task, the first one first (it is also company_id) */
  sbu_ids?: number[]
  created_at: string
  /** name of whoever created the task */
  created_by?: string | null
  /** completion already submitted and no progress update since: it can't be submitted again yet */
  completion_submitted?: boolean
}

export interface DelayRca {
  id: number
  task_id: number
  delay_category?: string
  delay_reason?: string
  root_cause?: string
  is_internal: boolean
  dependency_related: boolean
  responsible_party?: string
  business_impact?: string
  schedule_impact_days?: number
  recovery_action?: string
  recovery_owner_id?: number
  revised_due_date?: string
  support_required?: string
  management_intervention: boolean
  preventive_action?: string
  approval_status: string
}

export interface ProgressUpdate {
  id: number
  task_id: number
  progress_pct: number
  status?: string
  remarks?: string
  blocker: boolean
  blocker_details?: string
  next_action?: string
  forecast_due_date?: string
  support_required?: string
  created_at: string
}

export interface Approval {
  id: number
  approval_type: string
  entity_type: string
  entity_id: number
  requested_by_id?: number
  approver_id?: number
  status: string
  reason?: string
  created_at: string
  decided_at?: string
  /** from the server: may the signed-in user approve / reject it? */
  can_decide?: boolean | null
}

export interface TaskKpi {
  total: number
  open: number
  completed: number
  overdue: number
  critical: number
  blocked: number
  due_today: number
  completion_pct: number
  on_time_pct: number
}

export interface ProjectKpi {
  total: number
  active: number
  green: number
  amber: number
  red: number
  black: number
  forecast_miss: number
}

export interface AuditEntry {
  id: number
  actor?: string
  entity_type: string
  entity_id?: number
  action: string
  previous_value?: string
  new_value?: string
  reason?: string
  happened_at: string
}

export interface Meeting {
  id: number
  title: string
  meeting_type: string
  meeting_date?: string
}

export interface Decision {
  id: number
  code: string
  meeting_id?: number
  statement: string
  owner_id?: number
  project_id?: number
  decision_date?: string
  status: string
}

export interface ManagementAction {
  id: number
  code: string
  meeting_id?: number
  decision_id?: number
  action: string
  responsible_id?: number
  accountable_id?: number
  due_date?: string
  status: string
  evidence?: string
  converted_task_id?: number
}

export interface Risk {
  id: number
  project_id?: number
  description: string
  category?: string
  likelihood: string
  impact: string
  mitigation?: string
  owner_id?: number
  status: string
}

export interface Issue {
  id: number
  project_id?: number
  description: string
  category?: string
  severity: string
  resolution?: string
  owner_id?: number
  status: string
}

export interface RaciEntry {
  id: number
  task_id?: number
  project_id?: number
  user_id: number
  raci_type: string
}

export interface RaciMatrix {
  project_id: number | null
  users: { id: number; name: string }[]
  tasks: { id: number; code: string; title: string; project_id?: number }[]
  rows: { task_id: number; code: string; title: string; project_id?: number; cells: { user_id: number; value: string }[] }[]
  gaps: number[]
}

export interface BacklogItem {
  id: number
  code: string
  project_id?: number
  company_id?: number
  function_id?: number
  department_id?: number
  requirement: string
  description?: string
  business_value?: string
  priority: string
  complexity?: string
  estimated_effort?: number
  requested_by_id?: number
  target_milestone_id?: number
  acceptance_criteria?: string
  status: string
  converted_task_id?: number
}

export interface Notification {
  id: number
  user_id: number
  title: string
  body?: string
  kind: string
  is_read: boolean
  created_at: string
  /** where a click leads (/tasks/12, /projects/3, /approvals ...), worked out by the server */
  link?: string | null
  link_label?: string | null
}