"""Registo central dos blueprints."""
from api.auth.routes import bp as auth_bp
from api.auth.oauth import bp as oauth_bp
from api.auth.password import bp as password_bp
from api.scans.routes import bp as scans_bp
from api.vulnerabilities.routes import bp as vulns_bp
from api.reports.routes import bp as reports_bp
from api.dashboard.routes import bp as dashboard_bp
from api.settings.routes import bp as settings_bp
from api.admin.routes import bp as admin_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(oauth_bp)
    app.register_blueprint(password_bp)
    app.register_blueprint(scans_bp)
    app.register_blueprint(vulns_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(admin_bp)