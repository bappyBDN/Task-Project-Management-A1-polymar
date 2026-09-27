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