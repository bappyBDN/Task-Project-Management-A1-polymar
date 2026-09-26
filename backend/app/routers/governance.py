"""Governance: Meeting -> Decision -> Action -> Task -> Evidence -> Closure.

Meetings - no database schema change:
  The meetings table only has title, type and date. The extra details
  (project, time, purpose, location, organiser, attendees) are saved as a
  "meeting_scheduled" row in the existing audit_logs table
  (entity_type="meeting", entity_id=<meeting id>, JSON in new_value).
  That row is also the audit record of who scheduled the meeting.

Who may schedule a meeting for a project:
  an Admin, or anyone related to that project - Responsible, Accountable or
  Reviewer on any of its tasks, or the project's Manager, Sponsor or Owner.

Who is notified:
  only the chosen attendees (by default everyone related to the project),
  never the organiser themself. The notification carries the date, time,
  project and purpose of the meeting.

Who sees a meeting in the list:
  Admins see all; everyone else sees meetings they organised or attend.
"""
import json
import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(tags=["governance"])

ADMIN_ROLE = "admin"
MEETING_DETAILS = "meeting_scheduled"
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")  # 24h "HH:MM"


# ---------------------------------------------------------------- request / response shapes
class MeetingCreate(BaseModel):
    title: str
    meeting_type: str = "operational_review"
    meeting_date: date
    meeting_time: str                       # "14:30"
    project_id: int
    purpose: str
    location: Optional[str] = None          # room or online link
    attendee_ids: Optional[list[int]] = None  # None = everyone related to the project


class MeetingFullOut(schemas.MeetingOut):
    project_id: Optional[int] = None
    meeting_time: Optional[str] = None
    purpose: Optional[str] = None
    location: Optional[str] = None
    organizer_id: Optional[int] = None
    attendee_ids: list[int] = []
    can_manage: bool = False


# ---------------------------------------------------------------- helpers
def _is_admin(user) -> bool:
    return user is not None and user.role == ADMIN_ROLE


def _project_people(db: Session, project_id: int) -> dict:
    """Active users related to a project -> the roles they hold in it."""
    project = db.get(models.Project, project_id)
    if not project:
        return {}
    people: dict = {}

    def add(uid, role):
        if uid:
            people.setdefault(uid, set()).add(role)

    add(project.manager_id, "Project Manager")
    add(project.sponsor_id, "Sponsor")
    add(project.owner_id, "Owner")
    tasks = db.query(models.Task).filter(
        models.Task.project_id == project_id, models.Task.is_deleted.is_(False)
    ).all()
    for t in tasks:
        add(t.responsible_id, "Responsible")
        add(t.accountable_id, "Accountable")
        add(t.reviewer_id, "Reviewer")
    if not people:
        return {}
    active = {uid for (uid,) in db.query(models.User.id).filter(
        models.User.id.in_(people.keys()), models.User.is_active.is_(True)
    ).all()}
    return {uid: roles for uid, roles in people.items() if uid in active}


def _details_map(db: Session, meeting_ids) -> dict:
    """meeting id -> its newest saved details (dict)."""
    ids = list(meeting_ids)
    if not ids:
        return {}
    rows = db.query(models.AuditLog).filter(
        models.AuditLog.entity_type == "meeting",
        models.AuditLog.action == MEETING_DETAILS,
        models.AuditLog.entity_id.in_(ids),
    ).order_by(models.AuditLog.id).all()
    out = {}
    for r in rows:  # later rows overwrite earlier ones
        try:
            out[r.entity_id] = json.loads(r.new_value or "{}")
        except ValueError:
            continue
    return out


def _to_out(m: models.Meeting, details: dict, user) -> MeetingFullOut:
    d = details or {}
    return MeetingFullOut(
        id=m.id, title=m.title, meeting_type=m.meeting_type, meeting_date=m.meeting_date,
        project_id=d.get("project_id"), meeting_time=d.get("meeting_time"),
        purpose=d.get("purpose"), location=d.get("location"),
        organizer_id=d.get("organizer_id"), attendee_ids=d.get("attendee_ids") or [],
        can_manage=_is_admin(user) or (user is not None and user.id == d.get("organizer_id")),
    )


def _can_see(details: dict, user) -> bool:
    if _is_admin(user):
        return True
    if not details:  # meetings created before this feature had no attendee list
        return True
    return user.id == details.get("organizer_id") or user.id in (details.get("attendee_ids") or [])


