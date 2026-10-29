"""RN-06: una solicitud del portal que no se confirma por WhatsApp dentro del plazo de su empresa
(CONFIGURACION_EMPRESA.expiracion_verificacion_min) se cancela.

Hoy la ejecuta el comando `expirar_pendientes` (servicio `programador` del compose de desarrollo);
más adelante la llamará Celery beat. Puede correr varias veces sin efectos duplicados.
"""

from datetime import timedelta

from django.utils import timezone

from . import estados
from .models import Actor, EstadoViaje, OrigenCancelacion, Viaje

MOTIVO = "Sin confirmación por WhatsApp dentro del plazo (RN-06)."


def vence_en(viaje: Viaje):
    return viaje.creado_en + timedelta(minutes=viaje.empresa.configuracion.expiracion_verificacion_min)


def expirar_pendientes(ahora=None) -> int:
    """Cancela las solicitudes vencidas. Devuelve cuántas canceló."""
    ahora = ahora or timezone.now()
    canceladas = 0
    pendientes = Viaje.objects.filter(estado=EstadoViaje.PENDIENTE_CONFIRMACION).select_related(
        "empresa__configuracion"
    )
    for viaje in pendientes.iterator():
        if vence_en(viaje) > ahora:
            continue
        try:
            estados.transicionar(
                viaje,
                EstadoViaje.CANCELADO,
                desde=EstadoViaje.PENDIENTE_CONFIRMACION,
                actor=Actor.SISTEMA,
                motivo_cancelacion=MOTIVO,
                origen_cancelacion=OrigenCancelacion.SISTEMA,
            )
        except estados.TransicionInvalida:
            continue  # otro proceso la confirmó o canceló entretanto
        canceladas += 1
    return canceladas
