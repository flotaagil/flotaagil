"""Renovación de la sesión: P2 (el 401 no toca la cookie), P5 (tope absoluto del panel), claim `canal` y
equivalencia de _rotar() con TokenRefreshSerializer de simplejwt 5.5.1 en el panel y en la app.

El reloj se controla reemplazando apps.cuentas.autenticacion.ahora(). PyJWT valida `exp` e `iat` con la
hora real, así que el login simulado (t0) es 11 h antes de ahora: las renovaciones simuladas hasta las 11 h
caen en el pasado real y sus tokens se pueden volver a usar. Los tokens emitidos en una hora simulada futura
se leen sin verificar (`leer`) solo para revisar sus claims.
"""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.cuentas.models import Usuario

from .fabricas import CLAVE_PRUEBA

COOKIE = settings.JWT_COOKIE["nombre"]
ORIGEN = "http://localhost:5173"
DOCE_HORAS = 12 * 3600


def en(momento):
    return patch("apps.cuentas.autenticacion.ahora", return_value=momento)


def pestaña(refresh=None):
    cliente = APIClient(HTTP_ORIGIN=ORIGEN)
    if refresh:
        cliente.cookies[COOKIE] = refresh
    return cliente


def login_panel(cliente, usuario):
    respuesta = cliente.post(
        reverse("auth-token"), {"email": usuario.email, "password": CLAVE_PRUEBA}, format="json"
    )
    assert respuesta.status_code == 200
    return respuesta


def refresh_panel(refresh):
    return pestaña(refresh).post(reverse("auth-refresh"))


def login_app(usuario):
    respuesta = APIClient().post(
        reverse("auth-app-token"), {"email": usuario.email, "password": CLAVE_PRUEBA}, format="json"
    )
    assert respuesta.status_code == 200
    return respuesta.data["refresh"]


def refresh_app(refresh):
    return APIClient().post(reverse("auth-app-refresh"), {"refresh": refresh}, format="json")


@pytest.fixture
def t0():
    """Login simulado 11 h antes de la hora real (ver docstring del módulo)."""
    return timezone.now().replace(microsecond=0) - timedelta(hours=11)


def leer(clase, token):
    """Claims de un token sin verificarlo (puede tener `iat` en el futuro real)."""
    return clase(token, verify=False)


# --- Canales: el mismo set de pruebas de equivalencia corre en el panel y en la app ---


class Canal:
    def __init__(self, nombre, rol):
        self.nombre, self.rol = nombre, rol

    def iniciar(self, usuario) -> str:
        if self.nombre == "panel":
            return login_panel(pestaña(), usuario).cookies[COOKIE].value
        return login_app(usuario)

    def renovar(self, refresh):
        """(respuesta, refresh nuevo o None)."""
        if self.nombre == "panel":
            respuesta = refresh_panel(refresh)
            nuevo = respuesta.cookies[COOKIE].value if COOKIE in respuesta.cookies else None
        else:
            respuesta = refresh_app(refresh)
            nuevo = respuesta.data.get("refresh") if respuesta.status_code == 200 else None
        return respuesta, nuevo

    def __repr__(self):
        return self.nombre


CANALES = [Canal("panel", "DESPACHADOR"), Canal("app", "CONDUCTOR")]


@pytest.fixture(params=CANALES, ids=repr)
def canal(request):
    return request.param


@pytest.fixture
def usuario(canal, empresa):
    from .fabricas import UsuarioFactory

    return UsuarioFactory(empresa=empresa, rol=canal.rol)


def token_antiguo(usuario, **claims) -> str:
    """Refresh como los que se emitían antes de este cambio (sin `canal`), con claims extra opcionales."""
    refresh = RefreshToken.for_user(usuario)
    refresh["rol"] = usuario.rol
    refresh["empresa_id"] = usuario.empresa_id
    for clave, valor in claims.items():
        refresh[clave] = valor
    return str(refresh)


