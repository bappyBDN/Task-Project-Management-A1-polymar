from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, permissions, schemas, services
from app.auth import get_current_user
from app.database import get_db
from app.visibility import Scope, get_scope

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
    scope: Scope = Depends(get_scope),
):
    """Only the projects this user may see (app/visibility.py)."""
    q = db.query(models.Project)
    if company_id:
        q = q.filter(models.Project.company_id == company_id)
    if function_id:
        q = q.filter(models.Project.function_id == function_id)
    if status:
        q = q.filter(models.Project.status == status)
    if health:
        q = q.filter(models.Project.health == health)
    return [p for p in q.order_by(models.Project.name).all() if scope.sees_project(p)]


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(payload: schemas.ProjectBase, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    data = payload.model_dump()
    # whoever creates a project owns it unless another owner is named - otherwise they
    # could not see the project they just made (app/visibility.py)
    if not data.get("owner_id"):
        data["owner_id"] = current_user.id
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
    services.audit(db, current_user.name, "project", project.id, "created", new_value=project.name)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    _require_view(scope, project)
    return project


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
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
    # Admin / PMO or task Responsible / Accountable on this project (see app/permissions.py).
    data = permissions.check_project_edit(db, current_user, project, data)
    for k, v in data.items():
        setattr(project, k, v)
    services.audit(db, current_user.name, "project", project.id, "updated", new_value=project.name)
    db.commit()
    db.refresh(project)
    return project


# ---------------------------------------------------------------- associated people
# People who contribute to the project beyond (or without) its tasks, each with a
# short description of the contribution. Anyone can see them; the project's
# Manager / Owner / Sponsor, task Responsible / Accountable and admin / PMO manage them.

def _project_or_404(db: Session, project_id: int) -> models.Project:
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def _require_view(scope: Scope, project: models.Project):
    if not scope.sees_project(project):
        raise HTTPException(403, "You don't have access to this project. Only the people on the project, the heads of its SBU / function / department and admin / PMO can open it.")


def _contribution(text: str) -> str:
    text = (text or "").strip()
    if not text:
        raise HTTPException(400, "Describe their contribution to the project")
    if len(text) > 1000:
        raise HTTPException(400, "Contribution is too long (1000 characters at most)")
    return text


def _require_manage(db: Session, user: models.User, project: models.Project):
    if not permissions.can_manage_associates(db, user, project):
        raise HTTPException(403, "Only the project's Manager / Owner / Sponsor, a Responsible / Accountable person on its tasks, or an admin / PMO can change associated people.")


@router.get("/{project_id}/associates", response_model=list[schemas.ProjectAssociateOut])
def list_associates(project_id: int, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)):
    _require_view(scope, _project_or_404(db, project_id))
    return db.query(models.ProjectAssociate).filter(
        models.ProjectAssociate.project_id == project_id).order_by(models.ProjectAssociate.id).all()


@router.post("/{project_id}/associates", response_model=schemas.ProjectAssociateOut, status_code=201)
def add_associate(project_id: int, payload: schemas.ProjectAssociateIn, db: Session = Depends(get_db),
                  current_user: models.User = Depends(get_current_user)):
    project = _project_or_404(db, project_id)
    _require_manage(db, current_user, project)
    person = db.get(models.User, payload.user_id)
    if not person:
        raise HTTPException(400, "Selected employee does not exist")
    if db.query(models.ProjectAssociate.id).filter_by(project_id=project_id, user_id=payload.user_id).first():
        raise HTTPException(409, f"{person.name} is already associated with this project - edit their contribution instead.")
    row = models.ProjectAssociate(project_id=project_id, user_id=person.id,
                                  contribution=_contribution(payload.contribution),
                                  added_by_id=current_user.id, created_by=current_user.name)
    db.add(row)
    services.audit(db, current_user.name, "project", project_id, "associate_added", new_value=f"{person.name}: {row.contribution}")
    try:
        db.commit()
    except IntegrityError:  # the same person added twice at the same moment
        db.rollback()
        raise HTTPException(409, f"{person.name} is already associated with this project.")
    db.refresh(row)
    return row


