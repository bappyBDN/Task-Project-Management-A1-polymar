"""Seed data. Idempotent — skips if data already exists.

Deliberately minimal: only the one admin account plus the dropdown master
data (category / task_type / priority / status) the UI needs to function.
No companies, projects, or dummy users — the admin creates everything else
from the Admin Panel from here on.
"""
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.database import SessionLocal, engine, Base
from app import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str):
    return pwd_context.hash(password)


_LIST_OPTIONS = {
    "category": [
        "strategic", "project", "operational", "management_action", "compliance",
        "audit", "digital_transformation", "process_improvement", "technology",
        "finance", "procurement", "hr", "sales", "marketing", "supply_chain",
        "manufacturing", "maintenance", "commercial", "legal", "administration",
        "risk", "sustainability", "other",
    ],
    "task_type": [
        "task", "subtask", "action", "issue", "change", "bug", "approval",
        "review", "decision_followup", "compliance_action",
    ],
    "priority": ["low", "medium", "high", "critical"],
    "status": [
        "draft", "backlog", "ready", "in_progress", "in_review", "completed",
        "closed", "blocked", "on_hold", "cancelled",
    ],
}


def _seed_list_options(db: Session):
    existing = {
        (row.kind, row.value)
        for row in db.query(models.ListOption.kind, models.ListOption.value).all()
    }
    for kind, values in _LIST_OPTIONS.items():
        for v in values:
            if (kind, v) not in existing:
                db.add(models.ListOption(kind=kind, value=v))
    db.commit()


def seed(db: Session):
    if db.query(models.User).count() > 0:
        print("Data already exists. Skipping seed.")
        return

    _seed_list_options(db)

    db.add(models.User(
        employee_id="ADMIN-001",
        name="Bappy Chandra Debnath",
        email="bappynath2001@gmail.com",
        designation="Platform Admin",
        role="admin",
        hashed_password=get_password_hash("123abc123"),
        is_active=True,
    ))
    db.commit()


if __name__ == "__main__":
    print("⏳ Creating database tables...")
    Base.metadata.create_all(bind=engine)

    db_session = SessionLocal()
    try:
        print("🌱 Seeding data...")
        seed(db_session)
        print("✅ Seeding completed successfully!")
    except Exception as e:
        db_session.rollback()
        print(f"❌ Error during seeding: {e}")
    finally:
        db_session.close()