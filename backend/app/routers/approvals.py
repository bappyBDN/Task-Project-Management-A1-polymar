"""Approvals.

Related people for an approval (the only ones who see it and get notified):
  - task approvals:    the task's Responsible, Accountable and Reviewer
  - project approvals: the project's Manager, Sponsor and Owner
  - whoever requested it and whoever it is assigned to (approver)
  - every active Admin

Who may approve / reject:
  - an Admin, or
  - the assigned approver, or the task's Reviewer / Accountable
  - never the person who requested it (unless that person is an Admin)

Date revision requests (approval_type "revised_date" on a task) are special:
  - they always go to the task's Reviewer (the task must have one)
  - only the Reviewer is notified of the request
  - only the Reviewer (or an Admin) may approve / reject
  - the outcome is sent to the requester and the task's Responsible person

No database schema change: this only uses existing columns.
"""
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/approvals", tags=["approvals"])

ADMIN_ROLE = "admin"
VALID_DECISIONS = ("approved", "rejected")


# ---------------------------------------------------------------- helpers
def _is_admin(user) -> bool:
    return user is not None and user.role == ADMIN_ROLE


def _admin_ids(db: Session) -> set:
    rows = db.query(models.User.id).filter(
        models.User.role == ADMIN_ROLE, models.User.is_active.is_(True)
    ).all()
    return {r[0] for r in rows}


def _entity(db: Session, approval: models.Approval):
    """The task or project this approval is about (None if it no longer exists)."""
    if approval.entity_type == "task":
        return db.get(models.Task, approval.entity_id)
    if approval.entity_type == "project":
        return db.get(models.Project, approval.entity_id)
    return None


def _related_ids(approval: models.Approval, entity) -> set:
    """Everyone involved in this approval, not counting admins."""
    ids = {approval.requested_by_id, approval.approver_id}
    if entity is not None:
        if approval.entity_type == "task":
            ids |= {entity.responsible_id, entity.accountable_id, entity.reviewer_id}
        elif approval.entity_type == "project":
            ids |= {entity.manager_id, entity.sponsor_id, entity.owner_id}
    ids.discard(None)
    return ids


def _is_date_revision(approval: models.Approval) -> bool:
    return approval.approval_type == "revised_date" and approval.entity_type == "task"


def _decider_ids(approval: models.Approval, entity) -> set:
    """Non-admin users allowed to approve / reject."""
    if _is_date_revision(approval):
        ids = {entity.reviewer_id} if entity is not None else set()
    else:
        ids = {approval.approver_id}
        if entity is not None and approval.entity_type == "task":
            ids |= {entity.reviewer_id, entity.accountable_id}
    ids.discard(None)
    ids.discard(approval.requested_by_id)  # nobody approves their own request
    return ids


def _type_label(approval: models.Approval) -> str:
    return (approval.approval_type or "approval").replace("_", " ").title()


def _entity_label(approval: models.Approval, entity) -> str:
    if entity is not None and approval.entity_type == "task":
        return f"{entity.code} - {entity.title}"
    if entity is not None and approval.entity_type == "project":
        return f"{entity.code} - {entity.name}"
    return f"{approval.entity_type} #{approval.entity_id}"


def _notify_users(db: Session, user_ids: set, title: str, body: str, exclude_user_id=None) -> int:
    """In-app notification to exactly these users (skips inactive users and the
    person who performed the action). Returns how many were notified."""
    recipients = {u for u in user_ids if u is not None}
    recipients.discard(exclude_user_id)
    if not recipients:
        return 0
    active = db.query(models.User.id).filter(
        models.User.id.in_(recipients), models.User.is_active.is_(True)
    ).all()
    for (uid,) in active:
        services.notify(db, uid, title, body=body, kind="approval")
    return len(active)


def _notify_related(db: Session, approval: models.Approval, entity,
                    title: str, body: str, exclude_user_id=None):
    """In-app notification to related people + admins only."""
    _notify_users(db, _related_ids(approval, entity) | _admin_ids(db), title, body, exclude_user_id)


# ---------------------------------------------------------------- routes
@router.get("", response_model=list[schemas.ApprovalOut])
def list_approvals(
    approver_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Approval)
    if approver_id:
        q = q.filter(models.Approval.approver_id == approver_id)
    if status:
        q = q.filter(models.Approval.status == status)
    rows = q.order_by(models.Approval.created_at.desc()).all()

    if _is_admin(current_user):
        return rows

    # Non-admins only see approvals they are related to.
    task_ids = {a.entity_id for a in rows if a.entity_type == "task"}
    project_ids = {a.entity_id for a in rows if a.entity_type == "project"}
    tasks = {t.id: t for t in db.query(models.Task).filter(models.Task.id.in_(task_ids)).all()} if task_ids else {}
    projects = {p.id: p for p in db.query(models.Project).filter(models.Project.id.in_(project_ids)).all()} if project_ids else {}

    visible = []
    for a in rows:
        if a.entity_type == "task":
            entity = tasks.get(a.entity_id)
        elif a.entity_type == "project":
            entity = projects.get(a.entity_id)
        else:
            entity = None
        if current_user.id in _related_ids(a, entity):
            visible.append(a)
    return visible