@router.patch("/{project_id}/associates/{associate_id}", response_model=schemas.ProjectAssociateOut)
def update_associate(project_id: int, associate_id: int, payload: schemas.ProjectAssociateUpdate,
                     db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = _project_or_404(db, project_id)
    _require_manage(db, current_user, project)
    row = db.get(models.ProjectAssociate, associate_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404, "Associated person not found")
    previous = row.contribution
    row.contribution = _contribution(payload.contribution)
    services.audit(db, current_user.name, "project", project_id, "associate_updated",
                   previous_value=previous, new_value=row.contribution)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{project_id}/associates/{associate_id}", status_code=204)
def remove_associate(project_id: int, associate_id: int, db: Session = Depends(get_db),
                     current_user: models.User = Depends(get_current_user)):
    project = _project_or_404(db, project_id)
    _require_manage(db, current_user, project)
    row = db.get(models.ProjectAssociate, associate_id)
    if not row or row.project_id != project_id:
        return  # already gone
    person = db.get(models.User, row.user_id)
    services.audit(db, current_user.name, "project", project_id, "associate_removed",
                   previous_value=f"{person.name if person else row.user_id}: {row.contribution}")
    db.delete(row)
    db.commit()


@router.get("/{project_id}/milestones", response_model=list[schemas.MilestoneOut])
def list_milestones(project_id: int, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)):
    if not scope.sees_project_id(project_id):
        return []
    return db.query(models.Milestone).filter(models.Milestone.project_id == project_id).order_by(models.Milestone.due_date).all()


@router.post("/{project_id}/milestones", response_model=schemas.MilestoneOut, status_code=201)
def create_milestone(project_id: int, payload: schemas.MilestoneBase, db: Session = Depends(get_db),
                     current_user: models.User = Depends(get_current_user)):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if not permissions.can_edit_project(db, current_user, project):
        raise HTTPException(403, "Only an admin / PMO or a Responsible / Accountable person on this project's tasks can add milestones.")
    ms = models.Milestone(**{**payload.model_dump(), "project_id": project_id})
    db.add(ms)
    db.commit()
    db.refresh(ms)
    return ms


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, current_user: models.User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """The project's Manager (or an admin) deletes a project permanently, with every task under it."""
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if current_user.role != permissions.ADMIN_ROLE and current_user.id != project.manager_id:
        raise HTTPException(403, "Only the Project Manager can delete this project.")
    name = project.name
    milestone_ids = [m for (m,) in db.query(models.Milestone.id).filter(models.Milestone.project_id == project_id).all()]

    # Every task of the project goes with it (also the ones waiting for a delete decision),
    # together with its progress history, delays, approvals and RACI rows.
    tasks = db.query(models.Task).filter(models.Task.project_id == project_id).all()
    for task in tasks:
        services.hard_delete_task(db, task)
    if milestone_ids:
        db.query(models.Task).filter(models.Task.milestone_id.in_(milestone_ids)).update(
            {"milestone_id": None}, synchronize_session=False)
        db.query(models.BacklogItem).filter(models.BacklogItem.target_milestone_id.in_(milestone_ids)).update(
            {"target_milestone_id": None}, synchronize_session=False)
    db.query(models.Milestone).filter(models.Milestone.project_id == project_id).delete(synchronize_session=False)
    for model in (models.BacklogItem, models.Risk, models.Issue, models.Decision):
        db.query(model).filter(model.project_id == project_id).update({"project_id": None}, synchronize_session=False)
    db.query(models.RaciEntry).filter(models.RaciEntry.project_id == project_id).delete(synchronize_session=False)
    db.query(models.ProjectAssociate).filter(models.ProjectAssociate.project_id == project_id).delete(synchronize_session=False)
    db.query(models.MethodologyApproval).filter(models.MethodologyApproval.project_id == project_id).delete(synchronize_session=False)
    db.query(models.ProjectMethodology).filter(models.ProjectMethodology.project_id == project_id).delete(synchronize_session=False)
    # comments keep the project's code / name, so only the link is cleared
    db.query(models.Comment).filter(models.Comment.project_id == project_id).update(
        {"project_id": None}, synchronize_session=False)
    services.audit(db, current_user.name, "project", project_id, "deleted", previous_value=name,
                   reason=f"Deleted by {current_user.name} with {len(tasks)} task(s)")
    db.delete(project)
    db.commit()