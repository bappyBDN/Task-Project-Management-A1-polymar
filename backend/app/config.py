from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Anwar Group Enterprise Task & Project Management System"

    # Fallback only — used when DATABASE_URL isn't set in .env / Dokploy env vars.
    # In production this is always overridden by the real Neon connection string.
    database_url: str = "sqlite:///./anwar_task_manager.db"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # The real, public URL of the frontend — used to build links that go INTO
    # emails (password reset, etc.), where a browser will actually click them.
    # Set FRONTEND_URL in .env / Dokploy env vars for each environment, e.g.
    #   FRONTEND_URL=https://projectflow.a1polymer.net
    # Falls back to localhost only for local development.
    frontend_url: str = "http://localhost:5173"

    # ---------------------------------------------------------------- Email (Gmail SMTP)
    # Set these in a .env file — never hardcode credentials in source.
    #   GMAIL_USER=youraddress@gmail.com
    #   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx      <- 16-char Google App Password
    #   MAIL_ENABLED=true
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 465
    gmail_user: str = ""
    gmail_app_password: str = ""
    smtp_timeout_seconds: int = 120

    # Optional TEST MODE: comma-separated emails. When set, only these
    # addresses ever actually receive mail — everyone else is silently
    # skipped (logged, not sent). Leave empty in production so real users get mail.
    mail_allowed_recipients: str = ""

    mail_enabled: bool = True

    # In the 4-container Docker setup, a separate `scheduler` service runs the
    # email scan on its own — set this to False on the backend web container
    # so the job never runs in two places at once (which would double-send
    # emails). Defaults to True for the simple single-process (non-Docker) setup.
    run_scheduler_in_process: bool = True

    # How often the background job re-scans tasks/backlog for emails.
    email_scan_interval_minutes: int = 60
    # A task due within this many days also gets a "due soon" reminder.
    task_due_lookahead_days: int = 3
    # A backlog item open this many days without conversion triggers a reminder.
    backlog_stale_days: int = 7

    class Config:
        env_file = ".env"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def mail_allowed_list(self) -> list[str]:
        return [e.strip().lower() for e in self.mail_allowed_recipients.split(",") if e.strip()]


settings = Settings()