"""Renovaciones concurrentes con el mismo refresh: el bloqueo de la fila del usuario las pone en serie.

Sin el bloqueo, simplejwt 5.5.1 deja pasar a dos peticiones que revisan la lista negra (un SELECT) antes de
que alguna la escriba, y las dos reciben un refresh válido. Esta prueba recrea esa carrera de forma
determinista: una transacción toma la fila del usuario (la renovación «A»), la renovación «B» llega con el
mismo refresh, pasa la primera revisión de la lista negra y debe quedar esperando el bloqueo. Cuando A deja
el refresh en la lista negra y confirma, B tiene que revisarla de nuevo y responder 401.

Corre contra el PostgreSQL real (compose de desarrollo y CI) y no se omite: el bloqueo de fila y
pg_stat_activity no existen en SQLite. Las esperas son por condición, con un tope solo para no colgarse.
"""

import threading
import time

import pytest
from django.conf import settings
from django.db import connection, connections, transaction
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.cuentas.models import Usuario

from .fabricas import CLAVE_PRUEBA, UsuarioFactory

COOKIE = settings.JWT_COOKIE["nombre"]
ORIGEN = "http://localhost:5173"
TOPE_SEGUNDOS = 10


def esperar(condicion) -> bool:
    limite = time.monotonic() + TOPE_SEGUNDOS
    while time.monotonic() < limite:
        if condicion():
            return True
        time.sleep(0.01)
    return False


def sesiones_esperando_un_bloqueo() -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM pg_stat_activity "
            "WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()"
        )
        return cursor.fetchone()[0]


def iniciar(canal, usuario) -> str:
    datos = {"email": usuario.email, "password": CLAVE_PRUEBA}
    if canal == "panel":
        return (
            APIClient(HTTP_ORIGIN=ORIGEN)
            .post(reverse("auth-token"), datos, format="json")
            .cookies[COOKIE]
            .value
        )
    return APIClient().post(reverse("auth-app-token"), datos, format="json").data["refresh"]


def renovar(canal, refresh):
    if canal == "panel":
        cliente = APIClient(HTTP_ORIGIN=ORIGEN)
        cliente.cookies[COOKIE] = refresh
        return cliente.post(reverse("auth-refresh"))
    return APIClient().post(reverse("auth-app-refresh"), {"refresh": refresh}, format="json")


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(("canal", "rol"), [("panel", "DESPACHADOR"), ("app", "CONDUCTOR")])
def test_dos_renovaciones_con_el_mismo_refresh_no_ganan_las_dos(canal, rol, empresa):
    assert connection.vendor == "postgresql", "Esta prueba debe correr contra PostgreSQL, nunca SQLite."
    usuario = UsuarioFactory(empresa=empresa, rol=rol)
    t1 = iniciar(canal, usuario)
    tokens_antes = OutstandingToken.objects.filter(user=usuario).count()

    a_tiene_la_fila = threading.Event()
    soltar_a = threading.Event()
    resultado = {}

    def renovacion_a():
        """Lo que hace la renovación ganadora mientras tiene la fila: rotar T1 y confirmar."""
        try:
            with transaction.atomic():
                Usuario.objects.select_for_update().get(pk=usuario.pk)
                a_tiene_la_fila.set()
                soltar_a.wait(TOPE_SEGUNDOS)
                RefreshToken(t1).blacklist()
        finally:
            connections.close_all()

    def renovacion_b():
        try:
            resultado["b"] = renovar(canal, t1)
        finally:
            connections.close_all()

    hilo_a = threading.Thread(target=renovacion_a)
    hilo_b = threading.Thread(target=renovacion_b)
    hilo_a.start()
    assert a_tiene_la_fila.wait(TOPE_SEGUNDOS)
    hilo_b.start()
    try:
        # B ya pasó la primera revisión de la lista negra (T1 todavía no está): debe esperar la fila.
        b_espero = esperar(lambda: sesiones_esperando_un_bloqueo() >= 1)
    finally:
        soltar_a.set()
        hilo_a.join(TOPE_SEGUNDOS)
        hilo_b.join(TOPE_SEGUNDOS)

    assert b_espero, (
        f"La renovación B no esperó el bloqueo de la fila (respondió {resultado['b'].status_code})."
    )
    respuesta = resultado["b"]
    assert respuesta.status_code == 401
    assert respuesta.data["code"] == "sesion_invalida"
    assert COOKIE not in respuesta.cookies
    # B no emitió ningún refresh nuevo.
    assert OutstandingToken.objects.filter(user=usuario).count() == tokens_antes