@pytest.mark.django_db
class TestEquivalenciaDeRotar:
    def test_rota_y_deja_el_anterior_en_la_lista_negra(self, canal, usuario):
        t1 = canal.iniciar(usuario)
        respuesta, t2 = canal.renovar(t1)
        assert respuesta.status_code == 200
        assert t2 and t2 != t1
        anterior, nuevo = RefreshToken(t1, verify=False), RefreshToken(t2)
        assert BlacklistedToken.objects.filter(token__jti=anterior["jti"]).exists()
        assert OutstandingToken.objects.filter(jti=nuevo["jti"]).exists()
        assert nuevo["canal"] == canal.nombre
        assert (nuevo["rol"], nuevo["empresa_id"]) == (usuario.rol, usuario.empresa_id)
        access = AccessToken(respuesta.data["access"])
        assert access["user_id"] == str(usuario.pk)
        assert access["canal"] == canal.nombre

    def test_un_refresh_usado_no_se_puede_reutilizar(self, canal, usuario):
        t1 = canal.iniciar(usuario)
        _, t2 = canal.renovar(t1)
        reuso, _ = canal.renovar(t1)
        assert reuso.status_code == 401
        assert reuso.data["code"] == "sesion_invalida"
        assert COOKIE not in reuso.cookies
        # La sesión renovada sigue viva.
        assert canal.renovar(t2)[0].status_code == 200

    @pytest.mark.parametrize(
        "cambio",
        ["usuario_inactivo", "empresa_inactiva", "rol_incorrecto"],
    )
    def test_usuario_que_ya_no_puede_usar_el_canal(self, canal, usuario, cambio):
        t1 = canal.iniciar(usuario)
        if cambio == "usuario_inactivo":
            Usuario.objects.filter(pk=usuario.pk).update(activo=False)
        elif cambio == "empresa_inactiva":
            usuario.empresa.activa = False
            usuario.empresa.save()
        else:
            otro = "CONDUCTOR" if canal.nombre == "panel" else "DESPACHADOR"
            Usuario.objects.filter(pk=usuario.pk).update(rol=otro)
        respuesta, nuevo = canal.renovar(t1)
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_invalida"
        assert nuevo is None
        # No se rotó: el refresh no quedó en la lista negra.
        assert not BlacklistedToken.objects.filter(token__jti=RefreshToken(t1)["jti"]).exists()

    def test_token_sin_canal_emitido_antes_del_cambio(self, canal, usuario):
        claims = {"sesion_inicio": int(timezone.now().timestamp())} if canal.nombre == "panel" else {}
        respuesta, _ = canal.renovar(token_antiguo(usuario, **claims))
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_invalida"

    def test_token_del_otro_canal(self, canal, usuario):
        # Mismo usuario y rol válido para este canal: solo el claim lo delata.
        otro = "app" if canal.nombre == "panel" else "panel"
        claims = {"canal": otro, "sesion_inicio": int(timezone.now().timestamp())}
        respuesta, _ = canal.renovar(token_antiguo(usuario, **claims))
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_invalida"

    @pytest.mark.parametrize("valor", ["basura", "a.b.c", "eyJhbGciOiJIUzI1NiJ9.e30.firma"])
    def test_token_ilegible_es_401_y_no_500(self, canal, db, valor):
        respuesta, _ = canal.renovar(valor)
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_invalida"


@pytest.mark.django_db
class TestDosPestañasSinWebLocks:
    """P2: dos pestañas renuevan con el mismo refresh; el orden en que llegan las respuestas no importa."""

    @staticmethod
    def aplicar(frasco: str | None, respuesta) -> str | None:
        """Lo que hace el navegador con la cookie al recibir la respuesta."""
        if COOKIE not in respuesta.cookies:
            return frasco
        cookie = respuesta.cookies[COOKIE]
        return None if str(cookie["max-age"]) == "0" or cookie.value == "" else cookie.value

    def test_la_cookie_termina_renovada_en_cualquier_orden(self, despachador):
        t1 = login_panel(pestaña(), despachador).cookies[COOKIE].value
        a = refresh_panel(t1)
        b = refresh_panel(t1)
        assert (a.status_code, b.status_code) == (200, 401)
        assert COOKIE not in b.cookies
        t2 = a.cookies[COOKIE].value
        for orden in ((a, b), (b, a)):
            frasco = t1
            for respuesta in orden:
                frasco = self.aplicar(frasco, respuesta)
            assert frasco == t2

    def test_reintento_cuando_la_cookie_ya_se_actualizo(self, despachador):
        t1 = login_panel(pestaña(), despachador).cookies[COOKIE].value
        t2 = refresh_panel(t1).cookies[COOKIE].value
        assert refresh_panel(t1).status_code == 401
        reintento = refresh_panel(t2)
        assert reintento.status_code == 200

    def test_reintento_cuando_la_cookie_todavia_no_se_actualizo(self, despachador):
        # Caso 4b: la respuesta de A aún no llega, B reintenta con T1 y recibe otro 401 sin tocar la cookie.
        t1 = login_panel(pestaña(), despachador).cookies[COOKIE].value
        a = refresh_panel(t1)
        assert refresh_panel(t1).status_code == 401
        reintento = refresh_panel(t1)
        assert reintento.status_code == 401
        assert COOKIE not in reintento.cookies
        # Cuando llega la respuesta de A la cookie queda en T2 y la sesión sigue viva para quien recargue.
        frasco = self.aplicar(self.aplicar(t1, reintento), a)
        assert refresh_panel(frasco).status_code == 200

    def test_solo_el_logout_borra_la_cookie(self, despachador):
        cliente = pestaña()
        login_panel(cliente, despachador)
        respuesta = cliente.post(reverse("auth-logout"))
        assert respuesta.status_code == 204
        assert respuesta.cookies[COOKIE].value == ""


