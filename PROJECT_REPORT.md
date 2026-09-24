# Project Report

## Anwar Group — Enterprise Task & Project Management System

**Report date:** 24 September 2026
**Project folder:** `E:\New_project\anwar-task-manager`
**Report written for:** non-technical readers, managers and future developers
**Purpose:** explain, in plain English, what this software is, what it does, how its data is stored, how healthy the code is, and what should be improved next.

> **Important note:** This report is an analysis only. No existing code file was changed, edited or deleted. Only this new report file was created.

---

## Quick Summary (one minute read)

This is a **web-based task and project management system** built for the **Anwar Group**. Think of it as a digital office where staff can:

- register projects and break them into tasks,
- assign people as Responsible / Accountable / Reviewer,
- track progress, deadlines, blockers and delays,
- send approval requests up the management chain,
- log meeting decisions, risks and issues,
- view dashboards and reports,
- and receive automatic email reminders when tasks are due, overdue, or finished.

It is made of **three parts**:

| Part | Simple description | Technology |
|---|---|---|
| **Frontend** | The website the user sees and clicks (screens, tables, buttons) | React + TypeScript, served by Nginx |
| **Backend** | The "brain": rules, calculations, logins, emails | Python + FastAPI + SQLAlchemy |
| **Database** | The permanent store of all records | PostgreSQL (cloud, on Neon) or SQLite |

It can run **on a developer's PC** (via helper start scripts) or **in Docker containers** (a packaged way to run all pieces together).

**Overall verdict:** The project is **feature-rich and well organised**, and a lot of careful thought went into the data model and workflows. However, it is **not yet production-safe**: there are a few real bugs, some security gaps (the API is largely open, secrets sit in plain-text files), and some leftover/duplicate code. With a focused round of fixes (Section 5), it can become a solid internal enterprise tool.

---

## 1. Project Overview

### 1.1 What is this application?

The full name is the **"Anwar Group Enterprise Task & Project Management System"**. It is a business application that helps a group of companies plan work, assign it to people, follow it until it is finished, and keep an audit trail of what happened.

You can think of it as a combination of:

- a **to-do and project tracker** (like a shared, company-wide task list),
- a **management dashboard** (numbers and health charts for bosses),
- an **approval workflow** (requests that travel up the chain of command),
- a **governance register** (meetings → decisions → actions → risks → issues),
- and an **automatic email reminder system**.

### 1.2 Who is it for?

It is designed for a corporate group with many companies ("SBUs" — Strategic Business Units), many departments and many levels of staff. The system recognises **roles**, for example:

`group_executive`, `business_head`, `functional_head`, `sponsor`, `pmo`, `pm`, `team_lead`, `employee`, `reviewer`, `auditor`, `admin`.

Some roles are "privileged", meaning those users can see **all** tasks across the group and can approve requests. Regular users normally see only **their own** tasks.

### 1.3 The big picture (how the pieces fit together)

```
   USER
    |
    v
[ FRONTEND ]  React website (screens: Dashboard, Tasks, Projects, Kanban, ...)
    |
    |  sends requests to /api/...
    v
[ BACKEND ]   Python FastAPI application
    |         - checks login (JWT token / X-User-Id)
    |         - applies business rules (health, completion, approvals)
    |         - sends emails through Gmail
    |
    v
[ DATABASE ]  PostgreSQL (cloud) or SQLite (local file)
              - one big collection of linked tables
```

There is also a **separate "scheduler" worker**: a small background program that wakes up every hour and sends the automatic emails (due soon, overdue, completed, stale backlog). It can run inside the backend process, or as its own Docker container so the two never send duplicate emails.

### 1.4 How it is run

| Method | What happens | File |
|---|---|---|
| **Windows one-click** | Opens two windows: backend (uvicorn) + frontend (vite) | `start.bat`, `start.ps1` |
| **Docker** | Builds and runs 3 containers: backend, scheduler, frontend (Nginx) | `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` |
| **Local production-ish** | Frontend built with `npm run build`, backend served by uvicorn | `frontend/package.json` |

- The frontend talks to the backend using the path prefix `/api`, which is then rewritten (in development by Vite, in production by Nginx) to the real backend routes.
- Email is sent through **Gmail SMTP** using a Gmail "App Password".

### 1.5 Technology used (plain-language table)

