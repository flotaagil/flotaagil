"""Datos sintéticos para desarrollo: empresas ficticias y usuarios por rol.

Idempotente: si los datos ya existen, no los duplica. Solo corre con DEBUG activado.
Los correos usan el dominio reservado .example (RFC 2606) y los RUT son ficticios con dígito válido.
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.comun.validadores import digito_verificador
from apps.cuentas.models import Empresa, Plan, Rol, Usuario

SEMILLA = 2026

EMPRESAS = [
    {
        "cuerpo_rut": "76000001",
        "razon_social": "Transportes Andes Demo SpA",
        "slug": "transportes-andes",
        "plan": Plan.FLOTA_PLUS,
    },
    {
        "cuerpo_rut": "76000002",
        "razon_social": "Taxi Turismo Pacífico Demo Ltda.",
        "slug": "taxi-pacifico",
        "plan": Plan.BASICO,
    },
]

USUARIOS_POR_EMPRESA = [(Rol.ADMINISTRADOR, "admin"), (Rol.DESPACHADOR, "despacho")] + [
    (Rol.CONDUCTOR, f"conductor{i}") for i in range(1, 5)
]


def email_demo(slug: str, alias: str) -> str:
    return f"{alias}@{slug}.example"


class Command(BaseCommand):
    help = "Carga datos sintéticos de desarrollo (empresas y usuarios por rol)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=os.environ.get("DATOS_DEMO_PASSWORD"),
            help="Contraseña de los usuarios demo (por defecto, DATOS_DEMO_PASSWORD).",
        )
        parser.add_argument(
            "--reiniciar", action="store_true", help="Borra los datos demo antes de cargarlos."
        )

    def handle(self, *args, password, reiniciar, **opciones):
        if not settings.DEBUG:
            raise CommandError("datos_demo solo corre con DJANGO_DEBUG=true.")
        if not password:
            raise CommandError("Falta la contraseña: usa --password o define DATOS_DEMO_PASSWORD.")
        # Faker viene con las dependencias de desarrollo (factory-boy); no se instala en producción.
        from faker import Faker

        slugs = [e["slug"] for e in EMPRESAS]
        with transaction.atomic():
            if reiniciar:
                Usuario.objects.filter(empresa__slug__in=slugs).delete()
                Empresa.objects.filter(slug__in=slugs).delete()
            faker = Faker("es_CL")
            faker.seed_instance(SEMILLA)
            creados = 0
            for datos in EMPRESAS:
                empresa, _ = Empresa.objects.get_or_create(
                    slug=datos["slug"],
                    defaults={
                        "rut": f"{datos['cuerpo_rut']}-{digito_verificador(datos['cuerpo_rut'])}",
                        "razon_social": datos["razon_social"],
                        "plan": datos["plan"],
                    },
                )
                for rol, alias in USUARIOS_POR_EMPRESA:
                    nombre = faker.name()
                    email = email_demo(empresa.slug, alias)
                    if Usuario.objects.filter(email=email).exists():
                        continue
                    Usuario.objects.create_user(email, password, empresa=empresa, nombre=nombre, rol=rol)
                    creados += 1

        self.stdout.write(self.style.SUCCESS(f"Datos demo listos ({creados} usuarios nuevos)."))
        for datos in EMPRESAS:
            self.stdout.write(f"  {datos['razon_social']}  →  /solicitar/{datos['slug']}")
            for rol, alias in USUARIOS_POR_EMPRESA:
                self.stdout.write(f"    {rol:<14} {email_demo(datos['slug'], alias)}")
