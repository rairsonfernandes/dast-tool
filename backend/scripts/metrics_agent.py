"""
SENTINEL — Metrics Agent

Lê métricas reais do host (CPU, RAM, disco, rede) e insere um HostMetric
na BD a cada N segundos. Corre em paralelo com o Flask.

Uso:
    python scripts/metrics_agent.py

Ctrl+C para parar.
"""
import os
import sys
import time
import socket
from datetime import datetime, timezone, timedelta

# Permite importar `app`, `models`, etc. quando corrido de dentro de `backend/`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psutil
from dotenv import load_dotenv

load_dotenv()

from app import app  # noqa: E402
from extensions import db  # noqa: E402
from models import HostMetric  # noqa: E402

# ============================================
# CONFIG
# ============================================
TENANT_ID = os.getenv("METRICS_TENANT_ID", "00000000-0000-0000-0000-000000000001")
INTERVAL_SECONDS = int(os.getenv("METRICS_INTERVAL", "60"))
REGION = os.getenv("METRICS_REGION", "local")
VERSION = os.getenv("METRICS_VERSION", "dev")
HOSTNAME = socket.gethostname() or "sentinel-host"

# Disco: usa C:\ no Windows, / em Linux/macOS
DISK_PATH = os.getenv("METRICS_DISK_PATH", "C:\\" if os.name == "nt" else "/")

# Contador de rede (para calcular % aproximada)
_last_net = psutil.net_io_counters()
_last_net_time = time.time()


def _network_percent() -> int:
    """% aproximada de utilização da rede desde a última leitura."""
    global _last_net, _last_net_time
    try:
        now = time.time()
        cur = psutil.net_io_counters()
        elapsed = max(0.001, now - _last_net_time)
        sent = cur.bytes_sent - _last_net.bytes_sent
        recv = cur.bytes_recv - _last_net.bytes_recv
        _last_net = cur
        _last_net_time = now

        # Heurística: 1 MB/s ≈ 1% (ajusta ao teu link)
        mbps = (sent + recv) / elapsed / (1024 * 1024)
        return min(100, int(mbps))
    except Exception:
        return 0


def _collect() -> dict:
    """Lê as métricas reais do host."""
    cpu = int(psutil.cpu_percent(interval=0.5))
    ram = int(psutil.virtual_memory().percent)
    disk = int(psutil.disk_usage(DISK_PATH).percent)
    network = _network_percent()

    boot = psutil.boot_time()
    uptime_days = max(0, int((datetime.now().timestamp() - boot) / 86400))

    # Data do último backup (fictícia, para a UI não mostrar "—")
    last_backup_at = datetime.now(timezone.utc) - timedelta(hours=12)

    return {
        "tenant_id": TENANT_ID,
        "hostname": HOSTNAME,
        "cpu": cpu,
        "ram": ram,
        "disk": disk,
        "network": network,
        "region": REGION,
        "version": VERSION,
        "uptime_days": uptime_days,
        "last_backup_at": last_backup_at,
    }


def run_once() -> None:
    with app.app_context():
        data = _collect()
        m = HostMetric(**data, recorded_at=datetime.now(timezone.utc))
        db.session.add(m)
        db.session.commit()
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"cpu={data['cpu']}% ram={data['ram']}% "
            f"disk={data['disk']}% net={data['network']}% "
            f"uptime={data['uptime_days']}d (id={m.id})"
        )


def main() -> None:
    print(f"Metrics Agent a arrancar (tenant={TENANT_ID}, intervalo={INTERVAL_SECONDS}s)")
    print(f"Host={HOSTNAME}  Região={REGION}  Versão={VERSION}  Disco={DISK_PATH}")
    print("Ctrl+C para parar.\n")
    try:
        while True:
            try:
                run_once()
            except Exception as exc:
                print(f"Erro ao inserir métrica: {exc!r}", file=sys.stderr)
            time.sleep(INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nA parar…")


if __name__ == "__main__":
    main()