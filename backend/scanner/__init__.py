"""SENTINEL — Scanner runner (async)."""
from __future__ import annotations

import asyncio
import importlib
import logging
from pathlib import Path
from typing import Any, Callable

from .core import Finding, ScanConfig, ScannerEngine

log = logging.getLogger("scanner")

PREFERRED_ORDER = [
    "crawler", "recon", "headers", "tls", "cors",
    "directory_listing", "exposed_files", "sql_injection", "xss",
    "ssrf", "lfi", "open_redirect", "command_injection", "subdomain_takeover",
]

_SKIP = {"core", "__init__"}
SCANNER_DIR = Path(__file__).resolve().parent


def _module_exists(name: str) -> bool:
    return (SCANNER_DIR / f"{name}.py").is_file()


def _load_module(name: str):
    try:
        mod = importlib.import_module(f".{name}", package=__name__)
    except Exception as e:
        log.exception("Falha ao importar módulo %s", name)
        return None, f"import: {e}"
    run = getattr(mod, "run", None)
    if not callable(run):
        return None, "sem função run(config)"
    return run, None


def _available_modules() -> list[str]:
    return [n for n in PREFERRED_ORDER if _module_exists(n)]


def _parse_cookies(raw) -> dict[str, str]:
    """
    Aceita:
      - dict {"a": "1", "b": "2"}
      - str "a=1; b=2"
      - None
    Devolve dict[str, str].
    """
    if not raw:
        return {}
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items() if k and v is not None}
    if isinstance(raw, str):
        out: dict[str, str] = {}
        for part in raw.split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            k, v = part.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k:
                out[k] = v
        return out
    return {}


async def run_scan_async(
    scan_id: str,
    target_url: str,
    *,
    timeout: float = 10.0,
    max_concurrency: int = 5,
    authorized_scope: list[str] | None = None,
    options: dict[str, Any] | None = None,
    cookies: dict[str, str] | str | None = None,   # ← NOVO
    progress_cb: Callable[[int, str], None] | None = None,
    cancel_cb: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    cfg = ScanConfig(
        target=target_url,
        authorized_scope=authorized_scope or [],
        timeout=timeout,
        max_concurrency=max_concurrency,
        scan_id=scan_id,
        options=options or {},
        cookies=_parse_cookies(cookies),            # ← NOVO
    )
    engine = ScannerEngine(cfg)

    modules = _available_modules()
    if not modules:
        return {
            "scan_id": scan_id, "target": target_url,
            "elapsed_seconds": 0.0, "findings_total": 0,
            "findings_by_severity": {}, "errors": [{"error": "nenhum módulo"}],
            "findings": [], "modules_available": [],
        }

    for name in modules:
        run, err = _load_module(name)
        if not run:
            engine.errors.append({"module": name, "error": err})
            continue
        engine.register(name, run)

    if progress_cb:
        progress_cb(0, "start")

    result = await engine.run()

    if progress_cb:
        progress_cb(100, "done")

    result["modules_available"] = modules
    return result


def run_scan_sync(
    scan_id: str,
    target_url: str,
    *,
    timeout: float = 10.0,
    max_concurrency: int = 5,
    authorized_scope: list[str] | None = None,
    options: dict[str, Any] | None = None,
    cookies: dict[str, str] | str | None = None,   # ← NOVO
    progress_cb: Callable[[int, str], None] | None = None,
    cancel_cb: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    try:
        asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            f = pool.submit(asyncio.run, run_scan_async(
                scan_id, target_url,
                timeout=timeout, max_concurrency=max_concurrency,
                authorized_scope=authorized_scope, options=options,
                cookies=cookies,                    # ← NOVO
                progress_cb=progress_cb, cancel_cb=cancel_cb,
            ))
            return f.result()
    except RuntimeError:
        return asyncio.run(run_scan_async(
            scan_id, target_url,
            timeout=timeout, max_concurrency=max_concurrency,
            authorized_scope=authorized_scope, options=options,
            cookies=cookies,                        # ← NOVO
            progress_cb=progress_cb, cancel_cb=cancel_cb,
        ))