| Layer | Tool | What it does here |
|---|---|---|
| Frontend | React 18, React Router, TypeScript | Draws the screens and handles navigation |
| Frontend build | Vite 6 | Bundles the website for fast loading |
| Frontend styling | Plain CSS (`index.css`) | Colours, layout, cards, badges |
| Backend | FastAPI | Web API (creates the `/tasks`, `/projects`, etc. routes) |
| Backend ORM | SQLAlchemy 2 | Turns Python objects into database rows |
| Validation | Pydantic | Checks incoming data has the right shape |
| Auth | passlib (bcrypt) + python-jose (JWT) | Password hashing and login tokens |
| Email | smtplib (Gmail SMTP) | Sends notification emails |
| Scheduling | APScheduler | Runs the email scan on a timer |
| Database | PostgreSQL (psycopg v3) / SQLite | Stores all records |
| Packaging | Docker + Docker Compose | Runs everything in containers |

### 1.6 Configuration and secrets

Settings live in `.env` files (project root and `backend/.env`). They include:

- the database connection address,
- the Gmail account and app password,
- the JWT secret key,
- CORS allowed addresses,
- email timing settings (`EMAIL_SCAN_INTERVAL_MINUTES`, `TASK_DUE_LOOKAHEAD_DAYS`, `BACKLOG_STALE_DAYS`),
- and the frontend storage mode (`VITE_STORAGE_MODE=remote`).

The `.gitignore` correctly excludes `.env` files from version control, so the secrets are **not committed to Git**. However, they still exist as **plain text on disk** (see Section 4 for the security warning).

---

## 2. Core Features & Functions

Below is everything the system can currently do, grouped by theme. Each item is written in simple language.

### 2.1 Login and account security

- **Login with email or employee ID + password.** The user can sign in with either their email address or their employee ID.
- **Passwords are encrypted** (bcrypt hashing) before being stored — the system never saves a real password.
- **Login token (JWT).** After login the user receives a token that keeps them signed in for 24 hours.
- **Forgot password.** The user enters their email, the system creates a secure one-hour reset link and emails it.
- **Reset / set password.** A public page where the user chooses a new password (used for both "forgot password" and "new account, set your password").
- **New-user welcome email.** When an admin creates an account, the new user automatically receives a 24-hour "set your password" email.
- **Auto sign-out on expired token.** If the token is invalid, the website clears it and returns to the login page.

### 2.2 Organisation master data

- **Companies (SBUs).** Add, list and remove the group's companies.
- **Functions.** Add, list and remove business functions (Operations, Finance, HR, IT, etc.).
- **Departments.** Add, list and remove departments, each optionally linked to a function.
- **Users.** Create, edit, deactivate (soft) and permanently delete users. Each user has employee ID, name, email, designation, company, function, department, role and a **manager** link.
- **Reporting hierarchy.** Each user can point to a "reports to" manager, and the system can build the full chain (employee → team lead → manager → … → CEO). The Admin Panel draws an **organisation chart tree** from this.
- **Admin-only protection.** Creating/editing/deleting users, and managing privileged roles, is restricted to the `admin` role.

### 2.3 Projects and milestones

- **Projects** with code, name, company, function, program, sponsor, manager, owner, strategy/objective text, type, priority, methodology, several dates (start, baseline due, approved due, forecast, actual), completion %, status, health, budget and criticality.
- **Automatic project health.** A project's health colour (green/amber/red/black) is recalculated from its tasks, and its completion % is averaged from task progress.
- **Milestones** inside each project with due date, status and completion.

### 2.4 Tasks (the heart of the system)

- **Create tasks** with title, description, expected deliverable, category, task type, priority, status, and dates (planned start, baseline due, approved due, forecast, actual).
- **RACI people on a task**: Responsible, Accountable and Reviewer.
- **Auto-code generation.** Task codes like `TSK-0001` are generated automatically, with a retry mechanism for collisions.
- **Inheritance.** A task placed under a project inherits that project's company and function if left blank.
- **Progress updates.** Users can log progress %, change status, raise a blocker, and set a forecast date. Every update is kept as history.
- **Automatic rules on status change.** Marking a task completed/closed sets progress to 100% and stamps a completion date; re-opening clears the completion date.
- **Automatic task health.** Green/amber/red based on blocker, due date and progress.
- **Blockers.** Flag a task as blocked with details; it is highlighted everywhere.
- **Soft delete + admin hard delete.** Normal delete hides a task (history kept); an admin can permanently remove a task and all its dependent records.
- **Submit for completion approval** button on a task (creates an approval request).
- **Request a date change / revision** for a task, which goes to the task's Reviewer.

### 2.5 Kanban board

- A six-column board: **Backlog → Ready → In Progress → In Review → Blocked → Completed**.
- Cards can be moved between columns using buttons (drag-free by design), which updates the task status.
- Filters by SBU, function, department, project, responsible person and priority.

### 2.6 Backlog

