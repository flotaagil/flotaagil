"""RN-06: expiración de las solicitudes del portal no confirmadas."""

from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.reservas import expiracion
from apps.reservas.models import Actor, EstadoViaje, HistorialEstado, Viaje

from .fabricas import ViajeFactory

E = EstadoViaje


def pendiente(empresa, minutos_atras: float):
    viaje = ViajeFactory(empresa=empresa, canal="WEB", estado=E.PENDIENTE_CONFIRMACION)
    Viaje.objects.filter(pk=viaje.pk).update(creado_en=timezone.now() - timedelta(minutes=minutos_atras))
    return viaje


@pytest.mark.django_db
class TestExpirarPendientes:
    def test_cancela_solo_las_vencidas(self, empresa):
        vencida = pendiente(empresa, 16)
        vigente = pendiente(empresa, 10)
        assert expiracion.expirar_pendientes() == 1
        vencida.refresh_from_db()
        vigente.refresh_from_db()
        assert vencida.estado == E.CANCELADO
        assert vencida.origen_cancelacion == "SISTEMA"
        assert vencida.motivo_cancelacion == expiracion.MOTIVO
        assert vigente.estado == E.PENDIENTE_CONFIRMACION
        registro = HistorialEstado.objects.get(viaje=vencida)
        assert (registro.estado_anterior, registro.actor, registro.usuario) == (
            E.PENDIENTE_CONFIRMACION,
            Actor.SISTEMA,
            None,
        )

    def test_plazo_configurable_por_empresa(self, empresa, otra_empresa):
        config = otra_empresa.configuracion
        config.expiracion_verificacion_min = 5
        config.save()
        a = pendiente(empresa, 8)  # plazo 15: vigente
        b = pendiente(otra_empresa, 8)  # plazo 5: vencida
        assert expiracion.expirar_pendientes() == 1
        a.refresh_from_db()
        b.refresh_from_db()
        assert (a.estado, b.estado) == (E.PENDIENTE_CONFIRMACION, E.CANCELADO)

    def test_no_toca_otros_estados(self, empresa):
        viaje = ViajeFactory(empresa=empresa, estado=E.SOLICITADO)
        Viaje.objects.filter(pk=viaje.pk).update(creado_en=timezone.now() - timedelta(hours=2))
        assert expiracion.expirar_pendientes() == 0
        viaje.refresh_from_db()
        assert viaje.estado == E.SOLICITADO

    def test_es_idempotente(self, empresa):
        pendiente(empresa, 20)
        assert expiracion.expirar_pendientes() == 1
        assert expiracion.expirar_pendientes() == 0
        assert HistorialEstado.objects.count() == 1

    def test_justo_en_el_limite_se_cancela(self, empresa):
        viaje = pendiente(empresa, 0)
        ahora = Viaje.objects.get(pk=viaje.pk).creado_en + timedelta(minutes=15)
        assert expiracion.expirar_pendientes(ahora=ahora) == 1

    def test_carrera_con_otra_confirmacion(self, empresa, monkeypatch):
        viaje = pendiente(empresa, 20)
        original = expiracion.estados.transicionar

        def confirmada_entretanto(v, *args, **kwargs):
            Viaje.objects.filter(pk=v.pk).update(estado=E.SOLICITADO)
            return original(v, *args, **kwargs)

        monkeypatch.setattr(expiracion.estados, "transicionar", confirmada_entretanto)
        assert expiracion.expirar_pendientes() == 0
        viaje.refresh_from_db()
        assert viaje.estado == E.SOLICITADO


@pytest.mark.django_db
def test_comando(empresa, capsys):
    pendiente(empresa, 30)
    call_command("expirar_pendientes")
    assert "canceladas: 1" in capsys.readouterr().out
