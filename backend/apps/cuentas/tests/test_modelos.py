from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.comun.validadores import digito_verificador, normalizar_rut, validar_kebab, validar_rut
from apps.cuentas.models import ConfiguracionEmpresa, Empresa, Rol, Usuario

from .fabricas import EmpresaFactory, UsuarioFactory


class TestRut:
    @pytest.mark.parametrize(
        ("cuerpo", "dv"), [("11111111", "1"), ("76000001", "9"), ("12345678", "5"), ("10000013", "K")]
    )
    def test_digito_verificador(self, cuerpo, dv):
        assert digito_verificador(cuerpo) == dv

    def test_rut_valido(self):
        validar_rut("12345678-5")

    @pytest.mark.parametrize("rut", ["12345678-6", "12.345.678-5", "1234-5", "12345678", "", "12345678-k"])
    def test_rut_invalido(self, rut):
        with pytest.raises(ValidationError):
            validar_rut(rut)

    def test_normalizar(self):
        assert normalizar_rut("10.000.013-k") == "10000013-K"


class TestSlug:
    @pytest.mark.parametrize("slug", ["andes", "transportes-andes", "taxi-2026"])
    def test_kebab_valido(self, slug):
        validar_kebab(slug)

    @pytest.mark.parametrize("slug", ["Andes", "taxi_andes", "-andes", "andes-", "taxi--andes", "taxi andes"])
    def test_kebab_invalido(self, slug):
        with pytest.raises(ValidationError):
            validar_kebab(slug)

    @pytest.mark.django_db
    def test_restriccion_en_base_de_datos(self):
        with pytest.raises(IntegrityError), transaction.atomic():
            EmpresaFactory(slug="No_Kebab")


@pytest.mark.django_db
class TestEmpresa:
    def test_crea_su_configuracion_con_valores_por_defecto(self):
        empresa = EmpresaFactory()
        config = ConfiguracionEmpresa.objects.get(empresa=empresa)
        assert (config.margen_nacional_min, config.margen_internacional_min) == (20, 35)
        assert (config.tolerancia_fila_min, config.espera_no_presentacion_min) == (10, 15)
        assert config.expiracion_verificacion_min == 15
        assert config.zona_lat_min == Decimal("-34.300000")
        assert config.zona_lon_max == Decimal("-69.770000")

    def test_valores_por_defecto_de_la_base(self):
        empresa = Empresa.objects.create(rut="12345678-5", razon_social="Prueba", slug="prueba")
        empresa.refresh_from_db()
        assert empresa.plan == "BASICO"
        assert empresa.activa is True
        assert empresa.creado_en is not None

    def test_actualizar_no_duplica_la_configuracion(self):
        empresa = EmpresaFactory()
        empresa.razon_social = "Otro nombre"
        empresa.save()
        assert ConfiguracionEmpresa.objects.filter(empresa=empresa).count() == 1

    def test_zona_de_operacion(self):
        config = EmpresaFactory().configuracion
        assert config.contiene(-33.45, -70.66)  # Santiago centro
        assert config.contiene(-33.39, -70.79)  # Aeropuerto SCL
        assert not config.contiene(-36.82, -73.05)  # Concepción
        assert not config.contiene(-33.45, -71.80)  # al oeste del límite

    def test_zona_debe_estar_ordenada(self):
        config = EmpresaFactory().configuracion
        config.zona_lat_min, config.zona_lat_max = Decimal("-32"), Decimal("-34")
        with pytest.raises(IntegrityError), transaction.atomic():
            config.save()

    def test_rut_unico(self):
        EmpresaFactory(rut="12345678-5")
        with pytest.raises(IntegrityError), transaction.atomic():
            EmpresaFactory(rut="12345678-5")


@pytest.mark.django_db
class TestUsuario:
    def test_hash_pbkdf2_sha256(self):
        usuario = UsuarioFactory()
        assert usuario.password.startswith("pbkdf2_sha256$")

    def test_email_normalizado_en_minusculas(self, empresa):
        usuario = Usuario.objects.create_user(
            "Ana@Prueba.EXAMPLE", "x" * 12, empresa=empresa, nombre="Ana", rol=Rol.DESPACHADOR
        )
        assert usuario.email == "ana@prueba.example"

    def test_sin_email_falla(self, empresa):
        with pytest.raises(ValueError):
            Usuario.objects.create_user("", "x" * 12, empresa=empresa, nombre="Ana", rol=Rol.DESPACHADOR)

    def test_superusuario_de_mantenimiento(self, empresa):
        admin = Usuario.objects.create_superuser(
            "root@prueba.example", "x" * 12, empresa=empresa, nombre="Root"
        )
        assert admin.is_superuser and admin.is_staff
        assert admin.rol == Rol.ADMINISTRADOR

    def test_is_active_refleja_activo(self):
        usuario = UsuarioFactory(activo=False)
        assert usuario.is_active is False

    def test_rol_fuera_de_dominio(self, empresa):
        with pytest.raises(IntegrityError), transaction.atomic():
            UsuarioFactory(empresa=empresa, rol="SUPERVISOR")

    def test_columna_password_hash(self):
        assert Usuario._meta.get_field("password").column == "password_hash"
        assert Usuario._meta.db_table == "usuario"
