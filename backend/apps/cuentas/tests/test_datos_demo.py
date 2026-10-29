from datetime import timedelta

import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone

from apps.cuentas.models import ConfiguracionEmpresa, Empresa, Rol, Usuario


@pytest.mark.django_db
class TestDatosDemo:
    def test_carga_empresas_y_usuarios_por_rol(self, settings):
        settings.DEBUG = True
        call_command("datos_demo", password="clave-demo-123")
        assert set(Empresa.objects.values_list("slug", flat=True)) == {"transportes-andes", "taxi-pacifico"}
        assert ConfiguracionEmpresa.objects.count() == 2
        for empresa in Empresa.objects.all():
            roles = list(Usuario.objects.filter(empresa=empresa).values_list("rol", flat=True))
            assert roles.count(Rol.ADMINISTRADOR) == 1
            assert roles.count(Rol.DESPACHADOR) == 1
            assert roles.count(Rol.CONDUCTOR) == 4
        assert all(email.endswith(".example") for email in Usuario.objects.values_list("email", flat=True))
        assert Usuario.objects.get(email="admin@transportes-andes.example").check_password("clave-demo-123")

    def test_es_idempotente(self, settings):
        settings.DEBUG = True
        call_command("datos_demo", password="clave-demo-123")
        nombres = list(Usuario.objects.order_by("email").values_list("nombre", flat=True))
        call_command("datos_demo", password="clave-demo-123")
        assert Usuario.objects.count() == 12
        assert list(Usuario.objects.order_by("email").values_list("nombre", flat=True)) == nombres

    def test_carga_flota_y_viajes_en_todos_los_estados(self, settings):
        from apps.aeropuerto.models import Vuelo
        from apps.auditoria.models import Auditoria
        from apps.flota.models import Conductor, Vehiculo
        from apps.reservas.models import EstadoViaje, HistorialEstado, Sentido, Viaje

        settings.DEBUG = True
        call_command("datos_demo", password="clave-demo-123")
        assert Vehiculo.objects.count() == 10
        assert Conductor.objects.count() == 8
        assert Viaje.objects.count() == 30
        assert set(Viaje.objects.values_list("estado", flat=True)) == set(EstadoViaje.values)
        assert not Vuelo.objects.exclude(viaje__sentido=Sentido.DESDE_AEROPUERTO).exists()
        assert all(v.historial.exists() for v in Viaje.objects.all())
        assert HistorialEstado.objects.filter(estado_anterior__isnull=True).count() == 30
        assert Auditoria.objects.filter(accion="CANCELACION").count() == 2
        call_command("datos_demo", password="clave-demo-123")
        assert Viaje.objects.count() == 30

    def test_no_corre_sin_debug(self, settings):
        settings.DEBUG = False
        with pytest.raises(CommandError, match="DEBUG"):
            call_command("datos_demo", password="clave-demo-123")

    def test_exige_contrasena(self, settings, monkeypatch):
        settings.DEBUG = True
        with pytest.raises(CommandError, match="contraseña"):
            call_command("datos_demo", password=None)


@pytest.mark.django_db
class TestDatosDemoPendientes:
    """--pendientes completa hasta 2 solicitudes vigentes por empresa demo sin tocar la expiración."""

    @staticmethod
    def _vigentes(slug):
        from apps.portal.demo import vigentes

        return vigentes(Empresa.objects.get(slug=slug))

    def test_sin_la_opcion_no_crea_solicitudes_extra(self, settings):
        from apps.reservas.models import Viaje

        settings.DEBUG = True
        call_command("datos_demo", password="clave-demo-123")
        call_command("datos_demo", password="clave-demo-123")
        assert Viaje.objects.count() == 30

    def test_completa_hasta_dos_vigentes_por_empresa(self, settings):
        from apps.reservas.models import Canal, EstadoViaje, Viaje

        settings.DEBUG = True
        call_command("datos_demo", password="clave-demo-123")
        # La carga inicial deja 2 pendientes recién creadas por empresa: no hace falta completar.
        call_command("datos_demo", password="clave-demo-123", pendientes=True)
        assert Viaje.objects.count() == 30
        # Se vencen las de la carga inicial: ahora sí completa.
        Viaje.objects.filter(estado=EstadoViaje.PENDIENTE_CONFIRMACION).update(
            creado_en=timezone.now() - timedelta(hours=1)
        )
        call_command("datos_demo", password="clave-demo-123", pendientes=True)
        assert Viaje.objects.count() == 34
        for slug in ("transportes-andes", "taxi-pacifico"):
            nuevas = self._vigentes(slug)
            assert len(nuevas) == 2
            for viaje in nuevas:
                assert viaje.canal == Canal.WEB
                assert viaje.pasajero.telefono.startswith("+5690019")
                assert viaje.pasajero.privacidad_aceptada_en is not None
                assert viaje.historial.get().actor == "PASAJERO"
        # Idempotente mientras sigan vigentes.
        call_command("datos_demo", password="clave-demo-123", pendientes=True)
        assert Viaje.objects.count() == 34

    def test_no_cambia_la_expiracion_real(self, settings):
        from apps.reservas.expiracion import expirar_pendientes, vence_en
        from apps.reservas.models import EstadoViaje, Viaje

        settings.DEBUG = True
        call_command("datos_demo", password="clave-demo-123")
        Viaje.objects.filter(estado=EstadoViaje.PENDIENTE_CONFIRMACION).update(
            creado_en=timezone.now() - timedelta(hours=1)
        )
        call_command("datos_demo", password="clave-demo-123", pendientes=True)
        nuevas = self._vigentes("transportes-andes")
        for viaje in nuevas:
            plazo = viaje.empresa.configuracion.expiracion_verificacion_min
            assert vence_en(viaje) == viaje.creado_en + timedelta(minutes=plazo)
        # Pasado el plazo, la expiración normal las cancela.
        despues = timezone.now() + timedelta(
            minutes=nuevas[0].empresa.configuracion.expiracion_verificacion_min + 1
        )
        expirar_pendientes(ahora=despues)
        assert not Viaje.objects.filter(estado=EstadoViaje.PENDIENTE_CONFIRMACION).exists()

    def test_no_toca_empresas_que_no_son_demo(self, settings, empresa):
        from apps.reservas.models import Viaje

        settings.DEBUG = True
        call_command("datos_demo", password="clave-demo-123", pendientes=True)
        assert not Viaje.objects.filter(empresa=empresa).exists()

    def test_no_corre_sin_debug(self, settings):
        settings.DEBUG = False
        with pytest.raises(CommandError, match="DEBUG"):
            call_command("datos_demo", password="clave-demo-123", pendientes=True)
