"""API de reservas (HU-03): CP-05 (ingresar y editar) y CP-06 (cancelar con motivo)."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.aeropuerto.models import Vuelo
from apps.auditoria.models import Auditoria
from apps.cuentas.models import Rol
from apps.cuentas.tests.fabricas import UsuarioFactory
from apps.integraciones.geocodificador import AEROPUERTO_SCL, Coordenadas
from apps.reservas.models import Actor, EstadoViaje, HistorialEstado, Pasajero, Viaje

from .fabricas import ConvenioFactory, PasajeroFactory, ViajeFactory

E = EstadoViaje
LISTA = reverse("viaje-list")


def detalle(viaje):
    return reverse("viaje-detail", args=[viaje.pk])


def cancelar(viaje):
    return reverse("viaje-cancelar", args=[viaje.pk])


def en_horas(horas: float) -> str:
    return (timezone.now() + timedelta(hours=horas)).isoformat()


class EnConcepcion:
    """Geocodificador falso que ubica todo fuera de la RM."""

    def geocodificar(self, direccion, zona):
        return Coordenadas(-36.8270, -73.0503)


def reserva(**cambios):
    datos = {
        "pasajero": {"nombre": "Ana Pérez", "telefono": "+56 9 0000 9001"},
        "origen_dir": "Av. Providencia 1234, Providencia",
        "destino_dir": "Plaza de Armas, Santiago",
        "recogida_en": en_horas(3),
        "tarifa": 15000,
    }
    datos.update(cambios)
    return datos


@pytest.fixture
def api(cliente, despachador):
    cliente.force_authenticate(despachador)
    return cliente


@pytest.mark.django_db
class TestPermisos:
    def test_sin_autenticar(self, cliente):
        assert cliente.get(LISTA).status_code == 401

    def test_conductor_no_accede(self, cliente, conductor):
        cliente.force_authenticate(conductor)
        assert cliente.get(LISTA).status_code == 403

    def test_administrador_accede(self, cliente, administrador):
        cliente.force_authenticate(administrador)
        assert cliente.get(LISTA).status_code == 200

    def test_no_hay_borrado_ni_put(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa)
        assert api.delete(detalle(viaje)).status_code == 405
        assert api.put(detalle(viaje), {}, format="json").status_code == 405


@pytest.mark.django_db
class TestAislamientoPorEmpresa:
    """RN-13."""

    def test_listado_solo_de_su_empresa(self, api, despachador, otra_empresa):
        propio = ViajeFactory(empresa=despachador.empresa)
        ViajeFactory(empresa=otra_empresa)
        ids = [v["id"] for v in api.get(LISTA).data["results"]]
        assert ids == [propio.id]

    @pytest.mark.parametrize("operacion", ["ver", "editar", "cancelar"])
    def test_viaje_de_otra_empresa_responde_404(self, api, otra_empresa, operacion):
        ajeno = ViajeFactory(empresa=otra_empresa)
        respuesta = {
            "ver": lambda: api.get(detalle(ajeno)),
            "editar": lambda: api.patch(detalle(ajeno), {"tarifa": 1}, format="json"),
            "cancelar": lambda: api.post(cancelar(ajeno), {"motivo": "x"}, format="json"),
        }[operacion]()
        assert respuesta.status_code == 404
        ajeno.refresh_from_db()
        assert (ajeno.estado, ajeno.tarifa) == (E.SOLICITADO, None)

    def test_convenio_de_otra_empresa_no_es_valido(self, api, otra_empresa):
        convenio = ConvenioFactory(empresa=otra_empresa)
        respuesta = api.post(LISTA, reserva(canal="CONVENIO", convenio=convenio.pk), format="json")
        assert respuesta.status_code == 400
        assert "convenio" in respuesta.data


@pytest.mark.django_db
class TestListado:
    def test_filtra_por_estados(self, api, despachador):
        empresa = despachador.empresa
        a = ViajeFactory(empresa=empresa, estado=E.SOLICITADO)
        b = ViajeFactory(empresa=empresa, estado=E.ASIGNADO)
        ViajeFactory(empresa=empresa, estado=E.FINALIZADO)
        ids = {v["id"] for v in api.get(LISTA, {"estado": ["SOLICITADO", "ASIGNADO"]}).data["results"]}
        assert ids == {a.id, b.id}

    def test_filtra_por_fecha_local(self, api, despachador):
        empresa = despachador.empresa
        manana = timezone.localtime() + timedelta(days=1)
        viaje = ViajeFactory(empresa=empresa, recogida_en=manana)
        ViajeFactory(empresa=empresa, recogida_en=manana + timedelta(days=2))
        ids = [v["id"] for v in api.get(LISTA, {"fecha": manana.date().isoformat()}).data["results"]]
        assert ids == [viaje.id]

    def test_filtra_por_sentido_y_canal(self, api, despachador):
        empresa = despachador.empresa
        viaje = ViajeFactory(empresa=empresa, sentido="HACIA_AEROPUERTO", canal="WHATSAPP")
        ViajeFactory(empresa=empresa, sentido="HACIA_AEROPUERTO", canal="TELEFONO")
        ViajeFactory(empresa=empresa, sentido="URBANO", canal="WHATSAPP")
        ids = [
            v["id"]
            for v in api.get(LISTA, {"sentido": "HACIA_AEROPUERTO", "canal": "WHATSAPP"}).data["results"]
        ]
        assert ids == [viaje.id]

    def test_busqueda_por_pasajero_telefono_y_direccion(self, api, despachador):
        empresa = despachador.empresa
        pasajero = PasajeroFactory(empresa=empresa, nombre="Rosa Contreras", telefono="+56900004321")
        viaje = ViajeFactory(empresa=empresa, pasajero=pasajero, destino_dir="Av. Kennedy 9001, Vitacura")
        ViajeFactory(empresa=empresa)
        for q in ["contreras", "4321", "kennedy"]:
            assert [v["id"] for v in api.get(LISTA, {"q": q}).data["results"]] == [viaje.id], q

    def test_rango_y_orden_por_recogida(self, api, despachador):
        empresa = despachador.empresa
        tarde = ViajeFactory(empresa=empresa, recogida_en=timezone.now() + timedelta(hours=5))
        temprano = ViajeFactory(empresa=empresa, recogida_en=timezone.now() + timedelta(hours=1))
        ViajeFactory(empresa=empresa, recogida_en=timezone.now() + timedelta(days=3))
        datos = api.get(LISTA, {"desde": en_horas(0), "hasta": en_horas(6)}).data["results"]
        assert [v["id"] for v in datos] == [temprano.id, tarde.id]
        datos = api.get(LISTA, {"desde": en_horas(0), "hasta": en_horas(6), "ordenar": "-recogida_en"}).data[
            "results"
        ]
        assert [v["id"] for v in datos] == [tarde.id, temprano.id]

    def test_formato_del_listado(self, api, despachador):
        ViajeFactory(empresa=despachador.empresa)
        viaje = api.get(LISTA).data["results"][0]
        assert viaje["origen"] == {
            "direccion": "Av. Providencia 1234, Providencia",
            "lat": -33.4489,
            "lon": -70.6693,
        }
        assert viaje["editable"] is True and viaje["cancelable"] is True
        assert viaje["conductor"] is None and viaje["vuelo"] is None


@pytest.mark.django_db
class TestIngresar:
    """CP-05."""

    def test_crea_en_solicitado_con_historial(self, api, despachador):
        respuesta = api.post(LISTA, reserva(), format="json")
        assert respuesta.status_code == 201, respuesta.data
        viaje = Viaje.objects.get(pk=respuesta.data["id"])
        assert viaje.estado == E.SOLICITADO
        assert viaje.canal == "TELEFONO" and viaje.sentido == "URBANO"
        assert viaje.empresa == despachador.empresa
        historial = respuesta.data["historial"]
        assert len(historial) == 1
        assert historial[0]["estado_anterior"] is None
        assert historial[0]["estado_nuevo"] == "SOLICITADO"
        assert historial[0]["actor"] == "DESPACHADOR"

    def test_administrador_queda_como_actor(self, cliente, administrador):
        cliente.force_authenticate(administrador)
        respuesta = cliente.post(LISTA, reserva(), format="json")
        assert respuesta.data["historial"][0]["actor"] == "ADMINISTRADOR"

    def test_geocodifica_origen_y_destino(self, api):
        datos = api.post(
            LISTA, reserva(destino_dir="Aeropuerto SCL", sentido="HACIA_AEROPUERTO"), format="json"
        ).data
        assert datos["destino"]["lat"] == AEROPUERTO_SCL[0] and datos["destino"]["lon"] == AEROPUERTO_SCL[1]
        otro = api.post(LISTA, reserva(), format="json").data
        assert datos["origen"] == otro["origen"]  # determinístico

    def test_reutiliza_el_pasajero_por_telefono(self, api, despachador):
        api.post(LISTA, reserva(), format="json")
        api.post(LISTA, reserva(pasajero={"nombre": "Ana P.", "telefono": "+56900009001"}), format="json")
        assert Pasajero.objects.filter(empresa=despachador.empresa).count() == 1

    def test_mismo_telefono_en_otra_empresa_es_otro_pasajero(self, api, otra_empresa):
        PasajeroFactory(empresa=otra_empresa, telefono="+56900009001")
        api.post(LISTA, reserva(), format="json")
        assert Pasajero.objects.filter(telefono="+56900009001").count() == 2

    def test_desde_el_aeropuerto_con_vuelo(self, api):
        llegada = timezone.now() + timedelta(hours=4)
        datos = reserva(
            sentido="DESDE_AEROPUERTO",
            origen_dir="Aeropuerto Arturo Merino Benítez",
            vuelo={"numero": "la 123", "hora_programada": llegada.isoformat()},
        )
        respuesta = api.post(LISTA, datos, format="json")
        assert respuesta.status_code == 201, respuesta.data
        vuelo = Vuelo.objects.get(viaje_id=respuesta.data["id"])
        assert vuelo.numero == "LA 123"
        assert vuelo.fecha == timezone.localdate(llegada)
        assert respuesta.data["vuelo"]["estado_vuelo"] == "PROGRAMADO"

    def test_vuelo_solo_desde_el_aeropuerto(self, api):
        datos = reserva(sentido="HACIA_AEROPUERTO", vuelo={"numero": "LA123", "hora_programada": en_horas(5)})
        respuesta = api.post(LISTA, datos, format="json")
        assert respuesta.status_code == 400
        assert "vuelo" in respuesta.data

    @pytest.mark.parametrize("numero", ["LAN1234X", "LA", "LA12345", "LA-123"])
    def test_numero_de_vuelo_invalido(self, api, numero):
        datos = reserva(sentido="DESDE_AEROPUERTO", vuelo={"numero": numero, "hora_programada": en_horas(5)})
        assert api.post(LISTA, datos, format="json").status_code == 400

    def test_convenio_de_la_empresa(self, api, despachador):
        convenio = ConvenioFactory(empresa=despachador.empresa)
        respuesta = api.post(LISTA, reserva(canal="CONVENIO", convenio=convenio.pk), format="json")
        assert respuesta.status_code == 201
        assert respuesta.data["convenio"]["id"] == convenio.pk
        assert respuesta.data["estado"] == "SOLICITADO"

    def test_convenio_inactivo(self, api, despachador):
        convenio = ConvenioFactory(empresa=despachador.empresa, activo=False)
        respuesta = api.post(LISTA, reserva(canal="CONVENIO", convenio=convenio.pk), format="json")
        assert respuesta.status_code == 400

    def test_canal_convenio_exige_convenio_y_viceversa(self, api, despachador):
        convenio = ConvenioFactory(empresa=despachador.empresa)
        assert api.post(LISTA, reserva(canal="CONVENIO"), format="json").status_code == 400
        assert api.post(LISTA, reserva(convenio=convenio.pk), format="json").status_code == 400

    def test_canal_web_no_se_ingresa_desde_el_panel(self, api):
        assert api.post(LISTA, reserva(canal="WEB"), format="json").status_code == 400

    def test_recogida_en_el_pasado(self, api):
        respuesta = api.post(LISTA, reserva(recogida_en=en_horas(-1)), format="json")
        assert respuesta.status_code == 400
        assert "recogida_en" in respuesta.data

    def test_origen_fuera_de_la_zona(self, api, monkeypatch):
        monkeypatch.setattr("apps.reservas.servicios.obtener_geocodificador", lambda: EnConcepcion())
        respuesta = api.post(LISTA, reserva(), format="json")
        assert respuesta.status_code == 400
        assert "origen_dir" in respuesta.data

    @pytest.mark.parametrize(
        "cambio",
        [
            {"pasajero": {"nombre": "Ana", "telefono": "912345678"}},
            {"pasajero": {"nombre": "  ", "telefono": "+56912345678"}},
            {"origen_dir": "   "},
            {"tarifa": -1},
            {"sentido": "LUNAR"},
        ],
        ids=["telefono-sin-e164", "nombre-vacio", "origen-vacio", "tarifa-negativa", "sentido-invalido"],
    )
    def test_validaciones(self, api, cambio):
        assert api.post(LISTA, reserva(**cambio), format="json").status_code == 400

    def test_geocodificacion_fallida(self, api, monkeypatch):
        from apps.integraciones import geocodificador

        class Falla:
            def geocodificar(self, direccion, zona):
                raise geocodificador.GeocodificacionError("No se encontró la dirección.")

        monkeypatch.setattr("apps.reservas.servicios.obtener_geocodificador", lambda: Falla())
        respuesta = api.post(LISTA, reserva(), format="json")
        assert respuesta.status_code == 400
        assert respuesta.data["origen_dir"] == ["No se encontró la dirección."]


@pytest.mark.django_db
class TestEditar:
    """CP-05: edición antes del despacho."""

    def test_edita_en_solicitado(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa)
        nueva = en_horas(6)
        respuesta = api.patch(detalle(viaje), {"tarifa": 20000, "recogida_en": nueva}, format="json")
        assert respuesta.status_code == 200
        viaje.refresh_from_db()
        assert viaje.tarifa == 20000

    def test_regeocodifica_al_cambiar_la_direccion(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa)
        respuesta = api.patch(detalle(viaje), {"destino_dir": "Aeropuerto SCL"}, format="json")
        assert (respuesta.data["destino"]["lat"], respuesta.data["destino"]["lon"]) == AEROPUERTO_SCL

    @pytest.mark.parametrize("estado", [E.ASIGNADO, E.ACEPTADO, E.EN_CAMINO, E.FINALIZADO, E.CANCELADO])
    def test_no_edita_despues_del_despacho(self, api, despachador, estado):
        viaje = ViajeFactory(empresa=despachador.empresa, estado=estado, motivo_cancelacion="x")
        respuesta = api.patch(detalle(viaje), {"tarifa": 1}, format="json")
        assert respuesta.status_code == 409
        viaje.refresh_from_db()
        assert viaje.tarifa is None

    def test_agrega_y_quita_el_vuelo(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa)
        api.patch(
            detalle(viaje),
            {"sentido": "DESDE_AEROPUERTO", "vuelo": {"numero": "H2 456", "hora_programada": en_horas(2)}},
            format="json",
        )
        assert Vuelo.objects.get(viaje=viaje).numero == "H2 456"
        api.patch(detalle(viaje), {"sentido": "URBANO"}, format="json")
        assert not Vuelo.objects.filter(viaje=viaje).exists()

    def test_editar_otro_campo_conserva_el_vuelo(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa, sentido="DESDE_AEROPUERTO")
        Vuelo.objects.create(
            viaje=viaje,
            numero="LA123",
            fecha=timezone.localdate(),
            hora_programada=timezone.now(),
            estado_vuelo="DEMORADO",
        )
        api.patch(detalle(viaje), {"tarifa": 9000}, format="json")
        assert Vuelo.objects.get(viaje=viaje).estado_vuelo == "DEMORADO"

    def test_vuelo_en_viaje_urbano(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa)
        respuesta = api.patch(
            detalle(viaje), {"vuelo": {"numero": "LA123", "hora_programada": en_horas(2)}}, format="json"
        )
        assert respuesta.status_code == 400

    def test_recogida_pasada(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa)
        assert api.patch(detalle(viaje), {"recogida_en": en_horas(-2)}, format="json").status_code == 400

    def test_direccion_vacia(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa)
        assert api.patch(detalle(viaje), {"origen_dir": " "}, format="json").status_code == 400

    def test_origen_editado_fuera_de_zona(self, api, despachador, monkeypatch):
        viaje = ViajeFactory(empresa=despachador.empresa)
        monkeypatch.setattr("apps.reservas.servicios.obtener_geocodificador", lambda: EnConcepcion())
        respuesta = api.patch(detalle(viaje), {"origen_dir": "Otra calle 1"}, format="json")
        assert respuesta.status_code == 400
        assert "origen_dir" in respuesta.data


@pytest.mark.django_db
class TestCancelar:
    """CP-06: cancelación con motivo."""

    @pytest.mark.parametrize(
        "estado", [E.PENDIENTE_CONFIRMACION, E.SOLICITADO, E.ACEPTADO, E.EN_CAMINO, E.EN_ZONA]
    )
    def test_cancela_con_motivo_historial_y_auditoria(self, api, despachador, estado):
        viaje = ViajeFactory(empresa=despachador.empresa, estado=estado)
        respuesta = api.post(cancelar(viaje), {"motivo": " El pasajero desistió "}, format="json")
        assert respuesta.status_code == 200, respuesta.data
        viaje.refresh_from_db()
        assert viaje.estado == E.CANCELADO
        assert viaje.motivo_cancelacion == "El pasajero desistió"
        assert viaje.origen_cancelacion == "DESPACHADOR"
        registro = HistorialEstado.objects.get(viaje=viaje)
        assert (registro.estado_anterior, registro.actor, registro.usuario) == (
            estado,
            Actor.DESPACHADOR,
            despachador,
        )
        auditoria = Auditoria.objects.get(entidad="VIAJE", entidad_id=viaje.pk)
        assert (auditoria.accion, auditoria.usuario, auditoria.motivo) == (
            "CANCELACION",
            despachador,
            "El pasajero desistió",
        )
        assert auditoria.datos_previos == {"estado": estado}
        assert auditoria.empresa == despachador.empresa

    def test_motivo_obligatorio(self, api, despachador):
        viaje = ViajeFactory(empresa=despachador.empresa)
        for cuerpo in [{}, {"motivo": "   "}]:
            assert api.post(cancelar(viaje), cuerpo, format="json").status_code == 400
        viaje.refresh_from_db()
        assert viaje.estado == E.SOLICITADO

    @pytest.mark.parametrize("estado", [E.ASIGNADO, E.PASAJERO_A_BORDO, E.FINALIZADO, E.CANCELADO])
    def test_estados_no_cancelables(self, api, despachador, estado):
        viaje = ViajeFactory(empresa=despachador.empresa, estado=estado, motivo_cancelacion="x")
        assert api.post(cancelar(viaje), {"motivo": "x"}, format="json").status_code == 409
        assert not Auditoria.objects.exists()

    def test_administrador_queda_como_origen_y_actor(self, cliente, administrador):
        """DC-03 y DC-08."""
        cliente.force_authenticate(administrador)
        viaje = ViajeFactory(empresa=administrador.empresa)
        respuesta = cliente.post(cancelar(viaje), {"motivo": "Duplicada"}, format="json")
        assert respuesta.data["historial"][-1]["actor"] == "ADMINISTRADOR"
        assert respuesta.data["origen_cancelacion"] == "ADMINISTRADOR"
        assert Auditoria.objects.get(entidad_id=viaje.pk).usuario == administrador


@pytest.mark.django_db
def test_detalle_incluye_historial_y_nombre_del_usuario(api, despachador):
    viaje = api.post(LISTA, reserva(), format="json").data
    datos = api.get(reverse("viaje-detail", args=[viaje["id"]])).data
    assert datos["historial"][0]["usuario"] == despachador.nombre


@pytest.mark.django_db
def test_otro_despachador_de_la_misma_empresa_ve_la_reserva(api, despachador, cliente):
    viaje = ViajeFactory(empresa=despachador.empresa)
    colega = UsuarioFactory(empresa=despachador.empresa, rol=Rol.DESPACHADOR)
    cliente.force_authenticate(colega)
    assert cliente.get(detalle(viaje)).status_code == 200
