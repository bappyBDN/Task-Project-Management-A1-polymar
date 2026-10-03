import re

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
    return _with_links(db, q.order_by(models.Notification.created_at.desc()).limit(100).all())


# A task / project code as written in notification texts: "TSK-0012", "PRJ-0003".
_CODE = re.compile(r"\b[A-Za-z][A-Za-z0-9]*-\d+\b")


def _with_links(db: Session, rows: list) -> list:
    """Add where each notification leads, so the page can open it with one click.

    Notifications store only text (no schema change): every task / project one names its
    code in the title or body, so the first code that is a real task or project decides the
    link. A task that is hidden while its delete request waits leads to Approvals instead."""
    found = {n.id: _CODE.findall(f"{n.title} {n.body or ''}") for n in rows}
    codes = {c for cs in found.values() for c in cs}
    tasks = {t.code: t for t in db.query(models.Task).filter(models.Task.code.in_(codes)).all()} if codes else {}
    projects = {p.code: p for p in db.query(models.Project).filter(models.Project.code.in_(codes)).all()} if codes else {}

    out = []
    for n in rows:
        item = schemas.NotificationOut.model_validate(n)
        for code in found[n.id]:
            if code in tasks:
                hidden = tasks[code].is_deleted
                item.link, item.link_label = ("/approvals", "Open approvals") if hidden else (f"/tasks/{tasks[code].id}", "Open task")
                break
            if code in projects:
                item.link, item.link_label = f"/projects/{projects[code].id}", "Open project"
                break
        if not item.link:
            title = n.title.lower()
            if n.kind == "approval":
                item.link, item.link_label = "/approvals", "Open approvals"
            elif n.kind == "meeting" or title.startswith(("decision", "management action", "you are accountable for action")):
                item.link, item.link_label = "/governance", "Open actions & decisions"
        out.append(item)
    return out


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
