export const STATUS_COLORS: Record<string, string> = {
  draft: 'gray', backlog: 'gray', ready: 'gold', in_progress: 'amber',
  in_review: 'gold', completed: 'green', closed: 'green', blocked: 'red',
  on_hold: 'gray', cancelled: 'gray',
}

export const HEALTH_COLORS: Record<string, string> = {
  green: 'green', amber: 'amber', red: 'red', black: 'black',
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'gray', medium: 'gold', high: 'amber', critical: 'red',
}

export const CATEGORIES = [
  'strategic', 'project', 'operational', 'management_action', 'compliance',
  'audit', 'digital_transformation', 'process_improvement', 'technology',
  'finance', 'procurement', 'hr', 'sales', 'marketing', 'supply_chain',
  'manufacturing', 'maintenance', 'commercial', 'legal', 'administration',
  'risk', 'sustainability', 'other',
]

export const TASK_TYPES = [
  'task', 'subtask', 'action', 'issue', 'change', 'bug', 'approval',
  'review', 'decision_followup', 'compliance_action',
]

export const TASK_STATUSES = [
  'draft', 'backlog', 'ready', 'in_progress', 'in_review', 'completed',
  'closed', 'blocked', 'on_hold', 'cancelled',
]

export const PROJECT_STATUSES = [
  'not_started', 'planning', 'active', 'on_hold', 'completed', 'closed', 'cancelled',
]

export const DELAY_CATEGORIES = [
  'resource_constraint', 'dependency_delay', 'approval_pending', 'decision_pending',
  'management_dependency', 'requirement_change', 'scope_change', 'vendor_delay',
  'procurement_delay', 'financial_approval', 'technical_issue', 'data_availability',
  'system_issue', 'customer_dependency', 'regulatory_issue', 'external_issue',
  'planning_failure', 'other',
]

export const METHODOLOGIES = ['agile', 'waterfall', 'hybrid', 'kanban', 'operational']

export function label(s?: string | null): string {
  if (s === undefined || s === null) return '—'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function fmtDate(d?: string): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtNum(n?: number): string {
  if (n === undefined || n === null) return '—'
  return n.toLocaleString('en-US')
}
