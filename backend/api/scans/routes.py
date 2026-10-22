"""Scans: listar, criar, detalhe, pausar/retomar, apagar (1/todos/selecionados), exportar."""
import logging
import os
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, Response, current_app

from extensions import db, limiter
from models import User, Scan, Vulnerability
from auth import require_auth
from api.deps import audit
from workers.scan_worker import start_scan_thread

bp = Blueprint("scans", __name__, url_prefix="/api/scans")
log = logging.getLogger("api.scans")


# ============================================================
# HELPERS
# ============================================================
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _user_or_404(user_id):
    return db.session.get(User, user_id)


def _delete_scan_cascade(scan: Scan) -> None:
    Vulnerability.query.filter_by(scan_id=scan.id).delete(synchronize_session=False)
    db.session.delete(scan)


def _tenant_settings(user) -> dict:
    if not user or not user.tenant_id:
        return {}
    try:
        from models import TenantSettings
        ts = TenantSettings.query.filter_by(tenant_id=user.tenant_id).first()
        return ts.get() if ts else {}
    except Exception:
        log.debug("TenantSettings indisponível", exc_info=True)
        return {}


def _normalize_cookies(raw) -> dict[str, str]:
    """Aceita str ('a=1; b=2'), dict ou None. Devolve dict[str, str]."""
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


def _normalize_headers(raw) -> dict[str, str]:
    """Aceita dict ou None. Devolve dict[str, str]."""
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items() if k and v is not None}


def _start_worker_for(
    scan: Scan,
    user,
    depth: str,
    rate_limit: int,
    crawl: bool,
    authenticated: bool,
    auto_report: bool,
    cookies: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> None:
    """Centraliza o arranque da thread do scanner."""
    options = {
        "max_depth": int(os.getenv("SCANNER_MAX_DEPTH", "3")),
        "requests_per_second": rate_limit,
        "scan_depth": depth,
        "crawl": crawl,
        "authenticated": authenticated,
        "auto_report": auto_report,
    }
    if cookies:
        options["cookies"] = cookies
    if headers:
        options["headers"] = headers

    start_scan_thread(
        current_app._get_current_object(),
        scan.id,
        scan.target_url or scan.url,
        timeout=float(os.getenv("SCANNER_TIMEOUT", "10")),
        max_concurrency=int(os.getenv("SCANNER_CONCURRENCY", "5")),
        options=options,
    )


# ============================================================
# ROTAS ESTÁTICAS
# ============================================================
@bp.get("")
@require_auth
def list_scans():
    scans = (
        Scan.query.filter_by(user_id=request.user_id)
        .order_by(Scan.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({
        "items": [s.to_dict() for s in scans],
        "total": len(scans),
        "page": 1,
        "limit": 50,
    })


@bp.get("/export")
@require_auth
@limiter.limit("10/hour")
def export_scans_csv():
    scans = (
        Scan.query.filter_by(user_id=request.user_id)
        .order_by(Scan.created_at.desc())
        .limit(500)
        .all()
    )
    lines = ["id,url,status,score,created_at,duration_seconds"]
    for s in scans:
        lines.append(
            f"{s.id},{s.target_url},{s.status},{s.score or ''},"
            f"{s.created_at.isoformat() if s.created_at else ''},"
            f"{s.duration_seconds or ''}"
        )
    return Response(
        "\n".join(lines),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="scans_{_utcnow():%Y%m%d}.csv"'
        },
    )


# ============================================================
# CRIAR SCAN
# ============================================================
@bp.post("")
@require_auth
@limiter.limit("20/hour")
def create_scan():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()

    if not url or not url.startswith(("http://", "https://")):
        return jsonify({"error": "URL inválido. Usa http:// ou https://."}), 400
    if len(url) > 2048:
        return jsonify({"error": "URL demasiado longo."}), 400

    user = _user_or_404(request.user_id)
    if not user:
        return jsonify({"error": "Utilizador não encontrado."}), 404

    settings = _tenant_settings(user)
    toggles = settings.get("toggles") or {}

    profile = (
        (data.get("profile") or settings.get("scan_profile") or "owasp_top10")
        .strip().lower()
    )
    depth = (
        (data.get("depth") or settings.get("scan_depth") or "normal")
        .strip().lower()
    )
    try:
        rate_limit = int(data.get("rate_limit") or settings.get("rate_limit") or 5)
    except (TypeError, ValueError):
        rate_limit = 5
    rate_limit = max(0, rate_limit)

    body_options = data.get("options") or {}
    crawl = bool(body_options.get("crawl", toggles.get("crawl", True)))
    authenticated = bool(body_options.get("authenticated", False))
    auto_report = bool(body_options.get("auto_report", toggles.get("auto-pdf", True)))

    # --- NOVO: cookies e headers (top-level ou dentro de options) ---
    raw_cookies = data.get("cookies") or body_options.get("cookies") or ""
    cookies = _normalize_cookies(raw_cookies)
    raw_headers = data.get("headers") or body_options.get("headers") or {}
    headers = _normalize_headers(raw_headers)

    if cookies or headers.get("Authorization"):
        authenticated = True

    scan = Scan(
        user_id=user.id,
        tenant_id=user.tenant_id,
        target_url=url,
        profile=profile,
        status="queued",
        progress=0,
    )
    db.session.add(scan)
    db.session.commit()
    scan_id = scan.id

    log.info(
        "Scan criado: %s user=%s url=%s profile=%s depth=%s rate=%s "
        "crawl=%s auth=%s report=%s cookies=%d headers=%d",
        scan_id, user.id, url, profile, depth, rate_limit,
        crawl, authenticated, auto_report, len(cookies), len(headers),
    )
    audit(
        "scan.create",
        scan_id=scan_id,
        target=url,
        profile=profile,
        depth=depth,
        rate_limit=rate_limit,
        auth=authenticated,
    )

    try:
        _start_worker_for(
            scan, user, depth, rate_limit, crawl, authenticated, auto_report,
            cookies=cookies, headers=headers,
        )
    except Exception:
        log.exception("Falha ao arrancar worker do scan %s", scan_id)
        scan.status = "failed"
        scan.error_message = "Falha ao arrancar scanner."
        db.session.commit()
        return jsonify({"error": "Falha ao arrancar scanner."}), 500

    db.session.refresh(scan)
    return jsonify(scan.to_dict()), 201


# ============================================================
# DELETE TODOS
# ============================================================
@bp.delete("")
@require_auth
@limiter.limit("5/hour")
def delete_all_scans():
    if request.headers.get("X-Confirm-Delete") != "yes":
        return jsonify({
            "error": "Confirmação obrigatória. Envia o header X-Confirm-Delete: yes."
        }), 400

    scans = Scan.query.filter_by(user_id=request.user_id).all()
    count = len(scans)
    for s in scans:
        _delete_scan_cascade(s)
    db.session.commit()

    audit("scan.delete_all", count=count)
    log.info("User %s eliminou %d scans (all)", request.user_id, count)
    return jsonify({"deleted": count})


# ============================================================
# DELETE SELECIONADOS
# ============================================================
@bp.delete("/bulk")
@require_auth
@limiter.limit("10/hour")
def delete_bulk_scans():
    if request.headers.get("X-Confirm-Delete") != "yes":
        return jsonify({
            "error": "Confirmação obrigatória. Envia o header X-Confirm-Delete: yes."
        }), 400

    data = request.get_json(silent=True) or {}
    ids = data.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "Envia 'ids' como lista não vazia."}), 400

    scans = (
        Scan.query
        .filter(Scan.user_id == request.user_id, Scan.id.in_(ids))
        .all()
    )
    count = len(scans)
    for s in scans:
        _delete_scan_cascade(s)
    db.session.commit()

    audit("scan.delete_bulk", count=count, ids=ids[:20])
    log.info("User %s eliminou %d scans (bulk)", request.user_id, count)
    return jsonify({"deleted": count})


