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

Every email uses one layout (`_layout`): the Anwar Group logo and the system name at
the top, a titled band, the message, and a standard footer. The logo travels inside
the email itself (app/assets/anwars-logo.jpg, attached inline), so it shows without
the reader's mail program having to download anything from our server.
"""
import html
import logging
import smtplib
from datetime import date, datetime, timedelta
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
from email.utils import formataddr
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger("app.email")

# ---------------------------------------------------------------- branding
SYSTEM_NAME = "Task and Project Management System of AGI"   # sender name, footer, sign-off
SYSTEM_TITLE = "Task and Project Management System"         # next to the logo
ORG_NAME = "Anwar Group of Industries (AGI)"

NAVY, GOLD, INK, MUTED, LINE = "#0b1f3a", "#c8a24b", "#1a2333", "#5b6472", "#e3e8f0"
GREEN, AMBER, RED, BLUE, PURPLE = "#1a8f5c", "#d9940a", "#c9342b", "#1d6bff", "#5b4bc4"
FONT = "'Segoe UI',Arial,Helvetica,sans-serif"

LOGO_CID = "agi-logo"
try:
    _LOGO: Optional[bytes] = (Path(__file__).parent / "assets" / "anwars-logo.jpg").read_bytes()
except OSError:  # the mail still goes out, with the name where the logo would be
    _LOGO = None
    logger.warning("Email logo (app/assets/anwars-logo.jpg) not found - emails are sent without it.")


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


def _build_message(to_addrs: list[str], subject: str, html_body: str, text_body: Optional[str] = None,
                   attachments: Optional[list] = None):
    """The complete email: text + HTML, the inline logo, and any file attachments."""
    body = MIMEMultipart("alternative")
    body.attach(MIMEText(text_body or "Please view this email in an HTML-capable client.", "plain", "utf-8"))
    body.attach(MIMEText(html_body, "html", "utf-8"))
    msg = body
    if _LOGO and f"cid:{LOGO_CID}" in html_body:
        # related = the HTML plus the picture it shows
        msg = MIMEMultipart("related")
        msg.attach(body)
        logo = MIMEImage(_LOGO, _subtype="jpeg")
        logo.add_header("Content-ID", f"<{LOGO_CID}>")
        logo.add_header("Content-Disposition", "inline", filename="anwar-group-logo.jpg")
        msg.attach(logo)
    if attachments:
        # mixed = the message plus file attachments
        outer = MIMEMultipart("mixed")
        outer.attach(msg)
        for filename, mime_type, content in attachments:
            maintype, subtype = mime_type.split("/", 1)
            part = MIMEBase(maintype, subtype, name=filename)
            part.set_payload(content.encode("utf-8"))
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=filename)
            outer.attach(part)
        msg = outer
    msg["Subject"] = subject
    msg["From"] = formataddr((SYSTEM_NAME, settings.gmail_user))
    msg["To"] = ", ".join(to_addrs)
    return msg


def _send(to_addrs: list[str], subject: str, html_body: str, text_body: Optional[str] = None,
          attachments: Optional[list] = None) -> bool:
    """Low-level sender. Returns True only if the SMTP call actually succeeded.

    attachments (optional): list of (filename, mime_type, content_str), e.g.
    ("invite.ics", "text/calendar", "...").
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

    msg = _build_message(to_addrs, subject, html_body, text_body, attachments)
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


