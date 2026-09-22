from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

router = APIRouter(prefix="/list-options", tags=["list-options"])

# kind -> max characters allowed (must fit the column the value is finally stored in)
KIND_MAX_LEN = {
    "category": 40,
    "task_type": 32,
    "priority": 16,
    "status": 24,
    "delay_category": 40,
    "meeting_type": 40,
}
KINDS = list(KIND_MAX_LEN)


def _check_kind(kind: str) -> str:
    kind = kind.strip().lower()
    if kind not in KIND_MAX_LEN:
        raise HTTPException(400, f"Unknown list kind '{kind}'. Allowed: {', '.join(KINDS)}")
    return kind


@router.get("")
def list_options(kind: str, db: Session = Depends(get_db)):
    kind = kind.strip().lower()
    rows = db.query(models.ListOption).filter(
        models.ListOption.kind == kind, models.ListOption.is_active.is_(True)
    ).order_by(models.ListOption.value).all()
    return [r.value for r in rows]


@router.post("", status_code=201)
def add_option(kind: str, value: str, db: Session = Depends(get_db)):
    kind = _check_kind(kind)
    value = value.strip()
    if not value:
        raise HTTPException(400, "Value is required")
    if len(value) > KIND_MAX_LEN[kind]:
        raise HTTPException(400, f"'{kind}' values can be at most {KIND_MAX_LEN[kind]} characters")
    existing = db.query(models.ListOption).filter(
        models.ListOption.kind == kind, models.ListOption.value == value
    ).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
        return {"kind": kind, "value": value}
    db.add(models.ListOption(kind=kind, value=value))
    db.commit()
    return {"kind": kind, "value": value}


@router.delete("", status_code=204)
def remove_option(kind: str, value: str, db: Session = Depends(get_db)):
    kind = kind.strip().lower()
    value = value.strip()
    row = db.query(models.ListOption).filter(
        models.ListOption.kind == kind, models.ListOption.value == value
    ).first()
    if row:
        row.is_active = False
        db.commit()