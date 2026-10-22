"""Avaliação de TLS e certificados.

Só corre em alvos HTTPS. Para alvos HTTP, reporta "site sem HTTPS"
(que é o problema real) em vez de "TLS não disponível" (falso positivo).
"""
import ssl
import socket
from datetime import datetime, timezone
from urllib.parse import urlparse

from .core import Finding, ScanConfig, make_finding_id


def _host_from(target: str) -> str:
    parsed = urlparse(target if "://" in target else f"http://{target}")
    return parsed.hostname or parsed.netloc or target


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []

    target = config.target or ""
    is_https = target.lower().startswith("https://")
    host = _host_from(target)

    # ---------------------------------------------------------
    # Alvo HTTP: reportar ausência de HTTPS (problema real),
    # NÃO "TLS indisponível" (falso positivo).
    # ---------------------------------------------------------
    if not is_https:
        findings.append(Finding(
            id=make_finding_id("tls", host, "/", "Site sem HTTPS"),
            module="tls",
            title="Site não usa HTTPS",
            severity="medium",
            confidence="high",
            category="tls",
            asset=host,
            endpoint="/",
            evidence={"type": "url", "details": f"target={target}"},
            description=(
                "O alvo é servido exclusivamente por HTTP. Não há TLS, "
                "pelo que o tráfego circula em claro."
            ),
            impact=(
                "Credenciais, cookies e conteúdo podem ser interceptados "
                "ou alterados por um atacante na rede (MITM)."
            ),
            remediation=(
                "Configurar HTTPS com certificado válido (Let's Encrypt, "
                "por exemplo) e redirecionar todo o tráfego HTTP → HTTPS "
                "com HSTS."
            ),
            validation_state="confirmed",
        ))
        return findings

    # ---------------------------------------------------------
    # Alvo HTTPS: testar certificado e protocolo.
    # ---------------------------------------------------------
    port = 443
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
                version = ssock.version()
    except ssl.SSLCertVerificationError as exc:
        findings.append(Finding(
            id=make_finding_id("tls", host, "/", "Certificado inválido"),
            module="tls",
            title="Certificado TLS inválido",
            severity="high",
            confidence="high",
            category="tls",
            asset=host,
            endpoint="/",
            evidence={"type": "tls", "details": str(exc)},
            description="A validação do certificado falhou.",
            impact="Ligação insegura; utilizadores podem ser interceptados.",
            remediation="Renovar ou corrigir a cadeia de certificados.",
            validation_state="confirmed",
        ))
        return findings
    except (socket.timeout, ConnectionError, OSError) as exc:
        findings.append(Finding(
            id=make_finding_id("tls", host, "/", "Ligação TLS falhou"),
            module="tls",
            title="Ligação TLS falhou",
            severity="medium",
            confidence="medium",
            category="tls",
            asset=host,
            endpoint="/",
            evidence={"type": "tls", "details": f"{type(exc).__name__}: {exc}"},
            description=(
                "O alvo usa https:// mas a ligação TCP/TLS à porta 443 "
                "falhou. Pode ser firewall, host offline, ou TLS mal "
                "configurado."
            ),
            impact="Serviço pode estar indisponível ou mal configurado.",
            remediation="Verificar firewall, DNS e configuração TLS do servidor.",
        ))
        return findings
    except Exception as exc:
        # Não inventar findings para erros inesperados
        return findings

    # Expiração do certificado
    not_after = cert.get("notAfter")
    if not_after:
        try:
            expiry = datetime.strptime(
                not_after, "%b %d %H:%M:%S %Y %Z"
            ).replace(tzinfo=timezone.utc)
            days = (expiry - datetime.now(timezone.utc)).days
        except ValueError:
            days = None

        if days is not None and days < 30:
            findings.append(Finding(
                id=make_finding_id("tls", host, "/", "Certificado expira em breve"),
                module="tls",
                title=f"Certificado expira em {days} dias",
                severity="medium" if days < 7 else "low",
                confidence="high",
                category="tls",
                asset=host,
                endpoint="/",
                evidence={"type": "tls", "details": f"notAfter={not_after}, days={days}"},
                description="O certificado está próximo da expiração.",
                impact="Serviço pode ficar inacessível ou inseguro.",
                remediation="Renovar o certificado antes da expiração.",
            ))

    # Protocolo antigo
    if version in ("TLSv1", "TLSv1.1"):
        findings.append(Finding(
            id=make_finding_id("tls", host, "/", f"Protocolo antigo {version}"),
            module="tls",
            title=f"Protocolo TLS antigo: {version}",
            severity="medium",
            confidence="high",
            category="tls",
            asset=host,
            endpoint="/",
            evidence={"type": "tls", "details": f"Negociado: {version}"},
            description="O servidor aceita protocolo TLS obsoleto.",
            impact="Vulnerável a ataques de downgrade e criptoanálise.",
            remediation="Desativar TLS 1.0 e 1.1; usar TLS 1.2+.",
        ))

    return findings