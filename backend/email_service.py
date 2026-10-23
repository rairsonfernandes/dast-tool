"""
Envio de emails transacionais.
"""
import os
import ssl
import smtplib
import logging
from email.message import EmailMessage
from email.utils import formataddr
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("email")
logging.basicConfig(level=logging.INFO)


# ============================================================
# DETECÇÃO
# ============================================================
def _smtp_configured() -> bool:
    return bool(
        os.getenv("SMTP_HOST")
        and os.getenv("SMTP_USER")
        and os.getenv("SMTP_PASS")
    )


# ============================================================
# BUILD MESSAGE (SMTP)
# ============================================================
def _build_message(to: str, subject: str, html: str, text: str) -> EmailMessage:
    from_addr = os.getenv("SMTP_FROM", os.getenv("SMTP_USER"))
    from_name = os.getenv("SMTP_FROM_NAME", "Sentinel")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_addr))
    msg["To"] = to
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


# ============================================================
# SEND — Resend → SMTP fallback
# ============================================================
def _send(to: str, subject: str, html: str, text: str) -> bool:
    # ---------- Resend ----------
    resend_key = os.getenv("RESEND_API_KEY")
    if resend_key:
        import resend as resend_sdk
        resend_sdk.api_key = resend_key
        from_name = os.getenv("RESEND_FROM_NAME", "Sentinel")
        from_addr = os.getenv("RESEND_FROM", "onboarding@resend.dev")
        try:
            resend_sdk.Emails.send({
                "from": f"{from_name} <{from_addr}>",
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
            })
            log.info("[Resend] ✅ Enviado para %s", to)
            return True
        except Exception as e:
            log.warning(
                "[Resend] ❌ Falhou (%s) — a tentar SMTP como fallback",
                str(e)[:120],
            )

    # ---------- SMTP ----------
    if not _smtp_configured():
        log.error("[SMTP] NÃO CONFIGURADO — não envia para %s", to)
        return False

    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", 587))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")

    log.info("[SMTP] A enviar para %s (host=%s, port=%s)", to, host, port)

    msg = _build_message(to, subject, html, text)

    try:
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                smtp.login(user, password)
                smtp.send_message(msg)
        log.info("[SMTP] ✅ Enviado para %s", to)
        return True
    except Exception as e:
        log.exception("[SMTP] ❌ Falhou para %s: %s", to, e)
        return False


# ============================================================
# TEMPLATE HTML — REDEFINIR PASSWORD
# ============================================================
def _render_reset_html(reset_url: str, expires_minutes: int) -> str:
    return f"""\
<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Redefinir password — Sentinel</title>
</head>
<body style="margin:0;padding:0;background-color:#0B1220;color:#F1F5F9;font-family:'Inter',Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <div style="display:none;font-size:1px;color:#0B1220;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Redefine a tua password Sentinel. Link válido por {expires_minutes} minutos.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#0B1220;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;">
          <tr>
            <td style="padding-bottom:32px;text-align:left;">
              <div style="font-family:'Space Grotesk',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:4px;color:#FFFFFF;text-transform:uppercase;">
                SENTINEL
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:16px;text-align:left;">
              <h1 style="margin:0;font-family:'Space Grotesk',Arial,sans-serif;font-size:24px;line-height:1.3;font-weight:700;color:#FFFFFF;">
               Redefinir senha 
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;text-align:left;">
              <p style="margin:0;font-size:15px;line-height:1.65;color:rgba(241,245,249,0.65);">
                Recebemos um pedido para Redefinir a senha da tua conta Sentinel.
                Clica no botão abaixo para escolher uma nova password.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;text-align:left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#16C7B7;border-radius:6px;">
                    <a href="{reset_url}"
                       target="_blank"
                       style="display:inline-block;padding:14px 28px;font-family:'Inter',Arial,sans-serif;font-size:14px;font-weight:700;color:#0B1220;text-decoration:none;letter-spacing:0.2px;border-radius:6px;">
                      Redefinir senha  →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;text-align:left;">
              <p style="margin:0 0 6px 0;font-size:14px;line-height:1.55;color:#16C7B7;font-weight:600;">
                Link válido por {expires_minutes} minutos
              </p>
              <p style="margin:0;font-size:13px;line-height:1.55;color:rgba(241,245,249,0.55);">
                Depois de expirar, podes pedir um novo em <a href="https://dast-tool.vercel.app" style="color:#16C7B7;text-decoration:none;">dast-tool.vercel.app</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <div style="height:1px;background-color:rgba(241,245,249,0.08);font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:6px;text-align:left;">
              <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:rgba(241,245,249,0.5);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;">
                Se o botão não funcionar
              </p>
              <p style="margin:0;font-size:13px;line-height:1.55;color:rgba(241,245,249,0.65);">
                Copia e cola este link no teu browser:
              </p>
              <p style="margin:6px 0 0 0;font-size:12px;line-height:1.55;color:rgba(241,245,249,0.75);word-break:break-all;">
                <a href="{reset_url}" target="_blank"
                   style="color:#16C7B7;text-decoration:none;">
                  {reset_url}
                </a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:40px;text-align:left;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:rgba(241,245,249,0.35);font-family:'JetBrains Mono',monospace;letter-spacing:0.5px;">
                © 2026 Sentinel
              </p>
              <p style="margin:4px 0 0 0;font-size:11px;line-height:1.5;color:rgba(241,245,249,0.35);">
                <a href="mailto:raynfernandes214@gmail.com" style="color:rgba(241,245,249,0.45);text-decoration:none;">
                  raynfernandes214@gmail.com
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _render_reset_text(reset_url: str, expires_minutes: int) -> str:
    return f"""\
