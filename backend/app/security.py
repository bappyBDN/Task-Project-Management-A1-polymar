"""Password hashing + JWT helpers used by app/auth.py's /auth/login,
/auth/forgot-password and /auth/reset-password endpoints.

Requires:
    pip install "passlib[bcrypt]" "python-jose[cryptography]"

Set a real secret in .env for production:
    JWT_SECRET_KEY=some-long-random-string
"""
import os
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt
from passlib.context import CryptContext

# --- Password hashing ---------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# --- JWT tokens -----------------------------------------------------------
_DEV_SECRET = "dev-only-insecure-secret-change-me"


def _load_secret() -> str:
    # 1) real environment variable (Docker: passed in by docker-compose.yml)
    # 2) JWT_SECRET_KEY in backend/.env (local runs: nothing else loads .env
    #    into os.environ, so this used to silently fall back to the public default)
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret:
        try:
            from dotenv import dotenv_values
            secret = dotenv_values(".env").get("JWT_SECRET_KEY")
        except Exception:
            secret = None
    if not secret:
        # Keep running (never crash a deployed system), but say it loudly.
        print("[security] WARNING: JWT_SECRET_KEY is not set - using the public dev "
              "default. Anyone could forge login tokens. Set it in .env.")
        secret = _DEV_SECRET
    return secret


SECRET_KEY = _load_secret()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Return the JWT payload, or None if the token is invalid/expired."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return None