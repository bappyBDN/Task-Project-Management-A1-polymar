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
from datetime import date, datetime, timedelta
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
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


def _send(to_addrs: list[str], subject: str, html_body: str, text_body: Optional[str] = None,
          attachments: Optional[list] = None) -> bool:
    """Low-level sender. Returns True only if the SMTP call actually succeeded.

    attachments (optional): list of (filename, mime_type, content_str), e.g.
    ("invite.ics", "text/calendar", "..."). Existing callers don't pass it, so
    their emails are built exactly as before.
    """
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

    body = MIMEMultipart("alternative")
    body.attach(MIMEText(text_body or "Please view this email in an HTML-capable client.", "plain", "utf-8"))
    body.attach(MIMEText(html_body, "html", "utf-8"))
    if attachments:
        # mixed = the text/HTML body plus file attachments
        msg = MIMEMultipart("mixed")
        msg.attach(body)
        for filename, mime_type, content in attachments:
            maintype, subtype = mime_type.split("/", 1)
            part = MIMEBase(maintype, subtype, name=filename)
            part.set_payload(content.encode("utf-8"))
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)
    else:
        msg = body  # unchanged behaviour for every existing email
    msg["Subject"] = subject
    msg["From"] = formataddr(("Anwar Task Manager", settings.gmail_user))
    msg["To"] = ", ".join(to_addrs)

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


# ---------------------------------------------------------------- Meeting invitation
MEETING_TZ_OFFSET_HOURS = 6       # Bangladesh Standard Time (UTC+6, no daylight saving)
MEETING_TZ_LABEL = "Bangladesh Time"
MEETING_DEFAULT_MINUTES = 60      # meetings have a start time only; calendars get a 1-hour slot


def _ics_escape(v: str) -> str:
    return (v or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def _ics_fold(line: str) -> str:
    """Calendar files must wrap lines longer than 75 bytes."""
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode("utf-8")) > 73:
            out.append(cur)
            cur = " " + ch
        else:
            cur += ch
    out.append(cur)
    return "\r\n".join(out)


