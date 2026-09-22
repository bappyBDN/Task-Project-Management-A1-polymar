"""Authentication endpoints + header/JWT based current-user resolution."""
import secrets
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
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> models.User:
    """Resolve the current user from either a Bearer JWT or an X-User-Id header.

    JWT is preferred (survives page reload); X-User-Id is kept as a
    backwards-compatible fallback for local/dev usage.
    """
    user: models.User | None = None

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        payload = decode_access_token(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        try:
            user = db.get(models.User, int(payload.get("sub")))
        except (TypeError, ValueError):
            user = None
    elif x_user_id is not None:
        user = db.get(models.User, x_user_id)

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Unknown or inactive user")
    return user


def get_admin_user(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != ADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


# ---------------------------------------------------------------- endpoints
@router.post("/login", response_model=Token)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter((User.email == request.email) | (User.employee_id == request.email))
        .first()
    )

    if not user or not user.is_active:
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

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
        email_service.send_password_reset_email(
            user_name=user.name,
            to_email=user.email,
            reset_link=reset_link,
        )

        # Dev fallback: also print in the terminal for quick testing.
        print(f"[dev] Reset link for {user.email}: {reset_link}")

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