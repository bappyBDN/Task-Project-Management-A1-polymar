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

Who sees a decision / management action (see _Visibility):
  a project's decisions and actions are seen only by Admins, people related
  to that project and the people named on the item. Items that belong to no
  project are general management items, seen by everyone.
"""
import json
import logging
import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import email_service, models, schemas, services
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(tags=["governance"])
logger = logging.getLogger("app.governance")

# Meeting invitation EMAILS go only to invitees who hold one of these roles on
# the project's tasks (in-app notifications still go to every invitee).
EMAIL_ROLES = {"Responsible", "Accountable", "Reviewer", "Informed"}

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
    emailed_ids: list[int] = []   # invitees an email invitation was sent to
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
        add(t.informed_id, "Informed")
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
        emailed_ids=d.get("emailed_ids") or [],
        can_manage=_is_admin(user) or (user is not None and user.id == d.get("organizer_id")),
    )


def _send_meeting_invites(invites: list, meeting: dict) -> None:
    """Runs AFTER the response is sent (background task), so the page stays fast.
    Uses plain data only (no database session). Any email problem is logged and
    never affects the saved meeting."""
    sent = 0
    for inv in invites:
        try:
            if email_service.send_meeting_invite_email(to_email=inv["email"], recipient_name=inv["name"],
                                                       roles=inv["roles"], **meeting):
                sent += 1
        except Exception:
            logger.exception("Meeting invitation email to %s failed", inv.get("email"))
    logger.info("Meeting %s: invitation emails sent %s/%s", meeting.get("meeting_id"), sent, len(invites))


def _can_see(details: dict, user) -> bool:
    if _is_admin(user):
        return True
    if not details:  # meetings created before this feature had no attendee list
        return True
    return user.id == details.get("organizer_id") or user.id in (details.get("attendee_ids") or [])


def _my_project_ids(db: Session, user) -> set:
    """Projects the user is related to: Responsible, Accountable, Reviewer or
    Informed on any of its tasks, or its Manager, Sponsor or Owner."""
    uid = user.id
    ids = {pid for (pid,) in db.query(models.Task.project_id).filter(
        models.Task.is_deleted.is_(False),
        models.Task.project_id.isnot(None),
        (models.Task.responsible_id == uid) | (models.Task.accountable_id == uid) | (models.Task.reviewer_id == uid)
        | (models.Task.informed_id == uid),
    ).distinct().all()}
    ids |= {pid for (pid,) in db.query(models.Project.id).filter(
        (models.Project.manager_id == uid) | (models.Project.sponsor_id == uid) | (models.Project.owner_id == uid)
    ).all()}
    return ids


class _Visibility:
    """Who sees a decision / management action - no database schema change.

    The project of a decision is its own project, else the project of its
    meeting. The project of an action is the project of its decision, else of
    its meeting, else of the task it was converted to.

    A project item is seen only by Admins, people related to that project and
    the people named on the item itself (owner / responsible / accountable).
    An item that belongs to no project is a general management item and is
    seen by everyone.
    """

    def __init__(self, db: Session, user):
        self.db = db
        self.user = user
        self.admin = _is_admin(user)
        self.my_projects = set() if self.admin else _my_project_ids(db, user)
        self._meeting_project: dict = {}

    def _meeting_pid(self, meeting_id):
        if not meeting_id:
            return None
        if meeting_id not in self._meeting_project:
            self._meeting_project[meeting_id] = (_details_map(self.db, [meeting_id]).get(meeting_id) or {}).get("project_id")
        return self._meeting_project[meeting_id]

    def preload_meetings(self, meeting_ids) -> None:
        ids = {i for i in meeting_ids if i}
        details = _details_map(self.db, ids)
        for i in ids:
            self._meeting_project[i] = (details.get(i) or {}).get("project_id")

    def decision_pid(self, d):
        return d.project_id or self._meeting_pid(d.meeting_id)

    def action_pid(self, a, decision=None, task=None):
        pid = self.decision_pid(decision) if decision else None
        return pid or self._meeting_pid(a.meeting_id) or (task.project_id if task else None)

    def _allowed(self, pid, named_ids) -> bool:
        if self.admin or not pid:
            return True
        return pid in self.my_projects or self.user.id in named_ids

    def decision(self, d) -> bool:
        return self._allowed(self.decision_pid(d), {d.owner_id})

    def action(self, a, decision=None, task=None) -> bool:
        named = {a.responsible_id, a.accountable_id, decision.owner_id if decision else None}
        return self._allowed(self.action_pid(a, decision, task), named)

    def action_by_id(self, a) -> bool:
        decision = self.db.get(models.Decision, a.decision_id) if a.decision_id else None
        task = self.db.get(models.Task, a.converted_task_id) if a.converted_task_id else None
        return self.action(a, decision, task)


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
        q = q.filter(models.Project.id.in_(_my_project_ids(db, current_user)))
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
def create_meeting(payload: MeetingCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db),
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
        raise HTTPException(403, "Only an admin or someone who is Responsible, Accountable, Reviewer or Informed on this project can schedule its meetings")

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

    # Email only invitees who are Responsible / Accountable / Reviewer / Informed on the project.
    emailed_ids = sorted(uid for uid in attendees - {current_user.id} if people.get(uid, set()) & EMAIL_ROLES)

    details = {
        "project_id": project.id,
        "meeting_time": time,
        "purpose": purpose,
        "location": (payload.location or "").strip() or None,
        "organizer_id": current_user.id,
        "attendee_ids": sorted(attendees),
        "emailed_ids": emailed_ids,
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

    # Queue the invitation emails; they are sent after this response returns.
    if emailed_ids:
        recipients = db.query(models.User).filter(models.User.id.in_(emailed_ids)).all()
        invites = [
            {"email": u.email, "name": u.name, "roles": sorted(people.get(u.id, set()) & EMAIL_ROLES)}
            for u in recipients if u.email
        ]
        if invites:
            background_tasks.add_task(_send_meeting_invites, invites, {
                "meeting_id": meeting.id,
                "title": meeting.title,
                "meeting_type": meeting.meeting_type,
                "meeting_date": payload.meeting_date,
                "meeting_time": time,
                "purpose": purpose,
                "location": details["location"],
                "project_label": f"{project.code} - {project.name}",
                "organizer_name": current_user.name,
            })

    return _to_out(meeting, details, current_user)


# ---------------------------------------------------------------- Decisions
@router.get("/decisions", response_model=list[schemas.DecisionOut])
def list_decisions(project_id: int | None = None, status: str | None = None, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    q = db.query(models.Decision)
    if project_id:
        q = q.filter(models.Decision.project_id == project_id)
    if status:
        q = q.filter(models.Decision.status == status)
    decisions = q.order_by(models.Decision.decision_date.desc()).all()
    vis = _Visibility(db, current_user)
    vis.preload_meetings(d.meeting_id for d in decisions)
    return [d for d in decisions if vis.decision(d)]


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
def update_decision(decision_id: int, payload: schemas.DecisionBase, db: Session = Depends(get_db),
                    current_user: models.User = Depends(get_current_user)):
    d = db.get(models.Decision, decision_id)
    if not d:
        raise HTTPException(404, "Decision not found")
    if not _Visibility(db, current_user).decision(d):
        raise HTTPException(403, "You are not part of this decision's project")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return d


# ---------------------------------------------------------------- Management Actions
@router.get("/actions", response_model=list[schemas.ManagementActionOut])
def list_actions(status: str | None = None, responsible_id: int | None = None, db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    q = db.query(models.ManagementAction)
    if status:
        q = q.filter(models.ManagementAction.status == status)
    if responsible_id:
        q = q.filter(models.ManagementAction.responsible_id == responsible_id)
    actions = q.order_by(models.ManagementAction.due_date).all()
    vis = _Visibility(db, current_user)
    if vis.admin:
        return actions
    decision_ids = {a.decision_id for a in actions if a.decision_id}
    task_ids = {a.converted_task_id for a in actions if a.converted_task_id}
    decisions = {d.id: d for d in db.query(models.Decision).filter(models.Decision.id.in_(decision_ids)).all()} if decision_ids else {}
    tasks = {t.id: t for t in db.query(models.Task).filter(models.Task.id.in_(task_ids)).all()} if task_ids else {}
    vis.preload_meetings([a.meeting_id for a in actions] + [d.meeting_id for d in decisions.values()])
    return [a for a in actions if vis.action(a, decisions.get(a.decision_id), tasks.get(a.converted_task_id))]


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
def update_action(action_id: int, payload: schemas.ManagementActionBase, db: Session = Depends(get_db),
                  current_user: models.User = Depends(get_current_user)):
    a = db.get(models.ManagementAction, action_id)
    if not a:
        raise HTTPException(404, "Action not found")
    if not _Visibility(db, current_user).action_by_id(a):
        raise HTTPException(403, "You are not part of this action's project")
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
def convert_action(action_id: int, responsible_id: int | None = None, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    a = db.get(models.ManagementAction, action_id)
    if not a:
        raise HTTPException(404, "Action not found")
    if not _Visibility(db, current_user).action_by_id(a):
        raise HTTPException(403, "You are not part of this action's project")
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
        function_id=project.function_id if project else None,
        created_by=current_user.name[:64],
    )
    db.add(task)
    db.flush()
    if project:
        services.set_sbus(db, task, project.sbu_ids, current_user.name)
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