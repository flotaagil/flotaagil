"""Fábricas de datos sintéticos para pruebas."""

import factory

from apps.comun.validadores import digito_verificador
from apps.cuentas.models import Empresa, Rol, Usuario

CLAVE_PRUEBA = "clave-de-prueba-123"


def _rut(n: int) -> str:
    cuerpo = str(77000000 + n)
    return f"{cuerpo}-{digito_verificador(cuerpo)}"


class EmpresaFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Empresa

    rut = factory.Sequence(_rut)
    razon_social = factory.Sequence(lambda n: f"Empresa de prueba {n} SpA")
    slug = factory.Sequence(lambda n: f"empresa-prueba-{n}")


class UsuarioFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Usuario
        skip_postgeneration_save = True

    empresa = factory.SubFactory(EmpresaFactory)
    nombre = factory.Faker("name", locale="es_CL")
    email = factory.Sequence(lambda n: f"usuario{n}@prueba.example")
    rol = Rol.DESPACHADOR
    password = factory.django.Password(CLAVE_PRUEBA)
