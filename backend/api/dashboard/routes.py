"""Dashboard — stats agregadas, radar real, eventos reais."""
import hashlib
import json
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify

from extensions import db
from models import (
    User, Scan, Vulnerability, AuditLog,
    ThreatEvent, HostMetric,
)
from auth import require_auth

bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# RADAR REAL
# ============================================================
def _build_radar(user_id: str, tenant_id: str | None) -> dict | None:
    """
    Constrói um radar real a partir dos scans do user:
      - target:    target do scan mais recente
      - openPorts: nº de portas encontradas (result.open_ports) ou fallback = nº scans
      - packets:   "N scans"
      - points:    1 ponto por scan, color por severidade máxima encontrada
    """
    scans = (
        Scan.query.filter_by(user_id=user_id)
        .order_by(Scan.created_at.desc())
        .limit(20)
        .all()
    )
    if not scans:
        return None

    target = scans[0].target_url or scans[0].url or "—"

    # Agrupar vulns por scan
    vulns_by_scan: dict[str, list[Vulnerability]] = {}
    scan_ids = [s.id for s in scans]
    if scan_ids:
        for v in Vulnerability.query.filter(Vulnerability.scan_id.in_(scan_ids)).all():
            vulns_by_scan.setdefault(v.scan_id, []).append(v)

    # Pontos: 1 por scan
    points = []
    open_ports = 0
    for s in scans[:8]:
        vs = vulns_by_scan.get(s.id, [])
        sevs = {v.severity.lower() for v in vs if v.severity}
        if "critical" in sevs or "high" in sevs:
            color = "red"
        elif "medium" in sevs:
            color = "amber"
        else:
            color = "green"

        # posição determinística baseada no id
        h = int(hashlib.sha256(str(s.id).encode()).hexdigest(), 16)
        points.append({
            "top": f"{(h % 60) + 15}%",
            "left": f"{((h >> 8) % 60) + 15}%",
            "color": color,
        })

    # Portas reais do result (se existirem)
    for s in scans:
        if not s.result:
            continue
        try:
            r = json.loads(s.result)
        except Exception:
            continue
        ports = r.get("open_ports") or r.get("ports") or []
        if isinstance(ports, list):
            open_ports += len(ports)

    # Fallback: sem portas reais → nº de scans (mínimo 1)
    if open_ports == 0:
        open_ports = len(scans)

    return {
        "target": target,
        "openPorts": open_ports,
        "packets": f"{len(scans)} scans",
        "points": points,
    }


# ============================================================
# HEALTH REAL (se existir HostMetric)
# ============================================================
def _build_health(tenant_id: str | None) -> dict | None:
    if not tenant_id:
        return None
    try:
        m = (
            HostMetric.query.filter_by(tenant_id=tenant_id)
            .order_by(HostMetric.recorded_at.desc())
            .first()
        )
        if not m:
            return None

        last_backup = "—"
        if m.last_backup_at:
            lb = m.last_backup_at
            if lb.tzinfo is None:
                lb = lb.replace(tzinfo=timezone.utc)
            delta = _utcnow() - lb
            hours = int(delta.total_seconds() // 3600)
            last_backup = f"há {hours}h" if hours >= 1 else "agora"

        return {
            "cpu": m.cpu,
            "ram": m.ram,
            "disk": m.disk,
            "network": m.network,
            "region": m.region,
            "version": m.version,
            "uptime_days": m.uptime_days,
            "last_backup": last_backup,
        }
    except Exception:
        return None


# ============================================================
# STATS
# ============================================================
@bp.get("/stats")
@require_auth
def dashboard_stats():
    user_id = request.user_id
    user = db.session.get(User, user_id)
    tenant_id = user.tenant_id if user else None

    total_scans = Scan.query.filter_by(user_id=user_id).count()
    completed = Scan.query.filter_by(user_id=user_id, status="completed").count()
    running = Scan.query.filter_by(user_id=user_id, status="running").count()
    failed = Scan.query.filter_by(user_id=user_id, status="failed").count()

    vulns = (
        Vulnerability.query
        .join(Scan, Scan.id == Vulnerability.scan_id)
        .filter(Scan.user_id == user_id)
        .all()
    )

    findings = {
        "CRITICAL": sum(1 for v in vulns if v.severity == "critical"),
        "HIGH":     sum(1 for v in vulns if v.severity == "high"),
        "MEDIUM":   sum(1 for v in vulns if v.severity == "medium"),
        "LOW":      sum(1 for v in vulns if v.severity == "low"),
        "INFO":     sum(1 for v in vulns if v.severity == "info"),
    }

    # --- FIX: score semântico ---
    #   total_scans == 0   → None (sem dados)
    #   total_scans > 0 e 0 vulns → 100 (perfeito)
    #   caso contrário → 100 - penalty
    if total_scans == 0:
        security_score = None
    elif not vulns:
        security_score = 100
    else:
        w = {"critical": 25, "high": 10, "medium": 4, "low": 1, "info": 0}
        security_score = max(0, 100 - sum(w.get(v.severity, 0) for v in vulns))

    # --- Eventos recentes (AuditLog) ---
    recent_events = []
    try:
        logs = (
            AuditLog.query.filter_by(user_id=user_id)
            .order_by(AuditLog.created_at.desc())
            .limit(10)
            .all()
        )
        type_map = {
            "auth": "security",
            "scan": "scan",
            "admin": "system",
            "report": "info",
            "vulnerability": "security",
        }
        for l in logs:
            action = l.action or "system"
            evt_type = type_map.get(action.split(".")[0], "system")
            recent_events.append({
                "id": str(l.id),
                "type": evt_type,
                "message": action.replace(".", " → "),
                "timestamp": l.created_at.strftime("%H:%M:%S") if l.created_at else "",
            })
    except Exception:
        pass

    # --- ThreatEvent ---
    threats_blocked = 0
    threats_blocked_delta = None
    try:
        if tenant_id:
            threats_blocked = ThreatEvent.query.filter_by(tenant_id=tenant_id).count()
            last_24 = ThreatEvent.query.filter(
                ThreatEvent.tenant_id == tenant_id,
                ThreatEvent.created_at >= _utcnow() - timedelta(hours=24),
            ).count()
            if threats_blocked:
                threats_blocked_delta = round((last_24 / threats_blocked) * 100)
    except Exception:
        pass

    radar_payload = _build_radar(user_id, tenant_id)
    health_payload = _build_health(tenant_id)

    return jsonify({
        "threatsBlocked": threats_blocked,
        "threatsBlockedDelta": threats_blocked_delta,
        "securityScore": security_score,
        "activeScans": running,
        "criticalVulns": findings["CRITICAL"],
        "totalScans": total_scans,
        "completedScans": completed,
        "failedScans": failed,
        "findings": [{"severity": k, "count": v} for k, v in findings.items()],
        "recentEvents": recent_events,
        "health": health_payload,
        "radar": radar_payload,
    })