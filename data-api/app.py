"""ProjectFlow Data API: read-only access to the ProjectFlow database over HTTP.

A small service of its own, separate from the Task & Project Management system. It is for
collecting data (reports, dashboards, another system): it can look at every table and can
never change anything.

  GET /health                       is the service up and can it reach the database (no key)
  GET /tables                       the tables, their columns and row counts
  GET /tables/{table}               rows of one table (filter, sort, page - see read_table)
  GET /tables/{table}/{id}          one row by its id

Every request except /health must send the key:   X-API-Key: <DATA_API_KEY>

Why it cannot write:
  - there are only GET routes, and every query is a SELECT built here: table and column
    names are checked against the database's own list, values are bound parameters;
  - the database session itself is read-only (default_transaction_read_only), so
    PostgreSQL would refuse an INSERT / UPDATE / DELETE even if one were sent.
Passwords and reset tokens are never returned.

Settings (environment variables, or a .env file beside this file):
  DATABASE_URL   postgresql://user:password@host:port/database
  DATA_API_KEY   the key callers must send; at least 24 characters. Without it the service
                 runs but answers 503 to every data request.

In this repository it is its own container (docker-compose.yml: data-api, port 8090): it
shares nothing with backend/ but the database it reads.
"""
import hmac
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.encoders import jsonable_encoder
from fastapi.security import APIKeyHeader
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.types import Boolean, Date, DateTime, Float, Integer, Numeric


def _load_env():
    """KEY=value lines of the .env beside this file (real environment variables win)."""
    path = Path(__file__).with_name(".env")
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env()
DATABASE_URL = os.environ.get("DATABASE_URL", "")
API_KEY = os.environ.get("DATA_API_KEY", "")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL is not set. Put it in the .env file (see .env.example).")
# No usable key: the service still starts (so a deploy never fails on it), but it gives out
# no data until a key of at least 24 characters is set.
KEY_READY = len(API_KEY) >= 24

HIDDEN_COLUMNS = {"hashed_password", "reset_token", "reset_token_expires"}
MAX_LIMIT = 1000
# ?due_date__gte=2026-01-01 : the part after "__" is the comparison
OPERATORS = {"": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "LIKE"}
RESERVED = {"limit", "offset", "order_by", "desc", "columns"}

IS_POSTGRES = DATABASE_URL.startswith("postgres")
if IS_POSTGRES:
    # postgres://... or postgresql://... -> the psycopg 3 driver, every session read-only
    url = re.sub(r"^postgres(ql)?(\+\w+)?:", "postgresql+psycopg:", DATABASE_URL)
    engine = create_engine(url, pool_pre_ping=True, pool_size=3, max_overflow=2,
                           connect_args={"options": "-c default_transaction_read_only=on -c statement_timeout=30000"})
else:
    engine = create_engine(DATABASE_URL)

app = FastAPI(
    title="ProjectFlow Data API (read-only)",
    version="1.0.0",
    description="Read-only access to the ProjectFlow database. Send your key in the **X-API-Key** header "
                "(in these docs: the **Authorize** button). Nothing here can change the data.",
)
_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_key(key: Optional[str] = Security(_key_header)):
    if not KEY_READY:
        raise HTTPException(503, "The data API is not switched on yet: DATA_API_KEY (at least 24 characters) is not set on the server.")
    if not key or not hmac.compare_digest(key.encode(), API_KEY.encode()):
        raise HTTPException(401, "Missing or wrong API key. Send it in the X-API-Key header.")


def _quote(name: str) -> str:
    return engine.dialect.identifier_preparer.quote(name)


def _columns(table: str) -> dict:
    """The table's readable columns, name -> type. 404 for a table that does not exist."""
    insp = inspect(engine)
    if table not in insp.get_table_names():
        raise HTTPException(404, f'There is no table "{table}". GET /tables lists them.')
    return {c["name"]: c["type"] for c in insp.get_columns(table) if c["name"] not in HIDDEN_COLUMNS}


def _value(column: str, kind, raw: str):
    """The text of a query parameter as the column's own type."""
    try:
        if isinstance(kind, Boolean):
            if raw.lower() not in ("true", "false", "1", "0", "t", "f"):
                raise ValueError
            return raw.lower() in ("true", "1", "t")
        if isinstance(kind, Integer):
            return int(raw)
        if isinstance(kind, (Float, Numeric)):
            return float(raw)
        if isinstance(kind, DateTime):
            return datetime.fromisoformat(raw)
        if isinstance(kind, Date):
            return date.fromisoformat(raw)
    except ValueError:
        raise HTTPException(400, f'"{raw}" is not a valid value for the column "{column}".')
    return raw


