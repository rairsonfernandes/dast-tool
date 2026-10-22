"""Deteção de SQL Injection.

Estratégia (por ordem de confiança):
1. Error-based confirmado: a resposta contém mensagem de erro SQL
   que NÃO aparece com valor de controlo equivalente (diferencial).
2. Boolean-based: respostas para condição verdadeira vs falsa diferem
   de forma consistente, e essa diferença não ocorre nos controlos.
3. Status-based: o payload provoca mudança de status que NÃO acontece
   com valor válido nem com valor inválido não-SQL (mesmo parâmetro).

Cada parâmetro tem as suas próprias referências (válida + controlos).
Distingue "erro SQL confirmado" de "mudança de comportamento suspeita".
Usa cookies e headers extra do ScanConfig (auth).
"""
import aiohttp
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from .core import Finding, ScanConfig, make_finding_id


SQL_ERRORS = [
    # MySQL / MariaDB
    "you have an error in your sql syntax",
    "warning: mysql_fetch",
    "warning: mysql_num_rows",
    "warning: mysql_query",
    "mysql_num_rows() expects",
    "supplied argument is not a valid mysql",
    "check the manual that corresponds to your mysql",
    # SQL Server
    "unclosed quotation mark after the character string",
    "quoted string not properly terminated",
    "microsoft ole db provider for sql server",
    "odbc sql server driver",
    "incorrect syntax near",
    "sqlserver jdbc driver",
    "system.data.sqlclient.sql",
    # Oracle
    "ora-00933",
    "ora-00921",
    "ora-01756",
    "ora-00907",
    "oracle error",
    "oracle.jdbc",
    # PostgreSQL
    "pg_query() [",
    "pg_exec() [",
    "postgresql query failed",
    "syntax error at or near",
    "unterminated quoted string at or near",
    # SQLite
    "sqlite error",
    "sqliteexception",
    "sqlite3.operationalerror",
    "unrecognized token:",
    "sql logic error",
    # Genéricos específicos de falha de query
    "sqlstate[",
    "sql syntax",
    "sql error:",
    "error in your sql",
]


SYNTAX_PAYLOADS = [
    "'",
    "\"",
    "';--",
    "')",
]

BOOLEAN_PAIRS = [
    ("' OR '1'='1", "' OR '1'='2"),
    ("1' AND '1'='1", "1' AND '1'='2"),
    ("1 AND 1=1", "1 AND 1=2"),
]

CONTROL_VALUES = ["abc", "999999999", "___test___", "1"]


def _build_url(base_no_query: str, existing: dict, param: str, payload: str) -> str:
    q = {k: list(v) for k, v in existing.items()}
    q[param] = [payload]
    return f"{base_no_query}?{urlencode(q, doseq=True)}"


def _find_sql_error(text: str) -> str | None:
    low = text.lower()
    for err in SQL_ERRORS:
        if err in low:
            return err
    return None


async def _get(session: aiohttp.ClientSession, url: str, timeout: int = 10):
    try:
        async with session.get(
            url,
            timeout=aiohttp.ClientTimeout(total=timeout),
            allow_redirects=True,
        ) as resp:
            text = await resp.text(errors="ignore")
            return resp.status, text
    except Exception:
        return None


async def _baseline_per_param(
    session: aiohttp.ClientSession,
    base_no_query: str,
    existing: dict,
    param: str,
) -> dict | None:
    base_url = base_no_query or ""
    if not base_url:
        return None

    original = (existing.get(param) or ["1"])[0]
    valid_res = await _get(session, _build_url(base_url, existing, param, original))
    if valid_res is None:
        return None

    control_errors: set[str] = set()
    control_statuses: list[int] = []
    control_lens: list[int] = []

    for cv in CONTROL_VALUES:
        if cv == original:
            continue
        res = await _get(session, _build_url(base_url, existing, param, cv))
        if res is None:
            continue
        st, tx = res
        control_statuses.append(st)
        control_lens.append(len(tx))
        e = _find_sql_error(tx)
        if e:
            control_errors.add(e)

    return {
        "valid_status": valid_res[0],
        "valid_len": len(valid_res[1]),
        "control_errors": control_errors,
        "control_statuses": control_statuses,
        "control_lens": control_lens,
    }


