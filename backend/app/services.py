"""Shared helpers: audit logging, notifications, health calculation."""
import re
from datetime import date
from typing import Optional
from typing import List, Optional, Set

from sqlalchemy.orm import Session

from app import models


def audit(db: Session, actor: Optional[str], entity_type: str, entity_id: Optional[int],
          action: str, previous_value: Optional[str] = None, new_value: Optional[str] = None,
          reason: Optional[str] = None):
    db.add(models.AuditLog(
        actor=actor, entity_type=entity_type, entity_id=entity_id, action=action,
        previous_value=previous_value, new_value=new_value, reason=reason,
    ))


def notify(db: Session, user_id: Optional[int], title: str, body: Optional[str] = None, kind: str = "info"):
    if user_id is None:
        return
    db.add(models.Notification(user_id=user_id, title=title, body=body, kind=kind))


def compute_task_health(status: str, progress_pct: float, due: Optional[date],
                        blocker: bool, today: Optional[date] = None) -> str:
    today = today or date.today()
    if status in ("completed", "closed", "cancelled"):
        return "green"
    if blocker:
        return "red"
    if due is not None:
        if due < today:
            return "red"
        days_left = (due - today).days
        if days_left <= 1:
            return "amber" if progress_pct >= 50 else "red"
    return "green"


def compute_project_health(tasks: list[models.Task]) -> str:
    if not tasks:
        return "green"
    if any(t.health == "black" for t in tasks):
        return "black"
    if any(t.health == "red" for t in tasks):
        return "red"
    if any(t.health == "amber" for t in tasks):
        return "amber"
    return "green"


def recalc_project_health(db: Session, project_id: int):
    tasks = db.query(models.Task).filter(
        models.Task.project_id == project_id, models.Task.is_deleted.is_(False)
    ).all()
    health = compute_project_health(tasks)
    project = db.get(models.Project, project_id)
    if project:
        project.health = health
        # completion % from tasks
        if tasks:
            project.completion_pct = round(sum(t.progress_pct for t in tasks) / len(tasks), 1)


def recalc_task_health(db: Session, task: models.Task):
    task.health = compute_task_health(task.status, task.progress_pct,
                                      task.approved_due_date or task.baseline_due_date, task.blocker)


def next_code(prefix: str, db: Session, model) -> str:
    """Generate the next sequential business id like PRJ-0001.

    Uses the highest existing number + 1 — NOT the row count. Counting rows breaks
    as soon as any record is hard-deleted (count drops, the generated code already
    exists, and every insert fails with UNIQUE constraint on `code`).
    """
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    highest = 0
    for (code,) in db.query(model.code).filter(model.code.like(f"{prefix}-%")).all():
        m = pattern.match(code or "")
        if m:
            highest = max(highest, int(m.group(1)))
    return f"{prefix}-{highest + 1:04d}"


DONE_STATUSES = ("completed", "closed")


def apply_completion_rules(task: models.Task):
    """Keep completion data consistent with status.

    completed / closed -> progress 100 % and `actual_due_date` (used as "Completed on"
    in the completion email) stamped with today if not already set.
    Any other status  -> a previously stamped completion date is cleared (task re-opened).
    """
    if task.status in DONE_STATUSES:
        task.progress_pct = 100.0
        if task.actual_due_date is None:
            task.actual_due_date = date.today()
    elif task.actual_due_date is not None and task.status != "cancelled":
        task.actual_due_date = None


def scan_escalations(db: Session) -> list[dict]:
    """Review open tasks against the escalation matrix and emit notifications.

    Returns a list of escalation events for the response.
    """
    today = date.today()
    open_statuses = ["backlog", "ready", "in_progress", "in_review", "blocked", "on_hold"]
    tasks = db.query(models.Task).filter(
        models.Task.is_deleted.is_(False),
        models.Task.status.in_(open_statuses),
    ).all()

    events: list[dict] = []
    for t in tasks:
        due = t.approved_due_date or t.baseline_due_date
        if due is None:
            continue
        delta = (due - today).days  # negative = overdue
        title = None
        body = None
        kind = "info"
        recipients: list[int] = []
        for uid in (t.accountable_id, t.responsible_id):
            if uid:
                recipients.append(uid)

        if delta < 0:
            days_overdue = abs(delta)
            if days_overdue >= 7 or t.priority == "critical":
                title = f"Executive escalation: {t.code}"
                body = f"'{t.title}' is {days_overdue} days overdue."
                kind = "escalation"
            elif days_overdue >= 5:
                title = f"PM / Business Head escalation: {t.code}"
                body = f"'{t.title}' is {days_overdue} days overdue."
                kind = "escalation"
            elif days_overdue >= 3:
                title = f"Functional Head escalation: {t.code}"
                body = f"'{t.title}' is {days_overdue} days overdue."
                kind = "warning"
            else:
                title = f"Delay RCA required: {t.code}"
                body = f"'{t.title}' is {days_overdue} day(s) overdue."
                kind = "warning"
        elif delta == 0:
            title = f"Due today: {t.code}"
            body = f"'{t.title}' is due today."
            kind = "reminder"
        elif delta == 1:
            title = f"Due tomorrow: {t.code}"
            body = f"'{t.title}' is due tomorrow."
            kind = "reminder"
        elif delta <= 3:
            title = f"Due in {delta} days: {t.code}"
            body = f"'{t.title}' is due in {delta} days."
            kind = "reminder"

        if title:
            for uid in recipients:
                db.add(models.Notification(user_id=uid, title=title, body=body, kind=kind))
            events.append({"task_id": t.id, "code": t.code, "kind": kind, "title": title})

    db.commit()
    return events

