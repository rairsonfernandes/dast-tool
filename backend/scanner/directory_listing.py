"""Deteção de listagens de diretórios abertas."""
import re

import aiohttp

from .core import Finding, ScanConfig, make_finding_id

LISTING_PATTERNS = [
    re.compile(r"<title>Index of /", re.I),
    re.compile(r"<h1>Index of /", re.I),
    re.compile(r"Directory listing for /", re.I),
]


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    paths = config.options.get("directory_paths", ["/", "/uploads/", "/files/", "/backup/"])

    async with aiohttp.ClientSession() as session:
        for path in paths:
            url = config.target.rstrip("/") + path
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                    if resp.status != 200:
                        continue
                    text = await resp.text(errors="ignore")
                    if any(p.search(text) for p in LISTING_PATTERNS):
                        findings.append(Finding(
                            id=make_finding_id("directory_listing", config.target, path, "Directory listing"),
                            module="directory_listing",
                            title="Listagem de diretório exposta",
                            severity="medium",
                            confidence="high",
                            category="exposure",
                            asset=config.target,
                            endpoint=path,
                            evidence={"type": "http_response", "details": "Padrão de listagem detetado"},
                            description=f"O diretório {path} expõe uma listagem de ficheiros.",
                            impact="Pode revelar ficheiros sensíveis ou estrutura interna.",
                            remediation="Desativar listagem de diretórios no servidor web.",
                        ))
            except Exception:
                continue

    return findings
