"""Deteção de configurações CORS permissivas."""
import aiohttp

from .core import Finding, ScanConfig, make_finding_id


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    test_origin = "https://evil.example"
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(
                config.target,
                headers={"Origin": test_origin},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                acao = resp.headers.get("Access-Control-Allow-Origin", "")
                acac = resp.headers.get("Access-Control-Allow-Credentials", "").lower()
        except Exception:
            return findings

    # Reflexão de origem
    if acao == test_origin:
        severity = "high" if acac == "true" else "medium"
        findings.append(Finding(
            id=make_finding_id("cors", config.target, "/", "Origem refletida"),
            module="cors",
            title="CORS reflete origem arbitrária",
            severity=severity,
            confidence="high",
            category="cors",
            asset=config.target,
            endpoint="/",
            evidence={"type": "http_response", "details": f"ACAO={acao}, ACAC={acac}"},
            description="O servidor reflete qualquer Origin recebido.",
            impact="Qualquer site pode ler respostas da API." + (" Com credenciais, o risco é crítico." if acac == "true" else ""),
            remediation="Usar allowlist estrita de origens; nunca refletir Origin dinamicamente.",
        ))

    # Wildcard com credenciais
    if acao == "*" and acac == "true":
        findings.append(Finding(
            id=make_finding_id("cors", config.target, "/", "Wildcard com credenciais"),
            module="cors",
            title="CORS wildcard com credenciais",
            severity="critical",
            confidence="high",
            category="cors",
            asset=config.target,
            endpoint="/",
            evidence={"type": "http_response", "details": "ACAO=*, ACAC=true"},
            description="CORS permite qualquer origem e envia credenciais.",
            impact="Fuga de dados autenticados para qualquer site.",
            remediation="Remover wildcard; usar allowlist com credenciais.",
        ))

    return findings
