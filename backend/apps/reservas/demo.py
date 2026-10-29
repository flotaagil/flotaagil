"""Datos sintéticos de reservas para datos_demo: pasajeros, un convenio y 15 viajes por empresa en todos
los estados. Los cambios de estado pasan por la máquina de estados, así el historial es coherente."""

from datetime import timedelta

from django.utils import timezone

from apps.comun.validadores import digito_verificador
from apps.convenios.models import Convenio
from apps.cuentas.models import Rol

from . import estados, servicios
from .models import Actor, Canal, EstadoViaje, OrigenCancelacion, Sentido, Viaje

E = EstadoViaje

DIRECCIONES = [
    "Av. Providencia 1234, Providencia",
    "Av. Apoquindo 4500, Las Condes",
    "Av. Vicuña Mackenna 3000, Ñuñoa",
    "Plaza de Armas, Santiago",
    "Av. Pajaritos 2000, Maipú",
    "Av. Kennedy 9001, Vitacura",
    "Gran Avenida 5000, San Miguel",
    "Av. La Florida 8500, La Florida",
]
AEROPUERTO = "Aeropuerto Arturo Merino Benítez, Pudahuel"

# Camino de estados desde SOLICITADO hasta cada estado final, con el actor de cada paso.
CAMINO = [
    (E.ASIGNADO, Actor.DESPACHADOR),
    (E.ACEPTADO, Actor.CONDUCTOR),
    (E.EN_CAMINO, Actor.CONDUCTOR),
    (E.EN_ZONA, Actor.SISTEMA),
    (E.PASAJERO_A_BORDO, Actor.CONDUCTOR),
    (E.FINALIZADO, Actor.CONDUCTOR),
]

# (estado final, canal, sentido, horas desde ahora, conductor) — 15 por empresa.
# Los estados en ejecución se reparten entre las dos empresas para no repetir conductor (RN-03).
VIAJES = {
    0: [
        (E.PENDIENTE_CONFIRMACION, Canal.WEB, Sentido.URBANO, 3, None),
        (E.PENDIENTE_CONFIRMACION, Canal.WEB, Sentido.DESDE_AEROPUERTO, 6, None),
        (E.SOLICITADO, Canal.TELEFONO, Sentido.DESDE_AEROPUERTO, 1, None),
        (E.SOLICITADO, Canal.TELEFONO, Sentido.URBANO, 2, None),
        (E.SOLICITADO, Canal.CONVENIO, Sentido.HACIA_AEROPUERTO, 4, None),
        (E.SOLICITADO, Canal.WHATSAPP, Sentido.URBANO, 26, None),
        (E.ASIGNADO, Canal.TELEFONO, Sentido.URBANO, 0.5, 0),
        (E.ACEPTADO, Canal.TELEFONO, Sentido.HACIA_AEROPUERTO, 0.75, 2),
        (E.EN_CAMINO, Canal.CONVENIO, Sentido.URBANO, 0.2, 1),
        (E.FINALIZADO, Canal.TELEFONO, Sentido.URBANO, -2, 0),
        (E.FINALIZADO, Canal.WEB, Sentido.DESDE_AEROPUERTO, -5, 1),
        (E.FINALIZADO, Canal.CONVENIO, Sentido.HACIA_AEROPUERTO, -8, 2),
        (E.FINALIZADO, Canal.WHATSAPP, Sentido.URBANO, -24, 3),
        (E.CANCELADO, Canal.TELEFONO, Sentido.URBANO, 5, None),
        (E.CANCELADO, Canal.WEB, Sentido.URBANO, 7, None),
    ],
    1: [
        (E.PENDIENTE_CONFIRMACION, Canal.WEB, Sentido.URBANO, 2, None),
        (E.PENDIENTE_CONFIRMACION, Canal.WEB, Sentido.HACIA_AEROPUERTO, 9, None),
        (E.SOLICITADO, Canal.TELEFONO, Sentido.DESDE_AEROPUERTO, 1.5, None),
        (E.SOLICITADO, Canal.WHATSAPP, Sentido.URBANO, 3, None),
        (E.SOLICITADO, Canal.CONVENIO, Sentido.URBANO, 5, None),
        (E.SOLICITADO, Canal.TELEFONO, Sentido.HACIA_AEROPUERTO, 28, None),
        (E.EN_ZONA, Canal.TELEFONO, Sentido.DESDE_AEROPUERTO, 0, 1),
        (E.PASAJERO_A_BORDO, Canal.CONVENIO, Sentido.URBANO, -0.3, 0),
        (E.ASIGNADO, Canal.WHATSAPP, Sentido.URBANO, 0.6, 2),
        (E.FINALIZADO, Canal.TELEFONO, Sentido.DESDE_AEROPUERTO, -3, 0),
        (E.FINALIZADO, Canal.WEB, Sentido.URBANO, -6, 2),
        (E.FINALIZADO, Canal.TELEFONO, Sentido.HACIA_AEROPUERTO, -10, 3),
        (E.FINALIZADO, Canal.CONVENIO, Sentido.URBANO, -27, 1),
        (E.CANCELADO, Canal.TELEFONO, Sentido.DESDE_AEROPUERTO, 4, None),
        (E.CANCELADO, Canal.WEB, Sentido.URBANO, 8, None),
    ],
}