- Capture requirements before they become tasks (code `BLG-xxxx`).
- Track business value, priority, complexity, estimated effort, target milestone and acceptance criteria.
- Workflow statuses: `new → review → grooming → prioritized → ready → planned → converted`.
- **Convert to Task** button: turns a backlog item into a real task and marks the item converted.

### 2.7 Approvals workflow

- Approval types include **completion** and **revised_date** (and the model supports a project-approval type).
- **Smart approver selection.** The system picks the approver by walking up the chain: Reviewer → Accountable → the requester's line manager.
- **Who can decide.** An admin, the assigned approver, or the task's Reviewer/Accountable — but never the person who raised the request (unless they are an admin).
- **Special rule for date revisions:** these always go to the task's Reviewer, and only the Reviewer (or an admin) can decide.
- **Full approval detail page** showing the request, the task, delay/RCA details, progress history, a comment box, and Approve / Reject buttons.
- **Side effects on approval:** approving a completion marks the task completed; approving a revised date applies the proposed new due date to the task and marks the delay record approved.
- **Notifications** are sent to the people involved at each step.

### 2.8 Delay / RCA (Root Cause Analysis)

- Log a delay with category, reason, root cause, internal/external, dependency flag, business impact, schedule impact in days, recovery action, recovery owner, revised date, management intervention and preventive action.
- The task is automatically marked amber when a delay is logged, and the proposed revised date becomes the forecast date.

### 2.9 RACI matrix

- A grid: **rows = tasks, columns = people, cells = R / A / C / I**.
- Automatically fills R, A and C from the task assignments, and adds any extra RACI entries.
- Can be filtered by project, SBU, function and department.
- **Detects "RACI gaps"** — tasks that are missing a Responsible or an Accountable person.

### 2.10 Governance (meetings, decisions, actions, risks, issues)

- **Meetings** with type and date.
- **Decisions** recorded against a meeting, with owner, project and status; can be closed.
- **Management actions** from decisions, with responsible/accountable people and due date.
- **Convert an action into a task** with one click (and remembers the link).
- **Risks** with likelihood, impact, mitigation, owner and status.
- **Issues** with severity, resolution, owner and status.

### 2.11 Dashboards and reporting

- **Personal dashboard ("My Dashboard")**: task KPI cards (total, open, due today, overdue, critical, blocked, completed, completion %, on-time %), a list of the user's tasks, a mini calendar highlighting days when their tasks are due, and a project-health donut chart.
- **Group portfolio KPIs**: total/active projects and counts by health colour, plus "forecast to miss".
- **Top delay causes** bar list.
- **Team & Portfolio Breakdown**: task/project counts rolled up by **SBU**, by **Function** and by **Department**.
- **Executive KPI endpoint** used to power the health chips.

### 2.12 Notifications and audit

- **In-app notifications** with kind (reminder, warning, escalation, assignment, approval, action, info) and read/unread state.
- **Escalation scan** (manual button or automatic): raises escalating alerts based on how many days a task is overdue (e.g. Delay RCA required → Functional Head → PM/Business Head → Executive; critical priority escalates immediately).
- **Notification Center** page; admins can browse any user's notifications, regular users only their own.
- **Audit trail**: records who did what, with old value, new value and reason, shown on the Audit page.

### 2.13 Automated email notifications

- Three checks run on a timer (default every 60 minutes):
  1. **Task completed** → email project manager, sponsor and the accountable person.
  2. **Task due soon / due today / overdue** → email the responsible and accountable people plus supervisors.
  3. **Stale backlog item** (open longer than a set number of days) → email the requester and supervisors.
- **Never spams:** each entity + email-type is only emailed once per calendar day (tracked in the `email_logs` table).
- **Manual trigger** with a `?force=true` option for testing (bypasses the once-a-day rule).
- **Test mode:** an allow-list (`MAIL_ALLOWED_RECIPIENTS`) restricts emails to approved addresses while testing.
- **A master switch** (`MAIL_ENABLED`) can turn all email off.
- A **"System Emails"** tab in the Admin Panel is intended to show the dispatch history (currently not working — see Section 4).

### 2.14 Admin Panel

- **Users tab:** list, create, edit, deactivate, permanently delete.
- **All Tasks tab:** list every task; admin can permanently remove.
- **Privileged Roles tab:** choose which roles can see all tasks and approve.
- **Hierarchy Mapping tab:** organisation chart plus a detail table showing each person's manager and full chain.
- **System Emails tab:** intended email dispatch log (currently returning nothing).
- Inline creation of SBU / function / department, projects and users from inside the task form.

### 2.15 Screens (frontend pages) included

