"""Automated email-notification scan.

Three things are checked every run:
  1. Tasks that just became completed/closed        -> email supervisors.
  2. Tasks that are overdue or due soon              -> email assignee + supervisors.
  3. Backlog items sitting open too long             -> email requester + supervisors.

"Supervisors" = the project's manager and sponsor (models.Project.manager_id /
sponsor_id). Each entity+email_type is only ever emailed once per calendar
day (tracked in models.EmailLog), so re-running this job frequently is safe
and won't spam anyone.

Trigger it either:
  - manually:    POST /notifications/email-scan/run
  - automatically: the background job in app/scheduler.py (started from main.py)

TESTING: pass force=True (or POST /notifications/email-scan/run?force=true)
to bypass the "already sent today" check and resend immediately — handy
while testing, since normally you'd have to wait until the next calendar
day (or clear the email_logs table) to see the same email again.
"""
import logging
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app import models, email_service
from app.config import settings

logger = logging.getLogger("app.notifications_job")


# ---------------------------------------------------------------- Helpers
def _already_sent_today(db: Session, entity_type: str, entity_id: int, email_type: str) -> bool:
    return db.query(models.EmailLog).filter(
        models.EmailLog.entity_type == entity_type,
        models.EmailLog.entity_id == entity_id,
        models.EmailLog.email_type == email_type,
        models.EmailLog.sent_date == date.today(),
    ).first() is not None


def _mark_sent(db: Session, entity_type: str, entity_id: int, email_type: str, recipients: list[str]):
    """Insert today's log row — but only if one doesn't already exist, so
    calling this twice in force-mode never trips the unique constraint."""
    existing = db.query(models.EmailLog).filter(
        models.EmailLog.entity_type == entity_type,
        models.EmailLog.entity_id == entity_id,
        models.EmailLog.email_type == email_type,
        models.EmailLog.sent_date == date.today(),
    ).first()
    if existing:
        existing.recipients = ", ".join(recipients)
        return
    db.add(models.EmailLog(
        entity_type=entity_type, entity_id=entity_id, email_type=email_type,
        sent_date=date.today(), recipients=", ".join(recipients),
    ))


def _project_name(db: Session, project_id: Optional[int]) -> Optional[str]:
    if not project_id:
        return None
    p = db.get(models.Project, project_id)
    return p.name if p else None


def _project_supervisors(db: Session, project_id: Optional[int]) -> list[str]:
    """Emails of the project's manager + sponsor — the people accountable for the project."""
    if not project_id:
        return []
    p = db.get(models.Project, project_id)
    if not p:
        return []
    emails = []
    for uid in (p.manager_id, p.sponsor_id):
        if uid:
            u = db.get(models.User, uid)
            if u and u.is_active and u.email:
                emails.append(u.email)
    return emails


def _user_email(db: Session, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    u = db.get(models.User, user_id)
    return u.email if u and u.is_active else None


# ---------------------------------------------------------------- 1. Completed tasks
def run_task_completion_emails(db: Session, force: bool = False) -> int:
    tasks = db.query(models.Task).filter(
        models.Task.is_deleted.is_(False),
        models.Task.status.in_(["completed", "closed"]),
    ).all()
    sent = 0
    for t in tasks:
        if not force and _already_sent_today(db, "task", t.id, "completed"):
            continue
        recipients = _project_supervisors(db, t.project_id)
        acc_email = _user_email(db, t.accountable_id)
        if acc_email:
            recipients.append(acc_email)
        recipients = list(dict.fromkeys(recipients))
        if not recipients:
            continue
        if email_service.send_task_completed_email(t, _project_name(db, t.project_id), recipients):
            _mark_sent(db, "task", t.id, "completed", recipients)
            sent += 1
    db.commit()
    return sent


# ---------------------------------------------------------------- 2. Due / overdue tasks
def run_task_due_emails(db: Session, lookahead_days: Optional[int] = None, force: bool = False) -> int:
    lookahead_days = lookahead_days if lookahead_days is not None else settings.task_due_lookahead_days
    today = date.today()
    open_statuses = ["backlog", "ready", "in_progress", "in_review", "blocked", "on_hold"]
    tasks = db.query(models.Task).filter(
        models.Task.is_deleted.is_(False),
        models.Task.status.in_(open_statuses),
    ).all()
    sent = 0
    for t in tasks:
        due = t.approved_due_date or t.baseline_due_date
        if due is None:
            continue
        days_offset = (today - due).days  # positive = overdue, 0 = today, negative = future
        if days_offset < -lookahead_days:
            continue  # too far in the future, don't spam yet

        email_type = "overdue" if days_offset > 0 else f"due_{days_offset}"
        if not force and _already_sent_today(db, "task", t.id, email_type):
            continue

        recipients = []
        for uid in (t.responsible_id, t.accountable_id):
            e = _user_email(db, uid)
            if e:
                recipients.append(e)
        recipients += _project_supervisors(db, t.project_id)
        recipients = list(dict.fromkeys(recipients))
        if not recipients:
            continue

        if email_service.send_task_due_email(t, _project_name(db, t.project_id), days_offset, recipients):
            _mark_sent(db, "task", t.id, email_type, recipients)
            sent += 1
    db.commit()
    return sent


# ---------------------------------------------------------------- 3. Stale backlog items
def run_backlog_stale_emails(db: Session, stale_days: Optional[int] = None, force: bool = False) -> int:
    stale_days = stale_days if stale_days is not None else settings.backlog_stale_days
    today = date.today()
    items = db.query(models.BacklogItem).filter(
        models.BacklogItem.status.notin_(["converted"]),
    ).all()
    sent = 0
    for item in items:
        if not item.created_at:
            continue
        days_open = (today - item.created_at.date()).days
        if days_open < stale_days:
            continue
        if not force and _already_sent_today(db, "backlog", item.id, "stale"):
            continue

        recipients = []
        req_email = _user_email(db, item.requested_by_id)
        if req_email:
            recipients.append(req_email)
        recipients += _project_supervisors(db, item.project_id)
        recipients = list(dict.fromkeys(recipients))
        if not recipients:
            continue

        if email_service.send_backlog_stale_email(item, _project_name(db, item.project_id), days_open, recipients):
            _mark_sent(db, "backlog", item.id, "stale", recipients)
            sent += 1
    db.commit()
    return sent


# ---------------------------------------------------------------- Entry point
def run_all(db: Session, force: bool = False) -> dict:
    result = {
        "completed_emails_sent": run_task_completion_emails(db, force=force),
        "due_or_overdue_emails_sent": run_task_due_emails(db, force=force),
        "backlog_stale_emails_sent": run_backlog_stale_emails(db, force=force),
    }
    logger.info("Email scan finished (force=%s): %s", force, result)
    return result