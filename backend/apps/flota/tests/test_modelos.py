from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.comun.validadores import validar_movil_chile, validar_patente
from apps.flota.models import ConductorVehiculo, EstadoConductor, validar_anio_vehiculo
from apps.reservas.tests.fabricas import ConductorFactory, VehiculoFactory


class TestValidadores:
    @pytest.mark.parametrize("patente", ["AB1234", "BCDF12"])
    def test_patente_valida(self, patente):
        validar_patente(patente)

    @pytest.mark.parametrize("patente", ["ab1234", "ABC123", "AB-1234", "ABCDE1", "A12345"])
    def test_patente_invalida(self, patente):
        with pytest.raises(ValidationError):
            validar_patente(patente)

    def test_movil_chile(self):
        validar_movil_chile("+56912345678")
        for invalido in ["+5612345678", "+56812345678", "912345678", "+569123456789"]:
            with pytest.raises(ValidationError):
                validar_movil_chile(invalido)

    def test_antiguedad_maxima_12_anios(self):
        anio = timezone.localdate().year
        validar_anio_vehiculo(anio - 12)
        with pytest.raises(ValidationError):
            validar_anio_vehiculo(anio - 13)


@pytest.mark.django_db
class TestVehiculo:
    def test_capacidad_por_defecto_y_rango(self):
        assert VehiculoFactory().capacidad == 4
        with pytest.raises(IntegrityError), transaction.atomic():
            VehiculoFactory(capacidad=8)

    def test_patente_unica_y_con_formato_en_la_base(self):
        VehiculoFactory(patente="BBBB10")
        with pytest.raises(IntegrityError), transaction.atomic():
            VehiculoFactory(patente="BBBB10")
        with pytest.raises(IntegrityError), transaction.atomic():
            VehiculoFactory(patente="bb-1234")


@pytest.mark.django_db
class TestConductor:
    def test_estado_por_defecto_no_disponible(self):
        assert ConductorFactory().estado == EstadoConductor.NO_DISPONIBLE

    def test_disponible_exige_vehiculo_activo(self):
        """RN-05."""
        with pytest.raises(IntegrityError), transaction.atomic():
            ConductorFactory(estado=EstadoConductor.DISPONIBLE, vehiculo_activo=None)
        vehiculo = VehiculoFactory()
        assert ConductorFactory(estado=EstadoConductor.DISPONIBLE, vehiculo_activo=vehiculo).pk

    def test_licencia_vigente_al_alta(self):
        conductor = ConductorFactory.build(licencia_vence=timezone.localdate() - timedelta(days=1))
        with pytest.raises(ValidationError):
            conductor.clean()

    def test_empresa_es_la_de_su_usuario(self):
        conductor = ConductorFactory()
        assert conductor.empresa_id == conductor.usuario.empresa_id
        assert str(conductor) == conductor.usuario.nombre

    def test_asociacion_con_clave_compuesta(self):
        conductor, a, b = ConductorFactory(), VehiculoFactory(), VehiculoFactory()
        ConductorVehiculo.objects.create(conductor=conductor, vehiculo=a)
        ConductorVehiculo.objects.create(conductor=conductor, vehiculo=b)
        assert conductor.asociaciones.count() == 2
        assert ConductorVehiculo.objects.get(conductor=conductor, vehiculo=a).desde == timezone.localdate()
        with pytest.raises(IntegrityError), transaction.atomic():
            ConductorVehiculo.objects.create(conductor=conductor, vehiculo=a)