# ---------------------------------------------------------------- shared layout
# Tables and inline styles only: that is what Outlook, Gmail and phone mail apps all render.
def _layout(kicker: str, title: str, inner_html: str, accent: str = GOLD, preheader: str = "") -> str:
    """The frame every email uses. `kicker` is the small line above the title
    ("Reminder", "Meeting Invitation"); `accent` colours the strip under the title band;
    `preheader` is the preview line mail apps show next to the subject."""
    e = html.escape
    logo = (f'<img src="cid:{LOGO_CID}" alt="Anwar Group" height="54" '
            f'style="display:block;border:0;outline:none;height:54px;width:auto;">') if _LOGO else (
            f'<div style="font-size:18px;font-weight:700;color:{RED};letter-spacing:1px;">ANWAR GROUP</div>')
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f2f4f8;font-size:1px;line-height:1px;">{e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4f8;">
 <tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:100%;max-width:600px;background:#ffffff;border:1px solid {LINE};border-radius:10px;font-family:{FONT};color:{INK};">
   <tr><td style="padding:18px 26px;border-bottom:3px solid {GOLD};border-radius:10px 10px 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
     <td width="90" valign="middle">{logo}</td>
     <td align="right" valign="middle" style="font-family:{FONT};">
      <div style="font-size:15px;font-weight:700;color:{NAVY};line-height:1.3;">{SYSTEM_TITLE}</div>
      <div style="font-size:12px;color:{MUTED};letter-spacing:.3px;margin-top:2px;">{ORG_NAME}</div>
     </td>
    </tr></table>
   </td></tr>
   <tr><td style="background:{NAVY};padding:18px 26px 16px;font-family:{FONT};">
    <div style="color:{GOLD};font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;">{e(kicker)}</div>
    <div style="color:#ffffff;font-size:20px;font-weight:600;line-height:1.35;margin-top:4px;">{e(title)}</div>
   </td></tr>
   <tr><td style="height:4px;line-height:4px;font-size:0;background:{accent};">&nbsp;</td></tr>
   <tr><td style="padding:26px;font-family:{FONT};font-size:14px;line-height:1.65;color:{INK};">
{inner_html}
   </td></tr>
   <tr><td style="padding:16px 26px;background:#f7f9fc;border-top:1px solid {LINE};border-radius:0 0 10px 10px;
              font-family:{FONT};font-size:11.5px;line-height:1.6;color:#7a8699;">
    This is an automated message from the <b style="color:{MUTED};">{SYSTEM_NAME}</b>. Please do not reply to this email.<br>
    &copy; {date.today().year} Anwar Group of Industries. All rights reserved.
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>"""


def _p(text_html: str, margin: str = "0 0 14px") -> str:
    return f'<p style="margin:{margin};">{text_html}</p>'


def _greeting(name: Optional[str]) -> str:
    return _p(f"Dear {html.escape(name)}," if name else "Dear Colleague,")


def _rows(rows) -> str:
    """Details table: label on the left, value on the right. Empty values are left out."""
    e = html.escape
    items = [(k, v) for k, v in (rows.items() if isinstance(rows, dict) else rows) if v not in (None, "")]
    if not items:
        return ""
    body = "".join(
        f'<tr><td style="padding:9px 14px;width:150px;font-size:13px;color:{MUTED};background:#f7f9fc;'
        f'border-bottom:1px solid #eef1f5;vertical-align:top;">{e(str(k))}</td>'
        f'<td style="padding:9px 14px;font-size:13.5px;font-weight:600;color:{INK};border-bottom:1px solid #eef1f5;'
        f'vertical-align:top;">{e(str(v))}</td></tr>'
        for k, v in items
    )
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="border:1px solid #eef1f5;border-bottom:0;border-radius:6px;margin:4px 0 18px;">{body}</table>')


def _button(label: str, link: str) -> str:
    e = html.escape
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:22px auto 8px;">'
            f'<tr><td align="center" bgcolor="{NAVY}" style="border-radius:6px;">'
            f'<a href="{e(link)}" style="display:inline-block;padding:12px 28px;font-family:{FONT};font-size:14px;'
            f'font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">{e(label)}</a></td></tr></table>')


def _link_fallback(link: str) -> str:
    e = html.escape
    return (f'<p style="margin:14px 0 0;font-size:12px;color:{MUTED};">If the button does not work, copy this link into your browser:<br>'
            f'<a href="{e(link)}" style="color:{BLUE};word-break:break-all;">{e(link)}</a></p>')


def _note(text_html: str, color: str = GOLD, bg: str = "#fbf6e9") -> str:
    """A highlighted line: an instruction, a deadline, a warning."""
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px;">'
            f'<tr><td style="padding:12px 16px;background:{bg};border-left:4px solid {color};border-radius:4px;'
            f'font-size:13.5px;line-height:1.55;color:{INK};">{text_html}</td></tr></table>')


def _quote(label: str, text: str, color: str = GOLD, bg: str = "#f4f6fa") -> str:
    """Someone's own words (a comment, an agenda, a note), kept exactly as written."""
    e = html.escape
    return (f'<div style="margin:0 0 6px;font-size:11.5px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:{MUTED};">{e(label)}</div>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">'
            f'<tr><td style="padding:12px 16px;background:{bg};border-left:4px solid {color};border-radius:4px;'
            f'font-size:14px;line-height:1.6;color:{INK};white-space:pre-wrap;">{e(text)}</td></tr></table>')


def _small(text_html: str) -> str:
    return f'<p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#7a8699;">{text_html}</p>'


def _signoff() -> str:
    return (f'<p style="margin:20px 0 0;">Regards,<br><b>{SYSTEM_NAME}</b><br>'
            f'<span style="font-size:12.5px;color:{MUTED};">Anwar Group of Industries</span></p>')