Login, Forgot Password, Reset Password, Dashboard, Tasks, Task Detail, Kanban, Projects, Project Detail, Backlog, Governance, RACI, Approvals, Approval Detail, Notifications, Audit Trail, Admin Panel.

### 2.16 Local (browser-only) fallback mode

The frontend still contains a complete "offline" data layer (`store.ts`) that saves everything in the browser's `localStorage`. This was the original way the app ran before the database was added. It is now mostly a fallback, because the default mode is `remote` (talk to the backend). A few screens still accidentally read from it, which causes inconsistencies (see Section 4).

---

## 3. Database Structure

### 3.1 The simple explanation

Imagine a large **filing cabinet** with many labelled drawers. Each drawer is a "table", and each paper inside is a "row". Some papers point to other papers — for example, a task sheet says "this belongs to Project #3" and "the Responsible person is User #7". Those pointers are called **foreign keys**, and they are what turn a pile of lists into a connected system.

Every main table also carries a small stamp block (from the shared `TimestampMixin`):

- `created_at` — when the row was made,
- `created_by` — who made it,
- `updated_at` — when it was last changed,
- `updated_by` — who last changed it.

Tasks also use **soft delete**: instead of really deleting, the row is flagged `is_deleted = true` and hidden. This preserves history; only an admin can truly remove it.

### 3.2 The tables (drawers) and what they hold

#### Organisation drawer group

| Table | Plain meaning | Key information it stores |
|---|---|---|
| `companies` | The group's companies / SBUs | name, code, active flag |
| `functions` | Business functions | name, code |
| `departments` | Departments inside functions | name, link to a function |
| `users` | Every person | employee ID, name, email, designation, company, function, department, role, active flag, password hash, password-reset token + expiry, and **reports_to_id** (their manager) |
| `programs` | Groupings of related projects | name, company |

> **Smart design note:** `users.reports_to_id` points back to the `users` table itself (a "self-reference"). One column is enough to build hierarchies of any depth — employee → team lead → manager → CEO — without extra tables.

#### Work drawer group

| Table | Plain meaning | Key information it stores |
|---|---|---|
| `projects` | Projects | code, name, company, function, program, sponsor/manager/owner, objectives, type, priority, methodology, all key dates, completion %, status, health, budget, criticality |
| `milestones` | Checkpoints inside a project | project link, name, due date, status, completion % |
| `tasks` | Individual pieces of work | code, parent task, project, milestone, company, function, department, title, description, deliverable, category, type, priority, Responsible/Accountable/Reviewer, all key dates, progress %, status, health, blocker info, acceptance criteria, completion evidence/remarks, soft-delete flag |
| `task_dependencies` | "This task depends on that task" links | task, depends-on task, dependency type |
| `progress_updates` | The history log of progress | task, progress %, status, remarks, blocker, next action, forecast date, support needed |

#### Quality and responsibility drawer group

| Table | Plain meaning | Key information it stores |
|---|---|---|
| `delay_rca` | Delay / root-cause analysis records | task, delay category, reason, root cause, internal flag, dependency flag, responsible party, business impact, schedule impact days, recovery action/owner, revised date, support needed, management intervention, preventive action, approval status |
| `raci` | Extra RACI assignments | task or project, user, R/A/C/I type |

#### Planning and flow drawer group

| Table | Plain meaning | Key information it stores |
|---|---|---|
| `backlog_items` | Requirements waiting to become work | code, project, requirement, description, business value, priority, complexity, estimated effort, requester, target milestone, acceptance criteria, status, converted-task link |
| `approvals` | Approval requests | type, entity type (task/project), entity id, requester, approver, status, reason, decided-at |

> **Smart design note:** `approvals` uses "entity type + entity id" instead of two separate columns. This lets one table hold approvals for tasks, projects, and future item types without changing the database shape.

#### Governance drawer group

| Table | Plain meaning | Key information it stores |
|---|---|---|
| `meetings` | Meetings held | title, type, date |
| `decisions` | Decisions made in meetings | code, meeting, statement, owner, project, date, status |
| `management_actions` | Actions agreed, to be done | code, meeting, decision, action text, responsible, accountable, due date, status, evidence, converted-task link |
| `risks` | Project risks | project, description, category, likelihood, impact, mitigation, owner, status |
| `issues` | Project issues | project, description, category, severity, resolution, owner, status |

#### System drawer group

| Table | Plain meaning | Key information it stores |
|---|---|---|
| `list_options` | Dropdown master lists | kind (category, task_type, priority, status, delay_category, meeting_type, privileged_role), value, active flag |
| `notifications` | In-app messages for users | user, title, body, kind, read flag |
| `audit_logs` | The "who changed what" history | actor, entity type/id, action, previous value, new value, reason, timestamp |
| `email_logs` | Remembers which automatic emails were already sent | entity type/id, email type, sent date, recipients |

