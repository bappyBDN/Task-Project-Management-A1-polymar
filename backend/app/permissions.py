"""Who may edit which task / project fields.

Uses only existing columns (tasks.responsible_id / accountable_id / reviewer_id,
projects.manager_id / owner_id) and the existing privileged-role list stored in
list_options (kind='privileged_role'). Read-only: nothing here writes to the DB.

Tasks
  admin / privileged role -> every field
  Accountable             -> task details + progress (not Accountable, Reviewer,
                             approved due date, a baseline date already set, code)
  Responsible             -> the same, except they can't reassign the Responsible person
  Reviewer / anyone else  -> no edits (the Reviewer approves; editing would mean
                             approving their own changes)
  Nobody but admin / privileged sets a task to completed/closed directly:
  that goes through "Submit for Completion" -> approval.

Projects
  admin / privileged role -> every field
  Manager / Owner         -> project details (not manager / owner / sponsor or dates)
  anyone else             -> no edits
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models

ADMIN_ROLE = "admin"
DEFAULT_PRIVILEGED = ("admin", "group_executive", "pmo")  # same fallback as routers/privileged.py
DONE_STATUSES = ("completed", "closed")

# Recomputed by the server on every save, so a client echoing them back is harmless.
_ALWAYS_IGNORED = {"health"}

TASK_PROGRESS_FIELDS = {
    "status", "progress_pct", "blocker", "blocker_details", "forecast_due_date",
    "completion_evidence", "completion_remarks",
}
TASK_ACCOUNTABLE_FIELDS = TASK_PROGRESS_FIELDS | {
    "title", "description", "expected_deliverable", "category", "task_type", "priority",
    "responsible_id", "planned_start_date", "acceptance_criteria",
    "project_id", "milestone_id", "parent_id", "company_id", "function_id", "department_id",
}
TASK_RESPONSIBLE_FIELDS = TASK_ACCOUNTABLE_FIELDS - {"responsible_id"}

PROJECT_MANAGER_FIELDS = {
    "name", "company_id", "function_id", "program_id", "strategic_objective", "objective",
    "expected_outcome", "project_type", "priority", "methodology", "status",
    "completion_pct", "forecast_due_date", "budget", "criticality",
}


def is_privileged(db: Session, user: models.User) -> bool:
    if user.role == ADMIN_ROLE:
        return True
    rows = db.query(models.ListOption.value).filter(
        models.ListOption.kind == "privileged_role",
        models.ListOption.is_active.is_(True),
    ).all()
    roles = {r[0] for r in rows} or set(DEFAULT_PRIVILEGED)
    return user.role in roles


def _changed(obj, data: dict) -> set:
    """Fields whose value really differs from what is stored (clients often resend the whole object)."""
    out = set()
    for k, v in data.items():
        if k in _ALWAYS_IGNORED:
            continue
        cur = getattr(obj, k, None)
        if isinstance(cur, (int, float)) and isinstance(v, (int, float)) and not isinstance(cur, bool):
            if float(cur) == float(v):
                continue
        elif cur == v:
            continue
        out.add(k)
    return out


def _deny(fields: set, who: str):
    names = ", ".join(sorted(f.replace("_id", "").replace("_", " ") for f in fields))
    raise HTTPException(403, f"As {who} you can't change: {names}. Ask an admin or PMO.")


def check_task_edit(db: Session, user: models.User, task: models.Task, data: dict) -> dict:
    """Raise 403 if `user` may not make these changes. Returns the data to apply
    (for non-privileged users, server-computed fields like health are dropped)."""
    if is_privileged(db, user):
        return data
    data = {k: v for k, v in data.items() if k not in _ALWAYS_IGNORED}
    changed = _changed(task, data)
    if not changed:
        return data

    if user.id == task.accountable_id:
        allowed, who = set(TASK_ACCOUNTABLE_FIELDS), "Accountable"
    elif user.id == task.responsible_id:
        allowed, who = set(TASK_RESPONSIBLE_FIELDS), "Responsible"
    else:
        raise HTTPException(403, "Only the task's Responsible or Accountable person (or an admin / PMO) can edit this task.")

    if task.baseline_due_date is None:
        allowed.add("baseline_due_date")  # first time a due date is set
    blocked = changed - allowed
    if blocked:
        _deny(blocked, who)
    if "status" in changed and data.get("status") in DONE_STATUSES:
        raise HTTPException(403, "To complete a task, use \"Submit for Completion\" - it is completed when the approval is accepted.")
    return data


def check_task_progress(db: Session, user: models.User, task: models.Task, new_status: str | None):
    if is_privileged(db, user):
        return
    if user.id not in (task.responsible_id, task.accountable_id):
        raise HTTPException(403, "Only the task's Responsible or Accountable person (or an admin / PMO) can update progress.")
    if new_status in DONE_STATUSES and new_status != task.status:
        raise HTTPException(403, "To complete a task, use \"Submit for Completion\" - it is completed when the approval is accepted.")


def check_task_delete(db: Session, user: models.User, task: models.Task):
    if is_privileged(db, user) or user.id == task.accountable_id:
        return
    raise HTTPException(403, "Only the task's Accountable person (or an admin / PMO) can delete this task.")


def can_edit_project(db: Session, user: models.User, project: models.Project) -> bool:
    return is_privileged(db, user) or user.id in (project.manager_id, project.owner_id)


def check_project_edit(db: Session, user: models.User, project: models.Project, data: dict) -> dict:
    if is_privileged(db, user):
        return data
    data = {k: v for k, v in data.items() if k not in _ALWAYS_IGNORED}
    if user.id not in (project.manager_id, project.owner_id):
        raise HTTPException(403, "Only the project's Manager or Owner (or an admin / PMO) can edit this project.")
    blocked = _changed(project, data) - PROJECT_MANAGER_FIELDS
    if blocked:
        _deny(blocked, "Project Manager / Owner")
    return data
