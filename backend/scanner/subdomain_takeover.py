"""Deteção de subdomínios suscetíveis a takeover."""
import asyncio

import aiohttp
import dns.asyncresolver

from .core import Finding, ScanConfig, make_finding_id

# Fingerprints simplificados de serviços comuns
FINGERPRINTS = {
    "github.io": "There isn't a GitHub Pages site here",
    "herokuapp.com": "No such app",
    "s3.amazonaws.com": "NoSuchBucket",
    "netlify.app": "Not Found - Request ID",
    "azurewebsites.net": "Error 404 - Web app not found",
}


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    subdomains = config.options.get("subdomains", [])
    if not subdomains:
        # Extrair do target
        host = config.target.replace("https://", "").replace("http://", "").split("/")[0]
        subdomains = [host]

    resolver = dns.asyncresolver.Resolver()
    resolver.timeout = 5
    resolver.lifetime = 10

    async with aiohttp.ClientSession() as session:
        for sub in subdomains:
            try:
                answers = await resolver.resolve(sub, "CNAME")
                cname = str(answers[0].target).rstrip(".")
            except Exception:
                continue

            for service, fingerprint in FINGERPRINTS.items():
                if service in cname.lower():
                    # Confirmar via HTTP
                    try:
                        async with session.get(
                            f"https://{sub}", timeout=aiohttp.ClientTimeout(total=10)
                        ) as resp:
                            text = await resp.text(errors="ignore")
                            if fingerprint.lower() in text.lower():
                                findings.append(Finding(
                                    id=make_finding_id("subdomain_takeover", sub, "/", "Takeover"),
                                    module="subdomain_takeover",
                                    title=f"Subdomínio potencialmente suscetível: {sub}",
                                    severity="high",
                                    confidence="medium",
                                    category="takeover",
                                    asset=sub,
                                    endpoint="/",
                                    evidence={
                                        "type": "dns",
                                        "details": f"CNAME={cname}, fingerprint encontrada",
                                    },
                                    description="O subdomínio aponta para um serviço não configurado.",
                                    impact="Atacante pode reclamar o recurso e servir conteúdo malicioso.",
                                    remediation="Remover ou corrigir o registo CNAME; reclamar o recurso no fornecedor.",
                                ))
                    except Exception:
                        continue

    return findings
