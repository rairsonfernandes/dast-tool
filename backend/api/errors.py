"""Error handlers globais."""
import logging

from flask import jsonify

from extensions import db

log = logging.getLogger("api.errors")


def register_error_handlers(app):
    @app.errorhandler(400)
    def e400(e):
        return jsonify({"error": getattr(e, "description", "Pedido inválido.")}), 400

    @app.errorhandler(401)
    def e401(e):
        return jsonify({"error": "Não autorizado."}), 401

    @app.errorhandler(403)
    def e403(e):
        return jsonify({"error": "Sem permissão."}), 403

    @app.errorhandler(404)
    def e404(e):
        return jsonify({"error": "Não encontrado."}), 404

    @app.errorhandler(405)
    def e405(e):
        return jsonify({"error": "Método não permitido."}), 405

    @app.errorhandler(413)
    def e413(e):
        return jsonify({"error": "Pedido grande."}), 413

    @app.errorhandler(429)
    def e429(e):
        return jsonify({"error": "Demasiados pedidos."}), 429

    @app.errorhandler(500)
    def e500(e):
        log.exception("Erro 500")
        db.session.rollback()
        return jsonify({"error": "Erro no servidor."}), 500