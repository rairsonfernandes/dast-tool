"""Forgot / Reset / Change password."""
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify

from extensions import db, limiter
from models import User, PasswordResetToken
from auth import (
    hash_password, verify_password, require_auth,
    generate_reset_token, hash_reset_token,
)
from email_service import send_password_reset
from config import Config

bp = Blueprint("auth_password", __name__, url_prefix="/api/auth")


def _validate_password(password: str) -> tuple[bool, str]:
    if not password:
        return False, "Password obrigatória."
    if len(password) < 8:
        return False, "A password deve ter pelo menos 8 caracteres."
    if len(password) > 128:
        return False, "A password não pode ter mais de 128 caracteres."
    return True, ""


# ============================================================
# FORGOT — envia email com link
# ============================================================
@bp.post("/forgot-password")
@limiter.limit("5/hour")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Introduz o teu email."}), 400

    user = User.query.filter_by(email=email).first()
    resp = {"ok": True}

    if user and user.password is not None:
        raw, h = generate_reset_token()
        reset = PasswordResetToken(
            user_id=user.id,
            tenant_id=user.tenant_id,
            token_hash=h,
            expires_at=datetime.now(timezone.utc) + timedelta(
                minutes=Config.RESET_TOKEN_EXPIRY_MINUTES
            ),
        )
        db.session.add(reset)
        db.session.commit()

        url = f"{Config.FRONTEND_URL}/reset-password?token={raw}"
        send_password_reset(
            to=email,
            reset_url=url,
            expires_minutes=Config.RESET_TOKEN_EXPIRY_MINUTES,
        )
    elif user and user.provider:
        # conta OAuth
        resp["oauth_only"] = user.provider
    return jsonify(resp)


# ============================================================
# VERIFY — valida o token ANTES de mostrar o formulário
# ============================================================
@bp.get("/reset-password/verify")
@limiter.limit("20/hour")
def verify_reset_token():
    raw_token = (request.args.get("token") or "").strip()
    if not raw_token:
        return jsonify({"valid": False, "reason": "missing"}), 200

    token_hash = hash_reset_token(raw_token)
    reset = PasswordResetToken.query.filter_by(token_hash=token_hash).first()

    if not reset:
        return jsonify({"valid": False, "reason": "invalid"}), 200

    # normaliza timezone (SQLite pode devolver naive)
    exp = reset.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if reset.used:
        return jsonify({"valid": False, "reason": "used"}), 200
    if exp < datetime.now(timezone.utc):
        return jsonify({"valid": False, "reason": "expired"}), 200

    return jsonify({"valid": True}), 200


# ============================================================
# RESET — aplica a nova password
# ============================================================
@bp.post("/reset-password")
@limiter.limit("5/hour")
def reset_password():
    data = request.get_json(silent=True) or {}
    raw_token = (data.get("token") or "").strip()
    pwd = data.get("password") or ""

    if not raw_token:
        return jsonify({"error": "Link inválido."}), 400

    ok, reason = _validate_password(pwd)
    if not ok:
        return jsonify({"error": reason}), 400

    token_hash = hash_reset_token(raw_token)
    reset = PasswordResetToken.query.filter_by(token_hash=token_hash).first()

    if not reset:
        return jsonify({"error": "Link inválido."}), 400

    exp = reset.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if reset.used:
        return jsonify({"error": "Link já usado. Pede um novo."}), 400
    if exp < datetime.now(timezone.utc):
        return jsonify({"error": "Link expirou. Pede um novo."}), 400

    user = db.session.get(User, reset.user_id)
    if not user:
        return jsonify({"error": "Utilizador não encontrado."}), 404

    user.password = hash_password(pwd)
    reset.used = True
    db.session.commit()
    return jsonify({"ok": True})


# ============================================================
# CHANGE — user autenticado troca password
# ============================================================
@bp.post("/change-password")
@require_auth
def change_password():
    data = request.get_json(silent=True) or {}
    cur = data.get("current_password", "")
    new = data.get("new_password", "")
    if len(new) < 8:
        return jsonify({"error": "Password curta."}), 400
    user = db.session.get(User, request.user_id)
    if not user or not user.password:
        return jsonify({"error": "Conta OAuth."}), 400
    if not verify_password(cur, user.password):
        return jsonify({"error": "Password atual incorreta."}), 401
    user.password = hash_password(new)
    db.session.commit()
    return jsonify({"ok": True})