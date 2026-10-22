"""Reports — listar, criar, download (token na URL), stats, eliminar (1/bulk/todos)."""
from datetime import datetime, timedelta, timezone
import logging

from flask import Blueprint, request, jsonify, Response
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from extensions import db, limiter
from models import User, Report, Scan, Vulnerability   # ← Scan e Vulnerability adicionados
from auth import require_auth, decode_token
from api.deps import audit
from config import get_config
from reports.generator import generate_csv, generate_pdf

bp = Blueprint("reports", __name__, url_prefix="/api/reports")
cfg = get_config()
log = logging.getLogger("api.reports")


def _utcnow():
    return datetime.now(timezone.utc)


def _download_serializer():
    return URLSafeTimedSerializer(cfg.SECRET_KEY, salt="report-download")


def _sign_download_token(report_id: str, user_id: str) -> str:
    return _download_serializer().dumps({"rid": report_id, "uid": user_id})


def _verify_download_token(token: str, max_age=300) -> dict | None:
    try:
        return _download_serializer().loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None


def _user_report(report_id: str) -> Report | None:
    return Report.query.filter_by(id=report_id, user_id=request.user_id).first()


# ============================================================
# ROTAS ESTÁTICAS
# ============================================================
@bp.get("")
@require_auth
def list_reports():
    reports = (
        Report.query.filter_by(user_id=request.user_id)
        .order_by(Report.created_at.desc()).all()
    )
    return jsonify({
        "items": [r.to_dict() for r in reports],
        "total": len(reports),
        "counts": {
            "pdf": sum(1 for r in reports if r.format == "pdf"),
            "csv": sum(1 for r in reports if r.format == "csv"),
        },
    })


@bp.delete("")
@require_auth
@limiter.limit("5/hour")
def delete_all_reports():
    if request.headers.get("X-Confirm-Delete") != "yes":
        return jsonify({
            "error": "Confirmação obrigatória. Envia o header X-Confirm-Delete: yes."
        }), 400

    reports = Report.query.filter_by(user_id=request.user_id).all()
    count = len(reports)
    for r in reports:
        db.session.delete(r)
    db.session.commit()

    audit("report.delete_all", count=count)
    return jsonify({"deleted": count})


@bp.delete("/bulk")
@require_auth
@limiter.limit("10/hour")
def delete_bulk_reports():
    if request.headers.get("X-Confirm-Delete") != "yes":
        return jsonify({
            "error": "Confirmação obrigatória. Envia o header X-Confirm-Delete: yes."
        }), 400

    data = request.get_json(silent=True) or {}
    ids = data.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "Envia 'ids' como lista não vazia."}), 400

    reports = (
        Report.query
        .filter(Report.user_id == request.user_id, Report.id.in_(ids))
        .all()
    )
    count = len(reports)
    for r in reports:
        db.session.delete(r)
    db.session.commit()

    audit("report.delete_bulk", count=count, ids=ids[:20])
    return jsonify({"deleted": count})


@bp.post("")
@require_auth
@limiter.limit("10/hour")
def create_report():
    data = request.get_json(silent=True) or {}
    rtype = (data.get("type") or "executive").strip().lower()
    fmt = (data.get("format") or "PDF").strip().upper()
    period = (data.get("period") or "last_7_days").strip()
    scan_id = data.get("scan_id")
    if fmt not in ("PDF", "CSV"):
        return jsonify({"error": "Formato inválido."}), 400

    # Validação: se scan_id foi passado, tem de existir e pertencer ao user
    if scan_id:
        scan_obj = Scan.query.filter_by(id=scan_id, user_id=request.user_id).first()
        if not scan_obj:
            return jsonify({"error": "Scan não encontrado."}), 404

    user = db.session.get(User, request.user_id)
    r = Report(
        user_id=request.user_id,
        tenant_id=user.tenant_id if user else None,
        scan_id=scan_id,
        name=f"Relatório {rtype.title()} — {period}",
        type=rtype, format=fmt.lower(), file_size_bytes=0, status="ready",
    )
    db.session.add(r)
    db.session.commit()
    audit("report.create", report_id=r.id, type=rtype, format=fmt)
    return jsonify({
        **r.to_dict(),
        "download_token": _sign_download_token(r.id, str(request.user_id)),
    }), 201


