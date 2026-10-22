"""Deteção de injeção de comandos (time-based controlado)."""
import time

import aiohttp

from .core import Finding, ScanConfig, make_finding_id

# Apenas payloads de atraso seguros (sem comandos destrutivos)
PAYLOADS = [
    ("; sleep 3", 2.5),
    ("| sleep 3", 2.5),
    ("$(sleep 3)", 2.5),
]


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    params = config.options.get("cmd_params", ["cmd", "exec", "command", "ping", "host"])
    base = config.target

    async with aiohttp.ClientSession() as session:
        # Referência de tempo
        try:
            t0 = time.monotonic()
            async with session.get(base, timeout=aiohttp.ClientTimeout(total=10)) as _:
                pass
            ref_time = time.monotonic() - t0
        except Exception:
            ref_time = 0.5

        for param in params:
            for payload, threshold in PAYLOADS:
                url = f"{base}{'&' if '?' in base else '?'}{param}={payload}"
                try:
                    t0 = time.monotonic()
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                        await resp.text(errors="ignore")
                    elapsed = time.monotonic() - t0
                except Exception:
                    continue

                if elapsed > ref_time + threshold:
                    findings.append(Finding(
                        id=make_finding_id("command_injection", base, param, "Time-based injection"),
                        module="command_injection",
                        title=f"Possível injeção de comandos no parâmetro '{param}'",
                        severity="high",
                        confidence="low",
                        category="injection",
                        asset=base,
                        endpoint=f"?{param}=<payload>",
                        evidence={
                            "type": "http_response",
                            "details": f"Tempo={elapsed:.1f}s (ref={ref_time:.1f}s)",
                        },
                        description="O tempo de resposta aumentou significativamente com payload de atraso.",
                        impact="Potencial execução de comandos no servidor.",
                        remediation="Não invocar shells; usar APIs com argumentos separados e validação estrita.",
                        validation_state="inconclusive",
                    ))
                    break

    return findings
