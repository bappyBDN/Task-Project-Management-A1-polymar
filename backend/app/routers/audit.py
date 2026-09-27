from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def list_audit(entity_type: str | None = None, entity_id: int | None = None, limit: int = 100, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 1000))
    q = db.query(models.AuditLog)
    if entity_type:
        q = q.filter(models.AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.filter(models.AuditLog.entity_id == entity_id)
    return q.order_by(models.AuditLog.happened_at.desc()).limit(limit).all()


@router.get("/notifications", response_model=list[schemas.NotificationOut])
def list_notifications(user_id: int | None = None, db: Session = Depends(get_db),
                       current_user: models.User = Depends(get_current_user)):
    # Admins may browse anyone's notifications; everyone else only their own.
    if current_user.role != "admin":
        user_id = current_user.id
    q = db.query(models.Notification)
    if user_id:
        q = q.filter(models.Notification.user_id == user_id)
    return q.order_by(models.Notification.created_at.desc()).limit(100).all()


@router.post("/notifications/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_read(notification_id: int, db: Session = Depends(get_db),
              current_user: models.User = Depends(get_current_user)):
    n = db.get(models.Notification, notification_id)
    if not n or (current_user.role != "admin" and n.user_id != current_user.id):
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n


@router.post("/escalations/scan")
def run_escalation_scan(db: Session = Depends(get_db)):
    events = services.scan_escalations(db)
    return {"scanned": True, "events": events}