def _select(sql: str, params: Optional[dict] = None) -> list:
    with engine.connect() as conn:
        if IS_POSTGRES:
            conn.execute(text("SET TRANSACTION READ ONLY"))  # belt and braces: the session already is
        return [dict(r._mapping) for r in conn.execute(text(sql), params or {})]


@app.get("/health", tags=["service"])
def health():
    """Is the service up and can it reach the database. Needs no key and shows no data."""
    try:
        _select("SELECT 1 AS ok")
        return {"status": "ok", "database": "connected", "read_only": True, "key_set": KEY_READY}
    except Exception:
        raise HTTPException(503, "The service is running but cannot reach the database.")


@app.get("/tables", tags=["data"], dependencies=[Depends(require_key)])
def list_tables():
    """Every table with its columns (name and type) and how many rows it has."""
    insp = inspect(engine)
    out = []
    for name in sorted(insp.get_table_names()):
        cols = [{"name": c["name"], "type": str(c["type"])} for c in insp.get_columns(name) if c["name"] not in HIDDEN_COLUMNS]
        out.append({"table": name, "rows": _select(f"SELECT COUNT(*) AS n FROM {_quote(name)}")[0]["n"], "columns": cols})
    return out


@app.get("/tables/{table}", tags=["data"], dependencies=[Depends(require_key)])
def read_table(table: str, request: Request, limit: int = 100, offset: int = 0, order_by: Optional[str] = None,
               desc: bool = False, columns: Optional[str] = None):
    """Rows of one table.

    - **limit** (1 - 1000, default 100) and **offset** page through it. `total` in the answer is
      the number of matching rows, so keep asking with a bigger offset until you have them all.
    - **order_by**=column and **desc**=true sort it (default: by id when the table has one).
    - **columns**=a,b,c returns only those columns.
    - Any other parameter is a filter on a column: `status=completed`, `project_id=12`,
      `progress_pct__gte=50`, `baseline_due_date__lt=2026-12-31`, `title__like=%report%`.
      Comparisons: `ne`, `gt`, `gte`, `lt`, `lte`, `like` (like ignores upper / lower case).
    - A value of `null` finds empty cells: `reviewer_id=null`, `reviewer_id__ne=null`.
    """
    cols = _columns(table)
    limit = max(1, min(MAX_LIMIT, limit))
    offset = max(0, offset)

    def known(name: str) -> str:
        if name not in cols:
            raise HTTPException(400, f'The table "{table}" has no column "{name}". Its columns: {", ".join(cols)}.')
        return name

    picked = [known(c.strip()) for c in columns.split(",") if c.strip()] if columns else list(cols)
    where, params = [], {}
    for i, (key, raw) in enumerate(request.query_params.multi_items()):
        if key in RESERVED:
            continue
        name, _, op = key.partition("__")
        if op not in OPERATORS:
            raise HTTPException(400, f'Unknown comparison "{op}" in "{key}". Use one of: {", ".join(o for o in OPERATORS if o)}.')
        column = _quote(known(name))
        if raw.lower() == "null" and op in ("", "ne"):
            where.append(f"{column} IS {'NOT ' if op else ''}NULL")
        elif op == "like":
            where.append(f"LOWER(CAST({column} AS TEXT)) LIKE :p{i}")
            params[f"p{i}"] = raw.lower()
        else:
            where.append(f"{column} {OPERATORS[op]} :p{i}")
            params[f"p{i}"] = _value(name, cols[name], raw)

    condition = f" WHERE {' AND '.join(where)}" if where else ""
    sort = known(order_by) if order_by else ("id" if "id" in cols else None)
    order = f" ORDER BY {_quote(sort)} {'DESC' if desc else 'ASC'}" if sort else ""
    source = f"FROM {_quote(table)}{condition}"
    total = _select(f"SELECT COUNT(*) AS n {source}", params)[0]["n"]
    rows = _select(f"SELECT {', '.join(_quote(c) for c in picked)} {source}{order} LIMIT :limit OFFSET :offset",
                   {**params, "limit": limit, "offset": offset})
    return jsonable_encoder({"table": table, "total": total, "limit": limit, "offset": offset, "columns": picked, "rows": rows})


@app.get("/tables/{table}/{row_id}", tags=["data"], dependencies=[Depends(require_key)])
def read_row(table: str, row_id: int):
    """One row by its id."""
    cols = _columns(table)
    if "id" not in cols:
        raise HTTPException(400, f'The table "{table}" has no id column. Filter it with GET /tables/{table} instead.')
    rows = _select(f"SELECT {', '.join(_quote(c) for c in cols)} FROM {_quote(table)} WHERE {_quote('id')} = :id", {"id": row_id})
    if not rows:
        raise HTTPException(404, f'No row with id {row_id} in "{table}".')
    return jsonable_encoder(rows[0])
