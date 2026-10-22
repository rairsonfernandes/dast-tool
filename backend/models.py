"""
SENTINEL — Models (SQLAlchemy)
Alinhado com schema.sql (PostgreSQL 14+) e com o código existente.

Compatibilidade:
- User.password       → alias para password_hash
- User.avatar         → alias para avatar_url
- Scan.url            → alias para target_url
- Scan.result         → coluna TEXT (JSON serializado)
- Vulnerability.cvss  → Float
- UserSession.ip      → alias para ip_address

Em produção use migrações (Flask-Migrate / Alembic). Não use db.create_all().
"""
from datetime import datetime, timezone
import json
import uuid

from sqlalchemy import Index, UniqueConstraint

from extensions import db


# ============================================================
# HELPERS
# ============================================================
def gen_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """UTC aware (à prova de deprecation em Python 3.12+)."""
    return datetime.now(timezone.utc)


# ============================================================
# TENANT
# ============================================================
class Tenant(db.Model):
    __tablename__ = "tenants"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    name = db.Column(db.String(120), nullable=False, default="Minha Organização")
    slug = db.Column(db.String(80), unique=True, nullable=True, index=True)
    plan = db.Column(db.String(32), nullable=False, default="free")
    max_users = db.Column(db.Integer, nullable=False, default=1)
    max_scans_per_month = db.Column(db.Integer, nullable=False, default=3)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "plan": self.plan,
            "max_users": self.max_users,
            "max_scans_per_month": self.max_scans_per_month,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# USER
