"""Comments on projects and tasks.

Any logged-in employee can comment on any project or task. Each comment is
emailed (after the response is sent) to:
  - a project comment -> the project's Project Manager
  - a task comment    -> the task's Responsible person
never to the commenter themself.

Anyone can reply to a comment (POST /comments/{id}/reply). The comments table
has no parent column, so a reply is an ordinary row whose entity_type is
"reply:<root comment id>" (fits the existing VARCHAR(16)); it copies the root's
project / task. Replies are flat under the root comment (a reply to a reply goes
under the same root). A reply is emailed to the root comment's author and to the
current Project Manager / Responsible person, never to the replier.

The dashboard "Comments" box (GET /comments/inbox) lists the comment threads on
the projects you currently manage and the tasks you are currently Responsible
for (so a newly assigned manager / responsible person also sees the earlier
ones), plus the threads you started or replied to.
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
REPLY_PREFIX = "reply:"


def _reply_type(root_id: int) -> str:
    return f"{REPLY_PREFIX}{root_id}"


def _root_id_of(entity_type: str) -> int | None:
    if entity_type.startswith(REPLY_PREFIX):
        try:
            return int(entity_type[len(REPLY_PREFIX):])
        except ValueError:
            return None
    return None


def _out(row: models.Comment, replies: list[models.Comment] | None = None) -> dict:
    """A root comment with its replies; a reply reports its root's kind and parent_id."""
    data = schemas.CommentOut.model_validate(row).model_dump(exclude={"replies"})
    root_id = _root_id_of(row.entity_type)
    if root_id is not None:
        data["parent_id"] = root_id
        data["entity_type"] = "task" if row.task_code else "project"
    data["replies"] = [_out(r) for r in (replies or [])]
    return data


def _with_replies(db: Session, roots: list[models.Comment]) -> list[dict]:
    if not roots:
        return []
    replies = db.query(models.Comment).filter(
        models.Comment.entity_type.in_([_reply_type(r.id) for r in roots]),
    ).order_by(models.Comment.created_at.asc(), models.Comment.id.asc()).all()
    by_root: dict[int, list[models.Comment]] = {}
    for r in replies:
        by_root.setdefault(_root_id_of(r.entity_type), []).append(r)
    return [_out(r, by_root.get(r.id)) for r in roots]


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
    return _with_replies(db, db.query(models.Comment).filter(
        models.Comment.entity_type == "project", models.Comment.project_id == project_id,
    ).order_by(models.Comment.created_at.desc(), models.Comment.id.desc()).all())


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
    return _with_replies(db, db.query(models.Comment).filter(
        models.Comment.entity_type == "task", models.Comment.task_id == task_id,
    ).order_by(models.Comment.created_at.desc(), models.Comment.id.desc()).all())


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


