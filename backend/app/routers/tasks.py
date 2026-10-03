from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, permissions, schemas, services
from app.auth import get_admin_user, get_current_user
from app.database import get_db

router = APIRouter(prefix="/tasks", tags=["tasks"])

# Columns that are NOT NULL in the DB: an explicit `null` from the client must not overwrite them.
_NOT_NULL_FIELDS = {"title", "category", "task_type", "priority", "status", "health", "progress_pct", "blocker"}

_PRIORITY_RANK = case(
    (models.Task.priority == "critical", 0),
    (models.Task.priority == "high", 1),
    (models.Task.priority == "medium", 2),
    (models.Task.priority == "low", 3),
    else_=4,
)


def _normalize(db: Session, task: models.Task):
    """Rules that must hold on every create/update, whatever the client sent."""
    task.progress_pct = max(0.0, min(100.0, float(task.progress_pct or 0.0)))
    services.apply_completion_rules(task)
    services.recalc_task_health(db, task)


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(
    project_id: int | None = None,
    responsible_id: int | None = None,
    accountable_id: int | None = None,
    reviewer_id: int | None = None,
    status: str | None = None,
    priority: str | None = None,
    health: str | None = None,
    overdue: bool | None = None,
    blocker: bool | None = None,
    include_deleted: bool = False,  # also tasks waiting for a delete decision (Approvals page names them)
    db: Session = Depends(get_db),
):
    q = db.query(models.Task)
    if not include_deleted:
        q = q.filter(models.Task.is_deleted.is_(False))
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    if responsible_id:
        q = q.filter(models.Task.responsible_id == responsible_id)
    if accountable_id:
        q = q.filter(models.Task.accountable_id == accountable_id)
    if reviewer_id:
        q = q.filter(models.Task.reviewer_id == reviewer_id)
    if status:
        q = q.filter(models.Task.status == status)
    if priority:
        q = q.filter(models.Task.priority == priority)
    if health:
        q = q.filter(models.Task.health == health)
    if blocker is not None:
        q = q.filter(models.Task.blocker == blocker)
    if overdue is True:
        today = date.today()
        q = q.filter(
            models.Task.status.notin_(["completed", "closed", "cancelled"]),
            models.Task.approved_due_date.isnot(None),
            models.Task.approved_due_date < today,
        )
    return q.order_by(models.Task.approved_due_date, _PRIORITY_RANK).all()


@router.post("", response_model=schemas.TaskOut, status_code=201)
def create_task(payload: schemas.TaskBase, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["title"] = (data.get("title") or "").strip()
    if not data["title"]:
        raise HTTPException(400, "Task title is required")

    # A task picked under a project inherits that project's company / function if left blank.
    if data.get("project_id"):
        project = db.get(models.Project, data["project_id"])
        if not project:
            raise HTTPException(400, "Selected project does not exist")
        data["company_id"] = data.get("company_id") or project.company_id
        data["function_id"] = data.get("function_id") or project.function_id

    user_code = (data.get("code") or "").strip() or None
    if user_code and db.query(models.Task).filter(models.Task.code == user_code).first():
        raise HTTPException(409, f"Task code {user_code} already exists")

    task = None
    for attempt in range(3):  # retry covers two requests generating the same code at once
        data["code"] = user_code or services.next_code("TSK", db, models.Task)
        task = models.Task(**data)
        _normalize(db, task)
        db.add(task)
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
            if user_code or attempt == 2:
                raise HTTPException(409, "Could not save the task (duplicate code). Please try again.")

    if task.project_id:
        services.recalc_project_health(db, task.project_id)
    services.audit(db, "system", "task", task.id, "created", new_value=task.title)
    services.notify(db, task.responsible_id, f"Task assigned: {task.title}",
                    body=f"You are responsible for {task.code}.", kind="assignment")
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, include_deleted: bool = False, db: Session = Depends(get_db)):
    task = db.get(models.Task, task_id)
    if not task or (task.is_deleted and not include_deleted):
        raise HTTPException(404, "Task not found")
    return task


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, payload: schemas.TaskUpdate, db: Session = Depends(get_db),
                current_user: models.User = Depends(get_current_user)):
    task = db.get(models.Task, task_id)
    if not task or task.is_deleted:
        raise HTTPException(404, "Task not found")

    data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()
            if not (v is None and k in _NOT_NULL_FIELDS)}

    if "title" in data:
        data["title"] = data["title"].strip()
        if not data["title"]:
            raise HTTPException(400, "Task title is required")
    # The business code never changes silently: ignore blank / unchanged, reject duplicates.
    new_code = (data.pop("code", None) or "").strip()
    if new_code and new_code != task.code:
        if db.query(models.Task).filter(models.Task.code == new_code, models.Task.id != task.id).first():
            raise HTTPException(409, f"Task code {new_code} already exists")
        data["code"] = new_code
    if data.get("project_id") and not db.get(models.Project, data["project_id"]):
        raise HTTPException(400, "Selected project does not exist")
    # Responsible / Accountable may edit their own task within limits (see app/permissions.py).
    data = permissions.check_task_edit(db, current_user, task, data)

    previous = task.title
    old_project_id = task.project_id
    for k, v in data.items():
        setattr(task, k, v)
    _normalize(db, task)
    for pid in {old_project_id, task.project_id} - {None}:
        services.recalc_project_health(db, pid)
    services.audit(db, current_user.name, "task", task.id, "updated", previous_value=previous, new_value=task.title)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Could not save the task (duplicate or invalid data).")
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_task(task_id: int, reason: str | None = None, db: Session = Depends(get_db),
                current_user: models.User = Depends(get_current_user)):
    """Delete a task.

    An admin, or the Manager of the task's project, deletes it permanently straight away.
    Anyone else allowed to delete (Responsible / Accountable / PMO) only hides the task and
    a "deletion" approval goes to the project's Manager, who either deletes it permanently
    (approve) or restores it (reject) - see routers/approvals.py. A task without a project
    manager goes to the admins.
    """
    task = db.get(models.Task, task_id)
    if not task or task.is_deleted:
        raise HTTPException(404, "Task not found")
    project = db.get(models.Project, task.project_id) if task.project_id else None
    manager_id = project.manager_id if project else None

    if current_user.role == permissions.ADMIN_ROLE or current_user.id == manager_id:
        services.audit(db, current_user.name, "task", task.id, "permanent_deleted", previous_value=task.title,
                       reason=f"Hard-deleted by {current_user.name}")
        services.hard_delete_task(db, task)
        db.commit()
        return {"status": "deleted"}

    permissions.check_task_delete(db, current_user, task)
    task.is_deleted = True
    if task.project_id:
        services.recalc_project_health(db, task.project_id)
    why = (reason or "").strip()
    approval = models.Approval(
        approval_type="deletion", entity_type="task", entity_id=task.id,
        requested_by_id=current_user.id, approver_id=manager_id, status="pending",
        # the task's code / title live here too: once deleted permanently the task itself is gone
        reason=f"Delete task {task.code} - {task.title}." + (f" Reason: {why}" if why else ""),
    )
    db.add(approval)
    db.flush()
    if manager_id:
        notify_ids = {manager_id}
    else:
        notify_ids = {r[0] for r in db.query(models.User.id).filter(
            models.User.role == permissions.ADMIN_ROLE, models.User.is_active.is_(True)).all()}
    for uid in notify_ids:
        services.notify(db, uid, f"Delete requested: {task.code} - {task.title}",
                        body=f"Requested by {current_user.name}. Restore the task or delete it permanently."
                             + (f" Reason: {why}" if why else ""), kind="approval")
    services.audit(db, current_user.name, "task", task.id, "delete_requested", previous_value=task.title, reason=why or None)
    db.commit()
    return {"status": "pending_approval", "approval_id": approval.id, "approver_id": manager_id}


