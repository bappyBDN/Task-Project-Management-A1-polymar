from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.visibility import Scope, get_scope

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

OPEN_STATUSES = ["backlog", "ready", "in_progress", "in_review", "blocked", "on_hold"]
DONE_STATUSES = ["completed", "closed"]


def _mine(user_id: int):
    """The tasks the personal dashboard tracks for a user: the ones they are Responsible /
    Accountable / Reviewer / Informed on, plus every task of the projects they lead (Manager, Sponsor
    or Owner) - so a project manager follows the whole project from the dashboard."""
    led = select(models.Project.id).where(
        (models.Project.manager_id == user_id) | (models.Project.sponsor_id == user_id)
        | (models.Project.owner_id == user_id))
    return ((models.Task.responsible_id == user_id) | (models.Task.accountable_id == user_id)
            | (models.Task.reviewer_id == user_id) | (models.Task.informed_id == user_id)
            | models.Task.project_id.in_(led))


@router.get("/individual/{user_id}", response_model=schemas.TaskKpiOut)
def individual_kpi(user_id: int, db: Session = Depends(get_db)):
    today = date.today()
    base = db.query(models.Task).filter(
        models.Task.is_deleted.is_(False),
        _mine(user_id),
    )
    total = base.count()
    open_tasks = base.filter(models.Task.status.in_(OPEN_STATUSES)).count()
    completed = base.filter(models.Task.status.in_(DONE_STATUSES)).count()
    overdue = base.filter(
        models.Task.status.in_(OPEN_STATUSES),
        models.Task.approved_due_date.isnot(None),
        models.Task.approved_due_date < today,
    ).count()
    critical = base.filter(models.Task.priority == "critical", models.Task.status.in_(OPEN_STATUSES)).count()
    blocked = base.filter(models.Task.blocker.is_(True), models.Task.status.in_(OPEN_STATUSES)).count()
    due_today = base.filter(models.Task.approved_due_date == today).count()
    completion_pct = round(completed / total * 100, 1) if total else 0.0

    on_time = base.filter(
        models.Task.status.in_(DONE_STATUSES),
        models.Task.actual_due_date.isnot(None),
        models.Task.approved_due_date.isnot(None),
        models.Task.actual_due_date <= models.Task.approved_due_date,
    ).count()
    on_time_pct = round(on_time / completed * 100, 1) if completed else 100.0

    return schemas.TaskKpiOut(
        total=total, open=open_tasks, completed=completed, overdue=overdue,
        critical=critical, blocked=blocked, due_today=due_today,
        completion_pct=completion_pct, on_time_pct=on_time_pct,
    )


@router.get("/executive", response_model=schemas.ProjectKpiOut)
def executive_kpi(db: Session = Depends(get_db), scope: Scope = Depends(get_scope)):
    """Portfolio counts over the projects this user may see (app/visibility.py)."""
    projects = [p for p in db.query(models.Project).all() if scope.sees_project(p)]
    health = lambda h: sum(1 for p in projects if p.health == h)
    forecast_miss = sum(
        1 for p in projects
        if p.forecast_due_date and p.approved_due_date and p.forecast_due_date > p.approved_due_date
        and p.status not in ("completed", "closed", "cancelled")
    )
    return schemas.ProjectKpiOut(
        total=len(projects), active=sum(1 for p in projects if p.status in ("planning", "active")),
        green=health("green"), amber=health("amber"), red=health("red"),
        black=health("black"), forecast_miss=forecast_miss,
    )


@router.get("/health-distribution")
def health_distribution(db: Session = Depends(get_db), scope: Scope = Depends(get_scope)):
    out: dict[str, int] = {}
    for p in db.query(models.Project).all():
        if scope.sees_project(p):
            out[p.health] = out.get(p.health, 0) + 1
    return out


@router.get("/delay-causes")
def delay_causes(db: Session = Depends(get_db), scope: Scope = Depends(get_scope)):
    if scope.all:
        rows = db.query(models.DelayRca.delay_category, func.count(models.DelayRca.id)).group_by(models.DelayRca.delay_category).all()
        return [{"category": c or "Other", "count": n} for c, n in rows]
    # delays of the tasks this user may see
    seen = {t.id for t in db.query(models.Task).filter(models.Task.is_deleted.is_(False)).all() if scope.sees_task(t)}
    out: dict[str, int] = {}
    for task_id, category in db.query(models.DelayRca.task_id, models.DelayRca.delay_category).all():
        if task_id in seen:
            out[category or "Other"] = out.get(category or "Other", 0) + 1
    return [{"category": c, "count": n} for c, n in out.items()]


