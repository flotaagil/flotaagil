from datetime import timedelta

import pytest
from django.conf import settings
from django.urls import reverse
from django.utils import timezone

from apps.cuentas.models import Usuario

from .fabricas import CLAVE_PRUEBA, UsuarioFactory

COOKIE = settings.JWT_COOKIE["nombre"]


def login_panel(cliente, usuario, password=CLAVE_PRUEBA):
    return cliente.post(reverse("auth-token"), {"email": usuario.email, "password": password}, format="json")


def login_app(cliente, usuario, password=CLAVE_PRUEBA):
    return cliente.post(
        reverse("auth-app-token"), {"email": usuario.email, "password": password}, format="json"
    )


def yo(cliente, access):
    return cliente.get(reverse("auth-yo"), HTTP_AUTHORIZATION=f"Bearer {access}")


@pytest.mark.django_db
class TestLoginPanel:
    def test_despachador_obtiene_access_y_cookie_httponly(self, panel, despachador):
        respuesta = login_panel(panel, despachador)
        assert respuesta.status_code == 200
        assert respuesta.data["usuario"]["rol"] == "DESPACHADOR"
        assert respuesta.data["usuario"]["empresa"]["id"] == despachador.empresa_id
        assert "refresh" not in respuesta.data
        cookie = respuesta.cookies[COOKIE]
        assert cookie["httponly"] is True
        assert cookie["samesite"] == "Lax"
        assert cookie["path"] == "/api/auth/"
        assert int(cookie["max-age"]) == 12 * 3600

    def test_access_sirve_para_consultar_la_sesion(self, panel, administrador):
        access = login_panel(panel, administrador).data["access"]
        respuesta = yo(panel, access)
        assert respuesta.status_code == 200
        assert respuesta.data["email"] == administrador.email

    def test_email_sin_distinguir_mayusculas(self, panel, despachador):
        respuesta = panel.post(
            reverse("auth-token"),
            {"email": despachador.email.upper(), "password": CLAVE_PRUEBA},
            format="json",
        )
        assert respuesta.status_code == 200

    def test_conductor_no_entra_al_panel(self, panel, conductor):
        respuesta = login_panel(panel, conductor)
        assert respuesta.status_code == 403
        assert COOKIE not in respuesta.cookies

    def test_email_desconocido_responde_igual_que_clave_incorrecta(self, panel, despachador):
        desconocido = panel.post(
            reverse("auth-token"), {"email": "nadie@prueba.example", "password": "x"}, format="json"
        )
        incorrecta = login_panel(panel, despachador, password="incorrecta")
        assert desconocido.status_code == incorrecta.status_code == 401
        assert desconocido.data["detail"] == incorrecta.data["detail"]

    def test_usuario_inactivo(self, panel, empresa):
        usuario = UsuarioFactory(empresa=empresa, activo=False)
        assert login_panel(panel, usuario).status_code == 401

    def test_empresa_inactiva(self, panel, despachador):
        despachador.empresa.activa = False
        despachador.empresa.save()
        assert login_panel(panel, despachador).status_code == 401

    def test_datos_faltantes(self, panel, db):
        assert panel.post(reverse("auth-token"), {}, format="json").status_code == 400

    def test_actualiza_last_login(self, panel, despachador):
        login_panel(panel, despachador)
        despachador.refresh_from_db()
        assert despachador.last_login is not None

    def test_access_incluye_rol_y_empresa(self, panel, despachador):
        from rest_framework_simplejwt.tokens import AccessToken

        token = AccessToken(login_panel(panel, despachador).data["access"])
        assert token["rol"] == "DESPACHADOR"
        assert token["empresa_id"] == despachador.empresa_id


@pytest.mark.django_db
class TestBloqueo:
    def test_bloquea_al_quinto_intento_fallido(self, panel, despachador):
        for intento in range(1, 5):
            assert login_panel(panel, despachador, "mala").status_code == 401
            despachador.refresh_from_db()
            assert despachador.intentos_fallidos == intento
            assert despachador.bloqueado_hasta is None
        quinto = login_panel(panel, despachador, "mala")
        assert quinto.status_code == 401
        assert quinto.data["detail"].code == "cuenta_bloqueada"
        despachador.refresh_from_db()
        assert despachador.intentos_fallidos == 5
        assert despachador.bloqueado_hasta > timezone.now()

    def test_bloqueada_rechaza_incluso_la_clave_correcta(self, panel, despachador):
        Usuario.objects.filter(pk=despachador.pk).update(
            intentos_fallidos=5, bloqueado_hasta=timezone.now() + timedelta(minutes=10)
        )
        respuesta = login_panel(panel, despachador)
        assert respuesta.status_code == 401
        assert respuesta.data["detail"].code == "cuenta_bloqueada"

    def test_bloqueo_vencido_permite_entrar_y_reinicia_contador(self, panel, despachador):
        Usuario.objects.filter(pk=despachador.pk).update(
            intentos_fallidos=5, bloqueado_hasta=timezone.now() - timedelta(seconds=1)
        )
        assert login_panel(panel, despachador).status_code == 200
        despachador.refresh_from_db()
        assert (despachador.intentos_fallidos, despachador.bloqueado_hasta) == (0, None)

    def test_ingreso_correcto_reinicia_intentos(self, panel, despachador):
        login_panel(panel, despachador, "mala")
        login_panel(panel, despachador, "mala")
        assert login_panel(panel, despachador).status_code == 200
        despachador.refresh_from_db()
        assert despachador.intentos_fallidos == 0


