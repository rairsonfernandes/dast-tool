"""
SENTINEL — API Backend (produção)

Ficheiro fino — só bootstrap.
Toda a lógica vive em `api/`.
"""
import logging
import os

from flask import Flask
from dotenv import load_dotenv
from flask_migrate import Migrate

from config import get_config
from extensions import db, limiter, cors
from api.routes import register_blueprints
from api.errors import register_error_handlers
from api.headers import register_security_headers

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("sentinel")

# ============================================
# APP
# ============================================
app = Flask(__name__)
cfg = get_config()
app.config.from_object(cfg)
IS_PROD = os.getenv("FLASK_ENV", "development").lower() == "production"

# ProxyFix
_trusted = int(os.getenv("TRUSTED_PROXIES", "0"))
if _trusted > 0:
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=_trusted, x_proto=_trusted, x_host=_trusted, x_port=_trusted,
    )

# Extensions
db.init_app(app)
cors.init_app(
    app,
    resources={r"/api/*": {"origins": cfg.CORS_ORIGINS}},
    supports_credentials=True,
    max_age=3600,
    allow_headers=[
        "Content-Type", "Authorization", "X-Requested-With",
        "X-Confirm-Delete", "X-Confirm-Danger",
    ],
    expose_headers=["Content-Length"],
)
limiter.init_app(app)

# Flask-Migrate (DEPOIS de db.init_app)
migrate = Migrate(app, db)

# Rotas
register_blueprints(app)
register_error_handlers(app)
register_security_headers(app)


# ============================================
# HEALTH
# ============================================
@app.get("/")
def home():
    return {"status": "ok", "service": "Sentinel API", "version": "1.1.0"}


@app.get("/health")
def health():
    from sqlalchemy import text as sa_text
    from flask import jsonify
    checks = {"db": "ok"}
    ok = True
    try:
        db.session.execute(sa_text("SELECT 1"))
    except Exception:
        log.exception("Health check: DB falhou")
        checks["db"] = "error"
        ok = False
    return jsonify({"status": "healthy" if ok else "unhealthy", **checks}), (200 if ok else 503)


# ============================================
# INIT
# ============================================
if not IS_PROD:
    with app.app_context():
        db.create_all()
    log.info("db.create_all() (dev only).")


if __name__ == "__main__":
    if IS_PROD:
        raise SystemExit("Usa waitress ou gunicorn em produção.")
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", 5000)),
        debug=os.getenv("FLASK_DEBUG", "true").lower() == "true",
    )