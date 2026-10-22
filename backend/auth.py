"""
SENTINEL — Autenticação.

Exporta:
- hash_password / verify_password      (bcrypt)
- create_token / decode_token          (JWT HS256)
- require_auth                         (decorator Flask)
- generate_reset_token / hash_reset_token
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

import bcrypt
import jwt
from flask import request, jsonify

from config import Config


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# PASSWORDS (bcrypt)
# ============================================================
def hash_password(password: str) -> str:
    if not password:
        raise ValueError("password vazia")
    # bcrypt limita a 72 bytes; trunca para evitar ValueError em runtime
    if len(password) > 72:
        password = password[:72]
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str | None) -> bool:
    if not password or not hashed:
        return False
    if len(password) > 72:
        password = password[:72]
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ============================================================
# JWT
# ============================================================
def create_token(user_id: str, expires_days: int | None = None) -> str:
    days = expires_days if expires_days is not None else Config.JWT_EXPIRY_DAYS
    now = _now()
    payload = {
        "user_id": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=days)).timestamp()),
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Não autorizado."}), 401
        token = auth[7:].strip()
        payload = decode_token(token)
        if not payload:
            return jsonify({"error": "Sessão inválida ou expirada."}), 401
        user_id = payload.get("user_id")
        if not user_id:
            return jsonify({"error": "Token inválido."}), 401
        request.user_id = user_id
        return f(*args, **kwargs)
    return wrapper


# ============================================================
# RESET TOKENS
# ============================================================
def generate_reset_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hash_reset_token(raw)


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()