# config.py — versão final
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DEFAULT_SQLITE = f"sqlite:///{(BASE_DIR / 'sentinel.db').as_posix()}"


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _int(value: str | None, default: int) -> int:
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _list(value: str | None, default: str = "") -> list[str]:
    raw = value if value is not None else default
    return [item.strip() for item in raw.split(",") if item.strip()]


class Config:
    # ---------- CORE ----------
    SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-me")
    JWT_EXPIRY_DAYS = _int(os.getenv("JWT_EXPIRY_DAYS"), 7)
    JWT_ALGORITHM = "HS256"

    # ---------- DB ----------
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///sentinel.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "pool_size": _int(os.getenv("DB_POOL_SIZE"), 10),
        "max_overflow": _int(os.getenv("DB_MAX_OVERFLOW"), 20),
        "pool_timeout": _int(os.getenv("DB_POOL_TIMEOUT"), 30),
    }
    if SQLALCHEMY_DATABASE_URI.startswith("sqlite"):
        SQLALCHEMY_ENGINE_OPTIONS = {
            "pool_pre_ping": True,
            "connect_args": {"check_same_thread": False},
        }

    # ---------- CORS ----------
    CORS_ORIGINS = _list(os.getenv("CORS_ORIGINS"), default="http://localhost:5173")

    # ---------- RATE LIMIT ----------
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True
    RATELIMIT_SWALLOW_ERRORS = True

    # ---------- APP ----------
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    RESET_TOKEN_EXPIRY_MINUTES = _int(os.getenv("RESET_TOKEN_EXPIRY_MINUTES"), 30)
    MAX_CONTENT_LENGTH = _int(os.getenv("MAX_CONTENT_LENGTH"), 2 * 1024 * 1024)
    JSON_SORT_KEYS = False
    JSONIFY_PRETTYPRINT_REGULAR = os.getenv("FLASK_ENV") != "production"

    # ---------- SESSÃO / COOKIES ----------
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.getenv("FLASK_ENV") == "production"
    PERMANENT_SESSION_LIFETIME = timedelta(days=JWT_EXPIRY_DAYS)

    # ---------- PROXY ----------
    TRUSTED_PROXIES = _int(os.getenv("TRUSTED_PROXIES"), 0)

    # ---------- MULTI-TENANCY ----------
    DEFAULT_TENANT_ID = os.getenv(
        "DEFAULT_TENANT_ID", "00000000-0000-0000-0000-000000000001"
    )

    # ---------- OAUTH: GOOGLE ----------
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI = os.getenv(
        "GOOGLE_REDIRECT_URI",
        "http://localhost:5000/api/auth/google/callback",
    )

    # ---------- OAUTH: GITHUB ----------
    GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
    GITHUB_REDIRECT_URI = os.getenv(
        "GITHUB_REDIRECT_URI",
        "http://localhost:5000/api/auth/github/callback",
    )

    # ---------- SMTP ----------
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = _int(os.getenv("SMTP_PORT"), 587)
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASS = os.getenv("SMTP_PASS", "")
    SMTP_USE_TLS = _bool(os.getenv("SMTP_USE_TLS"), True)
    SMTP_FROM = os.getenv("SMTP_FROM", "SENTINEL <no-reply@sentinel.sec>")

    # ---------- SCANNER ----------
    SCANNER_MODE = os.getenv("SCANNER_MODE", "mock").lower()
    SCANNER_MIN_CONFIDENCE = os.getenv("SCANNER_MIN_CONFIDENCE", "firm")
    SCANNER_RATE_LIMIT = _int(os.getenv("SCANNER_RATE_LIMIT"), 10)
    SCANNER_TIMEOUT = _int(os.getenv("SCANNER_TIMEOUT"), 10)
    SCANNER_MAX_PAGES = _int(os.getenv("SCANNER_MAX_PAGES"), 100)
    SCANNER_MAX_DEPTH = _int(os.getenv("SCANNER_MAX_DEPTH"), 3)
    SCANNER_CONCURRENCY = _int(os.getenv("SCANNER_CONCURRENCY"), 5)

    # ---------- FEATURE FLAGS ----------
    ENABLE_OAUTH = _bool(os.getenv("ENABLE_OAUTH"), True)
    ENABLE_REGISTRATION = _bool(os.getenv("ENABLE_REGISTRATION"), True)

    # ---------- SEED ----------
    SEED_ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@sentinel.sec")
    SEED_ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "ChangeMe!2026")
    SEED_ADMIN_NAME = os.getenv("SEED_ADMIN_NAME", "Administrator")
    SEED_TENANT_NAME = os.getenv("SEED_TENANT_NAME", "Sentinel Default")
    SEED_TENANT_SLUG = os.getenv("SEED_TENANT_SLUG", "sentinel")
    SEED_TENANT_PLAN = os.getenv("SEED_TENANT_PLAN", "enterprise")


class ProductionConfig(Config):
    SESSION_COOKIE_SECURE = True
    JSONIFY_PRETTYPRINT_REGULAR = False

    @classmethod
    def validate(cls) -> None:
        errors: list[str] = []

        secret = cls.SECRET_KEY
        if not secret or secret in ("dev-secret-change-me", "change-me", ""):
            errors.append("JWT_SECRET é obrigatório e não pode ser o default.")
        elif len(secret) < 32:
            errors.append("JWT_SECRET deve ter pelo menos 32 caracteres.")

        uri = cls.SQLALCHEMY_DATABASE_URI or ""
        if not uri.startswith(("postgresql", "postgres")):
            errors.append(
                f"DATABASE_URL deve ser PostgreSQL em produção (atual: {uri.split(':')[0]})."
            )

        if not cls.RATELIMIT_STORAGE_URI.startswith("redis"):
            errors.append("RATELIMIT_STORAGE_URI deve ser redis:// em produção.")

        if "localhost" in cls.FRONTEND_URL or "127.0.0.1" in cls.FRONTEND_URL:
            errors.append(f"FRONTEND_URL aponta para localhost: {cls.FRONTEND_URL}")

        if errors:
            raise RuntimeError(
                "Config inválida para produção:\n  - " + "\n  - ".join(errors)
            )


def get_config() -> type[Config]:
    env = os.getenv("FLASK_ENV", "development").lower()
    if env == "production":
        ProductionConfig.validate()
        return ProductionConfig
    return Config