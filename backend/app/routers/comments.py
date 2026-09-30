"""Comments on projects and tasks.

Any logged-in employee can comment on any project or task. Each comment is
emailed (after the response is sent) to:
  - a project comment -> the project's Project Manager
  - a task comment    -> the task's Responsible person
never to the commenter themself.

The dashboard "Comments" box (GET /comments/inbox) lists the comments on the
projects you currently manage and the tasks you are currently Responsible for,
so a newly assigned manager / responsible person also sees the earlier ones.
"""
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app import email_service, models, schemas, services
from app.auth import get_current_user
from app.config import settings
from app.database import SessionLocal, get_db

router = APIRouter(prefix="/comments", tags=["comments"])
logger = logging.getLogger("app.comments")

MAX_COMMENT_LENGTH = 2000
INBOX_LIMIT = 200


def _comment_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        raise HTTPException(400, "Write a comment first")
    if len(text) > MAX_COMMENT_LENGTH:
        raise HTTPException(400, f"Comment is too long ({MAX_COMMENT_LENGTH} characters at most)")
    return text


def _send_comment_email(comment_id: int, mail: dict) -> None:
    """Runs AFTER the response is sent (background task). An email problem is
    logged and never affects the saved comment."""
    try:
        sent = email_service.send_comment_email(**mail)
    except Exception:
        logger.exception("Comment %s: email to %s failed", comment_id, mail.get("to_email"))
        return
    if not sent:
        return
    db = SessionLocal()
    try:
        row = db.get(models.Comment, comment_id)
        if row:
            row.email_sent = True
            db.commit()
    except Exception:
        logger.exception("Comment %s: could not record that the email was sent", comment_id)
    finally:
        db.close()


def _save(db: Session, background_tasks: BackgroundTasks, author: models.User, text: str,
          entity_type: str, project: models.Project | None, task: models.Task | None,
          recipient: models.User | None, recipient_role: str, link: str) -> models.Comment:
    row = models.Comment(
        entity_type=entity_type,
        comment=text,
        commenter_id=author.id,
        commenter_name=author.name,
        commenter_employee_id=author.employee_id,
        project_id=project.id if project else None,
        project_code=project.code if project else None,
        project_name=project.name if project else None,
        task_id=task.id if task else None,
        task_code=task.code if task else None,
        task_name=task.title if task else None,
        recipient_id=recipient.id if recipient else None,
        recipient_name=recipient.name if recipient else None,
        created_by=author.name,
    )
    db.add(row)
    db.flush()

    subject_label = f"{task.code} - {task.title}" if task else f"{project.code} - {project.name}"
    project_label = f"{project.code} - {project.name}" if project else ""
    notify_recipient = recipient is not None and recipient.id != author.id and recipient.is_active
    if notify_recipient:
        services.notify(db, recipient.id, f"New comment on {entity_type} {subject_label}"[:240],
                        body=f"{author.name}: {text}"[:1000], kind="comment")
    services.audit(db, author.name, entity_type, task.id if task else project.id, "commented", new_value=text[:500])
    db.commit()
    db.refresh(row)

    if notify_recipient and recipient.email:
        background_tasks.add_task(_send_comment_email, row.id, {
            "to_email": recipient.email,
            "recipient_name": recipient.name,
            "recipient_role": recipient_role,
            "entity_type": entity_type,
            "subject_label": subject_label,
            "project_label": project_label,
            "commenter_name": author.name,
            "commenter_employee_id": author.employee_id,
            "comment": text,
            "sent_at": row.created_at or datetime.utcnow(),
            "link": f"{settings.frontend_url.rstrip('/')}{link}",
        })
    return row


# ---------------------------------------------------------------- project comments
@router.get("/project/{project_id}", response_model=list[schemas.CommentOut])
def list_project_comments(project_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Project, project_id):
        raise HTTPException(404, "Project not found")
    return db.query(models.Comment).filter(
        models.Comment.entity_type == "project", models.Comment.project_id == project_id,
    ).order_by(models.Comment.created_at.desc(), models.Comment.id.desc()).all()


@router.post("/project/{project_id}", response_model=schemas.CommentOut, status_code=201)
def add_project_comment(project_id: int, payload: schemas.CommentIn, background_tasks: BackgroundTasks,
                        db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    text = _comment_text(payload.comment)
    manager = db.get(models.User, project.manager_id) if project.manager_id else None
    return _save(db, background_tasks, current_user, text, "project", project, None,
                 manager, "Project Manager", f"/projects/{project.id}")


# ---------------------------------------------------------------- task comments
@router.get("/task/{task_id}", response_model=list[schemas.CommentOut])
def list_task_comments(task_id: int, db: Session = Depends(get_db)):
    task = db.get(models.Task, task_id)
    if not task or task.is_deleted:
        raise HTTPException(404, "Task not found")
    return db.query(models.Comment).filter(
        models.Comment.entity_type == "task", models.Comment.task_id == task_id,
    ).order_by(models.Comment.created_at.desc(), models.Comment.id.desc()).all()


@router.post("/task/{task_id}", response_model=schemas.CommentOut, status_code=201)
def add_task_comment(task_id: int, payload: schemas.CommentIn, background_tasks: BackgroundTasks,
                     db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    task = db.get(models.Task, task_id)
    if not task or task.is_deleted:
        raise HTTPException(404, "Task not found")
    text = _comment_text(payload.comment)
    project = db.get(models.Project, task.project_id) if task.project_id else None
    responsible = db.get(models.User, task.responsible_id) if task.responsible_id else None
    return _save(db, background_tasks, current_user, text, "task", project, task,
                 responsible, "Responsible person", f"/tasks/{task.id}")


# ---------------------------------------------------------------- dashboard inbox
@router.get("/inbox")
def comment_inbox(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Comments others left on projects you manage and tasks you are Responsible for.
    `eligible` says whether you manage any project or are Responsible for any task."""
    uid = current_user.id
    project_ids = [pid for (pid,) in db.query(models.Project.id).filter(models.Project.manager_id == uid).all()]
    task_ids = [tid for (tid,) in db.query(models.Task.id).filter(
        models.Task.responsible_id == uid, models.Task.is_deleted.is_(False)).all()]
    if not project_ids and not task_ids:
        return {"eligible": False, "comments": []}

    about_me = []
    if project_ids:
        about_me.append(and_(models.Comment.entity_type == "project", models.Comment.project_id.in_(project_ids)))
    if task_ids:
        about_me.append(and_(models.Comment.entity_type == "task", models.Comment.task_id.in_(task_ids)))
    rows = db.query(models.Comment).filter(
        or_(*about_me),
        or_(models.Comment.commenter_id.is_(None), models.Comment.commenter_id != uid),
    ).order_by(models.Comment.created_at.desc(), models.Comment.id.desc()).limit(INBOX_LIMIT).all()
    return {"eligible": True,
            "comments": [schemas.CommentOut.model_validate(r).model_dump() for r in rows]}
