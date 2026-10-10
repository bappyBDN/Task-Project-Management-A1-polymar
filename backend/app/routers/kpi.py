"""Employee KPI: how the tasks a person answers for are delivered.

Calculated live from the tasks on every request - nothing is stored, so the score is
always the current one and there is no KPI table to keep in step.

A person answers for a task in four ways (ROLES), each scored on its own:
  responsible      the task's Responsible person
  accountable      the task's Accountable person
  reviewer         the task's Reviewer
  project_manager  the Manager of the task's project (every task of that project)
The person's overall score is taken over all of those tasks together, each task counted
once however many roles the person has on it. Deleted and cancelled tasks are left out.

  TCR        Task Completion Rate   = completed / tasks
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
ROLES = ("responsible", "accountable", "reviewer", "project_manager")


def _pct(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _total(tcr: float, otr: float, tasks: int) -> Optional[float]:
    return round(tcr * TCR_WEIGHT + otr * OTR_WEIGHT, 1) if tasks else None


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


class _Data:
    """The tasks of one request, judged once, and who answers for each."""

    def __init__(self, db: Session, user_id: Optional[int] = None):
        self.today = date.today()
        self.companies = {c.id: c.name for c in db.query(models.Company).all()}
        self.departments = {d.id: d.name for d in db.query(models.Department).all()}
        managers = {p.id: p.manager_id for p in db.query(models.Project.id, models.Project.manager_id).all()}
        tasks = db.query(models.Task).filter(
            models.Task.is_deleted.is_(False), models.Task.status != "cancelled").all()
        # user id -> task id -> (task, verdict, roles of that user on it)
        self.by_user: dict[int, dict[int, tuple]] = {}
        for t in tasks:
            people = {"responsible": t.responsible_id, "accountable": t.accountable_id, "reviewer": t.reviewer_id,
                      "project_manager": managers.get(t.project_id)}
            if user_id is not None and user_id not in people.values():
                continue
            verdict = _judge(t, self.today)
            for role, uid in people.items():
                if uid is not None and (user_id is None or uid == user_id):
                    self.by_user.setdefault(uid, {}).setdefault(t.id, (t, verdict, []))[2].append(role)

    def score(self, user: models.User, with_tasks: bool = False) -> dict:
        rows = list(self.by_user.get(user.id, {}).values())
        assigned = len(rows)
        completed = sum(1 for _, j, _ in rows if j["completed"])
        on_time = sum(1 for _, j, _ in rows if j["on_time"])
        judged = [j for _, j, _ in rows if j["started_on_time"] is not None]
        started_on_time = sum(1 for j in judged if j["started_on_time"])
        tcr, otr = _pct(completed, assigned), _pct(on_time, completed)
        total = _total(tcr, otr, assigned)

        roles = []
        for role in ROLES:
            mine = [j for _, j, r in rows if role in r]
            done = sum(1 for j in mine if j["completed"])
            good = sum(1 for j in mine if j["on_time"])
            r_tcr, r_otr = _pct(done, len(mine)), _pct(good, done)
            roles.append({"role": role, "assigned": len(mine), "completed": done, "completed_on_time": good,
                          "tcr": r_tcr, "otr": r_otr, "kpi": _total(r_tcr, r_otr, len(mine))})

        out = {
            "user_id": user.id, "name": user.name, "employee_id": user.employee_id,
            "designation": user.designation, "role": user.role,
            "company": self.companies.get(user.company_id), "department": self.departments.get(user.department_id),
            "assigned": assigned, "completed": completed, "open": assigned - completed,
            "overdue": sum(1 for _, j, _ in rows if j["overdue"]),
            "completed_on_time": on_time, "start_judged": len(judged), "started_on_time": started_on_time,
            "tcr": tcr, "otr": otr, "otsr": _pct(started_on_time, len(judged)) if judged else None,
            "total_kpi": total, "rating": _rating(total), "roles": roles,
        }
        if with_tasks:
            rows.sort(key=lambda r: (r[1]["due"] or date.max, r[0].id))
            out["tasks"] = [{
                "id": t.id, "code": t.code, "title": t.title, "status": t.status, "roles": r,
                "planned_start_date": t.planned_start_date, "actual_start_date": t.actual_start_date,
                "due_date": j["due"], "actual_due_date": t.actual_due_date,
                "on_time": j["on_time"], "started_on_time": j["started_on_time"],
            } for t, j, r in rows]
        return out


def _require_viewer(db: Session, user: models.User):
    if not permissions.is_privileged(db, user):
        raise HTTPException(403, "Only an admin or a privileged role can see other people's KPI.")


@router.get("/me", response_model=schemas.UserKpiDetailOut)
def my_kpi(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return _Data(db, current_user.id).score(current_user, with_tasks=True)


@router.get("/users", response_model=list[schemas.UserKpiOut])
def users_kpi(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Every active person's KPI, best score first; people with no tasks last."""
    _require_viewer(db, current_user)
    data = _Data(db)
    out = [data.score(u) for u in db.query(models.User).filter(models.User.is_active.is_(True)).all()]
    out.sort(key=lambda r: (r["total_kpi"] is None, -(r["total_kpi"] or 0), r["name"].lower()))
    return out


@router.get("/users/{user_id}", response_model=schemas.UserKpiDetailOut)
def user_kpi(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if user_id != current_user.id:
        _require_viewer(db, current_user)
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return _Data(db, user_id).score(user, with_tasks=True)