TEXT_SIGNOFF = f"\nRegards,\n{SYSTEM_NAME}\nAnwar Group of Industries\n"


def _card(title: str, color: str, rows: dict, footer_note: str = "", kicker: str = "Notification",
          intro: str = "") -> str:
    """A simple notice: a details table and one closing line."""
    inner = _greeting(None) + (_p(html.escape(intro)) if intro else "") + _rows(rows) + (_p(footer_note, "0") if footer_note else "") + _signoff()
    return _layout(kicker, title, inner, accent=color, preheader=intro or title)


def _fmt_date(d) -> str:
    return d.strftime("%d %b %Y") if isinstance(d, (date, datetime)) else (str(d) if d else "")


def _label(v) -> str:
    return str(v).replace("_", " ").title() if v else ""


def _pct(v) -> str:
    try:
        return f"{float(v):g}%"
    except (TypeError, ValueError):
        return ""


# ---------------------------------------------------------------- Task completed
def send_task_completed_email(task, project_name: Optional[str], recipients: list[str]) -> bool:
    subject = f"Task Completed: {task.code} - {task.title}"
    body = _card(
        "Task Completed", GREEN,
        {
            "Task": f"{task.code} — {task.title}",
            "Project": project_name or "—",
            "Completed on": _fmt_date(task.actual_due_date),
            "Final progress": _pct(task.progress_pct),
            "Remarks": task.completion_remarks or "—",
        },
        "No further action is required for this task.",
        kicker="Task Update",
        intro="The following task has been completed and approved.",
    )
    return _send(recipients, subject, body)


# ---------------------------------------------------------------- Task due / overdue
def send_task_due_email(task, project_name: Optional[str], days_offset: int, recipients: list[str]) -> bool:
    """days_offset: negative for future (due-soon), 0 = due today, positive = days overdue."""
    if days_offset > 0:
        subject = f"Overdue Task: {task.code} - {days_offset} day(s) overdue"
        title, color, kicker = "Task Overdue", RED, "Action Required"
        intro = f"The following task is {days_offset} day(s) past its due date and needs your attention."
    elif days_offset == 0:
        subject = f"Task Due Today: {task.code}"
        title, color, kicker = "Task Due Today", AMBER, "Reminder"
        intro = "The following task is due today."
    else:
        subject = f"Upcoming Task Due: {task.code} (in {abs(days_offset)} day(s))"
        title, color, kicker = "Task Due Soon", BLUE, "Reminder"
        intro = f"The following task is due in {abs(days_offset)} day(s)."

    body = _card(
        title, color,
        {
            "Task": f"{task.code} — {task.title}",
            "Project": project_name or "—",
            "Priority": _label(task.priority),
            "Status": _label(task.status),
            "Due date": _fmt_date(task.approved_due_date or task.baseline_due_date),
            "Progress": _pct(task.progress_pct),
        },
        "Please update the task's progress, or log a Delay RCA if it cannot be completed on time.",
        kicker=kicker, intro=intro,
    )
    return _send(recipients, subject, body)


# ---------------------------------------------------------------- Stale backlog item
def send_backlog_stale_email(item, project_name: Optional[str], days_open: int, recipients: list[str]) -> bool:
    subject = f"Backlog Item Needs Attention: {item.code}"
    body = _card(
        "Backlog Item Pending", PURPLE,
        {
            "Backlog item": f"{item.code} — {item.requirement}",
            "Project": project_name or "—",
            "Status": _label(item.status),
            "Priority": _label(item.priority),
            "Open for": f"{days_open} day(s)",
        },
        "Please review this item and either prioritise it or convert it to a task.",
        kicker="Reminder",
        intro="The following backlog item has been open without progress.",
    )
    return _send(recipients, subject, body)


# ---------------------------------------------------------------- Connectivity test
def send_test_email(recipients: list[str]) -> bool:
    body = _card(
        "Test Email", NAVY,
        {"Status": "Email sending is configured correctly."},
        "You can ignore this message — it was sent from the email test page.",
        kicker="System Check",
    )
    return _send(recipients, f"Test email - {SYSTEM_NAME}", body)


