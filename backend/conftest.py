import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.cuentas.tests.fabricas import EmpresaFactory, UsuarioFactory


@pytest.fixture(autouse=True)
def _limpiar_cache():
    """El throttling guarda contadores en la caché: cada prueba parte de cero."""
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