### 3.3 How the tables connect (in one picture)

```
 companies ──< functions ──< departments
      │             │            │
      │             │            │
      └──────< users >───────────┘
                 │  ▲
                 │  └── reports_to_id (self-link, builds hierarchy)
                 │
      projects ──┼──< milestones ──< tasks >── task_dependencies
                 │                      │
                 │                      ├──< progress_updates
                 │                      ├──< delay_rca
                 │                      ├──< raci
                 │                      └──< approvals (task)
                 │
      programs ──┘
                 
      backlog_items ──> (converts into) tasks
      meetings ──< decisions ──< management_actions ──> tasks
                 └──< management_actions
      risks / issues ──> projects
      users ──< notifications
      audit_logs / email_logs  (standalone system records)
```

### 3.4 Special database features worth knowing

- **Unique business codes.** Projects (`PRJ-####`), tasks (`TSK-####`), backlog items (`BLG-####`), decisions (`DEC-####`) and actions (`ACT-####`) all have unique codes. The code generator uses the **highest existing number + 1**, not the row count, so deleting a row does not break future codes.
- **One approval-guard rule** in the database: the same person cannot be given the same RACI type twice on the same task/project.
- **One-email-per-day rule** built into `email_logs` (a unique constraint on entity + type + date), so the scheduler can safely run often without spamming.
- **In-place column patching.** On startup the backend also runs a few raw `ALTER TABLE ... ADD COLUMN` statements to upgrade **older** databases (adds `tasks.department_id`, user password/reset columns, `users.reports_to_id`). This is a lightweight migration method — it works but is not as safe as a proper migration tool (see Section 5).
- **Database choice:** the same code works with **SQLite** (a single local file, easy for development) and **PostgreSQL** (the cloud database used in the `.env` file). The code automatically adjusts the connection.

### 3.5 Current data situation

- On first run, the system seeds **one admin user** plus the dropdown master lists (categories, task types, priorities, statuses). Nothing else is created automatically — admins add companies, users and projects themselves.
- A separate `dummy_data.py` script can load a rich set of sample data (users, projects, tasks, risks, decisions, etc.) for testing every screen. It is idempotent (it will not load twice).

---

## 4. Current Status & Quality

### 4.1 Overall verdict

**Feature completeness: high.** The system already covers tasks, projects, approvals, governance, RACI, dashboards, email automation and admin. That is a lot of working functionality.
**Code quality: good in structure, mixed in detail.** The project is sensibly split into folders (models, schemas, routers, services), names are clear, and there are helpful comments. But there are real bugs, duplicated logic, leftover code, and important security gaps.
**Readiness: not production-ready yet.** Please fix the critical items in Section 5 before putting real company data into it.

### 4.2 What is good (strengths)

- **Clean folder structure.** Backend separates models, schemas, services and routers; frontend separates pages, components, types and helpers.
- **Good use of validation.** Pydantic schemas validate incoming data; NOT NULL fields are protected from accidental blanking.
- **Sensible business rules.** Task/project health calculation, completion rules, automatic code generation with collision retry, soft delete plus admin-only hard delete, and approver resolution by hierarchy.
- **Thoughtful email system.** Once-per-day de-duplication, test-mode allow-list, master on/off switch, and both in-process and standalone scheduler options.
- **Security basics present.** Passwords are hashed (bcrypt), JWT tokens are used, forgot-password does not reveal whether an email exists, and Nginx blocks access to hidden files such as `.env` and `.git`.
- **Helpful comments**, including notes explaining why certain decisions were made.
- **Error boundary on the frontend** so a crash shows a friendly reload screen instead of a blank page.
- **Consistent visual design** through a single CSS file with brand colours.

### 4.3 Problems found

Each problem is tagged **[High]**, **[Medium]** or **[Low]** to show how urgent it is. File paths are given so a developer can find them quickly.

#### Bugs (things that are actually broken)

1. **[High] Two task endpoints will crash.** In `backend/app/routers/tasks.py`, the endpoints `submit_task_for_approval` and `request_due_date_change` call the functions `create_hierarchical_approval(...)` and `create_in_page_notifications(...)`, but the line that imports those functions is **commented out** at the top of the file. When these endpoints are used, Python will throw a `NameError` and the request will fail with a server error. (The same functions do exist in `app/services.py` and `app/services/hierarchy_service.py`, they are just not imported here.) The file also imports `services` twice.