# ---------------------------------------------------------------- Password reset
def send_password_reset_email(user_name: str, to_email: str, reset_link: str) -> bool:
    """Send the 'reset your password' link. Uses the same _send pipeline as all other mail,
    so MAIL_ENABLED / MAIL_ALLOWED_RECIPIENTS / Gmail App Password all apply automatically."""
    subject = f"Reset your password - {SYSTEM_NAME}"
    inner = (
        _greeting(user_name)
        + _p(f"We received a request to reset the password of your account on the <b>{SYSTEM_NAME}</b>. "
             "Please use the button below to choose a new password.")
        + _note("This link is valid for <b>1 hour</b> and can be used only once.")
        + _button("Reset Password", reset_link)
        + _link_fallback(reset_link)
        + _small("If you did not request a password reset, you can safely ignore this email — your current password will remain unchanged.")
        + _signoff()
    )
    text_body = (
        f"Dear {user_name},\n\n"
        f"We received a request to reset the password of your account on the {SYSTEM_NAME}.\n"
        f"Use the link below to choose a new password (valid for 1 hour):\n"
        f"{reset_link}\n\n"
        f"If you did not request this, please ignore this email.\n" + TEXT_SIGNOFF
    )
    return _send([to_email], subject, _layout("Account Security", "Password Reset Request", inner, preheader="Use the link inside to choose a new password."), text_body=text_body)


# ---------------------------------------------------------------- Welcome / set password
def send_welcome_set_password_email(
    user_name: str,
    to_email: str,
    set_link: str,
    expires_hours: int = 24,
) -> bool:
    """Sent when a new account is created (by an admin or by sign-up). The user sets their own
    password via the same /reset-password page used by Forgot Password."""
    subject = f"Your account is ready - set your password | {SYSTEM_NAME}"
    inner = (
        _greeting(user_name)
        + _p(f"Your account on the <b>{SYSTEM_NAME}</b> has been created. "
             "Please set your password using the button below so that you can sign in.")
        + _note(f"This link is valid for <b>{expires_hours} hours</b>. If it expires, use "
                "<i>Forgot Password</i> on the sign-in page to receive a new one.")
        + _button("Set Your Password", set_link)
        + _link_fallback(set_link)
        + _small("If you were not expecting this email, you can safely ignore it.")
        + _signoff()
    )
    text_body = (
        f"Dear {user_name},\n\n"
        f"Your account on the {SYSTEM_NAME} has been created.\n"
        f"Set your password using the link below (valid for {expires_hours} hours):\n"
        f"{set_link}\n\n"
        f"If you were not expecting this, please ignore this email.\n" + TEXT_SIGNOFF
    )
    return _send([to_email], subject, _layout("Welcome", "Your Account Is Ready", inner, accent=GREEN, preheader="Set your password to start using the system."), text_body=text_body)


# ---------------------------------------------------------------- Invitation to sign up
def send_signup_invite_email(to_email: str, inviter_name: str, signup_link: str) -> bool:
    """Sent when someone adds a person by email only ("+ Add new user"). The person
    finishes their own account on the Sign Up page; the link carries their email."""
    e = html.escape
    subject = f"You have been added - please sign up | {SYSTEM_NAME}"
    inner = (
        _greeting(None)
        + _p(f"<b>{e(inviter_name)}</b> has added you to the <b>{SYSTEM_NAME}</b> and may already have "
             "assigned work to you.")
        + _note(f"Please <b>sign up immediately</b> using this email address (<b>{e(to_email)}</b>) "
                "so that you can see your tasks and projects.")
        + _button("Sign Up Now", signup_link)
        + _link_fallback(signup_link)
        + _small("If you were not expecting this email, you can safely ignore it.")
        + _signoff()
    )
    text_body = (
        f"Dear Colleague,\n\n"
        f"{inviter_name} has added you to the {SYSTEM_NAME} and may already have assigned work to you.\n"
        f"Please sign up immediately with this email address ({to_email}):\n"
        f"{signup_link}\n\n"
        f"If you were not expecting this, please ignore this email.\n" + TEXT_SIGNOFF
    )
    return _send([to_email], subject, _layout("Invitation", "You Have Been Added to the System", inner, preheader=f"{inviter_name} has added you. Please sign up now."), text_body=text_body)


