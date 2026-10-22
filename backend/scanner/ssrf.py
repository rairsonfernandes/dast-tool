"""SSRF — só reporta com diferença de comportamento comprovada."""
import aiohttp
import asyncio

from .core import Finding, ScanConfig, make_finding_id

# payloads seguros que NÃO apontam para redes internas
TEST_URLS = [
    "http://example.com/",
    "http://httpbin.org/get",
]


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    params = config.options.get("url_params", ["url", "uri", "dest", "redirect", "fetch", "target"])
    base = config.target

    async with aiohttp.ClientSession() as session:
        # Referência: o que devolve com valor inofensivo?
        ref_len = None
        try:
            async with session.get(f"{base}{'&' if '?' in base else '?'}{params[0]}=notaurl",
                                   timeout=aiohttp.ClientTimeout(total=10)) as r:
                ref_text = await r.text(errors="ignore")
                ref_len = len(ref_text)
        except Exception:
            return findings

        for param in params:
            test_url = TEST_URLS[0]
            full = f"{base}{'&' if '?' in base else '?'}{param}={test_url}"
            try:
                async with session.get(full, timeout=aiohttp.ClientTimeout(total=10)) as r:
                    text = await r.text(errors="ignore")
                    status = r.status
            except Exception:
                continue

            # CONFIRMAÇÃO FORTE: o servidor devolveu conteúdo do destino
            # (não apenas mencionou a URL na resposta)
            indicators = [
                "Example Domain",           # conteúdo do example.com
                "\"url\": \"http://httpbin",  # conteúdo do httpbin
                "httpbin.org/get",
            ]
            matched = [i for i in indicators if i in text]

            # diferença de tamanho significativa face à referência
            delta = abs(len(text) - (ref_len or 0)) if ref_len else 0

            if matched and delta > 500:
                findings.append(Finding(
                    id=make_finding_id("ssrf", base, param, "SSRF confirmed"),
                    module="ssrf",
                    title=f"SSRF confirmado no parâmetro '{param}'",
                    severity="high",
                    confidence="high",
                    category="ssrf",
                    asset=base,
                    endpoint=f"?{param}=<url>",
                    evidence={
                        "type": "http_response",
                        "details": f"Resposta contém conteúdo de {test_url} (len={len(text)}, ref={ref_len})",
                    },
                    description="O servidor efetuou o pedido ao URL fornecido e devolveu o conteúdo.",
                    impact="Acesso a recursos internos se a validação estiver em falta.",
                    remediation="Validar destinos com allowlist; bloquear IPs internos e metadados.",
                    validation_state="confirmed",
                ))

    return findings