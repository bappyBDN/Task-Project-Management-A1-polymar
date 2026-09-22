"""Quick standalone test: sends one plain test email to verify your Gmail
SMTP setup (GMAIL_USER / GMAIL_APP_PASSWORD in .env) actually works.

Run from your project root:
    python test_send_email.py
"""
from app.email_service import _send

TEST_RECIPIENT = "bappynath2001@gmail.com"

if __name__ == "__main__":
    ok = _send(
        to_addrs=[TEST_RECIPIENT],
        subject="Test Email — Anwar Task Manager",
        html_body="<h2>✅ এটা একটা টেস্ট মেইল</h2><p>Gmail SMTP ঠিকমতো কাজ করছে।</p>",
        text_body="এটা একটা টেস্ট মেইল। Gmail SMTP ঠিকমতো কাজ করছে।",
    )
    print("Email sent successfully!" if ok else "Email FAILED — check logs / .env values above.")