def send_finish_signup_email(to_email: str, signup_link: str) -> bool:
    """Forgot Password asked for an address that was added by email only and has not signed
    up yet: there is no password to reset, so the mail explains that and leads to Sign Up,
    where they enter their details and choose the password."""
    e = html.escape
    subject = f"Finish signing up to set your password | {SYSTEM_NAME}"
    inner = (
        _greeting(None)
        + _p(f"We received a request to reset the password for <b>{e(to_email)}</b> on the <b>{SYSTEM_NAME}</b>.")
        + _note("This email address has been added to the system, but <b>sign-up is not finished yet</b>, "
                "so there is no password to reset. Please complete the sign-up - you choose your "
                "password on that form and can log in straight away.")
        + _button("Complete Sign Up", signup_link)
        + _link_fallback(signup_link)
        + _small("If you did not request this, you can safely ignore this email.")
        + _signoff()
    )
    text_body = (
        f"Dear Colleague,\n\n"
        f"We received a request to reset the password for {to_email} on the {SYSTEM_NAME}.\n"
        f"This email address has been added to the system, but sign-up is not finished yet, so there is "
        f"no password to reset. Please complete the sign-up - you choose your password on that form:\n"
        f"{signup_link}\n\n"
        f"If you did not request this, please ignore this email.\n" + TEXT_SIGNOFF
    )
    return _send([to_email], subject, _layout("Account Security", "Finish Signing Up", inner, preheader="Sign-up is not finished yet: complete it to choose your password."), text_body=text_body)


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
    inner = (
        _greeting(recipient_name)
        + _p(f"You are cordially invited to attend the following meeting for the project <b>{e(project_label)}</b>, "
             f"in which you are listed as <b>{e(role_text)}</b>. Your presence and input are important for the discussion.")
        + _rows(rows)
        + _quote("Purpose / Agenda", purpose)
        + _p("Kindly plan to join on time and come prepared with any updates relevant to your role. "
             "A calendar invitation (<b>invite.ics</b>) is attached &mdash; open it to add this meeting to "
             "Outlook, Google Calendar or your phone's calendar.")
        + _button("View Meeting in the System", link)
        + f'<p style="margin:20px 0 0;">Best regards,<br><b>{e(organizer_name)}</b><br>'
          f'<span style="font-size:12.5px;color:{MUTED};">{SYSTEM_NAME}</span></p>'
        + _small("You received this invitation because you are Responsible, Accountable or Reviewer on a task in this project. "
                 "Please contact the organiser directly with any questions.")
    )
    html_body = _layout("Meeting Invitation", title, inner, preheader=f"{date_long}, {time_12h} - {project_label}")

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
        f"View the meeting: {link}",
        "",
        "Best regards,",
        organizer_name,
        SYSTEM_NAME,
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
    """Tells the Project Manager (project comment) or the task's Responsible and
    Accountable persons (task comment) that someone commented. With `reply_to` (the original comment's
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
        heading = f"New Reply on a {what.title()} Comment"
        if recipient_role == "comment author":
            intro = f"{commenter_name} replied to your comment on a {what}."
        else:
            intro = f"{commenter_name} replied to a comment on a {what} where you are the {recipient_role}."
    else:
        subject = f"New comment on {what} {subject_label}"
        heading = f"New Comment on Your {what.title()}"
        intro = f"{commenter_name} commented on a {what} where you are the {recipient_role}."

    rows = [("Task" if what == "task" else "Project", subject_label)]
    if what == "task" and project_label:
        rows.append(("Project", project_label))
    rows += [("Reply by" if is_reply else "Comment by", by), ("Sent", when)]
    inner = (
        _greeting(recipient_name)
        + _p(e(intro))
        + _rows(rows)
        + (_quote("Original comment", reply_to, color="#c3cad6", bg="#fafbfc") if is_reply else "")
        + _quote("Reply" if is_reply else "Comment", comment)
        + _button(f"Open the {what.title()}", link)
        + _signoff()
    )
    text_body = "\n".join(
        [f"Dear {recipient_name},", "", intro, ""]
        + [f"{k}: {v}" for k, v in rows]
        + (["", "Original comment:", reply_to] if is_reply else [])
        + ["", "Reply:" if is_reply else "Comment:", comment, "", f"Open: {link}", TEXT_SIGNOFF]
    )
    return _send([to_email], subject, _layout("Comments", heading, inner, accent=BLUE, preheader=intro), text_body=text_body)


def send_methodology_email(to_email: str, recipient_name: str, subject: str, heading: str, intro: str,
                           rows: list[tuple[str, str]], link: str, note: Optional[str] = None) -> bool:
    """Methodology approval notices: an approver is asked to review the document,
    or the Project Manager hears an approver's decision (with their note)."""
    inner = (
        _greeting(recipient_name)
        + _p(html.escape(intro))
        + _rows(rows)
        + (_quote("Note", note) if note else "")
        + _button("Open the Project", link)
        + _signoff()
    )
    text_body = "\n".join(
        [f"Dear {recipient_name},", "", intro, ""] + [f"{k}: {v}" for k, v in rows]
        + (["", "Note:", note] if note else []) + ["", f"Open: {link}", TEXT_SIGNOFF]
    )
    # the callers' headings start with an emoji: keep the words only
    clean = "".join(ch for ch in heading if ch.isascii() or ch.isalnum() or ch.isspace()).strip() or "Methodology Approval"
    return _send([to_email], subject, _layout("Methodology Approval", clean, inner, preheader=intro), text_body=text_body)
