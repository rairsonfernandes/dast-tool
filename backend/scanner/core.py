"""Motor central do scanner. Coordena módulos e normaliza resultados."""
import asyncio
import hashlib
import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Coroutine
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# ============================================
# CONFIG
# ============================================
@dataclass
class ScanConfig:
    """Configuração de uma execução de scan."""
    target: str
    authorized_scope: list[str] = field(default_factory=list)
    timeout: float = 10.0
    max_concurrency: int = 10
    scan_id: str = ""
    scanner_version: str = "1.0.0"
    options: dict[str, Any] = field(default_factory=dict)
    cookies: dict[str, str] = field(default_factory=dict)  # ← NOVO

    @property
    def requests_per_second(self) -> int:
        try:
            return max(1, int(self.options.get("requests_per_second", 5)))
        except (TypeError, ValueError):
            return 5

    @property
    def max_depth(self) -> int:
        try:
            return max(0, int(self.options.get("max_depth", 2)))
        except (TypeError, ValueError):
            return 2

    @property
    def max_pages(self) -> int:
        try:
            return max(1, int(self.options.get("max_pages", 200)))
        except (TypeError, ValueError):
            return 200

    @property
    def extra_headers(self) -> dict[str, str]:
        """Headers HTTP adicionais (ex: Authorization, X-Custom)."""
        h = self.options.get("headers") or {}
        return {str(k): str(v) for k, v in h.items()} if isinstance(h, dict) else {}


# ============================================
# FINDING
# ============================================
@dataclass
class Finding:
    id: str
    module: str
    title: str
    severity: str
    confidence: str
    category: str
    asset: str
    endpoint: str
    evidence: dict[str, Any]
    description: str
    impact: str
    remediation: str
    references: list[str] = field(default_factory=list)
    validation_state: str = "probable"
    first_seen: str | None = None
    last_seen: str | None = None
    scanner_version: str = "1.0.0"
    scan_id: str = ""


def make_finding_id(module: str, asset: str, endpoint: str, title: str) -> str:
    raw = f"{module}|{asset}|{endpoint}|{title}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ============================================
# ENGINE
# ============================================
class ScannerEngine:
    def __init__(self, config: ScanConfig):
        self.config = config
        self._modules: dict[str, Callable[..., Coroutine[Any, Any, list[Finding]]]] = {}
        self.findings: list[Finding] = []
        self.errors: list[dict] = []
        self._findings_by_id: dict[str, Finding] = {}
        self._rate_lock = asyncio.Lock()
        self._last_request_at: float = 0.0

    def register(self, name: str, func: Callable):
        self._modules[name] = func
        logger.info("Módulo registado: %s", name)

    def _is_authorized(self, url: str) -> bool:
        if not self.config.authorized_scope:
            return True
        target = urlparse(url)
        for scope in self.config.authorized_scope:
            s = urlparse(scope)
            if (
                target.scheme == s.scheme
                and target.netloc == s.netloc
                and target.path.startswith(s.path)
            ):
                return True
        return False

    async def acquire_slot(self) -> None:
        async with self._rate_lock:
            now = time.monotonic()
            wait = (1.0 / self.config.requests_per_second) - (now - self._last_request_at)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request_at = time.monotonic()

    def _store_finding(self, f: Finding) -> None:
        if f.id in self._findings_by_id:
            return
        f.scan_id = self.config.scan_id
        f.scanner_version = self.config.scanner_version
        self._findings_by_id[f.id] = f
        self.findings.append(f)

    async def run(self) -> dict[str, Any]:
        start = time.monotonic()
        sem = asyncio.Semaphore(max(1, self.config.max_concurrency))

        async def run_one(name: str, func: Callable):
            async with sem:
                if not self._is_authorized(self.config.target):
                    self.errors.append({"module": name, "error": "fora do âmbito"})
                    return
                try:
                    results = await asyncio.wait_for(
                        func(self.config),
                        timeout=max(1.0, self.config.timeout) * 5,
                    )
                    for f in results:
                        self._store_finding(f)
                    logger.info("%s: %d findings", name, len(results))
                except asyncio.TimeoutError:
                    self.errors.append({"module": name, "error": "timeout"})
                    logger.warning("Módulo %s: timeout", name)
                except Exception as exc:
                    self.errors.append({"module": name, "error": str(exc)})
                    logger.exception("Módulo %s falhou", name)

        tasks = [run_one(n, f) for n, f in self._modules.items()]
        await asyncio.gather(*tasks)

        elapsed = time.monotonic() - start
        by_sev: dict[str, int] = {}
        for f in self.findings:
            by_sev[f.severity] = by_sev.get(f.severity, 0) + 1

        return {
            "scan_id": self.config.scan_id,
            "target": self.config.target,
            "elapsed_seconds": round(elapsed, 2),
            "findings_total": len(self.findings),
            "findings_by_severity": by_sev,
            "errors": self.errors,
            "findings": [asdict(f) for f in self.findings],
        }