@router.delete("/{task_id}/permanent", status_code=204)
def permanent_delete_task(task_id: int, admin: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Admin-only: hard-delete a task (any user's) and its dependents."""
    task = db.get(models.Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    services.audit(db, admin.name, "task", task_id, "permanent_deleted", previous_value=task.title,
                   reason=f"Hard-deleted by admin {admin.name}")
    services.hard_delete_task(db, task)
    db.commit()


# ---------------------------------------------------------------- Progress
@router.post("/{task_id}/progress", response_model=schemas.ProgressUpdateOut, status_code=201)
def add_progress(task_id: int, payload: schemas.ProgressUpdateBase, db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    task = db.get(models.Task, task_id)
    if not task or task.is_deleted:
        raise HTTPException(404, "Task not found")
    permissions.check_task_progress(db, current_user, task, payload.status)
    update = models.ProgressUpdate(**{**payload.model_dump(), "task_id": task_id})
    task.progress_pct = payload.progress_pct
    if payload.status:
        task.status = payload.status
    if payload.blocker:
        task.blocker = True
        task.blocker_details = payload.blocker_details or task.blocker_details
    if payload.forecast_due_date:
        task.forecast_due_date = payload.forecast_due_date
    _normalize(db, task)
    update.progress_pct = task.progress_pct  # keep history consistent with what was actually stored
    if task.project_id:
        services.recalc_project_health(db, task.project_id)
    db.add(update)
    services.audit(db, current_user.name, "task", task.id, "progress_updated", new_value=str(task.progress_pct))
    db.commit()
    db.refresh(update)
    return update


@router.get("/{task_id}/progress", response_model=list[schemas.ProgressUpdateOut])
def list_progress(task_id: int, db: Session = Depends(get_db)):
    return db.query(models.ProgressUpdate).filter(models.ProgressUpdate.task_id == task_id).order_by(models.ProgressUpdate.created_at.desc()).all()



@router.post("/{task_id}/submit-for-approval")
def submit_task_for_approval(
    task_id: int,
    reason: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Existing code change না করে নতুন রাউট দিয়ে Approval Request পাঠানো"""
    task = db.get(models.Task, task_id)
    if not task or task.is_deleted:
        raise HTTPException(404, "Task not found")

    task.status = "in_review" # স্ট্যাটাস আপডেট
    
    # অ্যাপ্রুভাল তৈরি
    approval = services.create_hierarchical_approval(
        db=db, task=task, approval_type="completion", requested_by_id=current_user.id, reason=reason
    )

    # Accountable, Reviewer ও Line Manager কে নোটিফিকেশন
    services.create_in_page_notifications(
        db=db, task=task, title=f"Task Pending Review: {task.code}",
        body=f"Task '{task.title}' has been submitted for approval.", kind="approval"
    )
    
    db.commit()
    return {"message": "Approval request submitted", "approval_id": approval.id}

@router.post("/{task_id}/request-due-date-change")
def request_due_date_change(
    task_id: int,
    revised_date: str,
    reason: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.get(models.Task, task_id)
    if not task or task.is_deleted:
        raise HTTPException(404, "Task not found")

    approval = services.create_hierarchical_approval(
        db=db, task=task, approval_type="revised_date", requested_by_id=current_user.id, 
        reason=f"Date: {revised_date}. Reason: {reason}"
    )

    services.create_in_page_notifications(
        db=db, task=task, title=f"Due Date Change Requested",
        body=f"New date: {revised_date} for task {task.code}", kind="action"
    )
    
    return {"message": "Date change requested", "approval_id": approval.id}