@bp.get("/stats")
@require_auth
def reports_stats():
    from sqlalchemy import func
    try:
        days = int(request.args.get("days", 7))
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(90, days))

    today = _utcnow().date()
    start = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc)

    rows = (
        db.session.query(func.date(Report.created_at), func.count(Report.id))
        .filter(Report.user_id == request.user_id, Report.created_at >= start_dt)
        .group_by(func.date(Report.created_at)).all()
    )
    counts = {str(k): int(v) for k, v in rows}

    out, total = [], 0
    for i in range(days):
        d = start + timedelta(days=i)
        key = d.isoformat()
        c = counts.get(key, 0)
        total += c
        out.append({"date": key, "label": d.strftime("%d"),
                    "weekday": d.strftime("%a"), "count": c})
    return jsonify({"days": out, "total": total, "range_days": days})


# ============================================================
# ROTAS DINÂMICAS
# ============================================================
@bp.delete("/<report_id>")
@require_auth
def delete_report(report_id):
    r = _user_report(report_id)
    if not r:
        return jsonify({"error": "Relatório não encontrado."}), 404
    db.session.delete(r)
    db.session.commit()
    audit("report.delete", report_id=report_id)
    return jsonify({"deleted": True})


@bp.get("/<report_id>/download")
def download_report(report_id):
    """
    Aceita DOIS modos:
      1. Bearer token no header (para fetch/axios)
      2. ?token=<jwt ou download_token> na URL (para window.open / <a href>)
    """
    # Modo 1: header Authorization
    user_id = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = decode_token(auth[7:].strip())
        if payload:
            user_id = payload.get("user_id")

    # Modo 2: query string
    if not user_id:
        qs_token = request.args.get("token", "").strip()
        if qs_token:
            payload = decode_token(qs_token)
            if payload:
                user_id = payload.get("user_id")
            else:
                data = _verify_download_token(qs_token)
                if data:
                    user_id = data.get("uid")
                    if data.get("rid") != report_id:
                        return jsonify({"error": "Token não corresponde ao relatório."}), 403

    if not user_id:
        return jsonify({"error": "Não autorizado."}), 401

    r = Report.query.filter_by(id=report_id, user_id=user_id).first()
    if not r:
        return jsonify({"error": "Relatório não encontrado."}), 404

    # --- Puxa os dados REAIS da BD ---
    scan = None
    vulns = []
    try:
        if r.scan_id:
            scan = db.session.get(Scan, r.scan_id)
            if scan and str(scan.user_id) != str(user_id):
                scan = None  # scan de outro user, não expor
        if scan:
            vulns = (
                Vulnerability.query
                .filter_by(scan_id=scan.id)
                .order_by(Vulnerability.discovered_at.desc())
                .all()
            )
        else:
            # Relatório global: todas as vulns dos scans do user
            subq = db.session.query(Scan.id).filter(Scan.user_id == user_id)
            vulns = (
                Vulnerability.query
                .filter(Vulnerability.scan_id.in_(subq))
                .order_by(Vulnerability.discovered_at.desc())
                .all()
            )
    except Exception:
        log.exception("Falha a puxar dados do relatório %s", report_id)
        vulns = []

    log.info(
        "Relatório %s: format=%s scan=%s vulns=%d",
        report_id, r.format, getattr(scan, "id", None), len(vulns),
    )

    # --- Gera o ficheiro REAL ---
    try:
        if r.format == "csv":
            content = generate_csv(vulns, scan=scan)
            filename = f"sentinel_report_{r.id}.csv"
            mimetype = "text/csv; charset=utf-8"
        else:
            content = generate_pdf(
                vulns, scan=scan, title=r.name or "Relatório SENTINEL"
            )
            filename = f"sentinel_report_{r.id}.pdf"
            mimetype = "application/pdf"
    except Exception:
        log.exception("Falha a gerar relatório %s (format=%s)", report_id, r.format)
        return jsonify({"error": "Falha ao gerar relatório."}), 500

    # Validação de sanidade: PDF tem de começar por %PDF, CSV tem de ter conteúdo
    if r.format == "pdf" and not content.startswith(b"%PDF"):
        log.error("PDF gerado não começa com %%PDF (len=%d)", len(content))
        return jsonify({"error": "Falha ao gerar PDF válido."}), 500

    # Atualiza tamanho real no registo (best-effort)
    try:
        r.file_size_bytes = len(content)
        db.session.commit()
    except Exception:
        db.session.rollback()

    log.info("Relatório %s gerado: %d bytes", report_id, len(content))

    return Response(
        content,
        mimetype=mimetype,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(content)),
        },
    )