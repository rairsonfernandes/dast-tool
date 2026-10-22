"""
SENTINEL — Seed inicial.

Cria:
  - Tenant default (id = DEFAULT_TENANT_ID)
  - TenantSettings default (DEFAULT_SETTINGS)
  - Utilizador SUPER_ADMIN (email/password via env ou --password)

Idempotente: pode ser corrido múltiplas vezes sem duplicar.

Uso:
    python seed.py
    python seed.py --reset-password
    python seed.py --password "NovaSenha!2026"
    python seed.py --email admin@x.pt --password "..." --role ADMIN
    python seed.py --reset-name
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from app import app  # noqa: E402
from extensions import db  # noqa: E402
from models import Tenant, TenantSettings, User  # noqa: E402
from auth import hash_password  # noqa: E402
from config import Config  # noqa: E402


# ============================================================
# DEFAULTS
# ============================================================
DEFAULT_SETTINGS = {
    "theme": "dark",
    "language": "pt-PT",
    "timezone": "Europe/Lisbon",
    "date_format": "DD/MM/YYYY",
    "density": "normal",
    "channel": "email",
    "session_timeout": 30,
    "scan_profile": "owasp_top10",
    "scan_depth": "normal",
    "rate_limit": 50,
    "toggles": {
        "2fa": True,
        "ip-block": True,
        "new-device": True,
        "sso": False,
        "realtime": True,
        "daily": True,
        "scan-done": True,
        "integrations": False,
        "crawl": True,
        "auto-pdf": True,
    },
}

VALID_ROLES = {"SUPER_ADMIN", "ADMIN", "ANALYST", "VIEWER"}


# ============================================================
# HELPERS
# ============================================================
def _log(msg: str) -> None:
    print(f"[seed] {msg}")


def _ensure_tenant() -> Tenant:
    tenant_id = Config.DEFAULT_TENANT_ID
    tenant = db.session.get(Tenant, tenant_id)
    if tenant:
        _log(f"Tenant já existe: {tenant.id} ({tenant.name})")
        return tenant

    tenant = Tenant(
        id=tenant_id,
        name=Config.SEED_TENANT_NAME,
        slug=Config.SEED_TENANT_SLUG,
        plan=Config.SEED_TENANT_PLAN,
        max_users=999,
        max_scans_per_month=99999,
        is_active=True,
    )
    db.session.add(tenant)
    db.session.commit()
    _log(f"Tenant criado: {tenant.id} ({tenant.name})")
    return tenant


def _ensure_tenant_settings(tenant: Tenant) -> None:
    ts = TenantSettings.query.filter_by(tenant_id=tenant.id).first()
    if ts:
        _log(f"TenantSettings já existe para {tenant.id}")
        current = ts.get()
        merged = {
            **DEFAULT_SETTINGS,
            **current,
            "toggles": {**DEFAULT_SETTINGS["toggles"], **current.get("toggles", {})},
        }
        if merged != current:
            ts.set(merged)
            db.session.commit()
            _log("TenantSettings atualizados com defaults novos")
        return

    ts = TenantSettings(tenant_id=tenant.id)
    ts.set(DEFAULT_SETTINGS)
    db.session.add(ts)
    db.session.commit()
    _log("TenantSettings criados")


def _ensure_admin(
    tenant: Tenant,
    email: str,
    password: str | None,
    name: str,
    role: str,
    reset_password: bool,
    reset_name: bool,
) -> User:
    email = email.strip().lower()
    user = User.query.filter_by(email=email, tenant_id=tenant.id).first()

    if user:
        _log(f"Utilizador já existe: {user.id} ({user.email}) role={user.role} name={user.name!r}")

        changed = False

        # Atualiza name se estiver vazio (corrige users antigos)
        if (reset_name or not user.name) and name and user.name != name:
            user.name = name
            changed = True
            _log(f"  name atualizado → {name!r}")

        if user.role != role:
            user.role = role
            changed = True
            _log(f"  role atualizado → {role}")

        if not user.is_active:
            user.is_active = True
            changed = True
            _log("  reativado")

        if reset_password and password:
            user.password = hash_password(password)
            changed = True
            _log("  password atualizada")

        if changed:
            db.session.commit()
        return user

    user = User(
        tenant_id=tenant.id,
        email=email,
        password=hash_password(password or "ChangeMe!2026"),
        name=name or None,
        role=role,
        is_active=True,
    )
    db.session.add(user)
    db.session.commit()
    _log(f"Utilizador criado: {user.id} ({user.email}) role={user.role} name={user.name!r}")
    return user


# ============================================================
# MAIN
# ============================================================
def main() -> int:
    parser = argparse.ArgumentParser(description="SENTINEL seed inicial")
    parser.add_argument("--email", default=Config.SEED_ADMIN_EMAIL, help="Email do admin")
    parser.add_argument("--password", default=None, help="Password do admin (só usada na criação ou com --reset-password)")
    parser.add_argument("--name", default=Config.SEED_ADMIN_NAME, help="Nome do admin")
    parser.add_argument(
        "--role",
        default="SUPER_ADMIN",
        choices=sorted(VALID_ROLES),
        help="Role do admin",
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Se o user existir, atualiza a password (usa --password ou SEED_ADMIN_PASSWORD)",
    )
    parser.add_argument(
        "--reset-name",
        action="store_true",
        help="Se o user existir, força o nome para --name (default: só atualiza se vazio)",
    )
    args = parser.parse_args()

    password = args.password or Config.SEED_ADMIN_PASSWORD
    if args.reset_password and not password:
        print("[seed] ERRO: --reset-password requer --password ou SEED_ADMIN_PASSWORD", file=sys.stderr)
        return 2

    with app.app_context():
        _log(f"DB: {Config.SQLALCHEMY_DATABASE_URI.split('@')[-1]}")
        _log("A criar/validar tenant…")
        tenant = _ensure_tenant()

        _log("A criar/validar settings…")
        _ensure_tenant_settings(tenant)

        _log("A criar/validar admin…")
        user = _ensure_admin(
            tenant=tenant,
            email=args.email,
            password=password,
            name=args.name,
            role=args.role,
            reset_password=args.reset_password,
            reset_name=args.reset_name,
        )

        # Resumo final
        print()
        _log("=== RESUMO ===")
        _log(f"Tenant:  {tenant.id}  ({tenant.name}, plan={tenant.plan})")
        _log(f"Admin:   {user.id}  ({user.email})")
        _log(f"Nome:    {user.name!r}")
        _log(f"Role:    {user.role}")
        _log(f"Ativo:   {user.is_active}")
        if not args.reset_password:
            _log("Password: (não alterada — usa --reset-password para mudar)")
        else:
            _log("Password: (atualizada)")
        print()

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:
        print(f"[seed] FALHA: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)