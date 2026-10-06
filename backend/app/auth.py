"""Authentication endpoints + JWT based current-user resolution."""
import secrets
import threading
import time
from datetime import datetime, timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app import email_service
from app.config import settings

from app import models, services
from app.database import get_db
from app.models import User
from app.schemas import (
    LoginRequest, ForgotPasswordRequest, ResetPasswordRequest, Token,
)
from app.security import (
    verify_password, get_password_hash, create_access_token, decode_access_token,
)

ADMIN_ROLE = "admin"
router = APIRouter(prefix="/auth", tags=["Authentication"])


# ---------------------------------------------------------------- dependencies
def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    """Resolve the current user from the Bearer JWT.

    The old X-User-Id header is no longer accepted: it let anyone act as any
    user (including an admin) just by sending a number.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not logged in")

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        user = db.get(models.User, int(payload.get("sub")))
    except (TypeError, ValueError):
        user = None

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Unknown or inactive user")
    return user


def get_admin_user(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != ADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


# ---------------------------------------------------------------- login throttle
# In-memory: blocks password guessing. After _MAX_FAILS wrong passwords for the
# same login name within _WINDOW seconds, that name is locked for _WINDOW seconds.
# Resets on backend restart; nothing is stored in the database.
_MAX_FAILS = 5
_WINDOW = 15 * 60
_fails: dict[str, list[float]] = {}
_fails_lock = threading.Lock()


def _recent_fails(key: str) -> list[float]:
    now = time.time()
    with _fails_lock:
        stamps = [t for t in _fails.get(key, []) if now - t < _WINDOW]
        if stamps:
            _fails[key] = stamps
        else:
            _fails.pop(key, None)
        return stamps


def _record_fail(key: str):
    with _fails_lock:
        _fails.setdefault(key, []).append(time.time())


# ---------------------------------------------------------------- endpoints
@router.post("/login", response_model=Token)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    key = (request.email or "").strip().lower()
    if len(_recent_fails(key)) >= _MAX_FAILS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Please wait 15 minutes or use Forgot Password.",
        )

    user = (
        db.query(User)
        .filter((User.email == request.email) | (User.employee_id == request.email))
        .first()
    )

    if not user or not user.is_active:
        _record_fail(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if is_invited(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You have been invited but have not signed up yet. Please use Sign Up with this email.",
        )
    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password not set. Please use Forgot Password.",
        )

    if not verify_password(request.password, user.hashed_password):
        _record_fail(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    with _fails_lock:
        _fails.pop(key, None)
    access_token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
    }

# ---------------------------------------------------------------- invited by email only
# "+ Add new user" asks only for an email. The person is saved as a normal `users` row
# (no schema change) with a placeholder Employee ID and their email as the name, so they
# can be assigned at once; Sign Up with that email then completes the SAME row, keeping
# everything already assigned to them.
INVITE_PREFIX = "INVITED-"


def is_invited(user: models.User) -> bool:
    """Added by email, has not signed up yet."""
    return bool(user) and not user.hashed_password and (user.employee_id or "").startswith(INVITE_PREFIX)


def create_invited_user(db: Session, email: str) -> models.User:
    """Placeholder account for someone known only by email (flushed, not committed)."""
    user = User(
        employee_id=f"{INVITE_PREFIX}{secrets.token_hex(5).upper()}",  # until they sign up
        name=email, email=email, role="employee",
    )
    db.add(user)
    db.flush()
    return user


def send_signup_invite(user: models.User, inviter_name: str) -> bool:
    link = f"{settings.frontend_url}/signup?email={quote(user.email)}"
    sent = email_service.send_signup_invite_email(to_email=user.email, inviter_name=inviter_name, signup_link=link)
    if not sent:
        print(f"[users] Invitation email NOT sent to {user.email}. Sign-up link: {link}")
    return sent


# ---------------------------------------------------------------- new user / sign-up
def send_set_password_link(db: Session, user: models.User):
    """New accounts start with no password. Generate a 24-hour "set password" link
    and email it, reusing the same /reset-password page as Forgot Password.
    Used by admin "New User" and by self sign-up."""
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=24)
    db.commit()

    set_link = f"{settings.frontend_url}/reset-password?token={token}"
    sent = email_service.send_welcome_set_password_email(
        user_name=user.name,
        to_email=user.email,
        set_link=set_link,
        expires_hours=24,
    )
    # The link is a password key: only print it when the email failed.
    if not sent:
        print(f"[users] Welcome email NOT sent. Set-password link for {user.email}: {set_link}")


class SignupRequest(BaseModel):
    """Sign-up form body (API input check only, not a database table).
    Same fields as admin "New User", except `role`: self sign-ups are always 'employee'."""
    employee_id: str
    name: str
    email: EmailStr
    designation: str | None = None
    company_id: int | None = None
    # every SBU they belong to, the first one first; left out = company_id alone
    company_ids: list[int] | None = None
    function_id: int | None = None
    department_id: int | None = None
    reports_to_id: int | None = None
    # Not in the lists: a new function / department to add, and the manager's
    # Employee ID when the manager isn't listed (maybe has no account yet).
    new_function: str | None = None
    new_department: str | None = None
    reports_to_employee_id: str | None = None
    # ...or the manager's email: linked if they have an account, otherwise they are
    # added by that email and get an invitation to sign up.
    reports_to_email: EmailStr | None = None


@router.get("/signup-options")
def signup_options(db: Session = Depends(get_db)):
    """Dropdown lists for the public sign-up form (names only)."""
    return {
        "companies": [{"id": c.id, "name": c.name} for c in db.query(models.Company).order_by(models.Company.name)],
        "functions": [{"id": f.id, "name": f.name} for f in db.query(models.Function).order_by(models.Function.name)],
        "departments": [{"id": d.id, "name": d.name, "function_id": d.function_id}
                        for d in db.query(models.Department).order_by(models.Department.name)],
        # not people added by email who haven't signed up: their "name" is still their email,
        # and this list is public
        "users": [{"id": u.id, "name": u.name}
                  for u in db.query(User).filter(User.is_active.is_(True)).order_by(User.name)
                  if not is_invited(u)],
    }


@router.post("/signup", status_code=201)
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    employee_id = request.employee_id.strip()
    name = request.name.strip()
    email = str(request.email).strip()
    if not employee_id or not name:
        raise HTTPException(400, "Name, email and employee id are required")
    # Someone added by email only ("+ Add new user") finishes that same account here.
    invited = db.query(User).filter(func.lower(User.email) == email.lower()).first()
    if invited is not None and not is_invited(invited):
        raise HTTPException(409, "An account with this email already exists. Please log in or use Forgot Password.")
    if employee_id.upper().startswith(INVITE_PREFIX):
        raise HTTPException(400, "Please enter your real Employee ID.")
    if db.query(User.id).filter(func.lower(User.employee_id) == employee_id.lower()).first():
        raise HTTPException(409, "An account with this Employee ID already exists. Please log in or use Forgot Password.")

    company_ids = list(dict.fromkeys(c for c in (request.company_ids or [request.company_id]) if c))
    # Only link to rows that really exist (the database would reject a bad id).
    for model, value, label in (
        *((models.Company, cid, "SBU") for cid in company_ids),
        (models.Function, request.function_id, "Function"),
        (models.Department, request.department_id, "Department"),
        (models.User, request.reports_to_id, "Reports To person"),
    ):
        if value is not None and db.get(model, value) is None:
            raise HTTPException(400, f"Selected {label} no longer exists. Please pick again.")

    new_function = " ".join((request.new_function or "").split())
    new_department = " ".join((request.new_department or "").split())
    manager_emp = (request.reports_to_employee_id or "").strip()
    for text, label in ((new_function, "Function"), (new_department, "Department")):
        if len(text) > 100:
            raise HTTPException(400, f"{label} name is too long (100 characters at most).")
    if len(manager_emp) > 32:
        raise HTTPException(400, "Manager Employee ID is too long (32 characters at most).")

    # A typed-in function / department is added (or the existing one with that name reused).
    function_id = request.function_id
    if function_id is None and new_function:
        function_id = services.function_for_name(db, new_function).id
    department_id = request.department_id
    if department_id is None and new_department:
        department_id = services.department_for_name(db, new_department, function_id).id

    # Manager given by Employee ID: link now if they have an account, else remember
    # the ID and link when they join (see services.link_waiting_reports).
    reports_to_id = request.reports_to_id
    pending_manager = None
    if reports_to_id is None and manager_emp:
        if manager_emp.lower() == employee_id.lower():
            raise HTTPException(400, "Your manager's Employee ID can't be your own.")
        manager = db.query(User).filter(func.lower(User.employee_id) == manager_emp.lower()).first()
        if manager:
            reports_to_id = manager.id
        else:
            pending_manager = manager_emp

    # Manager given by email: link to their account, or add them by email and invite them.
    manager_email = str(request.reports_to_email or "").strip()
    manager_to_invite = None
    if reports_to_id is None and not manager_emp and manager_email:
        if manager_email.lower() == email.lower():
            raise HTTPException(400, "Your manager's email can't be your own.")
        if len(manager_email) > 120:
            raise HTTPException(400, "Your manager's email is too long.")
        manager = db.query(User).filter(func.lower(User.email) == manager_email.lower()).first()
        if manager is None:
            try:
                manager = create_invited_user(db, manager_email)
            except IntegrityError:
                db.rollback()
                raise HTTPException(409, "Could not add your manager. Please try again.")
            services.audit(db, name, "user", manager.id, "invited", new_value=manager_email)
        if is_invited(manager):
            manager_to_invite = manager
        reports_to_id = manager.id

    details = dict(
        employee_id=employee_id,
        name=name,
        designation=(request.designation or "").strip() or None,
        company_id=company_ids[0] if company_ids else None,
        function_id=function_id,
        department_id=department_id,
        reports_to_id=reports_to_id,
        pending_manager_employee_id=pending_manager,
    )
    if invited is not None:
        if reports_to_id == invited.id:
            raise HTTPException(400, "You cannot report to yourself.")
        user = invited  # same row: tasks / projects already given to them stay theirs
        for k, v in details.items():
            setattr(user, k, v)
        user.is_active = True
    else:
        user = User(email=email, role="employee", **details)
        db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()  # e.g. the same email signed up twice at the same moment
        raise HTTPException(409, "An account with this email or Employee ID already exists.")
    services.set_sbus(db, user, company_ids, name)
    # anyone who named this new user's Employee ID as their manager now reports to them
    services.link_waiting_reports(db, user)
    services.audit(db, name, "user", user.id, "signed_up", new_value=f"{name} <{email}>")
    db.commit()
    db.refresh(user)
    send_set_password_link(db, user)
    message = "Account created. Check your email for a link to set your password."
    if manager_to_invite is not None:
        if send_signup_invite(manager_to_invite, name):
            message += f" An invitation to sign up was sent to your manager ({manager_to_invite.email})."
        else:
            message += f" Your manager ({manager_to_invite.email}) was added, but the invitation email could not be sent - please ask them to sign up."
    if pending_manager:
        message += f" Your manager ({pending_manager}) has no account yet - you'll be linked to them when they join."
    return {"message": message}


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()

    if user and is_invited(user):
        # not signed up yet: the invitation again, not a password link
        send_signup_invite(user, "Your colleague")
    elif user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()

        reset_link = f"{settings.frontend_url}/reset-password?token={token}"

        # Send via the same Gmail pipeline used by all other notifications.
        # Test-mode (MAIL_ALLOWED_RECIPIENTS) and MAIL_ENABLED are honoured automatically.
        sent = email_service.send_password_reset_email(
            user_name=user.name,
            to_email=user.email,
            reset_link=reset_link,
        )

        # The link is a password key: only print it (for the admin to pass on)
        # when the email could not be sent.
        if not sent:
            print(f"[auth] Reset email NOT sent. Link for {user.email}: {reset_link}")

    return {"message": "If an account exists, a password reset link has been sent."}


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(
            User.reset_token == request.token,
            User.reset_token_expires > datetime.utcnow(),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )

    user.hashed_password = get_password_hash(request.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return {"message": "Password successfully updated."}