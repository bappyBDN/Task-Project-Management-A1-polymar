from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/raci", tags=["raci"])


@router.get("", response_model=list[schemas.RaciEntryOut])
def list_raci(project_id: int | None = None, task_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.RaciEntry)
    if project_id:
        q = q.filter(models.RaciEntry.project_id == project_id)
    if task_id:
        q = q.filter(models.RaciEntry.task_id == task_id)
    return q.all()


@router.post("", response_model=schemas.RaciEntryOut, status_code=201)
def create_raci(payload: schemas.RaciEntryBase, db: Session = Depends(get_db)):
    entry = models.RaciEntry(**payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_raci(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(models.RaciEntry, entry_id)
    if not entry:
        raise HTTPException(404, "RACI entry not found")
    db.delete(entry)
    db.commit()


@router.get("/matrix/{project_id}")
def raci_matrix(project_id: int, db: Session = Depends(get_db)):
    """Build a project RACI matrix: rows = tasks, columns = users, cells = R/A/C/I."""
    tasks = db.query(models.Task).filter(
        models.Task.project_id == project_id, models.Task.is_deleted.is_(False)
    ).order_by(models.Task.id).all()
    entries = db.query(models.RaciEntry).filter(
        models.RaciEntry.project_id == project_id
    ).all()

    # Collect all users involved
    user_ids: set[int] = set()
    for t in tasks:
        if t.responsible_id: user_ids.add(t.responsible_id)
        if t.accountable_id: user_ids.add(t.accountable_id)
        if t.reviewer_id: user_ids.add(t.reviewer_id)
    for e in entries:
        user_ids.add(e.user_id)

    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all() if user_ids else []
    user_map = {u.id: u for u in users}

    # Build cells keyed by (task_id, user_id)
    cells: dict[tuple[int, int], list[str]] = {}
    for t in tasks:
        if t.responsible_id:
            cells.setdefault((t.id, t.responsible_id), []).append("R")
        if t.accountable_id:
            cells.setdefault((t.id, t.accountable_id), []).append("A")
        if t.reviewer_id:
            cells.setdefault((t.id, t.reviewer_id), []).append("C")
    for e in entries:
        cells.setdefault((e.task_id, e.user_id), []).append(e.raci_type)

    matrix_rows = []
    for t in tasks:
        row_cells = []
        for u in users:
            vals = sorted(set(cells.get((t.id, u.id), [])))
            row_cells.append({"user_id": u.id, "value": "".join(vals)})
        matrix_rows.append({"task_id": t.id, "code": t.code, "title": t.title, "cells": row_cells})

    return {
        "project_id": project_id,
        "users": [{"id": u.id, "name": u.name} for u in users],
        "tasks": [{"id": t.id, "code": t.code, "title": t.title} for t in tasks],
        "rows": matrix_rows,
        "gaps": [t.id for t in tasks if not t.responsible_id or not t.accountable_id],
    }
