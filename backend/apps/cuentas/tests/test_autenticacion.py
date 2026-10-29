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
    def test_despachador_obtiene_access_y_cookie_httponly(self, cliente, despachador):
        respuesta = login_panel(cliente, despachador)
        assert respuesta.status_code == 200
        assert respuesta.data["usuario"]["rol"] == "DESPACHADOR"
        assert respuesta.data["usuario"]["empresa"]["id"] == despachador.empresa_id
        assert "refresh" not in respuesta.data
        cookie = respuesta.cookies[COOKIE]
        assert cookie["httponly"] is True
        assert cookie["samesite"] == "Lax"
        assert cookie["path"] == "/api/auth/"
        assert int(cookie["max-age"]) == 12 * 3600

    def test_access_sirve_para_consultar_la_sesion(self, cliente, administrador):
        access = login_panel(cliente, administrador).data["access"]
        respuesta = yo(cliente, access)
        assert respuesta.status_code == 200
        assert respuesta.data["email"] == administrador.email

    def test_email_sin_distinguir_mayusculas(self, cliente, despachador):
        respuesta = cliente.post(
            reverse("auth-token"),
            {"email": despachador.email.upper(), "password": CLAVE_PRUEBA},
            format="json",
        )
        assert respuesta.status_code == 200

    def test_conductor_no_entra_al_panel(self, cliente, conductor):
        respuesta = login_panel(cliente, conductor)
        assert respuesta.status_code == 403
        assert COOKIE not in respuesta.cookies

    def test_email_desconocido_responde_igual_que_clave_incorrecta(self, cliente, despachador):
        desconocido = cliente.post(
            reverse("auth-token"), {"email": "nadie@prueba.example", "password": "x"}, format="json"
        )
        incorrecta = login_panel(cliente, despachador, password="incorrecta")
        assert desconocido.status_code == incorrecta.status_code == 401
        assert desconocido.data["detail"] == incorrecta.data["detail"]

    def test_usuario_inactivo(self, cliente, empresa):
        usuario = UsuarioFactory(empresa=empresa, activo=False)
        assert login_panel(cliente, usuario).status_code == 401

    def test_empresa_inactiva(self, cliente, despachador):
        despachador.empresa.activa = False
        despachador.empresa.save()
        assert login_panel(cliente, despachador).status_code == 401

    def test_datos_faltantes(self, cliente, db):
        assert cliente.post(reverse("auth-token"), {}, format="json").status_code == 400

    def test_actualiza_last_login(self, cliente, despachador):
        login_panel(cliente, despachador)
        despachador.refresh_from_db()
        assert despachador.last_login is not None

    def test_access_incluye_rol_y_empresa(self, cliente, despachador):
        from rest_framework_simplejwt.tokens import AccessToken

        token = AccessToken(login_panel(cliente, despachador).data["access"])
        assert token["rol"] == "DESPACHADOR"
        assert token["empresa_id"] == despachador.empresa_id


@pytest.mark.django_db
class TestBloqueo:
    def test_bloquea_al_quinto_intento_fallido(self, cliente, despachador):
        for intento in range(1, 5):
            assert login_panel(cliente, despachador, "mala").status_code == 401
            despachador.refresh_from_db()
            assert despachador.intentos_fallidos == intento
            assert despachador.bloqueado_hasta is None
        quinto = login_panel(cliente, despachador, "mala")
        assert quinto.status_code == 401
        assert quinto.data["detail"].code == "cuenta_bloqueada"
        despachador.refresh_from_db()
        assert despachador.intentos_fallidos == 5
        assert despachador.bloqueado_hasta > timezone.now()

    def test_bloqueada_rechaza_incluso_la_clave_correcta(self, cliente, despachador):
        Usuario.objects.filter(pk=despachador.pk).update(
            intentos_fallidos=5, bloqueado_hasta=timezone.now() + timedelta(minutes=10)
        )
        respuesta = login_panel(cliente, despachador)
        assert respuesta.status_code == 401
        assert respuesta.data["detail"].code == "cuenta_bloqueada"

    def test_bloqueo_vencido_permite_entrar_y_reinicia_contador(self, cliente, despachador):
        Usuario.objects.filter(pk=despachador.pk).update(
            intentos_fallidos=5, bloqueado_hasta=timezone.now() - timedelta(seconds=1)
        )
        assert login_panel(cliente, despachador).status_code == 200
        despachador.refresh_from_db()
        assert (despachador.intentos_fallidos, despachador.bloqueado_hasta) == (0, None)

    def test_ingreso_correcto_reinicia_intentos(self, cliente, despachador):
        login_panel(cliente, despachador, "mala")
        login_panel(cliente, despachador, "mala")
        assert login_panel(cliente, despachador).status_code == 200
        despachador.refresh_from_db()
        assert despachador.intentos_fallidos == 0


