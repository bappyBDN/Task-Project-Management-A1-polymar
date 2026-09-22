"""Database engine setup.

Reads DATABASE_URL from .env (via app.config.settings). For Postgres/Neon we
force the modern `psycopg` (v3) driver, which understands libpq-style query
parameters (sslmode=require, channel_binding=require) directly from the URL —
no manual SSL context needed, unlike the older pg8000 driver.
"""
import re

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

DATABASE_URL = settings.database_url
connect_args = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # postgresql://...  or  postgresql+pg8000://...  ->  postgresql+psycopg://...
    DATABASE_URL = re.sub(r"^postgresql(\+\w+)?:", "postgresql+psycopg:", DATABASE_URL)

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()