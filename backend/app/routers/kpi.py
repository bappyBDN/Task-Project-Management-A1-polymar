"""Employee KPI: how the work a person answers for is delivered.

Calculated live on every request - nothing is stored, so the score is always the current
one and there is no KPI table to keep in step.

A person is scored in four roles, each on its own:
  responsible      the tasks they are Responsible for
  accountable      the tasks they are Accountable for
  reviewer         the tasks they are the Reviewer of
  project_manager  the projects they manage
Deleted and cancelled tasks and cancelled projects are left out.

Every task / project ("item") is measured the same way, against its own plan:

  Expected progress   how far the item should be today: 0 % on its planned start, 100 % on
                      its due date (approved due date, else the baseline), in a straight
                      line between. Past the due date it stays 100 %.
  Achievement         completed = 100. Still open = 100 minus the points it is behind the
                      expected progress (never below 0, never above 100). So an item on or
                      ahead of plan scores 100, and one past its due date that is 90 % done
                      scores 90.
  Not counted yet     an open item whose planned start is still ahead, or that has no due
                      date: there is nothing to be behind yet.

  Delivery            the average Achievement of the counted items
  On-Time             finished on or before the due date / (completed + open past due);
                      an item still running inside its dates is not judged here
  Role KPI            Delivery x 0.60 + On-Time x 0.40   (0 - 100)
                      (Delivery alone while nothing is completed or past due yet)

  Task KPI     the same over all the person's tasks, each task once however many of the
               three task roles they have on it
  Project KPI  the Project Manager score
  Total KPI    the Task KPI, the Project KPI, or their average when the person has both

  On-Time Start (OTSR)  started on or before the planned start / tasks whose start can be
               judged. Shown beside the score, not part of it.

Who reads whose KPI (_Access):
  everyone                      their own
  a manager                     everyone who reports to them, directly or through others
  Department head               the people of their SBU + Department
  Function head                 the people of their SBU + Function
  SBU head / COO                the people of their SBU(s)
  admin, privileged roles and
  Group Executive               everyone
The head roles and what "their" SBU / Function / Department is are those of app/visibility.py.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, permissions, schemas
from app.auth import get_current_user
from app.database import get_db
from app.visibility import HEAD_ROLES, norm, sbu_key

router = APIRouter(prefix="/kpi", tags=["kpi"])

DONE_STATUSES = ("completed", "closed")
DELIVERY_WEIGHT, ON_TIME_WEIGHT = 0.60, 0.40
TASK_ROLES = ("responsible", "accountable", "reviewer")
SEES_ALL_ROLES = ("group_executive",)  # besides admin and the privileged roles


def _pct(part: float, whole: float) -> float:
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


def _judge(status: Optional[str], progress, start: Optional[date], due: Optional[date],
           finished: Optional[date], today: date) -> dict:
    """One task's / project's part in the KPI (see the module text).
    state: completed / overdue / running (all counted) or not_due (not counted yet).
    on_time: None = not judged (still running inside its dates). Completed with no due
    date or no recorded completion date = missed no known deadline, so on time."""
    completed = (status or "").lower() in DONE_STATUSES
    progress = 100.0 if completed else max(0.0, min(100.0, float(progress or 0.0)))
    overdue = not completed and due is not None and due < today
    if completed:
        expected = 100.0
    elif due is None:
        expected = None
    elif today >= due:
        expected = 100.0
    elif start is None or start >= due or today <= start:
        expected = 0.0
    else:
        expected = round((today - start).days / (due - start).days * 100, 1)
    counted = completed or bool(expected)
    on_time = None
    if completed:
        on_time = due is None or finished is None or finished <= due
    elif overdue:
        on_time = False
    return {
        "due": due, "completed": completed, "progress": progress, "expected": expected, "counted": counted,
        "achievement": round(max(0.0, min(100.0, 100.0 - (expected - progress))), 1) if counted else None,
        "on_time": on_time, "overdue": overdue,
        "state": "completed" if completed else "overdue" if overdue else "running" if counted else "not_due",
    }


def _judge_task(t: models.Task, today: date) -> dict:
    start = t.planned_start_date or (t.created_at.date() if t.created_at else None)
    j = _judge(t.status, t.progress_pct, start, t.approved_due_date or t.baseline_due_date, t.actual_due_date, today)
    started_on_time = None
    if t.planned_start_date:
        if t.actual_start_date:
            started_on_time = t.actual_start_date <= t.planned_start_date
        elif not j["completed"] and not j["progress"] > 0 and (t.status or "").lower() not in ("in_progress", "in_review") \
                and t.planned_start_date < today:
            started_on_time = False  # should have started by now
    j["started_on_time"] = started_on_time
    return j


def _judge_project(p: models.Project, last_task_done: Optional[date], today: date) -> dict:
    """Completion date = projects.actual_due_date, else the day its last task was completed."""
    completed = (p.status or "").lower() in DONE_STATUSES
    start = p.start_date or (p.created_at.date() if p.created_at else None)
    j = _judge(p.status, p.completion_pct, start, p.approved_due_date or p.baseline_due_date,
               (p.actual_due_date or last_task_done) if completed else None, today)
    j["finished"] = (p.actual_due_date or last_task_done) if completed else None
    return j


def _score(role: str, unit: str, verdicts: list) -> dict:
    """The KPI of one set of judged items (one role, or all of a person's tasks)."""
    counted = [j for j in verdicts if j["counted"]]
    judged = [j for j in counted if j["on_time"] is not None]
    completed = sum(1 for j in counted if j["completed"])
    good = sum(1 for j in counted if j["completed"] and j["on_time"])
    overdue = sum(1 for j in counted if j["overdue"])
    delivery = round(sum(j["achievement"] for j in counted) / len(counted), 1) if counted else None
    on_time = _pct(sum(1 for j in judged if j["on_time"]), len(judged)) if judged else None
    kpi = None
    if delivery is not None:
        kpi = delivery if on_time is None else round(delivery * DELIVERY_WEIGHT + on_time * ON_TIME_WEIGHT, 1)
    return {"role": role, "unit": unit, "assigned": len(counted), "completed": completed,
            "completed_on_time": good, "overdue": overdue, "running": len(counted) - completed - overdue,
            "not_counted": len(verdicts) - len(counted), "delivery": delivery, "on_time": on_time, "kpi": kpi}


class _Data:
    """The tasks and projects of one request, judged once, and who answers for each."""

    def __init__(self, db: Session, user_id: Optional[int] = None):
        self.today = today = date.today()
        self.companies = {c.id: c.name for c in db.query(models.Company).all()}
        self.functions = {f.id: f.name for f in db.query(models.Function).all()}
        self.departments = {d.id: d.name for d in db.query(models.Department).all()}
        tasks = [t for t in db.query(models.Task).filter(models.Task.is_deleted.is_(False)).all()
                 if (t.status or "").lower() != "cancelled"]
        # user id -> task id -> (task, verdict, roles of that user on it)
        self.tasks: dict[int, dict[int, tuple]] = {}
        last_done: dict[int, date] = {}  # project id -> the day its last task was completed
        for t in tasks:
            if t.project_id and (t.status or "").lower() in DONE_STATUSES and t.actual_due_date:
                last_done[t.project_id] = max(last_done.get(t.project_id, t.actual_due_date), t.actual_due_date)
            people = {"responsible": t.responsible_id, "accountable": t.accountable_id, "reviewer": t.reviewer_id}
            if user_id is not None and user_id not in people.values():
                continue
            verdict = _judge_task(t, today)
            for role, uid in people.items():
                if uid is not None and (user_id is None or uid == user_id):
                    self.tasks.setdefault(uid, {}).setdefault(t.id, (t, verdict, []))[2].append(role)
        # user id -> [(project, verdict)] for the projects they manage
        self.projects: dict[int, list] = {}
        q = db.query(models.Project).filter(models.Project.manager_id.isnot(None))
        if user_id is not None:
            q = q.filter(models.Project.manager_id == user_id)
        for p in q.all():
            if (p.status or "").lower() != "cancelled":
                self.projects.setdefault(p.manager_id, []).append((p, _judge_project(p, last_done.get(p.id), today)))

    def company_names(self, user: models.User) -> list[str]:
        """The person's SBUs by name, copies of the same SBU (other spellings) once."""
        seen, out = set(), []
        for cid in user.company_ids:
            name = self.companies.get(cid)
            if name and sbu_key(name) not in seen:
                seen.add(sbu_key(name))
                out.append(name)
        return out

    def score(self, user: models.User, with_detail: bool = False) -> dict:
        rows = list(self.tasks.get(user.id, {}).values())
        projects = self.projects.get(user.id, [])
        every = _score("tasks", "tasks", [j for _, j, _ in rows])
        roles = [_score(role, "tasks", [j for _, j, r in rows if role in r]) for role in TASK_ROLES]
        roles.append(_score("project_manager", "projects", [j for _, j in projects]))
        task_kpi, project_kpi = every["kpi"], roles[-1]["kpi"]
        parts = [k for k in (task_kpi, project_kpi) if k is not None]
        total = round(sum(parts) / len(parts), 1) if parts else None
        judged = [j for _, j, _ in rows if j["started_on_time"] is not None]
        started_on_time = sum(1 for j in judged if j["started_on_time"])
        companies = self.company_names(user)
        out = {
            "user_id": user.id, "name": user.name, "employee_id": user.employee_id,
            "designation": user.designation, "role": user.role,
            "company": companies[0] if companies else None, "companies": companies,
            "function": self.functions.get(user.function_id), "department": self.departments.get(user.department_id),
            "reports_to_id": user.reports_to_id,
            "assigned": every["assigned"], "completed": every["completed"], "overdue": every["overdue"],
            "open": every["assigned"] - every["completed"], "not_counted": every["not_counted"],
            "completed_on_time": every["completed_on_time"],
            "start_judged": len(judged), "started_on_time": started_on_time,
            "delivery": every["delivery"], "on_time": every["on_time"],
            "otsr": _pct(started_on_time, len(judged)) if judged else None,
            "task_kpi": task_kpi, "project_kpi": project_kpi,
            "total_kpi": total, "rating": _rating(total), "roles": roles,
        }
        if with_detail:
            rows.sort(key=lambda r: (r[1]["due"] or date.max, r[0].id))
            out["tasks"] = [{
                "id": t.id, "code": t.code, "title": t.title, "status": (t.status or "").lower(), "roles": r,
                "state": j["state"], "progress_pct": j["progress"], "expected_pct": j["expected"],
                "achievement": j["achievement"],
                "planned_start_date": t.planned_start_date, "actual_start_date": t.actual_start_date,
                "due_date": j["due"], "actual_due_date": t.actual_due_date,
                "on_time": j["on_time"] if j["completed"] else None, "started_on_time": j["started_on_time"],
            } for t, j, r in rows]
            projects = sorted(projects, key=lambda r: (r[1]["due"] or date.max, r[0].id))
            out["projects"] = [{
                "id": p.id, "code": p.code, "name": p.name, "status": (p.status or "").lower(), "state": j["state"],
                "progress_pct": j["progress"], "expected_pct": j["expected"], "achievement": j["achievement"],
                "start_date": p.start_date, "due_date": j["due"], "completed_date": j["finished"],
                "on_time": j["on_time"] if j["completed"] else None,
            } for p, j in projects]
        return out


class _Access:
    """Whose KPI one viewer may read, and why (see the module text)."""

    def __init__(self, db: Session, viewer: models.User, users: list):
        self.viewer = viewer
        self.all = permissions.is_privileged(db, viewer) or viewer.role in SEES_ALL_ROLES
        # everyone below the viewer in the reporting line, with how many steps down
        below: dict[int, list] = {}
        for u in users:
            if u.reports_to_id and u.reports_to_id != u.id:
                below.setdefault(u.reports_to_id, []).append(u.id)
        self.team: dict[int, int] = {}
        level, depth = below.get(viewer.id, []), 1
        while level:
            nxt = []
            for uid in level:
                if uid != viewer.id and uid not in self.team:
                    self.team[uid] = depth
                    nxt += below.get(uid, [])
            level, depth = nxt, depth + 1

        # what the viewer heads, as app/visibility.py: an SBU, or a Function / Department inside it
        self.level: Optional[str] = None
        self.sbus: list[str] = []
        self.unit: Optional[str] = None  # the Function / Department headed, by name
        self._sbu_keys: set = set()
        self._unit_key: Optional[str] = None
        headed = HEAD_ROLES.get(viewer.role)
        if not headed or self.all:
            return
        companies = {c.id: c.name for c in db.query(models.Company).all()}
        own = permissions.managed_company_ids(db, viewer) if viewer.role == permissions.COO_ROLE else set(viewer.company_ids)
        names = [companies[c] for c in own if c in companies]
        self._sbu_keys = {sbu_key(n) for n in names}
        if headed == "function" and viewer.function_id:
            row = db.get(models.Function, viewer.function_id)
            self.unit = row.name if row else None
        elif headed == "department" and viewer.department_id:
            row = db.get(models.Department, viewer.department_id)
            self.unit = row.name if row else None
        self._unit_key = norm(self.unit) if self.unit else None
        # a head with no SBU (or no function / department) on their record heads nothing
        if self._sbu_keys and (headed == "sbu" or self._unit_key):
            self.level = headed
            self.sbus = list({sbu_key(n): n for n in names}.values())

    def _heads(self, row: dict) -> bool:
        if not self.level or not self._sbu_keys & {sbu_key(n) for n in row["companies"]}:
            return False
        if self.level == "sbu":
            return True
        return norm(row["function" if self.level == "function" else "department"]) == self._unit_key

    def relation(self, row: dict) -> list:
        """Why the viewer sees this person; empty = they do not."""
        if row["user_id"] == self.viewer.id:
            return ["self"]
        out = []
        if row["user_id"] in self.team:
            out.append("direct_report" if self.team[row["user_id"]] == 1 else "team")
        if self._heads(row):
            out.append(self.level)
        if self.all and not out:
            out.append("all")
        return out

    def scope(self, people: list) -> dict:
        others = [p for p in people if p["user_id"] != self.viewer.id]
        return {
            "level": "all" if self.all else self.level or ("team" if self.team else "self"),
            "sees_all": self.all, "headed": self.level, "sbus": self.sbus, "unit": self.unit,
            "team_size": len(self.team), "direct_reports": sum(1 for d in self.team.values() if d == 1),
            "people": len(others),
        }


def _active_users(db: Session) -> list:
    return db.query(models.User).filter(models.User.is_active.is_(True)).all()


@router.get("/me", response_model=schemas.UserKpiDetailOut)
def my_kpi(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return _Data(db, current_user.id).score(current_user, with_detail=True)


@router.get("/overview", response_model=schemas.KpiOverviewOut)
def overview(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """The KPI of everyone the viewer may see (themselves included), best score first;
    people with nothing to score last."""
    users = _active_users(db)
    data, access = _Data(db), _Access(db, current_user, users)
    people = []
    for u in users:
        row = data.score(u)
        row["relation"] = access.relation(row)
        if row["relation"]:
            people.append(row)
    names = {u.id: u.name for u in users}
    for row in people:
        row["manager"] = names.get(row["reports_to_id"])
    people.sort(key=lambda r: (r["total_kpi"] is None, -(r["total_kpi"] or 0), r["name"].lower()))
    return {"scope": access.scope(people), "people": people}


@router.get("/users/{user_id}", response_model=schemas.UserKpiDetailOut)
def user_kpi(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    out = _Data(db, user_id).score(user, with_detail=True)
    if user_id != current_user.id and not _Access(db, current_user, _active_users(db)).relation(out):
        raise HTTPException(403, "You can see your own KPI and the KPI of the people who report to you or belong to what you head.")
    return out
