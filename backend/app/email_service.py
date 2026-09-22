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
import html
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Optional

from app.config import settings

logger = logging.getLogger("app.email")


def _filter_allowed(to_addrs: list[str]) -> list[str]:
    """TEST MODE guard: when MAIL_ALLOWED_RECIPIENTS is set, drop everyone else."""
    allowed = settings.mail_allowed_list
    if not allowed:
        return to_addrs
    kept = [a for a in to_addrs if a.lower() in allowed]
    dropped = [a for a in to_addrs if a.lower() not in allowed]
    if dropped:
        logger.info("Test mode: not sending to %s (not in MAIL_ALLOWED_RECIPIENTS).", dropped)
    return kept


def _send(to_addrs: list[str], subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
    """Low-level sender. Returns True only if the SMTP call actually succeeded."""
    to_addrs = [a for a in dict.fromkeys(a.strip() for a in to_addrs if a)]
    to_addrs = _filter_allowed(to_addrs)
    if not to_addrs:
        logger.info("No (allowed) recipients for '%s' — skipping.", subject)
        return False
    if not settings.mail_enabled:
        logger.info("MAIL_ENABLED=false — would have sent '%s' to %s", subject, to_addrs)
        return False
    password = settings.gmail_app_password.replace(" ", "")  # Google shows it as "xxxx xxxx xxxx xxxx"
    if not settings.gmail_user or not password:
        logger.warning("Gmail credentials missing (GMAIL_USER / GMAIL_APP_PASSWORD) — skipping '%s'.", subject)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr(("Anwar Task Manager", settings.gmail_user))
    msg["To"] = ", ".join(to_addrs)
    msg.attach(MIMEText(text_body or "Please view this email in an HTML-capable client.", "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        if settings.smtp_port == 465:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds)
        else:  # 587 etc. -> STARTTLS
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds)
            server.starttls()
        with server:
            server.login(settings.gmail_user, password)
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
        f'<td style="padding:6px 12px;font-size:13px;font-weight:600;color:#222;">{html.escape(str(v))}</td>'
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


# ---------------------------------------------------------------- Connectivity test
def send_test_email(recipients: list[str]) -> bool:
    html_body = _card(
        "✉️ Test email", "#0b1f3a",
        {"Status": "Gmail SMTP is configured correctly."},
        "You can ignore this message — it was triggered from /notifications/email-test.",
    )
    return _send(recipients, "Task Manager — test email", html_body)

#---------------------------------------forget password 
# ---------------------------------------------------------------- Password reset
def send_password_reset_email(user_name: str, to_email: str, reset_link: str) -> bool:
    """Send the 'reset your password' link. Uses the same _send pipeline as all other mail,
    so MAIL_ENABLED / MAIL_ALLOWED_RECIPIENTS / Gmail App Password all apply automatically."""
    subject = "Reset your Anwar Task Manager password"

    button_html = (
        f'<p style="text-align:center;margin:24px 0;">'
        f'<a href="{html.escape(reset_link)}" '
        f'style="background:#0b1f3a;color:#fff;padding:12px 22px;border-radius:6px;'
        f'text-decoration:none;font-weight:600;display:inline-block;">'
        f'Reset Password</a></p>'
    )
    link_fallback = (
        f'<p style="color:#666;font-size:12px;margin:16px 0 4px;">If the button does not work, copy this link:</p>'
        f'<p style="word-break:break-all;font-size:12px;">'
        f'<a href="{html.escape(reset_link)}" style="color:#0056b3;">{html.escape(reset_link)}</a></p>'
    )

    html_body = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;">
      <div style="background:#0b1f3a;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">Password Reset Request</h2>
      </div>
      <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
        <p>Hello {html.escape(user_name)},</p>
        <p>We received a request to reset your Anwar Task Manager password.
           Click the button below to choose a new one. This link is valid for
           <b>1 hour</b>.</p>
        {button_html}
        {link_fallback}
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
        <p style="color:#888;font-size:12px;">
          If you did not request a password reset, you can safely ignore this email
          — your current password will remain unchanged.
        </p>
      </div>
    </div>
    """

    text_body = (
        f"Hello {user_name},\n\n"
        f"Use the link below to reset your Anwar Task Manager password (valid 1 hour):\n"
        f"{reset_link}\n\n"
        f"If you did not request this, ignore this email.\n"
    )

    return _send([to_email], subject, html_body, text_body=text_body)

# ---------------------------------------------------------------- Welcome / set password
def send_welcome_set_password_email(
    user_name: str,
    to_email: str,
    set_link: str,
    expires_hours: int = 24,
) -> bool:
    """Sent when an admin creates a new user account. The user sets their own
    password via the same /reset-password page used by Forgot Password."""
    subject = "Your Anwar Task Manager account is ready — set your password"

    button_html = (
        f'<p style="text-align:center;margin:24px 0;">'
        f'<a href="{html.escape(set_link)}" '
        f'style="background:#0b1f3a;color:#fff;padding:12px 22px;border-radius:6px;'
        f'text-decoration:none;font-weight:600;display:inline-block;">'
        f'Set Your Password</a></p>'
    )
    link_fallback = (
        f'<p style="color:#666;font-size:12px;margin:16px 0 4px;">If the button does not work, copy this link:</p>'
        f'<p style="word-break:break-all;font-size:12px;">'
        f'<a href="{html.escape(set_link)}" style="color:#0056b3;">{html.escape(set_link)}</a></p>'
    )

    html_body = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;">
      <div style="background:#0b1f3a;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">Welcome to Anwar Task Manager</h2>
      </div>
      <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
        <p>Hello {html.escape(user_name)},</p>
        <p>
          The administrator has created your account on the
          <b>Anwar Group Task &amp; Project Management System</b>.
          Please set your password using the button below so you can sign in.
        </p>
        <p style="background:#fdf3d7;border-left:4px solid #e0a800;padding:10px 14px;
                  border-radius:4px;font-size:13px;margin:14px 0;">
          ⏱ <b>Please note:</b> This link is valid for <b>{expires_hours} hours</b>.
          If it expires, ask your administrator to re-send, or use
          <i>Forgot Password</i> on the login page.
        </p>
        {button_html}
        {link_fallback}
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
        <p style="color:#888;font-size:12px;">
          If you were not expecting this email, you can safely ignore it.
        </p>
      </div>
    </div>
    """

    text_body = (
        f"Hello {user_name},\n\n"
        f"Your Anwar Task Manager account has been created.\n"
        f"Set your password using the link below (valid for {expires_hours} hours):\n"
        f"{set_link}\n\n"
        f"If you were not expecting this, ignore this email.\n"
    )

    return _send([to_email], subject, html_body, text_body=text_body)