@pytest.mark.django_db
class TestTopeDeLaSesionDelPanel:
    def iniciar(self, despachador, t0) -> str:
        with en(t0):
            respuesta = login_panel(pestaña(), despachador)
        assert int(respuesta.cookies[COOKIE]["max-age"]) == DOCE_HORAS
        refresh = RefreshToken(respuesta.cookies[COOKIE].value)
        assert refresh["sesion_inicio"] == int(t0.timestamp())
        assert refresh["exp"] == int(t0.timestamp()) + DOCE_HORAS
        return refresh_str(respuesta)

    def renovar_a(self, refresh, momento):
        with en(momento):
            return refresh_panel(refresh)

    def test_la_rotacion_no_extiende_la_sesion(self, despachador, t0):
        t1 = self.iniciar(despachador, t0)
        momento = t0 + timedelta(hours=6)
        respuesta = self.renovar_a(t1, momento)
        assert respuesta.status_code == 200
        refresh = leer(RefreshToken, refresh_str(respuesta))
        access = leer(AccessToken, respuesta.data["access"])
        inicio = int(t0.timestamp())
        assert refresh["sesion_inicio"] == inicio
        assert refresh["exp"] == inicio + DOCE_HORAS
        assert access["exp"] == int(momento.timestamp()) + 15 * 60
        assert int(respuesta.cookies[COOKIE]["max-age"]) == 6 * 3600

    def test_a_las_11_59_59_responde_200_con_un_segundo_de_vida(self, despachador, t0):
        t1 = self.iniciar(despachador, t0)
        respuesta = self.renovar_a(t1, t0 + timedelta(hours=11, minutes=59, seconds=59))
        assert respuesta.status_code == 200
        fin = int(t0.timestamp()) + DOCE_HORAS
        assert leer(RefreshToken, refresh_str(respuesta))["exp"] == fin
        assert leer(AccessToken, respuesta.data["access"])["exp"] == fin
        assert int(respuesta.cookies[COOKIE]["max-age"]) == 1

    @pytest.mark.parametrize(
        "despues", [timedelta(hours=12), timedelta(hours=12, seconds=1), timedelta(hours=13)]
    )
    def test_desde_las_12_horas_responde_sesion_expirada(self, despachador, t0, despues):
        t1 = self.iniciar(despachador, t0)
        respuesta = self.renovar_a(t1, t0 + despues)
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_expirada"
        assert COOKIE not in respuesta.cookies
        # No se rotó.
        assert not BlacklistedToken.objects.filter(token__jti=RefreshToken(t1)["jti"]).exists()

    def test_tope_tras_varias_rotaciones(self, despachador, t0):
        refresh = self.iniciar(despachador, t0)
        for horas in (3, 6, 9, 11):
            respuesta = self.renovar_a(refresh, t0 + timedelta(hours=horas))
            assert respuesta.status_code == 200
            refresh = refresh_str(respuesta)
        assert self.renovar_a(refresh, t0 + timedelta(hours=12)).data["code"] == "sesion_expirada"

    def test_regla_aislada_con_exp_lejano(self, despachador):
        # exp vigente según simplejwt, pero la sesión empezó hace 12 h: solo la regla del tope la rechaza.
        inicio = int((timezone.now() - timedelta(hours=12)).timestamp())
        token = token_antiguo(despachador, canal="panel", sesion_inicio=inicio)
        respuesta = refresh_panel(token)
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_expirada"

    def test_si_simplejwt_rechaza_antes_por_exp_es_sesion_invalida(self, despachador):
        # Login hace 13 h (reloj real): el refresh ya venció y simplejwt lo rechaza antes que la regla.
        with en(timezone.now().replace(microsecond=0) - timedelta(hours=13)):
            t1 = login_panel(pestaña(), despachador).cookies[COOKIE].value
        respuesta = refresh_panel(t1)
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_invalida"

    def test_sin_sesion_inicio_no_se_acepta(self, despachador):
        respuesta = refresh_panel(token_antiguo(despachador, canal="panel"))
        assert respuesta.status_code == 401
        assert respuesta.data["code"] == "sesion_invalida"


@pytest.mark.django_db
class TestAppSinTope:
    def test_la_app_mantiene_la_rotacion_deslizante(self, conductor, t0):
        with en(t0):
            t1 = login_app(conductor)
        assert "sesion_inicio" not in RefreshToken(t1).payload
        assert RefreshToken(t1)["canal"] == "app"
        with en(t0 + timedelta(hours=11)):
            r1 = refresh_app(t1)
        assert r1.status_code == 200
        assert leer(RefreshToken, r1.data["refresh"])["exp"] == int(t0.timestamp()) + 23 * 3600
        with en(t0 + timedelta(hours=13)):
            r2 = refresh_app(r1.data["refresh"])
        assert r2.status_code == 200
        nuevo = leer(RefreshToken, r2.data["refresh"])
        assert nuevo["exp"] == int(t0.timestamp()) + 25 * 3600
        assert "sesion_inicio" not in nuevo.payload
        assert (
            leer(AccessToken, r2.data["access"])["exp"]
            == int((t0 + timedelta(hours=13)).timestamp()) + 15 * 60
        )
        assert COOKIE not in r2.cookies


def refresh_str(respuesta) -> str:
    return respuesta.cookies[COOKIE].value
