"""Optional Gantt scheduling of a project (projects.gantt_enabled).

Off (the default): nothing here runs and the project works exactly as before.
On: tasks may depend on other tasks of the same project (task_dependencies,
finish-to-start: a task not yet started starts the day after everything it depends on
has finished) and the forecast dates follow the schedule:

  task     forecast_due_date = the date it can really finish, when that differs from its
           due date - pushed by a late predecessor, or already past due and still open
  project  forecast_due_date = the latest finish among its tasks

Planned / baseline / approved dates are never changed. A forecast written here is
remembered in tasks.auto_forecast_date, so a forecast a person typed in is told apart
from a calculated one: theirs is respected as that task's own estimate, kept in
tasks.own_forecast_date while a calculated one replaces it, and put back once the delay
behind the calculated one is gone. Turning the option off deletes nothing.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models

DONE_STATUSES = ("completed", "closed")
ONE_DAY = timedelta(days=1)


# ---------------------------------------------------------------- dependencies
def dependency_ids(db: Session, task_id: int) -> list[int]:
    """The tasks this task depends on."""
    return [r[0] for r in db.query(models.TaskDependency.depends_on_task_id).filter(
        models.TaskDependency.task_id == task_id).order_by(models.TaskDependency.id).all()]


def _predecessors(db: Session, task_ids: set) -> dict[int, list[int]]:
    """task id -> the ids it depends on, only among `task_ids`."""
    preds: dict[int, list[int]] = {}
    if not task_ids:
        return preds
    rows = db.query(models.TaskDependency.task_id, models.TaskDependency.depends_on_task_id).filter(
        models.TaskDependency.task_id.in_(task_ids)).all()
    for task_id, depends_on in rows:
        if depends_on in task_ids and depends_on != task_id:
            preds.setdefault(task_id, []).append(depends_on)
    return preds


def clear_dependencies(db: Session, task_id: int):
    """Drop every link of this task (it moved to another project)."""
    db.query(models.TaskDependency).filter(
        (models.TaskDependency.task_id == task_id) | (models.TaskDependency.depends_on_task_id == task_id)
    ).delete(synchronize_session=False)


def set_dependencies(db: Session, task: models.Task, depends_on_ids: list[int]):
    """Replace what `task` depends on. Only tasks of the same project, never a loop."""
    wanted = list(dict.fromkeys(int(i) for i in depends_on_ids))
    if task.id in wanted:
        raise HTTPException(400, "A task can't depend on itself.")
    if wanted and not task.project_id:
        raise HTTPException(400, "Only a task that belongs to a project can depend on other tasks.")
    if wanted:
        others = db.query(models.Task).filter(models.Task.id.in_(wanted), models.Task.is_deleted.is_(False)).all()
        if len(others) != len(wanted):
            raise HTTPException(400, "One of the selected dependent tasks does not exist any more.")
        if any(o.project_id != task.project_id for o in others):
            raise HTTPException(400, "A task can only depend on tasks of the same project.")
        # a loop: one of the chosen tasks already depends (directly or through others) on this task
        project_ids = {r[0] for r in db.query(models.Task.id).filter(models.Task.project_id == task.project_id).all()}
        preds = _predecessors(db, project_ids)
        codes = {o.id: o.code for o in others}
        for start in wanted:
            stack, seen = [start], set()
            while stack:
                cur = stack.pop()
                if cur == task.id:
                    raise HTTPException(400, f"{codes[start]} already depends on {task.code} - that would make a loop.")
                if cur in seen:
                    continue
                seen.add(cur)
                stack.extend(preds.get(cur, []))
    db.query(models.TaskDependency).filter(models.TaskDependency.task_id == task.id).delete(synchronize_session=False)
    for other_id in wanted:
        db.add(models.TaskDependency(task_id=task.id, depends_on_task_id=other_id))
    db.flush()


# ---------------------------------------------------------------- schedule
def _order(tasks: list, preds: dict[int, list[int]]) -> list:
    """Predecessors before the tasks that depend on them."""
    by_id = {t.id: t for t in tasks}
    waiting = {t.id: len(preds.get(t.id, [])) for t in tasks}
    followers: dict[int, list[int]] = {}
    for task_id, ps in preds.items():
        for p in ps:
            followers.setdefault(p, []).append(task_id)
    ready = [t.id for t in tasks if waiting[t.id] == 0]
    out = []
    while ready:
        cur = ready.pop(0)
        out.append(by_id[cur])
        for f in followers.get(cur, []):
            waiting[f] -= 1
            if waiting[f] == 0:
                ready.append(f)
    done = {t.id for t in out}
    return out + [t for t in tasks if t.id not in done]  # a loop can't be saved; never drop a task anyway


def compute(tasks: list, preds: dict[int, list[int]], today: Optional[date] = None) -> dict[int, dict]:
    """The schedule of one project's (non-deleted) tasks. Reads only - see reschedule()."""
    today = today or date.today()
    rows: dict[int, dict] = {}
    for t in _order(tasks, preds):
        plan_finish = t.approved_due_date or t.baseline_due_date
        plan_start = t.planned_start_date or plan_finish
        plan_finish = plan_finish or plan_start
        if plan_start and plan_finish and plan_start > plan_finish:
            plan_start = plan_finish
        duration = (plan_finish - plan_start) if plan_start and plan_finish else timedelta(0)
        row = {"plan_start": plan_start, "plan_finish": plan_finish, "start": plan_start, "finish": plan_finish,
               "cause": None, "driver_id": None, "slip_days": 0, "critical": False,
               "depends_on": preds.get(t.id, []), "active": t.status != "cancelled",
               "open": t.status not in DONE_STATUSES and t.status != "cancelled"}
        rows[t.id] = row
        if not row["active"]:
            continue
        if t.status in DONE_STATUSES:
            finish = t.actual_due_date or plan_finish
            row["finish"] = finish
            if plan_start and finish and plan_start > finish:
                row["start"] = finish
            if plan_finish and finish and finish > plan_finish:
                row["cause"] = "late_finish"
        else:
            typed = _own_forecast(t)
            own = plan_finish
            if typed:  # a person's own forecast for this task
                own = typed
                if plan_finish is None or own > plan_finish:
                    row["cause"] = "forecast"
            if own is not None and own < today:  # past due and still open: it can't finish before today
                own, row["cause"] = today, "overdue"
            finish = own
            ahead = [(rows[p]["finish"], p) for p in row["depends_on"] if rows[p]["active"] and rows[p]["finish"]]
            # work that has already begun is not moved: only a task still to start waits for the others
            started = t.status in ("in_progress", "in_review") or (t.progress_pct or 0) > 0
            if ahead and not started:
                last_finish, last_id = max(ahead)
                earliest = last_finish + ONE_DAY
                if plan_start is None or earliest > plan_start:
                    row["start"] = earliest
                    if finish is None or earliest + duration > finish:
                        finish, row["cause"], row["driver_id"] = earliest + duration, "dependency", last_id
            row["finish"] = finish
        if row["finish"] and plan_finish and row["finish"] > plan_finish:
            row["slip_days"] = (row["finish"] - plan_finish).days
        else:
            row["cause"] = row["driver_id"] = None

    # critical path: the chain of tasks, with no spare day between them, that ends on the last finish
    finishes = [r["finish"] for r in rows.values() if r["active"] and r["finish"]]
    if finishes:
        end = max(finishes)
        stack = [i for i, r in rows.items() if r["active"] and r["finish"] == end]
        while stack:
            cur = stack.pop()
            if rows[cur]["critical"]:
                continue
            rows[cur]["critical"] = True
            for p in rows[cur]["depends_on"]:
                r = rows[p]
                if r["active"] and r["finish"] and rows[cur]["start"] and r["finish"] + ONE_DAY == rows[cur]["start"]:
                    stack.append(p)
    return rows


