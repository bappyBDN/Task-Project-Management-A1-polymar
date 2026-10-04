"""Methodology approval on the project page.

The Project Manager adds the project's methodology document (a Google Drive /
Docs link) and picks three approvers: the Group Executive, the Team Lead
and the Function Head (any employee can fill a slot; someone not in the system is
added with the normal sign-up form first). Each approver opens the document and
records Approved / Rejected / Under Review with a note or findings.

Who may do what
  Project Manager, admin / privileged role -> set the document link, assign approvers
  the approver in a slot                   -> decide that slot (nobody else, not even admin)
  approvers, Project Manager, admin / privileged -> open the document, read the notes
  everyone else                            -> sees only who approves and the status

Changing the document link sends every decision back to Pending: a new document
needs a fresh approval. Notes are kept so earlier findings stay visible.
Tables: project_methodologies (one per project) and methodology_approvals (one
per approver slot).
"""
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app import email_service, models, permissions, schemas, services
from app.auth import get_current_user
from app.config import settings
from app.database import get_db

router = APIRouter(prefix="/methodology", tags=["methodology"])
logger = logging.getLogger("app.methodology")

ROLES = {
    "group_executive": "Group Executive",
    "team_lead": "Team Lead",
    "function_head": "Function Head",
}
DECISIONS = {"approved": "Approved", "rejected": "Rejected", "review": "Under Review"}
MAX_NOTE_LENGTH = 2000
MAX_LINK_LENGTH = 1000


# ---------------------------------------------------------------- helpers
def _project(db: Session, project_id: int) -> models.Project:
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def _role(role: str) -> str:
    if role not in ROLES:
        raise HTTPException(404, "Unknown approver role")
    return role


def _rows(db: Session, project_id: int) -> tuple[models.ProjectMethodology | None, dict[str, models.MethodologyApproval]]:
    m = db.query(models.ProjectMethodology).filter(models.ProjectMethodology.project_id == project_id).first()
    if not m:
        return None, {}
    slots = db.query(models.MethodologyApproval).filter(models.MethodologyApproval.methodology_id == m.id).all()
    return m, {s.approver_role: s for s in slots}


def _get_or_create(db: Session, project: models.Project) -> models.ProjectMethodology:
    m = db.query(models.ProjectMethodology).filter(models.ProjectMethodology.project_id == project.id).first()
    if not m:
        m = models.ProjectMethodology(project_id=project.id)
        db.add(m)
    m.project_code, m.project_name = project.code, project.name  # keep the copy current
    db.flush()
    return m


def _can_manage(db: Session, user: models.User, project: models.Project) -> bool:
    return user.id == project.manager_id or permissions.can_manage(db, user, project)


def _status(m: models.ProjectMethodology | None, slots: dict[str, models.MethodologyApproval]) -> str:
    """not_started (no document yet) / rejected / review / approved (all three) / pending."""
    if not m or not m.doc_link:
        return "not_started"
    decisions = [slots[r].decision if r in slots and slots[r].approver_id else "unassigned" for r in ROLES]
    if "rejected" in decisions:
        return "rejected"
    if "review" in decisions:
        return "review"
    if all(d == "approved" for d in decisions):
        return "approved"
    return "pending"


def _link(project: models.Project) -> str:
    return f"{settings.frontend_url.rstrip('/')}/projects/{project.id}"


def _email(to: models.User, subject: str, heading: str, intro: str, project: models.Project,
           extra: list[tuple[str, str]], note: str | None = None) -> None:
    """Runs after the response (background task); an email problem never affects the save."""
    try:
        email_service.send_methodology_email(
            to.email, to.name, subject, heading, intro,
            [("Project", f"{project.code} - {project.name}")] + extra, _link(project), note)
    except Exception:
        logger.exception("Methodology email to %s failed", to.email)