def build_meeting_ics(meeting_id: int, title: str, meeting_date: date, meeting_time: str,
                      purpose: str, location: Optional[str], project_label: str,
                      organizer_name: str) -> str:
    """A standard .ics calendar entry (opens in Outlook, Google Calendar, Apple Calendar)."""
    h, m = (int(x) for x in meeting_time.split(":"))
    start_local = datetime(meeting_date.year, meeting_date.month, meeting_date.day, h, m)
    start_utc = start_local - timedelta(hours=MEETING_TZ_OFFSET_HOURS)
    end_utc = start_utc + timedelta(minutes=MEETING_DEFAULT_MINUTES)
    fmt = "%Y%m%dT%H%M%SZ"
    description = f"Project: {project_label}\nOrganised by: {organizer_name}\n\nPurpose / Agenda:\n{purpose}"
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Anwar Group//Task Manager//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:meeting-{meeting_id}@anwar-task-manager",
        f"DTSTAMP:{datetime.utcnow().strftime(fmt)}",
        f"DTSTART:{start_utc.strftime(fmt)}",
        f"DTEND:{end_utc.strftime(fmt)}",
        f"SUMMARY:{_ics_escape(title)}",
        f"DESCRIPTION:{_ics_escape(description)}",
    ]
    if location:
        lines.append(f"LOCATION:{_ics_escape(location)}")
    lines += [
        "BEGIN:VALARM",
        "TRIGGER:-PT30M",
        "ACTION:DISPLAY",
        "DESCRIPTION:Meeting reminder",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(_ics_fold(l) for l in lines) + "\r\n"


def send_meeting_invite_email(
    to_email: str,
    recipient_name: str,
    roles: list[str],
    meeting_id: int,
    title: str,
    meeting_type: str,
    meeting_date: date,
    meeting_time: str,
    purpose: str,
    location: Optional[str],
    project_label: str,
    organizer_name: str,
) -> bool:
    """Formal meeting invitation to one project member, with a calendar (.ics) attachment."""
    h, m = (int(x) for x in meeting_time.split(":"))
    time_12h = datetime(2000, 1, 1, h, m).strftime("%I:%M %p").lstrip("0")
    date_long = meeting_date.strftime("%A, %d %B %Y")
    date_short = meeting_date.strftime("%a, %d %b %Y")
    type_label = (meeting_type or "meeting").replace("_", " ").title()
    role_text = ", ".join(roles) if roles else "Project Member"
    link = f"{settings.frontend_url.rstrip('/')}/governance"
    e = html.escape

    subject = f"Meeting Invitation: {title} - {date_short}, {time_12h}"

    rows = [
        ("Meeting", title),
        ("Project", project_label),
        ("Date", date_long),
        ("Time", f"{time_12h} ({MEETING_TZ_LABEL})"),
        ("Location / Link", location or ""),
        ("Meeting Type", type_label),
        ("Organised by", organizer_name),
        ("Your Role", role_text),
    ]
    row_html = "".join(
        f'<tr><td style="padding:8px 14px;color:#5b6472;font-size:13px;white-space:nowrap;'
        f'border-bottom:1px solid #eef1f5;width:130px;">{e(k)}</td>'
        f'<td style="padding:8px 14px;font-size:13px;font-weight:600;color:#1a2333;'
        f'border-bottom:1px solid #eef1f5;">{e(v)}</td></tr>'
        for k, v in rows if v
    )

    html_body = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#1a2333;">
      <div style="background:#0b1f3a;padding:18px 22px;border-radius:8px 8px 0 0;">
        <div style="color:#c8a24b;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Anwar Group &middot; Meeting Invitation</div>
        <h2 style="color:#ffffff;margin:6px 0 0;font-size:20px;">{e(title)}</h2>
      </div>
      <div style="border:1px solid #e3e8f0;border-top:none;padding:22px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 12px;">Dear {e(recipient_name)},</p>
        <p style="margin:0 0 18px;line-height:1.5;">
          You are cordially invited to attend the following meeting for the project
          <b>{e(project_label)}</b>, in which you are listed as <b>{e(role_text)}</b>.
          Your presence and input are important for the discussion.
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5;border-radius:6px;">{row_html}</table>
        <div style="margin:18px 0 0;padding:14px 16px;background:#f4f6fa;border-left:4px solid #c8a24b;border-radius:4px;">
          <div style="font-size:12px;color:#5b6472;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Purpose / Agenda</div>
          <div style="font-size:14px;line-height:1.55;white-space:pre-wrap;">{e(purpose)}</div>
        </div>
        <p style="margin:18px 0 0;line-height:1.5;">
          Kindly plan to join on time and come prepared with any updates relevant to your role.
          A calendar invitation (<b>invite.ics</b>) is attached &mdash; open it to add this meeting to
          Outlook, Google Calendar or your phone's calendar.
        </p>
        <p style="text-align:center;margin:22px 0 6px;">
          <a href="{e(link)}" style="background:#0b1f3a;color:#ffffff;padding:11px 22px;border-radius:6px;
             text-decoration:none;font-weight:600;display:inline-block;">View in Task Manager</a>
        </p>
        <p style="margin:18px 0 0;">Best regards,<br><b>{e(organizer_name)}</b><br>
          <span style="color:#5b6472;font-size:13px;">Anwar Group Task &amp; Project Management System</span></p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0 10px;">
        <p style="color:#888;font-size:11px;margin:0;">
          You received this invitation because you are Responsible, Accountable or Reviewer on a task in this project.
          This is an automated message; please contact the organiser directly with any questions.
        </p>
      </div>
    </div>
    """

    text_lines = [
        f"Dear {recipient_name},",
        "",
        f"You are invited to the following meeting for the project {project_label}, "
        f"in which you are listed as {role_text}.",
        "",
    ] + [f"{k}: {v}" for k, v in rows if v] + [
        "",
        "Purpose / Agenda:",
        purpose,
        "",
        "A calendar invitation (invite.ics) is attached.",
        f"View in Task Manager: {link}",
        "",
        "Best regards,",
        organizer_name,
        "Anwar Group Task & Project Management System",
    ]

    ics = build_meeting_ics(meeting_id, title, meeting_date, meeting_time, purpose, location,
                            project_label, organizer_name)
    return _send([to_email], subject, html_body, text_body="\n".join(text_lines),
                 attachments=[("invite.ics", "text/calendar", ics)])

# ---------------------------------------------------------------- New comment
def send_comment_email(to_email: str, recipient_name: str, recipient_role: str, entity_type: str,
                       subject_label: str, project_label: str, commenter_name: str,
                       commenter_employee_id: Optional[str], comment: str, sent_at: datetime,
                       link: str, reply_to: Optional[str] = None) -> bool:
    """Tells the Project Manager (project comment) or the task's Responsible person
    (task comment) that someone commented. With `reply_to` (the original comment's
    text) it is a reply notice instead; recipient_role "comment author" means the
    recipient wrote that original comment."""
    e = html.escape
    what = "task" if entity_type == "task" else "project"
    by = f"{commenter_name} ({commenter_employee_id})" if commenter_employee_id else commenter_name
    # stored in UTC; shown in Bangladesh time like the meeting invitations
    when = (sent_at + timedelta(hours=MEETING_TZ_OFFSET_HOURS)).strftime("%d %b %Y, %I:%M %p") + f" ({MEETING_TZ_LABEL})"
    is_reply = reply_to is not None
    if is_reply:
        subject = f"New reply on {what} {subject_label}"
        heading = f"💬 New reply on a {what} comment"
        if recipient_role == "comment author":
            intro = f"{commenter_name} replied to your comment on a {what}."
        else:
            intro = f"{commenter_name} replied to a comment on a {what} where you are the {recipient_role}."
    else:
        subject = f"New comment on {what} {subject_label}"
        heading = f"💬 New comment on your {what}"
        intro = f"{commenter_name} commented on a {what} where you are the {recipient_role}."

    rows = [("Task" if what == "task" else "Project", subject_label)]
    if what == "task" and project_label:
        rows.append(("Project", project_label))
    rows += [("Reply by" if is_reply else "Comment by", by), ("Sent", when)]
    row_html = "".join(
        f'<tr><td style="padding:6px 12px;color:#666;font-size:13px;white-space:nowrap;">{e(k)}</td>'
        f'<td style="padding:6px 12px;font-size:13px;font-weight:600;color:#222;">{e(v)}</td></tr>'
        for k, v in rows
    )
    html_body = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;">
      <div style="background:#0b1f3a;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">{e(heading)}</h2>
      </div>
      <div style="border:1px solid #eee;border-top:none;padding:16px 20px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 12px;">Hello {e(recipient_name)},</p>
        <p style="margin:0 0 12px;">{e(intro)}</p>
        <table style="width:100%;border-collapse:collapse;">{row_html}</table>
        {f'''<div style="margin:14px 0 0;font-size:12px;color:#666;">Original comment:</div>
        <div style="margin:4px 0 0;padding:10px 14px;background:#fafafa;border-left:4px solid #ccc;border-radius:4px;
                    font-size:13px;color:#555;line-height:1.5;white-space:pre-wrap;">{e(reply_to)}</div>
        <div style="margin:12px 0 0;font-size:12px;color:#666;">Reply:</div>''' if is_reply else ''}
        <div style="margin:14px 0 0;padding:12px 14px;background:#f4f6fa;border-left:4px solid #c8a24b;border-radius:4px;
                    font-size:14px;line-height:1.5;white-space:pre-wrap;">{e(comment)}</div>
        <p style="text-align:center;margin:20px 0 6px;">
          <a href="{e(link)}" style="background:#0b1f3a;color:#fff;padding:10px 20px;border-radius:6px;
             text-decoration:none;font-weight:600;display:inline-block;">Open in Task Manager</a>
        </p>
        <p style="color:#888;font-size:12px;margin-top:16px;">Automated notification from the Anwar Task &amp; Project Management System.</p>
      </div>
    </div>
    """
    text_body = "\n".join(
        [f"Hello {recipient_name},", "", intro, ""]
        + [f"{k}: {v}" for k, v in rows]
        + (["", "Original comment:", reply_to] if is_reply else [])
        + ["", "Reply:" if is_reply else "Comment:", comment, "", f"Open: {link}"]
    )
    return _send([to_email], subject, html_body, text_body=text_body)
