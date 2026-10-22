import os
import sys
import signal
import subprocess
import time

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Força o python do venv, independentemente do que invocou este script
VENV_PY = os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")
if not os.path.exists(VENV_PY):
    VENV_PY = os.path.join(BACKEND_DIR, "venv", "bin", "python")  # Linux/macOS
if not os.path.exists(VENV_PY):
    VENV_PY = sys.executable  # fallback

print(f"A usar Python: {VENV_PY}")


def main():
    procs = []

    def shutdown(*_):
        print("\nA parar processos…")
        for p in procs:
            if p.poll() is None:
                p.terminate()
        for p in procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print("A arrancar Flask (app.py)…")
    procs.append(subprocess.Popen([VENV_PY, "app.py"], cwd=BACKEND_DIR))

    time.sleep(1.5)

    print("A arrancar Metrics Agent (scripts/metrics_agent.py)…")
    procs.append(
        subprocess.Popen([VENV_PY, "scripts/metrics_agent.py"], cwd=BACKEND_DIR)
    )

    print("\nAmbos a correr. Ctrl+C para parar.\n")
    try:
        while True:
            for p in procs:
                code = p.poll()
                if code is not None:
                    print(f"[processo pid={p.pid}] terminou com código {code}")
                    shutdown()
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()