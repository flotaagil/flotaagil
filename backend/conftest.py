import os

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.cuentas.tests.fabricas import EmpresaFactory, UsuarioFactory


@pytest.fixture(autouse=True)
def _cache_de_pruebas(settings):
    """Las pruebas usan otra base de Redis (15) para no borrar la caché del servidor de desarrollo.
    El throttling guarda contadores en la caché: cada prueba parte de cero."""
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0").rsplit("/", 1)[0] + "/15"
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": url,
            "KEY_PREFIX": "pruebas",
        }
    }
    cache.clear()
    yield
    cache.clear()


ORIGEN_PANEL = "http://localhost:5173"


@pytest.fixture(autouse=True)
def _origenes_del_panel(settings):
    """El panel de pruebas vive en el origen de desarrollo de Vite."""
    settings.PANEL_ORIGENES = [ORIGEN_PANEL]


@pytest.fixture
def cliente():
    """Cliente sin encabezados de navegador (como curl o la app del conductor)."""
    return APIClient()


@pytest.fixture
def panel():
    """Cliente que se comporta como el navegador del panel: envía Origin en cada petición."""
    return APIClient(HTTP_ORIGIN=ORIGEN_PANEL)


@pytest.fixture
def empresa(db):
    return EmpresaFactory()


@pytest.fixture
def otra_empresa(db):
    return EmpresaFactory()


@pytest.fixture
def despachador(empresa):
    return UsuarioFactory(empresa=empresa, rol="DESPACHADOR")


@pytest.fixture
def administrador(empresa):
    return UsuarioFactory(empresa=empresa, rol="ADMINISTRADOR")


@pytest.fixture
def conductor(empresa):
    return UsuarioFactory(empresa=empresa, rol="CONDUCTOR")
