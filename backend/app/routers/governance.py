from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.database import get_db

router = APIRouter(tags=["governance"])


# ---------------------------------------------------------------- Meetings
@router.get("/meetings", response_model=list[schemas.MeetingOut])
def list_meetings(db: Session = Depends(get_db)):
    return db.query(models.Meeting).order_by(models.Meeting.meeting_date.desc()).all()


@router.post("/meetings", response_model=schemas.MeetingOut, status_code=201)
def create_meeting(payload: schemas.MeetingBase, db: Session = Depends(get_db)):
    m = models.Meeting(**payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


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
    code = payload.code or services.next_code("DEC", db, models.Decision)
    d = models.Decision(**{**payload.model_dump(), "code": code})
    db.add(d)
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
    code = payload.code or services.next_code("ACT", db, models.ManagementAction)
    a = models.ManagementAction(**{**payload.model_dump(), "code": code})
    db.add(a)
    db.commit()
    db.refresh(a)
    services.notify(db, a.responsible_id, f"Management action assigned: {a.code}",
                    body=a.action, kind="action")
    db.commit()
    return a


@router.patch("/actions/{action_id}", response_model=schemas.ManagementActionOut)
def update_action(action_id: int, payload: schemas.ManagementActionBase, db: Session = Depends(get_db)):
    a = db.get(models.ManagementAction, action_id)
    if not a:
        raise HTTPException(404, "Action not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
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
    code = services.next_code("TSK", db, models.Task)
    task = models.Task(
        code=code, title=a.action, description=a.action,
        category="management_action", task_type="action",
        responsible_id=a.responsible_id or responsible_id, accountable_id=a.accountable_id,
        baseline_due_date=a.due_date, approved_due_date=a.due_date,
        status="backlog", progress_pct=0.0,
    )
    db.add(task)
    db.flush()
    a.converted_task_id = task.id
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
