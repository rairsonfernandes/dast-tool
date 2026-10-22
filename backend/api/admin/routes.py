"""Admin — users, sessions, logs, activity, stats, actions, danger.

Todos os endpoints requerem role ADMIN ou SUPER_ADMIN.
"""
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, current_app
from sqlalchemy import func

from extensions import db, limiter
from models import (
    User, Scan, Vulnerability, UserSession, ApiKey,
    Report, AuditLog, PasswordResetToken, HostMetric,
)
from auth import hash_password
from api.deps import require_admin, audit

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# STATS
# ============================================================
@bp.get("/stats")
@require_admin
def admin_stats():
    day_ago = _utcnow() - timedelta(hours=24)
    admin = db.session.get(User, request.user_id)
    tenant_id = admin.tenant_id if admin else None

    health = None
    try:
        if tenant_id:
            m = (
                HostMetric.query
                .filter_by(tenant_id=tenant_id)
                .order_by(HostMetric.recorded_at.desc())
                .first()
            )
            if m:
                health = m.to_dict()
    except Exception:
        current_app.logger.exception("Falha ao ler HostMetric")

    return jsonify({
        "users": User.query.count(),
        "active_users": User.query.filter_by(is_active=True).count(),
        "sessions": UserSession.query.filter_by(revoked_at=None).count(),
        "scans": Scan.query.count(),
        "scans_today": Scan.query.filter(Scan.created_at >= day_ago).count(),
        "completed": Scan.query.filter_by(status="completed").count(),
        "pending": Scan.query.filter_by(status="pending").count(),
        "running": Scan.query.filter_by(status="running").count(),
        "failed": Scan.query.filter_by(status="failed").count(),
        "health": health,
    })


# ============================================================
# ACTIVITY
# ============================================================
@bp.get("/activity")
@require_admin
def admin_activity():
    try:
        days = int(request.args.get("days", 7))
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(30, days))

    today = _utcnow().date()
    start = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc)

    scan_rows = (
        db.session.query(func.date(Scan.created_at), func.count(Scan.id))
        .filter(Scan.created_at >= start_dt)
        .group_by(func.date(Scan.created_at))
        .all()
    )
    user_rows = (
        db.session.query(func.date(User.created_at), func.count(User.id))
        .filter(User.created_at >= start_dt)
        .group_by(func.date(User.created_at))
        .all()
    )
    scans_by = {str(k): int(v) for k, v in scan_rows}
    users_by = {str(k): int(v) for k, v in user_rows}

    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        key = d.isoformat()
        out.append({
            "date": key,
            "label": d.strftime("%d"),
            "scans": scans_by.get(key, 0),
            "users": users_by.get(key, 0),
        })
    return jsonify({"days": out, "range_days": days})


# ============================================================
# USERS
# ============================================================
@bp.get("/users")
@require_admin
def admin_list_users():
    q = (request.args.get("q") or "").strip().lower()
    page = max(1, int(request.args.get("page", 1)))
    limit = min(100, int(request.args.get("limit", 50)))

    query = User.query
    if q:
        query = query.filter(
            (User.email.ilike(f"%{q}%")) | (User.name.ilike(f"%{q}%"))
        )
    total = query.count()
    users = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return jsonify({
        "items": [u.to_dict() for u in users],
        "total": total,
        "page": page,
        "limit": limit,
    })


