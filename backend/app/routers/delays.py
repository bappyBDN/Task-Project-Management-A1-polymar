from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import gantt, models, schemas, services
from app.database import get_db
from app.visibility import Scope, get_scope

router = APIRouter(prefix="/delays", tags=["delays"])


@router.get("", response_model=list[schemas.DelayRcaOut])
def list_delays(task_id: int | None = None, approval_status: str | None = None, db: Session = Depends(get_db),
                scope: Scope = Depends(get_scope)):
    q = db.query(models.DelayRca)
    if task_id:
        q = q.filter(models.DelayRca.task_id == task_id)
    if approval_status:
        q = q.filter(models.DelayRca.approval_status == approval_status)
    rows = q.order_by(models.DelayRca.created_at.desc()).all()
    if scope.all:
        return rows
    # only delays of tasks this user may see (app/visibility.py)
    ids = {d.task_id for d in rows}
    seen = {t.id for t in db.query(models.Task).filter(models.Task.id.in_(ids)).all() if scope.sees_task(t)} if ids else set()
    return [d for d in rows if d.task_id in seen]


@router.post("", response_model=schemas.DelayRcaOut, status_code=201)
def create_delay(payload: schemas.DelayRcaBase, db: Session = Depends(get_db)):
    task = db.get(models.Task, payload.task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    rca = models.DelayRca(**payload.model_dump())
    db.add(rca)
    # mark task as affected by delay
    task.health = "amber"
    if payload.revised_due_date:
        task.forecast_due_date = payload.revised_due_date
        gantt.reschedule_project(db, task.project_id)  # tasks that depend on this one follow
    services.audit(db, "system", "task", task.id, "delay_rca_submitted",
                   new_value=payload.delay_category, reason=payload.delay_reason)
    db.commit()
    db.refresh(rca)
    return rca


@router.patch("/{rca_id}", response_model=schemas.DelayRcaOut)
def update_delay(rca_id: int, payload: schemas.DelayRcaUpdate, db: Session = Depends(get_db)):
    rca = db.get(models.DelayRca, rca_id)
    if not rca:
        raise HTTPException(404, "Delay RCA not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is None and k in {"is_internal", "dependency_related", "management_intervention", "approval_status"}:
            continue  # required column: an explicit null must not wipe it
        setattr(rca, k, v)
    db.commit()
    db.refresh(rca)
    return rca
