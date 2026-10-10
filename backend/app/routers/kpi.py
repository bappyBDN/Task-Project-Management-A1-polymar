"""Employee KPI: how each person delivers the tasks they are Responsible for.

Calculated live from the tasks on every request - nothing is stored, so the score is
always the current one and there is no KPI table to keep in step.

  assigned   the person's tasks (Responsible), not deleted, not cancelled
  TCR        Task Completion Rate   = completed / assigned
  OTR        On-Time Delivery Rate  = completed on or before the due date / completed
             (due date = approved due date, else the baseline; a task with no due date
             missed no deadline, so it counts as on time)
  OTSR       On-Time Start Rate     = started on or before the planned start / tasks whose
             start can be judged: they have a planned start date and either a recorded
             start (tasks.actual_start_date) or a planned start already in the past
             (not started yet = late). Shown beside the score, not part of it.
  Total KPI  = TCR x 0.60 + OTR x 0.40   (0 - 100)

Everyone reads their own KPI; admin and the privileged roles (Admin Panel) read everyone's.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, permissions, schemas
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/kpi", tags=["kpi"])

DONE_STATUSES = ("completed", "closed")
TCR_WEIGHT, OTR_WEIGHT = 0.60, 0.40


def _pct(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _rating(score: Optional[float]) -> str:
    if score is None:
        return "no_tasks"
    if score >= 85:
        return "excellent"
    if score >= 70:
        return "good"
    if score >= 50:
        return "fair"
    return "needs_attention"


def _judge(t: models.Task, today: date) -> dict:
    """One task's part in the KPI. on_time / started_on_time: None = does not count there."""
    due = t.approved_due_date or t.baseline_due_date
    completed = t.status in DONE_STATUSES
    on_time = None
    if completed:
        on_time = due is None or (t.actual_due_date is not None and t.actual_due_date <= due)
    started_on_time = None
    if t.planned_start_date:
        if t.actual_start_date:
            started_on_time = t.actual_start_date <= t.planned_start_date
        elif not completed and not (t.progress_pct or 0) > 0 and t.status not in ("in_progress", "in_review") \
                and t.planned_start_date < today:
            started_on_time = False  # should have started by now
    return {"due": due, "completed": completed, "on_time": on_time, "started_on_time": started_on_time,
            "overdue": not completed and due is not None and due < today}


def _score(user: models.User, tasks: list, names: dict, today: date, with_tasks: bool = False) -> dict:
    rows = [(t, _judge(t, today)) for t in tasks]
    assigned = len(rows)
    completed = sum(1 for _, j in rows if j["completed"])
    on_time = sum(1 for _, j in rows if j["on_time"])
    judged = [j for _, j in rows if j["started_on_time"] is not None]
    started_on_time = sum(1 for j in judged if j["started_on_time"])
    tcr, otr = _pct(completed, assigned), _pct(on_time, completed)
    total = round(tcr * TCR_WEIGHT + otr * OTR_WEIGHT, 1) if assigned else None
    out = {
        "user_id": user.id, "name": user.name, "employee_id": user.employee_id,
        "designation": user.designation, "role": user.role,
        "company": names["company"].get(user.company_id), "department": names["department"].get(user.department_id),
        "assigned": assigned, "completed": completed, "open": assigned - completed,
        "overdue": sum(1 for _, j in rows if j["overdue"]),
        "completed_on_time": on_time, "start_judged": len(judged), "started_on_time": started_on_time,
        "tcr": tcr, "otr": otr, "otsr": _pct(started_on_time, len(judged)) if judged else None,
        "total_kpi": total, "rating": _rating(total),
    }
    if with_tasks:
        rows.sort(key=lambda r: (r[1]["due"] or date.max, r[0].id))
        out["tasks"] = [{
            "id": t.id, "code": t.code, "title": t.title, "status": t.status,
            "planned_start_date": t.planned_start_date, "actual_start_date": t.actual_start_date,
            "due_date": j["due"], "actual_due_date": t.actual_due_date,
            "on_time": j["on_time"], "started_on_time": j["started_on_time"],
        } for t, j in rows]
    return out


def _names(db: Session) -> dict:
    return {"company": {c.id: c.name for c in db.query(models.Company).all()},
            "department": {d.id: d.name for d in db.query(models.Department).all()}}


def _tasks(db: Session, user_id: Optional[int] = None) -> list:
    q = db.query(models.Task).filter(
        models.Task.is_deleted.is_(False), models.Task.status != "cancelled",
        models.Task.responsible_id.isnot(None))
    if user_id is not None:
        q = q.filter(models.Task.responsible_id == user_id)
    return q.all()


def _require_viewer(db: Session, user: models.User):
    if not permissions.is_privileged(db, user):
        raise HTTPException(403, "Only an admin or a privileged role can see other people's KPI.")


@router.get("/me", response_model=schemas.UserKpiDetailOut)
def my_kpi(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return _score(current_user, _tasks(db, current_user.id), _names(db), date.today(), with_tasks=True)


@router.get("/users", response_model=list[schemas.UserKpiOut])
def users_kpi(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Every active person's KPI, best score first; people with no tasks last."""
    _require_viewer(db, current_user)
    by_user: dict[int, list] = {}
    for t in _tasks(db):
        by_user.setdefault(t.responsible_id, []).append(t)
    names, today = _names(db), date.today()
    users = db.query(models.User).filter(models.User.is_active.is_(True)).all()
    out = [_score(u, by_user.get(u.id, []), names, today) for u in users]
    out.sort(key=lambda r: (r["total_kpi"] is None, -(r["total_kpi"] or 0), r["name"].lower()))
    return out


@router.get("/users/{user_id}", response_model=schemas.UserKpiDetailOut)
def user_kpi(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if user_id != current_user.id:
        _require_viewer(db, current_user)
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return _score(user, _tasks(db, user_id), _names(db), date.today(), with_tasks=True)