@pytest.mark.django_db
class TestRefreshPanel:
    def test_renueva_y_rota_la_cookie(self, panel, despachador):
        primera = login_panel(panel, despachador).cookies[COOKIE].value
        respuesta = panel.post(reverse("auth-refresh"))
        assert respuesta.status_code == 200
        assert yo(panel, respuesta.data["access"]).status_code == 200
        segunda = respuesta.cookies[COOKIE].value
        assert segunda and segunda != primera

    def test_refresh_rotado_no_se_puede_reusar(self, panel, despachador):
        primera = login_panel(panel, despachador).cookies[COOKIE].value
        panel.post(reverse("auth-refresh"))
        panel.cookies[COOKIE] = primera
        assert panel.post(reverse("auth-refresh")).status_code == 401

    def test_sin_cookie(self, panel, db):
        respuesta = panel.post(reverse("auth-refresh"))
        assert respuesta.status_code == 401

    def test_cookie_invalida_no_se_borra(self, panel, db):
        # P2: un refresh rechazado no toca la cookie; solo el logout la borra.
        panel.cookies[COOKIE] = "no-es-un-token"
        respuesta = panel.post(reverse("auth-refresh"))
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_invalida"
        assert COOKIE not in respuesta.cookies

    def test_usuario_desactivado_pierde_la_sesion(self, panel, despachador):
        login_panel(panel, despachador)
        Usuario.objects.filter(pk=despachador.pk).update(activo=False)
        assert panel.post(reverse("auth-refresh")).status_code == 401

    def test_refresh_de_conductor_no_sirve_en_el_panel(self, panel, conductor):
        refresh = login_app(panel, conductor).data["refresh"]
        panel.cookies[COOKIE] = refresh
        assert panel.post(reverse("auth-refresh")).status_code == 401


@pytest.mark.django_db
class TestLogout:
    def test_invalida_el_refresh_y_borra_la_cookie(self, panel, despachador):
        refresh = login_panel(panel, despachador).cookies[COOKIE].value
        respuesta = panel.post(reverse("auth-logout"))
        assert respuesta.status_code == 204
        assert respuesta.cookies[COOKIE].value == ""
        panel.cookies[COOKIE] = refresh
        assert panel.post(reverse("auth-refresh")).status_code == 401

    def test_sin_sesion_igual_responde_204(self, panel, db):
        assert panel.post(reverse("auth-logout")).status_code == 204

    def test_cookie_invalida(self, panel, db):
        panel.cookies[COOKIE] = "basura"
        assert panel.post(reverse("auth-logout")).status_code == 204


@pytest.mark.django_db
class TestApp:
    def test_conductor_obtiene_ambos_tokens(self, cliente, conductor):
        respuesta = login_app(cliente, conductor)
        assert respuesta.status_code == 200
        assert {"access", "refresh", "usuario"} <= respuesta.data.keys()
        assert COOKIE not in respuesta.cookies
        assert yo(cliente, respuesta.data["access"]).status_code == 200

    def test_despachador_no_entra_a_la_app(self, cliente, despachador):
        assert login_app(cliente, despachador).status_code == 403

    def test_refresh_por_cuerpo(self, cliente, conductor):
        refresh = login_app(cliente, conductor).data["refresh"]
        respuesta = cliente.post(reverse("auth-app-refresh"), {"refresh": refresh}, format="json")
        assert respuesta.status_code == 200
        assert respuesta.data["refresh"] != refresh

    def test_refresh_invalido(self, cliente, db):
        respuesta = cliente.post(reverse("auth-app-refresh"), {"refresh": "x"}, format="json")
        assert respuesta.status_code == 401

    def test_refresh_del_panel_no_sirve_en_la_app(self, cliente, panel, despachador):
        refresh = login_panel(panel, despachador).cookies[COOKIE].value
        respuesta = cliente.post(reverse("auth-app-refresh"), {"refresh": refresh}, format="json")
        assert respuesta.status_code == 401


@pytest.mark.django_db
class TestThrottling:
    def test_limita_intentos_de_login_por_ip(self, panel, despachador, settings):
        respuestas = [login_panel(panel, despachador, "mala").status_code for _ in range(11)]
        assert respuestas[-1] == 429


def test_yo_sin_token(cliente):
    assert cliente.get(reverse("auth-yo")).status_code == 401


def test_salud(cliente):
    respuesta = cliente.get(reverse("salud"))
    assert respuesta.status_code == 200
    assert respuesta.json() == {"estado": "ok"}
