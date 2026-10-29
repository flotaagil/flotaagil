import pytest
from django.core.management import CommandError, call_command

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

    def test_es_idempotente_y_determinista(self, settings):
        settings.DEBUG = True
        call_command("datos_demo", password="clave-demo-123")
        nombres = list(Usuario.objects.order_by("email").values_list("nombre", flat=True))
        call_command("datos_demo", password="clave-demo-123")
        assert Usuario.objects.count() == 12
        call_command("datos_demo", password="clave-demo-123", reiniciar=True)
        assert list(Usuario.objects.order_by("email").values_list("nombre", flat=True)) == nombres

    def test_no_corre_sin_debug(self, settings):
        settings.DEBUG = False
        with pytest.raises(CommandError, match="DEBUG"):
            call_command("datos_demo", password="clave-demo-123")

    def test_exige_contrasena(self, settings, monkeypatch):
        settings.DEBUG = True
        with pytest.raises(CommandError, match="contraseña"):
            call_command("datos_demo", password=None)
