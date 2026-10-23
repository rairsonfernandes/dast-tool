"""
Envio de emails transacionais via EmailJS (HTTP API).
"""
import os
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("email")
logging.basicConfig(level=logging.INFO)


def _send(to: str, subject: str, html: str, reset_url: str = "") -> bool:
    service_id = os.getenv("EMAILJS_SERVICE_ID")
    template_id = os.getenv("EMAILJS_TEMPLATE_ID")
    public_key = os.getenv("EMAILJS_PUBLIC_KEY")

    if not service_id or not template_id or not public_key:
        log.error("[EmailJS] NÃO CONFIGURADO — não envia para %s", to)
        return False

    url = "https://api.emailjs.com/api/v1.0/email/send"
    
    # Estas variáveis vão preencher os {{}} no template do EmailJS
    payload = {
        "service_id": service_id,
        "template_id": template_id,
        "user_id": public_key,
        "template_params": {
            "to_email": to,
            "subject": subject,
            "reset_url": reset_url,
        }
    }

    try:
        log.info("[EmailJS] A enviar para %s", to)
        response = requests.post(url, json=payload, timeout=15)
        
        if response.status_code == 200:
            log.info("[EmailJS] ✅ Enviado para %s", to)
            return True
        else:
            log.error("[EmailJS] ❌ Falhou (%s): %s", response.status_code, response.text)
            return False
    except Exception as e:
        log.exception("[EmailJS] ❌ Erro de rede para %s: %s", to, e)
        return False


def send_password_reset(to: str, reset_url: str, expires_minutes: int) -> bool:
    log.info("[RESET] a preparar email para %s", to)
    subject = "Redefinir password — Sentinel"
    # O HTML agora está no template do EmailJS, então enviamos vazio daqui
    result = _send(to, subject, html="", reset_url=reset_url)
    log.info("[RESET] resultado do envio para %s: %s", to, result)
    return result


def send_welcome_email(to: str, app_url: str, provider: str | None = None) -> bool:
    log.info("[WELCOME] Envio não implementado via EmailJS.")
    return True