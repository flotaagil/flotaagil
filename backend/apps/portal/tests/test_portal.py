"""Portal público (HU-19): CP-07 (solicitud desde el formulario)."""

from datetime import datetime, timedelta

import pytest
from django.conf import settings
from django.urls import reverse
from django.utils import timezone

from apps.aeropuerto.models import Vuelo
from apps.reservas.models import Actor, EstadoViaje, HistorialEstado, Pasajero, Viaje
from apps.reservas.tests.fabricas import PasajeroFactory, ViajeFactory


def url(empresa):
    return reverse("portal-solicitudes", args=[empresa.slug])


def en_horas(horas: float) -> str:
    return (timezone.now() + timedelta(hours=horas)).isoformat()


def solicitud(**cambios):
    datos = {
        "nombre": "Ana Pérez",
        "telefono": "+56 9 0000 9101",
        "origen_dir": "Av. Providencia 1234, Providencia",
        "destino_dir": "Plaza de Armas, Santiago",
        "recogida_en": en_horas(2),
        "acepta_privacidad": True,
        "acepta_whatsapp": True,
    }
    datos.update(cambios)
    return {k: v for k, v in datos.items() if v is not None}


@pytest.mark.django_db
class TestEmpresaPublica:
    def test_datos_publicos(self, cliente, empresa):
        respuesta = cliente.get(reverse("portal-empresa", args=[empresa.slug]))
        assert respuesta.status_code == 200
        assert respuesta.data == {
            "razon_social": empresa.razon_social,
            "slug": empresa.slug,
            "anticipacion_minima_min": 30,
            "expiracion_verificacion_min": 15,
            "margen_nacional_min": 20,
        }

    def test_margen_configurable(self, cliente, empresa):
        empresa.configuracion.margen_nacional_min = 45
        empresa.configuracion.save()
        respuesta = cliente.get(reverse("portal-empresa", args=[empresa.slug]))
        assert respuesta.data["margen_nacional_min"] == 45

    def test_empresa_inexistente_o_inactiva(self, cliente, empresa):
        assert cliente.get(reverse("portal-empresa", args=["no-existe"])).status_code == 404
        empresa.activa = False
        empresa.save()
        assert cliente.get(reverse("portal-empresa", args=[empresa.slug])).status_code == 404
        assert cliente.post(url(empresa), solicitud(), format="json").status_code == 404


@pytest.mark.django_db
class TestSolicitud:
    def test_crea_pendiente_sin_autenticacion(self, cliente, empresa):
        respuesta = cliente.post(url(empresa), solicitud(), format="json")
        assert respuesta.status_code == 201, respuesta.data
        assert respuesta.data["estado"] == "PENDIENTE_CONFIRMACION"
        assert "id" not in respuesta.data
        viaje = Viaje.objects.get()
        assert (viaje.empresa, viaje.canal, viaje.sentido) == (empresa, "WEB", "URBANO")
        assert viaje.pasajero.telefono == "+56900009101"
        registro = HistorialEstado.objects.get(viaje=viaje)
        assert (registro.estado_anterior, registro.actor, registro.usuario) == (None, Actor.PASAJERO, None)

    def test_expira_segun_la_configuracion(self, cliente, empresa):
        config = empresa.configuracion
        config.expiracion_verificacion_min = 5
        config.save()
        respuesta = cliente.post(url(empresa), solicitud(), format="json")
        viaje = Viaje.objects.get()
        expira_en = datetime.fromisoformat(respuesta.json()["expira_en"])
        assert expira_en == viaje.creado_en + timedelta(minutes=5)

    def test_registra_las_aceptaciones(self, cliente, empresa):
        cliente.post(url(empresa), solicitud(), format="json")
        pasajero = Pasajero.objects.get()
        assert pasajero.opt_in_en is not None
        assert pasajero.privacidad_aceptada_en is not None

    @pytest.mark.parametrize("campo", ["acepta_privacidad", "acepta_whatsapp"])
    def test_aceptaciones_obligatorias(self, cliente, empresa, campo):
        for valor in (False, None):
            respuesta = cliente.post(url(empresa), solicitud(**{campo: valor}), format="json")
            assert respuesta.status_code == 400
            assert campo in respuesta.data
        assert not Viaje.objects.exists()

    def test_pasajero_existente_conserva_su_nombre(self, cliente, empresa):
        PasajeroFactory(empresa=empresa, nombre="Ana María Pérez", telefono="+56900009101")
        respuesta = cliente.post(url(empresa), solicitud(nombre="Otro Nombre"), format="json")
        assert respuesta.status_code == 201
        assert Pasajero.objects.get().nombre == "Ana María Pérez"

    @pytest.mark.parametrize("telefono", ["+1 202 555 0143", "+54 9 11 5555 1234", "+44 7700 900123"])
    def test_acepta_telefonos_extranjeros(self, cliente, empresa, telefono):
        assert cliente.post(url(empresa), solicitud(telefono=telefono), format="json").status_code == 201

    @pytest.mark.parametrize("telefono", ["912345678", "+0123456789", "abc", "+56 9"])
    def test_telefono_invalido(self, cliente, empresa, telefono):
        respuesta = cliente.post(url(empresa), solicitud(telefono=telefono), format="json")
        assert respuesta.status_code == 400
        assert "telefono" in respuesta.data

    @pytest.mark.parametrize("campo", ["nombre", "origen_dir", "destino_dir"])
    def test_campos_vacios(self, cliente, empresa, campo):
        assert cliente.post(url(empresa), solicitud(**{campo: "   "}), format="json").status_code == 400

    def test_recogida_obligatoria_sin_vuelo(self, cliente, empresa):
        respuesta = cliente.post(url(empresa), solicitud(recogida_en=None), format="json")
        assert respuesta.status_code == 400
        assert "recogida_en" in respuesta.data