2. **[Medium] Some screens read the wrong data source.** In "remote" mode the real data comes from the database, but several frontend screens still read from the browser's local copy (`store.ts`). For example:
   - `TaskDetail.tsx` shows the task's SBU / Function / Department from the **local** seed data (`store.companies()`, `store.functions()`, `store.departments()`), so names can be wrong or missing.
   - `Tasks.tsx`, `Kanban.tsx` and `TaskDetail.tsx` decide "can this person see all tasks?" using `store.isPrivileged()`, which uses the **local** privileged-role list, not the backend's.
   - `TaskDetail.tsx` chooses the approver with `store.approverFor()`, which uses local users.
   Result: permissions and displayed names can disagree with the server.

3. **[Medium] Admin "System Emails" tab never shows data.** `AdminPanel.tsx` calls `GET /email-logs`, but the backend has no such route. The request fails silently (only a console warning), so the tab is always empty.

4. **[Medium] Local development ports do not match.** `frontend/vite.config.ts` proxies `/api` to `http://localhost:8001`, but `start.bat` / `start.ps1` launch the backend on the **default port 8000** (uvicorn is started without `--port`). Running the app the "one-click" way would therefore fail to reach the backend. (Docker maps the backend to 8001, which is why the proxy value is 8001.)

5. **[Low] Empty and dangerous helper scripts.** `backend/test_email.py` is completely empty (0 bytes). `backend/check_login.py` and `backend/set_passwords.py` **reset every user's password to `password123`**. These are clearly developer/debug tools, but they are a serious footgun if ever run on a live system.

#### Security concerns

6. **[High] Most API routes are open, and identity can be faked.** Only a few routes require a logged-in user (approvals, `users/me`); most routes (`/tasks`, `/projects`, `/organizations/*`, `/audit`, `/dashboards/*`, etc.) have **no authentication check at all**. Anyone who can reach the API can read or modify data. Worse, for the routes that *do* check, the fallback `X-User-Id` header lets a caller pretend to be any user simply by sending that header.

7. **[High] Live secrets in plain-text files.** `.env` and `backend/.env` contain a real cloud database address *with its password* and a real Gmail **app password**. They are correctly excluded from Git, but they still sit unprotected on disk and have been shared as part of the project folder. The JWT secret is also just a placeholder (`dev-only-change-me-later`).

8. **[Medium] Default admin password is hard-coded.** `backend/app/seed.py` creates the first admin with a fixed password (`123abc123`). If this is not changed, anyone who reads the code can log in.

9. **[Medium] Notifications are not user-protected.** `GET /audit/notifications?user_id=...` accepts any user id and has no auth, so one user could read another's notifications.

#### Design and maintainability issues

10. **[Medium] Duplicated hierarchy logic.** The functions for stakeholder lookup, approver resolution and hierarchical approvals exist **twice** (`app/services.py` and `app/services/hierarchy_service.py`) with slightly different code. This is confusing and risks the two drifting apart.

11. **[Medium] Two parallel data layers.** The full `store.ts` (around 760 lines) duplicates the entire business logic in the browser. Since the default is now `remote`, most of it is dead weight and a source of the mismatches in problem 2.

12. **[Low] Old-style startup hooks & ad-hoc migrations.** `main.py` uses `@app.on_event("startup"/"shutdown")`, which newer FastAPI versions prefer to replace with a "lifespan" function. The `ensure_columns()` raw SQL `ALTER TABLE` approach works but is fragile compared with a proper migration tool.

13. **[Low] Duplicate imports and minor code smells.** `schemas.py` imports `pydantic` twice; `tasks.py` imports `app.services` twice; `datetime.utcnow` is used (deprecated in newer Python); `Audit` entries are often recorded with actor `"system"` even when a real user acted, because most write routes do not pass the current user.

14. **[Low] A duplicate worktree folder.** `.kilo/worktrees/clumsy-fir/` is a full **second copy** of the project (a Git worktree). It doubles the folder size and can confuse searches, editors and deployments.

15. **[Low] No automated tests.** There are no unit or integration tests for backend or frontend. The few "test" files are ad-hoc scripts, and one is empty.

16. **[Low] Minor UX gaps.** The progress form's status dropdown omits `closed` and `cancelled`; the audit trail can show `"system"` instead of the real actor; the `package.json` includes a non-standard `allowScripts` field.

### 4.4 Summary table

| Area | Status |
|---|---|
| Feature coverage | Strong — most intended workflows exist |
| Code organisation | Good |
| Bugs | A few real ones (see items 1–5) |
| Security | Weak — API mostly open, secrets on disk, default password |
| Automated tests | Missing |
| Documentation | Mostly inline comments; no user manual |
| Deployability | Docker and scripts exist, but ports/host values need cleanup |