# ---------------------------------------------------------------- replies
@router.post("/{comment_id}/reply", response_model=schemas.CommentOut, status_code=201)
def reply_to_comment(comment_id: int, payload: schemas.CommentIn, background_tasks: BackgroundTasks,
                     db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    target = db.get(models.Comment, comment_id)
    if not target:
        raise HTTPException(404, "Comment not found")
    root_id = _root_id_of(target.entity_type)
    root = db.get(models.Comment, root_id) if root_id is not None else target
    if not root or root.entity_type not in ("project", "task"):
        raise HTTPException(404, "Comment not found")
    text = _comment_text(payload.comment)

    kind = root.entity_type
    project = db.get(models.Project, root.project_id) if root.project_id else None
    task = db.get(models.Task, root.task_id) if root.task_id else None
    if task and task.is_deleted:
        task = None
    # the current owner; the comment's original recipient if the project / task is gone
    subject = task if kind == "task" else project
    if subject is None:
        owner_id = root.recipient_id
    else:
        owner_id = task.responsible_id if kind == "task" else project.manager_id
    owner_role = "Responsible person" if kind == "task" else "Project Manager"

    # who hears about it: the root comment's author, then the owner - never the replier
    targets: list[tuple[models.User, str]] = []
    for uid, role in ((root.commenter_id, "comment author"), (owner_id, owner_role)):
        if uid is None or uid == current_user.id or any(u.id == uid for u, _ in targets):
            continue
        u = db.get(models.User, uid)
        if u and u.is_active:
            targets.append((u, role))
    first = targets[0][0] if targets else None

    row = models.Comment(
        entity_type=_reply_type(root.id),
        comment=text,
        commenter_id=current_user.id,
        commenter_name=current_user.name,
        commenter_employee_id=current_user.employee_id,
        project_id=root.project_id, project_code=root.project_code, project_name=root.project_name,
        task_id=root.task_id, task_code=root.task_code, task_name=root.task_name,
        recipient_id=first.id if first else None,
        recipient_name=first.name if first else None,
        created_by=current_user.name,
    )
    db.add(row)
    db.flush()

    if kind == "task":
        subject_label = f"{root.task_code} - {root.task_name}"
    else:
        subject_label = f"{root.project_code} - {root.project_name}"
    project_label = f"{root.project_code} - {root.project_name}" if root.project_code else ""
    for u, _ in targets:
        services.notify(db, u.id, f"New reply on {kind} {subject_label}"[:240],
                        body=f"{current_user.name}: {text}"[:1000], kind="comment")
    entity_id = root.task_id if kind == "task" else root.project_id
    if entity_id:
        services.audit(db, current_user.name, kind, entity_id, "replied to a comment", new_value=text[:500])
    db.commit()
    db.refresh(row)

    if kind == "task" and root.task_id:
        link = f"/tasks/{root.task_id}"
    elif root.project_id:
        link = f"/projects/{root.project_id}"
    else:
        link = "/"
    for u, role in targets:
        if not u.email:
            continue
        background_tasks.add_task(_send_comment_email, row.id, {
            "to_email": u.email,
            "recipient_name": u.name,
            "recipient_role": role,
            "entity_type": kind,
            "subject_label": subject_label,
            "project_label": project_label,
            "commenter_name": current_user.name,
            "commenter_employee_id": current_user.employee_id,
            "comment": text,
            "sent_at": row.created_at or datetime.utcnow(),
            "link": f"{settings.frontend_url.rstrip('/')}{link}",
            "reply_to": root.comment,
        })
    return _out(row)


# ---------------------------------------------------------------- dashboard inbox
@router.get("/inbox")
def comment_inbox(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Comment threads on projects you manage and tasks you are Responsible for, plus
    the threads you started or replied to - newest activity first. Each thread is a
    root comment with its replies. `eligible` says whether you manage any project, are
    Responsible for any task, or have any thread at all."""
    uid = current_user.id
    project_ids = [pid for (pid,) in db.query(models.Project.id).filter(models.Project.manager_id == uid).all()]
    task_ids = [tid for (tid,) in db.query(models.Task.id).filter(
        models.Task.responsible_id == uid, models.Task.is_deleted.is_(False)).all()]
    replied_roots = set()
    for (et,) in db.query(models.Comment.entity_type).filter(
            models.Comment.entity_type.like(f"{REPLY_PREFIX}%"), models.Comment.commenter_id == uid).all():
        rid = _root_id_of(et)
        if rid is not None:
            replied_roots.add(rid)

    involved = [and_(models.Comment.entity_type.in_(("project", "task")), models.Comment.commenter_id == uid)]
    if project_ids:
        involved.append(and_(models.Comment.entity_type == "project", models.Comment.project_id.in_(project_ids)))
    if task_ids:
        involved.append(and_(models.Comment.entity_type == "task", models.Comment.task_id.in_(task_ids)))
    if replied_roots:
        involved.append(and_(models.Comment.entity_type.in_(("project", "task")),
                             models.Comment.id.in_(replied_roots)))
    roots = db.query(models.Comment).filter(or_(*involved)).order_by(
        models.Comment.created_at.desc(), models.Comment.id.desc()).limit(INBOX_LIMIT).all()

    threads = _with_replies(db, roots)

    def last_activity(t: dict) -> datetime:
        return max([t["created_at"] or datetime.min] + [r["created_at"] or datetime.min for r in t["replies"]])

    threads.sort(key=last_activity, reverse=True)
    return {"eligible": bool(project_ids or task_ids or threads), "comments": threads}
