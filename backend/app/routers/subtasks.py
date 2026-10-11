"""Subtasks: an optional breakdown of a task, shown under it on the project's Gantt chart.

A subtask is a small record of its own (task_subtasks), not a task: it has no people, dates,
status or approval. Everything else is the parent task's - project, SBU, Responsible,
Accountable, Reviewer and dates - so only a title, a description, an expected deliverable
and a progress % are kept here. It is left out of the KPI, the dashboards and the task
lists, and it never changes the parent task's own progress.

  read   whoever may see the parent task (app/visibility.py)
  write  the parent task's Responsible / Accountable, its project's Manager, an admin /
         privileged role or the COO of its SBU
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, permissions, schemas, services
from app.auth import get_current_user
from app.database import get_db
from app.visibility import Scope, get_scope

router = APIRouter(prefix="/subtasks", tags=["subtasks"])


def _clean(data: dict) -> dict:
    """Trimmed text, a title that is not blank, progress inside 0 - 100."""
    for k in ("title", "description", "expected_deliverable"):
        if isinstance(data.get(k), str):
            data[k] = data[k].strip()
    if "title" in data and not data["title"]:
        raise HTTPException(400, "Subtask title is required")
    if data.get("progress_pct") is not None:
        data["progress_pct"] = max(0.0, min(100.0, float(data["progress_pct"])))
    return data


def _task_for_write(db: Session, user: models.User, task_id: int) -> models.Task:
    task = db.get(models.Task, task_id)
    if not task or task.is_deleted:
        raise HTTPException(404, "Task not found")
    project = db.get(models.Project, task.project_id) if task.project_id else None
    if not (permissions.can_manage(db, user, task) or user.id in (task.responsible_id, task.accountable_id)
            or (project is not None and project.manager_id == user.id)):
        raise HTTPException(403, "Only the task's Responsible or Accountable person, the project's Manager or an admin / PMO can change its subtasks.")
    return task


@router.get("", response_model=list[schemas.SubtaskOut])
def list_subtasks(project_id: int | None = None, task_id: int | None = None, db: Session = Depends(get_db),
                  scope: Scope = Depends(get_scope)):
    """The subtasks of one task, or of every task of a project, oldest first."""
    if project_id is None and task_id is None:
        raise HTTPException(400, "Give a project_id or a task_id")
    q = db.query(models.Task).filter(models.Task.is_deleted.is_(False))
    q = q.filter(models.Task.id == task_id) if task_id is not None else q.filter(models.Task.project_id == project_id)
    seen = [t.id for t in q.all() if scope.sees_task(t)]
    if not seen:
        return []
    return db.query(models.TaskSubtask).filter(models.TaskSubtask.task_id.in_(seen)).order_by(models.TaskSubtask.id).all()


@router.post("", response_model=schemas.SubtaskOut, status_code=201)
def create_subtask(payload: schemas.SubtaskIn, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    task = _task_for_write(db, current_user, payload.task_id)
    row = models.TaskSubtask(**_clean(payload.model_dump()), created_by=current_user.name)
    db.add(row)
    services.audit(db, current_user.name, "task", task.id, "subtask_added", new_value=row.title)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{subtask_id}", response_model=schemas.SubtaskOut)
def update_subtask(subtask_id: int, payload: schemas.SubtaskUpdate, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    row = db.get(models.TaskSubtask, subtask_id)
    if not row:
        raise HTTPException(404, "Subtask not found")
    _task_for_write(db, current_user, row.task_id)
    for k, v in _clean(payload.model_dump(exclude_unset=True)).items():
        if v is None and k in {"title", "progress_pct"}:
            continue  # required column: an explicit null must not wipe it
        setattr(row, k, v)
    row.updated_by = current_user.name
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{subtask_id}", status_code=204)
def delete_subtask(subtask_id: int, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    row = db.get(models.TaskSubtask, subtask_id)
    if not row:
        raise HTTPException(404, "Subtask not found")
    task = _task_for_write(db, current_user, row.task_id)
    services.audit(db, current_user.name, "task", task.id, "subtask_removed", previous_value=row.title)
    db.delete(row)
    db.commit()