@router.get("/{approval_id}")
def get_approval(
    approval_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """One approval for the detail page. Only related people and admins may open
    it. `can_decide` tells the page whether to show Approve / Reject."""
    approval = db.get(models.Approval, approval_id)
    if not approval:
        raise HTTPException(404, "Approval not found")
    entity = _entity(db, approval)
    if not _is_admin(current_user) and current_user.id not in _related_ids(approval, entity):
        raise HTTPException(403, "You are not involved in this approval")
    data = schemas.ApprovalOut.model_validate(approval).model_dump()
    data["can_decide"] = approval.status == "pending" and (
        _is_admin(current_user) or current_user.id in _decider_ids(approval, entity)
    )
    return data


@router.post("", response_model=schemas.ApprovalOut, status_code=201)
def create_approval(
    payload: schemas.ApprovalBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    data = payload.model_dump()
    if not data.get("requested_by_id"):
        data["requested_by_id"] = current_user.id
    approval = models.Approval(**data, status="pending")
    entity = _entity(db, approval)

    if _is_date_revision(approval):
        # Date revisions always go to the task's Reviewer.
        if entity is None:
            raise HTTPException(404, "Task not found")
        if not entity.reviewer_id:
            raise HTTPException(400, "This task has no reviewer. Ask an admin to assign a reviewer before requesting a date revision.")
        approval.approver_id = entity.reviewer_id
    elif approval.approver_id is None and approval.entity_type == "task" and entity is not None:
        # No approver chosen on the page: pick Reviewer -> Accountable -> line manager.
        approver = services.resolve_approver_id(db, entity, approval.requested_by_id)
        if approver and approver != approval.requested_by_id:
            approval.approver_id = approver

    db.add(approval)
    db.flush()

    requester = db.get(models.User, approval.requested_by_id) if approval.requested_by_id else None
    title = f"Approval requested: {_type_label(approval)} - {_entity_label(approval, entity)}"
    body = f"Requested by {requester.name if requester else 'unknown'}. {approval.reason or ''}".strip()
    if _is_date_revision(approval):
        # Only the Reviewer. If the Reviewer made the request themselves,
        # admins get it instead so it is never left unseen.
        if _notify_users(db, {approval.approver_id}, title, body, exclude_user_id=current_user.id) == 0:
            _notify_users(db, _admin_ids(db), title, body, exclude_user_id=current_user.id)
    else:
        _notify_related(db, approval, entity, title, body, exclude_user_id=current_user.id)
    db.commit()
    db.refresh(approval)
    return approval


@router.post("/{approval_id}/decision", response_model=schemas.ApprovalOut)
def decide_approval(
    approval_id: int,
    payload: schemas.ApprovalDecision,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    approval = db.get(models.Approval, approval_id)
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval.status != "pending":
        raise HTTPException(409, "Approval already decided")
    if payload.status not in VALID_DECISIONS:
        raise HTTPException(400, "Status must be 'approved' or 'rejected'")

    entity = _entity(db, approval)
    if not _is_admin(current_user) and current_user.id not in _decider_ids(approval, entity):
        raise HTTPException(403, "Only the assigned approver, the task's reviewer/accountable or an admin can decide this approval")

    approval.status = payload.status
    # Keep the requester's original reason and add the decision note under it
    # (previously the decision overwrote the original reason).
    note = f"Decision ({payload.status}) by {current_user.name}"
    if payload.reason:
        note += f": {payload.reason}"
    approval.reason = f"{approval.reason}\n{note}" if approval.reason else note
    approval.decided_at = datetime.utcnow()

    # Apply side effects
    if approval.entity_type == "task":
        task = db.get(models.Task, approval.entity_id)
        if task:
            if approval.approval_type == "completion" and payload.status == "approved":
                task.status = "completed"
                task.actual_due_date = date.today()
                task.progress_pct = 100.0
            if approval.approval_type == "revised_date":
                # The pending delay record that carries the proposed date (a plain
                # delay logged later no longer hides it).
                rca = db.query(models.DelayRca).filter(
                    models.DelayRca.task_id == task.id,
                    models.DelayRca.revised_due_date.isnot(None),
                    models.DelayRca.approval_status == "pending",
                ).order_by(models.DelayRca.id.desc()).first()
                if rca:
                    if payload.status == "approved":
                        task.approved_due_date = rca.revised_due_date
                    rca.approval_status = payload.status  # rejected ones no longer stay "pending"
            services.recalc_task_health(db, task)
            if task.project_id:
                services.recalc_project_health(db, task.project_id)

    services.audit(db, current_user.name, approval.entity_type, approval.entity_id,
                   f"approval_{payload.status}", reason=payload.reason)
    title = f"{_type_label(approval)} {payload.status}: {_entity_label(approval, entity)}"
    body = f"{payload.status.title()} by {current_user.name}. {payload.reason or ''}".strip()
    if _is_date_revision(approval):
        # Outcome goes to whoever asked and the task's Responsible person.
        outcome_ids = {approval.requested_by_id}
        if entity is not None:
            outcome_ids.add(entity.responsible_id)
        _notify_users(db, outcome_ids, title, body, exclude_user_id=current_user.id)
    else:
        _notify_related(db, approval, entity, title, body, exclude_user_id=current_user.id)
    db.commit()
    db.refresh(approval)
    return approval