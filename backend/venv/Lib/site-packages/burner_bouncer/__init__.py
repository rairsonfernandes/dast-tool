from __future__ import annotations

import json
import re
import socket
import struct
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

_DATA_FILE = Path(__file__).parent.parent.parent / "data" / "disposable_domains.json"


def _load_blocklist() -> frozenset:
    with open(_DATA_FILE, "r", encoding="utf-8") as f:
        domains = json.load(f)
    return frozenset(d.lower() for d in domains)


_BLOCKLIST: frozenset = _load_blocklist()
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

_FREE_PROVIDERS = frozenset([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.jp",
    "yahoo.fr", "yahoo.de", "yahoo.es", "yahoo.it", "yahoo.com.au", "yahoo.ca",
    "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.es",
    "hotmail.it", "outlook.com", "outlook.co.uk", "outlook.fr", "live.com",
    "live.co.uk", "live.fr", "msn.com", "icloud.com", "me.com", "mac.com",
    "aol.com", "protonmail.com", "proton.me", "pm.me", "zoho.com",
    "fastmail.com", "fastmail.fm", "tutanota.com", "tutanota.de", "tuta.io",
    "gmx.com", "gmx.net", "gmx.de", "gmx.fr", "web.de", "mail.com",
    "yandex.com", "yandex.ru", "rambler.ru", "mail.ru", "inbox.com",
    "rediffmail.com", "sina.com", "qq.com", "163.com", "126.com",
])

_ROLE_PREFIXES = frozenset([
    "admin", "administrator", "webmaster", "hostmaster", "postmaster",
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "support", "help", "helpdesk", "service", "contact",
    "info", "information", "hello", "hi",
    "sales", "marketing", "billing", "payments", "accounts",
    "security", "abuse", "spam", "phishing",
    "jobs", "careers", "hr", "recruiting", "recruitment",
    "legal", "compliance", "privacy", "gdpr",
    "press", "media", "pr", "news",
    "dev", "devops", "ops", "sre", "engineering", "tech",
    "api", "system", "bot", "robot", "daemon", "mailer",
    "notifications", "alerts", "updates", "newsletter",
])

_COMMON_DOMAINS = [
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
    "protonmail.com", "aol.com", "live.com", "me.com", "msn.com",
]


@dataclass
class CheckResult:
    email: str
    domain: Optional[str]
    is_disposable: bool
    is_free_provider: bool
    is_role_address: bool
    reason: Optional[str]  # "blocklist" | "invalid_email" | None

    def to_dict(self) -> dict:
        return {
            "email": self.email,
            "domain": self.domain,
            "is_disposable": self.is_disposable,
            "is_free_provider": self.is_free_provider,
            "is_role_address": self.is_role_address,
            "reason": self.reason,
        }


@dataclass
class DnsCheckResult:
    email: str
    domain: Optional[str]
    is_disposable: bool
    is_free_provider: bool
    is_role_address: bool
    reason: Optional[str]
    has_mx: Optional[bool]

    def to_dict(self) -> dict:
        return {
            "email": self.email,
            "domain": self.domain,
            "is_disposable": self.is_disposable,
            "is_free_provider": self.is_free_provider,
            "is_role_address": self.is_role_address,
            "reason": self.reason,
            "has_mx": self.has_mx,
        }


def get_domain(email: str) -> Optional[str]:
    email = email.strip().lower()
    parts = email.split("@")
    if len(parts) != 2:
        return None
    local, domain = parts
    if not local or not domain or "." not in domain:
        return None
    return domain


def _get_local(email: str) -> Optional[str]:
    email = email.strip().lower()
    parts = email.split("@")
    if len(parts) != 2:
        return None
    local, domain = parts
    if not local or not domain or "." not in domain:
        return None
    return local


def _levenshtein(a: str, b: str) -> int:
    m, n = len(a), len(b)
    dp = [[j if i == 0 else i if j == 0 else 0 for j in range(n + 1)] for i in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]


def is_disposable(email: str) -> bool:
    domain = get_domain(email)
    if domain is None:
        return False
    return domain in _BLOCKLIST


def is_free_provider(email: str) -> bool:
    domain = get_domain(email)
    if domain is None:
        return False
    return domain in _FREE_PROVIDERS


def is_role_address(email: str) -> bool:
    local = _get_local(email)
    if local is None:
        return False
    base = local.split("+")[0].split(".")[0]
    return base in _ROLE_PREFIXES


def suggest(email: str) -> Optional[str]:
    domain = get_domain(email)
    if domain is None:
        return None
    if domain in _COMMON_DOMAINS:
        return None
    local = _get_local(email)
    best = None
    best_dist = float("inf")
    for candidate in _COMMON_DOMAINS:
        dist = _levenshtein(domain, candidate)
        if 0 < dist < best_dist and dist <= 2:
            best_dist = dist
            best = candidate
    return f"{local}@{best}" if best else None


def check(email: str) -> CheckResult:
    domain = get_domain(email)
    if domain is None:
        return CheckResult(
            email=email, domain=None,
            is_disposable=False, is_free_provider=False, is_role_address=False,
            reason="invalid_email",
        )
    disposable = domain in _BLOCKLIST
    return CheckResult(
        email=email,
        domain=domain,
        is_disposable=disposable,
        is_free_provider=domain in _FREE_PROVIDERS,
        is_role_address=is_role_address(email),
        reason="blocklist" if disposable else None,
    )


def check_many(emails: List[str]) -> List[CheckResult]:
    return [check(e) for e in emails]


def get_blocklist() -> List[str]:
    return sorted(_BLOCKLIST)


def get_free_providers() -> List[str]:
    return sorted(_FREE_PROVIDERS)


def check_with_dns(email: str) -> DnsCheckResult:
    base = check(email)
    if base.domain is None:
        return DnsCheckResult(**{**base.to_dict(), "has_mx": None})
    try:
        import dns.resolver  # dnspython optional dependency
        answers = dns.resolver.resolve(base.domain, "MX")
        has_mx = len(list(answers)) > 0
    except ImportError:
        # fallback: stdlib socket-based check (less reliable, no MX lookup)
        try:
            socket.getaddrinfo(base.domain, None)
            has_mx = True
        except socket.gaierror:
            has_mx = False
    except Exception:
        has_mx = False
    return DnsCheckResult(
        email=base.email, domain=base.domain,
        is_disposable=base.is_disposable, is_free_provider=base.is_free_provider,
        is_role_address=base.is_role_address, reason=base.reason,
        has_mx=has_mx,
    )
