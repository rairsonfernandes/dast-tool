"""Auth: register, login, me, profile, avatar, sessions, api-keys, account delete."""
import base64
import hashlib
import io
import secrets
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from PIL import Image, ImageOps

from api.deps import audit
from extensions import db, limiter
from models import User, UserSession, ApiKey
from auth import hash_password, verify_password, create_token, require_auth
from validators import is_valid_email
from email_service import send_welcome_email
from config import get_config

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
cfg = get_config()


# ============================================
# HELPERS
# ============================================
def _validate_password(password: str) -> tuple[bool, str]:
    if not password:
        return False, "Password obrigatória."
    if len(password) < 8:
        return False, "A password deve ter pelo menos 8 caracteres."
    if len(password) > 128:
        return False, "A password não pode ter mais de 128 caracteres."
    if password.lower() in {"password", "12345678", "qwerty12", "abc12345"}:
        return False, "Esta password é demasiado comum."
    return True, ""


def _generate_api_key(prefix: str = "sk_live_"):
    raw = secrets.token_urlsafe(32)
    full = f"{prefix}{raw}"
    h = hashlib.sha256(full.encode()).hexdigest()
    return full, h, full[-4:]


def _user_dict(user: User) -> dict:
    """to_dict() com alias `avatar` (o frontend usa `user.avatar`)."""
    d = user.to_dict()
    d["avatar"] = d.get("avatar_url") or d.get("avatar") or None
    return d


# ============================================
# REGISTER / LOGIN
# ============================================
@bp.post("/register")
@limiter.limit("10/hour")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip() or None
    phone = (data.get("phone") or "").strip() or None
    department = (data.get("department") or "").strip() or None
    job_title = (data.get("job_title") or "").strip() or None

    if not email:
        return jsonify({"error": "Introduz o teu email."}), 400
    ok, reason = _validate_password(password)
    if not ok:
        return jsonify({"error": reason}), 400
    valid, reason = is_valid_email(email)
    if not valid:
        return jsonify({"error": reason}), 400

    existing = User.query.filter_by(email=email).first()
    if existing:
        if existing.provider:
            return jsonify({"error": f"Este email usa login {existing.provider.title()}."}), 409
        return jsonify({"error": "Email já registado."}), 409

    user = User(
        email=email,
        password=hash_password(password),
        name=name,
        phone=phone,
        department=department,
        job_title=job_title,
        tenant_id=cfg.DEFAULT_TENANT_ID,
    )
    db.session.add(user)
    db.session.commit()
    audit("auth.register", email=email)
    try:
        send_welcome_email(to=user.email, app_url=cfg.FRONTEND_URL)
    except Exception:
        pass

    return jsonify({
        "token": create_token(user.id),
        "user": _user_dict(user),
    }), 201


@bp.post("/login")
@limiter.limit("10/minute")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Introduz email e password."}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "Email ou password incorretos."}), 401
    if user.password is None and user.provider:
        return jsonify({"error": f"Esta conta usa login {user.provider.title()}."}), 401
    if not verify_password(password, user.password):
        return jsonify({"error": "Email ou password incorretos."}), 401

    user.last_login_at = datetime.now(timezone.utc)

    # Só a nova sessão fica current
    UserSession.query.filter_by(user_id=user.id, is_current=True).update(
        {"is_current": False}
    )
    sess = UserSession(
        user_id=user.id,
        tenant_id=user.tenant_id,
        ip_address=request.remote_addr,
        user_agent=(request.headers.get("User-Agent") or "")[:512],
        is_current=True,
    )
    db.session.add(sess)
    db.session.commit()
    audit("auth.login", email=email)

    return jsonify({
        "token": create_token(user.id),
        "user": _user_dict(user),
    })


# ============================================
# ME / PROFILE
# ============================================
@bp.get("/me")
@require_auth
def me():
    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "Sessão inválida."}), 401
    return jsonify(_user_dict(user))


@bp.patch("/me")
@require_auth
def update_profile():
    data = request.get_json(silent=True) or {}
    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "Utilizador não encontrado."}), 404

    for key in ("name", "phone", "department", "job_title"):
        if key in data:
            setattr(user, key, (data.get(key) or "").strip() or None)

    if "email" in data:
        new_email = (data["email"] or "").strip().lower()
        if new_email and new_email != user.email:
            valid, reason = is_valid_email(new_email)
            if not valid:
                return jsonify({"error": reason}), 400
            if User.query.filter_by(email=new_email).first():
                return jsonify({"error": "Email já em uso."}), 409
            user.email = new_email

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Email já em uso."}), 409

    audit("auth.profile_update")
    return jsonify(_user_dict(user))


