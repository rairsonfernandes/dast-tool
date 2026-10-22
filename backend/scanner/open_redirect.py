"""Deteção de redirecionamentos abertos."""
import aiohttp

from .core import Finding, ScanConfig, make_finding_id

TEST_DEST = "https://evil.example/redirect"


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    params = config.options.get("redirect_params", ["redirect", "url", "next", "return", "goto", "dest"])
    base = config.target

    async with aiohttp.ClientSession() as session:
        for param in params:
            url = f"{base}{'&' if '?' in base else '?'}{param}={TEST_DEST}"
            try:
                async with session.get(
                    url, allow_redirects=False, timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    location = resp.headers.get("Location", "")
                    status = resp.status
            except Exception:
                continue

            if status in (301, 302, 303, 307, 308) and "evil.example" in location:
                findings.append(Finding(
                    id=make_finding_id("open_redirect", base, param, "Open redirect"),
                    module="open_redirect",
                    title=f"Redirecionamento aberto no parâmetro '{param}'",
                    severity="medium",
                    confidence="high",
                    category="open_redirect",
                    asset=base,
                    endpoint=f"?{param}=<url>",
                    evidence={"type": "http_response", "details": f"HTTP {status}, Location={location}"},
                    description="O servidor redireciona para um destino externo controlável.",
                    impact="Pode ser usado para phishing ou bypass de filtros.",
                    remediation="Usar allowlist de destinos permitidos; evitar redirecionar para URLs arbitrários.",
                ))

    return findings
