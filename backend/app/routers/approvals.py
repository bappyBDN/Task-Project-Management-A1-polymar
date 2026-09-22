from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.database import get_db

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("", response_model=list[schemas.ApprovalOut])
def list_approvals(approver_id: int | None = None, status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Approval)
    if approver_id:
        q = q.filter(models.Approval.approver_id == approver_id)
    if status:
        q = q.filter(models.Approval.status == status)
    return q.order_by(models.Approval.created_at.desc()).all()


@router.post("", response_model=schemas.ApprovalOut, status_code=201)
def create_approval(payload: schemas.ApprovalBase, db: Session = Depends(get_db)):
    approval = models.Approval(**payload.model_dump(), status="pending")
    db.add(approval)
    db.commit()
    db.refresh(approval)
    return approval


@router.post("/{approval_id}/decision", response_model=schemas.ApprovalOut)
def decide_approval(approval_id: int, payload: schemas.ApprovalDecision, db: Session = Depends(get_db)):
    approval = db.get(models.Approval, approval_id)
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval.status != "pending":
        raise HTTPException(409, "Approval already decided")
    approval.status = payload.status
    approval.reason = payload.reason
    approval.decided_at = datetime.utcnow()

    # Apply side effects
    if approval.entity_type == "task":
        task = db.get(models.Task, approval.entity_id)
        if task:
            if approval.approval_type == "completion" and payload.status == "approved":
                task.status = "completed"
                task.actual_due_date = date.today()
                task.progress_pct = 100.0
            if approval.approval_type == "revised_date" and payload.status == "approved":
                rca = db.query(models.DelayRca).filter(models.DelayRca.task_id == task.id).order_by(models.DelayRca.id.desc()).first()
                if rca and rca.revised_due_date:
                    task.approved_due_date = rca.revised_due_date
                    rca.approval_status = "approved"
            services.recalc_task_health(db, task)
            if task.project_id:
                services.recalc_project_health(db, task.project_id)

    services.audit(db, "system", approval.entity_type, approval.entity_id,
                   f"approval_{payload.status}", reason=payload.reason)
    services.notify(db, approval.requested_by_id,
                    f"{approval.approval_type} {payload.status}",
                    body=payload.reason, kind="approval")
    db.commit()
    db.refresh(approval)
    return approval
