"""Máquina de estados del viaje (Anexo F). Es el único lugar que cambia VIAJE.estado; cada cambio
queda en HISTORIAL_ESTADO."""

from django.db import transaction

from apps.cuentas.models import Rol

from .models import Actor, EstadoViaje, HistorialEstado, Viaje

E = EstadoViaje

TRANSICIONES: dict[str, frozenset[str]] = {
    E.PENDIENTE_CONFIRMACION: frozenset({E.SOLICITADO, E.CANCELADO}),  # RN-06: verificación o expiración
    E.SOLICITADO: frozenset({E.ASIGNADO, E.CANCELADO}),
    E.ASIGNADO: frozenset({E.ACEPTADO, E.SOLICITADO}),  # RN-04: rechazo o 60 s sin respuesta
    E.ACEPTADO: frozenset({E.EN_CAMINO, E.CANCELADO}),
    E.EN_CAMINO: frozenset({E.EN_ZONA, E.CANCELADO}),
    E.EN_ZONA: frozenset({E.PASAJERO_A_BORDO, E.CANCELADO}),  # geocerca de 150 m; no presentación
    E.PASAJERO_A_BORDO: frozenset({E.FINALIZADO}),
    E.FINALIZADO: frozenset(),
    E.CANCELADO: frozenset(),
}

# Desde PASAJERO_A_BORDO solo se puede anular con un cierre forzado (HU-05, RN-11).
SOLO_FORZADA = frozenset({(E.PASAJERO_A_BORDO, E.CANCELADO)})

# HU-03: la reserva se edita antes del despacho.
EDITABLES = frozenset({E.PENDIENTE_CONFIRMACION, E.SOLICITADO})
CANCELABLES = frozenset(estado for estado, destinos in TRANSICIONES.items() if E.CANCELADO in destinos)

ACTOR_POR_ROL = {
    Rol.ADMINISTRADOR: Actor.ADMINISTRADOR,
    Rol.DESPACHADOR: Actor.DESPACHADOR,
    Rol.CONDUCTOR: Actor.CONDUCTOR,
}


class TransicionInvalida(Exception):
    def __init__(self, actual: str, nuevo: str):
        self.actual, self.nuevo = actual, nuevo
        super().__init__(f"No se puede pasar de {actual} a {nuevo}.")


def es_valida(actual: str, nuevo: str, *, forzada: bool = False) -> bool:
    if nuevo in TRANSICIONES.get(actual, ()):
        return True
    return forzada and (actual, nuevo) in SOLO_FORZADA


def actor_de(usuario) -> str:
    return ACTOR_POR_ROL[usuario.rol]


def registrar_inicial(viaje: Viaje, *, actor: str, usuario=None) -> HistorialEstado:
    return HistorialEstado.objects.create(
        viaje=viaje, estado_anterior=None, estado_nuevo=viaje.estado, actor=actor, usuario=usuario
    )


def transicionar(
    viaje: Viaje,
    nuevo: str,
    *,
    actor: str,
    usuario=None,
    forzada: bool = False,
    desde: str | None = None,
    **campos,
) -> Viaje:
    """Cambia el estado con bloqueo de fila, valida la transición y registra el historial.

    `desde` exige que el viaje siga en ese estado al bloquearlo: evita, por ejemplo, que la expiración
    cancele una solicitud que el pasajero confirmó en el mismo instante.
    """
    with transaction.atomic():
        actual = Viaje.objects.select_for_update().get(pk=viaje.pk)
        if desde is not None and actual.estado != desde:
            raise TransicionInvalida(actual.estado, nuevo)
        if not es_valida(actual.estado, nuevo, forzada=forzada):
            raise TransicionInvalida(actual.estado, nuevo)
        anterior = actual.estado
        actual.estado = nuevo
        for campo, valor in campos.items():
            setattr(actual, campo, valor)
        actual.save(update_fields=["estado", *campos])
        HistorialEstado.objects.create(
            viaje=actual, estado_anterior=anterior, estado_nuevo=nuevo, actor=actor, usuario=usuario
        )
    viaje.refresh_from_db()
    return viaje
