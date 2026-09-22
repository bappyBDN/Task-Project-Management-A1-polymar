from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.auth import get_admin_user
from app.database import get_db

router = APIRouter(prefix="/projects", tags=["projects"])

# NOT NULL columns: an explicit `null` from the client must not overwrite them.
_NOT_NULL_FIELDS = {"name", "project_type", "priority", "methodology", "completion_pct",
                    "status", "health", "criticality"}


@router.get("", response_model=list[schemas.ProjectOut])
def list_projects(
    company_id: int | None = None,
    function_id: int | None = None,
    status: str | None = None,
    health: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Project)
    if company_id:
        q = q.filter(models.Project.company_id == company_id)
    if function_id:
        q = q.filter(models.Project.function_id == function_id)
    if status:
        q = q.filter(models.Project.status == status)
    if health:
        q = q.filter(models.Project.health == health)
    return q.order_by(models.Project.name).all()


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(payload: schemas.ProjectBase, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["name"] = (data.get("name") or "").strip()
    if not data["name"]:
        raise HTTPException(400, "Project name is required")
    user_code = (data.get("code") or "").strip() or None
    if user_code and db.query(models.Project).filter(models.Project.code == user_code).first():
        raise HTTPException(409, f"Project code {user_code} already exists")

    project = None
    for attempt in range(3):
        data["code"] = user_code or services.next_code("PRJ", db, models.Project)
        project = models.Project(**data)
        db.add(project)
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
            if user_code or attempt == 2:
                raise HTTPException(409, "Could not save the project (duplicate code). Please try again.")
    services.audit(db, "system", "project", project.id, "created", new_value=project.name)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()
            if not (v is None and k in _NOT_NULL_FIELDS)}
    new_code = (data.pop("code", None) or "").strip()
    if new_code and new_code != project.code:
        if db.query(models.Project).filter(models.Project.code == new_code, models.Project.id != project.id).first():
            raise HTTPException(409, f"Project code {new_code} already exists")
        data["code"] = new_code
    for k, v in data.items():
        setattr(project, k, v)
    services.audit(db, "system", "project", project.id, "updated", new_value=project.name)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}/milestones", response_model=list[schemas.MilestoneOut])
def list_milestones(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.Milestone).filter(models.Milestone.project_id == project_id).order_by(models.Milestone.due_date).all()


@router.post("/{project_id}/milestones", response_model=schemas.MilestoneOut, status_code=201)
def create_milestone(project_id: int, payload: schemas.MilestoneBase, db: Session = Depends(get_db)):
    ms = models.Milestone(**{**payload.model_dump(), "project_id": project_id})
    db.add(ms)
    db.commit()
    db.refresh(ms)
    return ms


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, admin: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Admin-only: delete a project and its milestones/tasks (soft-delete tasks, hard-delete project)."""
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    name = project.name
    milestone_ids = [m for (m,) in db.query(models.Milestone.id).filter(models.Milestone.project_id == project_id).all()]

    # Soft-delete tasks so history is preserved, but detach them from the rows we are about to remove
    # (otherwise databases that enforce foreign keys refuse the delete).
    db.query(models.Task).filter(models.Task.project_id == project_id).update(
        {"is_deleted": True, "project_id": None}, synchronize_session=False)
    if milestone_ids:
        db.query(models.Task).filter(models.Task.milestone_id.in_(milestone_ids)).update(
            {"milestone_id": None}, synchronize_session=False)
        db.query(models.BacklogItem).filter(models.BacklogItem.target_milestone_id.in_(milestone_ids)).update(
            {"target_milestone_id": None}, synchronize_session=False)
    db.query(models.Milestone).filter(models.Milestone.project_id == project_id).delete(synchronize_session=False)
    for model in (models.BacklogItem, models.Risk, models.Issue, models.Decision):
        db.query(model).filter(model.project_id == project_id).update({"project_id": None}, synchronize_session=False)
    db.query(models.RaciEntry).filter(models.RaciEntry.project_id == project_id).delete(synchronize_session=False)
    services.audit(db, admin.name, "project", project_id, "deleted", previous_value=name,
                   reason=f"Deleted by admin {admin.name}")
    db.delete(project)
    db.commit()