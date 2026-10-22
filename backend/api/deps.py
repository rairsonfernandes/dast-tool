"""Dependências partilhadas (auth, audit)."""
from functools import wraps
import json
import logging

from flask import request, jsonify

from extensions import db
from models import User, AuditLog
from auth import require_auth

log = logging.getLogger("api.deps")

__all__ = ["require_auth", "require_admin", "audit"]


# ============================================================
# AUTH
# ============================================================
def require_admin(f):
    @wraps(f)
    @require_auth
    def wrapper(*args, **kwargs):
        user = db.session.get(User, request.user_id)
        if not user or user.role not in ("ADMIN", "SUPER_ADMIN"):
            return jsonify({"error": "Sem permissão."}), 403
        return f(*args, **kwargs)
    return wrapper


# ============================================================
# AUDIT
# ============================================================
def audit(action: str, **metadata) -> None:
    """
    Regista uma ação no AuditLog (best-effort).

    - Nunca rebenta o request.
    - Se falhar, faz rollback e loga WARNING com traceback.
    - Preenche tenant_id/user_id/ip/user_agent automaticamente.
    """
    try:
        user_id = getattr(request, "user_id", None)
        user = db.session.get(User, user_id) if user_id else None

        entry = AuditLog(
            tenant_id=(user.tenant_id if user else None),
            user_id=user_id,
            action=(action or "system")[:80],
            resource_type=metadata.pop("resource_type", None),
            resource_id=metadata.pop("resource_id", None),
            ip_address=(request.remote_addr or None),
            user_agent=(request.headers.get("User-Agent") or "")[:512] or None,
            metadata_json=json.dumps(metadata, default=str) if metadata else "{}",
        )
        db.session.add(entry)
        db.session.commit()
    except Exception:
        # log.warning para o erro aparecer em produção/dev
        log.warning("AuditLog falhou: action=%s", action, exc_info=True)
        try:
            db.session.rollback()
        except Exception:
            pass



            # Em api/deps.py
def audit(action: str, **metadata):
    import json
    from models import AuditLog
    from flask import request
    try:
        user_id = getattr(request, "user_id", None)
        user = db.session.get(User, user_id) if user_id else None
        entry = AuditLog(
            tenant_id=(user.tenant_id if user else None),
            user_id=user_id,
            action=action,
            metadata_json=json.dumps(metadata, default=str),
        )
        db.session.add(entry)
        db.session.commit()
    except Exception as e:
        log.warning("AuditLog falhou: %s", e, exc_info=True)
        db.session.rollback()