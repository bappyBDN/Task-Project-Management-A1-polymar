"""Core database entities for the Anwar Group Enterprise Task & Project Management System."""

from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


# ---------------------------------------------------------------- Organization
class Company(Base, TimestampMixin):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Function(Base, TimestampMixin):
    __tablename__ = "functions"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)


class Department(Base, TimestampMixin):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    function_id: Mapped[Optional[int]] = mapped_column(ForeignKey("functions.id"), nullable=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    designation: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("companies.id"), nullable=True)
    function_id: Mapped[Optional[int]] = mapped_column(ForeignKey("functions.id"), nullable=True)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="employee")  # group_executive, business_head, functional_head, sponsor, pmo, pm, team_lead, employee, reviewer, auditor, admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # --- নতুন ফিল্ডগুলো যোগ করুন ---
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reset_token: Mapped[Optional[str]] = mapped_column(String(128), unique=True, index=True, nullable=True)
    reset_token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # --- User Mapping (organizational reporting line) ---
    # Self-referencing: whoever this points to is this user's manager.
    # Because it's self-referencing, this ONE column already supports every
    # level of the hierarchy (employee -> team lead -> manager -> ... -> CEO)
    # with no extra tables — future levels just chain through more rows.
    reports_to_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)


# ---------------------------------------------------------------- Program/Project
class Program(Base, TimestampMixin):
    __tablename__ = "programs"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("companies.id"), nullable=True)


class Project(Base, TimestampMixin):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(240), index=True)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("companies.id"), nullable=True)
    function_id: Mapped[Optional[int]] = mapped_column(ForeignKey("functions.id"), nullable=True)
    program_id: Mapped[Optional[int]] = mapped_column(ForeignKey("programs.id"), nullable=True)
    sponsor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    manager_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    strategic_objective: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    objective: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_outcome: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project_type: Mapped[str] = mapped_column(String(32), default="operational")
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    methodology: Mapped[str] = mapped_column(String(24), default="hybrid")
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    baseline_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    approved_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    forecast_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completion_pct: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(24), default="planning")  # not_started, planning, active, on_hold, completed, closed, cancelled
    health: Mapped[str] = mapped_column(String(16), default="green")  # green, amber, red, black
    budget: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    criticality: Mapped[str] = mapped_column(String(16), default="medium")


class Milestone(Base, TimestampMixin):
    __tablename__ = "milestones"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="not_started")
    completion_pct: Mapped[float] = mapped_column(Float, default=0.0)


# ---------------------------------------------------------------- RACI
class RaciEntry(Base, TimestampMixin):
    __tablename__ = "raci"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tasks.id"), nullable=True, index=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    raci_type: Mapped[str] = mapped_column(String(16))  # R/A/C/I
    __table_args__ = (
        UniqueConstraint("task_id", "project_id", "user_id", "raci_type", name="uq_raci_assign"),
    )


# ---------------------------------------------------------------- Tasks
class Task(Base, TimestampMixin):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    milestone_id: Mapped[Optional[int]] = mapped_column(ForeignKey("milestones.id"), nullable=True)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("companies.id"), nullable=True)
    function_id: Mapped[Optional[int]] = mapped_column(ForeignKey("functions.id"), nullable=True)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(240), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_deliverable: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(40), default="operational")
    task_type: Mapped[str] = mapped_column(String(32), default="task")
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    responsible_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    accountable_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    planned_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    baseline_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    approved_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    forecast_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    progress_pct: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(24), default="backlog")  # draft, backlog, ready, in_progress, in_review, completed, closed, blocked, on_hold, cancelled
    health: Mapped[str] = mapped_column(String(16), default="green")
    blocker: Mapped[bool] = mapped_column(Boolean, default=False)
    blocker_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acceptance_criteria: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completion_evidence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completion_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)


class TaskDependency(Base, TimestampMixin):
    __tablename__ = "task_dependencies"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    depends_on_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    dependency_type: Mapped[str] = mapped_column(String(24), default="finish_to_start")


