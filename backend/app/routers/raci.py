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


def _build_matrix(db: Session, project_id: int | None, company_id: int | None,
                  function_id: int | None, department_id: int | None) -> dict:
    """RACI matrix: rows = tasks, columns = people, cells = R/A/C/I.

    project_id given -> only that project's tasks.
    project_id empty -> the tasks of ALL projects (tasks that belong to a project).
    SBU / function / department narrow the tasks further.
    """
    q = db.query(models.Task).filter(models.Task.is_deleted.is_(False))
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    else:
        q = q.filter(models.Task.project_id.isnot(None))
    if company_id:
        q = q.filter(models.Task.company_id == company_id)
    if function_id:
        q = q.filter(models.Task.function_id == function_id)
    if department_id:
        q = q.filter(models.Task.department_id == department_id)
    tasks = q.order_by(models.Task.project_id, models.Task.id).all()
    task_ids = {t.id for t in tasks}

    # Extra RACI entries (e.g. Informed) for exactly these tasks. Matching on
    # task_id also catches entries saved without a project_id.
    entries = db.query(models.RaciEntry).filter(models.RaciEntry.task_id.in_(task_ids)).all() if task_ids else []

    # Cells keyed by (task_id, user_id)
    cells: dict[tuple[int, int], set[str]] = {}
    for t in tasks:
        if t.responsible_id:
            cells.setdefault((t.id, t.responsible_id), set()).add("R")
        if t.accountable_id:
            cells.setdefault((t.id, t.accountable_id), set()).add("A")
        if t.reviewer_id:
            cells.setdefault((t.id, t.reviewer_id), set()).add("C")
    for e in entries:
        if e.raci_type:
            cells.setdefault((e.task_id, e.user_id), set()).add(e.raci_type)

    # Only people who actually have a role in the rows shown (no empty columns).
    user_ids = {uid for (_, uid) in cells}
    users = db.query(models.User).filter(models.User.id.in_(user_ids)).order_by(models.User.name).all() if user_ids else []

    order = "RACI"
    rows = []
    for t in tasks:
        row_cells = []
        for u in users:
            vals = sorted(cells.get((t.id, u.id), set()), key=lambda v: order.find(v) if v in order else 9)
            row_cells.append({"user_id": u.id, "value": "".join(vals)})
        rows.append({"task_id": t.id, "code": t.code, "title": t.title, "project_id": t.project_id, "cells": row_cells})

    return {
        "project_id": project_id,
        "users": [{"id": u.id, "name": u.name} for u in users],
        "tasks": [{"id": t.id, "code": t.code, "title": t.title, "project_id": t.project_id} for t in tasks],
        "rows": rows,
        "gaps": [t.id for t in tasks if not t.responsible_id or not t.accountable_id],
    }


@router.get("/matrix")
def raci_matrix_all(company_id: int | None = None, function_id: int | None = None,
                    department_id: int | None = None, db: Session = Depends(get_db)):
    """All projects' tasks ("All projects" in the page)."""
    return _build_matrix(db, None, company_id, function_id, department_id)


@router.get("/matrix/{project_id}")
def raci_matrix(project_id: int, company_id: int | None = None, function_id: int | None = None,
                department_id: int | None = None, db: Session = Depends(get_db)):
    """One project's tasks."""
    if not db.get(models.Project, project_id):
        raise HTTPException(404, "Project not found")
    return _build_matrix(db, project_id, company_id, function_id, department_id)