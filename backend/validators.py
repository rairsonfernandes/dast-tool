"""
Validação de email em camadas.

1. Sintaxe (regex + email_validator se disponível)
2. Typo em domínios populares
3. Domínios descartáveis
4. MX lookup com cache (TTL 1h) e timeout curto

Falhas transitórias de DNS NÃO bloqueiam o registo (fail-open).
"""
from __future__ import annotations

import logging
import re
import time
from threading import Lock
from typing import Tuple

log = logging.getLogger("validators")

# ============================================================
# DEPENDÊNCIAS OPCIONAIS
# ============================================================
try:
    from email_validator import validate_email, EmailNotValidError
    _HAS_EMAIL_VALIDATOR = True
except ImportError:
    _HAS_EMAIL_VALIDATOR = False
    log.warning("email-validator não instalado — a usar apenas regex")

try:
    import dns.resolver
    import dns.exception
    _HAS_DNS = True
except ImportError:
    dns = None  # type: ignore
    _HAS_DNS = False
    log.warning("dnspython não instalado — a saltar verificação MX")


# ============================================================
# CONSTANTES
# ============================================================
_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)

DISPOSABLE_DOMAINS: set[str] = {
    "mailinator.com", "guerrillamail.com", "tempmail.com", "10minutemail.com",
    "throwawaymail.com", "yopmail.com", "getnada.com", "maildrop.cc",
    "sharklasers.com", "grr.la", "guerrillamail.info", "guerrillamail.biz",
    "spam4.me", "trashmail.com", "temp-mail.org", "fakeinbox.com",
    "mintemail.com", "mytemp.email", "throwaway.email", "mailnesia.com",
    "tempr.email", "discard.email", "emailondeck.com", "spamgourmet.com",
    "guerrillamail.net", "guerrillamail.org", "guerrillamail.de",
    "mailcatch.com", "spambox.us", "mailnull.com", "spamex.com",
}

DOMAIN_TYPOS: dict[str, str] = {
    "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gnail.com": "gmail.com",
    "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com",
    "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
    "outlok.com": "outlook.com", "outloo.com": "outlook.com",
    "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com",
    "iclod.com": "icloud.com", "icloud.co": "icloud.com",
}

# Cache: domain -> (has_mx: bool, expires_at: float)
_MX_CACHE: dict[str, tuple[bool, float]] = {}
_MX_CACHE_LOCK = Lock()
_MX_CACHE_TTL = 3600       # 1h
_MX_TIMEOUT = 2.5          # segundos por lookup


# ============================================================
# MX LOOKUP COM CACHE
# ============================================================
def _domain_has_mx(domain: str) -> bool | None:
    """
    True  = tem MX
    False = não tem MX (domínio existe mas sem servidor de correio)
    None  = falha transitória (não bloqueia o registo)
    """
    if not _HAS_DNS:
        return None

    now = time.time()
    with _MX_CACHE_LOCK:
        cached = _MX_CACHE.get(domain)
        if cached and cached[1] > now:
            return cached[0]

    try:
        records = dns.resolver.resolve(domain, "MX", lifetime=_MX_TIMEOUT)
        has_mx = bool(records)
    except dns.resolver.NXDOMAIN:
        has_mx = False
    except dns.resolver.NoAnswer:
        has_mx = False
    except dns.resolver.NoNameservers:
        return None
    except dns.resolver.LifetimeTimeout:
        return None
    except dns.exception.DNSException as e:
        log.warning("Erro DNS para %s: %s", domain, e)
        return None
    except Exception as e:
        log.warning("Erro inesperado DNS para %s: %s", domain, e)
        return None

    with _MX_CACHE_LOCK:
        _MX_CACHE[domain] = (has_mx, now + _MX_CACHE_TTL)
    return has_mx


# ============================================================
# VALIDAÇÃO
# ============================================================
def is_valid_email(email: str) -> Tuple[bool, str]:
    """
    Valida um email em 4 camadas.
    Devolve (True, "") ou (False, "motivo humano").
    """
    email = (email or "").strip().lower()

    # --- 0. básico ---
    if not email:
        return False, "Introduz o teu email."
    if len(email) > 254:
        return False, "O email é demasiado longo."
    if not _EMAIL_RE.match(email):
        return False, "Formato de email inválido."

    # --- 1. email_validator (se disponível) ---
    if _HAS_EMAIL_VALIDATOR:
        try:
            info = validate_email(email, check_deliverability=False)
            email = info.normalized
        except EmailNotValidError as e:
            return False, f"Email inválido: {e}"

    local, _, domain = email.rpartition("@")
    if not local or not domain:
        return False, "Formato de email inválido."

    # --- 2. typo comum ---
    if domain in DOMAIN_TYPOS:
        return False, f"Quiseste dizer {local}@{DOMAIN_TYPOS[domain]}?"

    # --- 3. descartável ---
    if domain in DISPOSABLE_DOMAINS:
        return False, "Não são permitidos emails temporários ou descartáveis."

    # --- 4. MX (cache + fail-open) ---
    has_mx = _domain_has_mx(domain)
    if has_mx is False:
        return False, f"O domínio «{domain}» não tem servidor de correio configurado."
    # has_mx is None → falha transitória de DNS → não bloqueia

    return True, ""