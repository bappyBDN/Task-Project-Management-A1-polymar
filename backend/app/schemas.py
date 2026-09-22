"""Pydantic schemas for request/response validation."""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic import BaseModel, EmailStr


# ---------------------------------------------------------------- Organization
class CompanyBase(BaseModel):
    name: str
    code: str
    is_active: bool = True


class CompanyOut(CompanyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class FunctionBase(BaseModel):
    name: str
    code: str


class FunctionOut(FunctionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class DepartmentBase(BaseModel):
    name: str
    function_id: Optional[int] = None


class DepartmentOut(DepartmentBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class UserBase(BaseModel):
    employee_id: str
    name: str
    email: str
    designation: Optional[str] = None
    company_id: Optional[int] = None
    function_id: Optional[int] = None
    department_id: Optional[int] = None
    role: str = "employee"
    reports_to_id: Optional[int] = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class UserMappingOut(BaseModel):
    """One row of the simple User Mapping master-data table.
    Flat by design — each row shows only the immediate manager (reports_to_name).
    Because reports_to_id chains user-to-user, the full top-to-bottom hierarchy
    can always be derived later (e.g. a tree/org-chart view) without changing
    this table — that's the extension point for the future."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: str
    name: str
    email: str
    designation: Optional[str] = None
    role: str
    reports_to_id: Optional[int] = None
    reports_to_name: Optional[str] = None
    is_active: bool


# ---------------------------------------------------------------- Project
class ProjectBase(BaseModel):
    code: Optional[str] = None
    name: str
    company_id: Optional[int] = None
    function_id: Optional[int] = None
    program_id: Optional[int] = None
    sponsor_id: Optional[int] = None
    manager_id: Optional[int] = None
    owner_id: Optional[int] = None
    strategic_objective: Optional[str] = None
    objective: Optional[str] = None
    expected_outcome: Optional[str] = None
    project_type: str = "operational"
    priority: str = "medium"
    methodology: str = "hybrid"
    start_date: Optional[date] = None
    baseline_due_date: Optional[date] = None
    approved_due_date: Optional[date] = None
    forecast_due_date: Optional[date] = None
    completion_pct: float = 0.0
    status: str = "planning"
    health: str = "green"
    budget: Optional[float] = None
    criticality: str = "medium"


class ProjectUpdate(BaseModel):
    """PATCH payload: every field optional."""
    code: Optional[str] = None
    name: Optional[str] = None
    company_id: Optional[int] = None
    function_id: Optional[int] = None
    program_id: Optional[int] = None
    sponsor_id: Optional[int] = None
    manager_id: Optional[int] = None
    owner_id: Optional[int] = None
    strategic_objective: Optional[str] = None
    objective: Optional[str] = None
    expected_outcome: Optional[str] = None
    project_type: Optional[str] = None
    priority: Optional[str] = None
    methodology: Optional[str] = None
    start_date: Optional[date] = None
    baseline_due_date: Optional[date] = None
    approved_due_date: Optional[date] = None
    forecast_due_date: Optional[date] = None
    completion_pct: Optional[float] = None
    status: Optional[str] = None
    health: Optional[str] = None
    budget: Optional[float] = None
    criticality: Optional[str] = None


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class MilestoneBase(BaseModel):
    project_id: int
    name: str
    due_date: Optional[date] = None
    status: str = "not_started"
    completion_pct: float = 0.0


class MilestoneOut(MilestoneBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------------------------------------------------------------- Task
class TaskBase(BaseModel):
    code: Optional[str] = None
    parent_id: Optional[int] = None
    project_id: Optional[int] = None
    milestone_id: Optional[int] = None
    company_id: Optional[int] = None
    function_id: Optional[int] = None
    department_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    expected_deliverable: Optional[str] = None
    category: str = "operational"
    task_type: str = "task"
    priority: str = "medium"
    responsible_id: Optional[int] = None
    accountable_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    planned_start_date: Optional[date] = None
    baseline_due_date: Optional[date] = None
    approved_due_date: Optional[date] = None
    forecast_due_date: Optional[date] = None
    progress_pct: float = 0.0
    status: str = "backlog"
    health: str = "green"
    blocker: bool = False
    blocker_details: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    completion_evidence: Optional[str] = None
    completion_remarks: Optional[str] = None


class TaskUpdate(BaseModel):
    """PATCH payload: every field optional, so a partial update (e.g. only `status`) is valid."""
    code: Optional[str] = None
    parent_id: Optional[int] = None
    project_id: Optional[int] = None
    milestone_id: Optional[int] = None
    company_id: Optional[int] = None
    function_id: Optional[int] = None
    department_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    expected_deliverable: Optional[str] = None
    category: Optional[str] = None
    task_type: Optional[str] = None
    priority: Optional[str] = None
    responsible_id: Optional[int] = None
    accountable_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    planned_start_date: Optional[date] = None
    baseline_due_date: Optional[date] = None
    approved_due_date: Optional[date] = None
    forecast_due_date: Optional[date] = None
    progress_pct: Optional[float] = None
    status: Optional[str] = None
    health: Optional[str] = None
    blocker: Optional[bool] = None
    blocker_details: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    completion_evidence: Optional[str] = None
    completion_remarks: Optional[str] = None


class TaskOut(TaskBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    actual_due_date: Optional[date] = None
    created_at: datetime


class ProgressUpdateBase(BaseModel):
    task_id: int
    progress_pct: float = 0.0
    status: Optional[str] = None
    remarks: Optional[str] = None
    blocker: bool = False
    blocker_details: Optional[str] = None
    next_action: Optional[str] = None
    forecast_due_date: Optional[date] = None
    support_required: Optional[str] = None


class ProgressUpdateOut(ProgressUpdateBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ---------------------------------------------------------------- Delay / RCA
class DelayRcaBase(BaseModel):
    task_id: int
    delay_category: Optional[str] = None
    delay_reason: Optional[str] = None
    root_cause: Optional[str] = None
    is_internal: bool = True
    dependency_related: bool = False
    responsible_party: Optional[str] = None
    business_impact: Optional[str] = None
    schedule_impact_days: Optional[int] = None
    recovery_action: Optional[str] = None
    recovery_owner_id: Optional[int] = None
    revised_due_date: Optional[date] = None
    support_required: Optional[str] = None
    management_intervention: bool = False
    preventive_action: Optional[str] = None
    approval_status: str = "pending"


class DelayRcaOut(DelayRcaBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ---------------------------------------------------------------- Approval
class ApprovalBase(BaseModel):
    approval_type: str
    entity_type: str
    entity_id: int
    requested_by_id: Optional[int] = None
    approver_id: Optional[int] = None
    reason: Optional[str] = None


class ApprovalOut(ApprovalBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    decided_at: Optional[datetime] = None
    created_at: datetime


class ApprovalDecision(BaseModel):
    status: str  # approved / rejected
    reason: Optional[str] = None


# ---------------------------------------------------------------- Backlog
class BacklogBase(BaseModel):
    code: str
    project_id: Optional[int] = None
    requirement: str
    description: Optional[str] = None
    business_value: Optional[str] = None
    priority: str = "medium"
    complexity: Optional[str] = None
    estimated_effort: Optional[float] = None
    requested_by_id: Optional[int] = None
    target_milestone_id: Optional[int] = None
    acceptance_criteria: Optional[str] = None
    status: str = "new"


class BacklogOut(BacklogBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    converted_task_id: Optional[int] = None


# ---------------------------------------------------------------- Governance
class MeetingBase(BaseModel):
    title: str
    meeting_type: str = "operational_review"
    meeting_date: Optional[date] = None


class MeetingOut(MeetingBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class DecisionBase(BaseModel):
    code: Optional[str] = None
    meeting_id: Optional[int] = None
    statement: str
    owner_id: Optional[int] = None
    project_id: Optional[int] = None
    decision_date: Optional[date] = None
    status: str = "open"


class DecisionOut(DecisionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ManagementActionBase(BaseModel):
    code: Optional[str] = None
    meeting_id: Optional[int] = None
    decision_id: Optional[int] = None
    action: str
    responsible_id: Optional[int] = None
    accountable_id: Optional[int] = None
    due_date: Optional[date] = None
    status: str = "open"
    evidence: Optional[str] = None


class ManagementActionOut(ManagementActionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    converted_task_id: Optional[int] = None


class RiskBase(BaseModel):
    project_id: Optional[int] = None
    description: str
    category: Optional[str] = None
    likelihood: str = "medium"
    impact: str = "medium"
    mitigation: Optional[str] = None
    owner_id: Optional[int] = None
    status: str = "open"


class RiskOut(RiskBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class IssueBase(BaseModel):
    project_id: Optional[int] = None
    description: str
    category: Optional[str] = None
    severity: str = "medium"
    resolution: Optional[str] = None
    owner_id: Optional[int] = None
    status: str = "open"


class IssueOut(IssueBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class RaciEntryBase(BaseModel):
    task_id: Optional[int] = None
    project_id: Optional[int] = None
    user_id: int
    raci_type: str


class RaciEntryOut(RaciEntryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    title: str
    body: Optional[str] = None
    kind: str
    is_read: bool
    created_at: datetime


# ---------------------------------------------------------------- Dashboards
class TaskKpiOut(BaseModel):
    total: int
    open: int
    completed: int
    overdue: int
    critical: int
    blocked: int
    due_today: int
    completion_pct: float
    on_time_pct: float


class ProjectKpiOut(BaseModel):
    total: int
    active: int
    green: int
    amber: int
    red: int
    black: int
    forecast_miss: int

#---------------------------------------Login------------------------
class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict