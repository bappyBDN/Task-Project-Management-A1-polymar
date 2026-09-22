"""Standalone scheduler process for the `scheduler` Docker service.

Runs the email-notification scan on an interval, completely independent of
the backend web process. This is what makes the 4-container setup safe:
the web container (backend) has run_scheduler_in_process=False, so the job
only ever runs HERE — never duplicated, never double-sending emails.

Run directly (not through uvicorn):
    python -m app.scheduler_worker
"""
import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.config import settings
from app.database import SessionLocal
from app import notifications_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("scheduler_worker")


def run_email_scan_job():
    db = SessionLocal()
    try:
        result = notifications_job.run_all(db)
        logger.info("Email scan finished: %s", result)
    except Exception:
        logger.exception("Email scan failed")
    finally:
        db.close()


if __name__ == "__main__":
    logger.info(
        "Scheduler worker starting — running every %s minutes",
        settings.email_scan_interval_minutes,
    )
    # Run once immediately so you see it work right away, instead of waiting
    # a full interval after the container starts.
    run_email_scan_job()

    scheduler = BlockingScheduler(timezone="Asia/Dhaka")
    scheduler.add_job(
        run_email_scan_job,
        trigger="interval",
        minutes=settings.email_scan_interval_minutes,
        id="email_scan_job",
    )
    scheduler.start()