SENTINEL
========================================
Redefinir password
========================================

Recebemos um pedido para redefinir a password da tua conta Sentinel.
Clica no link abaixo para escolher uma nova password.

{reset_url}

Link válido por {expires_minutes} minutos.
Depois de expirar, podes pedir um novo em https://dast-tool.vercel.app.

© 2026 Sentinel
raynfernandes214@gmail.com
"""


# ============================================================
# TEMPLATE HTML — BOAS-VINDAS
# ============================================================
def _render_welcome_html(app_url: str, user_email: str, provider: str | None = None) -> str:
    provider_note = ""
    if provider == "google":
        provider_note = "<p style=\"margin:0 0 16px 0;font-size:14px;line-height:1.6;color:rgba(241,245,249,0.65);\">A tua conta foi criada através do <strong style=\"color:#F1F5F9;\">Google</strong>. Podes entrar sempre com o botão Google na página de login.</p>"
    elif provider == "github":
        provider_note = "<p style=\"margin:0 0 16px 0;font-size:14px;line-height:1.6;color:rgba(241,245,249,0.65);\">A tua conta foi criada através do <strong style=\"color:#F1F5F9;\">GitHub</strong>. Podes entrar sempre com o botão GitHub na página de login.</p>"

    return f"""\
<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Bem-vindo ao Sentinel</title>
</head>
<body style="margin:0;padding:0;background-color:#0B1220;color:#F1F5F9;font-family:'Inter',Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <div style="display:none;font-size:1px;color:#0B1220;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Bem-vindo ao Sentinel. Auditorias de segurança em minutos, não em horas.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#0B1220;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;">
          <tr>
            <td style="padding-bottom:32px;text-align:left;">
              <div style="font-family:'Space Grotesk',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:4px;color:#FFFFFF;text-transform:uppercase;">
                SENTINEL
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:16px;text-align:left;">
              <h1 style="margin:0;font-family:'Space Grotesk',Arial,sans-serif;font-size:24px;line-height:1.3;font-weight:700;color:#FFFFFF;">
                Bem-vindo ao Sentinel
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;text-align:left;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:rgba(241,245,249,0.65);">
                A tua conta foi criada com sucesso em <strong style="color:#F1F5F9;">{user_email}</strong>.
                A partir de agora tens acesso ao dashboard de segurança, onde podes analisar as tuas aplicações web.
              </p>
              {provider_note}
              <p style="margin:0;font-size:15px;line-height:1.65;color:rgba(241,245,249,0.65);">
                O Sentinel corre 13 módulos de deteção contra o URL que indicares,
                cobre o OWASP Top 10 e devolve um relatório com severidade, evidência
                e recomendações de correção.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;text-align:left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#16C7B7;border-radius:6px;">
                    <a href="{app_url}/dashboard"
                       target="_blank"
                       style="display:inline-block;padding:14px 28px;font-family:'Inter',Arial,sans-serif;font-size:14px;font-weight:700;color:#0B1220;text-decoration:none;letter-spacing:0.2px;border-radius:6px;">
                      Abrir dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;text-align:left;">
              <p style="margin:0 0 6px 0;font-size:14px;line-height:1.55;color:#16C7B7;font-weight:600;">
                O que podes fazer agora
              </p>
              <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(241,245,249,0.55);">
                · Analisar uma aplicação web em menos de 15 minutos<br>
                · Consultar o histórico de scans anteriores<br>
                · Exportar relatórios em JSON ou PDF<br>
                · Ver vulnerabilidades priorizadas por severidade
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <div style="height:1px;background-color:rgba(241,245,249,0.08);font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;text-align:left;">
              <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:rgba(241,245,249,0.5);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;">
                Nota de segurança
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:rgba(241,245,249,0.55);">
                Nunca vamos pedir-te a password por email. Se receberes algum pedido
                desse tipo, ignora e reporta-nos em <a href="mailto:raynfernandes214@gmail.com" style="color:#16C7B7;text-decoration:none;">raynfernandes214@gmail.com</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;text-align:left;">
              <p style="margin:0;font-size:13px;line-height:1.55;color:rgba(241,245,249,0.55);">
                Se preferires, abre o site diretamente:
              </p>
              <p style="margin:6px 0 0 0;font-size:12px;line-height:1.55;color:rgba(241,245,249,0.75);word-break:break-all;">
                <a href="{app_url}" target="_blank" style="color:#16C7B7;text-decoration:none;">{app_url}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="text-align:left;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:rgba(241,245,249,0.35);font-family:'JetBrains Mono',monospace;letter-spacing:0.5px;">
                © 2026 Sentinel
              </p>
              <p style="margin:4px 0 0 0;font-size:11px;line-height:1.5;color:rgba(241,245,249,0.35);">
                <a href="mailto:raynfernandes214@gmail.com" style="color:rgba(241,245,249,0.45);text-decoration:none;">
                  raynfernandes214@gmail.com
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _render_welcome_text(app_url: str, user_email: str, provider: str | None = None) -> str:
    provider_line = ""
    if provider == "google":
        provider_line = "A tua conta foi criada através do Google. Podes entrar sempre com o botão Google.\n\n"
    elif provider == "github":
        provider_line = "A tua conta foi criada através do GitHub. Podes entrar sempre com o botão GitHub.\n\n"

    return f"""\
SENTINEL
========================================
Bem-vindo ao Sentinel
========================================

A tua conta foi criada com sucesso em {user_email}.

{provider_line}O Sentinel corre 13 módulos de deteção contra o URL que indicares,
cobre o OWASP Top 10 e devolve um relatório com severidade, evidência
e recomendações de correção.

O que podes fazer agora:
  · Analisar uma aplicação web em menos de 15 minutos
  · Consultar o histórico de scans anteriores
  · Exportar relatórios em JSON ou PDF
  · Ver vulnerabilidades priorizadas por severidade

Abre o dashboard:
{app_url}/dashboard

Nota de segurança:
Nunca vamos pedir-te a password por email. Se receberes algum pedido
desse tipo, ignora e reporta-nos em raynfernandes214@gmail.com.

© 2026 Sentinel
raynfernandes214@gmail.com
"""


def send_welcome_email(to: str, app_url: str, provider: str | None = None) -> bool:
    log.info("[WELCOME] a preparar email para %s", to)

    html = _render_welcome_html(app_url, to, provider)
    text = _render_welcome_text(app_url, to, provider)
    subject = "Bem-vindo ao Sentinel"

    result = _send(to, subject, html, text)
    log.info("[WELCOME] resultado do envio para %s: %s", to, result)
    return result

# ============================================================
# API PÚBLICA
# ============================================================
def send_password_reset(to: str, reset_url: str, expires_minutes: int) -> bool:
    log.info("[RESET] a preparar email para %s", to)

    html = _render_reset_html(reset_url, expires_minutes)
    text = _render_reset_text(reset_url, expires_minutes)
    subject = "Redefinir password — Sentinel"

    result = _send(to, subject, html, text)
    log.info("[RESET] resultado do envio para %s: %s", to, result)
    return result