@pytest.mark.django_db
class TestAnticipacion:
    """DC-10."""

    def test_menos_de_30_minutos(self, cliente, empresa):
        respuesta = cliente.post(url(empresa), solicitud(recogida_en=en_horas(0.25)), format="json")
        assert respuesta.status_code == 400
        assert "30 minutos" in str(respuesta.data["recogida_en"][0])

    def test_configurable_por_empresa(self, cliente, empresa):
        config = empresa.configuracion
        config.anticipacion_minima_min = 10
        config.save()
        assert (
            cliente.post(url(empresa), solicitud(recogida_en=en_horas(0.25)), format="json").status_code
            == 201
        )

    def test_pasado(self, cliente, empresa):
        assert (
            cliente.post(url(empresa), solicitud(recogida_en=en_horas(-1)), format="json").status_code == 400
        )


@pytest.mark.django_db
class TestAeropuerto:
    def test_vuelo_deduce_desde_el_aeropuerto(self, cliente, empresa):
        llegada = timezone.now() + timedelta(hours=3)
        datos = solicitud(
            origen_dir="Aeropuerto Arturo Merino Benítez",
            vuelo={"numero": "la 123", "hora_llegada": llegada.isoformat()},
        )
        assert cliente.post(url(empresa), datos, format="json").status_code == 201
        viaje = Viaje.objects.get()
        assert viaje.sentido == "DESDE_AEROPUERTO"
        vuelo = Vuelo.objects.get(viaje=viaje)
        assert (vuelo.numero, vuelo.hora_programada) == ("LA 123", llegada)

    def test_sin_recogida_se_calcula_con_el_margen_nacional(self, cliente, empresa):
        """RN-17 y DC-12: llegada + margen nacional (20 min por defecto)."""
        llegada = timezone.now() + timedelta(hours=3)
        datos = solicitud(recogida_en=None, vuelo={"numero": "LA123", "hora_llegada": llegada.isoformat()})
        assert cliente.post(url(empresa), datos, format="json").status_code == 201
        assert Viaje.objects.get().recogida_en == llegada + timedelta(minutes=20)

    def test_recogida_null_equivale_a_no_informada(self, cliente, empresa):
        llegada = timezone.now() + timedelta(hours=3)
        datos = solicitud(vuelo={"numero": "LA123", "hora_llegada": llegada.isoformat()})
        datos["recogida_en"] = None
        assert cliente.post(url(empresa), datos, format="json").status_code == 201
        assert Viaje.objects.get().recogida_en == llegada + timedelta(minutes=20)

    def test_recogida_null_sin_vuelo(self, cliente, empresa):
        datos = solicitud()
        datos["recogida_en"] = None
        respuesta = cliente.post(url(empresa), datos, format="json")
        assert respuesta.status_code == 400
        assert "recogida_en" in respuesta.data

    def test_margen_configurable(self, cliente, empresa):
        config = empresa.configuracion
        config.margen_nacional_min = 45
        config.save()
        llegada = timezone.now() + timedelta(hours=3)
        datos = solicitud(recogida_en=None, vuelo={"numero": "LA123", "hora_llegada": llegada.isoformat()})
        cliente.post(url(empresa), datos, format="json")
        assert Viaje.objects.get().recogida_en == llegada + timedelta(minutes=45)

    def test_si_viene_la_recogida_se_respeta(self, cliente, empresa):
        llegada = timezone.now() + timedelta(hours=3)
        recogida = llegada + timedelta(minutes=50)
        datos = solicitud(
            recogida_en=recogida.isoformat(), vuelo={"numero": "LA123", "hora_llegada": llegada.isoformat()}
        )
        cliente.post(url(empresa), datos, format="json")
        assert Viaje.objects.get().recogida_en == recogida

    def test_pasajero_corrige_el_sentido(self, cliente, empresa):
        datos = solicitud(sentido="HACIA_AEROPUERTO", destino_dir="Aeropuerto SCL")
        assert cliente.post(url(empresa), datos, format="json").status_code == 201
        assert Viaje.objects.get().sentido == "HACIA_AEROPUERTO"
        assert not Vuelo.objects.exists()

    def test_vuelo_hacia_el_aeropuerto_no_se_acepta(self, cliente, empresa):
        datos = solicitud(sentido="HACIA_AEROPUERTO", vuelo={"numero": "LA123", "hora_llegada": en_horas(3)})
        respuesta = cliente.post(url(empresa), datos, format="json")
        assert respuesta.status_code == 400
        assert "vuelo" in respuesta.data

    def test_numero_de_vuelo_invalido(self, cliente, empresa):
        datos = solicitud(vuelo={"numero": "LA-123", "hora_llegada": en_horas(3)})
        assert cliente.post(url(empresa), datos, format="json").status_code == 400


