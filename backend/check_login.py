from app.database import SessionLocal
from app import models
from app.security import verify_password, get_password_hash

db = SessionLocal()

print("=" * 60)
for u in db.query(models.User).all():
    hp = u.hashed_password
    print(f"{u.email:35} | hash exists: {bool(hp)} | len: {len(hp) if hp else 0}")

print("=" * 60)

target = db.query(models.User).filter(models.User.email == "bappynath2001@gmail.com").first()
if not target:
    print("❌ User not found!")
    db.close()
    exit()

print(f"Testing user: {target.email}")
print(f"Stored hash: {target.hashed_password[:30] if target.hashed_password else 'NONE'}...")

# চেষ্টা করি password123 verify করতে
try:
    ok = verify_password("password123", target.hashed_password)
    print(f"verify_password('password123'): {ok}")
except Exception as e:
    print(f"❌ verify exception: {type(e).__name__}: {e}")

# যদি ভেরিফাই ফেল করে, জোর করে নতুন পাসওয়ার্ড সেট করি
if not target.hashed_password or not verify_password("password123", target.hashed_password):
    print("→ Resetting password to 'password123' for ALL users...")
    pw = get_password_hash("password123")
    for u in db.query(models.User).all():
        u.hashed_password = pw
    db.commit()
    print("✅ Done. Try login again.")

db.close()