# ============================================================
class User(db.Model):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        Index("idx_users_email", "email"),
        Index("idx_users_provider", "provider", "provider_id"),
    )

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    tenant_id = db.Column(
        db.String(36),
        db.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        default="00000000-0000-0000-0000-000000000001",
    )
    email = db.Column(db.String(255), nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    name = db.Column(db.String(120), nullable=True)
    role = db.Column(db.String(32), nullable=False, default="ANALYST")
    phone = db.Column(db.String(32), nullable=True)
    department = db.Column(db.String(120), nullable=True)
    job_title = db.Column(db.String(120), nullable=True)
    provider = db.Column(db.String(32), nullable=True)
    provider_id = db.Column(db.String(255), nullable=True)
    avatar_url = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    scans = db.relationship("Scan", backref="user", cascade="all, delete-orphan", lazy="dynamic")
    reports = db.relationship("Report", backref="user", cascade="all, delete-orphan", lazy="dynamic")
    sessions = db.relationship("UserSession", backref="user", cascade="all, delete-orphan", lazy="dynamic")
    api_keys = db.relationship("ApiKey", backref="user", cascade="all, delete-orphan", lazy="dynamic")

    # --- Compatibilidade ---
    @property
    def password(self):
        return self.password_hash

    @password.setter
    def password(self, value):
        self.password_hash = value

    @property
    def avatar(self):
        return self.avatar_url

    @avatar.setter
    def avatar(self, value):
        self.avatar_url = value

    @property
    def is_admin(self) -> bool:
        return self.role in ("SUPER_ADMIN", "ADMIN")

    def to_dict(self):
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "phone": self.phone,
            "department": self.department,
            "job_title": self.job_title,
            "provider": self.provider,
            "avatar": self.avatar_url,
            "avatar_url": self.avatar_url,
            "is_active": self.is_active,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# SCAN
# ============================================================
class Scan(db.Model):
    __tablename__ = "scans"
    __table_args__ = (
        Index("idx_scans_status", "status"),
        Index("idx_scans_created", "tenant_id", "created_at"),
    )

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    tenant_id = db.Column(
        db.String(36),
        db.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        default="00000000-0000-0000-0000-000000000001",
    )
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_url = db.Column(db.String(2048), nullable=False)
    profile = db.Column(db.String(32), nullable=False, default="owasp_top10")
    status = db.Column(db.String(32), nullable=False, default="queued")
    score = db.Column(db.Integer, nullable=True)
    progress = db.Column(db.Integer, nullable=False, default=0)
    error_message = db.Column(db.Text, nullable=True)
    result = db.Column(db.Text, nullable=True)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    duration_seconds = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    vulnerabilities = db.relationship(
        "Vulnerability",
        backref="scan",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    @property
    def url(self):
        return self.target_url

    @url.setter
    def url(self, value):
        self.target_url = value

    def to_dict(self):
        parsed_result = None
        if self.result:
            try:
                parsed_result = json.loads(self.result)
            except Exception:
                parsed_result = None

        return {
            "id": self.id,
            "user_id": self.user_id,
            "tenant_id": self.tenant_id,
            "target_url": self.target_url,
            "url": self.target_url,
            "profile": self.profile,
            "status": self.status,
            "score": self.score,
            "progress": self.progress,
            "result": parsed_result,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# VULNERABILITY
# ============================================================
class Vulnerability(db.Model):
    __tablename__ = "vulnerabilities"
    __table_args__ = (
        Index("idx_vulns_severity", "tenant_id", "severity"),
        Index("idx_vulns_status", "tenant_id", "status"),
    )

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    tenant_id = db.Column(
        db.String(36),
        db.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        default="00000000-0000-0000-0000-000000000001",
    )
    scan_id = db.Column(
        db.String(36),
        db.ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    severity = db.Column(db.String(16), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    cwe = db.Column(db.String(32), nullable=True)
    cvss = db.Column(db.Float, nullable=True)
    description = db.Column(db.Text, nullable=True)
    evidence = db.Column(db.Text, nullable=True)
    remediation = db.Column(db.Text, nullable=True)
    affected_url = db.Column(db.String(2048), nullable=True)
    status = db.Column(db.String(32), nullable=False, default="pending")
    discovered_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    fixed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "scan_id": self.scan_id,
            "tenant_id": self.tenant_id,
            "severity": self.severity,
            "title": self.title,
            "cwe": self.cwe,
            "cvss": self.cvss,
            "description": self.description,
            "evidence": self.evidence,
            "remediation": self.remediation,
            "affected_url": self.affected_url,
            "status": self.status,
            "discovered_at": self.discovered_at.isoformat() if self.discovered_at else None,
            "fixed_at": self.fixed_at.isoformat() if self.fixed_at else None,
        }


# ============================================================
# REPORT
# ============================================================
class Report(db.Model):
    __tablename__ = "reports"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    tenant_id = db.Column(
        db.String(36),
        db.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        default="00000000-0000-0000-0000-000000000001",
    )
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scan_id = db.Column(
        db.String(36),
        db.ForeignKey("scans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(32), nullable=False, default="executive")
    format = db.Column(db.String(8), nullable=False, default="pdf")
    file_path = db.Column(db.Text, nullable=True)
    file_size_bytes = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(16), nullable=False, default="generating")
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "scan_id": self.scan_id,
            "name": self.name,
            "type": self.type,
            "format": self.format,
            "file_size_bytes": self.file_size_bytes,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# PASSWORD RESET TOKEN
# ============================================================
class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    tenant_id = db.Column(
        db.String(36),
        db.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        default="00000000-0000-0000-0000-000000000001",
    )
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = db.Column(db.String(255), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)


# ============================================================
# AUDIT LOG
# ============================================================
class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    tenant_id = db.Column(db.String(36), nullable=True, index=True)
    user_id = db.Column(db.String(36), nullable=True, index=True)
    action = db.Column(db.String(80), nullable=False, index=True)
    level = db.Column(db.String(16), nullable=False, default="INFO", index=True)
    resource_type = db.Column(db.String(80), nullable=True)
    resource_id = db.Column(db.String(36), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    metadata_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def to_dict(self):
        try:
            meta = json.loads(self.metadata_json or "{}")
        except Exception:
            meta = {}
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "action": self.action,
            "level": self.level,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "metadata": meta,
            "message": self.action,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# THREAT EVENT
# ============================================================
class ThreatEvent(db.Model):
    __tablename__ = "threat_events"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    tenant_id = db.Column(db.String(36), nullable=False, index=True)
    source_ip = db.Column(db.String(45), nullable=True)
    kind = db.Column(db.String(64), nullable=True)
    metadata_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def to_dict(self):
        try:
            metadata = json.loads(self.metadata_json or "{}")
        except Exception:
            metadata = {}
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "source_ip": self.source_ip,
            "kind": self.kind,
            "metadata": metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# HOST METRIC
# ============================================================
class HostMetric(db.Model):
    __tablename__ = "host_metrics"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    tenant_id = db.Column(db.String(36), nullable=False, index=True)
    hostname = db.Column(db.String(255), nullable=True)
    cpu = db.Column(db.Integer, nullable=True)
    ram = db.Column(db.Integer, nullable=True)
    disk = db.Column(db.Integer, nullable=True)
    network = db.Column(db.Integer, nullable=True)
    region = db.Column(db.String(64), nullable=True)
    version = db.Column(db.String(32), nullable=True)
    uptime_days = db.Column(db.Integer, nullable=True)
    last_backup_at = db.Column(db.DateTime(timezone=True), nullable=True)
    recorded_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def to_dict(self):
        return {
            "cpu": self.cpu,
            "ram": self.ram,
            "disk": self.disk,
            "network": self.network,
            "region": self.region,
            "version": self.version,
            "uptime_days": self.uptime_days,
            "last_backup": self.last_backup_at.strftime("há %Hh") if self.last_backup_at else "—",
        }


# ============================================================
# USER SESSION
# ============================================================
class UserSession(db.Model):
    __tablename__ = "user_sessions"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id = db.Column(db.String(36), nullable=True, index=True)
    device = db.Column(db.String(255), nullable=True)
    location = db.Column(db.String(255), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    is_current = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    last_active_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)

    @property
    def ip(self):
        return self.ip_address

    @ip.setter
    def ip(self, value):
        self.ip_address = value

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "device": self.device,
            "location": self.location,
            "ip_address": self.ip_address,
            "ip": self.ip_address,
            "user_agent": self.user_agent,
            "is_current": self.is_current,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_active_at": self.last_active_at.isoformat() if self.last_active_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
        }


# ============================================================
# API KEY
# ============================================================
class ApiKey(db.Model):
    __tablename__ = "api_keys"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id = db.Column(db.String(36), nullable=True, index=True)
    name = db.Column(db.String(120), nullable=False)
    key_prefix = db.Column(db.String(16), nullable=False, default="sk_live_")
    key_hash = db.Column(db.String(255), nullable=False, unique=True, index=True)
    key_last_chars = db.Column(db.String(8), nullable=False, default="0000")
    permissions = db.Column(db.String(32), nullable=False, default="read")
    last_used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "tenant_id": self.tenant_id,
            "name": self.name,
            "key_prefix": self.key_prefix,
            "key_last_chars": self.key_last_chars,
            "key_preview": f"{self.key_prefix}{'•' * 16}{self.key_last_chars}",
            "permissions": self.permissions,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
        }


# ============================================================
# TENANT SETTINGS
# ============================================================
class TenantSettings(db.Model):
    __tablename__ = "tenant_settings"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    tenant_id = db.Column(
        db.String(36),
        db.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    settings_json = db.Column(db.Text, nullable=False, default="{}")
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def get(self) -> dict:
        try:
            return json.loads(self.settings_json or "{}")
        except Exception:
            return {}

    def set(self, data: dict) -> None:
        self.settings_json = json.dumps(data or {})

    def to_dict(self):
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "settings": self.get(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }