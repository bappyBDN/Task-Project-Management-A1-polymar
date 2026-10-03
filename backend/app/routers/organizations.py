import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.auth import (
    INVITE_PREFIX, get_admin_user, get_current_user, is_invited, send_set_password_link, send_signup_invite,
)
from app.database import get_db

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
    """Edit My Profile: the signed-in user updates their own details (not role / email / Employee ID).
    Declared before /users/{user_id} so "me" is not read as an id."""
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        if not (data["name"] or "").strip():
            raise HTTPException(400, "Name is required")
        data["name"] = data["name"].strip()
    if data.get("reports_to_id") is not None:
        if data["reports_to_id"] == user.id:
            raise HTTPException(400, "You cannot report to yourself")
        if not db.get(models.User, data["reports_to_id"]):
            raise HTTPException(400, "Manager not found")
    for fk, model in (("company_id", models.Company), ("function_id", models.Function), ("department_id", models.Department)):
        if data.get(fk) is not None and not db.get(model, data[fk]):
            raise HTTPException(400, f"{fk.replace('_id', '').title()} not found")
    for k, v in data.items():
        setattr(user, k, v)
    if data.get("reports_to_id") is not None:
        user.pending_manager_employee_id = None  # manager chosen - nothing left to wait for
    db.commit()
    db.refresh(user)
    return user


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.UserBase,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    user = models.User(**payload.model_dump())
    db.add(user)
    db.flush()
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
        user = models.User(
            employee_id=f"{INVITE_PREFIX}{secrets.token_hex(5).upper()}",  # placeholder until they sign up
            name=email, email=email, role="employee",
        )
        db.add(user)
        try:
            db.flush()
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
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is None and k in {"employee_id", "name", "email", "role"}:
            continue  # required column: an explicit null must not wipe it
        setattr(user, k, v)
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
        (models.Task, ["responsible_id", "accountable_id", "reviewer_id"]),
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


@router.delete("/departments/{department_id}", status_code=204)
def delete_department(department_id: int, db: Session = Depends(get_db)):
    dep = db.get(models.Department, department_id)
    if not dep:
        return  # already gone — deleting twice shouldn't error
    db.query(models.User).filter(models.User.department_id == department_id).update(
        {"department_id": None}, synchronize_session=False)  # don't orphan FK references
    db.delete(dep)
    db.commit()
