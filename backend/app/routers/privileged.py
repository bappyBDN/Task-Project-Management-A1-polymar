"""Role lists used by the Admin Panel.

- /all-roles        → the fixed list of roles the system knows about.
- /privileged-roles → roles whose users can see all tasks and approve requests.
                      Stored in the existing `list_options` table (kind='privileged_role').

Only admins can change the privileged-role list.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.auth import get_admin_user
from app.database import get_db

router = APIRouter(tags=["roles"])

# The canonical role list. Keep this in sync with AdminPanel.tsx's `ROLES` const.
ALL_ROLES: list[str] = [
    "group_executive",
    "business_head",
    "functional_head",
    "sponsor",
    "pmo",
    "pm",
    "team_lead",
    "employee",
    "reviewer",
    "auditor",
    "admin",
]

# Fallback privileged roles if the list_options table is empty the first time.
DEFAULT_PRIVILEGED: list[str] = [
    "admin",
    "group_executive",
    "pmo",
]


def _load_privileged(db: Session) -> list[str]:
    """Read privileged roles from list_options; seed defaults on first call."""
    rows = (
        db.query(models.ListOption)
        .filter(
            models.ListOption.kind == "privileged_role",
            models.ListOption.is_active.is_(True),
        )
        .all()
    )
    if not rows:
        # First run — seed the defaults so the UI isn't empty.
        for role in DEFAULT_PRIVILEGED:
            db.add(models.ListOption(kind="privileged_role", value=role, is_active=True))
        db.commit()
        return list(DEFAULT_PRIVILEGED)
    return [r.value for r in rows]


@router.get("/all-roles")
def all_roles():
    return ALL_ROLES


@router.get("/privileged-roles")
def get_privileged_roles(db: Session = Depends(get_db)):
    return _load_privileged(db)


@router.post("/privileged-roles")
def add_privileged_role(
    payload: dict,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    role = (payload or {}).get("role", "").strip().lower()
    if not role:
        raise HTTPException(status_code=400, detail="role is required")
    if role not in ALL_ROLES:
        raise HTTPException(status_code=400, detail=f"Unknown role: {role}")

    existing = (
        db.query(models.ListOption)
        .filter(
            models.ListOption.kind == "privileged_role",
            models.ListOption.value == role,
        )
        .first()
    )
    if existing:
        existing.is_active = True
    else:
        db.add(models.ListOption(kind="privileged_role", value=role, is_active=True))
    db.commit()
    return _load_privileged(db)


@router.delete("/privileged-roles")
def remove_privileged_role(
    role: str,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    role = role.strip().lower()
    if role == "admin":
        raise HTTPException(status_code=400, detail="admin role cannot be removed")

    row = (
        db.query(models.ListOption)
        .filter(
            models.ListOption.kind == "privileged_role",
            models.ListOption.value == role,
        )
        .first()
    )
    if row:
        db.delete(row)
        db.commit()
    return _load_privileged(db)