@pytest.mark.django_db
class TestRefreshPanel:
    def test_renueva_y_rota_la_cookie(self, cliente, despachador):
        primera = login_panel(cliente, despachador).cookies[COOKIE].value
        respuesta = cliente.post(reverse("auth-refresh"))
        assert respuesta.status_code == 200
        assert yo(cliente, respuesta.data["access"]).status_code == 200
        segunda = respuesta.cookies[COOKIE].value
        assert segunda and segunda != primera

    def test_refresh_rotado_no_se_puede_reusar(self, cliente, despachador):
        primera = login_panel(cliente, despachador).cookies[COOKIE].value
        cliente.post(reverse("auth-refresh"))
        cliente.cookies[COOKIE] = primera
        assert cliente.post(reverse("auth-refresh")).status_code == 401

    def test_sin_cookie(self, cliente, db):
        respuesta = cliente.post(reverse("auth-refresh"))
        assert respuesta.status_code == 401

    def test_cookie_invalida_se_borra(self, cliente, db):
        cliente.cookies[COOKIE] = "no-es-un-token"
        respuesta = cliente.post(reverse("auth-refresh"))
        assert respuesta.status_code == 401
        assert respuesta.cookies[COOKIE].value == ""

    def test_usuario_desactivado_pierde_la_sesion(self, cliente, despachador):
        login_panel(cliente, despachador)
        Usuario.objects.filter(pk=despachador.pk).update(activo=False)
        assert cliente.post(reverse("auth-refresh")).status_code == 401

    def test_refresh_de_conductor_no_sirve_en_el_panel(self, cliente, conductor):
        refresh = login_app(cliente, conductor).data["refresh"]
        cliente.cookies[COOKIE] = refresh
        assert cliente.post(reverse("auth-refresh")).status_code == 401


@pytest.mark.django_db
class TestLogout:
    def test_invalida_el_refresh_y_borra_la_cookie(self, cliente, despachador):
        refresh = login_panel(cliente, despachador).cookies[COOKIE].value
        respuesta = cliente.post(reverse("auth-logout"))
        assert respuesta.status_code == 204
        assert respuesta.cookies[COOKIE].value == ""
        cliente.cookies[COOKIE] = refresh
        assert cliente.post(reverse("auth-refresh")).status_code == 401

    def test_sin_sesion_igual_responde_204(self, cliente, db):
        assert cliente.post(reverse("auth-logout")).status_code == 204

    def test_cookie_invalida(self, cliente, db):
        cliente.cookies[COOKIE] = "basura"
        assert cliente.post(reverse("auth-logout")).status_code == 204


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

    def test_refresh_del_panel_no_sirve_en_la_app(self, cliente, despachador):
        refresh = login_panel(cliente, despachador).cookies[COOKIE].value
        respuesta = cliente.post(reverse("auth-app-refresh"), {"refresh": refresh}, format="json")
        assert respuesta.status_code == 401


@pytest.mark.django_db
class TestThrottling:
    def test_limita_intentos_de_login_por_ip(self, cliente, despachador, settings):
        respuestas = [login_panel(cliente, despachador, "mala").status_code for _ in range(11)]
        assert respuestas[-1] == 429


def test_yo_sin_token(cliente):
    assert cliente.get(reverse("auth-yo")).status_code == 401


def test_salud(cliente):
    respuesta = cliente.get(reverse("salud"))
    assert respuesta.status_code == 200
    assert respuesta.json() == {"estado": "ok"}
