from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.visibility import Scope, get_scope

router = APIRouter(prefix="/backlogs", tags=["backlogs"])


@router.get("", response_model=list[schemas.BacklogOut])
def list_backlog(project_id: int | None = None, status: str | None = None, db: Session = Depends(get_db),
                 scope: Scope = Depends(get_scope)):
    q = db.query(models.BacklogItem)
    if project_id:
        q = q.filter(models.BacklogItem.project_id == project_id)
    if status:
        q = q.filter(models.BacklogItem.status == status)
    # items of projects this user may see, their own requests, and items with no project
    return [b for b in q.order_by(models.BacklogItem.priority, models.BacklogItem.id).all()
            if b.project_id is None or b.requested_by_id == scope.user_id or scope.sees_project_id(b.project_id)]


@router.post("", response_model=schemas.BacklogOut, status_code=201)
def create_backlog(payload: schemas.BacklogBase, db: Session = Depends(get_db)):
    item = models.BacklogItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=schemas.BacklogOut)
def update_backlog(item_id: int, payload: schemas.BacklogUpdate, db: Session = Depends(get_db)):
    item = db.get(models.BacklogItem, item_id)
    if not item:
        raise HTTPException(404, "Backlog item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is None and k in {"code", "requirement", "priority", "status"}:
            continue  # required column: an explicit null must not wipe it
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item
