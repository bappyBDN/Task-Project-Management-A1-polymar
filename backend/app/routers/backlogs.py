from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/backlogs", tags=["backlogs"])


@router.get("", response_model=list[schemas.BacklogOut])
def list_backlog(project_id: int | None = None, status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.BacklogItem)
    if project_id:
        q = q.filter(models.BacklogItem.project_id == project_id)
    if status:
        q = q.filter(models.BacklogItem.status == status)
    return q.order_by(models.BacklogItem.priority, models.BacklogItem.id).all()


@router.post("", response_model=schemas.BacklogOut, status_code=201)
def create_backlog(payload: schemas.BacklogBase, db: Session = Depends(get_db)):
    item = models.BacklogItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=schemas.BacklogOut)
def update_backlog(item_id: int, payload: schemas.BacklogBase, db: Session = Depends(get_db)):
    item = db.get(models.BacklogItem, item_id)
    if not item:
        raise HTTPException(404, "Backlog item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item
