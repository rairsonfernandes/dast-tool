"""Verificação de cabeçalhos de segurança HTTP."""
import aiohttp

from .core import Finding, ScanConfig, make_finding_id

CHECKS = {
    "Content-Security-Policy": ("medium", "Ajuda a mitigar XSS e injeção de conteúdo."),
    "Strict-Transport-Security": ("medium", "Força HTTPS e previne downgrade."),
    "X-Content-Type-Options": ("low", "Previne MIME sniffing."),
    "Referrer-Policy": ("low", "Controla fuga de informação via Referer."),
}


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    async with aiohttp.ClientSession() as session:
        async with session.get(config.target, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            headers = {k.lower(): v for k, v in resp.headers.items()}

    for header, (severity, impact) in CHECKS.items():
        key = header.lower()
        if key not in headers:
            findings.append(Finding(
                id=make_finding_id("headers", config.target, "/", f"Missing {header}"),
                module="headers",
                title=f"Missing {header}",
                severity=severity,
                confidence="high",
                category="misconfiguration",
                asset=config.target,
                endpoint="/",
                evidence={"type": "http_response", "details": "Header não presente"},
                description=f"O cabeçalho {header} não foi identificado.",
                impact=impact,
                remediation=f"Definir o cabeçalho {header} com uma política adequada.",
            ))

    # CSP frame-ancestors
    csp = headers.get("content-security-policy", "")
    if csp and "frame-ancestors" not in csp.lower():
        findings.append(Finding(
            id=make_finding_id("headers", config.target, "/", "CSP sem frame-ancestors"),
            module="headers",
            title="CSP sem frame-ancestors",
            severity="low",
            confidence="high",
            category="misconfiguration",
            asset=config.target,
            endpoint="/",
            evidence={"type": "http_response", "details": "CSP presente mas sem frame-ancestors"},
            description="A CSP não define frame-ancestors.",
            impact="Risco de clickjacking.",
            remediation="Adicionar frame-ancestors 'none' ou 'self' à CSP.",
        ))

    return findings
