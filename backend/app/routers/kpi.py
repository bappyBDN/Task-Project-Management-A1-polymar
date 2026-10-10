"""Employee KPI: how the work a person answers for is delivered.

Calculated live on every request - nothing is stored, so the score is always the current
one and there is no KPI table to keep in step.

Task KPI - over the tasks a person answers for, each task counted once however many of
these roles they have on it (deleted and cancelled tasks are left out):
  responsible      the task's Responsible person
  accountable      the task's Accountable person
  reviewer         the task's Reviewer
Each role is also scored on its own.

  TCR        Task Completion Rate   = completed / tasks
  OTR        On-Time Delivery Rate  = completed on or before the due date / completed
             (due date = approved due date, else the baseline; a task with no due date
             missed no deadline, so it counts as on time)
  OTSR       On-Time Start Rate     = started on or before the planned start / tasks whose
             start can be judged: they have a planned start date and either a recorded
             start (tasks.actual_start_date) or a planned start already in the past
             (not started yet = late). Shown beside the score, not part of it.
  Task KPI   = TCR x 0.60 + OTR x 0.40   (0 - 100)

Project KPI - for a project's Manager, over the projects they manage (cancelled ones are
left out). A project still running inside its due date is neither a success nor a failure
yet, so it is not counted; the ones counted are "due": completed, or past the due date.
  PCR        Project Completion Rate = (completed projects + the overall progress of each
             due project still open) / due projects - a project past its due date that is
             90 % done counts as 0.9 of a project, not as nothing
  POTR       Project On-Time Rate    = completed on or before the due date / completed
             (completion date = projects.actual_due_date, else the day its last task was
             completed; none known, or no due date = counts as on time)
  Project KPI = PCR x 0.60 + POTR x 0.40

Total KPI = the Task KPI, the Project KPI, or their average when the person has both.

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
TASK_ROLES = ("responsible", "accountable", "reviewer")


def _pct(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _weighted(completion: float, on_time: float, counted: int) -> Optional[float]:
    return round(completion * TCR_WEIGHT + on_time * OTR_WEIGHT, 1) if counted else None


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


def _judge_project(p: models.Project, last_task_done: Optional[date], today: date) -> dict:
    """One project's part in its Manager's KPI. state: completed / overdue (both counted)
    or running (not counted yet)."""
    due = p.approved_due_date or p.baseline_due_date
    completed = p.status in DONE_STATUSES
    finished = (p.actual_due_date or last_task_done) if completed else None
    on_time = None
    if completed:
        on_time = due is None or finished is None or finished <= due
    state = "completed" if completed else "overdue" if due is not None and due < today else "running"
    progress = 100.0 if completed else max(0.0, min(100.0, float(p.completion_pct or 0.0)))
    return {"due": due, "completed": completed, "finished": finished, "on_time": on_time, "state": state,
            "progress": progress}


class _Data:
    """The tasks and projects of one request, judged once, and who answers for each."""

    def __init__(self, db: Session, user_id: Optional[int] = None):
        self.today = today = date.today()
        self.companies = {c.id: c.name for c in db.query(models.Company).all()}
        self.departments = {d.id: d.name for d in db.query(models.Department).all()}
        tasks = db.query(models.Task).filter(
            models.Task.is_deleted.is_(False), models.Task.status != "cancelled").all()
        # user id -> task id -> (task, verdict, roles of that user on it)
        self.tasks: dict[int, dict[int, tuple]] = {}
        last_done: dict[int, date] = {}  # project id -> the day its last task was completed
        for t in tasks:
            if t.project_id and t.status in DONE_STATUSES and t.actual_due_date:
                last_done[t.project_id] = max(last_done.get(t.project_id, t.actual_due_date), t.actual_due_date)
            people = {"responsible": t.responsible_id, "accountable": t.accountable_id, "reviewer": t.reviewer_id}
            if user_id is not None and user_id not in people.values():
                continue
            verdict = _judge(t, today)
            for role, uid in people.items():
                if uid is not None and (user_id is None or uid == user_id):
                    self.tasks.setdefault(uid, {}).setdefault(t.id, (t, verdict, []))[2].append(role)
        # user id -> [(project, verdict)] for the projects they manage
        self.projects: dict[int, list] = {}
        q = db.query(models.Project).filter(models.Project.manager_id.isnot(None), models.Project.status != "cancelled")
        if user_id is not None:
            q = q.filter(models.Project.manager_id == user_id)
        for p in q.all():
            self.projects.setdefault(p.manager_id, []).append((p, _judge_project(p, last_done.get(p.id), today)))

    def score(self, user: models.User, with_detail: bool = False) -> dict:
        rows = list(self.tasks.get(user.id, {}).values())
        assigned = len(rows)
        completed = sum(1 for _, j, _ in rows if j["completed"])
        on_time = sum(1 for _, j, _ in rows if j["on_time"])
        judged = [j for _, j, _ in rows if j["started_on_time"] is not None]
        started_on_time = sum(1 for j in judged if j["started_on_time"])
        tcr, otr = _pct(completed, assigned), _pct(on_time, completed)
        task_kpi = _weighted(tcr, otr, assigned)

        roles = []
        for role in TASK_ROLES:
            mine = [j for _, j, r in rows if role in r]
            done = sum(1 for j in mine if j["completed"])
            good = sum(1 for j in mine if j["on_time"])
            r_tcr, r_otr = _pct(done, len(mine)), _pct(good, done)
            roles.append({"role": role, "unit": "tasks", "assigned": len(mine), "completed": done,
                          "completed_on_time": good, "not_counted": 0, "open_progress": None,
                          "tcr": r_tcr, "otr": r_otr, "kpi": _weighted(r_tcr, r_otr, len(mine))})

        projects = self.projects.get(user.id, [])
        due = [j for _, j in projects if j["state"] != "running"]
        p_done = sum(1 for j in due if j["completed"])
        p_good = sum(1 for j in due if j["on_time"])
        # a due project still open counts for as much as it is done (its overall progress)
        behind = [j["progress"] for j in due if not j["completed"]]
        pcr = round((p_done * 100 + sum(behind)) / len(due), 1) if due else 0.0
        potr = _pct(p_good, p_done)
        project_kpi = _weighted(pcr, potr, len(due))
        roles.append({"role": "project_manager", "unit": "projects", "assigned": len(due), "completed": p_done,
                      "completed_on_time": p_good, "not_counted": len(projects) - len(due),
                      "open_progress": round(sum(behind) / len(behind), 1) if behind else None,
                      "tcr": pcr, "otr": potr, "kpi": project_kpi})

        parts = [k for k in (task_kpi, project_kpi) if k is not None]
        total = round(sum(parts) / len(parts), 1) if parts else None
        out = {
            "user_id": user.id, "name": user.name, "employee_id": user.employee_id,
            "designation": user.designation, "role": user.role,
            "company": self.companies.get(user.company_id), "department": self.departments.get(user.department_id),
            "assigned": assigned, "completed": completed, "open": assigned - completed,
            "overdue": sum(1 for _, j, _ in rows if j["overdue"]),
            "completed_on_time": on_time, "start_judged": len(judged), "started_on_time": started_on_time,
            "tcr": tcr, "otr": otr, "otsr": _pct(started_on_time, len(judged)) if judged else None,
            "task_kpi": task_kpi, "project_kpi": project_kpi,
            "total_kpi": total, "rating": _rating(total), "roles": roles,
        }
        if with_detail:
            rows.sort(key=lambda r: (r[1]["due"] or date.max, r[0].id))
            out["tasks"] = [{
                "id": t.id, "code": t.code, "title": t.title, "status": t.status, "roles": r,
                "planned_start_date": t.planned_start_date, "actual_start_date": t.actual_start_date,
                "due_date": j["due"], "actual_due_date": t.actual_due_date,
                "on_time": j["on_time"], "started_on_time": j["started_on_time"],
            } for t, j, r in rows]
            projects.sort(key=lambda r: (r[1]["due"] or date.max, r[0].id))
            out["projects"] = [{
                "id": p.id, "code": p.code, "name": p.name, "status": p.status, "state": j["state"],
                "progress_pct": j["progress"],
                "due_date": j["due"], "completed_date": j["finished"], "on_time": j["on_time"],
            } for p, j in projects]
        return out


def _require_viewer(db: Session, user: models.User):
    if not permissions.is_privileged(db, user):
        raise HTTPException(403, "Only an admin or a privileged role can see other people's KPI.")


@router.get("/me", response_model=schemas.UserKpiDetailOut)
def my_kpi(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return _Data(db, current_user.id).score(current_user, with_detail=True)


@router.get("/users", response_model=list[schemas.UserKpiOut])
def users_kpi(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Every active person's KPI, best score first; people with nothing to score last."""
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
    return _Data(db, user_id).score(user, with_detail=True)