def _looks_boolean_diff(
    true_status: int, true_len: int,
    false_status: int, false_len: int,
    base: dict,
    tol: int = 32,
) -> bool:
    if true_status != false_status:
        return False

    diff = abs(true_len - false_len)
    if diff < tol * 2:
        return False

    valid_len = base["valid_len"]
    true_near = abs(true_len - valid_len) <= tol
    false_near = abs(false_len - valid_len) <= tol
    if true_near == false_near:
        return False

    if base["control_lens"]:
        ctrl_spread = max(base["control_lens"]) - min(base["control_lens"])
        if diff <= ctrl_spread:
            return False

    return True


async def run(config: ScanConfig) -> list[Finding]:
    findings: list[Finding] = []
    target = config.target

    parsed = urlparse(target)
    existing = parse_qs(parsed.query or "")
    base_no_query = urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path, "", "", "")
    )

    params: list[str] = list(existing.keys())
    if not params:
        params = list(config.options.get("test_params") or [])
    if not params:
        params = ["id", "q", "search", "page"]

    headers = {"User-Agent": "SentinelScanner/1.0 (SQLi)"}
    headers.update(config.extra_headers)
    cookies = config.cookies or {}

    async with aiohttp.ClientSession(
        headers=headers, cookies=cookies,
    ) as session:
        for param in params:
            base = await _baseline_per_param(
                session, base_no_query, existing, param
            )
            if base is None:
                continue

            seen: set[tuple[str, str]] = set()

            # -----------------------------------------------------------------
            # 1) Error-based confirmado
            # -----------------------------------------------------------------
            for payload in SYNTAX_PAYLOADS:
                url = _build_url(base_no_query, existing, param, payload)
                res = await _get(session, url)
                if res is None:
                    continue
                status, text = res
                err = _find_sql_error(text)

                if err and err not in base["control_errors"]:
                    key = (param, err)
                    if key in seen:
                        continue
                    seen.add(key)
                    findings.append(Finding(
                        id=make_finding_id(
                            "sql_injection",
                            base_no_query or target,
                            param,
                            f"SQL error {err[:30]}",
                        ),
                        module="sql_injection",
                        title=f"Erro SQL confirmado no parâmetro '{param}'",
                        severity="high",
                        confidence="high",
                        category="injection",
                        asset=base_no_query or target,
                        endpoint=f"?{param}=<payload>",
                        evidence={
                            "type": "http_response",
                            "details": (
                                f"Erro SQL na resposta: {err!r}. "
                                f"Marcador ausente nos controlos "
                                f"{sorted(base['control_errors']) or '[]'}."
                            ),
                            "payload": payload,
                            "url": url,
                            "status": status,
                        },
                        description=(
                            f"Injetar {payload!r} no parâmetro '{param}' "
                            f"produziu uma mensagem de erro SQL que não "
                            f"aparece com valores de controlo — indicador "
                            f"diferencial de SQLi error-based."
                        ),
                        impact="Possível manipulação de consultas SQL.",
                        remediation=(
                            "Usar consultas parametrizadas (prepared statements); "
                            "nunca concatenar entrada do utilizador em SQL; "
                            "não expor mensagens de erro internas."
                        ),
                        validation_state="confirmed",
                    ))
                    break

            # -----------------------------------------------------------------
            # 2) Boolean-based
            # -----------------------------------------------------------------
            if not any(
                f.module == "sql_injection"
                and f.endpoint == f"?{param}=<payload>"
                and f.validation_state == "confirmed"
                for f in findings
            ):
                for true_p, false_p in BOOLEAN_PAIRS:
                    r_true = await _get(session, _build_url(
                        base_no_query, existing, param, true_p))
                    r_false = await _get(session, _build_url(
                        base_no_query, existing, param, false_p))
                    if r_true is None or r_false is None:
                        continue

                    (ts, tt), (fs, ft) = r_true, r_false

                    if _find_sql_error(tt) or _find_sql_error(ft):
                        break

                    if _looks_boolean_diff(ts, len(tt), fs, len(ft), base):
                        key = (param, "boolean")
                        if key in seen:
                            continue
                        seen.add(key)
                        findings.append(Finding(
                            id=make_finding_id(
                                "sql_injection",
                                base_no_query or target,
                                param,
                                "boolean-based",
                            ),
                            module="sql_injection",
                            title=f"Padrão boolean-based suspeito no parâmetro '{param}'",
                            severity="medium",
                            confidence="medium",
                            category="injection",
                            asset=base_no_query or target,
                            endpoint=f"?{param}=<payload>",
                            evidence={
                                "type": "http_response",
                                "details": (
                                    f"Condição verdadeira {true_p!r} → "
                                    f"status {ts}, {len(tt)} bytes; "
                                    f"condição falsa {false_p!r} → "
                                    f"status {fs}, {len(ft)} bytes. "
                                    f"Baseline válido: {base['valid_len']} bytes."
                                ),
                                "payload_true": true_p,
                                "payload_false": false_p,
                                "status_true": ts,
                                "status_false": fs,
                                "len_true": len(tt),
                                "len_false": len(ft),
                            },
                            description=(
                                f"As respostas para condições verdadeira e falsa "
                                f"diferem consistentemente no parâmetro '{param}', "
                                f"padrão característico de SQLi boolean-based. "
                                f"Confirmação manual recomendada."
                            ),
                            impact="Possível manipulação de consultas SQL.",
                            remediation=(
                                "Usar consultas parametrizadas; validar tipos; "
                                "não expor diferenças de resposta exploráveis."
                            ),
                            validation_state="probable",
                        ))
                        break

            # -----------------------------------------------------------------
            # 3) Status-based
            # -----------------------------------------------------------------
            already_flagged = any(
                f.module == "sql_injection"
                and f.endpoint == f"?{param}=<payload>"
                for f in findings
            )
            if already_flagged:
                continue

            for payload in SYNTAX_PAYLOADS:
                url = _build_url(base_no_query, existing, param, payload)
                res = await _get(session, url)
                if res is None:
                    continue
                status, _text = res

                if status == base["valid_status"]:
                    continue
                if status < 400:
                    continue
                if status in base["control_statuses"]:
                    continue
                if not base["control_statuses"] and status < 500:
                    continue

                key = (param, f"status:{status}")
                if key in seen:
                    continue
                seen.add(key)
                findings.append(Finding(
                    id=make_finding_id(
                        "sql_injection",
                        base_no_query or target,
                        param,
                        f"SQL status {status}",
                    ),
                    module="sql_injection",
                    title=f"Mudança de status suspeita no parâmetro '{param}'",
                    severity="low",
                    confidence="low",
                    category="injection",
                    asset=base_no_query or target,
                    endpoint=f"?{param}=<payload>",
                    evidence={
                        "type": "http_response",
                        "details": (
                            f"Payload {payload!r} → HTTP {status}; "
                            f"válido → HTTP {base['valid_status']}; "
                            f"controlos → HTTP {base['control_statuses']}."
                        ),
                        "payload": payload,
                        "url": url,
                    },
                    description=(
                        f"Injetar {payload!r} no parâmetro '{param}' alterou "
                        f"o status HTTP para {status}, sem correspondência nos "
                        f"controlos. Pode ser erro SQL, WAF ou validação — "
                        f"requer confirmação manual."
                    ),
                    impact="Possível manipulação de consultas SQL.",
                    remediation=(
                        "Usar consultas parametrizadas; validar entradas; "
                        "configurar o servidor para não expor erros internos."
                    ),
                    validation_state="probable",
                ))
                break

    return findings