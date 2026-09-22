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
  created_at: string
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
}