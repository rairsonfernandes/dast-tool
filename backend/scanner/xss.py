"""XSS — só reporta se o payload aparece LITERAL na resposta."""
import aiohttp
from urllib.parse import quote

from .core import Finding, ScanConfig, make_finding_id

MARKER = "SENTINELXSS"


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    params = config.options.get("test_params", ["q", "search", "name", "message"])
    base = config.target

    # payload único e identificável
    payload = f"{MARKER}<script>alert(1)</script>"

    async with aiohttp.ClientSession() as session:
        for param in params:
            url = f"{base}{'&' if '?' in base else '?'}{param}={quote(payload)}"
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                    text = await r.text(errors="ignore")
            except Exception:
                continue

            # confirmar que a string LITERAL aparece (não codificada)
            if payload in text:
                # contexto
                idx = text.find(payload)
                before = text[max(0, idx-60):idx].lower()
                if "<script" in before:
                    ctx = "JavaScript"
                elif "=\"" in text[max(0, idx-20):idx] or "='" in text[max(0, idx-20):idx]:
                    ctx = "HTML attribute"
                else:
                    ctx = "HTML body"

                findings.append(Finding(
                    id=make_finding_id("xss", base, param, "Reflected XSS"),
                    module="xss",
                    title=f"Reflected XSS no parâmetro '{param}'",
                    severity="high",
                    confidence="high",
                    category="xss",
                    asset=base,
                    endpoint=f"?{param}=<payload>",
                    evidence={
                        "type": "http_response",
                        "details": f"Payload literal refletido (contexto: {ctx})",
                    },
                    description="Payload não escapado refletido na resposta.",
                    impact="Execução de script no navegador da vítima.",
                    remediation="Aplicar codificação contextual e sanitização.",
                    validation_state="confirmed",
                ))

    return findings