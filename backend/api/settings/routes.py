"""Settings por tenant — sem tema/densidade (removidos por design)."""
import json

from flask import Blueprint, request, jsonify

from extensions import db
from models import User, TenantSettings
from auth import require_auth
from api.deps import audit

bp = Blueprint("settings", __name__, url_prefix="/api/settings")

DEFAULT_SETTINGS = {
    "language": "pt-PT",
    "timezone": "Europe/Lisbon",
    "date_format": "DD/MM/YYYY",
    "channel": "email",
    "session_timeout": 30,
    "scan_profile": "owasp_top10",
    "scan_depth": "normal",
    "rate_limit": 50,
    "toggles": {
        "2fa": True, "ip-block": True, "new-device": True, "sso": False,
        "realtime": True, "daily": True, "scan-done": True, "integrations": False,
        "crawl": True, "auto-pdf": True,
    },
}

# Chaves antigas que já não pertencem ao modelo
DEPRECATED_KEYS = {"theme", "density"}


def _tenant_settings(tenant_id):
    ts = TenantSettings.query.filter_by(tenant_id=tenant_id).first()
    if not ts:
        ts = TenantSettings(tenant_id=tenant_id, settings_json=json.dumps(DEFAULT_SETTINGS))
        db.session.add(ts)
        db.session.commit()
    return ts


@bp.get("")
@require_auth
def get_settings():
    user = db.session.get(User, request.user_id)
    if not user or not user.tenant_id:
        return jsonify(DEFAULT_SETTINGS)

    ts = _tenant_settings(user.tenant_id)
    cur = ts.get() or {}

    # remove chaves deprecated que possam estar na BD
    cleaned = {k: v for k, v in cur.items() if k not in DEPRECATED_KEYS}

    return jsonify({
        **DEFAULT_SETTINGS,
        **cleaned,
        "toggles": {**DEFAULT_SETTINGS["toggles"], **cleaned.get("toggles", {})},
    })


@bp.put("")
@require_auth
def update_settings():
    user = db.session.get(User, request.user_id)
    if not user or not user.tenant_id:
        return jsonify({"error": "Tenant não encontrado."}), 404

    data = request.get_json(silent=True) or {}

    # ignora chaves deprecated
    data = {k: v for k, v in data.items() if k not in DEPRECATED_KEYS}

    ts = _tenant_settings(user.tenant_id)
    cur = ts.get() or {}

    merged = {
        **DEFAULT_SETTINGS,
        **cur,
        **{k: v for k, v in data.items() if k != "toggles"},
        "toggles": {
            **DEFAULT_SETTINGS["toggles"],
            **cur.get("toggles", {}),
            **data.get("toggles", {}),
        },
    }
    ts.set(merged)
    db.session.commit()
    audit("settings.update", keys=list(data.keys()))
    return jsonify(merged)


@bp.post("/reset")
@require_auth
def reset_settings():
    user = db.session.get(User, request.user_id)
    if not user or not user.tenant_id:
        return jsonify({"error": "Tenant não encontrado."}), 404

    ts = _tenant_settings(user.tenant_id)
    ts.set(DEFAULT_SETTINGS)
    db.session.commit()
    audit("settings.reset")
    return jsonify(DEFAULT_SETTINGS)