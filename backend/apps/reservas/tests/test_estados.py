import pytest

from apps.reservas import estados
from apps.reservas.models import Actor, EstadoViaje, HistorialEstado

from .fabricas import ViajeFactory

E = EstadoViaje

PERMITIDAS = [(a, b) for a, destinos in estados.TRANSICIONES.items() for b in destinos]
PROHIBIDAS = [
    (a, b)
    for a in E.values
    for b in E.values
    if b not in estados.TRANSICIONES[a] and (a, b) not in estados.SOLO_FORZADA
]


class TestTabla:
    def test_coincide_con_claude_md(self):
        """Estados y transiciones definidos en CLAUDE.md (Anexo F)."""
        assert estados.TRANSICIONES[E.PENDIENTE_CONFIRMACION] == {E.SOLICITADO, E.CANCELADO}
        assert estados.TRANSICIONES[E.SOLICITADO] == {E.ASIGNADO, E.CANCELADO}
        assert estados.TRANSICIONES[E.ASIGNADO] == {E.ACEPTADO, E.SOLICITADO}
        assert estados.TRANSICIONES[E.ACEPTADO] == {E.EN_CAMINO, E.CANCELADO}
        assert estados.TRANSICIONES[E.EN_CAMINO] == {E.EN_ZONA, E.CANCELADO}
        assert estados.TRANSICIONES[E.EN_ZONA] == {E.PASAJERO_A_BORDO, E.CANCELADO}
        assert estados.TRANSICIONES[E.PASAJERO_A_BORDO] == {E.FINALIZADO}
        assert estados.TRANSICIONES[E.FINALIZADO] == set()
        assert estados.TRANSICIONES[E.CANCELADO] == set()

    def test_cancelables(self):
        cancelables = estados.CANCELABLES
        assert cancelables == {
            E.PENDIENTE_CONFIRMACION,
            E.SOLICITADO,
            E.ACEPTADO,
            E.EN_CAMINO,
            E.EN_ZONA,
        }

    def test_editables_antes_del_despacho(self):
        editables = estados.EDITABLES
        assert editables == {E.PENDIENTE_CONFIRMACION, E.SOLICITADO}

    def test_anulacion_desde_a_bordo_solo_forzada(self):
        assert not estados.es_valida(E.PASAJERO_A_BORDO, E.CANCELADO)
        assert estados.es_valida(E.PASAJERO_A_BORDO, E.CANCELADO, forzada=True)

    def test_forzada_no_habilita_otras_transiciones(self):
        assert not estados.es_valida(E.FINALIZADO, E.CANCELADO, forzada=True)


@pytest.mark.django_db
class TestTransicionar:
    @pytest.mark.parametrize(("actual", "nuevo"), PERMITIDAS, ids=[f"{a}->{b}" for a, b in PERMITIDAS])
    def test_permitidas_registran_historial(self, actual, nuevo, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa, estado=actual, motivo_cancelacion="x")
        estados.transicionar(viaje, nuevo, actor=Actor.DESPACHADOR, usuario=despachador)
        assert viaje.estado == nuevo
        registro = HistorialEstado.objects.get(viaje=viaje)
        assert (registro.estado_anterior, registro.estado_nuevo) == (actual, nuevo)
        assert (registro.actor, registro.usuario) == (Actor.DESPACHADOR, despachador)

    @pytest.mark.parametrize(("actual", "nuevo"), PROHIBIDAS, ids=[f"{a}->{b}" for a, b in PROHIBIDAS])
    def test_prohibidas_no_cambian_nada(self, actual, nuevo, empresa):
        viaje = ViajeFactory(empresa=empresa, estado=actual, motivo_cancelacion="x")
        with pytest.raises(estados.TransicionInvalida):
            estados.transicionar(viaje, nuevo, actor=Actor.SISTEMA)
        viaje.refresh_from_db()
        assert viaje.estado == actual
        assert not HistorialEstado.objects.filter(viaje=viaje).exists()

    def test_guarda_campos_adicionales(self, empresa):
        viaje = ViajeFactory(empresa=empresa, estado=E.SOLICITADO)
        estados.transicionar(
            viaje, E.CANCELADO, actor=Actor.SISTEMA, motivo_cancelacion="Prueba", origen_cancelacion="SISTEMA"
        )
        assert (viaje.motivo_cancelacion, viaje.origen_cancelacion) == ("Prueba", "SISTEMA")

    def test_usa_el_estado_de_la_base_y_no_el_del_objeto(self, empresa):
        viaje = ViajeFactory(empresa=empresa, estado=E.SOLICITADO)
        viaje.estado = E.EN_ZONA  # objeto desactualizado
        with pytest.raises(estados.TransicionInvalida):
            estados.transicionar(viaje, E.PASAJERO_A_BORDO, actor=Actor.CONDUCTOR)

    def test_desde_exige_el_estado_actual(self, empresa):
        viaje = ViajeFactory(empresa=empresa, estado=E.SOLICITADO)
        with pytest.raises(estados.TransicionInvalida):
            estados.transicionar(
                viaje,
                E.CANCELADO,
                desde=E.PENDIENTE_CONFIRMACION,
                actor=Actor.SISTEMA,
                motivo_cancelacion="x",
            )
        viaje.refresh_from_db()
        assert viaje.estado == E.SOLICITADO
        estados.transicionar(
            viaje, E.CANCELADO, desde=E.SOLICITADO, actor=Actor.SISTEMA, motivo_cancelacion="x"
        )
        assert viaje.estado == E.CANCELADO

    def test_actor_segun_rol(self, administrador, despachador, conductor):
        assert estados.actor_de(administrador) == Actor.ADMINISTRADOR
        assert estados.actor_de(despachador) == Actor.DESPACHADOR
        assert estados.actor_de(conductor) == Actor.CONDUCTOR
