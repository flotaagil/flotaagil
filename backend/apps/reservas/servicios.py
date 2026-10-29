"""Casos de uso de reservas: crear, editar y cancelar viajes (HU-03).

El portal (HU-19) reutiliza crear_viaje.
"""

from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.aeropuerto.models import Vuelo
from apps.auditoria import servicios as auditoria
from apps.auditoria.models import Entidad
from apps.integraciones.geocodificador import (
    Coordenadas,
    GeocodificacionError,
    Zona,
    obtener_geocodificador,
)

from . import estados
from .models import EstadoViaje, OrigenCancelacion, Pasajero, Sentido, Viaje


class ConflictoEstado(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflicto_estado"
    default_detail = "La reserva no admite esta operación en su estado actual."


def normalizar_vuelo(numero: str) -> str:
    return " ".join(numero.upper().split())


def _punto(direccion: str, zona: Zona, geocodificador, campo: str) -> Point:
    try:
        coordenadas = geocodificador.geocodificar(direccion, zona)
    except GeocodificacionError as error:
        raise ValidationError({campo: [str(error)]}) from error
    return Point(coordenadas.lon, coordenadas.lat, srid=4326)


def _validar_origen_en_zona(punto: Point, zona: Zona) -> None:
    if not zona.contiene(Coordenadas(lat=punto.y, lon=punto.x)):
        raise ValidationError({"origen_dir": ["El origen está fuera de la zona de operación de la empresa."]})


def _validar_recogida(recogida_en) -> None:
    if recogida_en <= timezone.now():
        raise ValidationError({"recogida_en": ["La hora de recogida debe ser futura."]})


def _validar_vuelo(sentido: str, vuelo: dict | None) -> None:
    if vuelo and sentido != Sentido.DESDE_AEROPUERTO:
        raise ValidationError(
            {"vuelo": ["El vuelo solo se registra en viajes desde el aeropuerto (llegadas)."]}
        )


def _guardar_vuelo(viaje: Viaje, vuelo: dict | None) -> None:
    Vuelo.objects.filter(viaje=viaje).delete()
    if vuelo:
        hora = vuelo["hora_programada"]
        Vuelo.objects.create(
            viaje=viaje,
            numero=normalizar_vuelo(vuelo["numero"]),
            fecha=timezone.localdate(hora),
            hora_programada=hora,
        )


def obtener_pasajero(empresa, *, nombre: str, telefono: str) -> Pasajero:
    pasajero, _ = Pasajero.objects.get_or_create(
        empresa=empresa, telefono=telefono, defaults={"nombre": nombre}
    )
    return pasajero


def crear_viaje(
    *,
    empresa,
    datos: dict,
    canal: str,
    estado_inicial: str,
    actor: str,
    usuario=None,
    geocodificador=None,
    validar_futuro: bool = True,
) -> Viaje:
    """Crea la reserva con sus coordenadas, el vuelo (si corresponde) y el primer registro del historial.

    Estado inicial: SOLICITADO si la ingresa el despachador o llega por convenio; PENDIENTE_CONFIRMACION
    si llega desde el portal (RN-06).
    """
    geocodificador = geocodificador or obtener_geocodificador()
    zona = Zona.de_configuracion(empresa.configuracion)
    sentido = datos.get("sentido") or Sentido.URBANO
    vuelo = datos.get("vuelo")
    if validar_futuro:
        _validar_recogida(datos["recogida_en"])
    _validar_vuelo(sentido, vuelo)
    origen = _punto(datos["origen_dir"], zona, geocodificador, "origen_dir")
    _validar_origen_en_zona(origen, zona)
    destino = _punto(datos["destino_dir"], zona, geocodificador, "destino_dir")

    with transaction.atomic():
        pasajero = obtener_pasajero(empresa, **datos["pasajero"])
        viaje = Viaje.objects.create(
            empresa=empresa,
            pasajero=pasajero,
            convenio=datos.get("convenio"),
            canal=canal,
            sentido=sentido,
            origen_dir=datos["origen_dir"],
            origen_geo=origen,
            destino_dir=datos["destino_dir"],
            destino_geo=destino,
            recogida_en=datos["recogida_en"],
            tarifa=datos.get("tarifa"),
            estado=estado_inicial,
        )
        _guardar_vuelo(viaje, vuelo)
        estados.registrar_inicial(viaje, actor=actor, usuario=usuario)
    return viaje


def editar_viaje(viaje: Viaje, datos: dict, *, geocodificador=None) -> Viaje:
    """HU-03: edición antes del despacho (PENDIENTE_CONFIRMACION o SOLICITADO)."""
    if viaje.estado not in estados.EDITABLES:
        raise ConflictoEstado(
            "Solo se puede editar una reserva pendiente de confirmación o solicitada (antes del despacho)."
        )
    geocodificador = geocodificador or obtener_geocodificador()
    zona = Zona.de_configuracion(viaje.empresa.configuracion)

    sentido = datos.get("sentido", viaje.sentido)
    # El vuelo existente solo se toca si se envía uno nuevo (o null) o si el viaje deja de ser desde el
    # aeropuerto; así se conservan la ETA y el estado que registra el monitoreo (HU-27).
    reemplazar_vuelo = "vuelo" in datos or sentido != Sentido.DESDE_AEROPUERTO
    if "vuelo" in datos:
        _validar_vuelo(sentido, datos["vuelo"])
    if "recogida_en" in datos:
        _validar_recogida(datos["recogida_en"])

    campos = {k: datos[k] for k in ("sentido", "recogida_en", "tarifa") if k in datos}
    if "origen_dir" in datos and datos["origen_dir"] != viaje.origen_dir:
        campos["origen_dir"] = datos["origen_dir"]
        campos["origen_geo"] = _punto(datos["origen_dir"], zona, geocodificador, "origen_dir")
        _validar_origen_en_zona(campos["origen_geo"], zona)
    if "destino_dir" in datos and datos["destino_dir"] != viaje.destino_dir:
        campos["destino_dir"] = datos["destino_dir"]
        campos["destino_geo"] = _punto(datos["destino_dir"], zona, geocodificador, "destino_dir")

    with transaction.atomic():
        for campo, valor in campos.items():
            setattr(viaje, campo, valor)
        if campos:
            viaje.save(update_fields=list(campos))
        if reemplazar_vuelo:
            _guardar_vuelo(viaje, datos.get("vuelo"))
    return Viaje.objects.get(pk=viaje.pk)


def cancelar_viaje(viaje: Viaje, *, motivo: str, usuario) -> Viaje:
    """Cancelación desde el panel: exige motivo, registra el historial y la auditoría.

    origen_cancelacion es DESPACHADOR para cualquier usuario del panel (DC-08); el historial
    distingue al administrador.
    """
    if viaje.estado not in estados.CANCELABLES:
        raise ConflictoEstado(f"Una reserva en estado {viaje.estado} no se puede cancelar desde aquí.")
    estado_previo = viaje.estado
    with transaction.atomic():
        try:
            viaje = estados.transicionar(
                viaje,
                EstadoViaje.CANCELADO,
                actor=estados.actor_de(usuario),
                usuario=usuario,
                motivo_cancelacion=motivo,
                origen_cancelacion=OrigenCancelacion.DESPACHADOR,
            )
        except estados.TransicionInvalida as error:
            raise ConflictoEstado(str(error)) from error
        auditoria.registrar(
            usuario=usuario,
            entidad=Entidad.VIAJE,
            entidad_id=viaje.pk,
            accion="CANCELACION",
            motivo=motivo,
            datos_previos={"estado": estado_previo},
        )
    return viaje
