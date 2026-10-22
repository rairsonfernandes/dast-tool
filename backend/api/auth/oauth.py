"""OAuth Google + GitHub."""
import logging
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

from flask import Blueprint, request, redirect, jsonify
import requests as http_requests

from extensions import db
from models import User
from auth import create_token
from email_service import send_welcome_email
from config import get_config

bp = Blueprint("auth_oauth", __name__, url_prefix="/api/auth")
cfg = get_config()
log = logging.getLogger("api.auth.oauth")

_OAUTH_STATES: dict[str, float] = {}
_OAUTH_TTL = 600


def _now():
    return datetime.now(timezone.utc)


def _issue_state() -> str:
    s = secrets.token_urlsafe(32)
    _OAUTH_STATES[s] = _now().timestamp() + _OAUTH_TTL
    now = _now().timestamp()
    for k, exp in list(_OAUTH_STATES.items()):
        if exp < now:
            _OAUTH_STATES.pop(k, None)
    return s


def _consume_state(s: str | None) -> bool:
    if not s:
        return False
    exp = _OAUTH_STATES.pop(s, None)
    return exp is not None and exp >= _now().timestamp()


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USER_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAIL_URL = "https://api.github.com/user/emails"


# ============================================
# GOOGLE
# ============================================
@bp.get("/google/url")
def google_auth_url():
    if not cfg.GOOGLE_CLIENT_ID:
        return jsonify({"error": "Google não configurado."}), 503
    params = {
        "client_id": cfg.GOOGLE_CLIENT_ID,
        "redirect_uri": cfg.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
        "state": _issue_state(),
    }
    return jsonify({"url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}"})


@bp.get("/google/callback")
def google_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    if not code:
        return redirect(f"{cfg.FRONTEND_URL}/login?error=oauth_denied")
    if not _consume_state(state):
        return redirect(f"{cfg.FRONTEND_URL}/login?error=invalid_state")
    try:
        tok = http_requests.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": cfg.GOOGLE_CLIENT_ID,
            "client_secret": cfg.GOOGLE_CLIENT_SECRET,
            "redirect_uri": cfg.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        }, timeout=10)
        tok.raise_for_status()
        at = tok.json().get("access_token")

        u = http_requests.get(
            GOOGLE_USER_URL,
            headers={"Authorization": f"Bearer {at}"},
            timeout=10,
        )
        u.raise_for_status()
        info = u.json()

        email = (info.get("email") or "").strip().lower()
        if not email or not info.get("email_verified"):
            return redirect(f"{cfg.FRONTEND_URL}/login?error=email_not_verified")
        pid = str(info.get("sub") or "")

        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(
                email=email,
                password=None,
                provider="google",
                provider_id=pid,
                tenant_id=cfg.DEFAULT_TENANT_ID,
            )
            db.session.add(user)
            db.session.commit()
            try:
                send_welcome_email(
                    to=email,
                    app_url=cfg.FRONTEND_URL,
                    provider="google",
                )
            except Exception:
                log.exception("Welcome email (Google) falhou para %s", email)
        elif not user.provider:
            user.provider = "google"
            user.provider_id = pid
            db.session.commit()

        return redirect(f"{cfg.FRONTEND_URL}/login?token={create_token(user.id)}")
    except Exception:
        log.exception("Google OAuth failed")
        return redirect(f"{cfg.FRONTEND_URL}/login?error=oauth_failed")


# ============================================
# GITHUB
# ============================================
@bp.get("/github/url")
def github_auth_url():
    if not cfg.GITHUB_CLIENT_ID:
        return jsonify({"error": "GitHub não configurado."}), 503
    params = {
        "client_id": cfg.GITHUB_CLIENT_ID,
        "redirect_uri": cfg.GITHUB_REDIRECT_URI,
        "scope": "read:user user:email",
        "state": _issue_state(),
        "allow_signup": "true",
    }
    return jsonify({"url": f"{GITHUB_AUTH_URL}?{urlencode(params)}"})


@bp.get("/github/callback")
def github_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    if not code:
        return redirect(f"{cfg.FRONTEND_URL}/login?error=oauth_denied")
    if not _consume_state(state):
        return redirect(f"{cfg.FRONTEND_URL}/login?error=invalid_state")
    try:
        tok = http_requests.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": cfg.GITHUB_CLIENT_ID,
                "client_secret": cfg.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": cfg.GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        tok.raise_for_status()
        at = tok.json().get("access_token")
        if not at:
            return redirect(f"{cfg.FRONTEND_URL}/login?error=oauth_failed")

        h = {"Authorization": f"Bearer {at}", "Accept": "application/vnd.github+json"}
        u = http_requests.get(GITHUB_USER_URL, headers=h, timeout=10)
        u.raise_for_status()
        info = u.json()

        email = (info.get("email") or "").strip().lower()
        if not email:
            er = http_requests.get(GITHUB_EMAIL_URL, headers=h, timeout=10)
            er.raise_for_status()
            prim = next(
                (e for e in er.json() if e.get("primary") and e.get("verified")),
                None,
            )
            if not prim:
                return redirect(f"{cfg.FRONTEND_URL}/login?error=email_not_verified")
            email = prim["email"].strip().lower()

        pid = str(info.get("id") or "")
        if not email or not pid:
            return redirect(f"{cfg.FRONTEND_URL}/login?error=no_email")

        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(
                email=email,
                password=None,
                provider="github",
                provider_id=pid,
                tenant_id=cfg.DEFAULT_TENANT_ID,
            )
            db.session.add(user)
            db.session.commit()
            try:
                send_welcome_email(
                    to=email,
                    app_url=cfg.FRONTEND_URL,
                    provider="github",
                )
            except Exception:
                log.exception("Welcome email (GitHub) falhou para %s", email)
        elif not user.provider:
            user.provider = "github"
            user.provider_id = pid
            db.session.commit()

        return redirect(f"{cfg.FRONTEND_URL}/login?token={create_token(user.id)}")
    except Exception:
        log.exception("GitHub OAuth failed")
        return redirect(f"{cfg.FRONTEND_URL}/login?error=oauth_failed")
        