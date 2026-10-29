"""VUELO, según docs/diccionario-datos.md. Solo para viajes DESDE_AEROPUERTO (DC-06)."""

from django.db import models
from django.db.models import Q

from apps.comun.validadores import validar_vuelo_iata


class EstadoVuelo(models.TextChoices):
    PROGRAMADO = "PROGRAMADO", "Programado"
    DEMORADO = "DEMORADO", "Demorado"
    ATERRIZADO = "ATERRIZADO", "Aterrizado"
    CANCELADO = "CANCELADO", "Cancelado"
    DESVIADO = "DESVIADO", "Desviado"


class Vuelo(models.Model):
    viaje = models.OneToOneField("reservas.Viaje", on_delete=models.CASCADE, related_name="vuelo")
    numero = models.CharField(max_length=8, validators=[validar_vuelo_iata])
    fecha = models.DateField()
    # Hora de llegada programada: la informa quien ingresa la reserva; HU-26 la valida (DC-06).
    hora_programada = models.DateTimeField()
    hora_estimada = models.DateTimeField(null=True, blank=True)
    estado_vuelo = models.CharField(
        max_length=12,
        choices=EstadoVuelo.choices,
        default=EstadoVuelo.PROGRAMADO,
        db_default=EstadoVuelo.PROGRAMADO,
    )
    ultima_consulta_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "vuelo"
        constraints = [
            models.CheckConstraint(
                condition=Q(estado_vuelo__in=EstadoVuelo.values), name="vuelo_estado_valido"
            ),
            models.CheckConstraint(
                condition=Q(numero__regex=r"^[A-Z0-9]{2} ?[0-9]{1,4}$"), name="vuelo_numero_iata"
            ),
        ]

    def __str__(self):
        return f"{self.numero} {self.fecha:%Y-%m-%d}"
