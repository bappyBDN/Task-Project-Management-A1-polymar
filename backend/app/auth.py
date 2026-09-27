"""Authentication endpoints + JWT based current-user resolution."""
import secrets
import threading
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from app import email_service
from app.config import settings

from app import models
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

@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()

    if user:
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