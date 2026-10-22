"""Descoberta de páginas, links, formulários e parâmetros.

Melhorias:
- Segue <a href>, <iframe src>, <frame src>, <meta http-equiv="refresh">
- Extrai parâmetros de links (?id=1) e formulários
- Expõe endpoints descobertos via engine (se fornecido)
- Respeita max_depth e max_pages
- Usa cookies e headers extra do ScanConfig (auth)
"""
import asyncio
import logging
from urllib.parse import urljoin, urlparse, parse_qs

import aiohttp
from bs4 import BeautifulSoup

from .core import Finding, ScanConfig, ScannerEngine, make_finding_id

logger = logging.getLogger(__name__)

MAX_PAGE_BYTES = 2 * 1024 * 1024  # 2 MB

USER_AGENT = (
    "SentinelScanner/1.0 (+https://github.com/sentinel) "
    "Mozilla/5.0 (compatible; SentinelBot)"
)


def _extract_links(soup: BeautifulSoup, final_url: str) -> list[str]:
    """Extrai todos os URLs navegáveis de uma página."""
    urls: list[str] = []

    for a in soup.find_all("a", href=True):
        urls.append(a["href"])

    for tag in soup.find_all(["iframe", "frame"], src=True):
        urls.append(tag["src"])

    for meta in soup.find_all("meta", attrs={"http-equiv": "refresh"}):
        content = (meta.get("content") or "").lower()
        if "url=" in content:
            urls.append(content.split("url=", 1)[1].strip().strip("'\""))

    resolved: list[str] = []
    for raw in urls:
        raw = (raw or "").strip()
        if not raw or raw.startswith(("javascript:", "mailto:", "tel:", "data:", "#")):
            continue
        full = urljoin(final_url, raw).split("#", 1)[0]
        resolved.append(full)
    return resolved


async def run(config: ScanConfig, engine: ScannerEngine | None = None) -> list[Finding]:
    findings: list[Finding] = []
    visited: set[str] = set()
    discovered_params: dict[str, set[str]] = {}

    queue: list[tuple[str, int]] = [(config.target, 0)]
    base = urlparse(config.target)
    base_host = base.netloc

    max_depth = config.max_depth
    max_pages = config.max_pages
    local_delay = 1.0 / max(1, config.requests_per_second)

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
    }
    headers.update(config.extra_headers)

    cookies = config.cookies or {}

    timeout = aiohttp.ClientTimeout(total=config.timeout)

    def same_host(u: str) -> bool:
        try:
            p = urlparse(u)
            return p.scheme in ("http", "https") and p.netloc == base_host
        except Exception:
            return False

    async with aiohttp.ClientSession(
        headers=headers, timeout=timeout, cookies=cookies,
    ) as session:
        while queue and len(visited) < max_pages:
            url, depth = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)

            if engine is not None:
                await engine.acquire_slot()
            else:
                await asyncio.sleep(local_delay)

            try:
                async with session.get(url, allow_redirects=True) as resp:
                    ctype = resp.headers.get("Content-Type", "")
                    if "text/html" not in ctype.lower():
                        continue
                    raw = await resp.content.read(MAX_PAGE_BYTES)
                    html = raw.decode("utf-8", errors="ignore")
                    final_url = str(resp.url)
            except asyncio.TimeoutError:
                logger.debug("Timeout: %s", url)
                continue
            except aiohttp.ClientSSLError as exc:
                logger.debug("SSL inválido: %s (%s)", url, exc)
                continue
            except Exception as exc:
                logger.debug("Falha ao buscar %s: %s", url, exc)
                continue

            q = parse_qs(urlparse(final_url).query or "")
            if q:
                ep = final_url.split("?", 1)[0]
                discovered_params.setdefault(ep, set()).update(q.keys())

            soup = BeautifulSoup(html, "html.parser")

            if depth < max_depth:
                for link in _extract_links(soup, final_url):
                    if same_host(link) and link not in visited:
                        queue.append((link, depth + 1))

            for idx, form in enumerate(soup.find_all("form")):
                action = urljoin(final_url, form.get("action") or final_url)
                method = (form.get("method") or "GET").upper()
                elements = form.find_all(["input", "select", "textarea"])
                fields = [
                    el.get("name")
                    for el in elements
                    if el.get("name")
                    and el.get("type") not in ("submit", "button", "reset")
                ]
                if not fields:
                    continue

                ep = action.split("?", 1)[0]
                discovered_params.setdefault(ep, set()).update(fields)

                finding_id = make_finding_id(
                    "crawler", base_host, action, f"form-{method}-{idx}"
                )
                findings.append(Finding(
                    id=finding_id,
                    module="crawler",
                    title=f"Formulário {method} descoberto",
                    severity="info",
                    confidence="high",
                    category="discovery",
                    asset=base_host,
                    endpoint=action,
                    evidence={
                        "type": "http_response",
                        "url": final_url,
                        "method": method,
                        "fields": fields,
                    },
                    description=(
                        f"Formulário com método {method} e campos {fields} "
                        f"em {final_url}."
                    ),
                    impact="Superfície de ataque a testar pelos módulos de injeção.",
                    remediation="N/A (informativo).",
                ))

    try:
        if engine is not None:
            flat = {
                ep: sorted(params)
                for ep, params in discovered_params.items()
            }
            engine.config.options.setdefault("discovered_endpoints", flat)
    except Exception:
        logger.debug("Não foi possível expor endpoints descobertos", exc_info=True)

    logger.info(
        "Crawler: %d páginas visitadas, %d formulários em %s",
        len(visited), len(findings), config.target,
    )
    return findings