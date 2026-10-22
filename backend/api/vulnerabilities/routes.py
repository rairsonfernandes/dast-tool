"""Vulnerabilidades — listar, detalhe, atualizar, corrigir, eliminar (1/bulk/todas)."""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from extensions import db, limiter
from models import Vulnerability, Scan
from auth import require_auth
from api.deps import audit

bp = Blueprint("vulnerabilities", __name__, url_prefix="/api/vulnerabilities")


def _user_vuln(vuln_id: str) -> Vulnerability | None:
    return (
        Vulnerability.query
        .join(Scan, Scan.id == Vulnerability.scan_id)
        .filter(Vulnerability.id == vuln_id, Scan.user_id == request.user_id)
        .first()
    )


# ============================================================
# ROTAS ESTÁTICAS (primeiro)
# ============================================================
@bp.get("")
@require_auth
def list_vulnerabilities():
    vulns = (
        Vulnerability.query
        .join(Scan, Scan.id == Vulnerability.scan_id)
        .filter(Scan.user_id == request.user_id)
        .order_by(Vulnerability.discovered_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({
        "items": [v.to_dict() for v in vulns],
        "total": len(vulns),
        "page": 1,
        "limit": 50,
    })


@bp.delete("")
@require_auth
@limiter.limit("5/hour")
def delete_all_vulnerabilities():
    """
    Elimina TODAS as vulnerabilidades do user autenticado.
    Requer X-Confirm-Delete: yes.
    """
    if request.headers.get("X-Confirm-Delete") != "yes":
        return jsonify({
            "error": "Confirmação obrigatória. Envia o header X-Confirm-Delete: yes."
        }), 400

    # Seleciona todas as vulns dos scans do user
    subq = db.session.query(Scan.id).filter(Scan.user_id == request.user_id)
    vulns = Vulnerability.query.filter(Vulnerability.scan_id.in_(subq)).all()
    count = len(vulns)
    for v in vulns:
        db.session.delete(v)
    db.session.commit()

    audit("vulnerability.delete_all", count=count)
    return jsonify({"deleted": count})


@bp.delete("/bulk")
@require_auth
@limiter.limit("10/hour")
def delete_bulk_vulnerabilities():
    """
    Elimina um conjunto de vulnerabilidades do user.
    Body: {"ids": ["uuid1", ...]}
    Requer X-Confirm-Delete: yes.
    """
    if request.headers.get("X-Confirm-Delete") != "yes":
        return jsonify({
            "error": "Confirmação obrigatória. Envia o header X-Confirm-Delete: yes."
        }), 400

    data = request.get_json(silent=True) or {}
    ids = data.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "Envia 'ids' como lista não vazia."}), 400

    vulns = (
        Vulnerability.query
        .join(Scan, Scan.id == Vulnerability.scan_id)
        .filter(
            Vulnerability.id.in_(ids),
            Scan.user_id == request.user_id,
        )
        .all()
    )
    count = len(vulns)
    for v in vulns:
        db.session.delete(v)
    db.session.commit()

    audit("vulnerability.delete_bulk", count=count, ids=ids[:20])
    return jsonify({"deleted": count})


# ============================================================
# ROTAS DINÂMICAS
# ============================================================
@bp.get("/<vuln_id>")
@require_auth
def get_vulnerability(vuln_id):
    v = _user_vuln(vuln_id)
    if not v:
        return jsonify({"error": "Não encontrada."}), 404
    return jsonify(v.to_dict())


@bp.patch("/<vuln_id>")
@require_auth
def update_vulnerability(vuln_id):
    v = _user_vuln(vuln_id)
    if not v:
        return jsonify({"error": "Não encontrada."}), 404
    data = request.get_json(silent=True) or {}
    if "status" in data:
        s = (data.get("status") or "").lower()
        if s not in ("pending", "fixing", "fixed", "ignored"):
            return jsonify({"error": "Estado inválido."}), 400
        v.status = s
        if s == "fixed":
            v.fixed_at = datetime.now(timezone.utc)
    db.session.commit()
    audit("vulnerability.update", vuln_id=vuln_id, status=v.status)
    return jsonify(v.to_dict())


@bp.post("/<vuln_id>/fix")
@require_auth
def start_vulnerability_fix(vuln_id):
    v = _user_vuln(vuln_id)
    if not v:
        return jsonify({"error": "Não encontrada."}), 404
    v.status = "fixing"
    db.session.commit()
    audit("vulnerability.fix", vuln_id=vuln_id)
    return jsonify({"ok": True, "vulnerability": v.to_dict()})


@bp.delete("/<vuln_id>")
@require_auth
def delete_vulnerability(vuln_id):
    v = _user_vuln(vuln_id)
    if not v:
        return jsonify({"error": "Não encontrada."}), 404
    db.session.delete(v)
    db.session.commit()
    audit("vulnerability.delete", vuln_id=vuln_id)
    return jsonify({"deleted": True})