from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Anwar Group Enterprise Task & Project Management System"
    database_url: str = "sqlite:///./anwar_task_manager.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    frontend_url: str = "http://localhost:5173"          # 👈 এটা যোগ করুন

    # ---------------------------------------------------------------- Email (Gmail SMTP)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 465
    gmail_user: str = ""
    gmail_app_password: str = ""
    smtp_timeout_seconds: int = 120
    mail_allowed_recipients: str = ""
    mail_enabled: bool = True

    run_scheduler_in_process: bool = True
    email_scan_interval_minutes: int = 60
    task_due_lookahead_days: int = 3
    backlog_stale_days: int = 7

    class Config:
        env_file = ".env"

    @property                                              # 👈 এটা যোগ করুন
    def mail_allowed_list(self) -> list[str]:
        return [e.strip().lower() for e in self.mail_allowed_recipients.split(",") if e.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()