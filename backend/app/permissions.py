"""Who may edit which task / project fields.

Uses only existing columns (tasks.responsible_id / accountable_id / reviewer_id /
project_id / is_deleted) and the existing privileged-role list stored in
list_options (kind='privileged_role'). Read-only: nothing here writes to the DB.

A COO (role "coo") counts as admin / privileged for the tasks and projects of the SBUs
they oversee (user_sbus, set by an admin) - and only for those.

Tasks
  admin / privileged role -> every field
  Accountable             -> task details + progress (not Accountable, Reviewer, Informed,
                             approved due date, a baseline date already set, code)
  Responsible             -> the same, plus Accountable, Reviewer and Informed (they own the
                             task's people: Responsible, Accountable, Reviewer, Informed)
  Deleting: Responsible / Accountable / PMO may ask; the project's Manager then deletes it
  permanently or restores it (routers/tasks.py delete_task, routers/approvals.py).
  Reviewer / anyone else  -> no edits (the Reviewer approves; editing would mean
                             approving their own changes)
  Informed                -> no edits (they only see the task and are notified)
  Nobody but admin / privileged sets a task to completed/closed directly:
  that goes through "Submit for Completion" -> approval.

Projects
  admin / privileged role                               -> every field
  Responsible / Accountable on a (live) task of project -> every field
  anyone else                                           -> no edits
"""
from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models

ADMIN_ROLE = "admin"
COO_ROLE = "coo"
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
TASK_RESPONSIBLE_FIELDS = TASK_ACCOUNTABLE_FIELDS | {"accountable_id", "reviewer_id", "informed_id"}

def privileged_roles(db: Session) -> set:
    """Roles that see and edit everything: admin plus the list set in the Admin Panel."""
    rows = db.query(models.ListOption.value).filter(
        models.ListOption.kind == "privileged_role",
        models.ListOption.is_active.is_(True),
    ).all()
    return ({r[0] for r in rows} or set(DEFAULT_PRIVILEGED)) | {ADMIN_ROLE}


def is_privileged(db: Session, user: models.User) -> bool:
    return user.role in privileged_roles(db)


def managed_company_ids(db: Session, user: models.User) -> set:
    """The SBUs a COO oversees (user_sbus, set by an admin), with every copy of the same
    SBU (other spellings) counted. Empty for anyone who is not a COO."""
    if user.role != COO_ROLE:
        return set()
    from app.visibility import sbu_key  # here: visibility imports this module
    assigned = {r[0] for r in db.query(models.UserSbu.company_id).filter(models.UserSbu.user_id == user.id).all()}
    if not assigned:
        return set()
    companies = db.query(models.Company.id, models.Company.name).all()
    keys = {sbu_key(c.name) for c in companies if c.id in assigned}
    return {c.id for c in companies if sbu_key(c.name) in keys}


def company_of(db: Session, entity) -> int | None:
    """A project's SBU; a task's own, or its project's when the task has none."""
    company = entity.company_id
    if company is None and getattr(entity, "project_id", None):
        project = db.get(models.Project, entity.project_id)
        company = project.company_id if project else None
    return company


def oversees(db: Session, user: models.User, entity) -> bool:
    """True if this task / project belongs to an SBU `user` oversees as COO."""
    sbus = managed_company_ids(db, user)
    return bool(sbus) and company_of(db, entity) in sbus


def can_manage(db: Session, user: models.User, entity) -> bool:
    """Edits every field of this task / project: admin / privileged role, or its SBU's COO."""
    return is_privileged(db, user) or oversees(db, user, entity)


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
    if can_manage(db, user, task):
        return data
    data = {k: v for k, v in data.items() if k not in _ALWAYS_IGNORED}
    changed = _changed(task, data)
    if not changed:
        return data

    # Responsible first: it is the wider set, and one person can be both.
    if user.id == task.responsible_id:
        allowed, who = set(TASK_RESPONSIBLE_FIELDS), "Responsible"
    elif user.id == task.accountable_id:
        allowed, who = set(TASK_ACCOUNTABLE_FIELDS), "Accountable"
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
    if can_manage(db, user, task):
        return
    if user.id not in (task.responsible_id, task.accountable_id):
        raise HTTPException(403, "Only the task's Responsible or Accountable person (or an admin / PMO) can update progress.")
    if new_status in DONE_STATUSES and new_status != task.status:
        raise HTTPException(403, "To complete a task, use \"Submit for Completion\" - it is completed when the approval is accepted.")


def check_task_delete(db: Session, user: models.User, task: models.Task):
    if can_manage(db, user, task) or user.id in (task.responsible_id, task.accountable_id):
        return
    raise HTTPException(403, "Only the task's Responsible or Accountable person, the project's Manager or an admin / PMO can delete this task.")


def is_project_ra(db: Session, user: models.User, project: models.Project) -> bool:
    """True if `user` is Responsible or Accountable on any non-deleted task of this project."""
    return db.query(models.Task.id).filter(
        models.Task.project_id == project.id,
        models.Task.is_deleted.is_(False),
        or_(models.Task.responsible_id == user.id, models.Task.accountable_id == user.id),
    ).first() is not None


def can_edit_project(db: Session, user: models.User, project: models.Project) -> bool:
    return can_manage(db, user, project) or is_project_ra(db, user, project)


def can_manage_associates(db: Session, user: models.User, project: models.Project) -> bool:
    """Who may add / edit / remove a project's associated people: whoever can edit the
    project, plus its Manager, Owner and Sponsor."""
    return user.id in (project.manager_id, project.owner_id, project.sponsor_id) or can_edit_project(db, user, project)


def check_project_edit(db: Session, user: models.User, project: models.Project, data: dict) -> dict:
    if not can_edit_project(db, user, project):
        raise HTTPException(403, "Only an admin / PMO or a Responsible / Accountable person on this project's tasks can edit this project.")
    return data
