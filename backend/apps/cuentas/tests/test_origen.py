"""P1 (Origin o Referer en login, refresh y logout del panel) y P3 (solo JSON)."""

import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.cuentas.origen import normalizar_origen

from .fabricas import CLAVE_PRUEBA

COOKIE = settings.JWT_COOKIE["nombre"]
PERMITIDO = "http://localhost:5173"


def login(cliente, usuario, **encabezados):
    return cliente.post(
        reverse("auth-token"),
        {"email": usuario.email, "password": CLAVE_PRUEBA},
        format="json",
        **encabezados,
    )


class TestNormalizarOrigen:
    @pytest.mark.parametrize(
        ("valor", "esperado"),
        [
            ("http://localhost:5173", "http://localhost:5173"),
            ("HTTPS://Panel.FlotaAgil.example", "https://panel.flotaagil.example"),
            ("https://panel.flotaagil.example:443", "https://panel.flotaagil.example"),
            ("http://localhost:80", "http://localhost"),
            ("http://[::1]:5173", "http://[::1]:5173"),
            ("null", None),
            ("", None),
            ("localhost:5173", None),
            ("ftp://x.example", None),
            ("http://usuario:clave@x.example", None),
            ("http://x.example:99999", None),
            ("http://localhost:5173/", None),
            ("http://localhost:5173/ruta", None),
        ],
    )
    def test_origin(self, valor, esperado):
        assert normalizar_origen(valor) == esperado

    def test_referer_descarta_ruta_y_consulta(self):
        valor = "http://localhost:5173/login?volver=/reservas#x"
        assert normalizar_origen(valor, solo_origen=False) == "http://localhost:5173"


@pytest.mark.django_db
class TestOrigenEnElPanel:
    @pytest.mark.parametrize(
        ("encabezados", "estado"),
        [
            ({}, 403),
            ({"HTTP_ORIGIN": PERMITIDO}, 200),
            ({"HTTP_ORIGIN": "http://LOCALHOST:5173"}, 200),
            ({"HTTP_ORIGIN": "https://atacante.example"}, 403),
            ({"HTTP_ORIGIN": "http://localhost:5174"}, 403),
            ({"HTTP_ORIGIN": "https://localhost:5173"}, 403),
            ({"HTTP_ORIGIN": "null"}, 403),
            ({"HTTP_REFERER": f"{PERMITIDO}/login"}, 200),
            ({"HTTP_REFERER": "https://atacante.example/pagina"}, 403),
            # Origin manda: si viene y no sirve, no se cae al Referer.
            ({"HTTP_ORIGIN": "https://atacante.example", "HTTP_REFERER": f"{PERMITIDO}/login"}, 403),
            ({"HTTP_ORIGIN": "null", "HTTP_REFERER": f"{PERMITIDO}/login"}, 403),
        ],
    )
    def test_login(self, despachador, encabezados, estado):
        respuesta = login(APIClient(), despachador, **encabezados)
        assert respuesta.status_code == estado
        if estado == 403:
            assert respuesta.data["code"] == "origen_no_permitido"
            assert COOKIE not in respuesta.cookies

    def test_no_se_compara_con_host(self, despachador, settings):
        settings.ALLOWED_HOSTS = ["otro.example"]
        # Mismo Host que el Origin, pero el Origin no está en la lista.
        respuesta = login(
            APIClient(), despachador, HTTP_HOST="otro.example", HTTP_ORIGIN="http://otro.example"
        )
        assert respuesta.status_code == 403

    def test_lista_vacia_rechaza_todo(self, despachador, settings):
        settings.PANEL_ORIGENES = []
        assert login(APIClient(), despachador, HTTP_ORIGIN=PERMITIDO).status_code == 403

    def test_rechazo_no_consume_intentos_ni_throttling(self, despachador):
        cliente = APIClient()
        for _ in range(12):
            assert login(cliente, despachador, HTTP_ORIGIN="https://atacante.example").status_code == 403
        despachador.refresh_from_db()
        assert despachador.intentos_fallidos == 0
        assert login(cliente, despachador, HTTP_ORIGIN=PERMITIDO).status_code == 200

    @pytest.mark.parametrize("ruta", ["auth-refresh", "auth-logout"])
    def test_refresh_y_logout(self, panel, despachador, ruta):
        assert login(panel, despachador).status_code == 200
        sin_origen = APIClient()
        sin_origen.cookies = panel.cookies
        respuesta = sin_origen.post(reverse(ruta))
        assert respuesta.status_code == 403
        assert respuesta.data["code"] == "origen_no_permitido"
        assert COOKIE not in respuesta.cookies
        ajeno = sin_origen.post(reverse(ruta), HTTP_ORIGIN="https://atacante.example")
        assert ajeno.status_code == 403
        # Con un origen permitido sigue funcionando: el rechazo no tocó la sesión.
        assert panel.post(reverse(ruta)).status_code in (200, 204)

    def test_yo_no_exige_origen(self, panel, despachador):
        access = login(panel, despachador).data["access"]
        assert APIClient().get(reverse("auth-yo"), HTTP_AUTHORIZATION=f"Bearer {access}").status_code == 200


@pytest.mark.django_db
class TestAppSinEncabezadosDeNavegador:
    """La app del conductor (Capacitor) usa otros endpoints: no se le exige Origin ni Referer."""

    @pytest.mark.parametrize(
        "encabezados", [{}, {"HTTP_ORIGIN": "https://localhost"}, {"HTTP_ORIGIN": "null"}]
    )
    def test_login_y_refresh(self, conductor, encabezados):
        cliente = APIClient()
        respuesta = cliente.post(
            reverse("auth-app-token"),
            {"email": conductor.email, "password": CLAVE_PRUEBA},
            format="json",
            **encabezados,
        )
        assert respuesta.status_code == 200
        renovado = cliente.post(
            reverse("auth-app-refresh"), {"refresh": respuesta.data["refresh"]}, format="json", **encabezados
        )
        assert renovado.status_code == 200


@pytest.mark.django_db
class TestSoloJson:
    @pytest.mark.parametrize("formato", ["multipart", None])
    def test_login_con_formulario_es_415(self, panel, despachador, formato):
        datos = {"email": despachador.email, "password": CLAVE_PRUEBA}
        if formato:
            respuesta = panel.post(reverse("auth-token"), datos, format=formato)
        else:
            respuesta = panel.post(
                reverse("auth-token"),
                f"email={despachador.email}&password={CLAVE_PRUEBA}",
                content_type="application/x-www-form-urlencoded",
            )
        assert respuesta.status_code == 415
        assert respuesta.data["code"] == "unsupported_media_type"
        assert COOKIE not in respuesta.cookies

    def test_login_con_json(self, panel, despachador):
        assert login(panel, despachador).status_code == 200

    def test_errores_de_login_llevan_codigo(self, panel, despachador, conductor):
        assert login(panel, conductor).data["code"] == "rol_no_permitido"
        mala = panel.post(
            reverse("auth-token"), {"email": despachador.email, "password": "mala"}, format="json"
        )
        assert mala.data["code"] == "credenciales_invalidas"