# ============================================================
# ROTAS DINÂMICAS
# ============================================================
@bp.get("/<scan_id>")
@require_auth
def get_scan(scan_id):
    scan = Scan.query.filter_by(id=scan_id, user_id=request.user_id).first()
    if not scan:
        return jsonify({"error": "Scan não encontrado."}), 404
    return jsonify(scan.to_dict())


@bp.get("/<scan_id>/vulnerabilities")
@require_auth
def list_scan_vulns(scan_id):
    scan = Scan.query.filter_by(id=scan_id, user_id=request.user_id).first()
    if not scan:
        return jsonify({"error": "Scan não encontrado."}), 404
    vulns = (
        Vulnerability.query.filter_by(scan_id=scan_id)
        .order_by(Vulnerability.discovered_at.desc())
        .all()
    )
    return jsonify({"items": [v.to_dict() for v in vulns], "total": len(vulns)})


@bp.post("/<scan_id>/pause")
@require_auth
def pause_scan(scan_id):
    scan = Scan.query.filter_by(id=scan_id, user_id=request.user_id).first()
    if not scan:
        return jsonify({"error": "Scan não encontrado."}), 404
    if scan.status != "running":
        return jsonify({"error": "Só scans em execução podem ser pausados."}), 400
    scan.status = "paused"
    db.session.commit()
    audit("scan.pause", scan_id=scan.id)
    return jsonify(scan.to_dict())


@bp.post("/<scan_id>/resume")
@require_auth
def resume_scan(scan_id):
    scan = Scan.query.filter_by(id=scan_id, user_id=request.user_id).first()
    if not scan:
        return jsonify({"error": "Scan não encontrado."}), 404
    if scan.status != "paused":
        return jsonify({"error": "Só scans pausados podem ser retomados."}), 400

    user = _user_or_404(request.user_id)
    if not user:
        return jsonify({"error": "Utilizador não encontrado."}), 404

    scan.status = "queued"
    scan.progress = 0
    scan.error_message = None
    scan.completed_at = None
    db.session.commit()

    audit("scan.resume", scan_id=scan.id)

    settings = _tenant_settings(user)
    toggles = settings.get("toggles") or {}
    depth = (settings.get("scan_depth") or "normal").strip().lower()
    try:
        rate_limit = int(settings.get("rate_limit") or 5)
    except (TypeError, ValueError):
        rate_limit = 5
    rate_limit = max(0, rate_limit)

    crawl = bool(toggles.get("crawl", True))
    auto_report = bool(toggles.get("auto-pdf", True))

    # Nota: no resume, cookies/headers não são recuperados (não persistimos).
    # O utilizador terá de criar um novo scan se precisar de auth.
    try:
        _start_worker_for(scan, user, depth, rate_limit, crawl, False, auto_report)
    except Exception:
        log.exception("Falha ao retomar scan %s", scan.id)
        scan.status = "failed"
        scan.error_message = "Falha ao retomar scanner."
        db.session.commit()
        return jsonify({"error": "Falha ao retomar scanner."}), 500

    db.session.refresh(scan)
    return jsonify(scan.to_dict())


@bp.delete("/<scan_id>")
@require_auth
def delete_scan(scan_id):
    scan = Scan.query.filter_by(id=scan_id, user_id=request.user_id).first()
    if not scan:
        return jsonify({"error": "Scan não encontrado."}), 404
    _delete_scan_cascade(scan)
    db.session.commit()
    audit("scan.delete", scan_id=scan_id)
    return jsonify({"deleted": True})