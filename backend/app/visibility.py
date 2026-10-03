"""Who sees which projects and tasks.

One rule, used by every list / detail route (projects, tasks, kanban, RACI, backlog,
delays, the dashboard's portfolio widgets). Read-only, existing columns only.

  admin / privileged role  -> everything
  on a project             -> its Manager / Sponsor / Owner, an associated person, or
                              Responsible / Accountable / Reviewer on any of its tasks:
                              the project and ALL its tasks
  on a task                -> its Responsible / Accountable / Reviewer: that task
  SBU head (business_head)          -> every project and task of their SBU
  Function head (functional_head)   -> every project and task of their SBU + Function
  Department head (department_head) -> every task of their SBU + Department, and the
                                       projects those tasks belong to (projects have no
                                       department of their own)
  approver / requester of an approval on a task -> that task (so it can be decided)

A task's SBU / Function is its own, or its project's when the task has none.
A head's SBU / Function / Department is the one on their own user record; copies of
the same SBU (other spellings) and the same Function / Department name count as one.
"""
import re

from fastapi import Depends
from sqlalchemy.orm import Session

from app import models, permissions
from app.auth import get_current_user
from app.database import get_db

# role -> what they head. They get this from an admin (not from Edit My Profile).
HEAD_ROLES = {"business_head": "sbu", "functional_head": "function", "department_head": "department"}

# Same list / spellings as frontend/src/components/SbuSelect.tsx.
DEFAULT_SBUS = [
    "Anwar Group Ltd", "Anwar Cement Ltd", "Anwar Ispat Ltd", "A-One Polymer Ltd",
    "Anwar Galvanizing Ltd", "Anwar Textile Ltd", "Anwar Landmark Ltd",
    "Anwar Jute Spinning Mills Ltd", "Anwar Cement Sheet Ltd", "Anwar Organic Ltd", "Anwar Denim Ltd",
]
SBU_ALIASES = {"A-One Polymer Ltd": ["A1 Polymar", "A1 Polymer", "A-One Polymar"]}


def norm(name: str | None) -> str:
    """'Anwar Cement', 'Anwar Cement Ltd.' and 'anwar cement limited' are the same."""
    s = re.sub(r"\b(ltd|limited)\b", "", (name or "").lower())
    return re.sub(r"[^a-z0-9]", "", s)


_SBU_KEY = {norm(n): norm(official) for official in DEFAULT_SBUS
            for n in [official, *SBU_ALIASES.get(official, [])]}


def sbu_key(name: str | None) -> str:
    return _SBU_KEY.get(norm(name), norm(name))


class Scope:
    """What one user may see. Build once per request (see `get_scope`)."""

    def __init__(self, db: Session, user: models.User):
        self.user_id = user.id
        self.all = permissions.is_privileged(db, user)
        self.project_ids: set[int] = set()        # projects shown to this user
        self._full_projects: set[int] = set()     # ...of which every task is shown
        self._approval_tasks: set[int] = set()
        self._level = None
        self._companies: set[int] = set()
        self._functions: set[int] = set()
        self._departments: set[int] = set()
        self._project_company: dict[int, int | None] = {}
        self._project_function: dict[int, int | None] = {}
        if self.all:
            return
        uid = user.id

        # ---- what this person heads (if anything)
        level = HEAD_ROLES.get(user.role)
        if level and user.company_id:
            mine = db.get(models.Company, user.company_id)
            key = sbu_key(mine.name) if mine else None
            self._companies = {c.id for c in db.query(models.Company).all() if key and sbu_key(c.name) == key}
        if level == "function" and user.function_id:
            mine = db.get(models.Function, user.function_id)
            key = norm(mine.name) if mine else None
            self._functions = {f.id for f in db.query(models.Function).all() if key and norm(f.name) == key}
        if level == "department" and user.department_id:
            mine = db.get(models.Department, user.department_id)
            key = norm(mine.name) if mine else None
            self._departments = {d.id for d in db.query(models.Department).all() if key and norm(d.name) == key}
        # a head with no SBU (or no function / department) on their record heads nothing
        if level and self._companies and (level == "sbu" or (level == "function" and self._functions)
                                          or (level == "department" and self._departments)):
            self._level = level

        P, T = models.Project, models.Task
        projects = db.query(P.id, P.company_id, P.function_id, P.manager_id, P.sponsor_id, P.owner_id).all()
        tasks = db.query(T.id, T.project_id, T.company_id, T.function_id, T.department_id,
                         T.responsible_id, T.accountable_id, T.reviewer_id).filter(T.is_deleted.is_(False)).all()
        self._project_company = {p.id: p.company_id for p in projects}
        self._project_function = {p.id: p.function_id for p in projects}

        # ---- projects this person works on: all of each one's tasks are shown
        full = {p.id for p in projects if uid in (p.manager_id, p.sponsor_id, p.owner_id)}
        full |= {r[0] for r in db.query(models.ProjectAssociate.project_id)
                 .filter(models.ProjectAssociate.user_id == uid).all()}
        full |= {t.project_id for t in tasks if t.project_id
                 and uid in (t.responsible_id, t.accountable_id, t.reviewer_id)}
        # ---- projects of the SBU / Function this person heads
        if self._level == "sbu":
            full |= {p.id for p in projects if p.company_id in self._companies}
        elif self._level == "function":
            full |= {p.id for p in projects if p.company_id in self._companies and p.function_id in self._functions}
        self._full_projects = full
        # ---- plus the projects of single tasks that fall under what they head
        self.project_ids = full | {t.project_id for t in tasks if t.project_id and self._heads_task(t)}

        A = models.Approval
        self._approval_tasks = {r[0] for r in db.query(A.entity_id).filter(
            A.entity_type == "task", (A.approver_id == uid) | (A.requested_by_id == uid)).all()}

    def _heads_task(self, t) -> bool:
        if not self._level:
            return False
        company = t.company_id or self._project_company.get(t.project_id)
        if company not in self._companies:
            return False
        if self._level == "sbu":
            return True
        if self._level == "function":
            return (t.function_id or self._project_function.get(t.project_id)) in self._functions
        return t.department_id in self._departments

    def sees_project(self, project) -> bool:
        return self.all or project.id in self.project_ids

    def sees_project_id(self, project_id: int | None) -> bool:
        return self.all or project_id in self.project_ids

    def sees_task(self, t) -> bool:
        return (self.all
                or self.user_id in (t.responsible_id, t.accountable_id, t.reviewer_id)
                or (t.project_id is not None and t.project_id in self._full_projects)
                or self._heads_task(t)
                or t.id in self._approval_tasks)


def get_scope(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)) -> Scope:
    return Scope(db, user)