# ============================================
# AVATAR
# ============================================
@bp.post("/me/avatar")
@require_auth
def upload_avatar():
    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "Utilizador não encontrado."}), 404

    MAX_BYTES, MAX_DIM = 2 * 1024 * 1024, 512
    ALLOWED = {"image/jpeg", "image/png", "image/webp"}

    raw = None
    if "file" in request.files:
        f = request.files["file"]
        if not f or not f.filename:
            return jsonify({"error": "Ficheiro vazio."}), 400
        if f.mimetype not in ALLOWED:
            return jsonify({"error": "Formato inválido."}), 400
        raw = f.read()
    else:
        data = request.get_json(silent=True) or {}
        data_url = (data.get("data_url") or "").strip()
        if not data_url.startswith("data:image/"):
            return jsonify({"error": "Envia 'file' ou 'data_url'."}), 400
        header, b64 = data_url.split(",", 1)
        mime = header.split(";")[0].replace("data:", "")
        if mime not in ALLOWED:
            return jsonify({"error": "Formato inválido."}), 400
        raw = base64.b64decode(b64)

    if not raw or len(raw) > MAX_BYTES:
        return jsonify({"error": "Imagem demasiado grande (máx. 2 MB)."}), 413

    try:
        Image.open(io.BytesIO(raw)).verify()
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
    except Exception:
        return jsonify({"error": "Imagem inválida."}), 400

    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)

    out = io.BytesIO()
    fmt = "PNG" if img.mode == "RGBA" else "JPEG"
    img.save(out, format=fmt, optimize=True, quality=88)
    encoded = base64.b64encode(out.getvalue()).decode("ascii")
    user.avatar_url = f"data:image/{'png' if fmt == 'PNG' else 'jpeg'};base64,{encoded}"
    db.session.commit()
    audit("auth.avatar_update")

    return jsonify(_user_dict(user))


@bp.delete("/me/avatar")
@require_auth
def delete_avatar():
    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "Utilizador não encontrado."}), 404
    user.avatar_url = None
    db.session.commit()
    audit("auth.avatar_delete")
    return jsonify(_user_dict(user))


# ============================================
# SESSIONS
# ============================================
@bp.get("/me/sessions")
@require_auth
def list_sessions():
    sessions = (
        UserSession.query
        .filter_by(user_id=request.user_id, revoked_at=None)
        .order_by(UserSession.is_current.desc(), UserSession.last_active_at.desc())
        .all()
    )
    return jsonify([s.to_dict() for s in sessions])


@bp.delete("/me/sessions/<session_id>")
@require_auth
def revoke_session(session_id):
    s = UserSession.query.filter_by(id=session_id, user_id=request.user_id).first()
    if not s:
        return jsonify({"error": "Sessão não encontrada."}), 404
    if s.is_current:
        return jsonify({"error": "Não podes terminar a tua sessão atual."}), 400
    s.revoked_at = datetime.now(timezone.utc)
    db.session.commit()
    audit("auth.session_revoke", session_id=session_id)
    return jsonify({"revoked": True})


@bp.delete("/me/sessions")
@require_auth
def revoke_all_sessions():
    UserSession.query.filter_by(user_id=request.user_id, is_current=False).update(
        {"revoked_at": datetime.now(timezone.utc)}
    )
    db.session.commit()
    audit("auth.sessions_revoke_all")
    return jsonify({"revoked": True})


# ============================================
# API KEYS
# ============================================
@bp.get("/me/api-keys")
@require_auth
def list_api_keys():
    keys = (
        ApiKey.query
        .filter_by(user_id=request.user_id, revoked_at=None)
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return jsonify([k.to_dict() for k in keys])


@bp.post("/me/api-keys")
@require_auth
def create_api_key():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    permissions = (data.get("permissions") or "read").strip()
    if not name:
        return jsonify({"error": "Nome obrigatório."}), 400
    if permissions not in ("read", "read_write", "full"):
        return jsonify({"error": "Permissões inválidas."}), 400

    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "Utilizador não encontrado."}), 401

    prefix = "sk_test_" if permissions == "read" else "sk_live_"
    full, key_hash, last = _generate_api_key(prefix)

    key = ApiKey(
        user_id=request.user_id,
        tenant_id=user.tenant_id,
        name=name,
        key_prefix=prefix,
        key_hash=key_hash,
        key_last_chars=last,
        permissions=permissions,
    )
    db.session.add(key)
    db.session.commit()
    audit("auth.api_key_create", name=name, permissions=permissions)
    return jsonify({**key.to_dict(), "key": full}), 201


@bp.delete("/me/api-keys/<key_id>")
@require_auth
def revoke_api_key(key_id):
    k = ApiKey.query.filter_by(id=key_id, user_id=request.user_id).first()
    if not k:
        return jsonify({"error": "Chave não encontrada."}), 404
    k.revoked_at = datetime.now(timezone.utc)
    db.session.commit()
    audit("auth.api_key_revoke", key_id=key_id)
    return jsonify({"revoked": True})


# ============================================
# DELETE ACCOUNT — o próprio user apaga a conta
# ============================================
@bp.delete("/account")
@require_auth
def delete_account():
    from models import (
        User as _User, Scan, Vulnerability, PasswordResetToken,
        UserSession as _UserSession, ApiKey as _ApiKey, Report,
    )

    user = db.session.get(_User, request.user_id)
    if not user:
        return jsonify({"error": "Conta não encontrada."}), 404

    if request.headers.get("X-Confirm-Delete") != "yes":
        return jsonify({"error": "Confirmação obrigatória."}), 400

    # apaga dependências primeiro
    scan_ids = [row[0] for row in db.session.query(Scan.id).filter_by(user_id=user.id).all()]
    if scan_ids:
        Vulnerability.query.filter(Vulnerability.scan_id.in_(scan_ids)).delete(
            synchronize_session=False
        )
    Scan.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    PasswordResetToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    _UserSession.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    _ApiKey.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Report.query.filter_by(user_id=user.id).delete(synchronize_session=False)

    db.session.delete(user)
    db.session.commit()
    audit("auth.account_delete", email=user.email)

    return jsonify({"ok": True})