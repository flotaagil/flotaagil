"""HU-19: solicitud de viaje desde el portal público (sin cuenta)."""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled, ValidationError

from apps.integraciones.notificaciones import obtener_notificador
from apps.reservas import servicios as reservas
from apps.reservas.expiracion import vence_en
from apps.reservas.models import Actor, Canal, EstadoViaje, Pasajero, Sentido, Viaje

MENSAJE = (
    "Recibimos tu solicitud. Te enviaremos un WhatsApp para confirmarla; si no la confirmas antes del "
    "plazo, se cancelará automáticamente."
)


def _verificar_limite_telefono(empresa, telefono: str) -> None:
    """Máximo de solicitudes por número y empresa en la ventana (alineado con RN-06: 3 cada 15 min)."""
    desde = timezone.now() - settings.PORTAL_VENTANA_TELEFONO
    recientes = Viaje.objects.filter(
        empresa=empresa, canal=Canal.WEB, pasajero__telefono=telefono, creado_en__gte=desde
    ).count()
    if recientes >= settings.PORTAL_MAX_SOLICITUDES_POR_TELEFONO:
        raise Throttled(
            wait=settings.PORTAL_VENTANA_TELEFONO.total_seconds(),
            detail="Ya enviaste varias solicitudes con este número. Espera unos minutos e intenta de nuevo.",
        )


def _hora_de_recogida(datos: dict, config):
    """RN-17: desde el aeropuerto, si no viene la hora de recogida es la llegada + margen.

    VUELO no distingue nacional de internacional (DC-12): se usa el margen nacional.
    """
    if "recogida_en" in datos:
        return datos["recogida_en"]
    return datos["vuelo"]["hora_llegada"] + timedelta(minutes=config.margen_nacional_min)


def crear_solicitud(empresa, datos: dict) -> tuple[Viaje | None, dict]:
    """Crea la reserva en PENDIENTE_CONFIRMACION y pide la verificación por WhatsApp.

    Devuelve el viaje (None si la solicitud vino de un bot) y los datos de la respuesta.
    """
    config = empresa.configuracion
    recogida = _hora_de_recogida(datos, config)
    minimo = timezone.now() + timedelta(minutes=config.anticipacion_minima_min)
    if recogida < minimo:
        minutos = config.anticipacion_minima_min
        raise ValidationError(
            {"recogida_en": [f"La recogida debe ser al menos {minutos} minutos después de ahora."]}
        )

    if datos.get("sitio_web"):
        # Campo trampa: se responde como si nada para no darle pistas al bot.
        ahora = timezone.now()
        return None, {
            "estado": EstadoViaje.PENDIENTE_CONFIRMACION,
            "recogida_en": recogida,
            "expira_en": ahora + timedelta(minutes=config.expiracion_verificacion_min),
            "mensaje": MENSAJE,
        }

    _verificar_limite_telefono(empresa, datos["telefono"])
    vuelo = datos.get("vuelo")
    with transaction.atomic():
        viaje = reservas.crear_viaje(
            empresa=empresa,
            datos={
                "pasajero": {"nombre": datos["nombre"], "telefono": datos["telefono"]},
                "sentido": datos.get("sentido", Sentido.URBANO),
                "origen_dir": datos["origen_dir"],
                "destino_dir": datos["destino_dir"],
                "recogida_en": recogida,
                "vuelo": {"numero": vuelo["numero"], "hora_programada": vuelo["hora_llegada"]}
                if vuelo
                else None,
            },
            canal=Canal.WEB,
            estado_inicial=EstadoViaje.PENDIENTE_CONFIRMACION,
            actor=Actor.PASAJERO,
        )
        # Las aceptaciones se registran con la hora de la última solicitud (DC-11).
        ahora = timezone.now()
        Pasajero.objects.filter(pk=viaje.pasajero_id).update(opt_in_en=ahora, privacidad_aceptada_en=ahora)
        viaje = Viaje.objects.select_related("pasajero", "empresa__configuracion").get(pk=viaje.pk)
        expira_en = vence_en(viaje)
        transaction.on_commit(lambda: obtener_notificador().solicitar_verificacion(viaje, expira_en))

    return viaje, {
        "estado": viaje.estado,
        "recogida_en": viaje.recogida_en,
        "expira_en": expira_en,
        "mensaje": MENSAJE,
    }
