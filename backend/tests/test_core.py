import asyncio
from scanner.core import Finding, ScanConfig, ScannerEngine, make_finding_id


def test_make_finding_id_is_deterministic():
    a = make_finding_id("headers", "https://x.com", "/", "Missing CSP")
    b = make_finding_id("headers", "https://x.com", "/", "Missing CSP")
    c = make_finding_id("headers", "https://x.com", "/", "Missing HSTS")
    assert a == b
    assert a != c
    assert len(a) == 16


def test_scan_config_defaults():
    cfg = ScanConfig(target="https://example.com")
    assert cfg.timeout == 10.0
    assert cfg.max_concurrency == 10
    assert cfg.authorized_scope == []
    assert cfg.options == {}


def test_engine_runs_module_and_returns_findings():
    async def fake_module(config: ScanConfig) -> list[Finding]:
        return [Finding(
            id=make_finding_id("fake", config.target, "/", "test"),
            module="fake",
            title="Test finding",
            severity="low",
            confidence="high",
            category="test",
            asset=config.target,
            endpoint="/",
            evidence={"type": "test", "details": "n/a"},
            description="d",
            impact="i",
            remediation="r",
        )]

    cfg = ScanConfig(target="https://example.com", scan_id="scan-1")
    engine = ScannerEngine(cfg)
    engine.register("fake", fake_module)
    result = asyncio.run(engine.run())

    assert result["findings_total"] == 1
    assert result["findings"][0]["title"] == "Test finding"
    assert result["errors"] == []
    assert result["scan_id"] == "scan-1"


def test_engine_isolates_module_errors():
    async def bad_module(config):
        raise RuntimeError("boom")

    async def good_module(config):
        return []

    engine = ScannerEngine(ScanConfig(target="https://x.com"))
    engine.register("bad", bad_module)
    engine.register("good", good_module)
    result = asyncio.run(engine.run())
    assert any(e.get("module") == "bad" for e in result["errors"])
    assert result["findings_total"] == 0