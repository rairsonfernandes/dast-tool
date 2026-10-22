"""Exposed files — só reporta se o conteúdo tiver marcadores concretos."""
import aiohttp

from .core import Finding, ScanConfig, make_finding_id

DEFAULT_PATHS = [
    ".env", ".git/config", ".git/HEAD", "backup.zip", "backup.sql",
    "wp-config.php.bak", "config.php~", "debug.log", "phpinfo.php",
]

# Marcadores que PROVAM que o ficheiro é aquilo que diz ser
MARKERS = {
    ".env": ["DB_", "SECRET_KEY", "API_KEY", "PASSWORD=", "APP_KEY="],
    ".git/config": ["[core]", "repositoryformatversion"],
    ".git/HEAD": ["ref: refs/heads/", "refs/heads/"],
    "backup.zip": [b"PK\x03\x04"],  # ZIP magic bytes
    "backup.sql": ["INSERT INTO", "CREATE TABLE", "-- MySQL dump", "SQL dump"],
    "wp-config": ["DB_NAME", "DB_PASSWORD", "wp-config"],
    "config.php": ["<?php", "password", "DB_"],
    "debug.log": ["Traceback (most recent call last)", "ERROR", "WARNING"],
    "phpinfo": ["PHP Version", "phpinfo()", "PHP Credits"],
}


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    paths = config.options.get("file_paths", DEFAULT_PATHS)
    base = config.target.rstrip("/")

    async with aiohttp.ClientSession() as session:
        # referência: como o site responde a um path que não existe?
        try:
            async with session.get(f"{base}/__nonexistent_{id(base)}__",
                                   timeout=aiohttp.ClientTimeout(total=8)) as r:
                ref_status = r.status
                ref_text = await r.text(errors="ignore")
        except Exception:
            ref_status, ref_text = 404, ""

        for path in paths:
            url = f"{base}/{path.lstrip('/')}"
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                    if r.status != 200:
                        continue
                    raw = await r.read()
                    text = raw.decode("utf-8", errors="ignore")
            except Exception:
                continue

            # Se a resposta é IGUAL à de um path inexistente, é soft-404 → ignorar
            if r.status == ref_status and abs(len(text) - len(ref_text)) < 100:
                continue

            # Verifica marcadores concretos
            path_key = path.split("/")[-1]  # ex: ".env" de "foo/.env"
            markers_for = None
            for k, v in MARKERS.items():
                if k in path:
                    markers_for = v
                    break
            if not markers_for:
                continue

            hit = False
            for m in markers_for:
                if isinstance(m, bytes):
                    if m in raw:
                        hit = True; break
                else:
                    if m in text:
                        hit = True; break

            if not hit:
                continue

            findings.append(Finding(
                id=make_finding_id("exposed_files", base, path, "Exposed file confirmed"),
                module="exposed_files",
                title=f"Ficheiro sensível exposto: {path}",
                severity="high" if ".env" in path or ".git" in path else "medium",
                confidence="high",
                category="exposure",
                asset=base,
                endpoint=path,
                evidence={
                    "type": "http_response",
                    "details": f"HTTP 200, marcadores de {path} encontrados",
                },
                description=f"O caminho {path} devolveu conteúdo que confirma exposição.",
                impact="Pode expor credenciais, código-fonte ou dados internos.",
                remediation="Remover ficheiros sensíveis do servidor web ou restringir acesso.",
                validation_state="confirmed",
            ))

    return findings