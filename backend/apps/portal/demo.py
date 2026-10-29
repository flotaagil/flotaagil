"""Solicitudes sintéticas del portal para `datos_demo --pendientes`.

Pasan por el mismo servicio que el endpoint público, así que la expiración (RN-06) es la real: vencen a
los `expiracion_verificacion_min` de su empresa y `expirar_pendientes` las cancela como a cualquier otra.
"""

from datetime import timedelta

from django.utils import timezone

from apps.reservas.demo import DIRECCIONES
from apps.reservas.expiracion import vence_en
from apps.reservas.models import Canal, EstadoViaje, Sentido, Viaje

from .servicios import crear_solicitud

PENDIENTES_POR_EMPRESA = 2


def vigentes(empresa, ahora=None) -> list[Viaje]:
    """Solicitudes en PENDIENTE_CONFIRMACION que todavía no vencen."""
    ahora = ahora or timezone.now()
    pendientes = Viaje.objects.filter(
        empresa=empresa, estado=EstadoViaje.PENDIENTE_CONFIRMACION
    ).select_related("empresa__configuracion")
    return [viaje for viaje in pendientes if vence_en(viaje) > ahora]


def completar(empresa, numero_empresa: int, faker) -> list[Viaje]:
    """Crea las solicitudes que falten para tener PENDIENTES_POR_EMPRESA vigentes. Devuelve las creadas."""
    faltan = PENDIENTES_POR_EMPRESA - len(vigentes(empresa))
    creadas = []
    for _ in range(max(faltan, 0)):
        # Teléfono ficticio distinto por solicitud (rango +5690019…) para no chocar con el límite por número.
        n = Viaje.objects.filter(empresa=empresa, canal=Canal.WEB).count()
        viaje, _ = crear_solicitud(
            empresa,
            {
                "nombre": faker.name(),
                "telefono": f"+5690019{numero_empresa}{n % 1000:03d}",
                "sentido": Sentido.URBANO,
                "origen_dir": DIRECCIONES[n % len(DIRECCIONES)],
                "destino_dir": DIRECCIONES[(n + 3) % len(DIRECCIONES)],
                "recogida_en": timezone.now().replace(second=0, microsecond=0)
                + timedelta(hours=2 + len(creadas)),
            },
        )
        creadas.append(viaje)
    return creadas