def _ask_to_review(background_tasks: BackgroundTasks, db: Session, slot: models.MethodologyApproval,
                   project: models.Project, by: models.User, why: str) -> None:
    approver = db.get(models.User, slot.approver_id) if slot.approver_id else None
    if not approver or not approver.is_active or approver.id == by.id:
        return
    label = ROLES[slot.approver_role]
    services.notify(db, approver.id, f"Methodology approval needed: {project.code} - {project.name}"[:240],
                    body=f"{why} You are the {label} approver.", kind="approval")
    if approver.email:
        background_tasks.add_task(
            _email, approver, f"Methodology approval needed: {project.code} - {project.name}",
            "📄 Methodology approval needed", f"{why} Please open the project, review the methodology "
            f"document and record your decision as the {label}.", project, [("Requested by", by.name)])


def _out(db: Session, user: models.User, project: models.Project) -> dict:
    m, slots = _rows(db, project.id)
    mine = {r for r, s in slots.items() if s.approver_id == user.id}
    can_manage = _can_manage(db, user, project)
    can_open = can_manage or bool(mine)
    approvals = []
    for role, label in ROLES.items():
        s = slots.get(role)
        assigned = bool(s and s.approver_id)
        approvals.append({
            "role": role,
            "label": label,
            "approver_id": s.approver_id if s else None,
            "approver_name": s.approver_name if assigned else None,
            "decision": s.decision if assigned else "unassigned",
            "note": s.note if (s and can_open) else None,
            "decided_at": s.decided_at if assigned else None,
            "is_me": role in mine,
        })
    return {
        "project_id": project.id,
        "project_code": project.code,
        "project_name": project.name,
        "manager_id": project.manager_id,
        "has_link": bool(m and m.doc_link),
        "doc_link": m.doc_link if (m and can_open) else None,
        "link_updated_by_name": m.link_updated_by_name if m else None,
        "link_updated_at": m.link_updated_at if m else None,
        "status": _status(m, slots),
        "approved_count": sum(1 for a in approvals if a["decision"] == "approved"),
        "total": len(ROLES),
        "can_manage": can_manage,
        "can_open": can_open,
        "approvals": approvals,
    }


# ---------------------------------------------------------------- endpoints
@router.get("/{project_id}")
def get_methodology(project_id: int, db: Session = Depends(get_db),
                    current_user: models.User = Depends(get_current_user)):
    return _out(db, current_user, _project(db, project_id))