# ---------------------------------------------------------------- Org intelligence
@router.get("/org-intelligence")
def org_intelligence(db: Session = Depends(get_db), scope: Scope = Depends(get_scope)):
    """Rolls up task/project counts by SBU (company), Function and Department.

    Powers the Team and Portfolio Breakdown widget on the dashboard.
    Read-only aggregation over existing tables - no schema change, no writes.
    Counts only the projects and tasks this user may see (app/visibility.py).

    Names are grouped case-insensitively so records that differ only in
    capitalization (for example 'growthanalytics' vs 'Growthanalytics')
    merge into a single row instead of appearing twice.
    """
    today_ = date.today()

    companies = {c.id: c.name for c in db.query(models.Company).all()}
    functions = {f.id: f.name for f in db.query(models.Function).all()}
    departments = {d.id: d.name for d in db.query(models.Department).all()}

    tasks = [t for t in db.query(models.Task).filter(models.Task.is_deleted.is_(False)).all() if scope.sees_task(t)]
    projects = [p for p in db.query(models.Project).all() if scope.sees_project(p)]

    by_sbu = {}
    by_function = {}
    by_department = {}

    def _better_display(a, b):
        # Prefer the spelling that starts with an uppercase letter.
        if b[:1].isupper() and not a[:1].isupper():
            return b
        return a

    def row(bucket, raw_name):
        display = (raw_name or "Unassigned").strip()
        norm_key = display.lower()
        entry = bucket.get(norm_key)
        if entry is None:
            entry = {"_display": display, "total": 0, "open": 0, "completed": 0, "overdue": 0, "projects": 0}
            bucket[norm_key] = entry
        else:
            entry["_display"] = _better_display(entry["_display"], display)
        return entry

    for t in tasks:
        due = t.approved_due_date or t.baseline_due_date
        is_overdue = t.status in OPEN_STATUSES and due is not None and due < today_

        for bucket, key in (
            (by_sbu, companies.get(t.company_id, "Unassigned")),
            (by_function, functions.get(t.function_id, "Unassigned")),
            (by_department, departments.get(t.department_id, "Unassigned")),
        ):
            r = row(bucket, key)
            r["total"] += 1
            if t.status in OPEN_STATUSES:
                r["open"] += 1
            if t.status in DONE_STATUSES:
                r["completed"] += 1
            if is_overdue:
                r["overdue"] += 1

    for p in projects:
        row(by_sbu, companies.get(p.company_id, "Unassigned"))["projects"] += 1
        row(by_function, functions.get(p.function_id, "Unassigned"))["projects"] += 1

    # Projects have no department of their own: a department's projects are the
    # projects that have at least one of its tasks.
    dept_projects = {}
    for t in tasks:
        if t.project_id:
            key = (departments.get(t.department_id) or "Unassigned").strip().lower()
            dept_projects.setdefault(key, set()).add(t.project_id)
    for key, ids in dept_projects.items():
        if key in by_department:
            by_department[key]["projects"] = len(ids)

    def fmt(bucket):
        result = []
        for v in bucket.values():
            result.append({
                "name": v["_display"],
                "total": v["total"],
                "open": v["open"],
                "completed": v["completed"],
                "overdue": v["overdue"],
                "projects": v["projects"],
            })
        return result

    return {"bySbu": fmt(by_sbu), "byFunction": fmt(by_function), "byDepartment": fmt(by_department)}

# ---------------------------------------------------------------- Trends (NEW)
@router.get("/individual/{user_id}/trends")
def individual_trends(user_id: int, days: int = 7, db: Session = Depends(get_db)):
    """Daily history for the personal dashboard: KPI sparklines + 'vs last week'
    deltas, and the Task Progress chart (completed vs in-progress per day).

    There is no status-history table, so each day is a best-effort snapshot built
    from current rows: a task exists on day D if created_at <= D, and counts as
    done on D if it is in a done status and actual_due_date (used as the
    completion date) <= D. Read-only, no schema change.
    """
    days = max(1, min(days, 90))  # days<0 used to crash (empty list), huge values hung the server
    today = date.today()
    tasks = db.query(models.Task).filter(
        models.Task.is_deleted.is_(False),
        _mine(user_id),
    ).all()

    upd_by_day: dict[str, set] = {}
    if tasks:
        rows = db.query(models.ProgressUpdate.task_id, func.date(models.ProgressUpdate.created_at)).filter(
            models.ProgressUpdate.task_id.in_([t.id for t in tasks])
        ).all()
        for tid, d in rows:
            upd_by_day.setdefault(str(d), set()).add(tid)

    def due(t):
        return t.approved_due_date or t.baseline_due_date

    def done_on(t, d):
        return t.status in DONE_STATUSES and (t.actual_due_date is None or t.actual_due_date <= d)

    def snapshot(d):
        alive = [t for t in tasks if t.created_at.date() <= d]
        open_ = [t for t in alive if not done_on(t, d) and (t.status in OPEN_STATUSES or t.status in DONE_STATUSES)]
        return {
            "total": len(alive),
            "open": len(open_),
            "due_today": sum(1 for t in alive if due(t) == d),
            "overdue": sum(1 for t in open_ if due(t) and due(t) < d),
            "critical": sum(1 for t in open_ if t.priority == "critical"),
            "blocked": sum(1 for t in open_ if t.blocker),
        }

    day_list = [today - timedelta(days=i) for i in range(days, -1, -1)]   # oldest -> today
    snaps = [snapshot(d) for d in day_list]
    series = {k: [s[k] for s in snaps] for k in snaps[0]}

    chart = [
        {
            "date": d.isoformat(),
            "completed": sum(1 for t in tasks if t.status in DONE_STATUSES and t.actual_due_date == d),
            "in_progress": len(upd_by_day.get(d.isoformat(), set())),
        }
        for d in day_list[-7:]
    ]
    return {"dates": [d.isoformat() for d in day_list], "series": series, "chart": chart}