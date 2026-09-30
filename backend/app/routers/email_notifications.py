from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, notifications_job
from app.auth import get_admin_user
from app.database import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/email-scan/run")
def run_email_scan(force: bool = False, db: Session = Depends(get_db),
                   _admin: models.User = Depends(get_admin_user)):
    """Admin only. Manually trigger the completed / overdue-due / stale-backlog email scan.

    Pass ?force=true while testing to bypass the "already sent today" dedup
    check and resend immediately, e.g.:
        POST /notifications/email-scan/run?force=true
    """
    result = notifications_job.run_all(db, force=force)
    return {"ran": True, "forced": force, **result}

@router.get("/email-logs")
def list_email_logs(limit: int = 500, db: Session = Depends(get_db),
                    _admin: models.User = Depends(get_admin_user)):
    """Admin only. Newest-first history of automated emails the scheduler sent,
    with each log row's task / backlog item code and title filled in."""
    logs = (db.query(models.EmailLog)
            .order_by(models.EmailLog.sent_date.desc(), models.EmailLog.id.desc())
            .limit(limit).all())

    task_ids = {l.entity_id for l in logs if l.entity_type == "task"}
    backlog_ids = {l.entity_id for l in logs if l.entity_type == "backlog"}
    tasks = {t.id: (t.code, t.title) for t in
             db.query(models.Task).filter(models.Task.id.in_(task_ids))} if task_ids else {}
    backlogs = {b.id: (b.code, b.requirement) for b in
                db.query(models.BacklogItem).filter(models.BacklogItem.id.in_(backlog_ids))} if backlog_ids else {}

    out = []
    for l in logs:
        ref = (tasks if l.entity_type == "task" else backlogs).get(l.entity_id)
        out.append({
            "id": l.id,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "entity_code": ref[0] if ref else None,
            "entity_title": ref[1] if ref else None,
            "email_type": l.email_type,
            "sent_date": l.sent_date.isoformat() if l.sent_date else None,
            "recipients": l.recipients,
        })
    return out