# ---------------------------------------------------------------- Meetings
@router.get("/meetings", response_model=list[MeetingFullOut])
def list_meetings(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    meetings = db.query(models.Meeting).all()
    details = _details_map(db, [m.id for m in meetings])
    visible = [m for m in meetings if _can_see(details.get(m.id), current_user)]
    # newest date first; meetings without a date at the end
    visible.sort(key=lambda m: (m.meeting_date is not None, m.meeting_date or date.min), reverse=True)
    return [_to_out(m, details.get(m.id), current_user) for m in visible]


@router.get("/meetings/schedulable-projects")
def schedulable_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Projects the current user may schedule a meeting for."""
    q = db.query(models.Project)
    if not _is_admin(current_user):
        uid = current_user.id
        task_project_ids = {pid for (pid,) in db.query(models.Task.project_id).filter(
            models.Task.is_deleted.is_(False),
            models.Task.project_id.isnot(None),
            (models.Task.responsible_id == uid) | (models.Task.accountable_id == uid) | (models.Task.reviewer_id == uid),
        ).distinct().all()}
        q = q.filter(
            (models.Project.id.in_(task_project_ids)) | (models.Project.manager_id == uid)
            | (models.Project.sponsor_id == uid) | (models.Project.owner_id == uid)
        )
    return [{"id": p.id, "code": p.code, "name": p.name} for p in q.order_by(models.Project.name).all()]


@router.get("/meetings/project-people/{project_id}")
def project_people(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Everyone related to a project (possible attendees) with their roles."""
    if not db.get(models.Project, project_id):
        raise HTTPException(404, "Project not found")
    people = _project_people(db, project_id)
    if not _is_admin(current_user) and current_user.id not in people:
        raise HTTPException(403, "You are not part of this project")
    users = db.query(models.User).filter(models.User.id.in_(people.keys())).all() if people else []
    return sorted(
        [{"id": u.id, "name": u.name, "designation": u.designation, "roles": sorted(people[u.id])} for u in users],
        key=lambda x: x["name"].lower(),
    )


@router.post("/meetings", response_model=MeetingFullOut, status_code=201)
def create_meeting(payload: MeetingCreate, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    title = payload.title.strip()
    purpose = payload.purpose.strip()
    time = payload.meeting_time.strip()
    if not title:
        raise HTTPException(400, "Meeting title is required")
    if not purpose:
        raise HTTPException(400, "Purpose of the meeting is required")
    if not TIME_RE.match(time):
        raise HTTPException(400, "Time must be in HH:MM format, e.g. 14:30")

    project = db.get(models.Project, payload.project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    people = _project_people(db, project.id)
    if not _is_admin(current_user) and current_user.id not in people:
        raise HTTPException(403, "Only an admin or someone who is Responsible, Accountable or Reviewer on this project can schedule its meetings")

    if payload.attendee_ids is None:
        attendees = set(people)
    else:
        attendees = set(payload.attendee_ids)
        outsiders = attendees - set(people) - {current_user.id}
        if outsiders:
            raise HTTPException(400, "Attendees must be people related to this project")
    attendees.add(current_user.id)  # the organiser always attends

    meeting = models.Meeting(title=title[:240], meeting_type=payload.meeting_type or "operational_review",
                             meeting_date=payload.meeting_date)
    db.add(meeting)
    db.flush()

    details = {
        "project_id": project.id,
        "meeting_time": time,
        "purpose": purpose,
        "location": (payload.location or "").strip() or None,
        "organizer_id": current_user.id,
        "attendee_ids": sorted(attendees),
    }
    db.add(models.AuditLog(
        actor=current_user.name, entity_type="meeting", entity_id=meeting.id,
        action=MEETING_DETAILS, new_value=json.dumps(details),
    ))

    when = f"{payload.meeting_date.strftime('%d %b %Y')} at {time}"
    body = f"When: {when} | Project: {project.code} - {project.name} | Purpose: {purpose}"
    if details["location"]:
        body += f" | Where: {details['location']}"
    body += f" | Organised by {current_user.name}"
    for uid in sorted(attendees - {current_user.id}):
        services.notify(db, uid, f"Meeting scheduled: {title} ({when})"[:240], body=body, kind="meeting")

    db.commit()
    db.refresh(meeting)
    return _to_out(meeting, details, current_user)


# ---------------------------------------------------------------- Decisions
@router.get("/decisions", response_model=list[schemas.DecisionOut])
def list_decisions(project_id: int | None = None, status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Decision)
    if project_id:
        q = q.filter(models.Decision.project_id == project_id)
    if status:
        q = q.filter(models.Decision.status == status)
    return q.order_by(models.Decision.decision_date.desc()).all()


@router.post("/decisions", response_model=schemas.DecisionOut, status_code=201)
def create_decision(payload: schemas.DecisionBase, db: Session = Depends(get_db)):
    if not (payload.statement or "").strip():
        raise HTTPException(400, "Decision statement is required")
    code = payload.code or services.next_code("DEC", db, models.Decision)
    d = models.Decision(**{**payload.model_dump(), "code": code})
    db.add(d)
    db.flush()
    services.notify(db, d.owner_id, f"Decision assigned to you: {d.code}", body=d.statement, kind="action")
    db.commit()
    db.refresh(d)
    return d


@router.patch("/decisions/{decision_id}", response_model=schemas.DecisionOut)
def update_decision(decision_id: int, payload: schemas.DecisionBase, db: Session = Depends(get_db)):
    d = db.get(models.Decision, decision_id)
    if not d:
        raise HTTPException(404, "Decision not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return d


# ---------------------------------------------------------------- Management Actions
@router.get("/actions", response_model=list[schemas.ManagementActionOut])
def list_actions(status: str | None = None, responsible_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.ManagementAction)
    if status:
        q = q.filter(models.ManagementAction.status == status)
    if responsible_id:
        q = q.filter(models.ManagementAction.responsible_id == responsible_id)
    return q.order_by(models.ManagementAction.due_date).all()


@router.post("/actions", response_model=schemas.ManagementActionOut, status_code=201)
def create_action(payload: schemas.ManagementActionBase, db: Session = Depends(get_db)):
    if not (payload.action or "").strip():
        raise HTTPException(400, "Action text is required")
    code = payload.code or services.next_code("ACT", db, models.ManagementAction)
    a = models.ManagementAction(**{**payload.model_dump(), "code": code})
    db.add(a)
    db.commit()
    db.refresh(a)
    services.notify(db, a.responsible_id, f"Management action assigned: {a.code}",
                    body=a.action, kind="action")
    if a.accountable_id and a.accountable_id != a.responsible_id:
        services.notify(db, a.accountable_id, f"You are accountable for action {a.code}",
                        body=a.action, kind="action")
    db.commit()
    return a


@router.patch("/actions/{action_id}", response_model=schemas.ManagementActionOut)
def update_action(action_id: int, payload: schemas.ManagementActionBase, db: Session = Depends(get_db)):
    a = db.get(models.ManagementAction, action_id)
    if not a:
        raise HTTPException(404, "Action not found")
    data = payload.model_dump(exclude_unset=True)
    # Evidence -> Closure: an action can only be closed once evidence is recorded.
    if data.get("status") == "closed" and a.status != "closed":
        evidence = (data.get("evidence") if "evidence" in data else a.evidence) or ""
        if not evidence.strip():
            raise HTTPException(400, "Add evidence before closing this action")
    for k, v in data.items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return a


@router.post("/actions/{action_id}/convert-to-task", response_model=schemas.TaskOut, status_code=201)
def convert_action(action_id: int, responsible_id: int | None = None, db: Session = Depends(get_db)):
    a = db.get(models.ManagementAction, action_id)
    if not a:
        raise HTTPException(404, "Action not found")
    if a.converted_task_id:
        task = db.get(models.Task, a.converted_task_id)
        return task
    # The new task belongs to the same project as the decision it came from.
    project = None
    if a.decision_id:
        decision = db.get(models.Decision, a.decision_id)
        if decision and decision.project_id:
            project = db.get(models.Project, decision.project_id)
    code = services.next_code("TSK", db, models.Task)
    task = models.Task(
        code=code, title=a.action[:240], description=a.action,
        category="management_action", task_type="action",
        responsible_id=a.responsible_id or responsible_id, accountable_id=a.accountable_id,
        baseline_due_date=a.due_date, approved_due_date=a.due_date,
        status="backlog", progress_pct=0.0,
        project_id=project.id if project else None,
        company_id=project.company_id if project else None,
        function_id=project.function_id if project else None,
    )
    db.add(task)
    db.flush()
    a.converted_task_id = task.id
    if task.project_id:
        services.recalc_project_health(db, task.project_id)
    services.notify(db, task.responsible_id, f"Task assigned: {task.title}"[:240],
                    body=f"Created from management action {a.code}. You are responsible for {task.code}.",
                    kind="assignment")
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------- Risks
@router.get("/risks", response_model=list[schemas.RiskOut])
def list_risks(project_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Risk)
    if project_id:
        q = q.filter(models.Risk.project_id == project_id)
    return q.order_by(models.Risk.id).all()


@router.post("/risks", response_model=schemas.RiskOut, status_code=201)
def create_risk(payload: schemas.RiskBase, db: Session = Depends(get_db)):
    r = models.Risk(**payload.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ---------------------------------------------------------------- Issues
@router.get("/issues", response_model=list[schemas.IssueOut])
def list_issues(project_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Issue)
    if project_id:
        q = q.filter(models.Issue.project_id == project_id)
    return q.order_by(models.Issue.id).all()


@router.post("/issues", response_model=schemas.IssueOut, status_code=201)
def create_issue(payload: schemas.IssueBase, db: Session = Depends(get_db)):
    i = models.Issue(**payload.model_dump())
    db.add(i)
    db.commit()
    db.refresh(i)
    return i