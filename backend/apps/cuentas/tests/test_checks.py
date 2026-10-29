"""System checks de seguridad: W001 a W003 solo con --deploy; E001 siempre."""

import pytest
from django.core.checks import run_checks


def ids(include_deployment_checks):
    return {m.id for m in run_checks(include_deployment_checks=include_deployment_checks)}


@pytest.fixture
def produccion(settings):
    """Configuración de producción correcta: ningún check propio debe saltar."""
    settings.DEBUG = False
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    settings.PANEL_ORIGENES = ["https://panel.flotaagil.example"]
    return settings


def propios(conjunto):
    return {i for i in conjunto if i.startswith("flotaagil.")}


class TestNumProxies:
    def test_avisa_en_produccion_sin_num_proxies(self, produccion):
        produccion.REST_FRAMEWORK = {**produccion.REST_FRAMEWORK, "NUM_PROXIES": None}
        assert propios(ids(True)) == {"flotaagil.W001"}

    def test_sin_aviso_con_num_proxies(self, produccion):
        assert propios(ids(True)) == set()

    def test_sin_aviso_en_desarrollo(self, settings):
        settings.DEBUG = True
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": None}
        assert "flotaagil.W001" not in ids(True)

    def test_solo_corre_con_deploy(self, produccion):
        produccion.REST_FRAMEWORK = {**produccion.REST_FRAMEWORK, "NUM_PROXIES": None}
        assert "flotaagil.W001" not in ids(False)


class TestOrigenesDelPanel:
    def test_vacio_en_produccion(self, produccion):
        produccion.PANEL_ORIGENES = []
        assert propios(ids(True)) == {"flotaagil.W002"}
        assert "flotaagil.W002" not in ids(False)

    def test_http_en_produccion(self, produccion):
        produccion.PANEL_ORIGENES = ["https://panel.flotaagil.example", "http://panel.flotaagil.example"]
        assert propios(ids(True)) == {"flotaagil.W003"}
        assert "flotaagil.W003" not in ids(False)

    def test_desarrollo_admite_http_y_lista_vacia(self, settings):
        settings.DEBUG = True
        for origenes in ([], ["http://localhost:5173"]):
            settings.PANEL_ORIGENES = origenes
            assert propios(ids(True)) == set()

    @pytest.mark.parametrize(
        "malo",
        [
            "localhost:5173",
            "http://localhost:5173/",
            "https://panel.example/ruta",
            "*",
            "ftp://x.example",
            "",
        ],
    )
    def test_formato_invalido_siempre_es_error(self, settings, malo):
        settings.DEBUG = True
        settings.PANEL_ORIGENES = ["http://localhost:5173", malo]
        assert "flotaagil.E001" in ids(False)

    def test_formato_valido(self, settings):
        settings.PANEL_ORIGENES = [
            "http://localhost:5173",
            "https://panel.flotaagil.example",
            "http://[::1]:5173",
        ]
        assert "flotaagil.E001" not in ids(False)