def _calculated(t) -> bool:
    """Is the task's stored forecast one the schedule wrote (not one a person typed)?"""
    return t.auto_forecast_date is not None and t.forecast_due_date == t.auto_forecast_date


def _own_forecast(t) -> Optional[date]:
    """The forecast a person gave this task, also while a calculated one stands in its place."""
    return t.own_forecast_date if _calculated(t) else t.forecast_due_date


def _project_tasks(db: Session, project_id: int) -> list:
    return db.query(models.Task).filter(
        models.Task.project_id == project_id, models.Task.is_deleted.is_(False)).all()


def reschedule(db: Session, project: models.Project, today: Optional[date] = None) -> dict[int, dict]:
    """Recalculate the schedule of a Gantt project and store the forecast dates. No commit."""
    db.flush()
    tasks = _project_tasks(db, project.id)
    rows = compute(tasks, _predecessors(db, {t.id for t in tasks}), today)
    for t in tasks:
        row = rows[t.id]
        if not row["open"]:
            continue
        if row["cause"] in ("overdue", "dependency"):
            if not _calculated(t):
                t.own_forecast_date = t.forecast_due_date  # what the person had typed, if anything
            if t.forecast_due_date != row["finish"] or t.auto_forecast_date != row["finish"]:
                t.forecast_due_date = t.auto_forecast_date = row["finish"]
        elif _calculated(t):  # the delay behind the calculated forecast is gone: their own forecast is back
            t.forecast_due_date, t.auto_forecast_date, t.own_forecast_date = t.own_forecast_date, None, None
        elif t.auto_forecast_date is not None or t.own_forecast_date is not None:  # someone typed a forecast since
            t.auto_forecast_date = t.own_forecast_date = None
    finishes = [r["finish"] for r in rows.values() if r["active"] and r["finish"]]
    if finishes and project.forecast_due_date != max(finishes):
        project.forecast_due_date = max(finishes)
    return rows