class ProgressUpdate(Base, TimestampMixin):
    __tablename__ = "progress_updates"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    progress_pct: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    blocker: Mapped[bool] = mapped_column(Boolean, default=False)
    blocker_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    forecast_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    support_required: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


# ---------------------------------------------------------------- Delay / RCA
class DelayRca(Base, TimestampMixin):
    __tablename__ = "delay_rca"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    delay_category: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    delay_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    root_cause: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=True)
    dependency_related: Mapped[bool] = mapped_column(Boolean, default=False)
    responsible_party: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    business_impact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    schedule_impact_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recovery_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recovery_owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    revised_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    support_required: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    management_intervention: Mapped[bool] = mapped_column(Boolean, default=False)
    preventive_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approval_status: Mapped[str] = mapped_column(String(24), default="pending")  # pending, approved, rejected


# ---------------------------------------------------------------- Backlog
class BacklogItem(Base, TimestampMixin):
    __tablename__ = "backlog_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    requirement: Mapped[str] = mapped_column(String(240))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    business_value: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    complexity: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    estimated_effort: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    requested_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    target_milestone_id: Mapped[Optional[int]] = mapped_column(ForeignKey("milestones.id"), nullable=True)
    acceptance_criteria: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="new")  # new, review, grooming, prioritized, ready, planned, converted
    converted_task_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tasks.id"), nullable=True)


# ---------------------------------------------------------------- Approvals
class Approval(Base, TimestampMixin):
    __tablename__ = "approvals"
    id: Mapped[int] = mapped_column(primary_key=True)
    approval_type: Mapped[str] = mapped_column(String(40))  # completion, revised_date, project_approval
    entity_type: Mapped[str] = mapped_column(String(32))  # task, project
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    requested_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    approver_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="pending")  # pending, approved, rejected
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ---------------------------------------------------------------- Decisions / Meetings / Actions
class Meeting(Base, TimestampMixin):
    __tablename__ = "meetings"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(240))
    meeting_type: Mapped[str] = mapped_column(String(40), default="operational_review")
    meeting_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class Decision(Base, TimestampMixin):
    __tablename__ = "decisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    meeting_id: Mapped[Optional[int]] = mapped_column(ForeignKey("meetings.id"), nullable=True)
    statement: Mapped[str] = mapped_column(Text)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)
    decision_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="open")


class ManagementAction(Base, TimestampMixin):
    __tablename__ = "management_actions"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    meeting_id: Mapped[Optional[int]] = mapped_column(ForeignKey("meetings.id"), nullable=True)
    decision_id: Mapped[Optional[int]] = mapped_column(ForeignKey("decisions.id"), nullable=True)
    action: Mapped[str] = mapped_column(Text)
    responsible_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    accountable_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="open")
    evidence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    converted_task_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tasks.id"), nullable=True)


# ---------------------------------------------------------------- Risks / Issues
class Risk(Base, TimestampMixin):
    __tablename__ = "risks"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    likelihood: Mapped[str] = mapped_column(String(16), default="medium")
    impact: Mapped[str] = mapped_column(String(16), default="medium")
    mitigation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="open")


class Issue(Base, TimestampMixin):
    __tablename__ = "issues"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    resolution: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="open")


# ---------------------------------------------------------------- Notifications / Audit
class ListOption(Base, TimestampMixin):
    """Master-data list options (category, task_type, priority, status, delay_category, etc.)."""
    __tablename__ = "list_options"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)  # category / task_type / priority / status
    value: Mapped[str] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


    __table_args__ = (
        UniqueConstraint("kind", "value", name="uq_list_options_kind_value"),
    )


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(240))
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(String(40), default="info")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    previous_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    happened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------- Email automation
class EmailLog(Base):
    """Tracks which automated emails have already gone out, so the scheduler
    never sends the same notification twice on the same day."""
    __tablename__ = "email_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32))  # task / backlog
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    email_type: Mapped[str] = mapped_column(String(40))   # completed / overdue / due_0 / due_1 ... / stale
    sent_date: Mapped[date] = mapped_column(Date, default=date.today)
    recipients: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "email_type", "sent_date", name="uq_email_once_per_day"),
    )