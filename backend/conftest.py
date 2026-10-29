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


@pytest.fixture
def cliente():
    return APIClient()


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
