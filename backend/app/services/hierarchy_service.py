from typing import List, Optional, Set
from sqlalchemy.orm import Session
from app import models

def get_hierarchical_stakeholders(db: Session, task: models.Task) -> List[int]:
    stakeholder_ids: Set[int] = set()

    if task.accountable_id:
        stakeholder_ids.add(task.accountable_id)
    if task.reviewer_id:
        stakeholder_ids.add(task.reviewer_id)

    for uid in [task.responsible_id, task.accountable_id]:
        if uid:
            user = db.get(models.User, uid)
            if user and user.reports_to_id: # user_mapping.py অনুযায়ী reports_to_id
                stakeholder_ids.add(user.reports_to_id)

    return list(stakeholder_ids)

def create_in_page_notifications(db: Session, task: models.Task, title: str, body: str, kind: str = "action"):
    recipient_ids = get_hierarchical_stakeholders(db, task)
    for user_id in recipient_ids:
        notification = models.Notification(
            user_id=user_id, title=title, body=body, kind=kind, is_read=False
        )
        db.add(notification)
    db.commit()

def resolve_approver_id(db: Session, task: models.Task, requester_id: int) -> int:
    if task.reviewer_id and task.reviewer_id != requester_id:
        return task.reviewer_id
    if task.accountable_id and task.accountable_id != requester_id:
        return task.accountable_id
    
    requester = db.get(models.User, requester_id)
    if requester and requester.reports_to_id:
        return requester.reports_to_id
    return requester_id

def create_hierarchical_approval(db: Session, task: models.Task, approval_type: str, requested_by_id: int, reason: str = None):
    approver_id = resolve_approver_id(db, task, requested_by_id)

    approval = models.Approval(
        approval_type=approval_type, entity_type="task", entity_id=task.id,
        requested_by_id=requested_by_id, approver_id=approver_id, status="pending", reason=reason
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)

    # Approver-এর জন্য নোটিফিকেশন
    db.add(models.Notification(
        user_id=approver_id, title=f"Approval Needed: {task.title}",
        body=f"Request ({approval_type}) reason: {reason}", kind="approval", is_read=False
    ))
    db.commit()
    return approval