# ==========================================
# Hierarchical Notification & Approval Helpers
# ==========================================

def get_hierarchical_stakeholders(db: Session, task: models.Task) -> List[int]:
    """
    Finds and returns unique user IDs for ONLY:
    1. Accountable user (task.accountable_id)
    2. Reviewer user (task.reviewer_id)
    3. Line Managers of Accountable & Responsible users (reports_to_id)
    """
    stakeholder_ids: Set[int] = set()

    if task.accountable_id:
        stakeholder_ids.add(task.accountable_id)
    if task.reviewer_id:
        stakeholder_ids.add(task.reviewer_id)

    for uid in [task.responsible_id, task.accountable_id]:
        if uid:
            user = db.get(models.User, uid)
            if user and user.reports_to_id:
                stakeholder_ids.add(user.reports_to_id)

    return list(stakeholder_ids)


def create_in_page_notifications(
    db: Session,
    task: models.Task,
    title: str,
    body: Optional[str] = None,
    kind: str = "action"
) -> int:
    """Creates in-page notifications for hierarchical stakeholders strictly."""
    recipient_ids = get_hierarchical_stakeholders(db, task)
    created_count = 0

    for user_id in recipient_ids:
        notification = models.Notification(
            user_id=user_id,
            title=title,
            body=body,
            kind=kind,
            is_read=False
        )
        db.add(notification)
        created_count += 1

    db.commit()
    return created_count


def resolve_approver_id(db: Session, task: models.Task, requester_id: int) -> int:
    """Resolves approver based on Reviewer -> Accountable -> Line Manager priority."""
    if task.reviewer_id and task.reviewer_id != requester_id:
        return task.reviewer_id

    if task.accountable_id and task.accountable_id != requester_id:
        return task.accountable_id

    requester = db.get(models.User, requester_id)
    if requester and requester.reports_to_id:
        return requester.reports_to_id

    return requester_id


def create_hierarchical_approval(
    db: Session,
    task: models.Task,
    approval_type: str,
    requested_by_id: int,
    reason: Optional[str] = None
) -> models.Approval:
    """Creates an Approval entry assigned to the correct hierarchical authority."""
    approver_id = resolve_approver_id(db, task, requested_by_id)

    approval = models.Approval(
        approval_type=approval_type,
        entity_type="task",
        entity_id=task.id,
        requested_by_id=requested_by_id,
        approver_id=approver_id,
        status="pending",
        reason=reason
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)

    # Approver-এর জন্য ইন-পেজ নোটিফিকেশন তৈরি
    db.add(models.Notification(
        user_id=approver_id,
        title=f"Approval Needed: {task.title}",
        body=f"Approval request ({approval_type}) submitted. Reason: {reason or 'N/A'}",
        kind="approval",
        is_read=False
    ))
    db.commit()

    return approval

# ---------------------------------------------------------------- sign-up helpers

def _same(a: str | None, b: str | None) -> bool:
    """Names match ignoring case and extra spaces ("IT  support" == "it support")."""
    return " ".join((a or "").split()).lower() == " ".join((b or "").split()).lower()


def function_for_name(db: Session, name: str) -> models.Function:
    """The function with this name, created if there is none yet (never a second copy)."""
    name = " ".join(name.split())
    existing = db.query(models.Function).order_by(models.Function.id).all()
    for f in existing:
        if _same(f.name, name):
            return f
    base = "".join(w[0] for w in name.replace("-", " ").split() if w[0].isalnum()).upper()[:10] or "FN"
    taken = {(f.code or "").upper() for f in existing}
    code, n = base, 2
    while code in taken:
        code, n = f"{base}{n}", n + 1
    fn = models.Function(name=name, code=code)
    db.add(fn)
    db.flush()
    return fn


def department_for_name(db: Session, name: str, function_id: Optional[int]) -> models.Department:
    """The department with this name, created (under `function_id`) if there is none yet."""
    name = " ".join(name.split())
    for d in db.query(models.Department).order_by(models.Department.id).all():
        if _same(d.name, name):
            return d
    dep = models.Department(name=name, function_id=function_id)
    db.add(dep)
    db.flush()
    return dep


def link_waiting_reports(db: Session, manager: models.User) -> int:
    """People who named this Employee ID as their manager before the manager had an
    account now report to `manager`. Someone whose manager an admin has meanwhile
    set is left as is (only the waiting note is cleared). Returns how many were linked."""
    emp = (manager.employee_id or "").strip().lower()
    if not emp:
        return 0
    linked = 0
    waiting = db.query(models.User).filter(
        models.User.pending_manager_employee_id.isnot(None), models.User.id != manager.id).all()
    for u in waiting:
        if (u.pending_manager_employee_id or "").strip().lower() != emp:
            continue
        if u.reports_to_id is None:
            u.reports_to_id = manager.id
            linked += 1
        u.pending_manager_employee_id = None
    return linked
