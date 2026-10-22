import pytest
from scanner import _available_modules, _load_module


@pytest.mark.parametrize("name", _available_modules())
def test_module_has_run_callable(name):
    run, err = _load_module(name)
    assert run is not None, f"{name} falhou a importar: {err}"
    assert callable(run)


@pytest.mark.asyncio
async def test_headers_module_against_localhost():
    """Este teste só corre se tiveres um servidor local. Skip se não tiveres."""
    pytest.skip("requer servidor HTTP local — correr manualmente")