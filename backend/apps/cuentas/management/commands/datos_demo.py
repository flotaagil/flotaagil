"""Datos sintéticos para desarrollo: empresas ficticias, usuarios por rol, flota, pasajeros, un convenio y
viajes en todos los estados.

Idempotente: si los datos ya existen, no los duplica. Solo corre con DEBUG activado. Para empezar de cero se
borra la base de datos (`docker compose -f infra/docker-compose.dev.yml down -v`): AUDITORIA es de solo
inserción y no permite borrar los usuarios que la referencian.
Los correos usan el dominio reservado .example (RFC 2606) y los RUT son ficticios con dígito válido.
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.comun.validadores import digito_verificador
from apps.cuentas.models import Empresa, Plan, Rol, Usuario
from apps.flota import demo as demo_flota
from apps.reservas import demo as demo_reservas

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
    help = "Carga datos sintéticos de desarrollo (empresas, usuarios, flota, convenio y viajes)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=os.environ.get("DATOS_DEMO_PASSWORD"),
            help="Contraseña de los usuarios y del convenio demo (por defecto, DATOS_DEMO_PASSWORD).",
        )

    def handle(self, *args, password, **opciones):
        if not settings.DEBUG:
            raise CommandError("datos_demo solo corre con DJANGO_DEBUG=true.")
        if not password:
            raise CommandError("Falta la contraseña: usa --password o define DATOS_DEMO_PASSWORD.")
        # Faker viene con las dependencias de desarrollo (factory-boy); no se instala en producción.
        from faker import Faker

        faker = Faker("es_CL")
        faker.seed_instance(SEMILLA)
        usuarios_creados = viajes_creados = 0
        with transaction.atomic():
            for numero, datos in enumerate(EMPRESAS):
                empresa, _ = Empresa.objects.get_or_create(
                    slug=datos["slug"],
                    defaults={
                        "rut": f"{datos['cuerpo_rut']}-{digito_verificador(datos['cuerpo_rut'])}",
                        "razon_social": datos["razon_social"],
                        "plan": datos["plan"],
                    },
                )
                conductores = []
                for rol, alias in USUARIOS_POR_EMPRESA:
                    nombre = faker.name()
                    email = email_demo(empresa.slug, alias)
                    usuario = Usuario.objects.filter(email=email).first()
                    if usuario is None:
                        usuario = Usuario.objects.create_user(
                            email, password, empresa=empresa, nombre=nombre, rol=rol
                        )
                        usuarios_creados += 1
                    if rol == Rol.CONDUCTOR:
                        conductores.append(usuario)
                perfiles = demo_flota.cargar(empresa, numero, conductores)
                viajes_creados += demo_reservas.cargar(empresa, numero, perfiles, faker, password)

        self.stdout.write(
            self.style.SUCCESS(
                f"Datos demo listos ({usuarios_creados} usuarios y {viajes_creados} viajes nuevos)."
            )
        )
        for datos in EMPRESAS:
            self.stdout.write(f"  {datos['razon_social']}  →  /solicitar/{datos['slug']}")
            for rol, alias in USUARIOS_POR_EMPRESA:
                self.stdout.write(f"    {rol:<14} {email_demo(datos['slug'], alias)}")
