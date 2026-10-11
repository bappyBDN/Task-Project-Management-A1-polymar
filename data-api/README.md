# ProjectFlow Data API (read-only)

A small service of its own that gives **read-only** access to the ProjectFlow database over
HTTP, for collecting data: reports, dashboards, or another system. It is separate from the
Task & Project Management system and does not use or change its code.

It can read every table. It cannot change anything.

---

## For the people who collect the data

You need two things from the administrator: the **address** of the service and the **API key**.

Send the key in the `X-API-Key` header of every request.

| Request | Returns |
|---|---|
| `GET /health` | Whether the service is up (no key needed, no data) |
| `GET /tables` | Every table, its columns and its row count |
| `GET /tables/{table}` | Rows of one table |
| `GET /tables/{table}/{id}` | One row by its id |
| `GET /docs` | Interactive documentation in the browser (use **Authorize** to enter the key) |

### Reading a table

`GET /tables/tasks?status=completed&order_by=baseline_due_date&limit=100`

| Parameter | Meaning |
|---|---|
| `limit` | Rows per request: 1 to 1000, default 100 |
| `offset` | Rows to skip, for the next page |
| `order_by` | Column to sort by (default: `id`) |
| `desc` | `true` = largest / newest first |
| `columns` | Only these columns, for example `columns=id,code,status` |
| any column name | A filter, for example `status=completed` or `project_id=12` |

Comparisons are added to the column name with two underscores:

| Filter | Finds rows where |
|---|---|
| `progress_pct__gte=50` | progress is 50 or more |
| `progress_pct__lt=100` | progress is below 100 |
| `baseline_due_date__lte=2026-12-31` | due on or before that date |
| `status__ne=cancelled` | status is not cancelled |
| `title__like=%report%` | the title contains "report" (upper / lower case ignored) |
| `reviewer_id=null` | the reviewer is empty |
| `reviewer_id__ne=null` | the reviewer is filled |

Available comparisons: `ne`, `gt`, `gte`, `lt`, `lte`, `like`. Several filters together must all match.

### The answer

```json
{
  "table": "tasks",
  "total": 140,
  "limit": 100,
  "offset": 0,
  "columns": ["id", "code", "status"],
  "rows": [{ "id": 2, "code": "TSK-0002", "status": "completed" }]
}
```

`total` is the number of rows that match. To collect them all, repeat the request with
`offset=100`, `offset=200`, … until you have `total` rows.

### Examples

```bash
# the tables
curl -H "X-API-Key: YOUR_KEY" http://SERVER:8090/tables

# all open tasks of one project, most overdue first
curl -H "X-API-Key: YOUR_KEY" "http://SERVER:8090/tables/tasks?project_id=12&status__ne=completed&order_by=baseline_due_date"

# one project
curl -H "X-API-Key: YOUR_KEY" http://SERVER:8090/tables/projects/12
```

```python
import requests

BASE, KEY = "http://SERVER:8090", "YOUR_KEY"

def all_rows(table, **filters):
    rows, offset = [], 0
    while True:
        page = requests.get(f"{BASE}/tables/{table}", headers={"X-API-Key": KEY},
                            params={**filters, "limit": 1000, "offset": offset}, timeout=60).json()
        rows += page["rows"]
        offset += page["limit"]
        if offset >= page["total"]:
            return rows

tasks = all_rows("tasks", status="completed")
```

**Power BI / Excel:** Get Data → Web → Advanced, enter the URL, and add the HTTP request
header `X-API-Key` with the key.

### Main tables

| Table | Holds |
|---|---|
| `projects` | Projects: code, name, dates, status, health, completion % |
| `tasks` | Tasks: people, dates, status, progress |
| `task_subtasks` | Optional subtasks of a task |
| `progress_updates` | Every progress update of a task |
| `delay_rca` | Delay records |
| `approvals` | Completion, date-revision and deletion requests and their outcome |
| `users` | People: name, employee ID, email, role, manager (`reports_to_id`) |
| `companies`, `functions`, `departments` | SBUs, functions and departments |
| `audit_logs` | Who changed what and when |

`GET /tables` gives the full, current list with every column. Columns ending in `_id` point to
the `id` of another table (for example `tasks.project_id` → `projects.id`,
`tasks.responsible_id` → `users.id`).

### Errors

| Code | Meaning |
|---|---|
| 401 | The key is missing or wrong |
| 400 | An unknown column, a wrong value or an unknown comparison - the message says which |
| 404 | No such table, or no row with that id |
| 405 | Anything other than GET: the service only reads |
| 503 | The service cannot reach the database |

---

## For the administrator

### How it is deployed

It is the `data-api` service in the repository's `docker-compose.yml`: its own container
(`anwar-data-api`, port 8090), built from this folder. It deploys with the rest of the system
and shares nothing with the backend but the database, which it can only read.

### Settings

Two environment variables on the server (the same place the system's other settings are kept):

| Setting | Value |
|---|---|
| `DATABASE_URL` | Already set for the system: `postgresql://user:password@host:port/database` |
| `DATA_API_KEY` | The key callers send. At least 24 characters. **Add this one** |

Until `DATA_API_KEY` is set, the service runs but answers 503 to every data request, so
deploying it switches nothing on by itself.

To make a key: `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Put it in the
server's settings and redeploy (or restart the `anwar-data-api` container). To change it later,
do the same: the old key stops working at once. Never put the key in the repository.

### Check it

Open `http://SERVER:8090/health`. It should answer
`{"status":"ok","database":"connected","read_only":true,"key_set":true}`.
`"key_set":false` means `DATA_API_KEY` is missing or shorter than 24 characters.
Port 8090 must be open on the server's firewall for the people who collect the data.

### Run it on its own (optional)

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8090
```

with `DATABASE_URL` and `DATA_API_KEY` set as environment variables, or in a `.env` file
beside `app.py` (`.env.example` is the template; a real `.env` must never be committed).

### Why it is safe for the database

- **Only GET routes.** POST, PUT, PATCH and DELETE answer 405.
- **Only SELECT queries**, built by the service. Table and column names are checked against the
  database's own list and values are sent as parameters, so nothing typed into a URL becomes SQL.
- **The database session is read-only** (`default_transaction_read_only=on`). PostgreSQL itself
  refuses an INSERT, UPDATE, DELETE or CREATE on it.
- **Passwords and reset tokens are never returned**, and cannot be used to filter or sort.
- **Limits:** at most 1000 rows per request, and a query is stopped after 30 seconds.

### Before giving it to others

- Whoever has the key can read every table, including people's names, emails and employee IDs.
  Give the key only to those who need it, and change it when someone leaves.
- The service speaks plain HTTP. If it will be reached over the internet, put it behind HTTPS
  (for example an nginx reverse proxy with a certificate), or the key travels unencrypted.
- For stronger protection, ask the database administrator for a separate database user that can
  only SELECT, and use that user in `DATABASE_URL`. The service works the same.
