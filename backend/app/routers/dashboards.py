from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

OPEN_STATUSES = ["backlog", "ready", "in_progress", "in_review", "blocked", "on_hold"]
DONE_STATUSES = ["completed", "closed"]


@router.get("/individual/{user_id}", response_model=schemas.TaskKpiOut)
def individual_kpi(user_id: int, db: Session = Depends(get_db)):
    today = date.today()
    base = db.query(models.Task).filter(
        models.Task.is_deleted.is_(False),
        (models.Task.responsible_id == user_id) | (models.Task.accountable_id == user_id),
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
def executive_kpi(db: Session = Depends(get_db)):
    today = date.today()
    total = db.query(models.Project).count()
    active = db.query(models.Project).filter(models.Project.status.in_(["planning", "active"])).count()
    green = db.query(models.Project).filter(models.Project.health == "green").count()
    amber = db.query(models.Project).filter(models.Project.health == "amber").count()
    red = db.query(models.Project).filter(models.Project.health == "red").count()
    black = db.query(models.Project).filter(models.Project.health == "black").count()
    forecast_miss = db.query(models.Project).filter(
        models.Project.forecast_due_date.isnot(None),
        models.Project.approved_due_date.isnot(None),
        models.Project.forecast_due_date > models.Project.approved_due_date,
        models.Project.status.notin_(["completed", "closed", "cancelled"]),
    ).count()
    return schemas.ProjectKpiOut(
        total=total, active=active, green=green, amber=amber, red=red,
        black=black, forecast_miss=forecast_miss,
    )


@router.get("/health-distribution")
def health_distribution(db: Session = Depends(get_db)):
    rows = db.query(models.Project.health, func.count(models.Project.id)).group_by(models.Project.health).all()
    return {h: c for h, c in rows}


@router.get("/delay-causes")
def delay_causes(db: Session = Depends(get_db)):
    rows = db.query(models.DelayRca.delay_category, func.count(models.DelayRca.id)).group_by(models.DelayRca.delay_category).all()
    return [{"category": c or "Other", "count": n} for c, n in rows]


# ---------------------------------------------------------------- Org intelligence
@router.get("/org-intelligence")
def org_intelligence(db: Session = Depends(get_db)):
    """Rolls up task/project counts by SBU (company), Function and Department.

    Powers the Team and Portfolio Breakdown widget on the dashboard.
    Read-only aggregation over existing tables - no schema change, no writes.

    Names are grouped case-insensitively so records that differ only in
    capitalization (for example 'growthanalytics' vs 'Growthanalytics')
    merge into a single row instead of appearing twice.
    """
    today_ = date.today()

    companies = {c.id: c.name for c in db.query(models.Company).all()}
    functions = {f.id: f.name for f in db.query(models.Function).all()}
    departments = {d.id: d.name for d in db.query(models.Department).all()}

    tasks = db.query(models.Task).filter(models.Task.is_deleted.is_(False)).all()
    projects = db.query(models.Project).all()

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