---

## 5. Recommended Updates & Modifications

The recommendations are grouped by urgency. Start at the top.

### 5.1 Fix now (critical — do these first)

1. **Repair the two broken task endpoints.**
   *What:* In `backend/app/routers/tasks.py`, import the missing functions (e.g. `from app.services.hierarchy_service import create_in_page_notifications, create_hierarchical_approval`, or call them as `services.create_...`) and remove the duplicate `services` import. Either use `services.py` or `hierarchy_service.py` — not both.
   *Why:* Without this, "Submit for Approval" and "Request Due Date Change" can crash.

2. **Protect every API route with authentication.**
   *What:* Add the `get_current_user` dependency to all data routes (tasks, projects, organisations, dashboards, audit, notifications, etc.). Restrict admin-only actions. Remove or tightly limit the `X-User-Id` fallback so a caller cannot impersonate another user.
   *Why:* Right now the API is effectively public; anyone who can reach it can read or change company data.

3. **Remove secrets from disk and rotate them.**
   *What:* Change the Gmail **app password** and the database password (because they have been exposed). Keep secrets only in a safe place (environment variables or a secrets manager), never in a shared folder. Replace the JWT placeholder with a long random value.
   *Why:* Exposed credentials can be abused by anyone who obtains the folder.

4. **Change the default admin password immediately after first login**, and ideally make `seed.py` generate a random password or force a reset on first sign-in.
   *Why:* A fixed, publicly known password defeats the login system.

5. **Confirm and fix the notification access rule.**
   *What:* Make `GET /audit/notifications` return only the current user's notifications (or require admin for other users').
   *Why:* Prevents users from reading each other's messages.

### 5.2 Fix next (important — high value, moderate effort)

6. **Make the frontend consistently use the backend data.**
   *What:* Replace the remaining `store.ts` calls in screens with API calls — in particular privilege checks (`isPrivileged`), approver lookup (`approverFor`), and the SBU/Function/Department names on the Task Detail page.
   *Why:* It removes contradictory permissions and wrong names, and it lets you eventually delete the unused local data layer.

7. **Add the missing backend `GET /email-logs` route** (admin-only) so the Admin Panel "System Emails" tab shows real data. Return the `email_logs` table with task/backlog references.
   *Why:* The feature is fully built in the UI but has no server support.

8. **Align local development ports.** Either start uvicorn with `--port 8001` in `start.bat` / `start.ps1`, or change the Vite proxy target to `8000`.
   *Why:* So the "one-click" start scripts actually work.

9. **Delete the dangerous debug scripts** (`check_login.py`, `set_passwords.py`), or clearly move them to a `tools/` folder with loud warnings and remove the "reset everyone" behaviour. Delete or fill in the empty `test_email.py`.
   *Why:* Prevents accidental mass password resets on a live system.

10. **Record the real user in the audit trail.**
    *What:* Pass the authenticated user's name into the `services.audit(...)` calls in each router instead of `"system"`.
    *Why:* The audit trail is meant to say *who* changed something; currently it often cannot.

11. **Unify the duplicated hierarchy code.** Keep one implementation (recommend `app/services/hierarchy_service.py`) and delete the copy in `services.py`.
    *Why:* One source of truth prevents bugs where the two copies behave differently.

12. **Fix the small code smells.** Remove duplicate imports in `schemas.py` and `tasks.py`; replace deprecated `datetime.utcnow` with timezone-aware `datetime.now(timezone.utc)`.

### 5.3 Improvements for the future (nice to have)

13. **Adopt a proper database migration tool (Alembic).** Replace the raw `ALTER TABLE` helper with versioned migrations.
    *Why:* Safer, repeatable database changes as the system grows.

14. **Add automated tests.** At minimum, backend tests for tasks, approvals, health calculation and email de-duplication, plus a frontend build/type-check in CI.
    *Why:* Tests catch regressions before users do.

15. **Clean up the duplicate worktree** at `.kilo/worktrees/clumsy-fir/`, and add it to `.gitignore` if it is temporary.
    *Why:* Avoids confusion and wasted disk space.

16. **Consider removing the local `store.ts` layer entirely** once the frontend fully uses the API, or clearly mark it as a demo-only mode.
    *Why:* Less code to maintain and fewer chances for mismatches.

17. **Move startup/shutdown to the FastAPI "lifespan" style** and modernise the scheduler startup.
    *Why:* Aligns with current FastAPI best practice and removes deprecation warnings.

18. **Add role-based access rules inside the API** (not just in the frontend). For example, only privileged roles should list all tasks; regular users should be filtered server-side.
    *Why:* Frontend filters are easy to bypass; the server must be the final guard.

