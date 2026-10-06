from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, permissions, schemas, services
from app.auth import (
    create_invited_user, get_admin_user, get_current_user, is_invited, send_set_password_link, send_signup_invite,
)
from app.database import get_db
from app.routers.privileged import ALL_ROLES
from app.visibility import HEAD_ROLES

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/companies", response_model=list[schemas.CompanyOut])
def list_companies(db: Session = Depends(get_db)):
    return db.query(models.Company).order_by(models.Company.name).all()


@router.post("/companies", response_model=schemas.CompanyOut, status_code=201)
def create_company(payload: schemas.CompanyBase, db: Session = Depends(get_db)):
    company = models.Company(**payload.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/functions", response_model=list[schemas.FunctionOut])
def list_functions(db: Session = Depends(get_db)):
    return db.query(models.Function).order_by(models.Function.name).all()


@router.post("/functions", response_model=schemas.FunctionOut, status_code=201)
def create_function(payload: schemas.FunctionBase, db: Session = Depends(get_db)):
    fn = models.Function(**payload.model_dump())
    db.add(fn)
    db.commit()
    db.refresh(fn)
    return fn


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.name).all()


@router.get("/users/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.patch("/users/me", response_model=schemas.UserOut)
def update_me(payload: schemas.UserSelfUpdate, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Edit My Profile: the signed-in user updates their own details (not email / Employee ID).
    They may pick their own role, except admin, the privileged roles (see everything,
    approve) and the head roles (see their whole SBU / function / department): those are
    given by an admin only. A head's SBU / function / department decides what they see
    (app/visibility.py), so a head can't change their own either.
    Declared before /users/{user_id} so "me" is not read as an id."""
    data = payload.model_dump(exclude_unset=True)
    new_role = (data.pop("role", None) or "").strip().lower()
    if new_role and new_role != user.role:
        if new_role not in ALL_ROLES:
            raise HTTPException(400, "Unknown role")
        if new_role in permissions.privileged_roles(db) or new_role in HEAD_ROLES:
            raise HTTPException(403, "Only an admin can give this role. Please ask your admin.")
        services.audit(db, user.name, "user", user.id, "role_changed", previous_value=user.role, new_value=new_role,
                       reason="Changed by the user in Edit My Profile")
        data["role"] = new_role
    new_sbus = services.patched_sbus(user, data, "company_ids")
    if user.role in HEAD_ROLES and user.role != "admin":
        sbus_changed = new_sbus is not None and {c for c in new_sbus if c} != set(user.company_ids)
        if sbus_changed or any(fk in data and data[fk] != getattr(user, fk) for fk in ("function_id", "department_id")):
            raise HTTPException(403, "As a head, your SBU, function and department decide which projects you see. Please ask an admin to change them.")
    if "name" in data:
        if not (data["name"] or "").strip():
            raise HTTPException(400, "Name is required")
        data["name"] = data["name"].strip()
    if data.get("reports_to_id") is not None:
        if data["reports_to_id"] == user.id:
            raise HTTPException(400, "You cannot report to yourself")
        if not db.get(models.User, data["reports_to_id"]):
            raise HTTPException(400, "Manager not found")
    for fk, model in (("function_id", models.Function), ("department_id", models.Department)):
        if data.get(fk) is not None and not db.get(model, data[fk]):
            raise HTTPException(400, f"{fk.replace('_id', '').title()} not found")
    for k, v in data.items():
        setattr(user, k, v)
    if new_sbus is not None:
        services.set_sbus(db, user, new_sbus, user.name)
    if data.get("reports_to_id") is not None:
        user.pending_manager_employee_id = None  # manager chosen - nothing left to wait for
    db.commit()
    db.refresh(user)
    return user


def _set_sbus(db: Session, admin: models.User, user: models.User, company_ids: list[int]):
    """Replace the SBUs a COO oversees. Only rows that really change are touched."""
    wanted = list(dict.fromkeys(company_ids))
    for cid in wanted:
        if not db.get(models.Company, cid):
            raise HTTPException(400, "SBU not found")
    have = {s.company_id: s for s in user.sbus}
    if set(wanted) == set(have):
        return
    for cid, row in have.items():
        if cid not in wanted:
            user.sbus.remove(row)
    for cid in wanted:
        if cid not in have:
            user.sbus.append(models.UserSbu(company_id=cid, created_by=admin.name))
    services.audit(db, admin.name, "user", user.id, "sbus_changed",
                   previous_value=",".join(map(str, sorted(have))), new_value=",".join(map(str, sorted(wanted))))


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.UserCreate,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    data = payload.model_dump()
    sbu_ids = data.pop("sbu_ids", None)
    company_ids = data.pop("company_ids", None) or [data.get("company_id")]
    data["company_id"] = None  # set with their other SBUs once the user has an id
    user = models.User(**data)
    db.add(user)
    db.flush()
    services.set_sbus(db, user, company_ids, admin.name)
    if sbu_ids:
        _set_sbus(db, admin, user, sbu_ids)
    # anyone who signed up naming this Employee ID as their manager now reports to them
    services.link_waiting_reports(db, user)
    db.commit()
    db.refresh(user)

    # New accounts start with no password: email a 24-hour "set password" link.
    if not user.hashed_password:
        send_set_password_link(db, user)

    return user


class InviteRequest(BaseModel):
    email: EmailStr


@router.post("/users/invite")
def invite_user(payload: InviteRequest, current_user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """"+ Add new user" with only an email (any signed-in user).

    Saves the person as a user right away so they can be assigned, and emails them a
    link to the Sign Up page; signing up with that email completes this same account
    (see auth.signup). Uses the existing users table only - no schema change.
    An email that already has an account is simply returned, nothing is sent."""
    email = str(payload.email).strip()
    if len(email) > 120:
        raise HTTPException(400, "This email address is too long.")
    user = db.query(models.User).filter(func.lower(models.User.email) == email.lower()).first()
    if user is not None and not is_invited(user):
        if not user.is_active:
            raise HTTPException(409, "This person's account is deactivated. Ask an admin to activate it.")
        return {"user": schemas.UserOut.model_validate(user), "email_sent": False, "already_registered": True}

    if user is None:
        try:
            user = create_invited_user(db, email)
        except IntegrityError:
            db.rollback()  # the same email invited twice at the same moment
            raise HTTPException(409, "This person was just added. Please pick them from the list.")
        services.audit(db, current_user.name, "user", user.id, "invited", new_value=email)
        db.commit()
        db.refresh(user)

    sent = send_signup_invite(user, current_user.name)
    return {"user": schemas.UserOut.model_validate(user), "email_sent": sent, "already_registered": False}


@router.patch("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, payload: schemas.UserUpdate, admin: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    data = payload.model_dump(exclude_unset=True)
    sbu_ids = data.pop("sbu_ids", None)
    company_ids = services.patched_sbus(user, data, "company_ids")
    if data.get("is_active") is not None and data["is_active"] != user.is_active:
        services.audit(db, admin.name, "user", user.id, "activated" if data["is_active"] else "deactivated", new_value=user.name)
    for k, v in data.items():
        if v is None and k in {"employee_id", "name", "email", "role", "is_active"}:
            continue  # required column: an explicit null must not wipe it
        setattr(user, k, v)
    if company_ids is not None:
        services.set_sbus(db, user, company_ids, admin.name)
    if sbu_ids is not None:
        _set_sbus(db, admin, user, sbu_ids)
    if "employee_id" in payload.model_fields_set:
        services.link_waiting_reports(db, user)  # the Employee ID someone was waiting for may be this one now
    if payload.reports_to_id is not None:
        user.pending_manager_employee_id = None  # the admin set the manager - nothing left to wait for
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def deactivate_user(user_id: int, admin: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.is_active:
        services.audit(db, admin.name, "user", user.id, "deactivated", new_value=user.name)
    user.is_active = False
    db.commit()


@router.delete("/users/{user_id}/permanent", status_code=204)
def permanent_delete_user(user_id: int, admin: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Admin-only: hard-delete a user after clearing their references."""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == "admin":
        raise HTTPException(400, "Cannot delete an admin account")

    # Null out FKs referencing this user
    for model, cols in [
        (models.Project, ["sponsor_id", "manager_id", "owner_id"]),
        (models.Task, ["responsible_id", "accountable_id", "reviewer_id", "informed_id"]),
        (models.DelayRca, ["recovery_owner_id"]),
        (models.BacklogItem, ["requested_by_id"]),
        (models.Approval, ["requested_by_id", "approver_id"]),
        (models.Decision, ["owner_id"]),
        (models.ManagementAction, ["responsible_id", "accountable_id"]),
        (models.Risk, ["owner_id"]),
        (models.Issue, ["owner_id"]),
        (models.Comment, ["commenter_id", "recipient_id"]),  # comments keep the names
        (models.ProjectMethodology, ["link_updated_by_id"]),
    ]:
        db.query(model).filter(getattr(model, cols[0]) == user_id).update({cols[0]: None}, synchronize_session=False)
        for col in cols[1:]:
            db.query(model).filter(getattr(model, col) == user_id).update({col: None}, synchronize_session=False)

    db.query(models.RaciEntry).filter(models.RaciEntry.user_id == user_id).delete(synchronize_session=False)
    db.query(models.ProjectAssociate).filter(models.ProjectAssociate.user_id == user_id).delete(synchronize_session=False)
    db.query(models.ProjectAssociate).filter(models.ProjectAssociate.added_by_id == user_id).update(
        {"added_by_id": None}, synchronize_session=False)
    db.query(models.Notification).filter(models.Notification.user_id == user_id).delete(synchronize_session=False)
    # their methodology approver slots become unassigned (pending) again
    db.query(models.MethodologyApproval).filter(models.MethodologyApproval.approver_id == user_id).update(
        {"approver_id": None, "approver_name": None, "decision": "pending", "note": None, "decided_at": None},
        synchronize_session=False)

    db.delete(user)
    db.commit()


#     "add new department" call gets a 404 — there was no route to hit. ---

@router.get("/departments", response_model=list[schemas.DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    return db.query(models.Department).order_by(models.Department.name).all()


@router.post("/departments", response_model=schemas.DepartmentOut, status_code=201)
def create_department(payload: schemas.DepartmentBase, db: Session = Depends(get_db)):
    dep = models.Department(**payload.model_dump())
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return dep


# Every column that points at a function / department, with the word used for it in messages.
# Tasks include the ones hidden while their delete request waits (is_deleted).
_ORG_REFS = {
    "function": (models.Function, [
        (models.Task, "function_id", "task"), (models.Project, "function_id", "project"),
        (models.User, "function_id", "user"), (models.Department, "function_id", "department"),
    ]),
    "department": (models.Department, [
        (models.Task, "department_id", "task"), (models.User, "department_id", "user"),
    ]),
}


def _delete_org(db: Session, user: models.User, kind: str, item_id: int, move_to: int | None):
    """Delete a function / department without losing anything.

    Plain delete: only when nothing uses it - otherwise 409 says what still does (before,
    the database refused and the user saw "500 Internal Server Error").
    With `move_to` (admin only - the Duplicates clean-up): every task, project, user and
    department on it is first moved onto that other entry, then it is deleted. All in one
    transaction: either everything moved and it is gone, or nothing changed."""
    model, refs = _ORG_REFS[kind]
    item = db.get(model, item_id)
    if not item:
        return  # already gone - deleting twice shouldn't error
    name = item.name
    used = {word: db.query(ref).filter(getattr(ref, col) == item_id).count() for ref, col, word in refs}
    used_text = ", ".join(f"{n} {word}{'' if n == 1 else 's'}" for word, n in used.items() if n)

    if move_to is None:
        if used_text:
            raise HTTPException(409, f'"{name}" is still used by {used_text}, so it can\'t be deleted. '
                                     f"Move them to another {kind} first (Admin Panel - Duplicates - Merge).")
        services.audit(db, user.name, kind, item_id, "deleted", previous_value=name)
    else:
        if user.role != permissions.ADMIN_ROLE:
            raise HTTPException(403, "Only an admin can merge duplicates.")
        keep = db.get(model, move_to)
        if move_to == item_id or not keep:
            raise HTTPException(400, f"Choose another {kind} to keep.")
        for ref, col, _ in refs:
            db.query(ref).filter(getattr(ref, col) == item_id).update({col: move_to}, synchronize_session=False)
        services.audit(db, user.name, kind, item_id, "merged", previous_value=f"{name} (id {item_id})",
                       new_value=f"{keep.name} (id {move_to})", reason=f"Moved {used_text or 'nothing'}")
    db.delete(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # something else still points at it: nothing was moved or deleted
        raise HTTPException(409, f'"{name}" is still in use and could not be deleted. Nothing was changed.')


@router.delete("/departments/{department_id}", status_code=204)
def delete_department(department_id: int, move_to: int | None = None, db: Session = Depends(get_db),
                      current_user: models.User = Depends(get_current_user)):
    _delete_org(db, current_user, "department", department_id, move_to)


@router.delete("/functions/{function_id}", status_code=204)
def delete_function(function_id: int, move_to: int | None = None, db: Session = Depends(get_db),
                    current_user: models.User = Depends(get_current_user)):
    _delete_org(db, current_user, "function", function_id, move_to)