@router.patch("/{project_id}/link")
def set_link(project_id: int, payload: schemas.MethodologyLinkIn, background_tasks: BackgroundTasks,
             db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = _project(db, project_id)
    if not _can_manage(db, current_user, project):
        raise HTTPException(403, "Only the Project Manager (or an admin / PMO) can set the methodology document.")
    link = (payload.doc_link or "").strip() or None
    if link:
        if not link.lower().startswith(("https://", "http://")):
            raise HTTPException(400, "Paste the full link, starting with https:// (e.g. a Google Drive or Docs share link).")
        if len(link) > MAX_LINK_LENGTH or any(ch.isspace() for ch in link):
            raise HTTPException(400, "That doesn't look like a valid link.")

    m = _get_or_create(db, project)
    if link == m.doc_link:
        return _out(db, current_user, project)
    previous = m.doc_link
    m.doc_link = link
    m.link_updated_by_id, m.link_updated_by_name, m.link_updated_at = current_user.id, current_user.name, datetime.utcnow()
    m.updated_by = current_user.name

    # a new / changed document needs a fresh approval from everyone
    _, slots = _rows(db, project.id)
    for s in slots.values():
        s.decision, s.decided_at = "pending", None
    if link:
        why = "The methodology document was updated." if previous else "The methodology document was added."
        for s in slots.values():
            _ask_to_review(background_tasks, db, s, project, current_user, why)
    services.audit(db, current_user.name, "project", project.id,
                   "methodology document updated" if link else "methodology document removed")
    db.commit()
    return _out(db, current_user, project)


@router.patch("/{project_id}/approvers/{role}")
def set_approver(project_id: int, role: str, payload: schemas.MethodologyApproverIn,
                 background_tasks: BackgroundTasks, db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    project = _project(db, project_id)
    role = _role(role)
    if not _can_manage(db, current_user, project):
        raise HTTPException(403, "Only the Project Manager (or an admin / PMO) can choose the approvers.")
    approver = None
    if payload.approver_id is not None:
        approver = db.get(models.User, payload.approver_id)
        if not approver or not approver.is_active:
            raise HTTPException(400, "Choose an active employee.")

    m = _get_or_create(db, project)
    _, slots = _rows(db, project.id)
    slot = slots.get(role)
    if slot is None:
        slot = models.MethodologyApproval(methodology_id=m.id, project_id=project.id, approver_role=role)
        db.add(slot)
    if slot.approver_id == (approver.id if approver else None):
        db.commit()
        return _out(db, current_user, project)
    slot.approver_id = approver.id if approver else None
    slot.approver_name = approver.name if approver else None
    slot.decision, slot.note, slot.decided_at = "pending", None, None
    slot.updated_by = current_user.name
    db.flush()
    if approver and m.doc_link:
        _ask_to_review(background_tasks, db, slot, project, current_user,
                       f"You were chosen to approve the methodology of {project.code} - {project.name}.")
    elif approver and approver.id != current_user.id:
        services.notify(db, approver.id, f"Methodology approver: {project.code} - {project.name}"[:240],
                        body=f"You are the {ROLES[role]} approver. You will be able to review once the "
                             "Project Manager adds the document.", kind="approval")
    services.audit(db, current_user.name, "project", project.id, f"methodology {ROLES[role]} approver set",
                   new_value=approver.name if approver else "(none)")
    db.commit()
    return _out(db, current_user, project)


@router.patch("/{project_id}/decision/{role}")
def set_decision(project_id: int, role: str, payload: schemas.MethodologyDecisionIn,
                 background_tasks: BackgroundTasks, db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    project = _project(db, project_id)
    role = _role(role)
    m, slots = _rows(db, project.id)
    slot = slots.get(role)
    if not slot or slot.approver_id != current_user.id:
        raise HTTPException(403, f"Only the assigned {ROLES[role]} can record this decision.")
    if not m or not m.doc_link:
        raise HTTPException(400, "The Project Manager hasn't added the methodology document yet.")
    if payload.decision not in DECISIONS:
        raise HTTPException(400, "Choose Approve, Reject or Under Review.")
    note = (payload.note or "").strip() or None
    if note and len(note) > MAX_NOTE_LENGTH:
        raise HTTPException(400, f"The note is too long ({MAX_NOTE_LENGTH} characters at most).")
    if payload.decision in ("rejected", "review") and not note:
        raise HTTPException(400, "Write your findings so the Project Manager knows what to change.")

    slot.decision, slot.note, slot.decided_at = payload.decision, note, datetime.utcnow()
    slot.updated_by = current_user.name
    verdict = DECISIONS[payload.decision]
    services.audit(db, current_user.name, "project", project.id, f"methodology {verdict.lower()}",
                   reason=f"{ROLES[role]}")

    pm = db.get(models.User, project.manager_id) if project.manager_id else None
    if pm and pm.is_active and pm.id != current_user.id:
        services.notify(db, pm.id, f"Methodology {verdict.lower()} by {ROLES[role]}: {project.code}"[:240],
                        body=f"{current_user.name}: {note or verdict}"[:1000], kind="approval")
        if pm.email:
            background_tasks.add_task(
                _email, pm, f"Methodology {verdict.lower()} - {project.code} - {project.name}",
                f"📄 Methodology {verdict.lower()}",
                f"{current_user.name} ({ROLES[role]}) marked the project's methodology as {verdict}.",
                project, [("Decision", verdict), ("By", f"{current_user.name} ({ROLES[role]})")], note)
    db.commit()
    return _out(db, current_user, project)