TARIFAS = [12000, 18500, 25000, 32000, 9800]


def _convenio(empresa, numero_empresa: int, password: str) -> Convenio:
    cuerpo = str(96000000 + numero_empresa)
    convenio = Convenio.objects.filter(empresa=empresa).first()
    if convenio is None:
        convenio = Convenio(
            empresa=empresa,
            cliente_nombre=f"Minera Demo {numero_empresa + 1} S.A.",
            cliente_rut=f"{cuerpo}-{digito_verificador(cuerpo)}",
        )
        convenio.set_password(password)
        convenio.save()
    return convenio


def cargar(empresa, numero_empresa: int, conductores, faker, password: str) -> int:
    """Crea los viajes de la empresa si todavía no tiene. Devuelve cuántos creó."""
    if Viaje.objects.filter(empresa=empresa).exists():
        return 0
    despachador = empresa.usuarios.get(rol=Rol.DESPACHADOR)
    convenio = _convenio(empresa, numero_empresa, password)
    pasajeros = [
        {"nombre": faker.name(), "telefono": f"+5690001{numero_empresa}{i:03d}"} for i in range(1, 9)
    ]
    ahora = timezone.now().replace(second=0, microsecond=0)

    for n, (final, canal, sentido, horas, i_conductor) in enumerate(VIAJES[numero_empresa]):
        recogida = ahora + timedelta(hours=horas)
        origen = AEROPUERTO if sentido == Sentido.DESDE_AEROPUERTO else DIRECCIONES[n % len(DIRECCIONES)]
        destino = (
            AEROPUERTO if sentido == Sentido.HACIA_AEROPUERTO else DIRECCIONES[(n + 3) % len(DIRECCIONES)]
        )
        vuelo = None
        if sentido == Sentido.DESDE_AEROPUERTO:
            vuelo = {"numero": f"LA{300 + n}", "hora_programada": recogida - timedelta(minutes=20)}
        datos = {
            "pasajero": pasajeros[n % len(pasajeros)],
            "convenio": convenio if canal == Canal.CONVENIO else None,
            "sentido": sentido,
            "origen_dir": origen,
            "destino_dir": destino,
            "recogida_en": recogida,
            "tarifa": TARIFAS[n % len(TARIFAS)],
            "vuelo": vuelo,
        }
        desde_portal = canal == Canal.WEB
        viaje = servicios.crear_viaje(
            empresa=empresa,
            datos=datos,
            canal=canal,
            estado_inicial=E.PENDIENTE_CONFIRMACION if desde_portal else E.SOLICITADO,
            actor=Actor.PASAJERO if desde_portal else Actor.DESPACHADOR,
            usuario=None if desde_portal else despachador,
            validar_futuro=False,
        )
        if final == E.PENDIENTE_CONFIRMACION:
            continue
        if final == E.CANCELADO and desde_portal:
            estados.transicionar(
                viaje,
                E.CANCELADO,
                actor=Actor.SISTEMA,
                motivo_cancelacion="Sin confirmación por WhatsApp dentro del plazo (RN-06).",
                origen_cancelacion=OrigenCancelacion.SISTEMA,
            )
            continue
        if desde_portal:
            estados.transicionar(viaje, E.SOLICITADO, actor=Actor.PASAJERO)
        if final == E.CANCELADO:
            servicios.cancelar_viaje(viaje, motivo="El pasajero desistió por teléfono.", usuario=despachador)
            continue
        if final == E.SOLICITADO:
            continue
        conductor = conductores[i_conductor]
        for estado, actor in CAMINO:
            usuario = (
                despachador
                if actor == Actor.DESPACHADOR
                else conductor.usuario
                if actor == Actor.CONDUCTOR
                else None
            )
            extra = (
                {
                    "conductor": conductor,
                    "vehiculo": conductor.vehiculo_activo or conductor.asociaciones.first().vehiculo,
                }
                if estado == E.ASIGNADO
                else {}
            )
            estados.transicionar(viaje, estado, actor=actor, usuario=usuario, **extra)
            if estado == final:
                break
    return len(VIAJES[numero_empresa])