def reschedule_project(db: Session, project_id: Optional[int]):
    """Called after anything changed on a task: does nothing unless the project uses the Gantt option."""
    project = db.get(models.Project, project_id) if project_id else None
    if project and project.gantt_enabled:
        reschedule(db, project)


# ---------------------------------------------------------------- what the page shows
def chart(db: Session, project: models.Project, sees_task=lambda t: True) -> dict:
    """Schedule + what is extending it, for the project page. Stores the forecast dates on the way."""
    today = date.today()
    rows = reschedule(db, project, today)
    tasks = _project_tasks(db, project.id)
    planned_due = project.approved_due_date or project.baseline_due_date
    finishes = [r["finish"] for r in rows.values() if r["active"] and r["finish"]]
    forecast = max(finishes) if finishes else None
    slip = (forecast - planned_due).days if forecast and planned_due and forecast > planned_due else 0

    # the tasks behind a late project: from the last finish back through whatever pushed it
    extending: set = set()
    if slip:
        stack = [i for i, r in rows.items() if r["active"] and r["finish"] == forecast]
        while stack:
            cur = stack.pop()
            if cur in extending:
                continue
            extending.add(cur)
            if rows[cur]["cause"] == "dependency":
                stack.extend(p for p in rows[cur]["depends_on"]
                             if rows[p]["active"] and rows[p]["finish"] == rows[rows[cur]["driver_id"]]["finish"])

    out = []
    for t in tasks:
        if not sees_task(t):
            continue
        r = rows[t.id]
        out.append({
            "id": t.id, "code": t.code, "title": t.title, "status": t.status, "progress_pct": t.progress_pct,
            "responsible_id": t.responsible_id,
            "plan_start": r["plan_start"], "plan_finish": r["plan_finish"], "start": r["start"], "finish": r["finish"],
            "slip_days": r["slip_days"], "cause": r["cause"], "driver_id": r["driver_id"],
            "depends_on": r["depends_on"], "critical": r["critical"] and r["active"],
            # a late task holds the project back only if it is on the chain behind the late finish
            "extends_project": t.id in extending and r["slip_days"] > 0,
        })
    return {
        "enabled": True, "today": today,
        "project": {"start": project.start_date, "planned_due": planned_due, "forecast": forecast, "slip_days": slip},
        "tasks": out,
    }