@pytest.mark.django_db
class TestProteccion:
    def test_limite_por_telefono(self, cliente, empresa):
        pasajero = PasajeroFactory(empresa=empresa, telefono="+56900009101")
        for _ in range(3):
            ViajeFactory(
                empresa=empresa, canal="WEB", estado=EstadoViaje.PENDIENTE_CONFIRMACION, pasajero=pasajero
            )
        respuesta = cliente.post(url(empresa), solicitud(), format="json")
        assert respuesta.status_code == 429
        assert respuesta.data["code"] == "limite_telefono"
        assert respuesta.data["detail"].startswith("Ya enviaste varias solicitudes con este número.")
        assert Viaje.objects.count() == 3

    def test_el_limite_por_telefono_es_por_empresa(self, cliente, empresa, otra_empresa):
        pasajero = PasajeroFactory(empresa=otra_empresa, telefono="+56900009101")
        for _ in range(3):
            ViajeFactory(empresa=otra_empresa, canal="WEB", pasajero=pasajero)
        assert cliente.post(url(empresa), solicitud(), format="json").status_code == 201

    def test_solicitudes_antiguas_no_cuentan(self, cliente, empresa):
        pasajero = PasajeroFactory(empresa=empresa, telefono="+56900009101")
        for _ in range(3):
            ViajeFactory(empresa=empresa, canal="WEB", pasajero=pasajero)
        Viaje.objects.update(creado_en=timezone.now() - timedelta(minutes=16))
        assert cliente.post(url(empresa), solicitud(), format="json").status_code == 201

    def test_limite_por_ip_por_minuto(self, cliente, empresa):
        # El máximo sale de la configuración (20/min por defecto; THROTTLE_PORTAL_MINUTO lo cambia).
        maximo = int(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["portal_minuto"].split("/")[0])
        respuestas = [
            cliente.post(url(empresa), solicitud(telefono=f"+56900{i:06d}"), format="json")
            for i in range(maximo + 1)
        ]
        assert [r.status_code for r in respuestas[:maximo]] == [201] * maximo
        assert respuestas[maximo].status_code == 429
        limitada = respuestas[maximo].data
        assert limitada["code"] == "limite_ip"
        assert limitada["detail"].startswith("Se enviaron demasiadas solicitudes desde esta conexión.")
        assert "Retry-After" in respuestas[maximo]

    def test_campo_trampa(self, cliente, empresa, caplog):
        respuesta = cliente.post(url(empresa), solicitud(sitio_web="http://spam.example"), format="json")
        assert respuesta.status_code == 201
        assert respuesta.data["estado"] == "PENDIENTE_CONFIRMACION"
        assert not Viaje.objects.exists()
        assert not Pasajero.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_pide_la_verificacion_por_whatsapp_con_el_telefono_enmascarado(cliente, empresa, caplog):
    caplog.set_level("INFO", logger="apps.integraciones.notificaciones")
    cliente.post(url(empresa), solicitud(), format="json")
    mensajes = [r.getMessage() for r in caplog.records if r.name == "apps.integraciones.notificaciones"]
    assert len(mensajes) == 1
    assert "+569******01" in mensajes[0]
    assert "+56900009101" not in mensajes[0]