19. **Improve notifications and email features:**
    - add a proper email-dispatch log route and, optionally, retry failed emails;
    - let users choose notification preferences;
    - make the escalation thresholds configurable from settings rather than hard-coded.

20. **UX and accessibility polish:**
    - include all statuses (`closed`, `cancelled`) in the progress form;
    - add loading and empty-state messages consistently;
    - make tables and modals keyboard-accessible;
    - add a simple user guide / help page.

21. **Write documentation:** a short `README.md` (how to install, configure `.env`, run locally, run with Docker, and change the admin password) and an admin user manual.
    *Why:* New team members can get started without reading the source code.

22. **Add environment examples.** Create a committed `.env.example` (with blank values) so others know which settings are required without exposing real secrets.

### 5.4 Suggested order of work (a simple plan)

| Phase | Goal | Items |
|---|---|---|
| **Phase 1** | Make it safe and working | 1, 2, 3, 4, 5, 8 |
| **Phase 2** | Make it consistent | 6, 7, 9, 10, 11, 12 |
| **Phase 3** | Make it maintainable | 13, 14, 15, 16, 17, 18 |
| **Phase 4** | Make it polished | 19, 20, 21, 22 |

---

## Appendix A — File map (where things live)

```
anwar-task-manager/
├── .env                       # settings + secrets (NOT committed to Git)
├── .gitignore
├── docker-compose.yml         # backend + scheduler + frontend containers
├── start.bat / start.ps1      # one-click local start (Windows)
├── .kilo/worktrees/...        # a duplicate Git worktree (should be cleaned up)
├── backend/
│   ├── .env                   # duplicate settings + secrets
│   ├── Dockerfile             # builds the Python container
│   ├── requirements.txt       # Python libraries used
│   ├── check_login.py         # debug script (dangerous - resets passwords)
│   ├── set_passwords.py       # debug script (dangerous - resets passwords)
│   ├── test_email.py          # EMPTY file
│   ├── test_send_email.py     # sends a test email
│   └── app/
│       ├── main.py            # starts the app, mounts all routes, seeds data
│       ├── config.py          # reads settings
│       ├── database.py        # database connection
│       ├── models.py          # all database tables
│       ├── schemas.py         # input/output data shapes
│       ├── security.py        # password hashing + JWT
│       ├── auth.py            # login / forgot / reset password
│       ├── services.py        # shared helpers (audit, notify, health, codes)
│       ├── services/hierarchy_service.py  # duplicate hierarchy helpers
│       ├── email_service.py   # Gmail email templates & sending
│       ├── scheduler.py       # in-process timer for emails
│       ├── scheduler_worker.py# standalone scheduler container
│       ├── notifications_job.py# the 3 email checks
│       ├── seed.py            # creates the first admin + dropdown lists
│       ├── dummy_data.py      # sample test data
│       └── routers/           # one file per feature area (tasks, projects, ...)
└── frontend/
    ├── Dockerfile             # builds the website and serves it with Nginx
    ├── nginx.conf             # web server + /api proxy rules
    ├── package.json           # frontend libraries
    ├── vite.config.ts         # dev server + /api proxy
    └── src/
        ├── main.tsx, App.tsx  # entry point + layout/navigation
        ├── api.ts             # talks to the backend (or local store)
        ├── auth.tsx           # login state management
        ├── constants.ts       # colours, labels, date helpers
        ├── types.ts           # TypeScript data shapes
        ├── store.ts           # local (browser) data layer - mostly unused now
        ├── index.css          # all styling
        ├── components/        # TaskForm, SearchableSelect, ErrorBoundary
        └── pages/             # one file per screen
```

## Appendix B — Glossary (simple meanings)

| Term | Meaning in this project |
|---|---|
| **SBU** | Strategic Business Unit — one of the group's companies |
| **RACI** | Responsible, Accountable, Consulted, Informed — who does what |
| **RCA** | Root Cause Analysis — investigating why something was delayed |
| **KPI** | Key Performance Indicator — a headline number for management |
| **JWT** | A secure login token that keeps a user signed in |
| **ORM** | A tool that lets code work with database tables as objects |
| **Soft delete** | Hiding a record instead of truly deleting it |
| **Migration** | A controlled change to the database structure |
| **Scheduler** | A background timer that runs jobs automatically |
| **API** | The set of web addresses the frontend uses to talk to the backend |

## Appendix C — Note on this report

This report was produced by reading the project's source and configuration files (backend Python, frontend TypeScript/React, Docker files, start scripts and settings). It did not run the application or its tests. Statements about behaviour are based on reading the code. No code file was modified, edited or deleted.