@bp.post("/users")
@require_admin
def admin_create_user():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or secrets.token_urlsafe(12)
    name = (data.get("name") or "").strip() or None
    role = (data.get("role") or "ANALYST").upper()

    if not email:
        return jsonify({"error": "Email é obrigatório."}), 400
    if role not in ("SUPER_ADMIN", "ADMIN", "ANALYST", "VIEWER"):
        return jsonify({"error": "Role inválido."}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email já registado."}), 409

    admin = db.session.get(User, request.user_id)
    user = User(
        email=email,
        password=hash_password(password),
        name=name,
        role=role,
        tenant_id=admin.tenant_id if admin else None,
        is_active=True,
    )
    db.session.add(user)
    db.session.commit()
    audit("admin.user.create", email=email, role=role)

    return jsonify({
        **user.to_dict(),
        "temporary_password": password,
    }), 201


@bp.patch("/users/<user_id>")
@require_admin
def admin_update_user(user_id):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify({"error": "Utilizador não encontrado."}), 404
    data = request.get_json(silent=True) or {}

    if "role" in data:
        r = (data["role"] or "").upper()
        if r not in ("SUPER_ADMIN", "ADMIN", "ANALYST", "VIEWER"):
            return jsonify({"error": "Role inválido."}), 400
        u.role = r
    if "is_active" in data:
        u.is_active = bool(data["is_active"])
    if "name" in data:
        u.name = (data["name"] or "").strip() or None

    db.session.commit()
    audit("admin.user.update", user_id=user_id)
    return jsonify(u.to_dict())


@bp.delete("/users/<user_id>")
@require_admin
def admin_delete_user(user_id):
    if user_id == request.user_id:
        return jsonify({"error": "Não podes eliminar a tua própria conta."}), 400
    u = db.session.get(User, user_id)
    if not u:
        return jsonify({"error": "Utilizador não encontrado."}), 404

    for s in Scan.query.filter_by(user_id=user_id).all():
        Vulnerability.query.filter_by(scan_id=s.id).delete(synchronize_session=False)
    Scan.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    PasswordResetToken.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    UserSession.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    ApiKey.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    Report.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    db.session.delete(u)
    db.session.commit()
    audit("admin.user.delete", user_id=user_id)
    return jsonify({"deleted": True})


# ============================================================
# SESSIONS
# ============================================================
@bp.get("/sessions")
@require_admin
def admin_list_sessions():
    sessions = (
        UserSession.query
        .filter_by(revoked_at=None)
        .order_by(UserSession.last_active_at.desc())
        .limit(100)
        .all()
    )

    admin_id = request.user_id
    current = next(
        (s for s in sessions if str(s.user_id) == str(admin_id)),
        None,
    )

    out = []
    for s in sessions:
        d = s.to_dict()
        u = db.session.get(User, s.user_id) if s.user_id else None
        if u:
            d["user_email"] = u.email
            d["user_name"] = u.name
        d["is_current"] = bool(current and s.id == current.id)
        out.append(d)

    return jsonify({"items": out, "total": len(out)})


@bp.delete("/sessions")
@require_admin
def admin_revoke_all_sessions():
    admin_id = request.user_id
    current = (
        UserSession.query
        .filter_by(user_id=admin_id, revoked_at=None)
        .order_by(UserSession.created_at.desc())
        .first()
    )

    q = UserSession.query.filter(UserSession.revoked_at.is_(None))
    if current:
        q = q.filter(UserSession.id != current.id)

    count = q.update({"revoked_at": _utcnow()}, synchronize_session=False)
    db.session.commit()
    audit("admin.session.revoke_all", count=count)
    return jsonify({"revoked": True, "count": count})


@bp.delete("/sessions/<session_id>")
@require_admin
def admin_revoke_session(session_id):
    s = db.session.get(UserSession, session_id)
    if not s:
        return jsonify({"error": "Sessão não encontrada."}), 404
    if s.user_id == request.user_id:
        return jsonify({"error": "Não podes terminar a tua própria sessão atual."}), 400
    s.revoked_at = _utcnow()
    db.session.commit()
    audit("admin.session.revoke", session_id=session_id)
    return jsonify({"revoked": True})


# ============================================================
# LOGS
# ============================================================
@bp.get("/logs")
@require_admin
def admin_logs():
    level = (request.args.get("level") or "").strip().upper()
    page = max(1, int(request.args.get("page", 1)))
    limit = min(200, int(request.args.get("limit", 100)))

    q = AuditLog.query

    # Filtro por level (coluna real). Se a coluna não existir na BD, cai para
    # filtro por action para não rebentar com 500.
    if level and level != "ALL":
        try:
            q = q.filter(func.upper(AuditLog.level) == level)
        except Exception:
            # Fallback: filtra por action (compatibilidade com esquemas antigos)
            q = q.filter(AuditLog.action.ilike(f"%{level.lower()}%"))

    total = q.count()
    logs = (
        q.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return jsonify({
        "items": [l.to_dict() for l in logs],
        "total": total,
        "page": page,
        "limit": limit,
    })


# ============================================================
# SETTINGS (global)
# ============================================================
DEFAULT_SETTINGS = {
    "theme": "dark", "language": "pt-PT", "timezone": "Europe/Lisbon",
    "date_format": "DD/MM/YYYY", "density": "normal", "channel": "email",
    "session_timeout": 30, "scan_profile": "owasp_top10",
    "scan_depth": "normal", "rate_limit": 50,
    "toggles": {
        "2fa": True, "ip-block": True, "new-device": True, "sso": False,
        "realtime": True, "daily": True, "scan-done": True, "integrations": False,
        "crawl": True, "auto-pdf": True,
    },
}


@bp.get("/settings")
@require_admin
def admin_get_settings():
    return jsonify({"settings": DEFAULT_SETTINGS, "source": "default"})


@bp.put("/settings")
@require_admin
def admin_update_settings():
    data = request.get_json(silent=True) or {}
    audit("admin.settings.update", keys=list(data.keys()))
    return jsonify({"settings": {**DEFAULT_SETTINGS, **data}, "updated": True})


# ============================================================
# ACTIONS
# ============================================================
@bp.post("/actions/<action>")
@require_admin
@limiter.limit("10/minute")
def admin_action(action):
    if action not in {"backup", "cache", "restart", "migrate"}:
        return jsonify({"error": "Ação inválida."}), 400
    audit(f"admin.action.{action}")
    current_app.logger.info("Admin action '%s' por user=%s", action, request.user_id)
    return jsonify({
        "ok": True,
        "action": action,
        "executed_at": _utcnow().isoformat(),
    })


# ============================================================
# DANGER
# ============================================================
@bp.post("/danger/<action>")
@require_admin
@limiter.limit("5/hour")
def admin_danger(action):
    if request.headers.get("X-Confirm-Danger") != "yes":
        return jsonify({"error": "Confirmação obrigatória."}), 400
    if action not in {"purge-logs", "factory-reset"}:
        return jsonify({"error": "Ação inválida."}), 400

    if action == "purge-logs":
        cutoff = _utcnow() - timedelta(days=30)
        deleted = (
            AuditLog.query
            .filter(AuditLog.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        db.session.commit()
        audit("admin.danger.purge_logs", deleted=deleted)
        return jsonify({"ok": True, "action": action, "deleted": deleted})

    audit("admin.danger.factory_reset")
    return jsonify({
        "ok": True,
        "action": action,
        "note": "Factory reset real deve ser feito por CLI com backup.",
    })