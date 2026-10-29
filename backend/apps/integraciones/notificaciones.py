"""Notificaciones al pasajero por WhatsApp, detrás de un adaptador.

En esta etapa solo existe la implementación de desarrollo, que deja en el log el mensaje que se enviaría.
La implementación con Twilio (plantilla con botones Confirmar/Cancelar, MENSAJE_WHATSAPP, webhooks
idempotentes) es parte de HU-20.
"""

import logging
from typing import Protocol

from django.utils import timezone

logger = logging.getLogger(__name__)


def enmascarar_telefono(telefono: str) -> str:
    """El log no guarda el número completo (dato personal): +56900009001 → +569******01."""
    return telefono[:4] + "*" * max(len(telefono) - 6, 0) + telefono[-2:]


class Notificador(Protocol):
    def solicitar_verificacion(self, viaje, expira_en) -> None: ...


class NotificadorDesarrollo:
    def solicitar_verificacion(self, viaje, expira_en) -> None:
        logger.info(
            "[WhatsApp simulado] Verificación de la solicitud #%s a %s: recogida %s, expira %s.",
            viaje.pk,
            enmascarar_telefono(viaje.pasajero.telefono),
            timezone.localtime(viaje.recogida_en).strftime("%d-%m %H:%M"),
            timezone.localtime(expira_en).strftime("%H:%M"),
        )


def obtener_notificador() -> Notificador:
    return NotificadorDesarrollo()
