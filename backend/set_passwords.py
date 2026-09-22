from app.database import SessionLocal
from app import models
from app.security import get_password_hash

db = SessionLocal()
pw = get_password_hash("password123")
count = 0
for u in db.query(models.User).all():
    if not u.hashed_password:
        u.hashed_password = pw
        count += 1
        print(f"  → {u.email}")
db.commit()
print(f"✅ Updated {count} user(s)")
db.close()