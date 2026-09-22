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
