"""User Mapping — simple organizational master data.

One flat table: every user, their role, and who they report to (immediate
manager only). This is deliberately kept simple for now.

Future extension point: because User.reports_to_id is self-referencing,
a full top-to-bottom tree (any number of levels) can be built later from
this exact same column — e.g. a GET /organizations/org-chart endpoint that
walks reports_to_id recursively — without any schema change.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/user-mapping", response_model=list[schemas.UserMappingOut])
def user_mapping(db: Session = Depends(get_db)):
    """Flat master-data table for a simple grid: who has which role, who they report to."""
    users = db.query(models.User).order_by(models.User.name).all()
    name_by_id = {u.id: u.name for u in users}

    return [
        schemas.UserMappingOut(
            id=u.id,
            employee_id=u.employee_id,
            name=u.name,
            email=u.email,
            designation=u.designation,
            role=u.role,
            reports_to_id=u.reports_to_id,
            reports_to_name=name_by_id.get(u.reports_to_id),
            is_active=u.is_active,
        )
        for u in users
    ]