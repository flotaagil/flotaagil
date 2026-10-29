"""Fábricas de flota, convenios y reservas para pruebas (datos sintéticos)."""

from datetime import timedelta

import factory
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.comun.validadores import digito_verificador
from apps.convenios.models import Convenio
from apps.cuentas.models import Rol
from apps.cuentas.tests.fabricas import EmpresaFactory, UsuarioFactory
from apps.flota.models import Conductor, LicenciaClase, Vehiculo
from apps.reservas.models import Canal, EstadoViaje, Pasajero, Viaje

SANTIAGO = Point(-70.6693, -33.4489, srid=4326)


def _rut(base: int):
    def generar(n):
        cuerpo = str(base + n)
        return f"{cuerpo}-{digito_verificador(cuerpo)}"

    return generar


def _patente(n: int) -> str:
    letras = "BCDFGHJKLPRSTVWXYZ"
    cuatro = "".join(letras[(n // 18**k) % 18] for k in range(4))
    return f"{cuatro}{n % 100:02d}"


class VehiculoFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Vehiculo

    empresa = factory.SubFactory(EmpresaFactory)
    patente = factory.Sequence(_patente)
    marca_modelo = "Toyota Yaris"
    anio = factory.LazyFunction(lambda: timezone.localdate().year - 2)


class ConductorFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Conductor

    usuario = factory.SubFactory(UsuarioFactory, rol=Rol.CONDUCTOR)
    rut = factory.Sequence(_rut(16000000))
    telefono = factory.Sequence(lambda n: f"+56900002{n % 1000:03d}")
    licencia_clase = LicenciaClase.A2
    licencia_vence = factory.LazyFunction(lambda: timezone.localdate() + timedelta(days=365))


class ConvenioFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Convenio

    empresa = factory.SubFactory(EmpresaFactory)
    cliente_nombre = factory.Sequence(lambda n: f"Cliente corporativo {n}")
    cliente_rut = factory.Sequence(_rut(95000000))
    password_hash = factory.LazyFunction(lambda: "pbkdf2_sha256$sintetico")


class PasajeroFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Pasajero

    empresa = factory.SubFactory(EmpresaFactory)
    nombre = factory.Faker("name", locale="es_CL")
    telefono = factory.Sequence(lambda n: f"+56900003{n % 1000:03d}")


class ViajeFactory(factory.django.DjangoModelFactory):
    """Viaje directo en la base (sin máquina de estados), para preparar escenarios."""

    class Meta:
        model = Viaje

    empresa = factory.SubFactory(EmpresaFactory)
    pasajero = factory.SubFactory(PasajeroFactory, empresa=factory.SelfAttribute("..empresa"))
    canal = Canal.TELEFONO
    origen_dir = "Av. Providencia 1234, Providencia"
    origen_geo = SANTIAGO
    destino_dir = "Plaza de Armas, Santiago"
    destino_geo = SANTIAGO
    recogida_en = factory.LazyFunction(lambda: timezone.now() + timedelta(hours=2))
    estado = EstadoViaje.SOLICITADO
