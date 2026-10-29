import time

from django.core.management.base import BaseCommand

from apps.reservas.expiracion import expirar_pendientes


class Command(BaseCommand):
    help = "Cancela las solicitudes en PENDIENTE_CONFIRMACION vencidas (RN-06)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--cada",
            type=int,
            default=0,
            help="Repite cada N segundos (modo programador). Sin el argumento corre una vez.",
        )

    def handle(self, *args, cada, **opciones):
        while True:
            canceladas = expirar_pendientes()
            if canceladas or not cada:
                self.stdout.write(f"Solicitudes vencidas canceladas: {canceladas}")
            if not cada:
                return
            time.sleep(cada)
