"""Gmail-based email notifications.

Sends mail through Gmail's SMTP server (smtp.gmail.com) using an
*App Password* — not your normal Gmail login password.

Setup (one-time):
  1. Turn on 2-Step Verification on the sending Gmail account.
  2. Generate an App Password at https://myaccount.google.com/apppasswords
     (choose app = "Mail", device = "Other" -> name it e.g. "TaskManager").
  3. Put these in your project's .env file:
       GMAIL_USER=youraddress@gmail.com
       GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16 characters, no spaces)
       MAIL_ENABLED=true

Nothing else in the app needs to change — every function below reads
credentials from app.config.settings, so swapping accounts is just an
.env edit.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config import settings

logger = logging.getLogger("app.email")


def _send(to_addrs: list[str], subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
    """Low-level sender. Returns True only if the SMTP call actually succeeded."""
    to_addrs = [a for a in dict.fromkeys(a.strip() for a in to_addrs if a)]
    if not to_addrs:
        logger.info("No recipients for '%s' — skipping.", subject)
        return False
    if not settings.mail_enabled:
        logger.info("MAIL_ENABLED=false — would have sent '%s' to %s", subject, to_addrs)
        return False
    if not settings.gmail_user or not settings.gmail_app_password:
        logger.warning("Gmail credentials missing (GMAIL_USER / GMAIL_APP_PASSWORD) — skipping '%s'.", subject)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.gmail_user
    msg["To"] = ", ".join(to_addrs)
    msg.attach(MIMEText(text_body or "Please view this email in an HTML-capable client.", "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as server:
            server.login(settings.gmail_user, settings.gmail_app_password)
            server.sendmail(settings.gmail_user, to_addrs, msg.as_string())
        logger.info("Email sent: '%s' -> %s", subject, to_addrs)
        return True
    except Exception:
        logger.exception("Failed to send email '%s' to %s", subject, to_addrs)
        return False


# ---------------------------------------------------------------- HTML template helper
def _card(title: str, color: str, rows: dict, footer_note: str = "") -> str:
    row_html = "".join(
        f'<tr>'
        f'<td style="padding:6px 12px;color:#666;font-size:13px;white-space:nowrap;">{k}</td>'
        f'<td style="padding:6px 12px;font-size:13px;font-weight:600;color:#222;">{v}</td>'
        f'</tr>'
        for k, v in rows.items() if v not in (None, "")
    )
    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;">
      <div style="background:{color};padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">{title}</h2>
      </div>
      <div style="border:1px solid #eee;border-top:none;padding:16px 20px;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;">{row_html}</table>
        <p style="color:#888;font-size:12px;margin-top:16px;">{footer_note}</p>
      </div>
    </div>
    """


# ---------------------------------------------------------------- Task completed
def send_task_completed_email(task, project_name: Optional[str], recipients: list[str]) -> bool:
    subject = f"Task Completed: {task.code} - {task.title}"
    html = _card(
        "✅ Task Completed", "#22a06b",
        {
            "Task": f"{task.code} — {task.title}",
            "Project": project_name or "—",
            "Completed on": task.actual_due_date,
            "Final progress": f"{task.progress_pct}%",
            "Remarks": task.completion_remarks or "—",
        },
        "Automated notification from the Anwar Task &amp; Project Management System.",
    )
    return _send(recipients, subject, html)


# ---------------------------------------------------------------- Task due / overdue
def send_task_due_email(task, project_name: Optional[str], days_offset: int, recipients: list[str]) -> bool:
    """days_offset: negative for future (due-soon), 0 = due today, positive = days overdue."""
    if days_offset > 0:
        subject = f"OVERDUE Task: {task.code} - {days_offset} day(s) overdue"
        title, color = "⚠️ Task Overdue", "#d9534f"
    elif days_offset == 0:
        subject = f"Task Due Today: {task.code}"
        title, color = "⏰ Task Due Today", "#e0a800"
    else:
        subject = f"Upcoming Task Due: {task.code} (in {abs(days_offset)} day(s))"
        title, color = "🔔 Task Due Soon", "#3b82f6"

    html = _card(
        title, color,
        {
            "Task": f"{task.code} — {task.title}",
            "Project": project_name or "—",
            "Priority": task.priority,
            "Status": task.status,
            "Due date": task.approved_due_date or task.baseline_due_date,
            "Progress": f"{task.progress_pct}%",
        },
        "Please update task progress, or raise a Delay RCA if this task cannot be completed on time.",
    )
    return _send(recipients, subject, html)


# ---------------------------------------------------------------- Stale backlog item
def send_backlog_stale_email(item, project_name: Optional[str], days_open: int, recipients: list[str]) -> bool:
    subject = f"Backlog Item Needs Attention: {item.code}"
    html = _card(
        "📋 Backlog Item Pending", "#6c5ce7",
        {
            "Backlog item": f"{item.code} — {item.requirement}",
            "Project": project_name or "—",
            "Status": item.status,
            "Priority": item.priority,
            "Open for": f"{days_open} day(s)",
        },
        "This backlog item has been open without progress. Please review and prioritize or convert it to a task.",
    )
    return _send(recipients, subject, html)


# ---------------------------------------------------------------- Password reset
def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    subject = "Reset your password — Anwar Task Manager"
    html = _card(
        "🔑 Password Reset Requested", "#3b82f6",
        {"Account": to_email},
        (
            f'<a href="{reset_link}" style="display:inline-block;margin-top:10px;'
            f'padding:10px 18px;background:#3b82f6;color:#fff;border-radius:6px;'
            f'text-decoration:none;font-weight:600;">Reset Password</a>'
            f'<div style="margin-top:14px;font-size:12px;color:#999;">'
            f'If the button doesn\'t work, copy this link: {reset_link}<br>'
            f'This link expires in 1 hour. If you didn\'t request this, ignore this email.</div>'
        ),
    )
    return _send([to_email], subject, html)