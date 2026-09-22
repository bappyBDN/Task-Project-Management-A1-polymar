"""Background scheduler — runs the email-notification scan automatically,
without needing an external cron job. Started once from main.py on startup.

Requires: pip install apscheduler
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app import notifications_job
from app.config import settings

logger = logging.getLogger("app.scheduler")
scheduler = BackgroundScheduler(timezone="Asia/Dhaka")


def _run_email_scan_job():
    db = SessionLocal()
    try:
        notifications_job.run_all(db)
    except Exception:
        logger.exception("Automated email scan failed.")
    finally:
        db.close()


def start_scheduler():
    if scheduler.get_jobs():
        return  # already started (e.g. reload)
    scheduler.add_job(
        _run_email_scan_job,
        trigger="interval",
        minutes=settings.email_scan_interval_minutes,
        id="email_scan_job",
        # NOTE: do NOT pass next_run_time=None here — in APScheduler that means "add the job
        # PAUSED", so the scan would never run. Omitting it = first run after one interval.
        coalesce=True,          # if several runs were missed, run once
        max_instances=1,        # never run two scans at the same time
        misfire_grace_time=300,
    )
    scheduler.start()
    logger.info("Email notification scheduler started — every %s minutes.", settings.email_scan_interval_minutes)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)