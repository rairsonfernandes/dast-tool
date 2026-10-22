"""
SENTINEL — Scan worker.

Corre `scanner.run_scan_sync()` numa thread separada, atualiza a BD
(`Scan`, `Vulnerability`) e regista eventos em `AuditLog`.

O `audit()` do `api.deps` depende de `request`, que não existe numa thread.
Por isso usamos `db.session.add(AuditLog(...))` diretamente, dentro de
`app.app_context()`.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("worker.scan")

# Registo global de threads/eventos por scan_id — permite pause/stop real
_threads: dict[str, threading.Thread] = {}
_stop_events: dict[str, threading.Event] = {}
_registry_lock = threading.Lock()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# API pública
# ============================================================
def request_stop(scan_id: str) -> None:
    """Pede ao worker para parar (pause ou delete). Não bloqueia."""
    with _registry_lock:
        ev = _stop_events.get(scan_id)
    if ev is not None:
        ev.set()
        log.info("Stop solicitado para scan %s", scan_id)


def is_stopped(scan_id: str) -> bool:
    with _registry_lock:
        ev = _stop_events.get(scan_id)
    return ev.is_set() if ev else False


def _register(scan_id: str) -> threading.Event:
    ev = threading.Event()
    with _registry_lock:
        _stop_events[scan_id] = ev
    return ev


def _cleanup(scan_id: str) -> None:
    with _registry_lock:
        _stop_events.pop(scan_id, None)
        _threads.pop(scan_id, None)


def start_scan_thread(
    app,
    scan_id: str,
    target_url: str,
    *,
    timeout: float = 10.0,
    max_concurrency: int = 5,
    options: dict[str, Any] | None = None,
) -> threading.Thread:
    """
    Lança uma thread que corre o scan.
    Devolve a thread (não bloqueia o request HTTP).
    """
    _register(scan_id)

    t = threading.Thread(
        target=_worker,
        args=(app, scan_id, target_url),
        kwargs={
            "timeout": timeout,
            "max_concurrency": max_concurrency,
            "options": options or {},
        },
        daemon=True,
        name=f"scan-{scan_id[:8]}",
    )
    with _registry_lock:
        _threads[scan_id] = t
    t.start()
    return t


# ============================================================
# Audit helper — sessão isolada para não commitar findings a meio
# ============================================================
def _safe_add_audit(
    db,
    *,
    tenant_id: str | None,
    user_id: str | None,
    action: str,
    metadata: dict[str, Any],
) -> None:
    """Adiciona um AuditLog numa transação isolada (best-effort)."""
    from sqlalchemy.orm import Session
    try:
        from models import AuditLog
        # Sessão nova para não interferir com a transação principal
        with Session(db.engine) as audit_session:
            audit_session.add(AuditLog(
                tenant_id=tenant_id,
                user_id=user_id,
                action=action,
                metadata_json=json.dumps(metadata, default=str),
            ))
            audit_session.commit()
    except Exception:
        log.debug("AuditLog falhou (%s)", action, exc_info=True)


# ============================================================
# Worker
# ============================================================
def _worker(
    app,
    scan_id: str,
    target_url: str,
    *,
    timeout: float,
    max_concurrency: int,
    options: dict[str, Any],
) -> None:
    from extensions import db
    from models import Scan
    from scanner import run_scan_sync

    try:
        # ---------- 1. Marca como running ----------
        with app.app_context():
            scan = db.session.get(Scan, scan_id)
            if not scan:
                log.warning("Scan %s não existe — a abortar", scan_id)
                return
            scan.status = "running"
            scan.started_at = _utcnow()
            db.session.commit()
            tenant_id = scan.tenant_id
            user_id = scan.user_id
            log.info("Scan %s iniciado (target=%s)", scan_id, target_url)

        _safe_add_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="scan.running",
            metadata={"scan_id": scan_id, "target": target_url},
        )

        # ---------- 2. Callbacks ----------
        last_progress = {"pct": -1, "at": 0.0}

        def _progress(pct: int, module: str) -> None:
            # Throttle: só commita se mudou >=5% ou passaram >=2s
            import time as _t
            now = _t.monotonic()
            if pct - last_progress["pct"] < 5 and (now - last_progress["at"]) < 2.0:
                return
            last_progress["pct"] = pct
            last_progress["at"] = now
            with app.app_context():
                try:
                    s = db.session.get(Scan, scan_id)
                    if s and s.status == "running":
                        s.progress = min(100, max(0, int(pct)))
                        # Guarda módulo atual no result (sem overwrite)
                        try:
                            data = json.loads(s.result) if s.result else {}
                        except Exception:
                            data = {}
                        data["current_module"] = module
                        s.result = json.dumps(data, default=str)
                        db.session.commit()
                except Exception:
                    db.session.rollback()

        def _cancelled() -> bool:
            # Verifica o evento local primeiro (rápido), depois a BD
            if is_stopped(scan_id):
                return True
            with app.app_context():
                s = db.session.get(Scan, scan_id)
                return not s or s.status in ("paused", "failed", "deleted")

        # ---------- 3. Executa o scanner ----------
        try:
            result = run_scan_sync(
                scan_id=scan_id,
                target_url=target_url,
                timeout=timeout,
                max_concurrency=max_concurrency,
                authorized_scope=[target_url],
                options=options,
                cookies=options.get("cookies"),    # ← NOVO
                progress_cb=_progress,
                cancel_cb=_cancelled,
            )
        except Exception as e:
            log.exception("Scan %s falhou na execução", scan_id)
            with app.app_context():
                s = db.session.get(Scan, scan_id)
                if s:
                    s.status = "failed"
                    s.error_message = str(e)[:2000]
                    s.completed_at = _utcnow()
                    db.session.commit()
            _safe_add_audit(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="scan.failed",
                metadata={"scan_id": scan_id, "error": str(e)[:500]},
            )
            return

        # ---------- 4. Persiste findings ----------
        with app.app_context():
            s = db.session.get(Scan, scan_id)
            if not s:
                log.warning("Scan %s desapareceu durante a execução", scan_id)
                return

            if s.status in ("paused", "failed", "deleted"):
                log.info("Scan %s cancelado — a não gravar como completed", scan_id)
                _safe_add_audit(
                    db,
                    tenant_id=s.tenant_id,
                    user_id=s.user_id,
                    action="scan.cancelled",
                    metadata={"scan_id": scan_id, "status": s.status},
                )
                return

            from models import Vulnerability

            # --- Grava findings (um a um, resiliente) ---
            persisted = 0
            for f in result.get("findings", []):
                try:
                    severity = (f.get("severity") or "info").lower()
                    if severity not in ("critical", "high", "medium", "low", "info"):
                        severity = "info"

                    cvss_val = f.get("cvss")
                    try:
                        cvss = float(cvss_val) if cvss_val is not None else None
                    except (TypeError, ValueError):
                        cvss = None

                    evidence = f.get("evidence")
                    evidence_str = (
                        evidence if isinstance(evidence, str)
                        else json.dumps(evidence or {}, default=str)
                    )

                    # Preferir endpoint (path específico) sobre asset (host)
                    affected = (
                        f.get("endpoint")
                        or f.get("asset")
                        or target_url
                    )

                    db.session.add(Vulnerability(
                        scan_id=scan_id,
                        tenant_id=s.tenant_id,
                        severity=severity,
                        title=(f.get("title") or "Finding")[:255],
                        cwe=(f.get("cwe") or None),
                        cvss=cvss,
                        description=f.get("description"),
                        evidence=evidence_str,
                        remediation=f.get("remediation"),
                        affected_url=affected[:2048] if affected else target_url,
                        status="pending",
                    ))
                    persisted += 1
                except Exception:
                    log.exception("Falha a gravar finding do scan %s", scan_id)
                    db.session.rollback()
                    continue

            # --- Score ---
            weights = {"critical": 25, "high": 10, "medium": 4, "low": 1, "info": 0}
            penalty = sum(
                weights.get((f.get("severity") or "info").lower(), 0)
                for f in result.get("findings", [])
            )

            s.status = "completed"
            s.progress = 100
            s.completed_at = _utcnow()
            s.duration_seconds = int(result.get("elapsed_seconds") or 0)
            s.score = max(0, 100 - penalty) if result.get("findings_total") else 100
            s.result = json.dumps({
                "findings_total": result.get("findings_total", 0),
                "findings_by_severity": result.get("findings_by_severity", {}),
                "errors": result.get("errors", []),
                "modules_available": result.get("modules_available", []),
                "target": result.get("target"),
                "persisted": persisted,
            }, default=str)
            db.session.commit()

            # ← CORREÇÃO: guardar o score AQUI, ainda dentro do contexto.
            # Depois do commit, o SQLAlchemy expira o objeto `s`; ao sair
            # do `with app.app_context()`, a sessão fecha e qualquer acesso
            # a `s.xxx` rebenta com DetachedInstanceError.
            final_score = s.score

            log.info(
                "Scan %s concluído: %d findings (%d persistidos) em %ss",
                scan_id,
                result.get("findings_total", 0),
                persisted,
                result.get("elapsed_seconds", 0),
            )

        _safe_add_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="scan.completed",
            metadata={
                "scan_id": scan_id,
                "target": target_url,
                "findings": result.get("findings_total", 0),
                "persisted": persisted,
                "duration_s": result.get("elapsed_seconds", 0),
                "score": final_score,          # ← usa a cópia local
            },
        )
    finally:
        _cleanup(scan_id)